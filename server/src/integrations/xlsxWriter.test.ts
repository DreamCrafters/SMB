import assert from "node:assert/strict";
import test from "node:test";
import { readXlsxWorkbook } from "./xlsxWorkbook.js";
import { buildXlsxWorkbook } from "./xlsxWriter.js";

test("written workbook reads back with headers, text, numbers and escaped markup", () => {
  const file = buildXlsxWorkbook([{
    name: "Реестр: инициативы/2026",
    columns: [{ header: "Номер", width: 14 }, { header: "Наименование" }, { header: "Эффект, ₽" }],
    rows: [
      ["И-2026-0001", "Снизить <потери> & брак", 1200000.5],
      ["И-2026-0002", "Строка\nс переносом\u0001", null],
    ],
  }]);
  const [sheet] = readXlsxWorkbook(file);
  assert.equal(sheet.name, "Реестр  инициативы 2026");
  const values = sheet.rows.map((row) => row.map((cell) => cell?.text ?? ""));
  assert.deepEqual(values[0], ["Номер", "Наименование", "Эффект, ₽"]);
  assert.deepEqual(values[1], ["И-2026-0001", "Снизить <потери> & брак", "1200000.5"]);
  assert.equal(sheet.rows[1][2]?.number, 1200000.5);
  assert.equal(values[2][1], "Строка\nс переносом");
});

test("many columns get spreadsheet letters beyond Z", () => {
  const columns = Array.from({ length: 30 }, (_, index) => ({ header: `К${index + 1}` }));
  const [sheet] = readXlsxWorkbook(buildXlsxWorkbook([{ name: "", columns, rows: [] }]));
  assert.equal(sheet.name, "Лист1");
  assert.equal(sheet.rows[0].length, 30);
  assert.equal(sheet.rows[0][29]?.text, "К30");
});
