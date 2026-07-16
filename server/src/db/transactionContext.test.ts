import assert from "node:assert/strict";
import test from "node:test";
import type { PoolConnection } from "mysql2/promise";
import type { DatabasePool } from "./pool.js";
import { createDatabaseTransactionContext } from "./transactionContext.js";

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
