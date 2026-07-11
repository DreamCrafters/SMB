import assert from "node:assert/strict";
import test from "node:test";
import type { DatabasePool } from "../db/pool.js";
import {
  ArchivedAccountLoginStatusError,
  AccountLoginAlreadyExistsError,
  createAccountsRepository,
} from "./accountsRepository.js";

test("createAccount generates worker ids and commits all rows together", async () => {
  const ids = ["worker-department-id", "worker-user-id", "worker-access-id"];
  const database = buildFakeDatabase({
    accountRow: {
      access_id: "worker-access-id",
      user_id: "worker-user-id",
      login: "worker-1",
      user_display_name: "Работник Один",
      user_status: "active",
      access_display_name: "Работник Один access",
      account_type: "worker",
      scope_kind: "department",
      business_account_id: "prod-business",
      business_display_name: "Основной бизнес",
      department_id: "worker-department-id",
      department_display_name: "Работник Один",
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
  assert.deepEqual(account.scope, {
    kind: "department",
    businessAccountId: "prod-business",
    departmentId: "worker-department-id",
  });

  const businessInsert = database.queries.find((query) =>
    query.sql.includes("insert into business_accounts"),
  );
  const departmentInsert = database.queries.find((query) =>
    query.sql.includes("insert into departments"),
  );
  const userInsert = database.queries.find((query) =>
    query.sql.includes("insert into app_users"),
  );
  const accessInsert = database.queries.find((query) =>
    query.sql.includes("insert into account_accesses"),
  );

  assert.deepEqual(businessInsert?.params, ["prod-business", "Основной бизнес"]);
  assert.deepEqual(departmentInsert?.params, [
    "worker-department-id",
    "prod-business",
    "Работник Один",
  ]);
  assert.deepEqual(userInsert?.params, [
    "worker-user-id",
    "worker-1",
    "Работник Один",
  ]);
  assert.equal(userInsert?.sql.includes("on duplicate key update"), false);
  assert.deepEqual(accessInsert?.params?.slice(0, 7), [
    "worker-access-id",
    "worker-user-id",
    "worker",
    "Работник Один access",
    "department",
    "prod-business",
    "worker-department-id",
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
    true,
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
  business_account_id: string | null;
  business_display_name: string | null;
  department_id: string | null;
  department_display_name: string | null;
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
