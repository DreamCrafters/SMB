import assert from "node:assert/strict";
import test from "node:test";
import { requestAccessProfile } from "../.test-build/src/services/accessProfile.js";

const originalFetch = globalThis.fetch;
const originalWindow = globalThis.window;

test.after(() => {
  globalThis.fetch = originalFetch;
  globalThis.window = originalWindow;
});

test.afterEach(() => {
  globalThis.window = originalWindow;
});

test("requestAccessProfile returns empty when server profile is null", async () => {
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ profile: null }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });

  const result = await requestAccessProfile({ endpoint: "/api/access/profile" });

  assert.equal(result.status, "empty");
  assert.equal(result.statusCode, 200);
});

test("requestAccessProfile sends stored dev access session id", async () => {
  let request;

  globalThis.window = {
    sessionStorage: {
      getItem: () => "dev-session-id",
      setItem: () => undefined,
      removeItem: () => undefined,
    },
  };
  globalThis.fetch = async (endpoint, init) => {
    request = { endpoint, init };

    return new Response(JSON.stringify({ profile: null }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  const result = await requestAccessProfile({ endpoint: "/api/access/profile" });

  assert.equal(result.status, "empty");
  assert.equal(request.init.headers["X-SMB-Dev-Session"], "dev-session-id");
});

test("requestAccessProfile explains missing access profile endpoints", async () => {
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        error: {
          code: "not_found",
          message: "The page could not be found",
        },
      }),
      {
        status: 404,
        headers: { "content-type": "application/json" },
      },
    );

  const result = await requestAccessProfile({ endpoint: "/api/access/profile" });

  assert.equal(result.status, "error");
  assert.match(result.message, /VITE_SMB_REMOTE_API_URL/);
});

test("requestAccessProfile accepts a minimal valid server profile", async () => {
  const profile = {
    userId: "user-id",
    displayName: "Server user",
    accountType: "worker",
    activeAccess: {
      accountId: "account-id",
      accountType: "worker",
      displayName: "Worker access",
      scope: {
        kind: "department",
        businessAccountId: "business-id",
        departmentId: "department-id",
      },
      capabilities: ["business.submit_forms"],
      issuedAt: "2026-06-18T00:00:00.000Z",
    },
    businessAccounts: [],
    departments: [],
    organizationStructureMode: "current",
    receivedAt: "2026-06-18T00:00:00.000Z",
  };

  globalThis.fetch = async () =>
    new Response(JSON.stringify({ profile }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });

  const result = await requestAccessProfile({ endpoint: "/api/access/profile" });

  assert.equal(result.status, "ready");
  assert.equal(result.profile.accountType, "worker");
});

test("requestAccessProfile accepts dispatcher profiles", async () => {
  const profile = {
    userId: "dispatcher-id",
    displayName: "Server dispatcher",
    accountType: "dispatcher",
    activeAccess: {
      accountId: "dispatcher-access-id",
      accountType: "dispatcher",
      displayName: "Dispatcher access",
      scope: {
        kind: "department",
        businessAccountId: "business-id",
        departmentId: "department-id",
      },
      capabilities: ["business.submit_dispatcher_forms"],
      issuedAt: "2026-06-18T00:00:00.000Z",
    },
    businessAccounts: [],
    departments: [],
    organizationStructureMode: "current",
    receivedAt: "2026-06-18T00:00:00.000Z",
  };

  globalThis.fetch = async () =>
    new Response(JSON.stringify({ profile }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });

  const result = await requestAccessProfile({ endpoint: "/api/access/profile" });

  assert.equal(result.status, "ready");
  assert.equal(result.profile.accountType, "dispatcher");
});

test("requestAccessProfile rejects unsupported profile shapes", async () => {
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ profile: { accountType: "worker" } }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });

  const result = await requestAccessProfile({ endpoint: "/api/access/profile" });

  assert.equal(result.status, "error");
  assert.equal(result.code, "invalid_response");
});

test("requestAccessProfile rejects unknown server capabilities", async () => {
  const profile = {
    userId: "user-id",
    displayName: "Server user",
    accountType: "worker",
    activeAccess: {
      accountId: "account-id",
      accountType: "worker",
      displayName: "Worker access",
      scope: {
        kind: "department",
        businessAccountId: "business-id",
        departmentId: "department-id",
      },
      capabilities: ["unknown.capability"],
      issuedAt: "2026-06-18T00:00:00.000Z",
    },
    businessAccounts: [],
    departments: [],
    organizationStructureMode: "current",
    receivedAt: "2026-06-18T00:00:00.000Z",
  };

  globalThis.fetch = async () =>
    new Response(JSON.stringify({ profile }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });

  const result = await requestAccessProfile({ endpoint: "/api/access/profile" });

  assert.equal(result.status, "error");
  assert.equal(result.code, "invalid_response");
});

test("requestAccessProfile preserves server access errors", async () => {
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        error: {
          code: "access_denied",
          message: "Access is denied by server policy.",
        },
      }),
      {
        status: 403,
        headers: { "content-type": "application/json" },
      },
    );

  const result = await requestAccessProfile({ endpoint: "/api/access/profile" });

  assert.equal(result.status, "error");
  assert.equal(result.code, "access_denied");
  assert.equal(result.statusCode, 403);
});

test("requestAccessProfile reports network failures", async () => {
  globalThis.fetch = async () => {
    throw new TypeError("network unavailable");
  };

  const result = await requestAccessProfile({
    endpoint: "/api/access/profile",
    remoteBaseUrl: "https://smb-backend-api.com",
    pageOrigin: "https://smb-14uw5huc0-artemi-z-s-projects.vercel.app",
  });

  assert.equal(result.status, "error");
  assert.equal(result.code, "network_error");
  assert.match(result.message, /https:\/\/smb-backend-api\.com\/health/);
  assert.match(result.message, /smb-14uw5huc0-artemi-z-s-projects/);
  assert.match(result.message, /CORS_ORIGIN/);
});
