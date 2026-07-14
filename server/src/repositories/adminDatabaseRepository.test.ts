import assert from "node:assert/strict";
import test from "node:test";
import type { DatabasePool } from "../db/pool.js";
import { createAdminDatabaseRepository } from "./adminDatabaseRepository.js";

test("admin database exposes credentials as a safe informative view", async () => {
  const queries: string[] = [];
  const pool = {
    async query(sql: string) {
      const normalized = sql.replace(/\s+/g, " ").trim();
      queries.push(normalized);

      if (normalized.startsWith("select count(*)")) {
        return [[{ row_count: 1 }], []];
      }

      return [[{
        user_display_name: "Администратор",
        login: "admin",
        password_updated_at: "2026-07-15T08:30:00.000Z",
        // Unexpected driver fields must never cross the public projection.
        password_hash: "password-hash-secret",
        user_id: "user-secret-id",
      }], []];
    },
  } as unknown as DatabasePool;

  const result = await createAdminDatabaseRepository(pool).listRows(
    "auth_password_credentials",
  );
  const serialized = JSON.stringify(result);

  assert.equal(result.table.label, "Пароли пользователей");
  assert.deepEqual(
    result.table.columns.map((column) => column.label),
    ["Пользователь", "Логин", "Пароль обновлён"],
  );
  assert.deepEqual(result.table.primaryKey, []);
  assert.equal(result.table.canDelete, false);
  assert.equal(result.table.canClear, false);
  assert.doesNotMatch(serialized, /password-hash-secret|password_hash|user-secret-id/u);
  assert.doesNotMatch(
    queries.at(-1) ?? "",
    /select \*|password_hash/u,
  );
});

test("admin database does not expose or mutate active session identifiers", async () => {
  const queries: string[] = [];
  const pool = {
    async query(sql: string) {
      const normalized = sql.replace(/\s+/g, " ").trim();
      queries.push(normalized);

      if (normalized.startsWith("select count(*)")) {
        return [[{ row_count: 1 }], []];
      }

      return [[{
        user_display_name: "Администратор",
        login: "admin",
        position: "Администратор",
        created_at: "2026-07-15T08:00:00.000Z",
        last_seen_at: "2026-07-15T08:30:00.000Z",
        expires_at: "2026-07-16T08:00:00.000Z",
        session_status: "active",
        // Unexpected driver fields must never cross the public projection.
        id: "session-token-secret",
        user_id: "user-id",
        access_id: "access-id",
      }], []];
    },
  } as unknown as DatabasePool;
  const repository = createAdminDatabaseRepository(pool);

  const result = await repository.listRows("auth_sessions");
  const serialized = JSON.stringify(result);

  assert.equal(result.table.label, "Активные сессии");
  assert.deepEqual(result.table.primaryKey, []);
  assert.equal(result.table.canDelete, false);
  assert.equal(result.table.canClear, false);
  assert.doesNotMatch(serialized, /session-token-secret|user-id|access-id/u);
  assert.doesNotMatch(queries.at(-1) ?? "", /sessions\.id|select \*/u);
  await assert.rejects(
    repository.deleteRow({
      tableName: "auth_sessions",
      primaryKey: { id: "session-token-secret" },
    }),
    /does not allow deletion/u,
  );
});

test("admin database clears only an explicitly allowlisted section", async () => {
  const queries: string[] = [];
  const pool = {
    async query(sql: string) {
      const normalized = sql.replace(/\s+/g, " ").trim();
      queries.push(normalized);

      return [{ affectedRows: 582 }, []];
    },
  } as unknown as DatabasePool;
  const repository = createAdminDatabaseRepository(pool);

  const deleted = await repository.clearTable("dispatcher_submissions");

  assert.equal(deleted, 582);
  assert.equal(queries[0], "delete from `dispatcher_submissions`");
  await assert.rejects(
    repository.clearTable("auth_sessions"),
    /does not allow clearing/u,
  );
  assert.equal(queries.length, 1);
});
