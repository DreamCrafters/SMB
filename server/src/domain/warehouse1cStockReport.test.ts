import assert from "node:assert/strict";
import test from "node:test";
import type { XlsxCell, XlsxSheet } from "../integrations/xlsxWorkbook.js";
import { parseWarehouse1cStockReport } from "./warehouse1cStockReport.js";

/**
 * Раскладка повторяет реальную выгрузку `Сводный отчёт по материалам и готовой
 * продукции`: период строкой, две секции со своими шапками, счёт продублирован
 * в первой колонке, числа текстом с неразрывными пробелами.
 */
function buildSummaryReportSheet() {
  const columns = [
    "Счет",
    "Номенклатура",
    "Ост.Дебет нач.",
    "Ост.Кредит нач.",
    "Оборот Дебет",
    "Оборот Кредит",
    "Ост.Дебет кон.",
    "Ост.Кредит кон.",
  ];

  return buildSheet("Лист_1", [
    ["Сводный отчёт по материалам и готовой продукции"],
    ["Период: 23.08.2026 - 23.08.2026"],
    ["Всего записей по сч.43: 2, по сч.10.01: 2"],
    [],
    ["Счёт 43 (Готовая продукция)"],
    columns,
    ["43", "ШБ-15 кер", "594 262,58", "0", "0", "0", "594 262,58", "0"],
    ["43", "ША-22 (вес 1,32)", "-2 045,53", "0", "0", "0", "-2 045,53", "0"],
    ["43", "ГАС-порошок", "158 494,86", "0", "0", "0", "158 494,86", "0"],
    [],
    [],
    ["Счёт 10.01 (Материалы)"],
    columns,
    ["10.01", "Огнеупорлом дробленый", "1 836,24", "0", "0", "0", "1 836,24", "0"],
    ["10.01", "ГАС-порошок", "277 693,47", "0", "0", "0", "277 693,47", "0"],
  ]);
}

test("summary 1C report splits balances per account", () => {
  const result = parseWarehouse1cStockReport([buildSummaryReportSheet()]);

  assert.equal(result.ok, true);
  assert.equal(result.ok ? result.value.reportDate : undefined, "2026-08-23");
  assert.equal(result.ok ? result.value.skippedDuplicates : undefined, 0);
  // Подписи счетов берутся из заголовков секций выгрузки.
  assert.deepEqual(
    result.ok
      ? result.value.accounts.map(({ accountCode, accountLabel }) => ({
          accountCode,
          accountLabel,
        }))
      : undefined,
    [
      { accountCode: "43", accountLabel: "Счёт 43 (Готовая продукция)" },
      { accountCode: "10.01", accountLabel: "Счёт 10.01 (Материалы)" },
    ],
  );
  // Разряды с неразрывными пробелами и отрицательное сальдо разбираются.
  assert.deepEqual(result.ok ? result.value.accounts[0].balances : undefined, [
    {
      nomenclature: "ШБ-15 кер",
      openingBalance: "594262.58",
      closingBalance: "594262.58",
        openingQuantity: "",
        closingQuantity: "",
    },
    {
      nomenclature: "ША-22 (вес 1,32)",
      openingBalance: "-2045.53",
      closingBalance: "-2045.53",
        openingQuantity: "",
        closingQuantity: "",
    },
    {
      nomenclature: "ГАС-порошок",
      openingBalance: "158494.86",
      closingBalance: "158494.86",
        openingQuantity: "",
        closingQuantity: "",
    },
  ]);
  // Одно наименование в двух счетах — это не повтор.
  assert.deepEqual(result.ok ? result.value.accounts[1].balances : undefined, [
    {
      nomenclature: "Огнеупорлом дробленый",
      openingBalance: "1836.24",
      closingBalance: "1836.24",
        openingQuantity: "",
        closingQuantity: "",
    },
    {
      nomenclature: "ГАС-порошок",
      openingBalance: "277693.47",
      closingBalance: "277693.47",
        openingQuantity: "",
        closingQuantity: "",
    },
  ]);
});

test("summary 1C report ignores turnover and credit columns", () => {
  const result = parseWarehouse1cStockReport([buildSummaryReportSheet()]);
  const balances = result.ok ? result.value.accounts[0].balances : [];

  // Колонки «Оборот» и «Ост.Кредит» нулевые: их значения не должны попасть в разрез.
  assert.equal(balances.every((balance) => balance.openingBalance !== "0"), true);
  assert.equal(balances.every((balance) => balance.closingBalance !== "0"), true);
});

test("stock report takes the date and the account from a single-account file", () => {
  const result = parseWarehouse1cStockReport([
    buildSheet("Остатки", [
      ["Оборотно-сальдовая ведомость по счету 43 за 23 августа 2026 г."],
      [],
      ["Номенклатура", "Ост. нач.", "Ост. кон."],
      ["ША-8", text("1 234,567"), text("1 200")],
      ["ШБ-5", number(0), number(15.5)],
      ["ша-8", number(99), number(99)],
      ["Итого", number(1234.567), number(1215.5)],
    ]),
  ]);

  assert.equal(result.ok, true);
  assert.deepEqual(result.ok ? result.value : undefined, {
    reportDate: "2026-08-23",
    // Повтор в другом регистре и строка «Итого» в разрез не попадают.
    skippedDuplicates: 1,
    accounts: [{
      accountCode: "43",
      accountLabel: "Счёт 43",
      balances: [
        {
          nomenclature: "ША-8",
          openingBalance: "1234.567",
          closingBalance: "1200",
          openingQuantity: "",
          closingQuantity: "",
        },
        {
          nomenclature: "ШБ-5",
          openingBalance: "0",
          closingBalance: "15.5",
          openingQuantity: "",
          closingQuantity: "",
        },
      ],
    }],
  });
});

test("stock report reads a two-row header and the end of the period", () => {
  const result = parseWarehouse1cStockReport([
    buildSheet("ОСВ", [
      ["Ведомость по счёту 43"],
      ["Период", date("2026-08-01"), date("2026-08-23")],
      ["Номенклатура", "Сальдо на начало периода", "", "Сальдо на конец периода"],
      ["", "Дебет", "Кредит", "Дебет"],
      ["ША-8", number(10), text(""), number(12)],
      ["", number(1), text(""), number(2)],
    ]),
  ]);

  assert.equal(result.ok, true);
  assert.equal(result.ok ? result.value.reportDate : undefined, "2026-08-23");
  assert.deepEqual(result.ok ? result.value.accounts[0].balances : undefined, [
    {
          nomenclature: "ША-8",
          openingBalance: "10",
          closingBalance: "12",
          openingQuantity: "",
          closingQuantity: "",
        },
  ]);
});

test("stock report reports what it saw when the header is missing", () => {
  const result = parseWarehouse1cStockReport([
    buildSheet("Лист1", [
      ["Отчёт о движении денежных средств"],
      ["Статья", "Приход", "Расход"],
      ["Аренда", 1, 2],
    ]),
  ]);

  assert.equal(result.ok, false);
  assert.match(
    result.ok ? "" : result.errors.join(" "),
    /Не нашли шапку таблицы/u,
  );
  assert.match(
    result.ok ? "" : result.errors.join(" "),
    /Отчёт о движении денежных средств/u,
  );
});

/**
 * Структура, на которую 1С перешла в сентябре 2026: счёт, склад и номенклатура
 * в одной колонке с отступами, шапка в две строки и каждая позиция двумя
 * строками — «БУ» (рубли) и «Кол» (количество).
 */
function buildHierarchicalReportSheet() {
  return buildSheet("Лист_1", [
    ["Сводный отчёт по материалам и готовой продукции"],
    ["Период: 01.01.2020 - 09.09.2026"],
    [],
    ["Счёт 43 (Готовая продукция)"],
    [
      "Счет / Склад / Номенклатура", "Показатели",
      "Сальдо на начало периода", "", "Обороты за период", "",
      "Сальдо на конец периода", "",
    ],
    ["", "", "Дебет", "Кредит", "Дебет", "Кредит", "Дебет", "Кредит"],
    ["43", "БУ", "0", "0", "0", "0", "135 480 293,50", "0"],
    ["", "Кол", "0", "0", "0", "0", "8 538,890", "0"],
    ["    Центральный Склад", "БУ", "0", "0", "0", "0", "1 257 929,75", "0"],
    ["", "Кол", "0", "0", "0", "0", number(69.89), "0"],
    ["        Шамот бокситовый 69", "БУ", "0", "0", "0", "0", "1 257 929,75", "0"],
    ["", "Кол", "0", "0", "0", "0", number(69.89), "0"],
    ["        Материал высокоглиноземистый ШРС-75", "БУ", "12,5", "0", "0", "0", "0", "0"],
    ["", "Кол", "1,380", "0", "0", "0", "0", "0"],
    ["    Основной склад", "БУ", "0", "0", "0", "0", "0", "0"],
    ["", "Кол", "0", "0", "0", "0", "0", "0"],
    ["        Шамот бокситовый 69", "БУ", "500,00", "0", "0", "0", "0", "0"],
    ["", "Кол", "2,000", "0", "0", "0", "0", "0"],
  ]);
}

test("stock report reads the hierarchical layout with amounts and quantities", () => {
  const result = parseWarehouse1cStockReport([buildHierarchicalReportSheet()]);

  assert.ok(result.ok);

  const account = result.value.accounts[0];

  assert.equal(result.value.reportDate, "2026-09-09");
  assert.equal(account?.accountCode, "43");
  assert.equal(account?.accountLabel, "Счёт 43 (Готовая продукция)");
  // Итог по счёту и строки складов в разрез не идут, только номенклатура.
  assert.deepEqual(account?.balances, [
    {
      nomenclature: "Шамот бокситовый 69",
      warehouse: "Центральный Склад",
      openingBalance: "0",
      closingBalance: "1257929.75",
      openingQuantity: "0",
      closingQuantity: "69.89",
    },
    {
      // Наименование, начинающееся с подписи колонки, остаётся номенклатурой.
      nomenclature: "Материал высокоглиноземистый ШРС-75",
      warehouse: "Центральный Склад",
      openingBalance: "12.5",
      closingBalance: "0",
      openingQuantity: "1.38",
      closingQuantity: "0",
    },
    {
      // Одно наименование на другом складе — отдельный остаток, а не повтор.
      nomenclature: "Шамот бокситовый 69",
      warehouse: "Основной склад",
      openingBalance: "500",
      closingBalance: "0",
      openingQuantity: "2",
      closingQuantity: "0",
    },
  ]);
  assert.equal(result.value.skippedDuplicates, 0);
});

test("stock report refuses a file without a date", () => {
  const result = parseWarehouse1cStockReport([
    buildSheet("Остатки", [
      ["Остатки по счету 43"],
      ["Номенклатура", "Ост. нач.", "Ост. кон."],
      ["ША-8", number(1), number(2)],
    ]),
  ]);

  assert.match(result.ok ? "" : result.errors.join(" "), /нет даты/u);
});

function buildSheet(
  name: string,
  rows: (string | number | XlsxCell)[][],
): XlsxSheet {
  return {
    name,
    merges: [],
    rows: rows.map((row) =>
      row.map((cell) =>
        typeof cell === "string"
          ? text(cell)
          : typeof cell === "number"
            ? number(cell)
            : cell)),
  };
}

function text(value: string): XlsxCell {
  return { text: value };
}

function number(value: number): XlsxCell {
  return { text: String(value), number: value };
}

function date(value: string): XlsxCell {
  return { text: value, number: 0, date: value };
}
