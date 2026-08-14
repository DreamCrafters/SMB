import assert from "node:assert/strict";
import test from "node:test";
import {
  canDeleteAdminPosition,
  createAdminAccount,
  createAdminPosition,
  deleteAdminPosition,
  deleteAdminAccount,
  hasAdminAccountLogin,
  requestAdminAccounts,
  requestAdminPositions,
  resetAdminAccountPassword,
  saveAdminPositionOrder,
  setAdminAccountPosition,
  setAdminAccountLoginEnabled,
  setAdminAccountProtected,
  setAdminPositionProtected,
  setAdminPositionNavigationAccess,
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
  isProtected: false,
  isProtectedByAdminRights: false,
  accessDisplayName: "Диспетчер Один access",
  accountType: "dispatcher",
  position: "dispatcher",
  positionDisplayName: "Диспетчер",
  scope: { kind: "organization" },
  capabilities: ["business.submit_dispatcher_forms"],
  navigationItems: ["business.dispatcher_form"],
  createdAt: "2026-07-10T00:00:00.000Z",
};

test("admin accounts service reads accounts from remote API", async () => {
  const calls = [];

  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });

    return jsonResponse({
      accounts: [account],
      canManageProtectedAccounts: true,
    });
  };

  const result = await requestAdminAccounts({ baseUrl: "http://api.test" });

  assert.equal(result.status, "ready");
  assert.equal(result.accounts[0].login, "dispatcher-1");
  assert.equal(result.canManageProtectedAccounts, true);
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
    email: "dispatcher@example.com",
    maxUserId: "101",
    position: "dispatcher",
  });

  assert.equal(result.status, "ready");
  assert.equal(result.account.login, "dispatcher-1");
  assert.equal(calls[0].init.method, "POST");
  assert.deepEqual(JSON.parse(calls[0].init.body), {
    login: "dispatcher-1",
    password: "supersecret1",
    displayName: "Диспетчер Один",
    email: "dispatcher@example.com",
    maxUserId: "101",
    position: "dispatcher",
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

test("admin positions service lists and creates positions without a base cabinet", async () => {
  const position = {
    id: "position-chief-engineer",
    displayName: "Главный инженер",
    accountType: "business_owner",
    navigationItems: ["business.overview", "business.dispatcher"],
    capabilities: ["business.view_dashboard", "business.view_dispatcher_feed"],
    boardAssignmentAccess: "none",
    showOverviewVisitors: true,
    isProtected: false,
    hasAdminRights: false,
    usageCount: 0,
    createdAt: "2026-07-12T00:00:00.000Z",
  };
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return calls.length === 1
      ? jsonResponse({
          positions: [position],
          canAssignAdminNavigation: true,
          canManageProtectedPositions: true,
        })
      : jsonResponse({ position }, 201);
  };

  const list = await requestAdminPositions({ baseUrl: "http://api.test" });
  const created = await createAdminPosition({
    displayName: "Главный инженер",
    navigationItems: ["business.overview", "business.dispatcher_form"],
    boardAssignmentAccess: "none",
    showOverviewVisitors: true,
  }, { baseUrl: "http://api.test" });

  assert.equal(list.status, "ready");
  assert.equal(list.canAssignAdminNavigation, true);
  assert.equal(created.status, "ready");
  assert.equal(calls[1].init.method, "POST");
  assert.deepEqual(JSON.parse(calls[1].init.body), {
    displayName: "Главный инженер",
    navigationItems: ["business.overview", "business.dispatcher_form"],
    boardAssignmentAccess: "none",
    showOverviewVisitors: true,
  });
});

test("admin positions service updates only the title and unified tabs", async () => {
  const calls = [];
  const position = {
    id: "position-chief-engineer",
    displayName: "Диспетчер производства",
    accountType: "dispatcher",
    navigationItems: ["business.dispatcher_form"],
    capabilities: ["business.submit_dispatcher_forms", "business.view_dispatcher_feed"],
    boardAssignmentAccess: "none",
    showOverviewVisitors: true,
    isProtected: false,
    hasAdminRights: false,
    usageCount: 1,
    createdAt: "2026-07-12T00:00:00.000Z",
  };
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return jsonResponse({ position });
  };

  const result = await updateAdminPosition(position.id, {
    displayName: position.displayName,
    navigationItems: ["business.overview", "business.dispatcher_form"],
    boardAssignmentAccess: "none",
    showOverviewVisitors: true,
  }, { baseUrl: "http://api.test" });

  assert.equal(result.status, "ready");
  assert.equal(calls[0].init.method, "PATCH");
  assert.deepEqual(JSON.parse(calls[0].init.body), {
    displayName: "Диспетчер производства",
    navigationItems: ["business.overview", "business.dispatcher_form"],
    boardAssignmentAccess: "none",
    showOverviewVisitors: true,
  });
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

test("admin positions service saves the complete position order", async () => {
  const calls = [];
  const positions = [
    {
      id: "general_director",
      displayName: "Генеральный директор",
      accountType: "business_owner",
      navigationItems: ["business.overview"],
      capabilities: ["business.view_all_statistics"],
      boardAssignmentAccess: "none",
    showOverviewVisitors: true,
      isProtected: true,
      hasAdminRights: false,
      usageCount: 1,
      createdAt: "2026-07-12T00:00:00.000Z",
    },
    {
      id: "administrator",
      displayName: "Администратор",
      accountType: "admin",
      navigationItems: ["admin.accounts"],
      capabilities: ["platform.manage_access"],
      boardAssignmentAccess: "none",
    showOverviewVisitors: true,
      isProtected: true,
      hasAdminRights: true,
      usageCount: 1,
      createdAt: "2026-07-10T00:00:00.000Z",
    },
  ];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return jsonResponse({
      positions,
      canAssignAdminNavigation: true,
      canManageProtectedPositions: true,
    });
  };

  const result = await saveAdminPositionOrder(
    positions.map(({ id }) => id),
    { baseUrl: "http://api.test" },
  );

  assert.equal(result.status, "ready");
  assert.equal(result.canAssignAdminNavigation, true);
  assert.deepEqual(result.positions.map(({ id }) => id), [
    "general_director",
    "administrator",
  ]);
  assert.equal(calls[0].url, "http://api.test/api/admin/positions/order");
  assert.equal(calls[0].init.method, "PUT");
  assert.deepEqual(JSON.parse(calls[0].init.body), {
    positionIds: ["general_director", "administrator"],
  });
});

test("unused laboratory system position can be deleted", () => {
  assert.equal(canDeleteAdminPosition({
    id: "laboratory_assistant",
    displayName: "Лаборант",
    accountType: "business_owner",
    navigationItems: ["business.laboratory_results"],
    capabilities: ["business.manage_laboratory_results"],
    boardAssignmentAccess: "none",
    showOverviewVisitors: true,
    isProtected: true,
    usageCount: 0,
    createdAt: "2026-07-22T00:00:00.000Z",
  }), true);
});

test("administrator system position cannot be deleted", () => {
  assert.equal(canDeleteAdminPosition({
    id: "administrator",
    displayName: "Администратор",
    accountType: "admin",
    navigationItems: ["admin.accounts"],
    capabilities: ["platform.manage_access"],
    boardAssignmentAccess: "none",
    showOverviewVisitors: true,
    isProtected: true,
    usageCount: 0,
    createdAt: "2026-07-10T00:00:00.000Z",
  }), false);
});

test("unused program-created non-admin position can be deleted", () => {
  assert.equal(canDeleteAdminPosition({
    id: "board_assignment_reviewer",
    displayName: "Член Совета директоров с правом приёмки поручений",
    accountType: "business_owner",
    navigationItems: ["business.board_assignments"],
    capabilities: [
      "business.view_board_assignments",
      "business.review_board_assignments",
    ],
    boardAssignmentAccess: "review",
    showOverviewVisitors: true,
    isProtected: true,
    usageCount: 0,
    createdAt: "2026-07-10T00:00:00.000Z",
  }), true);
});

test("assigned program-created non-admin position cannot be deleted", () => {
  assert.equal(canDeleteAdminPosition({
    id: "board_assignment_reviewer",
    displayName: "Член Совета директоров с правом приёмки поручений",
    accountType: "business_owner",
    navigationItems: ["business.board_assignments"],
    capabilities: [
      "business.view_board_assignments",
      "business.review_board_assignments",
    ],
    boardAssignmentAccess: "review",
    showOverviewVisitors: true,
    isProtected: true,
    usageCount: 1,
    createdAt: "2026-07-10T00:00:00.000Z",
  }), false);
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

test("admin accounts service protects an account", async () => {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return jsonResponse({ userId: "user-id", isProtected: true });
  };

  const result = await setAdminAccountProtected(
    { userId: "user-id", isProtected: true },
    { baseUrl: "http://api.test" },
  );

  assert.deepEqual(result, {
    status: "ready",
    userId: "user-id",
    isProtected: true,
  });
  assert.equal(
    calls[0].url,
    "http://api.test/api/admin/accounts/user-id/protection",
  );
  assert.equal(calls[0].init.method, "PATCH");
  assert.deepEqual(JSON.parse(calls[0].init.body), { isProtected: true });
});

test("admin positions service protects a selected position", async () => {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return jsonResponse({ id: "position-id", isProtected: true });
  };

  const result = await setAdminPositionProtected(
    { id: "position-id", isProtected: true },
    { baseUrl: "http://api.test" },
  );

  assert.deepEqual(result, {
    status: "ready",
    id: "position-id",
    isProtected: true,
  });
  assert.equal(
    calls[0].url,
    "http://api.test/api/admin/positions/position-id/protection",
  );
  assert.equal(calls[0].init.method, "PATCH");
  assert.deepEqual(JSON.parse(calls[0].init.body), { isProtected: true });
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
        scope: { kind: "organization" },
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

test("admin accounts service updates selected tab access for positions", async () => {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return jsonResponse({
      positions: [],
      canAssignAdminNavigation: true,
      canManageProtectedPositions: true,
    });
  };

  const result = await setAdminPositionNavigationAccess({
    navigationItem: "business.settings",
    positionIds: ["general_director", "dispatcher"],
    enabled: true,
  });

  assert.equal(result.status, "ready");
  assert.equal(
    calls[0].url,
    "/api/admin/positions/navigation-access",
  );
  assert.equal(calls[0].init.method, "PUT");
  assert.deepEqual(JSON.parse(calls[0].init.body), {
    navigationItem: "business.settings",
    positionIds: ["general_director", "dispatcher"],
    enabled: true,
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
