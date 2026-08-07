import assert from "node:assert/strict";
import test from "node:test";
import type { PoolConnection } from "mysql2/promise";
import type { DatabasePool } from "./pool.js";
import {
  acquireDatabaseMutationLock,
  createDatabaseTransactionContext,
  runWithDatabaseMutationLock,
} from "./transactionContext.js";

test("database transaction context commits repository and audit writes together", async () => {
  const calls: string[] = [];
  const connection = buildConnection(calls);
  const sourcePool = {
    async getConnection() {
      calls.push("getConnection");
      return connection;
    },
  } as unknown as DatabasePool;
  const context = createDatabaseTransactionContext(sourcePool);

  await context.transaction.run(async () => {
    await context.pool.query("business write");
    const nestedConnection = await context.pool.getConnection();
    await nestedConnection.beginTransaction();
    await nestedConnection.query("nested repository write");
    await nestedConnection.commit();
    nestedConnection.release();
    await context.pool.query("audit write");
  });

  assert.deepEqual(calls, [
    "getConnection",
    "begin",
    "business write",
    "nested repository write",
    "audit write",
    "commit",
    "release",
  ]);
});

test("database transaction context rolls back both writes when audit fails", async () => {
  const calls: string[] = [];
  const connection = buildConnection(calls, "audit write");
  const sourcePool = {
    async getConnection() {
      calls.push("getConnection");
      return connection;
    },
  } as unknown as DatabasePool;
  const context = createDatabaseTransactionContext(sourcePool);

  await assert.rejects(
    context.transaction.run(async () => {
      await context.pool.query("business write");
      await context.pool.query("audit write");
    }),
    /query failed/u,
  );

  assert.deepEqual(calls, [
    "getConnection",
    "begin",
    "business write",
    "audit write",
    "rollback",
    "release",
  ]);
});

test("database transaction context holds the shared mutation lock for a write transaction", async () => {
  const calls: string[] = [];
  const connection = buildConnection(calls);
  const sourcePool = {
    async getConnection() {
      calls.push("getConnection");
      return connection;
    },
  } as unknown as DatabasePool;
  const context = createDatabaseTransactionContext(sourcePool, {
    mutationLockName: "smb:test_database_mutation",
  });

  await context.transaction.run(async () => {
    await context.pool.query("business write");
  });

  assert.deepEqual(calls, [
    "getConnection",
    "select get_lock(?, ?) as acquired",
    "begin",
    "business write",
    "commit",
    "select release_lock(?)",
    "release",
  ]);
});

test("database transaction context guards a direct pool mutation", async () => {
  const calls: string[] = [];
  const connection = buildConnection(calls);
  const sourcePool = {
    async getConnection() {
      calls.push("getConnection");
      return connection;
    },
  } as unknown as DatabasePool;
  const context = createDatabaseTransactionContext(sourcePool, {
    mutationLockName: "smb:test_database_mutation",
  });

  await context.pool.query("update auth_sessions set last_seen_at = now()");

  assert.deepEqual(calls, [
    "getConnection",
    "select get_lock(?, ?) as acquired",
    "update auth_sessions set last_seen_at = now()",
    "select release_lock(?)",
    "release",
  ]);
});

test("database mutation lock wraps a whole external CLI operation", async () => {
  const calls: string[] = [];
  const connection = buildConnection(calls);
  const sourcePool = {
    async getConnection() {
      calls.push("getConnection");
      return connection;
    },
  } as unknown as DatabasePool;

  await runWithDatabaseMutationLock({
    pool: sourcePool,
    lockName: "smb:test_database_mutation",
    operation: async () => {
      calls.push("cli operation");
    },
  });

  assert.deepEqual(calls, [
    "getConnection",
    "select get_lock(?, ?) as acquired",
    "cli operation",
    "select release_lock(?)",
    "release",
  ]);
});

test("database mutation lock lease stays held until its explicit release", async () => {
  const calls: string[] = [];
  const connection = buildConnection(calls);
  const sourcePool = {
    async getConnection() {
      calls.push("getConnection");
      return connection;
    },
  } as unknown as DatabasePool;

  const release = await acquireDatabaseMutationLock({
    pool: sourcePool,
    lockName: "smb:product_brand_references",
  });
  calls.push("request mutation");
  await release();
  await release();

  assert.deepEqual(calls, [
    "getConnection",
    "select get_lock(?, ?) as acquired",
    "request mutation",
    "select release_lock(?)",
    "release",
  ]);
});

test("database mutation lock serializes local waiters before borrowing pool connections", async () => {
  const calls: string[] = [];
  const sourcePool = {
    async getConnection() {
      calls.push("getConnection");
      return buildConnection(calls);
    },
  } as unknown as DatabasePool;

  const releaseFirst = await acquireDatabaseMutationLock({
    pool: sourcePool,
    lockName: "smb:product_brand_references",
  });
  const secondLease = acquireDatabaseMutationLock({
    pool: sourcePool,
    lockName: "smb:product_brand_references",
  });
  await Promise.resolve();
  assert.equal(calls.filter((call) => call === "getConnection").length, 1);

  await releaseFirst();
  const releaseSecond = await secondLease;
  assert.equal(calls.filter((call) => call === "getConnection").length, 2);
  await releaseSecond();
});

test("database mutation lock removes an aborted local waiter before it borrows a connection", async () => {
  const calls: string[] = [];
  const sourcePool = {
    async getConnection() {
      calls.push("getConnection");
      return buildConnection(calls);
    },
  } as unknown as DatabasePool;
  const releaseFirst = await acquireDatabaseMutationLock({
    pool: sourcePool,
    lockName: "smb:product_brand_references",
  });
  const abortController = new AbortController();
  const abortedLease = acquireDatabaseMutationLock({
    pool: sourcePool,
    lockName: "smb:product_brand_references",
    signal: abortController.signal,
  });
  await Promise.resolve();

  abortController.abort();
  await assert.rejects(abortedLease, { name: "AbortError" });
  await releaseFirst();

  assert.equal(calls.filter((call) => call === "getConnection").length, 1);
});

function buildConnection(calls: string[], failQuery?: string) {
  return {
    async beginTransaction() {
      calls.push("begin");
    },
    async query(sql: string) {
      calls.push(sql);
      if (sql === failQuery) {
        throw new Error("query failed");
      }
      if (sql === "select get_lock(?, ?) as acquired") {
        return [[{ acquired: 1 }], []];
      }
      return [[], []];
    },
    async commit() {
      calls.push("commit");
    },
    async rollback() {
      calls.push("rollback");
    },
    release() {
      calls.push("release");
    },
  } as unknown as PoolConnection;
}
