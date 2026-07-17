import assert from "node:assert/strict";
import test from "node:test";
import type { DatabasePool } from "../db/pool.js";
import {
  ArchivedAccountLoginStatusError,
  AccountLoginAlreadyExistsError,
  createAccountsRepository,
} from "./accountsRepository.js";

test("listAccounts groups equal positions and sorts names within each group", async () => {
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
    /order by positions\.display_name asc, users\.display_name asc/,
  );
});

test("updatePosition keeps linked accounts in organization scope", async () => {
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
    accountType: "dispatcher",
    navigationItems: ["business.dispatcher_form"],
    capabilities: ["business.submit_dispatcher_forms", "business.view_dispatcher_feed"],
  });

  assert.equal(didCommit, true);
  assert.equal(result?.accountType, "dispatcher");
  assert.deepEqual(
    queries.find((query) => query.sql.startsWith("update account_accesses set account_type"))?.params,
    ["dispatcher", "position-manager"],
  );
  assert.deepEqual(
    queries.find((query) => query.sql.startsWith("update account_positions set display_name"))?.params?.slice(0, 2),
    ["Диспетчер участка", "dispatcher"],
  );
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
      if (normalized.startsWith("select positions.is_protected")) {
        return [[{ is_protected: 0, usage_count: 0 }], []];
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

test("deletePosition keeps a position assigned to accounts", async () => {
  let didDelete = false;
  const connection = {
    async beginTransaction() {}, async commit() {}, async rollback() {}, release() {},
    async query(sql: string) {
      const normalized = sql.replace(/\s+/g, " ").trim();
      if (normalized.startsWith("select positions.is_protected")) {
        return [[{ is_protected: 0, usage_count: 2 }], []];
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
      user_status: "active",
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
    accountType: "worker",
    capabilities: ["business.submit_forms"],
  });

  assert.equal(database.didBegin, true);
  assert.equal(database.didCommit, true);
  assert.equal(database.didRollback, false);
  assert.equal(database.didRelease, true);
  assert.equal(ids.length, 0);
  assert.deepEqual(account.scope, { kind: "organization" });
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
  user_status: string;
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
  userStatus,
}: {
  existingUserId?: string;
  accountRow?: FakeAccountRow;
  failOn?: string;
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

      if (normalized.startsWith("select status from app_users")) {
        return [userStatus === undefined ? [] : [{ status: userStatus }], []];
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
