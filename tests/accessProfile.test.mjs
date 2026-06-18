import assert from "node:assert/strict";
import test from "node:test";
import { requestAccessProfile } from "../.test-build/src/services/accessProfile.js";

const originalFetch = globalThis.fetch;

test.after(() => {
  globalThis.fetch = originalFetch;
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

  const result = await requestAccessProfile({ endpoint: "/api/access/profile" });

  assert.equal(result.status, "error");
  assert.equal(result.code, "network_error");
});
