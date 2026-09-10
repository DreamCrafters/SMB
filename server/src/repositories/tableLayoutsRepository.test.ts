import assert from "node:assert/strict";
import test from "node:test";
import type { DatabasePool } from "../db/pool.js";
import { createTableLayoutsRepository, TableLayoutConflictError } from "./tableLayoutsRepository.js";

test("a stale editor cannot overwrite another administrator's widths", async () => {
  let updated = false;
  const pool = { async query(sql: string) {
    if (/select table_id/u.test(sql)) return [[{ table_id: "warehouse.stock", revision: 2, widths: '{"nomenclature":240}' }], []];
    if (/update app_table_layouts set/u.test(sql)) updated = true;
    return [[], []];
  } } as unknown as DatabasePool;
  const repository = createTableLayoutsRepository(pool);
  await assert.rejects(() => repository.set({ tableId: "warehouse.stock", revision: 1, widths: {} }), TableLayoutConflictError);
  assert.equal(updated, false);
});
