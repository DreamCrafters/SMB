import assert from "node:assert/strict";
import test from "node:test";
import {
  createAdminAccount,
  createAdminPosition,
  deleteAdminPosition,
  deleteAdminAccount,
  hasAdminAccountLogin,
  requestAdminAccounts,
  requestAdminPositions,
  resetAdminAccountPassword,
  setAdminAccountPosition,
  setAdminAccountLoginEnabled,
  setAdminAccountNavigation,
  updateAdminPosition,
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
  positionDisplayName: "Диспетчер",
  scope: {
    kind: "department",
    businessAccountId: "business-id",
    departmentId: "department-id",
  },
  businessDisplayName: "Цех 1",
  departmentDisplayName: "Смена А",
  capabilities: ["business.submit_dispatcher_forms"],
  navigationItems: ["business.dispatcher_form"],
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
  });

  assert.equal(result.status, "ready");
  assert.equal(result.account.login, "dispatcher-1");
  assert.equal(calls[0].init.method, "POST");
  assert.deepEqual(JSON.parse(calls[0].init.body), {
    login: "dispatcher-1",
    password: "supersecret1",
    displayName: "Диспетчер Один",
    position: "dispatcher",
  });
});

test("admin accounts service drops client-managed scope names", async () => {
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
    businessDisplayName: "Основной бизнес",
    departmentDisplayName: "Производство",
  });

  assert.deepEqual(JSON.parse(calls[0].init.body), {
    login: "worker-1",
    password: "supersecret1",
    displayName: "Работник Один",
    position: "worker",
  });
});

test("admin accounts service deletes an account", async () => {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return jsonResponse({ ok: true });
  };

  const result = await deleteAdminAccount("user-id", { baseUrl: "http://api.test" });

  assert.equal(result.status, "ready");
  assert.equal(calls[0].init.method, "DELETE");
  assert.equal(calls[0].url, "http://api.test/api/admin/accounts/user-id");
});

test("admin account login precheck is trimmed and case-insensitive", () => {
  assert.equal(hasAdminAccountLogin([account], " DISPATCHER-1 "), true);
  assert.equal(hasAdminAccountLogin([account], "dispatcher-2"), false);
});

test("admin positions service lists and creates positions with a base cabinet", async () => {
  const position = {
    id: "position-chief-engineer",
    displayName: "Главный инженер",
    accountType: "business_owner",
    navigationItems: ["business.overview", "business.dispatcher"],
    capabilities: ["business.view_dashboard", "business.view_dispatcher_feed"],
    isProtected: false,
    usageCount: 0,
    createdAt: "2026-07-12T00:00:00.000Z",
  };
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return calls.length === 1 ? jsonResponse({ positions: [position] }) : jsonResponse({ position }, 201);
  };

  const list = await requestAdminPositions({ baseUrl: "http://api.test" });
  const created = await createAdminPosition({
    displayName: "Главный инженер",
    accountType: "business_owner",
    navigationItems: ["business.overview", "business.dispatcher"],
  }, { baseUrl: "http://api.test" });

  assert.equal(list.status, "ready");
  assert.equal(created.status, "ready");
  assert.equal(calls[1].init.method, "POST");
});

test("admin positions service sends a changed base cabinet", async () => {
  const calls = [];
  const position = {
    id: "position-chief-engineer",
    displayName: "Диспетчер производства",
    accountType: "dispatcher",
    navigationItems: ["business.dispatcher_form"],
    capabilities: ["business.submit_dispatcher_forms", "business.view_dispatcher_feed"],
    isProtected: false,
    usageCount: 1,
    createdAt: "2026-07-12T00:00:00.000Z",
  };
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return jsonResponse({ position });
  };

  const result = await updateAdminPosition(position.id, {
    displayName: position.displayName,
    accountType: "dispatcher",
    navigationItems: ["business.dispatcher_form"],
  }, { baseUrl: "http://api.test" });

  assert.equal(result.status, "ready");
  assert.equal(calls[0].init.method, "PATCH");
  assert.equal(JSON.parse(calls[0].init.body).accountType, "dispatcher");
});

test("admin positions service deletes an unused position", async () => {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return jsonResponse({ ok: true });
  };

  const result = await deleteAdminPosition("position-unused", { baseUrl: "http://api.test" });

  assert.equal(result.status, "ready");
  assert.equal(calls[0].init.method, "DELETE");
  assert.equal(calls[0].url, "http://api.test/api/admin/positions/position-unused");
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

test("admin accounts service assigns a new position to an existing access", async () => {
  const calls = [];

  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });

    return jsonResponse({
      account: {
        ...account,
        accountType: "business_owner",
        position: "business_owner",
        positionDisplayName: "Владелец бизнеса",
        scope: {
          kind: "business",
          businessAccountId: "business-id",
        },
        capabilities: ["business.view_all_statistics"],
        navigationItems: ["business.overview"],
      },
    });
  };

  const result = await setAdminAccountPosition(
    {
      accessId: "access-id",
      position: "business_owner",
    },
    { baseUrl: "http://api.test" },
  );

  assert.equal(result.status, "ready");
  assert.equal(result.account.position, "business_owner");
  assert.equal(
    calls[0].url,
    "http://api.test/api/admin/accounts/access-id/position",
  );
  assert.equal(calls[0].init.method, "PATCH");
  assert.deepEqual(JSON.parse(calls[0].init.body), {
    position: "business_owner",
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
