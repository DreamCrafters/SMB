import assert from "node:assert/strict";
import test from "node:test";
import {
  clearDevAccessSession,
  selectDevAccessSession,
} from "../.test-build/src/services/devAccessSession.js";

const originalFetch = globalThis.fetch;
const originalWindow = globalThis.window;

test.after(() => {
  globalThis.fetch = originalFetch;
  globalThis.window = originalWindow;
});

test.afterEach(() => {
  globalThis.window = originalWindow;
});

test("selectDevAccessSession posts selected account type to the server", async () => {
  let request;

  globalThis.fetch = async (endpoint, init) => {
    request = { endpoint, init };

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  const result = await selectDevAccessSession("business_owner", {
    endpoint: "/api/dev/access-session",
  });

  assert.equal(result.status, "ready");
  assert.equal(request.endpoint, "/api/dev/access-session");
  assert.equal(request.init.method, "POST");
  assert.equal(request.init.credentials, "include");
  assert.deepEqual(JSON.parse(request.init.body), {
    accountType: "business_owner",
  });
});

test("selectDevAccessSession stores returned dev session id", async () => {
  let storedSessionId;

  globalThis.window = {
    sessionStorage: {
      getItem: () => undefined,
      setItem: (_key, value) => {
        storedSessionId = value;
      },
      removeItem: () => undefined,
    },
  };
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ ok: true, sessionId: "dev-session-id" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });

  const result = await selectDevAccessSession("business_owner", {
    endpoint: "/api/dev/access-session",
  });

  assert.equal(result.status, "ready");
  assert.equal(result.sessionId, "dev-session-id");
  assert.equal(storedSessionId, "dev-session-id");
});

test("clearDevAccessSession sends and clears stored dev session id", async () => {
  let request;
  let storedSessionId = "dev-session-id";

  globalThis.window = {
    sessionStorage: {
      getItem: () => storedSessionId,
      setItem: (_key, value) => {
        storedSessionId = value;
      },
      removeItem: () => {
        storedSessionId = undefined;
      },
    },
  };
  globalThis.fetch = async (endpoint, init) => {
    request = { endpoint, init };

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  const result = await clearDevAccessSession({
    endpoint: "/api/dev/access-session",
  });

  assert.equal(result.status, "ready");
  assert.equal(request.init.headers["X-SMB-Dev-Session"], "dev-session-id");
  assert.equal(storedSessionId, undefined);
});

test("selectDevAccessSession can request dispatcher access", async () => {
  let request;

  globalThis.fetch = async (endpoint, init) => {
    request = { endpoint, init };

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  const result = await selectDevAccessSession("dispatcher", {
    endpoint: "/api/dev/access-session",
  });

  assert.equal(result.status, "ready");
  assert.deepEqual(JSON.parse(request.init.body), {
    accountType: "dispatcher",
  });
});

test("clearDevAccessSession deletes the server session with cookies", async () => {
  let request;

  globalThis.fetch = async (endpoint, init) => {
    request = { endpoint, init };

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  const result = await clearDevAccessSession({
    endpoint: "/api/dev/access-session",
  });

  assert.equal(result.status, "ready");
  assert.equal(request.endpoint, "/api/dev/access-session");
  assert.equal(request.init.method, "DELETE");
  assert.equal(request.init.credentials, "include");
  assert.equal(request.init.body, undefined);
});

test("selectDevAccessSession preserves server errors", async () => {
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        error: {
          code: "access_denied",
          message: "Unsupported dev account type.",
        },
      }),
      {
        status: 400,
        headers: { "content-type": "application/json" },
      },
    );

  const result = await selectDevAccessSession("worker", {
    endpoint: "/api/dev/access-session",
  });

  assert.equal(result.status, "error");
  assert.equal(result.code, "access_denied");
  assert.equal(result.statusCode, 400);
});

test("selectDevAccessSession rejects unsupported ready payloads", async () => {
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ ready: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });

  const result = await selectDevAccessSession("admin", {
    endpoint: "/api/dev/access-session",
  });

  assert.equal(result.status, "error");
  assert.equal(result.code, "invalid_response");
});
