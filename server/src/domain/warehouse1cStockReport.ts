import type { Warehouse1cStockBalance } from "../contracts/warehouse1c.js";
import type { XlsxCell, XlsxSheet } from "../integrations/xlsxWorkbook.js";

/**
 * Интеграция с 1С: разбор выгруженного отчёта об остатках.
 *
 * Отчёт задаёт сам себя — дата остатков и счета читаются из файла, а не
 * приходят параметрами запроса. Реальная выгрузка сводная: один лист держит
 * несколько секций вида «Счёт 43 (Готовая продукция)», у каждой своя шапка
 * колонок, а номенклатура между счетами повторяется. Поэтому разбор возвращает
 * не один отчёт, а по отчёту на счёт.
 *
 * Подписи колонок 1С меняет от отчёта к отчёту, поэтому они собраны в списки
 * ниже: добавить новый вариант заголовка можно, не трогая остальной разбор.
 */

/** Ищется по началу подписи: короткие слова как подстрока дают ложные срабатывания. */
export const warehouse1cNomenclatureCaptions = [
  "номенклатура",
  "наименование",
  "товар",
  "материал",
];

export const warehouse1cAccountCaptions = ["счет"];

/**
 * Ищется как подстрока. Для счетов 43 и 10.01 остаток активный, и 1С сама
 * сворачивает его в дебетовую колонку — отрицательное сальдо приходит в
 * «Ост.Дебет» со знаком минус, поэтому кредитовые колонки не нужны.
 */
export const warehouse1cOpeningBalanceCaptions = [
  "ост дебет нач",
  "ост нач",
  "нач ост",
  "остаток на начало",
  "сальдо на начало",
  "на начало периода",
  "начальный остаток",
];

export const warehouse1cClosingBalanceCaptions = [
  "ост дебет кон",
  "ост кон",
  "кон ост",
  "остаток на конец",
  "сальдо на конец",
  "на конец периода",
  "конечный остаток",
];

/** Строки итогов и оборотов в разрез номенклатуры не попадают. */
const warehouse1cTotalRowCaptions = ["итог", "всего", "оборот"];

const sectionHeadingPattern =
  /^\s*сч[её]т\s*[:№]?\s*(\d{1,3}(?:\.\d{1,2})*)\s*(?:\(([^)]*)\))?/iu;
const accountCodePattern = /^\d{1,3}(?:\.\d{1,2})*$/u;
const maxHeaderScanRows = 60;
const maxReportRows = 20_000;
const maxNomenclatureLength = 255;
const maxAccountCodeLength = 20;
const maxAccountLabelLength = 160;

export type ParsedWarehouse1cStockAccount = {
  accountCode: string;
  accountLabel: string;
  balances: Warehouse1cStockBalance[];
};

export type ParsedWarehouse1cStockReport = {
  reportDate: string;
  accounts: ParsedWarehouse1cStockAccount[];
  skippedDuplicates: number;
};

export type Warehouse1cStockReportParseResult =
  | { ok: true; value: ParsedWarehouse1cStockReport }
  | { ok: false; errors: string[] };

export function parseWarehouse1cStockReport(
  sheets: readonly XlsxSheet[],
): Warehouse1cStockReportParseResult {
  let firstFailure: Warehouse1cStockReportParseResult | undefined;

  for (const sheet of sheets) {
    const result = parseStockReportSheet(sheet);

    if (result.ok) return result;
    if (firstFailure === undefined) firstFailure = result;
  }

  return firstFailure ?? {
    ok: false,
    errors: ["В файле нет листов с остатками."],
  };
}

function parseStockReportSheet(
  sheet: XlsxSheet,
): Warehouse1cStockReportParseResult {
  const firstHeader = findStockReportColumns(sheet.rows);

  if (firstHeader === undefined) {
    return {
      ok: false,
      errors: [
        "Не нашли шапку таблицы с колонками «Номенклатура», «Ост. нач.» и «Ост. кон.».",
        describeSheetHead(sheet),
      ],
    };
  }

  const header = sheet.rows.slice(0, firstHeader.headerRow);
  const reportDate = readReportDate(header);

  if (reportDate === undefined) {
    return {
      ok: false,
      errors: [
        "В шапке отчёта нет даты, на которую считаются остатки.",
        describeSheetHead(sheet),
      ],
    };
  }

  const accountLabels = readAccountLabels(sheet.rows);
  const headerAccountCode = readAccountCode(header, sheet.name);
  const sections = new Map<string, ParsedWarehouse1cStockAccount>();
  const seenByAccount = new Map<string, Set<string>>();
  let columns = firstHeader;
  let sectionAccountCode = readLastSectionCodeBefore(
    sheet.rows,
    firstHeader.headerRow,
  );
  let skippedDuplicates = 0;
  let rowCount = 0;

  for (let index = firstHeader.headerRow + 1; index < sheet.rows.length; index += 1) {
    const section = readSectionHeadingAt(sheet.rows, index);

    if (section !== undefined) {
      sectionAccountCode = section.code;
      continue;
    }

    const nextHeader = readStockReportColumns(sheet.rows, index, 1);

    if (nextHeader !== undefined) {
      columns = nextHeader;
      continue;
    }

    const row = sheet.rows[index];
    const nomenclature = readNomenclature(row[columns.nomenclature]);

    if (nomenclature === undefined) continue;

    const accountCode = readRowAccountCode(row, columns) ??
      sectionAccountCode ??
      headerAccountCode;

    if (accountCode === undefined) continue;

    const identity = nomenclature.toLocaleLowerCase("ru-RU");
    const seen = seenByAccount.get(accountCode) ?? new Set<string>();

    seenByAccount.set(accountCode, seen);

    // Повтор считается в пределах счёта: одно наименование бывает и в 43, и в 10.01.
    if (seen.has(identity)) {
      skippedDuplicates += 1;
      continue;
    }

    seen.add(identity);

    const account = sections.get(accountCode) ?? {
      accountCode,
      accountLabel: accountLabels.get(accountCode) ?? `Счёт ${accountCode}`,
      balances: [],
    };

    sections.set(accountCode, account);
    account.balances.push({
      nomenclature,
      openingBalance: readWarehouse1cDecimal(row[columns.opening]),
      closingBalance: readWarehouse1cDecimal(row[columns.closing]),
    });
    rowCount += 1;

    if (rowCount >= maxReportRows) break;
  }

  const accounts = [...sections.values()];

  if (accounts.length === 0) {
    return {
      ok: false,
      errors: ["Под шапкой таблицы нет ни одной строки номенклатуры."],
    };
  }

  return { ok: true, value: { reportDate, accounts, skippedDuplicates } };
}

type StockReportColumns = {
  headerRow: number;
  nomenclature: number;
  opening: number;
  closing: number;
  account?: number;
};

/**
 * 1С разносит подпись колонки по двум строкам («Сальдо на начало периода» над
 * «Дебет»), поэтому шапка ищется и одной строкой, и парой соседних строк.
 */
function findStockReportColumns(rows: readonly XlsxCell[][]) {
  const limit = Math.min(rows.length, maxHeaderScanRows);

  for (let row = 0; row < limit; row += 1) {
    for (const span of [1, 2]) {
      const columns = readStockReportColumns(rows, row, span);

      if (columns !== undefined) return columns;
    }
  }

  return undefined;
}

function readStockReportColumns(
  rows: readonly XlsxCell[][],
  row: number,
  span: number,
): StockReportColumns | undefined {
  if (row + span > rows.length) return undefined;

  const captions = readMergedCaptions(rows, row, span);
  const nomenclature = captions.findIndex((caption) =>
    startsWithCaption(caption, warehouse1cNomenclatureCaptions));

  if (nomenclature === -1) return undefined;

  const opening = captions.findIndex((caption, index) =>
    index !== nomenclature &&
    containsCaption(caption, warehouse1cOpeningBalanceCaptions));

  if (opening === -1) return undefined;

  const closing = captions.findIndex((caption, index) =>
    index !== nomenclature &&
    index !== opening &&
    containsCaption(caption, warehouse1cClosingBalanceCaptions));

  if (closing === -1) return undefined;

  const account = captions.findIndex((caption, index) =>
    index !== nomenclature &&
    index !== opening &&
    index !== closing &&
    startsWithCaption(caption, warehouse1cAccountCaptions));

  return {
    headerRow: row + span - 1,
    nomenclature,
    opening,
    closing,
    ...(account === -1 ? {} : { account }),
  };
}

function readMergedCaptions(
  rows: readonly XlsxCell[][],
  row: number,
  span: number,
) {
  const width = Math.max(
    ...Array.from({ length: span }, (_, offset) => rows[row + offset]?.length ?? 0),
  );

  return Array.from({ length: width }, (_, column) =>
    normalizeCaption(
      Array.from({ length: span }, (_, offset) =>
        rows[row + offset]?.[column]?.text ?? "").join(" "),
    ));
}

function containsCaption(caption: string, expected: readonly string[]) {
  return caption !== "" &&
    expected.some((candidate) => caption.includes(candidate));
}

function startsWithCaption(caption: string, expected: readonly string[]) {
  return caption !== "" &&
    expected.some((candidate) => caption.startsWith(candidate));
}

function normalizeCaption(value: string) {
  return value
    .toLowerCase()
    .replace(/ё/gu, "е")
    .replace(/[^a-zа-я0-9]+/gu, " ")
    .trim();
}

/**
 * Подписи счетов берутся из строк-заголовков секций, а не из зашитого списка:
 * так фильтр показывает ровно то, как счёт назван в самой выгрузке.
 */
function readAccountLabels(rows: readonly XlsxCell[][]) {
  const labels = new Map<string, string>();

  for (let index = 0; index < rows.length; index += 1) {
    const section = readSectionHeadingAt(rows, index);

    if (section !== undefined) labels.set(section.code, section.label);
  }

  return labels;
}

/** Счёт первой секции стоит над её шапкой, а не под ней. */
function readLastSectionCodeBefore(rows: readonly XlsxCell[][], headerRow: number) {
  for (let index = headerRow - 1; index >= 0; index -= 1) {
    const section = readSectionHeadingAt(rows, index);

    if (section !== undefined) return section.code;
  }

  return undefined;
}

/** Заголовок секции — одиночная ячейка вида «Счёт 43 (Готовая продукция)». */
function readSectionHeadingAt(rows: readonly XlsxCell[][], index: number) {
  const filled = (rows[index] ?? []).filter((cell) => cell.text.trim() !== "");

  if (filled.length !== 1) return undefined;

  const text = filled[0].text.trim();
  const match = sectionHeadingPattern.exec(text);

  if (match === null) return undefined;

  return {
    code: match[1].slice(0, maxAccountCodeLength),
    label: text.slice(0, maxAccountLabelLength),
  };
}

function readRowAccountCode(
  row: readonly XlsxCell[],
  columns: StockReportColumns,
) {
  if (columns.account === undefined) return undefined;

  const value = (row[columns.account]?.text ?? "").trim();

  return accountCodePattern.test(value)
    ? value.slice(0, maxAccountCodeLength)
    : undefined;
}

function readNomenclature(cell: XlsxCell | undefined) {
  const value = (cell?.text ?? "").replace(/\s+/gu, " ").trim();

  if (value === "") return undefined;

  const normalized = normalizeCaption(value);

  if (
    warehouse1cTotalRowCaptions.some((caption) => normalized.startsWith(caption))
  ) {
    return undefined;
  }

  if (
    startsWithCaption(normalized, warehouse1cNomenclatureCaptions) ||
    containsCaption(normalized, warehouse1cOpeningBalanceCaptions) ||
    containsCaption(normalized, warehouse1cClosingBalanceCaptions)
  ) {
    return undefined;
  }

  return value.slice(0, maxNomenclatureLength);
}

/**
 * Остатки хранятся десятичной строкой: `decimal(18,3)` в базе не теряет
 * копейки и килограммы, а число с плавающей точкой в JSON — теряет. 1С отдаёт
 * их текстом с неразрывными пробелами между разрядами и запятой в дроби.
 */
export function readWarehouse1cDecimal(cell: XlsxCell | undefined) {
  if (cell === undefined) return "";

  if (cell.number !== undefined && Number.isFinite(cell.number)) {
    return formatDecimal(cell.number);
  }

  const text = cell.text
    .replace(/[\s']/gu, "")
    .replace(/,/gu, ".");
  const isNegative = /^\(.+\)$/u.test(text);
  const digits = isNegative ? text.slice(1, -1) : text;

  if (!/^-?\d+(?:\.\d+)?$/u.test(digits)) return "";

  const value = Number(digits);

  return Number.isFinite(value)
    ? formatDecimal(isNegative ? -value : value)
    : "";
}

function formatDecimal(value: number) {
  const text = value.toFixed(3).replace(/0+$/u, "").replace(/\.$/u, "");
  return text === "-0" ? "0" : text;
}

const russianMonthPattern =
  "январ|феврал|март|апрел|ма[йя]|июн|июл|август|сентябр|октябр|ноябр|декабр";
const russianMonthStems = [
  "январ",
  "феврал",
  "март",
  "апрел",
  "ма",
  "июн",
  "июл",
  "август",
  "сентябр",
  "октябр",
  "ноябр",
  "декабр",
];

/**
 * Период отчёта может быть диапазоном («Период: 01.08.2026 - 23.08.2026»), а
 * конечный остаток относится к его концу, поэтому берётся самая поздняя дата.
 */
function readReportDate(header: readonly XlsxCell[][]) {
  const dates: string[] = [];

  for (const row of header) {
    for (const cell of row) {
      if (cell.date !== undefined) dates.push(cell.date);
      dates.push(...readDatesFromText(cell.text));
    }
  }

  return dates.length === 0
    ? undefined
    : dates.reduce((latest, date) => (date > latest ? date : latest));
}

function readDatesFromText(value: string) {
  const dates: string[] = [];

  for (const match of value.matchAll(/(\d{4})-(\d{2})-(\d{2})/gu)) {
    addDate(dates, match[1], match[2], match[3]);
  }

  for (const match of value.matchAll(/(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})/gu)) {
    addDate(dates, match[3], match[2], match[1]);
  }

  const monthly = new RegExp(
    `(\\d{1,2})\\s+(${russianMonthPattern})[а-яё]*\\s+(\\d{4})`,
    "giu",
  );

  for (const match of value.matchAll(monthly)) {
    const month = russianMonthStems.findIndex((stem) =>
      match[2].toLowerCase().startsWith(stem));

    if (month !== -1) {
      addDate(dates, match[3], String(month + 1), match[1]);
    }
  }

  return dates;
}

function addDate(dates: string[], year: string, month: string, day: string) {
  const yearValue = Number(year);
  const monthValue = Number(month);
  const dayValue = Number(day);

  if (
    yearValue < 2000 || yearValue > 2100 ||
    monthValue < 1 || monthValue > 12 ||
    dayValue < 1 || dayValue > 31
  ) {
    return;
  }

  dates.push(
    `${year}-${String(monthValue).padStart(2, "0")}-${
      String(dayValue).padStart(2, "0")
    }`,
  );
}

/** Запасной источник счёта для выгрузки без секций и без колонки «Счет». */
function readAccountCode(header: readonly XlsxCell[][], sheetName: string) {
  const sources = [
    ...header.flatMap((row) => row.map((cell) => cell.text)),
    sheetName,
  ];

  for (const source of sources) {
    const match = /сч[её]т[а-яё]*\s*[:№]?\s*(\d{1,3}(?:\.\d{1,2})*)/iu
      .exec(source);

    if (match !== null) return match[1].slice(0, maxAccountCodeLength);
  }

  return undefined;
}

function describeSheetHead(sheet: XlsxSheet) {
  const lines = sheet.rows
    .slice(0, maxHeaderScanRows)
    .map((row) => row.map((cell) => cell.text).filter((text) => text !== "").join(" | "))
    .filter((line) => line !== "")
    .slice(0, 5);

  return lines.length === 0
    ? `Лист «${sheet.name}» пуст.`
    : `Первые строки листа «${sheet.name}»: ${lines.join(" ⁄ ")}.`;
}
