import assert from "node:assert/strict";
import test from "node:test";
import type { DatabasePool } from "../db/pool.js";
import {
  CanonicalAdminMutationRequiredError,
  ProtectedAccountMutationError,
} from "../domain/adminAccountProtection.js";
import {
  PositionAdminRightsRemovalRequiresNavigationError,
  PositionNavigationRemovalRequiresNavigationError,
  ProtectedPositionMutationError,
} from "../domain/adminPositionProtection.js";
import {
  ArchivedAccountLoginStatusError,
  AccountLoginAlreadyExistsError,
  createAccountsRepository,
  SystemAdministratorPositionAssignmentError,
} from "./accountsRepository.js";

test("listAccounts follows the server-owned position order and sorts names within each group", async () => {
  let selectSql = "";
  const pool = {
    async query(sql: string) {
      selectSql = sql.replace(/\s+/g, " ").trim();
      return [[], []];
    },
  } as unknown as DatabasePool;

  await createAccountsRepository(pool).listAccounts();

  assert.match(
    selectSql,
    /order by positions\.sort_order asc, users\.display_name asc/,
  );
  assert.match(
    selectSql,
    /protected_accesses\.user_id = users\.id.*protected_accesses\.is_active = 1.*protected_positions\.is_admin_protected = 1.*as is_protected/u,
  );
  assert.match(
    selectSql,
    /protected_positions\.is_admin_protected = 1.*as is_protected_by_admin_rights/u,
  );
});

test("listPositions follows the server-owned position order", async () => {
  let selectSql = "";
  const pool = {
    async query(sql: string) {
      selectSql = sql.replace(/\s+/g, " ").trim();
      return [[], []];
    },
  } as unknown as DatabasePool;

  await createAccountsRepository(pool).listPositions();

  assert.match(
    selectSql,
    /order by positions\.sort_order asc, positions\.display_name asc/,
  );
});

test("setPositionOrder atomically assigns every current position its requested order", async () => {
  const queries: Array<{ sql: string; params?: unknown[] }> = [];
  let didCommit = false;
  const connection = {
    async beginTransaction() {},
    async commit() { didCommit = true; },
    async rollback() {},
    release() {},
    async query(sql: string, params?: unknown[]) {
      const normalized = sql.replace(/\s+/g, " ").trim();
      queries.push({ sql: normalized, params });
      if (normalized.startsWith("select id, is_admin_protected from account_positions")) {
        return [[
          { id: "administrator", is_admin_protected: 0 },
          { id: "dispatcher", is_admin_protected: 0 },
          { id: "general_director", is_admin_protected: 0 },
        ], []];
      }
      return [[], []];
    },
  };
  const pool = {
    async getConnection() { return connection; },
  } as unknown as DatabasePool;

  const didUpdate = await createAccountsRepository(pool).setPositionOrder([
    "general_director",
    "administrator",
    "dispatcher",
  ]);

  assert.equal(didUpdate, true);
  assert.equal(didCommit, true);
  const update = queries.find((query) =>
    query.sql.startsWith("update account_positions set sort_order")
  );
  assert.deepEqual(update?.params, [
    "general_director", 0,
    "administrator", 1,
    "dispatcher", 2,
    "general_director",
    "administrator",
    "dispatcher",
  ]);
});

test("setPositionOrder rejects an incomplete position list without writing", async () => {
  let didUpdate = false;
  let didRollback = false;
  const connection = {
    async beginTransaction() {},
    async commit() {},
    async rollback() { didRollback = true; },
    release() {},
    async query(sql: string) {
      const normalized = sql.replace(/\s+/g, " ").trim();
      if (normalized.startsWith("select id, is_admin_protected from account_positions")) {
        return [[
          { id: "administrator", is_admin_protected: 1 },
          { id: "dispatcher", is_admin_protected: 0 },
        ], []];
      }
      if (normalized.startsWith("update account_positions")) {
        didUpdate = true;
      }
      return [[], []];
    },
  };
  const pool = {
    async getConnection() { return connection; },
  } as unknown as DatabasePool;

  const result = await createAccountsRepository(pool).setPositionOrder([
    "administrator",
  ]);

  assert.equal(result, false);
  assert.equal(didUpdate, false);
  assert.equal(didRollback, true);
});

test("setPositionOrder rejects moving a protected position for a delegated manager", async () => {
  let didUpdate = false;
  let didRollback = false;
  const connection = {
    async beginTransaction() {},
    async commit() {},
    async rollback() { didRollback = true; },
    release() {},
    async query(sql: string) {
      const normalized = sql.replace(/\s+/g, " ").trim();
      if (normalized.startsWith("select id, is_admin_protected from account_positions")) {
        return [[
          { id: "position-protected", is_admin_protected: 1 },
          { id: "position-ordinary", is_admin_protected: 0 },
        ], []];
      }
      if (normalized.startsWith("update account_positions")) didUpdate = true;
      return [[], []];
    },
  };
  const pool = {
    async getConnection() { return connection; },
  } as unknown as DatabasePool;

  await assert.rejects(
    createAccountsRepository(pool).setPositionOrder([
      "position-ordinary",
      "position-protected",
    ], false),
    ProtectedPositionMutationError,
  );
  assert.equal(didUpdate, false);
  assert.equal(didRollback, true);
});

test("setPositionNavigationAccess atomically updates selected working tabs and linked sessions", async () => {
  const queries: Array<{ sql: string; params?: unknown[] }> = [];
  let didCommit = false;
  const connection = {
    async beginTransaction() {},
    async commit() { didCommit = true; },
    async rollback() {},
    release() {},
    async query(sql: string, params?: unknown[]) {
      const normalized = sql.replace(/\s+/g, " ").trim();
      queries.push({ sql: normalized, params });
      if (normalized.startsWith("select login, status from app_users")) {
        return [[{ login: "admin", status: "active" }], []];
      }
      if (normalized.startsWith("select positions.id, positions.display_name")) {
        return [[
          {
            id: "position-director",
            display_name: "Генеральный директор",
            account_type: "business_owner",
            navigation_items: JSON.stringify(["business.overview"]),
            capabilities: JSON.stringify([
              "business.view_all_statistics",
              "business.view_notifications",
              "business.view_dispatcher_feed",
            ]),
            is_protected: 1,
            is_admin_protected: 0,
            created_at: "2026-08-10T00:00:00.000Z",
            usage_count: 1,
          },
          {
            id: "position-manager",
            display_name: "Начальник производства",
            account_type: "business_owner",
            navigation_items: JSON.stringify([
              "business.dispatcher",
              "business.settings",
            ]),
            capabilities: JSON.stringify([
              "business.view_dispatcher_feed",
              "business.manage_notification_settings",
            ]),
            is_protected: 0,
            is_admin_protected: 0,
            created_at: "2026-08-10T00:00:00.000Z",
            usage_count: 2,
          },
        ], []];
      }
      return [[], []];
    },
  };
  const pool = {
    async getConnection() { return connection; },
  } as unknown as DatabasePool;

  const result = await createAccountsRepository(pool).setPositionNavigationAccess({
    navigationItem: "business.settings",
    positionIds: ["position-director", "position-manager"],
    enabled: true,
  }, {
    userId: "root-admin-user",
    accessId: "root-admin-access",
    devAccessEnabled: false,
  });

  assert.equal(didCommit, true);
  assert.deepEqual(result, {
    navigationItem: "business.settings",
    enabled: true,
    positions: [
      { id: "position-director", displayName: "Генеральный директор" },
    ],
  });
  assert.deepEqual(queries[0]?.params, ["root-admin-user"]);
  assert.match(
    queries.find((query) =>
      query.sql.startsWith("select positions.id, positions.display_name")
    )?.sql ?? "",
    /order by positions\.id for update$/u,
  );
  assert.deepEqual(
    queries.find((query) =>
      query.sql.startsWith("update account_positions set navigation_items")
    )?.params,
    [
      JSON.stringify(["business.overview", "business.settings"]),
      JSON.stringify([
        "business.view_all_statistics",
        "business.view_notifications",
        "business.view_dispatcher_feed",
        "business.manage_notification_settings",
      ]),
      "position-director",
    ],
  );
  assert.equal(
    queries.some((query) =>
      query.sql.startsWith("update account_accesses accesses") &&
      query.params?.at(-1) === "position-director"
    ),
    true,
  );
  assert.equal(
    queries.some((query) =>
      query.sql.startsWith("delete sessions from auth_sessions sessions") &&
      query.params?.at(-1) === "position-director"
    ),
    true,
  );
});

test("setPositionNavigationAccess keeps the last working tab of an ordinary position", async () => {
  let didUpdate = false;
  let didRollback = false;
  const connection = {
    async beginTransaction() {},
    async commit() {},
    async rollback() { didRollback = true; },
    release() {},
    async query(sql: string) {
      const normalized = sql.replace(/\s+/g, " ").trim();
      if (normalized.startsWith("select login, status from app_users")) {
        return [[{ login: "admin", status: "active" }], []];
      }
      if (normalized.startsWith("select positions.id, positions.display_name")) {
        return [[{
          id: "position-only-overview",
          display_name: "Наблюдатель",
          account_type: "business_owner",
          navigation_items: JSON.stringify(["business.overview"]),
          capabilities: JSON.stringify(["business.view_all_statistics"]),
          is_protected: 0,
          is_admin_protected: 0,
          created_at: "2026-08-10T00:00:00.000Z",
          usage_count: 1,
        }], []];
      }
      if (normalized.startsWith("update account_positions")) {
        didUpdate = true;
      }
      return [[], []];
    },
  };
  const pool = {
    async getConnection() { return connection; },
  } as unknown as DatabasePool;

  await assert.rejects(
    createAccountsRepository(pool).setPositionNavigationAccess({
      navigationItem: "business.overview",
      positionIds: ["position-only-overview"],
      enabled: false,
    }, {
      userId: "root-admin-user",
      accessId: "root-admin-access",
      devAccessEnabled: false,
    }),
    PositionNavigationRemovalRequiresNavigationError,
  );

  assert.equal(didUpdate, false);
  assert.equal(didRollback, true);
});

test("setPositionNavigationAccess lets synthetic dev admin clear an admin-rights position", async () => {
  let didUpdate = false;
  let didCommit = false;
  const connection = {
    async beginTransaction() {},
    async commit() { didCommit = true; },
    async rollback() {},
    release() {},
    async query(sql: string) {
      const normalized = sql.replace(/\s+/g, " ").trim();
      if (normalized.startsWith("select login, status from app_users")) {
        throw new Error("Synthetic dev admin must not require an app_users row.");
      }
      if (normalized.startsWith("select positions.id, positions.display_name")) {
        return [[{
          id: "position-admin-rights",
          display_name: "Администратор подразделения",
          account_type: "business_owner",
          navigation_items: JSON.stringify([
            "business.overview",
            "admin.accounts",
          ]),
          capabilities: JSON.stringify([
            "business.view_all_statistics",
            "platform.manage_users",
            "platform.manage_access",
          ]),
          is_protected: 0,
          is_admin_protected: 1,
          created_at: "2026-08-10T00:00:00.000Z",
          usage_count: 1,
        }], []];
      }
      if (normalized.startsWith("update account_positions")) {
        didUpdate = true;
      }
      return [[], []];
    },
  };
  const pool = {
    async getConnection() { return connection; },
  } as unknown as DatabasePool;

  const result = await createAccountsRepository(pool).setPositionNavigationAccess({
    navigationItem: "business.overview",
    positionIds: ["position-admin-rights"],
    enabled: false,
  }, {
    userId: "dev-user-admin",
    accessId: "dev-access-admin",
    devAccessEnabled: true,
  });

  assert.equal(didUpdate, true);
  assert.equal(didCommit, true);
  assert.deepEqual(result?.positions, [{
    id: "position-admin-rights",
    displayName: "Администратор подразделения",
  }]);
});

test("setPositionNavigationAccess rechecks the original admin under lock", async () => {
  let didReadPositions = false;
  let didRollback = false;
  const connection = {
    async beginTransaction() {},
    async commit() {},
    async rollback() { didRollback = true; },
    release() {},
    async query(sql: string) {
      const normalized = sql.replace(/\s+/g, " ").trim();
      if (normalized.startsWith("select login, status from app_users")) {
        return [[{ login: "delegated-admin", status: "active" }], []];
      }
      if (normalized.startsWith("select positions.id, positions.display_name")) {
        didReadPositions = true;
      }
      return [[], []];
    },
  };
  const pool = {
    async getConnection() { return connection; },
  } as unknown as DatabasePool;

  await assert.rejects(
    createAccountsRepository(pool).setPositionNavigationAccess({
      navigationItem: "business.settings",
      positionIds: ["position-manager"],
      enabled: true,
    }, {
      userId: "delegated-user",
      accessId: "delegated-access",
      devAccessEnabled: false,
    }),
    CanonicalAdminMutationRequiredError,
  );

  assert.equal(didReadPositions, false);
  assert.equal(didRollback, true);
});

test("setPositionProtected atomically grants delegated admin access and revokes linked sessions", async () => {
  const queries: Array<{ sql: string; params?: unknown[] }> = [];
  let didCommit = false;
  const connection = {
    async beginTransaction() {},
    async commit() { didCommit = true; },
    async rollback() {},
    release() {},
    async query(sql: string, params?: unknown[]) {
      const normalized = sql.replace(/\s+/g, " ").trim();
      queries.push({ sql: normalized, params });
      if (normalized.startsWith("select id, display_name, account_type, navigation_items")) {
        return [[{
          id: "position-selected",
          display_name: "Выбранная должность",
          account_type: "business_owner",
          is_admin_protected: 0,
          navigation_items: JSON.stringify(["business.overview"]),
          capabilities: JSON.stringify([
            "business.view_all_statistics",
            "business.view_notifications",
            "business.view_dispatcher_feed",
          ]),
        }], []];
      }
      return [[], []];
    },
  };
  const pool = {
    async getConnection() { return connection; },
  } as unknown as DatabasePool;

  const result = await createAccountsRepository(pool).setPositionProtected({
    id: "position-selected",
    isProtected: true,
  });

  assert.deepEqual(result, {
    id: "position-selected",
    isProtected: true,
    displayName: "Выбранная должность",
    previousIsProtected: false,
  });
  assert.equal(didCommit, true);
  assert.match(queries[0]?.sql ?? "", /for update$/u);
  assert.deepEqual(
    queries.find((query) =>
      query.sql.startsWith("update account_positions set is_admin_protected")
    )?.params,
    [
      1,
      JSON.stringify(["business.overview", "admin.accounts"]),
      JSON.stringify([
        "business.view_all_statistics",
        "business.view_notifications",
        "business.view_dispatcher_feed",
        "platform.manage_users",
        "platform.manage_access",
      ]),
      "position-selected",
    ],
  );
  assert.equal(
    queries.some((query) =>
      query.sql.startsWith("update account_accesses accesses") &&
      query.sql.includes("where accesses.position_code = ?")
    ),
    true,
  );
  assert.equal(
    queries.some((query) =>
      query.sql.startsWith("delete sessions from auth_sessions sessions")
    ),
    true,
  );
});

test("setPositionProtected keeps root panels for the system administrator", async () => {
  const queries: Array<{ sql: string; params?: unknown[] }> = [];
  const connection = {
    async beginTransaction() {},
    async commit() {},
    async rollback() {},
    release() {},
    async query(sql: string, params?: unknown[]) {
      const normalized = sql.replace(/\s+/g, " ").trim();
      queries.push({ sql: normalized, params });
      if (normalized.startsWith("select id, display_name, account_type, navigation_items")) {
        return [[{
          id: "administrator",
          display_name: "Администратор",
          account_type: "admin",
          is_admin_protected: 1,
          navigation_items: JSON.stringify([
            "admin.account_preview",
            "admin.accounts",
            "admin.database",
            "admin.user_actions",
          ]),
          capabilities: JSON.stringify([
            "platform.manage_users",
            "platform.manage_access",
            "platform.manage_analytics_database",
            "platform.manage_integrations",
            "platform.view_audit",
            "platform.view_logs",
            "platform.use_debug_tools",
            "business.view_all_statistics",
          ]),
        }], []];
      }
      return [[], []];
    },
  };
  const pool = {
    async getConnection() { return connection; },
  } as unknown as DatabasePool;

  await createAccountsRepository(pool).setPositionProtected({
    id: "administrator",
    isProtected: true,
  });

  assert.deepEqual(
    queries.find((query) =>
      query.sql.startsWith("update account_positions set is_admin_protected")
    )?.params,
    [
      1,
      JSON.stringify([
        "admin.account_preview",
        "admin.accounts",
        "admin.database",
        "admin.user_actions",
      ]),
      JSON.stringify([
        "platform.manage_users",
        "platform.manage_access",
        "platform.manage_analytics_database",
        "platform.manage_integrations",
        "platform.view_audit",
        "platform.view_logs",
        "platform.use_debug_tools",
        "business.view_all_statistics",
      ]),
      "administrator",
    ],
  );
});

test("setPositionProtected keeps admin rights until a working tab is selected", async () => {
  let didUpdate = false;
  const connection = {
    async beginTransaction() {},
    async commit() {},
    async rollback() {},
    release() {},
    async query(sql: string) {
      const normalized = sql.replace(/\s+/g, " ").trim();
      if (normalized.startsWith("select id, display_name, account_type, navigation_items")) {
        return [[{
          id: "delegated_administrator",
          display_name: "Делегированный администратор сайта",
          account_type: "business_owner",
          is_admin_protected: 1,
          navigation_items: JSON.stringify(["admin.accounts"]),
          capabilities: JSON.stringify([
            "platform.manage_users",
            "platform.manage_access",
          ]),
        }], []];
      }
      if (normalized.startsWith("update account_positions")) {
        didUpdate = true;
      }
      return [[], []];
    },
  };
  const pool = {
    async getConnection() { return connection; },
  } as unknown as DatabasePool;

  await assert.rejects(
    createAccountsRepository(pool).setPositionProtected({
      id: "delegated_administrator",
      isProtected: false,
    }),
    PositionAdminRightsRemovalRequiresNavigationError,
  );
  assert.equal(didUpdate, false);
});

test("createPosition appends a new position after the current order", async () => {
  let insertSql = "";
  const pool = {
    async query(sql: string) {
      insertSql = sql.replace(/\s+/g, " ").trim();
      return [[], []];
    },
  } as unknown as DatabasePool;

  await createAccountsRepository(pool, {
    createId: () => "chief-engineer",
  }).createPosition({
    displayName: "Главный инженер",
    navigationItems: ["business.overview"],
    capabilities: ["business.view_all_statistics"],
  });

  assert.match(
    insertSql,
    /coalesce\(max\(sort_order\), -1\) \+ 1 from account_positions/u,
  );
});

test("updatePosition preserves the technical account type and refreshes linked sessions", async () => {
  const queries: Array<{ sql: string; params?: unknown[] }> = [];
  let didCommit = false;
  const connection = {
    async beginTransaction() {},
    async commit() { didCommit = true; },
    async rollback() {},
    release() {},
    async query(sql: string, params?: unknown[]) {
      const normalized = sql.replace(/\s+/g, " ").trim();
      queries.push({ sql: normalized, params });
      if (normalized.includes("from account_positions positions where positions.id")) {
        return [[{
          id: "position-manager",
          display_name: "Руководитель участка",
          account_type: "business_owner",
          navigation_items: JSON.stringify(["business.overview"]),
          capabilities: JSON.stringify(["business.view_all_statistics"]),
          is_protected: 0,
          created_at: "2026-07-12T00:00:00.000Z",
          usage_count: 1,
        }], []];
      }
      if (normalized.startsWith("select accesses.id as access_id")) {
        return [[{
          access_id: "access-manager",
          user_id: "user-manager",
        }], []];
      }
      return [[], []];
    },
  };
  const pool = {
    async getConnection() { return connection; },
  } as unknown as DatabasePool;
  const repository = createAccountsRepository(pool);

  const result = await repository.updatePosition({
    id: "position-manager",
    displayName: "Диспетчер участка",
    navigationItems: ["business.dispatcher_form"],
    capabilities: ["business.submit_dispatcher_forms", "business.view_dispatcher_feed"],
  });

  assert.equal(didCommit, true);
  assert.equal(result?.accountType, "business_owner");
  assert.equal(
    queries.some((query) => query.sql.startsWith("update account_accesses set account_type")),
    false,
  );
  assert.deepEqual(
    queries.find((query) => query.sql.startsWith("update account_positions set display_name"))?.params?.slice(0, 1),
    ["Диспетчер участка"],
  );
});

test("updatePosition rejects a protected position for a delegated manager inside the lock", async () => {
  let didUpdate = false;
  let didRollback = false;
  const connection = {
    async beginTransaction() {},
    async commit() {},
    async rollback() { didRollback = true; },
    release() {},
    async query(sql: string) {
      const normalized = sql.replace(/\s+/g, " ").trim();
      if (normalized.includes("from account_positions positions where positions.id")) {
        return [[{
          id: "position-protected",
          display_name: "Защищённая должность",
          account_type: "business_owner",
          navigation_items: JSON.stringify(["business.overview"]),
          capabilities: JSON.stringify(["business.view_all_statistics"]),
          is_protected: 0,
          is_admin_protected: 1,
          created_at: "2026-08-07T00:00:00.000Z",
          usage_count: 0,
        }], []];
      }
      if (normalized.startsWith("update account_positions")) didUpdate = true;
      return [[], []];
    },
  };
  const pool = {
    async getConnection() { return connection; },
  } as unknown as DatabasePool;

  await assert.rejects(
    createAccountsRepository(pool).updatePosition({
      id: "position-protected",
      displayName: "Изменённая должность",
      navigationItems: ["business.overview"],
      capabilities: ["business.view_all_statistics"],
    }, false),
    ProtectedPositionMutationError,
  );
  assert.equal(didUpdate, false);
  assert.equal(didRollback, true);
});

test("updatePosition preserves delegated admin access when original admin edits working tabs", async () => {
  const queries: Array<{ sql: string; params?: unknown[] }> = [];
  const connection = {
    async beginTransaction() {},
    async commit() {},
    async rollback() {},
    release() {},
    async query(sql: string, params?: unknown[]) {
      const normalized = sql.replace(/\s+/g, " ").trim();
      queries.push({ sql: normalized, params });
      if (normalized.includes("from account_positions positions where positions.id")) {
        return [[{
          id: "position-admin-manager",
          display_name: "Администратор подразделения",
          account_type: "business_owner",
          navigation_items: JSON.stringify([
            "business.overview",
            "admin.accounts",
          ]),
          capabilities: JSON.stringify([
            "business.view_all_statistics",
            "business.view_notifications",
            "business.view_dispatcher_feed",
            "platform.manage_users",
            "platform.manage_access",
          ]),
          is_protected: 0,
          is_admin_protected: 1,
          created_at: "2026-08-10T00:00:00.000Z",
          usage_count: 1,
        }], []];
      }
      return [[], []];
    },
  };
  const pool = {
    async getConnection() { return connection; },
  } as unknown as DatabasePool;

  const result = await createAccountsRepository(pool).updatePosition({
    id: "position-admin-manager",
    displayName: "Администратор производства",
    navigationItems: ["business.dispatcher"],
    capabilities: ["business.view_dispatcher_feed"],
  }, true);

  const update = queries.find((query) =>
    query.sql.startsWith("update account_positions set display_name")
  );
  assert.deepEqual(update?.params, [
    "Администратор производства",
    JSON.stringify(["business.dispatcher", "admin.accounts"]),
    JSON.stringify([
      "business.view_dispatcher_feed",
      "platform.manage_users",
      "platform.manage_access",
    ]),
    "position-admin-manager",
  ]);
  assert.equal(result?.hasAdminRights, true);
  assert.deepEqual(result?.navigationItems, [
    "business.dispatcher",
    "admin.accounts",
  ]);
});

test("setAccountPosition applies position access and revokes user sessions", async () => {
  const queries: Array<{ sql: string; params?: unknown[] }> = [];
  let didCommit = false;
  let accountReadCount = 0;
  const connection = {
    async beginTransaction() {},
    async commit() { didCommit = true; },
    async rollback() {},
    release() {},
    async query(sql: string, params?: unknown[]) {
      const normalized = sql.replace(/\s+/g, " ").trim();
      queries.push({ sql: normalized, params });

      if (normalized.startsWith("select accesses.id as access_id, accesses.user_id")) {
        return [[{
          access_id: "access-dispatcher",
          user_id: "user-dispatcher",
        }], []];
      }

      if (normalized.startsWith("select users.status, greatest(")) {
        return [[{ status: "active", is_admin_protected: 0 }], []];
      }

      if (normalized.startsWith("select positions.id, positions.display_name")) {
        return [[{
          id: "business_owner",
          display_name: "Владелец бизнеса",
          account_type: "business_owner",
          navigation_items: JSON.stringify(["business.overview"]),
          capabilities: JSON.stringify(["business.view_all_statistics"]),
          is_protected: 1,
          created_at: "2026-07-12T00:00:00.000Z",
          usage_count: 1,
        }], []];
      }

      if (normalized.startsWith("select accesses.id as access_id") && normalized.includes("where accesses.id")) {
        const isUpdated = accountReadCount > 0;
        accountReadCount += 1;
        return [[{
          access_id: "access-dispatcher",
          user_id: "user-dispatcher",
          login: "dispatcher-1",
          user_display_name: "Диспетчер Один",
          user_status: "active",
          access_display_name: "Диспетчер Один access",
          account_type: isUpdated ? "business_owner" : "dispatcher",
          position_code: isUpdated ? "business_owner" : "dispatcher",
          position_display_name: isUpdated ? "Владелец бизнеса" : "Диспетчер",
          scope_kind: "organization",
          capabilities: JSON.stringify(isUpdated
            ? ["business.view_all_statistics"]
            : ["business.submit_dispatcher_forms"]),
          navigation_items: JSON.stringify(isUpdated
            ? ["business.overview"]
            : ["business.dispatcher_form"]),
          created_at: "2026-07-10T00:00:00.000Z",
        }], []];
      }

      return [[], []];
    },
  };
  const pool = {
    async getConnection() { return connection; },
  } as unknown as DatabasePool;
  const repository = createAccountsRepository(pool);

  const result = await repository.setAccountPosition({
    accessId: "access-dispatcher",
    position: "business_owner",
  });

  assert.equal(didCommit, true);
  assert.equal(result?.previous.position, "dispatcher");
  assert.equal(result?.updated.position, "business_owner");
  assert.deepEqual(
    queries.find((query) =>
      query.sql.startsWith("update account_accesses set account_type"),
    )?.params,
    [
      "business_owner",
      "business_owner",
      "organization",
      JSON.stringify(["business.view_all_statistics"]),
      JSON.stringify(["business.overview"]),
      "access-dispatcher",
    ],
  );
  assert.deepEqual(
    queries.find((query) =>
      query.sql.startsWith("delete from auth_sessions"),
    )?.params,
    ["user-dispatcher"],
  );
});

test("setAccountPosition rejects a target position with admin rights inside the lock", async () => {
  let didUpdate = false;
  let didRollback = false;
  const connection = {
    async beginTransaction() {},
    async commit() {},
    async rollback() { didRollback = true; },
    release() {},
    async query(sql: string) {
      const normalized = sql.replace(/\s+/g, " ").trim();
      if (normalized.startsWith("select accesses.id as access_id, accesses.user_id")) {
        return [[{ access_id: "access-worker", user_id: "user-worker" }], []];
      }
      if (normalized.startsWith("select users.status, greatest(")) {
        return [[{ status: "active", is_admin_protected: 0 }], []];
      }
      if (normalized.startsWith("select accesses.id as access_id")) {
        return [[{
          access_id: "access-worker",
          user_id: "user-worker",
          login: "worker",
          user_display_name: "Работник",
          user_status: "active",
          is_protected: 0,
          access_display_name: "Работник access",
          account_type: "worker",
          position_code: "worker",
          position_display_name: "Работник",
          scope_kind: "organization",
          capabilities: "[]",
          navigation_items: "[]",
          created_at: "2026-08-10T00:00:00.000Z",
        }], []];
      }
      if (normalized.startsWith("select positions.id, positions.display_name")) {
        return [[{
          id: "position-admin-manager",
          display_name: "Администратор подразделения",
          account_type: "business_owner",
          navigation_items: JSON.stringify(["admin.accounts"]),
          capabilities: JSON.stringify([
            "platform.manage_users",
            "platform.manage_access",
          ]),
          is_protected: 0,
          is_admin_protected: 1,
          created_at: "2026-08-10T00:00:00.000Z",
          usage_count: 1,
        }], []];
      }
      if (normalized.startsWith("update account_accesses")) {
        didUpdate = true;
      }
      return [[], []];
    },
  };
  const pool = {
    async getConnection() { return connection; },
  } as unknown as DatabasePool;

  await assert.rejects(
    createAccountsRepository(pool).setAccountPosition({
      accessId: "access-worker",
      position: "position-admin-manager",
    }),
    ProtectedPositionMutationError,
  );
  assert.equal(didUpdate, false);
  assert.equal(didRollback, true);
});

test("setAccountPosition keeps the system administrator position exclusive to admin", async () => {
  let didUpdate = false;
  const connection = {
    async beginTransaction() {},
    async commit() {},
    async rollback() {},
    release() {},
    async query(sql: string) {
      const normalized = sql.replace(/\s+/g, " ").trim();
      if (normalized.startsWith("select accesses.id as access_id, accesses.user_id")) {
        return [[{
          access_id: "access-worker",
          user_id: "user-worker",
          login: "worker",
        }], []];
      }
      if (normalized.startsWith("select users.status, greatest(")) {
        return [[{ status: "active", is_admin_protected: 0 }], []];
      }
      if (normalized.startsWith("select protected_positions.is_admin_protected")) {
        return [[], []];
      }
      if (normalized.startsWith("select accesses.id as access_id")) {
        return [[{
          access_id: "access-worker",
          user_id: "user-worker",
          login: "worker",
          user_display_name: "Работник",
          user_status: "active",
          is_protected: 0,
          is_protected_by_admin_rights: 0,
          access_display_name: "Работник access",
          account_type: "worker",
          position_code: "worker",
          position_display_name: "Работник",
          scope_kind: "organization",
          capabilities: "[]",
          navigation_items: "[]",
          created_at: "2026-08-10T00:00:00.000Z",
        }], []];
      }
      if (normalized.startsWith("select positions.id, positions.display_name")) {
        return [[{
          id: "administrator",
          display_name: "Администратор",
          account_type: "admin",
          navigation_items: JSON.stringify([
            "admin.accounts",
            "admin.account_preview",
            "admin.database",
            "admin.user_actions",
          ]),
          capabilities: JSON.stringify([
            "platform.manage_users",
            "platform.manage_access",
            "platform.manage_analytics_database",
          ]),
          is_protected: 1,
          is_admin_protected: 1,
          created_at: "2026-08-10T00:00:00.000Z",
          usage_count: 1,
        }], []];
      }
      if (normalized.startsWith("update account_accesses")) {
        didUpdate = true;
      }
      return [[], []];
    },
  };
  const pool = {
    async getConnection() { return connection; },
  } as unknown as DatabasePool;

  await assert.rejects(
    createAccountsRepository(pool).setAccountPosition({
      accessId: "access-worker",
      position: "administrator",
    }, true),
    SystemAdministratorPositionAssignmentError,
  );
  assert.equal(didUpdate, false);
});

test("setAccountPosition treats the locked current position as a no-op", async () => {
  const queries: string[] = [];
  const connection = {
    async beginTransaction() {},
    async commit() {},
    async rollback() {},
    release() {},
    async query(sql: string) {
      const normalized = sql.replace(/\s+/g, " ").trim();
      queries.push(normalized);

      if (normalized.startsWith("select accesses.id as access_id, accesses.user_id")) {
        return [[{
          access_id: "access-owner",
          user_id: "user-owner",
        }], []];
      }

      if (normalized.startsWith("select users.status, greatest(")) {
        return [[{ status: "active", is_admin_protected: 0 }], []];
      }

      if (normalized.startsWith("select accesses.id as access_id")) {
        return [[{
          access_id: "access-owner",
          user_id: "user-owner",
          login: "owner-1",
          user_display_name: "Владелец Один",
          user_status: "active",
          access_display_name: "Владелец Один access",
          account_type: "business_owner",
          position_code: "business_owner",
          position_display_name: "Владелец бизнеса",
          scope_kind: "organization",
          capabilities: JSON.stringify(["business.view_all_statistics"]),
          navigation_items: JSON.stringify(["business.overview"]),
          created_at: "2026-07-10T00:00:00.000Z",
        }], []];
      }

      return [[], []];
    },
  };
  const pool = {
    async getConnection() { return connection; },
  } as unknown as DatabasePool;

  const result = await createAccountsRepository(pool).setAccountPosition({
    accessId: "access-owner",
    position: "business_owner",
  });

  assert.equal(result?.previous.position, "business_owner");
  assert.equal(result?.updated.position, "business_owner");
  assert.equal(
    queries.some((sql) => sql.startsWith("update account_accesses")),
    false,
  );
  assert.equal(
    queries.some((sql) => sql.startsWith("delete from auth_sessions")),
    false,
  );
});

test("setAccountPosition creates organization scope when an administrator becomes dispatcher", async () => {
  const queries: Array<{ sql: string; params?: unknown[] }> = [];
  let accountReadCount = 0;
  const connection = {
    async beginTransaction() {},
    async commit() {},
    async rollback() {},
    release() {},
    async query(sql: string, params?: unknown[]) {
      const normalized = sql.replace(/\s+/g, " ").trim();
      queries.push({ sql: normalized, params });

      if (normalized.startsWith("select accesses.id as access_id, accesses.user_id")) {
        return [[{
          access_id: "access-admin",
          user_id: "user-admin",
        }], []];
      }

      if (normalized.startsWith("select users.status, greatest(")) {
        return [[{ status: "active", is_admin_protected: 0 }], []];
      }

      if (normalized.startsWith("select positions.id, positions.display_name")) {
        return [[{
          id: "dispatcher",
          display_name: "Диспетчер",
          account_type: "dispatcher",
          navigation_items: JSON.stringify(["business.dispatcher_form"]),
          capabilities: JSON.stringify(["business.submit_dispatcher_forms"]),
          is_protected: 1,
          created_at: "2026-07-12T00:00:00.000Z",
          usage_count: 1,
        }], []];
      }

      if (normalized.startsWith("select accesses.id as access_id") && normalized.includes("where accesses.id")) {
        const isUpdated = accountReadCount > 0;
        accountReadCount += 1;
        return [[{
          access_id: "access-admin",
          user_id: "user-admin",
          login: "dispatcher-new",
          user_display_name: "Новый диспетчер",
          user_status: "active",
          access_display_name: "Новый диспетчер access",
          account_type: isUpdated ? "dispatcher" : "admin",
          position_code: isUpdated ? "dispatcher" : "admin",
          position_display_name: isUpdated ? "Диспетчер" : "Администратор",
          scope_kind: isUpdated ? "organization" : "platform",
          capabilities: JSON.stringify(isUpdated
            ? ["business.submit_dispatcher_forms"]
            : ["platform.manage_access"]),
          navigation_items: JSON.stringify(isUpdated
            ? ["business.dispatcher_form"]
            : ["admin.accounts"]),
          created_at: "2026-07-10T00:00:00.000Z",
        }], []];
      }

      return [[], []];
    },
  };
  const pool = {
    async getConnection() { return connection; },
  } as unknown as DatabasePool;

  const result = await createAccountsRepository(pool).setAccountPosition({
    accessId: "access-admin",
    position: "dispatcher",
  });

  assert.deepEqual(result?.updated.scope, { kind: "organization" });
  assert.equal(
    queries.some((query) => query.sql.startsWith("insert into business_accounts")),
    false,
  );
  assert.equal(
    queries.some((query) => query.sql.startsWith("insert into departments")),
    false,
  );
});

test("deletePosition deletes only an unused custom position", async () => {
  const queries: Array<{ sql: string; params?: unknown[] }> = [];
  let didCommit = false;
  const connection = {
    async beginTransaction() {},
    async commit() { didCommit = true; },
    async rollback() {},
    release() {},
    async query(sql: string, params?: unknown[]) {
      const normalized = sql.replace(/\s+/g, " ").trim();
      queries.push({ sql: normalized, params });
      if (normalized.startsWith("select positions.account_type")) {
        return [[{ account_type: "worker", is_protected: 0, usage_count: 0 }], []];
      }
      return [[], []];
    },
  };
  const pool = { async getConnection() { return connection; } } as unknown as DatabasePool;

  const result = await createAccountsRepository(pool).deletePosition("position-unused");

  assert.equal(result, "deleted");
  assert.equal(didCommit, true);
  assert.deepEqual(
    queries.find((query) => query.sql.startsWith("delete from account_positions"))?.params,
    ["position-unused"],
  );
});

test("deletePosition rejects a protected position for a delegated manager inside the lock", async () => {
  let didDelete = false;
  let didRollback = false;
  const connection = {
    async beginTransaction() {},
    async commit() {},
    async rollback() { didRollback = true; },
    release() {},
    async query(sql: string) {
      const normalized = sql.replace(/\s+/g, " ").trim();
      if (normalized.startsWith("select positions.account_type")) {
        return [[{
          account_type: "business_owner",
          is_admin_protected: 1,
          usage_count: 0,
        }], []];
      }
      if (normalized.startsWith("delete from account_positions")) didDelete = true;
      return [[], []];
    },
  };
  const pool = {
    async getConnection() { return connection; },
  } as unknown as DatabasePool;

  await assert.rejects(
    createAccountsRepository(pool).deletePosition("position-protected", false),
    ProtectedPositionMutationError,
  );
  assert.equal(didDelete, false);
  assert.equal(didRollback, true);
});

test("deletePosition deletes an unused program-created non-admin position", async () => {
  let didDelete = false;
  const connection = {
    async beginTransaction() {},
    async commit() {},
    async rollback() {},
    release() {},
    async query(sql: string) {
      const normalized = sql.replace(/\s+/g, " ").trim();
      if (normalized.startsWith("select positions.account_type")) {
        return [[{
          account_type: "business_owner",
          is_protected: 1,
          usage_count: 0,
        }], []];
      }
      if (normalized.startsWith("delete from account_positions")) {
        didDelete = true;
      }
      return [[], []];
    },
  };
  const pool = { async getConnection() { return connection; } } as unknown as DatabasePool;

  const result = await createAccountsRepository(pool).deletePosition(
    "board_assignment_reviewer",
  );

  assert.equal(result, "deleted");
  assert.equal(didDelete, true);
});

test("deletePosition keeps the administrator system position", async () => {
  let didDelete = false;
  const connection = {
    async beginTransaction() {},
    async commit() {},
    async rollback() {},
    release() {},
    async query(sql: string) {
      const normalized = sql.replace(/\s+/g, " ").trim();
      if (normalized.startsWith("select positions.account_type")) {
        return [[{ account_type: "admin", is_protected: 1, usage_count: 0 }], []];
      }
      if (normalized.startsWith("delete from account_positions")) {
        didDelete = true;
      }
      return [[], []];
    },
  };
  const pool = { async getConnection() { return connection; } } as unknown as DatabasePool;

  const result = await createAccountsRepository(pool).deletePosition("administrator");

  assert.equal(result, "protected");
  assert.equal(didDelete, false);
});

test("deletePosition keeps an assigned program-created position", async () => {
  let didDelete = false;
  const connection = {
    async beginTransaction() {},
    async commit() {},
    async rollback() {},
    release() {},
    async query(sql: string) {
      const normalized = sql.replace(/\s+/g, " ").trim();
      if (normalized.startsWith("select positions.account_type")) {
        return [[{
          account_type: "business_owner",
          is_protected: 1,
          usage_count: 1,
        }], []];
      }
      if (normalized.startsWith("delete from account_positions")) {
        didDelete = true;
      }
      return [[], []];
    },
  };
  const pool = { async getConnection() { return connection; } } as unknown as DatabasePool;

  const result = await createAccountsRepository(pool).deletePosition(
    "board_assignment_reviewer",
  );

  assert.equal(result, "in_use");
  assert.equal(didDelete, false);
});

test("deletePosition keeps a position assigned to accounts", async () => {
  let didDelete = false;
  const connection = {
    async beginTransaction() {}, async commit() {}, async rollback() {}, release() {},
    async query(sql: string) {
      const normalized = sql.replace(/\s+/g, " ").trim();
      if (normalized.startsWith("select positions.account_type")) {
        return [[{ account_type: "worker", is_protected: 0, usage_count: 2 }], []];
      }
      if (normalized.startsWith("delete from account_positions")) didDelete = true;
      return [[], []];
    },
  };
  const pool = { async getConnection() { return connection; } } as unknown as DatabasePool;

  const result = await createAccountsRepository(pool).deletePosition("position-used");

  assert.equal(result, "in_use");
  assert.equal(didDelete, false);
});

test("createAccount generates worker ids and commits all rows together", async () => {
  const ids = ["worker-user-id", "worker-access-id"];
  const database = buildFakeDatabase({
    accountRow: {
      access_id: "worker-access-id",
      user_id: "worker-user-id",
      login: "worker-1",
      user_display_name: "Работник Один",
      email: "worker@example.com",
      max_user_id: "101",
      user_status: "active",
      is_protected: 0,
      access_display_name: "Работник Один access",
      account_type: "worker",
      scope_kind: "organization",
      capabilities: JSON.stringify(["business.submit_forms"]),
      created_at: "2026-07-11T00:00:00.000Z",
    },
  });
  const repository = createAccountsRepository(database.pool, {
    createId: () => {
      const id = ids.shift();

      if (id === undefined) {
        throw new Error("Unexpected ID request.");
      }

      return id;
    },
  });

  const account = await repository.createAccount({
    login: "worker-1",
    password: "supersecret1",
    displayName: "Работник Один",
    email: "worker@example.com",
    maxUserId: "101",
    accountType: "worker",
    capabilities: ["business.submit_forms"],
  });

  assert.equal(database.didBegin, true);
  assert.equal(database.didCommit, true);
  assert.equal(database.didRollback, false);
  assert.equal(database.didRelease, true);
  assert.equal(ids.length, 0);
  assert.deepEqual(account.scope, { kind: "organization" });
  assert.equal(account.email, "worker@example.com");
  assert.equal(account.maxUserId, "101");
  const userInsert = database.queries.find((query) =>
    query.sql.includes("insert into app_users"),
  );
  const accessInsert = database.queries.find((query) =>
    query.sql.includes("insert into account_accesses"),
  );

  assert.deepEqual(userInsert?.params, [
    "worker-user-id",
    "worker-1",
    "Работник Один",
    "worker@example.com",
    "101",
  ]);
  assert.equal(userInsert?.sql.includes("on duplicate key update"), false);
  assert.deepEqual(accessInsert?.params?.slice(0, 6), [
    "worker-access-id",
    "worker-user-id",
    "worker",
    "worker",
    "Работник Один access",
    "organization",
  ]);
  assert.equal(accessInsert?.sql.includes("on duplicate key update"), false);
});

test("createAccount rejects an existing login before changing related rows", async () => {
  let didCreateId = false;
  const database = buildFakeDatabase({ existingUserId: "existing-user" });
  const repository = createAccountsRepository(database.pool, {
    createId: () => {
      didCreateId = true;
      return "unused";
    },
  });

  await assert.rejects(
    repository.createAccount({
      login: "shared-login",
      password: "supersecret1",
      displayName: "Другой пользователь",
      accountType: "dispatcher",
      capabilities: ["business.submit_dispatcher_forms"],
    }),
    AccountLoginAlreadyExistsError,
  );

  assert.equal(didCreateId, false);
  assert.equal(database.didCommit, false);
  assert.equal(database.didRollback, true);
  assert.equal(database.didRelease, true);
  assert.equal(
    database.queries.some((query) => query.sql.includes("insert into")),
    false,
  );
});

test("createAccount rejects a position with admin rights inside the lock", async () => {
  let didInsert = false;
  const ids = ["new-user", "new-access"];
  const connection = {
    async beginTransaction() {},
    async commit() {},
    async rollback() {},
    release() {},
    async query(sql: string) {
      const normalized = sql.replace(/\s+/g, " ").trim();
      if (normalized.startsWith("select id from app_users")) {
        return [[], []];
      }
      if (normalized.startsWith("select positions.id, positions.display_name")) {
        return [[{
          id: "position-admin-manager",
          display_name: "Администратор подразделения",
          account_type: "business_owner",
          navigation_items: JSON.stringify(["admin.accounts"]),
          capabilities: JSON.stringify([
            "platform.manage_users",
            "platform.manage_access",
          ]),
          is_protected: 0,
          is_admin_protected: 1,
          created_at: "2026-08-10T00:00:00.000Z",
          usage_count: 0,
        }], []];
      }
      if (normalized.startsWith("insert into")) {
        didInsert = true;
      }
      if (normalized.startsWith("select accesses.id as access_id")) {
        return [[{
          access_id: "new-access",
          user_id: "new-user",
          login: "new-admin",
          user_display_name: "Новый администратор",
          user_status: "active",
          is_protected: 1,
          access_display_name: "Новый администратор access",
          account_type: "business_owner",
          position_code: "position-admin-manager",
          position_display_name: "Администратор подразделения",
          scope_kind: "organization",
          capabilities: JSON.stringify([
            "platform.manage_users",
            "platform.manage_access",
          ]),
          navigation_items: JSON.stringify(["admin.accounts"]),
          created_at: "2026-08-10T00:00:00.000Z",
        }], []];
      }
      return [[], []];
    },
  };
  const pool = {
    async getConnection() { return connection; },
  } as unknown as DatabasePool;

  await assert.rejects(
    createAccountsRepository(pool, {
      createId: () => ids.shift() ?? "unexpected-id",
    }).createAccount({
      login: "new-admin",
      password: "supersecret1",
      displayName: "Новый администратор",
      accountType: "business_owner",
      position: "position-admin-manager",
      capabilities: ["platform.manage_users", "platform.manage_access"],
      navigationItems: ["admin.accounts"],
    }),
    ProtectedPositionMutationError,
  );
  assert.equal(didInsert, false);
});

test("createAccount keeps the system administrator position exclusive to admin", async () => {
  let didInsert = false;
  const connection = {
    async beginTransaction() {},
    async commit() {},
    async rollback() {},
    release() {},
    async query(sql: string) {
      const normalized = sql.replace(/\s+/g, " ").trim();
      if (normalized.startsWith("select id from app_users")) {
        return [[], []];
      }
      if (normalized.startsWith("select positions.id, positions.display_name")) {
        return [[{
          id: "administrator",
          display_name: "Администратор",
          account_type: "admin",
          navigation_items: JSON.stringify([
            "admin.accounts",
            "admin.account_preview",
            "admin.database",
            "admin.user_actions",
          ]),
          capabilities: JSON.stringify([
            "platform.manage_users",
            "platform.manage_access",
            "platform.manage_analytics_database",
          ]),
          is_protected: 1,
          is_admin_protected: 1,
          created_at: "2026-08-10T00:00:00.000Z",
          usage_count: 1,
        }], []];
      }
      if (normalized.startsWith("insert into")) {
        didInsert = true;
      }
      return [[], []];
    },
  };
  const pool = {
    async getConnection() { return connection; },
  } as unknown as DatabasePool;

  await assert.rejects(
    createAccountsRepository(pool).createAccount({
      login: "new-admin",
      password: "supersecret1",
      displayName: "Новый администратор",
      accountType: "admin",
      position: "administrator",
      capabilities: ["platform.manage_users", "platform.manage_access"],
      navigationItems: ["admin.accounts"],
    }, true),
    SystemAdministratorPositionAssignmentError,
  );
  assert.equal(didInsert, false);
});

test("createAccount rolls back partial provisioning when a write fails", async () => {
  const ids = ["owner-user-id"];
  const database = buildFakeDatabase({ failOn: "auth_password_credentials" });
  const repository = createAccountsRepository(database.pool, {
    createId: () => ids.shift() ?? "unexpected-id",
  });

  await assert.rejects(
    repository.createAccount({
      login: "owner-1",
      password: "supersecret1",
      displayName: "Владелец Один",
      accountType: "business_owner",
      capabilities: ["business.view_all_statistics"],
    }),
    /simulated database failure/,
  );

  assert.equal(database.didCommit, false);
  assert.equal(database.didRollback, true);
  assert.equal(database.didRelease, true);
  assert.equal(
    database.queries.some((query) =>
      query.sql.includes("insert into business_accounts"),
    ),
    false,
  );
  assert.equal(
    database.queries.some((query) => query.sql.includes("insert into app_users")),
    true,
  );
});

test("setAccountLoginEnabled suspends login and deletes existing sessions", async () => {
  const database = buildFakeDatabase({ userStatus: "active" });
  const repository = createAccountsRepository(database.pool);

  const result = await repository.setAccountLoginEnabled({
    userId: "dispatcher-user-id",
    isEnabled: false,
  });

  assert.deepEqual(result, {
    userId: "dispatcher-user-id",
    userStatus: "suspended",
  });
  assert.equal(database.didBegin, true);
  assert.equal(database.didCommit, true);
  assert.equal(database.didRollback, false);
  assert.equal(database.didRelease, true);
  assert.deepEqual(
    database.queries.find((query) =>
      query.sql.startsWith("update app_users set status"),
    )?.params,
    ["suspended", "dispatcher-user-id"],
  );
  assert.deepEqual(
    database.queries.find((query) =>
      query.sql.startsWith("delete from auth_sessions"),
    )?.params,
    ["dispatcher-user-id"],
  );
});

test("setAccountLoginEnabled locks and rejects an account protected by admin rights", async () => {
  const database = buildFakeDatabase({
    userStatus: "active",
    hasAdminRightsAccess: true,
  });
  const repository = createAccountsRepository(database.pool);

  await assert.rejects(
    repository.setAccountLoginEnabled({
      userId: "protected-user-id",
      isEnabled: false,
    }),
    ProtectedAccountMutationError,
  );

  assert.equal(database.didCommit, false);
  assert.equal(database.didRollback, true);
  assert.match(
    database.queries[1]?.sql ?? "",
    /select protected_positions\.is_admin_protected.*protected_accesses\.is_active = 1.*for update/u,
  );
  assert.equal(
    database.queries.some((query) =>
      query.sql.startsWith("update app_users set status"),
    ),
    false,
  );
});

test("setAccountLoginEnabled lets original admin change a protected account", async () => {
  const database = buildFakeDatabase({
    userStatus: "active",
    isProtected: true,
  });
  const repository = createAccountsRepository(database.pool);

  const result = await repository.setAccountLoginEnabled(
    { userId: "protected-user-id", isEnabled: false },
    true,
  );

  assert.deepEqual(result, {
    userId: "protected-user-id",
    userStatus: "suspended",
  });
  assert.equal(database.didCommit, true);
});

test("deleteAccount archives identity, disables accesses, and revokes sessions", async () => {
  const database = buildFakeDatabase({ userStatus: "active" });
  const repository = createAccountsRepository(database.pool);

  const result = await repository.deleteAccount("worker-user-id");

  assert.equal(result, true);
  assert.equal(database.didCommit, true);
  assert.deepEqual(
    database.queries.find((query) => query.sql.startsWith("update app_users set status = 'archived'"))?.params,
    ["worker-user-id"],
  );
  assert.deepEqual(
    database.queries.find((query) => query.sql.startsWith("update account_accesses set is_active = 0"))?.params,
    ["worker-user-id"],
  );
  assert.deepEqual(
    database.queries.find((query) => query.sql.startsWith("delete from auth_sessions"))?.params,
    ["worker-user-id"],
  );
});

test("setAccountLoginEnabled enables login without reviving old sessions", async () => {
  const database = buildFakeDatabase({ userStatus: "suspended" });
  const repository = createAccountsRepository(database.pool);

  const result = await repository.setAccountLoginEnabled({
    userId: "dispatcher-user-id",
    isEnabled: true,
  });

  assert.deepEqual(result, {
    userId: "dispatcher-user-id",
    userStatus: "active",
  });
  assert.deepEqual(
    database.queries.find((query) =>
      query.sql.startsWith("update app_users set status"),
    )?.params,
    ["active", "dispatcher-user-id"],
  );
  assert.equal(
    database.queries.some((query) =>
      query.sql.startsWith("delete from auth_sessions"),
    ),
    false,
  );
});

test("setAccountLoginEnabled returns undefined for a missing user", async () => {
  const database = buildFakeDatabase();
  const repository = createAccountsRepository(database.pool);

  const result = await repository.setAccountLoginEnabled({
    userId: "missing-user-id",
    isEnabled: false,
  });

  assert.equal(result, undefined);
  assert.equal(database.didCommit, false);
  assert.equal(database.didRollback, true);
  assert.equal(database.didRelease, true);
  assert.equal(
    database.queries.some((query) =>
      query.sql.startsWith("update app_users set status"),
    ),
    false,
  );
});

test("setAccountLoginEnabled rejects archived users without changing them", async () => {
  const database = buildFakeDatabase({ userStatus: "archived" });
  const repository = createAccountsRepository(database.pool);

  await assert.rejects(
    repository.setAccountLoginEnabled({
      userId: "archived-user-id",
      isEnabled: true,
    }),
    ArchivedAccountLoginStatusError,
  );

  assert.equal(database.didCommit, false);
  assert.equal(database.didRollback, true);
  assert.equal(database.didRelease, true);
  assert.equal(
    database.queries.some((query) =>
      query.sql.startsWith("update app_users set status"),
    ),
    false,
  );
});

test("setAccountLoginEnabled rolls back when session revocation fails", async () => {
  const database = buildFakeDatabase({
    userStatus: "active",
    failOn: "delete from auth_sessions",
  });
  const repository = createAccountsRepository(database.pool);

  await assert.rejects(
    repository.setAccountLoginEnabled({
      userId: "dispatcher-user-id",
      isEnabled: false,
    }),
    /simulated database failure/,
  );

  assert.equal(database.didCommit, false);
  assert.equal(database.didRollback, true);
  assert.equal(database.didRelease, true);
});

type FakeAccountRow = {
  access_id: string;
  user_id: string;
  login: string;
  user_display_name: string;
  email?: string | null;
  max_user_id?: string | null;
  user_status: string;
  is_protected: number | boolean;
  access_display_name: string;
  account_type: string;
  scope_kind: string;
  capabilities: unknown;
  created_at: string;
};

function buildFakeDatabase({
  existingUserId,
  accountRow,
  failOn,
  isProtected = false,
  hasAdminRightsAccess = false,
  userStatus,
}: {
  existingUserId?: string;
  accountRow?: FakeAccountRow;
  failOn?: string;
  isProtected?: boolean;
  hasAdminRightsAccess?: boolean;
  userStatus?: string;
} = {}) {
  const state = {
    didBegin: false,
    didCommit: false,
    didRollback: false,
    didRelease: false,
    queries: [] as Array<{ sql: string; params?: unknown[] }>,
  };
  const connection = {
    async beginTransaction() {
      state.didBegin = true;
    },
    async commit() {
      state.didCommit = true;
    },
    async rollback() {
      state.didRollback = true;
    },
    release() {
      state.didRelease = true;
    },
    async query(sql: string, params?: unknown[]) {
      const normalized = sql.replace(/\s+/g, " ").trim();

      state.queries.push({ sql: normalized, params });

      if (failOn !== undefined && normalized.includes(failOn)) {
        throw new Error("simulated database failure");
      }

      if (normalized.startsWith("select id from app_users")) {
        return [existingUserId === undefined ? [] : [{ id: existingUserId }], []];
      }

      if (normalized.startsWith("select positions.id, positions.display_name")) {
        const positionId = String(params?.[0] ?? "worker");
        const accountType =
          positionId === "business_owner" ? "business_owner" :
            positionId === "dispatcher" ? "dispatcher" : "worker";
        const navigationItems =
          accountType === "business_owner" ? ["business.overview"] :
            accountType === "dispatcher" ? ["business.dispatcher_form"] : [];
        const capabilities =
          accountType === "business_owner" ? ["business.view_all_statistics"] :
            accountType === "dispatcher"
              ? ["business.submit_dispatcher_forms"]
              : ["business.submit_forms"];
        return [[{
          id: positionId,
          display_name: positionId,
          account_type: accountType,
          navigation_items: JSON.stringify(navigationItems),
          capabilities: JSON.stringify(capabilities),
          is_protected: 0,
          is_admin_protected: 0,
          created_at: "2026-08-10T00:00:00.000Z",
          usage_count: 0,
        }], []];
      }

      if (
        normalized.startsWith("select status, is_admin_protected from app_users") ||
        normalized.startsWith("select users.status, greatest(")
      ) {
        return [
          userStatus === undefined
            ? []
            : [{ status: userStatus, is_admin_protected: isProtected ? 1 : 0 }],
          [],
        ];
      }

      if (normalized.startsWith("select protected_positions.is_admin_protected")) {
        return [
          hasAdminRightsAccess ? [{ is_admin_protected: 1 }] : [],
          [],
        ];
      }

      if (
        normalized.startsWith("select accesses.id as access_id") &&
        accountRow !== undefined
      ) {
        return [[accountRow], []];
      }

      return [[], []];
    },
  };
  const pool = {
    async getConnection() {
      return connection;
    },
  } as unknown as DatabasePool;

  return {
    pool,
    get didBegin() {
      return state.didBegin;
    },
    get didCommit() {
      return state.didCommit;
    },
    get didRollback() {
      return state.didRollback;
    },
    get didRelease() {
      return state.didRelease;
    },
    queries: state.queries,
  };
}
