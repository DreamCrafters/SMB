import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { ServerConfig } from "../config/env.js";
import { validateDispatcherSubmissionDraft } from "../domain/dispatcherSubmission.js";
import type { DispatcherSubmissionsRepository } from "../repositories/dispatcherSubmissionsRepository.js";

type AppDependencies = {
  config: ServerConfig;
  dispatcherSubmissions: DispatcherSubmissionsRepository;
};

type JsonPayload = Record<string, unknown> | unknown[];

const maxBodyBytes = 20_000;

export function createApiServer({
  config,
  dispatcherSubmissions,
}: AppDependencies) {
  return createServer(async (req, res) => {
    applyCors(req, res, config);

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    try {
      const url = new URL(req.url ?? "/", "http://localhost");

      if (req.method === "GET" && url.pathname === "/health") {
        sendJson(res, 200, { ok: true });
        return;
      }

      if (url.pathname === "/api/dispatcher/submissions") {
        if (req.method === "GET") {
          const submissions = await dispatcherSubmissions.listLatest();
          sendJson(res, 200, {
            submissions,
            receivedAt: new Date().toISOString(),
          });
          return;
        }

        if (req.method === "POST") {
          const payload = await readJsonBody(req);
          const validation = validateDispatcherSubmissionDraft(payload);

          if (!validation.ok) {
            sendJson(res, 400, {
              error: {
                code: "invalid_response",
                message: validation.errors.join(" "),
              },
            });
            return;
          }

          const submission = await dispatcherSubmissions.create(
            validation.draft,
            readSubmittedByAccountId(req),
          );

          sendJson(res, 201, { submission });
          return;
        }

        sendJson(res, 405, {
          error: {
            code: "access_denied",
            message: "Only GET and POST are supported for dispatcher submissions.",
          },
        });
        return;
      }

      sendJson(res, 404, {
        error: {
          code: "not_found",
          message: "Endpoint not found.",
        },
      });
    } catch (error) {
      console.error("api.request_error", error);
      sendJson(res, 500, {
        error: {
          code: "server_error",
          message: "Internal server error.",
        },
      });
    }
  });
}

function applyCors(
  req: IncomingMessage,
  res: ServerResponse,
  config: ServerConfig,
) {
  const origin = req.headers.origin;

  if (origin !== undefined && config.corsOrigins.includes(origin)) {
    res.setHeader("access-control-allow-origin", origin);
    res.setHeader("access-control-allow-credentials", "true");
    res.setHeader("vary", "Origin");
  }

  res.setHeader("access-control-allow-methods", "GET,POST,OPTIONS");
  res.setHeader(
    "access-control-allow-headers",
    "Accept,Content-Type,X-SMB-Account-Id",
  );
}

function sendJson(res: ServerResponse, statusCode: number, payload: JsonPayload) {
  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(JSON.stringify(payload));
}

function readJsonBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let body = "";

    req.setEncoding("utf8");
    req.on("data", (chunk: string) => {
      body += chunk;

      if (Buffer.byteLength(body, "utf8") > maxBodyBytes) {
        reject(new Error("Request body is too large."));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (body.trim().length === 0) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(body));
      } catch {
        resolve(null);
      }
    });
    req.on("error", reject);
  });
}

function readSubmittedByAccountId(req: IncomingMessage) {
  const header = req.headers["x-smb-account-id"];
  const value = Array.isArray(header) ? header[0] : header;
  const trimmed = value?.trim();

  return trimmed && trimmed.length > 0
    ? trimmed
    : "dev-dispatcher-account";
}
