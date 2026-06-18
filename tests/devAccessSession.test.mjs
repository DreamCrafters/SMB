import assert from "node:assert/strict";
import test from "node:test";
import {
  clearDevAccessSession,
  selectDevAccessSession,
} from "../.test-build/src/services/devAccessSession.js";

const originalFetch = globalThis.fetch;

test.after(() => {
  globalThis.fetch = originalFetch;
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
