import assert from "node:assert/strict";
import test from "node:test";
import type { DatabasePool } from "../db/pool.js";
import { createLaboratoryRawMaterialWarehouseRepository } from "./laboratoryRawMaterialWarehouseRepository.js";

const pendingRow = {
  id: "revision-1",
  entry_id: "entry-1",
  revision_number: 1,
  status: "pending",
  movement_date: "2026-08-18",
  material_label: "Глина огнеупорная",
  stack_location: "Штабель 4",
  received_tons: "12.500",
  supplier: "ООО Поставщик",
  shipped_tons: "0.000",
  recipient: null,
  submitted_by_user_id: "laboratory-user",
  submitted_by_account_id: "laboratory-account",
  submitted_by_display_name: "Лаборант",
  submitted_at: "2026-08-18T08:00:00.000Z",
  reviewed_by_user_id: null,
  reviewed_by_account_id: null,
  reviewed_by_display_name: null,
  reviewed_at: null,
};

test("raw material warehouse repository appends an approved revision", async () => {
  const queries: Array<{ sql: string; parameters: unknown[] }> = [];
  const pool = {
    async query(sql: string, parameters: unknown[] = []) {
      queries.push({ sql: normalizeSql(sql), parameters });
      if (sql.includes("for update")) return [[pendingRow], []];
      return [{ affectedRows: 1 }, []];
    },
  } as unknown as DatabasePool;
  const repository = createLaboratoryRawMaterialWarehouseRepository(pool, {
    createId: () => "revision-2",
    now: () => new Date("2026-08-18T09:00:00.000Z"),
  });

  const result = await repository.review({
    id: "entry-1",
    action: "approve",
    reviewerUserId: "warehouse-user",
    reviewerAccountId: "warehouse-account",
    reviewerDisplayName: "Кладовщик",
  });

  assert.equal(result?.before.status, "pending");
  assert.equal(result?.record.status, "approved");
  assert.equal(result?.record.revisionNumber, 2);
  assert.equal(result?.record.warehouseKeeperDisplayName, "Кладовщик");
  const insert = queries.find(({ sql }) =>
    sql.startsWith("insert into laboratory_raw_material_warehouse_revisions")
  );
  assert.ok(insert !== undefined);
  assert.deepEqual(insert.parameters.slice(0, 5), [
    "revision-2",
    "entry-1",
    2,
    "approved",
    "2026-08-18",
  ]);
});

test("raw material warehouse repository rejects self-review of a pending entry", async () => {
  const pool = {
    async query(sql: string) {
      if (sql.includes("for update")) return [[pendingRow], []];
      return [{ affectedRows: 1 }, []];
    },
  } as unknown as DatabasePool;
  const repository = createLaboratoryRawMaterialWarehouseRepository(pool);

  await assert.rejects(
    repository.review({
      id: "entry-1",
      action: "approve",
      reviewerUserId: "laboratory-user",
      reviewerAccountId: "another-account-of-the-same-user",
      reviewerDisplayName: "Лаборант",
    }),
    /cannot review their own pending movement/u,
  );
});

test("raw material warehouse repository filters latest reviewed revisions and totals", async () => {
  const queries: Array<{ sql: string; parameters: unknown[] }> = [];
  const approvedRow = {
    ...pendingRow,
    id: "revision-2",
    revision_number: 2,
    status: "corrected",
    received_tons: "14.500",
    shipped_tons: "2.000",
    reviewed_by_user_id: "warehouse-user",
    reviewed_by_account_id: "warehouse-account",
    reviewed_by_display_name: "Кладовщик",
    reviewed_at: "2026-08-18T09:00:00.000Z",
  };
  const pool = {
    async query(sql: string, parameters: unknown[] = []) {
      queries.push({ sql: normalizeSql(sql), parameters });
      if (sql.includes("count(*) as record_count")) {
        return [[{
          record_count: "1",
          received_tons: "14.500",
          shipped_tons: "2.000",
          balance_tons: "12.500",
        }], []];
      }
      return [[approvedRow], []];
    },
  } as unknown as DatabasePool;
  const repository = createLaboratoryRawMaterialWarehouseRepository(pool);

  const result = await repository.list({
    dateFrom: "2026-08-01",
    dateTo: "2026-08-31",
    query: "50%_\\",
  });

  assert.equal(result.records[0]?.status, "corrected");
  assert.equal(result.records[0]?.warehouseKeeperDisplayName, "Кладовщик");
  assert.deepEqual(result.totals, {
    recordCount: 1,
    receivedTons: "14.5",
    shippedTons: "2",
    balanceTons: "12.5",
  });
  assert.equal(queries.length, 2);
  assert.doesNotMatch(queries[0]?.sql ?? "", /limit\s+500/u);
  for (const query of queries) {
    assert.match(query.sql, /not exists/u);
    assert.match(query.sql, /status in \('approved', 'corrected'\)/u);
    assert.deepEqual(query.parameters, [
      "2026-08-01",
      "2026-08-31",
      "%50\\%\\_\\\\%",
      "%50\\%\\_\\\\%",
      "%50\\%\\_\\\\%",
    ]);
  }
});

function normalizeSql(sql: string) {
  return sql.replace(/\s+/gu, " ").trim();
}
