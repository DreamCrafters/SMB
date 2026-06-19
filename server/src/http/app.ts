import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { ServerConfig } from "../config/env.js";
import {
  buildDevProfile,
  createDevSessionId,
  type DevAccessSession,
  isAccountType,
} from "../domain/devAccessProfile.js";
import { validateDispatcherSubmissionDraft } from "../domain/dispatcherSubmission.js";
import type { DispatcherSubmissionsRepository } from "../repositories/dispatcherSubmissionsRepository.js";

type AppDependencies = {
  config: ServerConfig;
  dispatcherSubmissions: DispatcherSubmissionsRepository;
};

type JsonPayload = Record<string, unknown> | unknown[];

const maxBodyBytes = 20_000;
const devSessionCookie = "smb_dev_access_session";
const devSessionHeader = "x-smb-dev-session";

export function createApiServer({
  config,
  dispatcherSubmissions,
}: AppDependencies) {
  const devSessions = new Map<string, DevAccessSession>();

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

      if (url.pathname === "/api/access/profile") {
        handleAccessProfile(req, res, devSessions);
        return;
      }

      if (url.pathname === "/api/dev/access-session") {
        await handleDevAccessSession(req, res, devSessions);
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

  if (origin !== undefined && isCorsOriginAllowed(origin, config.corsOrigins)) {
    res.setHeader("access-control-allow-origin", origin);
    res.setHeader("access-control-allow-credentials", "true");
    res.setHeader("vary", "Origin");
  }

  res.setHeader("access-control-allow-methods", "GET,POST,OPTIONS");
  res.setHeader(
    "access-control-allow-headers",
    "Accept,Content-Type,X-SMB-Account-Id,X-SMB-Dev-Session",
  );
}

function isCorsOriginAllowed(origin: string, allowedOrigins: string[]) {
  return allowedOrigins.some((allowedOrigin) =>
    isCorsOriginMatch(origin, allowedOrigin),
  );
}

function isCorsOriginMatch(origin: string, allowedOrigin: string) {
  if (!allowedOrigin.includes("*")) {
    return origin === allowedOrigin;
  }

  try {
    const originUrl = new URL(origin);
    const allowedUrl = new URL(allowedOrigin);

    return (
      originUrl.protocol === allowedUrl.protocol &&
      originUrl.port === allowedUrl.port &&
      originUrl.pathname === "/" &&
      allowedUrl.pathname === "/" &&
      originUrl.search.length === 0 &&
      allowedUrl.search.length === 0 &&
      originUrl.hash.length === 0 &&
      allowedUrl.hash.length === 0 &&
      isWildcardHostnameMatch(originUrl.hostname, allowedUrl.hostname)
    );
  } catch {
    return false;
  }
}

function isWildcardHostnameMatch(hostname: string, allowedHostname: string) {
  const pattern = allowedHostname
    .toLowerCase()
    .split("*")
    .map(escapeRegExp)
    .join("[a-z0-9-]+");
  const matcher = new RegExp(`^${pattern}$`);

  return matcher.test(hostname.toLowerCase());
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function handleAccessProfile(
  req: IncomingMessage,
  res: ServerResponse,
  devSessions: Map<string, DevAccessSession>,
) {
  if (req.method !== "GET") {
    sendJson(res, 405, {
      error: {
        code: "access_denied",
        message: "Only GET is supported for access/profile.",
      },
    });
    return;
  }

  const sessionId = readDevSessionId(req);
  const session = sessionId === undefined ? undefined : devSessions.get(sessionId);

  if (session === undefined) {
    sendJson(res, 200, { profile: null });
    return;
  }

  sendJson(res, 200, {
    profile: buildDevProfile(session.accountType, session.createdAt),
  });
}

async function handleDevAccessSession(
  req: IncomingMessage,
  res: ServerResponse,
  devSessions: Map<string, DevAccessSession>,
) {
  if (req.method === "DELETE") {
    const sessionId = readDevSessionId(req);

    if (sessionId !== undefined) {
      devSessions.delete(sessionId);
    }

    res.setHeader(
      "set-cookie",
      `${devSessionCookie}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`,
    );
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method !== "POST") {
    sendJson(res, 405, {
      error: {
        code: "access_denied",
        message: "Only POST and DELETE are supported for dev access session.",
      },
    });
    return;
  }

  const payload = await readJsonBody(req);

  if (!isRecord(payload) || !isAccountType(payload.accountType)) {
    sendJson(res, 400, {
      error: {
        code: "access_denied",
        message: "Unsupported dev account type.",
      },
    });
    return;
  }

  const sessionId = createDevSessionId(payload.accountType);

  devSessions.set(sessionId, {
    accountType: payload.accountType,
    createdAt: new Date().toISOString(),
  });

  res.setHeader(
    "set-cookie",
    `${devSessionCookie}=${sessionId}; Path=/; HttpOnly; SameSite=Lax`,
  );
  sendJson(res, 200, { ok: true, sessionId });
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

function readDevSessionId(req: IncomingMessage) {
  return readHeader(req, devSessionHeader) ?? readCookie(req.headers.cookie, devSessionCookie);
}

function readHeader(req: IncomingMessage, name: string) {
  const header = req.headers[name];
  const value = Array.isArray(header) ? header[0] : header;
  const trimmed = value?.trim();

  return trimmed && trimmed.length > 0 ? trimmed : undefined;
}

function readCookie(header: string | undefined, name: string) {
  if (header === undefined) {
    return undefined;
  }

  return header
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
