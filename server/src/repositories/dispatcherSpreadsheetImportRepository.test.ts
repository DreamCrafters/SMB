import assert from "node:assert/strict";
import test from "node:test";
import type { DispatcherSpreadsheetImportRecord } from "../domain/dispatcherSpreadsheetImport.js";
import type { DatabasePool } from "../db/pool.js";
import { createDispatcherSpreadsheetImportRepository } from "./dispatcherSpreadsheetImportRepository.js";

const record: DispatcherSpreadsheetImportRecord = {
  id: "11111111-1111-4111-8111-111111111111",
  sourceKey: "business-main:google-sheets:sheet:equipment:hash",
  formId: "equipment",
  payload: {
    reportDate: "02.06.2026",
    equipment: "Пресс №1",
    productionTons: "12.5",
  },
  summary: "Оборудование",
  period: "2026-06",
  rawValue: "Оборудование",
  comment: null,
  dedupeKey: "equipment:02.06.2026:Пресс №1",
  occurredAt: new Date("2026-06-02T15:16:54.000Z"),
};

const incidentRecord: DispatcherSpreadsheetImportRecord = {
  ...record,
  id: "22222222-2222-4222-8222-222222222222",
  sourceKey: "business-main:google-sheets:other:incident:hash",
  formId: "incident",
  payload: {
    incidentNumber: "INC-2026-12",
    datetime: "12.06.2026 08:30",
  },
  dedupeKey: "incident:content-hash",
};

test("dispatcher spreadsheet import repository inserts without overwriting conflicts", async () => {
  const statements: string[] = [];
  let committed = false;
  const connection = {
    async beginTransaction() {},
    async commit() { committed = true; },
    async rollback() {},
    release() {},
    async query(sql: string) {
      statements.push(sql.replace(/\s+/g, " ").trim());

      if (sql.includes("select id") && sql.includes("business_accounts")) {
        return [[{ id: "business-main" }], []];
      }

      if (sql.includes("select import_source_key")) {
        return [[], []];
      }

      return [{ affectedRows: 0 }, []];
    },
  };
  const pool = {
    async getConnection() { return connection; },
  } as unknown as DatabasePool;
  const repository = createDispatcherSpreadsheetImportRepository(pool);
  const result = await repository.importRecords({
    businessAccountId: "business-main",
    submittedByAccountId: "admin-access",
    records: [record],
  });

  assert.equal(committed, true);
  assert.equal(result.inserted, 0);
  assert.equal(result.skipped, 1);
  assert.match(statements[2] ?? "", /^insert ignore into dispatcher_submissions/);
  assert.doesNotMatch(statements[2] ?? "", /on duplicate key update/);
});

test("dispatcher spreadsheet import repository rolls back the whole import on failure", async () => {
  let rolledBack = false;
  const connection = {
    async beginTransaction() {},
    async commit() {},
    async rollback() { rolledBack = true; },
    release() {},
    async query(sql: string) {
      if (sql.includes("business_accounts")) {
        return [[{ id: "business-main" }], []];
      }

      throw new Error("write failed");
    },
  };
  const pool = {
    async getConnection() { return connection; },
  } as unknown as DatabasePool;
  const repository = createDispatcherSpreadsheetImportRepository(pool);

  await assert.rejects(
    repository.importRecords({
      businessAccountId: "business-main",
      submittedByAccountId: "admin-access",
      records: [record],
    }),
    /write failed/,
  );
  assert.equal(rolledBack, true);
});

test("dispatcher spreadsheet import repository persists a business-scoped content key", async () => {
  let insertValues: unknown[] = [];
  const connection = {
    async beginTransaction() {},
    async commit() {},
    async rollback() {},
    release() {},
    async query(sql: string, values?: unknown[]) {
      if (sql.includes("select id") && sql.includes("business_accounts")) {
        return [[{ id: "business-main" }], []];
      }

      if (sql.includes("select import_source_key")) {
        return [[], []];
      }

      if (sql.includes("select form_id, payload")) {
        return [[], []];
      }

      insertValues = values ?? [];
      return [{ affectedRows: 1 }, []];
    },
  };
  const pool = {
    async getConnection() { return connection; },
  } as unknown as DatabasePool;
  const repository = createDispatcherSpreadsheetImportRepository(pool);
  const result = await repository.importRecords({
    businessAccountId: "business-main",
    submittedByAccountId: "admin-access",
    records: [incidentRecord],
  });

  assert.equal(result.inserted, 1);
  assert.match(
    String(insertValues[9]),
    /^dispatcher:business-main:incident:[a-f0-9]{64}$/u,
  );
});
