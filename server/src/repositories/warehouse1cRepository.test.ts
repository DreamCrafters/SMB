import assert from "node:assert/strict";
import test from "node:test";
import type { DatabasePool } from "../db/pool.js";
import { createWarehouse1cRepository } from "./warehouse1cRepository.js";

test("stock report import inserts a new report with its balances", async () => {
  const queries: { sql: string; parameters?: unknown[] }[] = [];
  const repository = createWarehouse1cRepository(
    buildPool(queries, () => [[], []]),
    {
      createId: buildIdSequence(),
      now: () => new Date("2026-08-23T06:30:00.000Z"),
    },
  );

  assert.deepEqual(
    await repository.saveStockReport({
      accountCode: "43",
      accountLabel: "Счёт 43 (Готовая продукция)",
      reportDate: "2026-08-23",
      fileName: "Остатки.xlsx",
      fileChecksum: "a".repeat(64),
      fileSize: 2048,
      source: "1С:Предприятие",
      sentAt: "2026-08-23T06:29:00.000Z",
      balances: [
        { nomenclature: "ША-8", openingBalance: "12.5", closingBalance: "" },
      ],
    }),
    { reportId: "id-1", rowCount: 1, isReplaced: false },
  );

  assert.match(queries[1]?.sql ?? "", /insert into warehouse_1c_stock_reports/u);
  assert.deepEqual(queries[1]?.parameters, [
    "id-1",
    "43",
    "Счёт 43 (Готовая продукция)",
    "2026-08-23",
    "Остатки.xlsx",
    "a".repeat(64),
    2048,
    "1С:Предприятие",
    "2026-08-23T06:29:00.000Z",
    1,
    "2026-08-23T06:30:00.000Z",
  ]);
  assert.match(queries[2]?.sql ?? "", /insert into warehouse_1c_stock_balances/u);
  // Пустой остаток хранится как NULL, а не как ноль.
  assert.deepEqual(queries[2]?.parameters, [
    "id-2",
    "id-1",
    0,
    "ША-8",
    "12.5",
    null,
  ]);
});

test("repeated import replaces the whole report for the same date", async () => {
  const queries: { sql: string; parameters?: unknown[] }[] = [];
  const repository = createWarehouse1cRepository(
    buildPool(queries, (sql) =>
      /select id, account_code/u.test(sql)
        ? [[buildReportRow()], []]
        : [[], []]),
    {
      createId: buildIdSequence(),
      now: () => new Date("2026-08-23T07:00:00.000Z"),
    },
  );

  assert.deepEqual(
    await repository.saveStockReport({
      accountCode: "43",
      accountLabel: "Счёт 43 (Готовая продукция)",
      reportDate: "2026-08-23",
      fileName: "Остатки-2.xlsx",
      fileChecksum: "b".repeat(64),
      fileSize: 4096,
      balances: [
        { nomenclature: "ШБ-5", openingBalance: "", closingBalance: "3" },
      ],
    }),
    { reportId: "report-1", rowCount: 1, isReplaced: true },
  );

  assert.match(
    queries[1]?.sql ?? "",
    /delete from warehouse_1c_stock_balances/u,
  );
  assert.deepEqual(queries[1]?.parameters, ["report-1"]);
  assert.match(queries[2]?.sql ?? "", /update warehouse_1c_stock_reports/u);
});

test("stock report reads the latest date when none is asked for", async () => {
  const queries: { sql: string; parameters?: unknown[] }[] = [];
  const repository = createWarehouse1cRepository(
    buildPool(queries, (sql) =>
      /select id, account_code/u.test(sql)
        ? [[buildReportRow()], []]
        : /select nomenclature/u.test(sql)
          ? [[
              {
                nomenclature: "ША-8",
                opening_balance: "12.500",
                closing_balance: null,
              },
            ], []]
          : [[], []]),
  );

  assert.deepEqual(await repository.readStockReport({ accountCode: "43" }), {
    accountCode: "43",
    accountLabel: "Счёт 43 (Готовая продукция)",
    reportDate: "2026-08-23",
    fileName: "Остатки.xlsx",
    importedAt: "2026-08-23 06:30:00.000",
    balances: [
      { nomenclature: "ША-8", openingBalance: "12.5", closingBalance: "" },
    ],
  });
  assert.doesNotMatch(queries[0]?.sql ?? "", /and report_date = \?/u);
  assert.deepEqual(queries[0]?.parameters, ["43"]);
});

function buildPool(
  queries: { sql: string; parameters?: unknown[] }[],
  respond: (sql: string) => [unknown[], unknown[]],
) {
  return {
    async query(sql: string, parameters?: unknown[]) {
      queries.push({ sql, parameters });
      return respond(sql);
    },
  } as unknown as DatabasePool;
}

function buildIdSequence() {
  let counter = 0;
  return () => {
    counter += 1;
    return `id-${counter}`;
  };
}

function buildReportRow() {
  return {
    id: "report-1",
    account_code: "43",
    account_label: "Счёт 43 (Готовая продукция)",
    report_date: "2026-08-23",
    file_name: "Остатки.xlsx",
    imported_at: "2026-08-23 06:30:00.000",
  };
}
