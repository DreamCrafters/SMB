import { once } from "node:events";
import assert from "node:assert/strict";
import test from "node:test";
import type { AddressInfo } from "node:net";
import type { ServerConfig } from "../config/env.js";
import type { DispatcherSubmissionsRepository } from "../repositories/dispatcherSubmissionsRepository.js";
import { createApiServer } from "./app.js";

const config: ServerConfig = {
  port: 0,
  databaseUrl: "postgresql://unused",
  corsOrigins: [
    "http://frontend.test",
    "https://smb-*-artemi-z-s-projects.vercel.app",
  ],
  runMigrationsOnStart: false,
};

const dispatcherSubmissions: DispatcherSubmissionsRepository = {
  async create() {
    throw new Error("not needed in access profile tests");
  },
  async listLatest() {
    return [];
  },
};

test("remote API returns an empty access profile without a dev session", async () => {
  await withApiServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/access/profile`, {
      headers: {
        Origin: "http://frontend.test",
      },
    });

    assert.equal(response.status, 200);
    assert.equal(
      response.headers.get("access-control-allow-origin"),
      "http://frontend.test",
    );
    assert.deepEqual(await response.json(), { profile: null });
  });
});

test("remote API allows configured Vercel preview origin patterns", async () => {
  await withApiServer(async (baseUrl) => {
    const origin = "https://smb-14uw5huc0-artemi-z-s-projects.vercel.app";
    const response = await fetch(`${baseUrl}/health`, {
      headers: { Origin: origin },
    });

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("access-control-allow-origin"), origin);
  });
});

test("remote API does not allow unrelated Vercel origins", async () => {
  await withApiServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/health`, {
      headers: { Origin: "https://other-project.vercel.app" },
    });

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("access-control-allow-origin"), null);
  });
});

test("remote API creates and reads dev access sessions by header", async () => {
  await withApiServer(async (baseUrl) => {
    const sessionResponse = await fetch(`${baseUrl}/api/dev/access-session`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ accountType: "dispatcher" }),
    });
    const sessionPayload = await sessionResponse.json();

    assert.equal(sessionResponse.status, 200);
    assert.equal(isRecord(sessionPayload) ? sessionPayload.ok : undefined, true);
    assert.equal(
      isRecord(sessionPayload) ? typeof sessionPayload.sessionId : undefined,
      "string",
    );

    if (!isRecord(sessionPayload) || typeof sessionPayload.sessionId !== "string") {
      throw new Error("Expected dev access session id.");
    }

    const profileResponse = await fetch(`${baseUrl}/api/access/profile`, {
      headers: {
        "X-SMB-Dev-Session": sessionPayload.sessionId,
      },
    });
    const profilePayload = await profileResponse.json();

    assert.equal(profileResponse.status, 200);
    assert.equal(readProfileAccountType(profilePayload), "dispatcher");
    assert.deepEqual(readProfileCapabilities(profilePayload), [
      "business.submit_dispatcher_forms",
    ]);
  });
});

async function withApiServer(callback: (baseUrl: string) => Promise<void>) {
  const server = createApiServer({ config, dispatcherSubmissions });

  server.listen(0, "127.0.0.1");
  await once(server, "listening");

  const address = server.address() as AddressInfo;

  try {
    await callback(`http://127.0.0.1:${address.port}`);
  } finally {
    server.close();
    await once(server, "close");
  }
}

function readProfileAccountType(payload: unknown) {
  if (
    isRecord(payload) &&
    isRecord(payload.profile) &&
    typeof payload.profile.accountType === "string"
  ) {
    return payload.profile.accountType;
  }

  return undefined;
}

function readProfileCapabilities(payload: unknown) {
  if (
    isRecord(payload) &&
    isRecord(payload.profile) &&
    isRecord(payload.profile.activeAccess) &&
    Array.isArray(payload.profile.activeAccess.capabilities)
  ) {
    return payload.profile.activeAccess.capabilities;
  }

  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
