import assert from "node:assert/strict";
import test from "node:test";
import {
  loginWithPassword,
  logoutAuthSession,
} from "../.test-build/src/services/authSession.js";

const originalFetch = globalThis.fetch;

test.after(() => {
  globalThis.fetch = originalFetch;
});

test("loginWithPassword posts credentials to auth login endpoint", async () => {
  let request;

  globalThis.fetch = async (endpoint, init) => {
    request = { endpoint, init };

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  const result = await loginWithPassword(
    {
      login: "dispatcher",
      password: "secret",
    },
    {
      endpoint: "/api/auth/login",
    },
  );

  assert.equal(result.status, "ready");
  assert.equal(request.endpoint, "/api/auth/login");
  assert.equal(request.init.method, "POST");
  assert.equal(request.init.credentials, "include");
  assert.deepEqual(JSON.parse(request.init.body), {
    login: "dispatcher",
    password: "secret",
  });
});

test("loginWithPassword preserves auth errors", async () => {
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        error: {
          code: "unauthenticated",
          message: "Invalid login or password.",
        },
      }),
      {
        status: 401,
        headers: { "content-type": "application/json" },
      },
    );

  const result = await loginWithPassword(
    {
      login: "dispatcher",
      password: "bad",
    },
    {
      endpoint: "/api/auth/login",
    },
  );

  assert.equal(result.status, "error");
  assert.equal(result.code, "unauthenticated");
  assert.equal(result.statusCode, 401);
});

test("logoutAuthSession posts to auth logout endpoint with cookies", async () => {
  let request;

  globalThis.fetch = async (endpoint, init) => {
    request = { endpoint, init };

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  const result = await logoutAuthSession({
    endpoint: "/api/auth/logout",
  });

  assert.equal(result.status, "ready");
  assert.equal(request.endpoint, "/api/auth/logout");
  assert.equal(request.init.method, "POST");
  assert.equal(request.init.credentials, "include");
});
