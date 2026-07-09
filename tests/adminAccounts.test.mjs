import assert from "node:assert/strict";
import test from "node:test";
import {
  createAdminAccount,
  requestAdminAccounts,
  resetAdminAccountPassword,
} from "../.test-build/src/services/adminAccounts.js";

const originalFetch = globalThis.fetch;

test.after(() => {
  globalThis.fetch = originalFetch;
});

const account = {
  accessId: "access-id",
  userId: "user-id",
  login: "dispatcher-1",
  userDisplayName: "Диспетчер Один",
  userStatus: "active",
  accessDisplayName: "Диспетчер Один access",
  accountType: "dispatcher",
  scope: {
    kind: "department",
    businessAccountId: "business-id",
    departmentId: "department-id",
  },
  businessDisplayName: "Цех 1",
  departmentDisplayName: "Смена А",
  capabilities: ["business.submit_dispatcher_forms"],
  createdAt: "2026-07-10T00:00:00.000Z",
};

test("admin accounts service reads accounts from remote API", async () => {
  const calls = [];

  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });

    return jsonResponse({ accounts: [account] });
  };

  const result = await requestAdminAccounts({ baseUrl: "http://api.test" });

  assert.equal(result.status, "ready");
  assert.equal(result.accounts[0].login, "dispatcher-1");
  assert.equal(calls[0].url, "http://api.test/api/admin/accounts");
  assert.equal(calls[0].init.method, "GET");
});

test("admin accounts service creates an account", async () => {
  const calls = [];

  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });

    return jsonResponse({ account }, 201);
  };

  const result = await createAdminAccount({
    login: "dispatcher-1",
    password: "supersecret1",
    displayName: "Диспетчер Один",
    accountType: "dispatcher",
    businessAccountId: "business-id",
    departmentId: "department-id",
  });

  assert.equal(result.status, "ready");
  assert.equal(result.account.login, "dispatcher-1");
  assert.equal(calls[0].init.method, "POST");
  assert.deepEqual(JSON.parse(calls[0].init.body), {
    login: "dispatcher-1",
    password: "supersecret1",
    displayName: "Диспетчер Один",
    accountType: "dispatcher",
    businessAccountId: "business-id",
    departmentId: "department-id",
  });
});

test("admin accounts service resets a password", async () => {
  const calls = [];

  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });

    return jsonResponse({ ok: true });
  };

  const result = await resetAdminAccountPassword({
    login: "dispatcher-1",
    password: "newsecret1",
  });

  assert.equal(result.status, "ready");
  assert.equal(calls[0].url.endsWith("/api/admin/accounts/reset-password"), true);
  assert.deepEqual(JSON.parse(calls[0].init.body), {
    login: "dispatcher-1",
    password: "newsecret1",
  });
});

test("admin accounts service surfaces server errors", async () => {
  globalThis.fetch = async () =>
    jsonResponse(
      {
        error: {
          code: "access_denied",
          message: "Управление учётными записями недоступно.",
        },
      },
      403,
    );

  const result = await requestAdminAccounts();

  assert.equal(result.status, "error");
  assert.equal(result.code, "access_denied");
  assert.equal(result.message, "Управление учётными записями недоступно.");
});

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json",
    },
  });
}
