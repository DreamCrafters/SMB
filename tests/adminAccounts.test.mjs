import assert from "node:assert/strict";
import test from "node:test";
import {
  createAdminAccount,
  createAdminAccessLevel,
  hasAdminAccountLogin,
  requestAdminAccounts,
  requestAdminAccessLevels,
  resetAdminAccountPassword,
  setAdminAccountLoginEnabled,
  setAdminAccountNavigation,
  updateAdminAccessLevel,
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
  position: "dispatcher",
  scope: {
    kind: "department",
    businessAccountId: "business-id",
    departmentId: "department-id",
  },
  businessDisplayName: "Цех 1",
  departmentDisplayName: "Смена А",
  capabilities: ["business.submit_dispatcher_forms"],
  navigationItems: ["business.dispatcher_form"],
  accessLevelId: "system-dispatcher",
  accessLevelDisplayName: "Полный доступ",
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

test("admin accounts service creates an account without client-generated ids", async () => {
  const calls = [];

  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });

    return jsonResponse({ account }, 201);
  };

  const result = await createAdminAccount({
    login: "dispatcher-1",
    password: "supersecret1",
    displayName: "Диспетчер Один",
    position: "dispatcher",
    navigationItems: ["business.dispatcher_form"],
  });

  assert.equal(result.status, "ready");
  assert.equal(result.account.login, "dispatcher-1");
  assert.equal(calls[0].init.method, "POST");
  assert.deepEqual(JSON.parse(calls[0].init.body), {
    login: "dispatcher-1",
    password: "supersecret1",
    displayName: "Диспетчер Один",
    position: "dispatcher",
    navigationItems: ["business.dispatcher_form"],
  });
});

test("admin access levels service lists and creates reusable levels", async () => {
  const accessLevel = {
    id: "level-id",
    displayName: "Только обзор",
    position: "board_member",
    accountType: "business_owner",
    navigationItems: ["business.overview"],
    capabilities: ["business.view_all_statistics"],
    isSystem: false,
    usageCount: 0,
    createdAt: "2026-07-12T00:00:00.000Z",
  };
  let requestIndex = 0;
  globalThis.fetch = async () => {
    requestIndex += 1;
    return requestIndex === 1
      ? jsonResponse({ accessLevels: [accessLevel] })
      : jsonResponse({ accessLevel }, 201);
  };

  const listResult = await requestAdminAccessLevels();
  const createResult = await createAdminAccessLevel({
    displayName: "Только обзор",
    position: "board_member",
    navigationItems: ["business.overview"],
  });

  assert.equal(listResult.status, "ready");
  assert.equal(createResult.status, "ready");
});

test("admin access levels service updates an existing level", async () => {
  const accessLevel = {
    id: "level-id",
    displayName: "Расширенный",
    position: "worker",
    accountType: "worker",
    navigationItems: ["business.overview", "business.work"],
    capabilities: ["business.view_all_statistics", "business.submit_forms"],
    isSystem: false,
    usageCount: 2,
    createdAt: "2026-07-12T00:00:00.000Z",
  };
  let call;
  globalThis.fetch = async (url, init) => {
    call = { url: String(url), init };
    return jsonResponse({ accessLevel });
  };

  const result = await updateAdminAccessLevel("level-id", {
    displayName: "Расширенный",
    navigationItems: ["business.overview", "business.work"],
  });

  assert.equal(result.status, "ready");
  assert.equal(call.init.method, "PATCH");
  assert.match(call.url, /access-levels\/level-id$/);
});

test("admin accounts service sends optional worker scope names without ids", async () => {
  const calls = [];

  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });

    return jsonResponse({ account }, 201);
  };

  await createAdminAccount({
    login: "worker-1",
    password: "supersecret1",
    displayName: "Работник Один",
    position: "worker",
    navigationItems: ["business.work"],
    businessDisplayName: "Основной бизнес",
    departmentDisplayName: "Производство",
  });

  assert.deepEqual(JSON.parse(calls[0].init.body), {
    login: "worker-1",
    password: "supersecret1",
    displayName: "Работник Один",
    position: "worker",
    navigationItems: ["business.work"],
    businessDisplayName: "Основной бизнес",
    departmentDisplayName: "Производство",
  });
});

test("admin account login precheck is trimmed and case-insensitive", () => {
  assert.equal(hasAdminAccountLogin([account], " DISPATCHER-1 "), true);
  assert.equal(hasAdminAccountLogin([account], "dispatcher-2"), false);
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

test("admin accounts service enables and disables account login", async () => {
  const calls = [];

  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });

    return jsonResponse({
      userId: "user-id",
      userStatus: "suspended",
    });
  };

  const result = await setAdminAccountLoginEnabled({
    userId: "user-id",
    isEnabled: false,
  });

  assert.deepEqual(result, {
    status: "ready",
    userId: "user-id",
    userStatus: "suspended",
  });
  assert.equal(calls[0].url.endsWith("/api/admin/accounts"), true);
  assert.equal(calls[0].init.method, "PATCH");
  assert.deepEqual(JSON.parse(calls[0].init.body), {
    userId: "user-id",
    isEnabled: false,
  });
});

test("admin accounts service updates left navigation access", async () => {
  const calls = [];

  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return jsonResponse({
      account: { ...account, navigationItems: ["business.dispatcher_form"] },
    });
  };

  const result = await setAdminAccountNavigation({
    accessId: "access-id",
    navigationItems: ["business.dispatcher_form"],
  });

  assert.equal(result.status, "ready");
  assert.equal(calls[0].init.method, "PATCH");
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
