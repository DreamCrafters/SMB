import assert from "node:assert/strict";
import test from "node:test";
import type { PoolConnection } from "mysql2/promise";
import type { DatabasePool } from "./pool.js";
import {
  createSnapshotStore,
  createProductionDatabaseSnapshotServiceFromStores,
  ProductionSnapshotRestoreError,
  ProductionSnapshotSchemaMismatchError,
  type DatabaseSnapshot,
  type DatabaseSnapshotStore,
} from "./productionSnapshot.js";

function buildSnapshot({
  businessValue,
  sessionRows = [["session-id"]],
  includeDeliveryClaims = false,
  migrationId = "001_initial",
}: {
  businessValue: string;
  sessionRows?: unknown[][];
  includeDeliveryClaims?: boolean;
  migrationId?: string;
}): DatabaseSnapshot {
  return {
    tables: [
      {
        name: "auth_sessions",
        createSql: "create table `auth_sessions` (`id` varchar(64)) engine=InnoDB",
        columns: ["id"],
        rows: sessionRows,
      },
      ...(includeDeliveryClaims
        ? [{
            name: "auth_session_notification_deliveries",
            createSql: "create table `auth_session_notification_deliveries` (`session_id` varchar(64)) engine=InnoDB",
            columns: ["session_id"],
            rows: [["session-id"]],
          }]
        : []),
      {
        name: "business_data",
        createSql: "create table `business_data` (`value` varchar(255)) engine=InnoDB",
        columns: ["value"],
        rows: [[businessValue]],
      },
      {
        name: "schema_migrations",
        createSql: "create table `schema_migrations` (`id` varchar(120)) engine=InnoDB",
        columns: ["id"],
        rows: [[migrationId]],
      },
    ],
  };
}

test("production snapshot replaces all test data and clears copied auth sessions", async () => {
  const production = buildSnapshot({
    businessValue: "production",
    includeDeliveryClaims: true,
  });
  const testBackup = buildSnapshot({
    businessValue: "test",
    includeDeliveryClaims: true,
  });
  const replacements: DatabaseSnapshot[] = [];
  const source: DatabaseSnapshotStore = {
    async capture() { return production; },
    async replaceAtomically() { throw new Error("source is read-only"); },
  };
  const target: DatabaseSnapshotStore = {
    async capture() { return testBackup; },
    async replaceAtomically(snapshot) { replacements.push(snapshot); },
  };
  const service = createProductionDatabaseSnapshotServiceFromStores({
    source,
    target,
  });

  const result = await service.replaceTestDatabase();

  assert.equal(replacements.length, 1);
  assert.deepEqual(
    replacements[0]?.tables.find((table) => table.name === "auth_sessions")?.rows,
    [],
  );
  assert.deepEqual(
    replacements[0]?.tables.find(
      (table) => table.name === "auth_session_notification_deliveries",
    )?.rows,
    [],
  );
  assert.deepEqual(result, {
    tableCount: 4,
    rowCount: 2,
    authSessionsCleared: true,
  });
  assert.equal(service.isRunning(), false);
});

test("production snapshot reports an atomically rolled back replacement failure", async () => {
  const production = buildSnapshot({ businessValue: "production" });
  const testBackup = buildSnapshot({ businessValue: "test" });
  let replacementCalls = 0;
  const source = buildReadOnlyStore(production);
  const target: DatabaseSnapshotStore = {
    async capture() { return testBackup; },
    async replaceAtomically() {
      replacementCalls += 1;
      throw new Error("replacement failed");
    },
  };
  const service = createProductionDatabaseSnapshotServiceFromStores({
    source,
    target,
  });

  await assert.rejects(
    service.replaceTestDatabase(),
    ProductionSnapshotRestoreError,
  );
  assert.equal(replacementCalls, 1);
  assert.equal(service.isRunning(), false);
});

test("production snapshot refuses replacement when migration histories differ", async () => {
  const production = buildSnapshot({
    businessValue: "production",
    migrationId: "002_current",
  });
  const testBackup = buildSnapshot({
    businessValue: "test",
    migrationId: "001_old",
  });
  let restoreCalls = 0;
  const target: DatabaseSnapshotStore = {
    async capture() { return testBackup; },
    async replaceAtomically() { restoreCalls += 1; },
  };
  const service = createProductionDatabaseSnapshotServiceFromStores({
    source: buildReadOnlyStore(production),
    target,
  });

  await assert.rejects(
    service.replaceTestDatabase(),
    ProductionSnapshotSchemaMismatchError,
  );
  assert.equal(restoreCalls, 0);
});

function buildReadOnlyStore(snapshot: DatabaseSnapshot): DatabaseSnapshotStore {
  return {
    async capture() { return snapshot; },
    async replaceAtomically() { throw new Error("source is read-only"); },
  };
}

test("snapshot store replaces rows in one transaction without dropping schema", async () => {
  const snapshot = buildSnapshot({
    businessValue: "production",
    sessionRows: [],
  });
  const calls: string[] = [];
  const connection = buildAtomicReplacementConnection(snapshot, calls);
  const pool = {
    async getConnection() { return connection; },
  } as unknown as DatabasePool;

  await createSnapshotStore(pool).replaceAtomically(snapshot);

  assert.equal(calls[0], "begin");
  assert.ok(calls.includes("commit"));
  assert.ok(calls.includes("set foreign_key_checks = 1"));
  assert.equal(calls.includes("rollback"), false);
  assert.equal(calls.some((call) => /\b(?:drop|create)\b/iu.test(call)), false);
  assert.equal(calls.at(-1), "release");
});

test("snapshot store rolls back when a row cannot be inserted", async () => {
  const snapshot = buildSnapshot({ businessValue: "production" });
  const calls: string[] = [];
  const connection = buildAtomicReplacementConnection(
    snapshot,
    calls,
    "insert into `business_data`",
  );
  const pool = {
    async getConnection() { return connection; },
  } as unknown as DatabasePool;

  await assert.rejects(
    createSnapshotStore(pool).replaceAtomically(snapshot),
    /insert failed/u,
  );

  assert.ok(calls.includes("rollback"));
  assert.equal(calls.includes("commit"), false);
  assert.ok(calls.includes("set foreign_key_checks = 1"));
  assert.equal(calls.at(-1), "release");
});

test("snapshot store captures exact rows in one consistent read", async () => {
  const calls: string[] = [];
  const connection = {
    async query(sql: string) {
      const normalizedSql = sql.replace(/\s+/gu, " ").trim();
      calls.push(normalizedSql);

      if (normalizedSql.includes("from information_schema.triggers")) {
        return [[], []];
      }
      if (normalizedSql.includes("from information_schema.tables")) {
        return [[{
          tableName: "schema_migrations",
          tableType: "BASE TABLE",
        }], []];
      }
      if (normalizedSql === "show create table `schema_migrations`") {
        return [[{
          "Create Table": "create table `schema_migrations` (`id` varchar(120)) engine=InnoDB",
        }], []];
      }
      if (normalizedSql === "select * from `schema_migrations`") {
        return [[{ id: "001_initial" }], [{ name: "id" }]];
      }

      return [[], []];
    },
    async commit() { calls.push("commit"); },
    async rollback() { calls.push("rollback"); },
    release() { calls.push("release"); },
  } as unknown as PoolConnection;
  const pool = {
    async getConnection() { return connection; },
  } as unknown as DatabasePool;

  const snapshot = await createSnapshotStore(pool).capture();

  assert.deepEqual(snapshot.tables[0]?.columns, ["id"]);
  assert.deepEqual(snapshot.tables[0]?.rows, [["001_initial"]]);
  assert.ok(calls.includes("start transaction with consistent snapshot"));
  assert.ok(calls.includes("commit"));
  assert.equal(calls.includes("rollback"), false);
  assert.equal(calls.at(-1), "release");
});

function buildAtomicReplacementConnection(
  snapshot: DatabaseSnapshot,
  calls: string[],
  failSqlPrefix?: string,
) {
  return {
    async beginTransaction() { calls.push("begin"); },
    async query(sql: string) {
      const normalizedSql = sql.replace(/\s+/gu, " ").trim();
      calls.push(normalizedSql);

      if (failSqlPrefix !== undefined && normalizedSql.startsWith(failSqlPrefix)) {
        throw new Error("insert failed");
      }

      if (normalizedSql.includes("from information_schema.tables")) {
        return [
          snapshot.tables.map((table) => ({
            tableName: table.name,
            tableType: "BASE TABLE",
          })),
          [],
        ];
      }

      const countedTable = snapshot.tables.find((table) =>
        normalizedSql === `select count(*) as rowCount from \`${table.name}\``
      );

      if (countedTable !== undefined) {
        return [[{ rowCount: countedTable.rows.length }], []];
      }

      return [[], []];
    },
    async commit() { calls.push("commit"); },
    async rollback() { calls.push("rollback"); },
    release() { calls.push("release"); },
  } as unknown as PoolConnection;
}
