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
        {
          nomenclature: "ША-8",
          warehouse: "Центральный Склад",
          openingBalance: "12.5",
          closingBalance: "",
          openingQuantity: "1.5",
          closingQuantity: "",
        },
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
  // Пустой остаток хранится как NULL, а не как ноль; склад и количество рядом.
  assert.deepEqual(queries[2]?.parameters, [
    "id-2",
    "id-1",
    0,
    "ША-8",
    "Центральный Склад",
    "12.5",
    null,
    "1.5",
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
        {
          nomenclature: "ШБ-5",
          openingBalance: "",
          closingBalance: "3",
          openingQuantity: "",
          closingQuantity: "0.5",
        },
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
                warehouse: "Центральный Склад",
                opening_balance: "12.500",
                opening_quantity: "1.500",
                closing_quantity: null,
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
      {
        nomenclature: "ША-8",
        warehouse: "Центральный Склад",
        openingBalance: "12.5",
        closingBalance: "",
        openingQuantity: "1.5",
        closingQuantity: "",
      },
    ],
  });
  assert.doesNotMatch(queries[0]?.sql ?? "", /and report_date = \?/u);
  assert.deepEqual(queries[0]?.parameters, ["43"]);
});

test("upload journal keeps the file and the refusal reason", async () => {
  const queries: { sql: string; parameters?: unknown[] }[] = [];
  const repository = createWarehouse1cRepository(
    buildPool(queries, () => [[], []]),
    {
      createId: buildIdSequence(),
      now: () => new Date("2026-09-08T09:20:00.000Z"),
    },
  );

  await repository.recordUpload({
    outcome: "rejected",
    statusCode: 422,
    fileName: "report_20260908.xlsx",
    fileSize: 6,
    fileChecksum: "b".repeat(64),
    fileContent: Buffer.from("xlsx-b", "utf8"),
    source: "1С:Предприятие",
    errorMessage: "В шапке отчёта нет даты.",
  });

  assert.match(queries[0]?.sql ?? "", /insert into warehouse_1c_uploads/u);
  assert.deepEqual(queries[0]?.parameters, [
    "id-1",
    "2026-09-08T09:20:00.000Z",
    "rejected",
    422,
    "report_20260908.xlsx",
    6,
    "b".repeat(64),
    Buffer.from("xlsx-b", "utf8"),
    "1С:Предприятие",
    // Незаполненные поля отказа хранятся как NULL, а не пустой строкой.
    null,
    null,
    null,
    null,
    "В шапке отчёта нет даты.",
  ]);
});

test("upload journal skips a file too large to store but keeps the record", async () => {
  const queries: { sql: string; parameters?: unknown[] }[] = [];
  const repository = createWarehouse1cRepository(
    buildPool(queries, () => [[], []]),
    { createId: buildIdSequence(), now: () => new Date("2026-09-08T09:20:00.000Z") },
  );

  await repository.recordUpload({
    outcome: "accepted",
    statusCode: 200,
    fileName: "big.xlsx",
    fileSize: 9_000_000,
    fileContent: Buffer.alloc(9_000_000),
    reportDate: "2026-09-07",
    accounts: "43, 10.01",
    rowCount: 104,
  });

  // Blob под лимит приёмника в 20 МБ уронил бы запись о `max_allowed_packet`.
  assert.equal(queries[0]?.parameters?.[7], null);
  assert.equal(queries[0]?.parameters?.[10], "2026-09-07");
  assert.equal(queries[0]?.parameters?.[11], "43, 10.01");
  assert.equal(queries[0]?.parameters?.[12], 104);
});

test("read-only source writes no upload journal entry", async () => {
  const queries: { sql: string; parameters?: unknown[] }[] = [];
  const repository = createWarehouse1cRepository(
    buildPool(queries, () => [[], []]),
    { isReadOnly: true },
  );

  // В чужую базу писать нечего: приёмник в этом режиме и так отвечает 409.
  await repository.recordUpload({
    outcome: "rejected",
    statusCode: 409,
    fileName: "",
  });

  assert.deepEqual(queries, []);
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
