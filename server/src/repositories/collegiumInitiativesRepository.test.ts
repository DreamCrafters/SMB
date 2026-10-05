import assert from "node:assert/strict";
import test from "node:test";
import type { DatabasePool } from "../db/pool.js";
import { CollegiumInitiativeError } from "../domain/collegiumInitiative.js";
import { createCollegiumInitiativesRepository } from "./collegiumInitiativesRepository.js";

test("collegium initiatives repository rejects a stale revision", async () => {
  const queries: Array<{ sql: string; parameters?: unknown[] }> = [];
  const pool = {
    async query(sql: string, parameters?: unknown[]) {
      queries.push({ sql, parameters });
      return [{ affectedRows: 0 }, []];
    },
  } as unknown as DatabasePool;
  const repository = createCollegiumInitiativesRepository(pool);

  await assert.rejects(
    repository.update({
      id: "initiative-1",
      number: "И-2026-0001",
      status: "draft",
      revision: 3,
      card: { title: "Идея" } as never,
      workflow: {},
      createdByUserId: "author",
      createdAt: "2026-10-05T09:00:00.000Z",
      updatedAt: "2026-10-05T10:00:00.000Z",
    }, 2),
    (error) => error instanceof CollegiumInitiativeError && error.status === 409,
  );
  assert.match(queries[0]?.sql ?? "", /where id = \? and revision = \?/u);
  assert.deepEqual(queries[0]?.parameters?.slice(-2), ["initiative-1", 2]);
});

test("collegium number series increments the yearly counter in one upsert", async () => {
  const queries: string[] = [];
  let stored = 41;
  const pool = {
    async query(sql: string) {
      const normalized = sql.replace(/\s+/gu, " ").trim();
      queries.push(normalized);
      if (normalized.startsWith("insert into collegium_number_sequences")) {
        stored += 1;
        return [{ affectedRows: 2 }, []];
      }
      if (normalized.startsWith("select last_value")) {
        return [[{ last_value: stored }], []];
      }
      throw new Error(`Unexpected SQL: ${normalized}`);
    },
  } as unknown as DatabasePool;

  assert.equal(await createCollegiumInitiativesRepository(pool).nextNumber("initiative", 2026), 42);
  // The exclusive lock comes from the upsert itself, never from a lock upgrade.
  assert.match(queries[0] ?? "", /on duplicate key update last_value = last_value \+ 1$/u);
  assert.equal(queries.some((sql) => /insert ignore|for update/u.test(sql)), false);
});

test("collegium people merge positions and detect the initiatives tab", async () => {
  const pool = {
    async query() {
      return [[
        { user_id: "u1", display_name: "Иванова А.А.", position_name: "Экономист", navigation_items: "[\"business.overview\"]" },
        { user_id: "u1", display_name: "Иванова А.А.", position_name: "Член Коллегии", navigation_items: ["business.collegium_initiatives"] },
        { user_id: "u2", display_name: "Петров П.П.", position_name: "Мастер", navigation_items: "[]" },
      ], []];
    },
  } as unknown as DatabasePool;

  assert.deepEqual(await createCollegiumInitiativesRepository(pool).listPeople(), [
    { id: "account:u1", displayName: "Иванова А.А.", position: "Экономист / Член Коллегии", hasInitiativesTab: true },
    { id: "account:u2", displayName: "Петров П.П.", position: "Мастер", hasInitiativesTab: false },
  ]);
});

test("reminder claims are leased and stop after the attempt limit", async () => {
  const queries: Array<{ sql: string; parameters: unknown[] }> = [];
  const pool = {
    async query(sql: string, parameters: unknown[] = []) {
      queries.push({ sql: sql.replace(/\s+/gu, " ").trim(), parameters });
      return [{ affectedRows: 1 }, []];
    },
  } as unknown as DatabasePool;
  const claimed = await createCollegiumInitiativesRepository(pool).claimReminder({
    kind: "rework", subjectId: "i-1", cycle: "2026-10-05T09:00:00.000Z", targetDate: "2026-10-08",
    offset: 2, userId: "author", channel: "email",
  }, "token-1");
  assert.equal(claimed, true);
  assert.match(queries[0].sql, /^insert ignore into collegium_reminder_deliveries/u);
  assert.match(queries[1].sql, /attempts = attempts \+ 1/u);
  assert.match(queries[1].sql, /delivered_at is null and attempts < \?/u);
  assert.equal(queries[1].parameters.at(-1), 3);
});
