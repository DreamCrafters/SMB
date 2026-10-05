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
      createdByUserId: "author",
      createdAt: "2026-10-05T09:00:00.000Z",
      updatedAt: "2026-10-05T10:00:00.000Z",
    }, 2),
    (error) => error instanceof CollegiumInitiativeError && error.status === 409,
  );
  assert.match(queries[0]?.sql ?? "", /where id = \? and revision = \?/u);
  assert.deepEqual(queries[0]?.parameters?.slice(-2), ["initiative-1", 2]);
});

test("collegium number series increments a locked yearly counter", async () => {
  const queries: string[] = [];
  let stored = 41;
  const pool = {
    async query(sql: string, parameters: unknown[] = []) {
      const normalized = sql.replace(/\s+/gu, " ").trim();
      queries.push(normalized);
      if (normalized.startsWith("select last_value")) {
        assert.match(normalized, /for update$/u);
        return [[{ last_value: stored }], []];
      }
      if (normalized.startsWith("update collegium_number_sequences")) {
        stored = Number(parameters[0]);
      }
      return [{ affectedRows: 1 }, []];
    },
  } as unknown as DatabasePool;

  assert.equal(await createCollegiumInitiativesRepository(pool).nextNumber("initiative", 2026), 42);
  assert.equal(stored, 42);
  assert.match(queries[0] ?? "", /^insert ignore into collegium_number_sequences/u);
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
