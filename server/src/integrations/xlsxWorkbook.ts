import { inflateRawSync } from "node:zlib";

/**
 * Интеграция с 1С: приёмник отчётов читает `.xlsx` без внешней библиотеки.
 * `.xlsx` — это ZIP с XML внутри, а `node:zlib` уже умеет `deflate`, поэтому
 * отдельная зависимость ради двух колонок остатков не нужна. Читается только
 * то, что нужно разбору отчёта: подписи, числа и даты ячеек.
 */
export class XlsxFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "XlsxFormatError";
  }
}

export type XlsxCell = {
  /** Текст ячейки как он виден в редакторе. */
  text: string;
  /** Число, если ячейка числовая. */
  number?: number;
  /** `YYYY-MM-DD`, если ячейка отформатирована как дата. */
  date?: string;
};

export type XlsxSheet = {
  name: string;
  rows: XlsxCell[][];
};

const zipLocalHeaderSignature = 0x04034b50;
const zipCentralHeaderSignature = 0x02014b50;
const zipEndOfDirectorySignature = 0x06054b50;
const zip64Marker = 0xffffffff;
const maxEndOfDirectoryScanBytes = 66_000;
const maxEntryBytes = 40_000_000;
const maxSheetRows = 100_000;
const maxSheetColumns = 512;
/** Встроенные форматы Excel, которые всегда означают дату. */
const builtinDateFormatIds = new Set([
  14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36,
  45, 46, 47, 50, 51, 52, 53, 54, 55, 56, 57, 58,
]);

export function readXlsxWorkbook(file: Buffer): XlsxSheet[] {
  const archive = readZipArchive(file);
  const workbookXml = readTextEntry(archive, "xl/workbook.xml");

  if (workbookXml === undefined) {
    throw new XlsxFormatError("Файл не похож на книгу Excel (.xlsx).");
  }

  const relationships = parseRelationships(
    readTextEntry(archive, "xl/_rels/workbook.xml.rels") ?? "",
  );
  const sharedStrings = parseSharedStrings(
    readTextEntry(archive, "xl/sharedStrings.xml") ?? "",
  );
  const dateStyles = parseDateStyles(
    readTextEntry(archive, "xl/styles.xml") ?? "",
  );
  const isDate1904 = /date1904="(?:1|true)"/u.test(workbookXml);
  const sheets: XlsxSheet[] = [];

  for (const sheet of parseWorkbookSheets(workbookXml)) {
    const target = relationships.get(sheet.relationshipId);
    const path = target === undefined
      ? undefined
      : resolveWorkbookPath(target);
    const sheetXml = path === undefined
      ? undefined
      : readTextEntry(archive, path);

    if (sheetXml === undefined) continue;

    sheets.push({
      name: sheet.name,
      rows: parseSheetRows(sheetXml, {
        sharedStrings,
        dateStyles,
        isDate1904,
      }),
    });
  }

  if (sheets.length === 0) {
    throw new XlsxFormatError("В книге Excel нет ни одного листа с данными.");
  }

  return sheets;
}

type ZipArchive = Map<string, () => Buffer>;

function readZipArchive(file: Buffer): ZipArchive {
  const directoryEnd = findEndOfCentralDirectory(file);

  if (directoryEnd === undefined) {
    throw new XlsxFormatError("Файл не является архивом .xlsx.");
  }

  const entryCount = file.readUInt16LE(directoryEnd + 10);
  const directoryOffset = file.readUInt32LE(directoryEnd + 16);

  if (entryCount === 0xffff || directoryOffset === zip64Marker) {
    throw new XlsxFormatError("Формат ZIP64 не поддерживается.");
  }

  const archive: ZipArchive = new Map();
  let cursor = directoryOffset;

  for (let index = 0; index < entryCount; index += 1) {
    if (
      cursor + 46 > file.length ||
      file.readUInt32LE(cursor) !== zipCentralHeaderSignature
    ) {
      throw new XlsxFormatError("Повреждён каталог архива .xlsx.");
    }

    const compressionMethod = file.readUInt16LE(cursor + 10);
    const compressedSize = file.readUInt32LE(cursor + 20);
    const uncompressedSize = file.readUInt32LE(cursor + 24);
    const nameLength = file.readUInt16LE(cursor + 28);
    const extraLength = file.readUInt16LE(cursor + 30);
    const commentLength = file.readUInt16LE(cursor + 32);
    const localOffset = file.readUInt32LE(cursor + 42);
    const name = file.toString("utf8", cursor + 46, cursor + 46 + nameLength);

    if (compressedSize === zip64Marker || uncompressedSize === zip64Marker) {
      throw new XlsxFormatError("Формат ZIP64 не поддерживается.");
    }

    archive.set(name, () =>
      readZipEntry(file, {
        localOffset,
        compressionMethod,
        compressedSize,
        uncompressedSize,
      }));
    cursor += 46 + nameLength + extraLength + commentLength;
  }

  return archive;
}

function readZipEntry(
  file: Buffer,
  entry: {
    localOffset: number;
    compressionMethod: number;
    compressedSize: number;
    uncompressedSize: number;
  },
): Buffer {
  if (entry.uncompressedSize > maxEntryBytes) {
    throw new XlsxFormatError("Отчёт Excel слишком большой для разбора.");
  }

  if (
    entry.localOffset + 30 > file.length ||
    file.readUInt32LE(entry.localOffset) !== zipLocalHeaderSignature
  ) {
    throw new XlsxFormatError("Повреждена запись архива .xlsx.");
  }

  const nameLength = file.readUInt16LE(entry.localOffset + 26);
  const extraLength = file.readUInt16LE(entry.localOffset + 28);
  const start = entry.localOffset + 30 + nameLength + extraLength;
  const content = file.subarray(start, start + entry.compressedSize);

  if (entry.compressionMethod === 0) return Buffer.from(content);

  if (entry.compressionMethod !== 8) {
    throw new XlsxFormatError("Архив .xlsx использует неизвестное сжатие.");
  }

  try {
    return inflateRawSync(content, { maxOutputLength: maxEntryBytes });
  } catch {
    throw new XlsxFormatError("Не удалось распаковать файл .xlsx.");
  }
}

function findEndOfCentralDirectory(file: Buffer) {
  const from = Math.max(0, file.length - maxEndOfDirectoryScanBytes);

  for (let offset = file.length - 22; offset >= from; offset -= 1) {
    if (file.readUInt32LE(offset) === zipEndOfDirectorySignature) return offset;
  }

  return undefined;
}

function readTextEntry(archive: ZipArchive, name: string) {
  const read = archive.get(name);
  return read === undefined ? undefined : read().toString("utf8");
}

function parseRelationships(xml: string) {
  const relationships = new Map<string, string>();

  for (const tag of xml.match(/<Relationship\b[^>]*>/gu) ?? []) {
    const id = readAttribute(tag, "Id");
    const target = readAttribute(tag, "Target");
    if (id !== undefined && target !== undefined) relationships.set(id, target);
  }

  return relationships;
}

function parseWorkbookSheets(xml: string) {
  const sheets: { name: string; relationshipId: string }[] = [];

  for (const tag of xml.match(/<sheet\b[^>]*>/gu) ?? []) {
    const name = readAttribute(tag, "name");
    const relationshipId = readAttribute(tag, "r:id");
    if (name !== undefined && relationshipId !== undefined) {
      sheets.push({ name, relationshipId });
    }
  }

  return sheets;
}

function resolveWorkbookPath(target: string) {
  const cleaned = target.replace(/^\/xl\//u, "").replace(/^\.\//u, "");
  return cleaned.startsWith("xl/") ? cleaned : `xl/${cleaned}`;
}

function parseSharedStrings(xml: string) {
  const strings: string[] = [];

  for (const match of xml.matchAll(/<si\b[^>]*\/>|<si\b[^>]*>([\s\S]*?)<\/si>/gu)) {
    strings.push(readSharedStringText(match[1] ?? ""));
  }

  return strings;
}

function readSharedStringText(item: string) {
  const withoutPhonetics = item.replace(/<rPh\b[\s\S]*?<\/rPh>/gu, "");
  let text = "";

  for (const match of withoutPhonetics.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/gu)) {
    text += decodeXmlText(match[1] ?? "");
  }

  return text;
}

function parseDateStyles(xml: string) {
  const formatCodes = new Map<number, string>();

  for (const tag of xml.match(/<numFmt\b[^>]*>/gu) ?? []) {
    const id = Number(readAttribute(tag, "numFmtId"));
    const code = readAttribute(tag, "formatCode");
    if (Number.isInteger(id) && code !== undefined) {
      formatCodes.set(id, decodeXmlText(code));
    }
  }

  const cellFormats = /<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/u.exec(xml)?.[1] ?? "";
  const isDateByStyleIndex: boolean[] = [];

  for (const tag of cellFormats.match(/<xf\b[^>]*>/gu) ?? []) {
    const id = Number(readAttribute(tag, "numFmtId") ?? "0");
    isDateByStyleIndex.push(
      builtinDateFormatIds.has(id) || isDateFormatCode(formatCodes.get(id)),
    );
  }

  return isDateByStyleIndex;
}

function isDateFormatCode(code: string | undefined) {
  if (code === undefined) return false;

  const withoutLiterals = code
    .replace(/"[^"]*"/gu, "")
    .replace(/\[[^\]]*\]/gu, "")
    .replace(/\\./gu, "");

  return /[dy]/iu.test(withoutLiterals);
}

function parseSheetRows(
  xml: string,
  reference: {
    sharedStrings: string[];
    dateStyles: boolean[];
    isDate1904: boolean;
  },
) {
  const rows: XlsxCell[][] = [];
  let fallbackRowIndex = 0;

  for (const match of xml.matchAll(/<row\b([^>]*)\/>|<row\b([^>]*)>([\s\S]*?)<\/row>/gu)) {
    const attributes = match[1] ?? match[2] ?? "";
    const declaredIndex = Number(readAttribute(`<row ${attributes}>`, "r"));
    const rowIndex = Number.isInteger(declaredIndex) && declaredIndex > 0
      ? declaredIndex - 1
      : fallbackRowIndex;

    fallbackRowIndex = rowIndex + 1;

    if (rowIndex >= maxSheetRows) break;

    while (rows.length <= rowIndex) rows.push([]);
    rows[rowIndex] = parseSheetCells(match[3] ?? "", reference);
  }

  return rows;
}

function parseSheetCells(
  row: string,
  reference: {
    sharedStrings: string[];
    dateStyles: boolean[];
    isDate1904: boolean;
  },
) {
  const cells: XlsxCell[] = [];
  let fallbackColumnIndex = 0;

  for (const match of row.matchAll(/<c\b([^>]*)\/>|<c\b([^>]*)>([\s\S]*?)<\/c>/gu)) {
    const attributes = `<c ${match[1] ?? match[2] ?? ""}>`;
    const declaredColumn = readColumnIndex(readAttribute(attributes, "r"));
    const columnIndex = declaredColumn ?? fallbackColumnIndex;

    fallbackColumnIndex = columnIndex + 1;

    if (columnIndex >= maxSheetColumns) break;

    while (cells.length <= columnIndex) cells.push({ text: "" });
    cells[columnIndex] = readCell(
      attributes,
      match[3] ?? "",
      reference,
    );
  }

  return cells;
}

function readCell(
  attributes: string,
  content: string,
  reference: {
    sharedStrings: string[];
    dateStyles: boolean[];
    isDate1904: boolean;
  },
): XlsxCell {
  const type = readAttribute(attributes, "t") ?? "n";
  const rawValue = decodeXmlText(
    /<v\b[^>]*>([\s\S]*?)<\/v>/u.exec(content)?.[1] ?? "",
  );

  if (type === "s") {
    const index = Number(rawValue);
    return {
      text: Number.isInteger(index) ? reference.sharedStrings[index] ?? "" : "",
    };
  }

  if (type === "inlineStr") {
    return { text: readSharedStringText(content) };
  }

  if (type === "str" || type === "e") {
    return { text: rawValue };
  }

  if (type === "b") {
    return { text: rawValue === "1" ? "ИСТИНА" : "ЛОЖЬ" };
  }

  if (rawValue === "") return { text: "" };

  const value = Number(rawValue);

  if (!Number.isFinite(value)) return { text: rawValue };

  const styleIndex = Number(readAttribute(attributes, "s") ?? "0");
  const isDate = Number.isInteger(styleIndex) &&
    reference.dateStyles[styleIndex] === true;
  const date = isDate
    ? readExcelSerialDate(value, reference.isDate1904)
    : undefined;

  return {
    text: date ?? rawValue,
    number: value,
    ...(date === undefined ? {} : { date }),
  };
}

/**
 * Excel считает дни от 1900-01-00 и держит несуществующее 29.02.1900, поэтому
 * до серийного номера 60 отсчёт сдвинут на день.
 */
function readExcelSerialDate(serial: number, isDate1904: boolean) {
  if (serial < 1 || serial > 2_958_465) return undefined;

  const epoch = isDate1904
    ? Date.UTC(1904, 0, 1)
    : serial < 60
      ? Date.UTC(1899, 11, 31)
      : Date.UTC(1899, 11, 30);
  const date = new Date(epoch + Math.floor(serial) * 86_400_000);

  return Number.isNaN(date.getTime())
    ? undefined
    : date.toISOString().slice(0, 10);
}

function readColumnIndex(cellReference: string | undefined) {
  const letters = /^([A-Z]+)/u.exec(cellReference ?? "")?.[1];

  if (letters === undefined) return undefined;

  let index = 0;

  for (const letter of letters) {
    index = index * 26 + (letter.charCodeAt(0) - 64);
  }

  return index - 1;
}

function readAttribute(tag: string, name: string) {
  const pattern = new RegExp(`\\s${escapeRegExp(name)}="([^"]*)"`, "u");
  const value = pattern.exec(tag)?.[1];
  return value === undefined ? undefined : value;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function decodeXmlText(value: string) {
  return value.replace(
    /&(?:amp|lt|gt|quot|apos|#x?[0-9a-fA-F]+);/gu,
    (entity) => {
      if (entity === "&amp;") return "&";
      if (entity === "&lt;") return "<";
      if (entity === "&gt;") return ">";
      if (entity === "&quot;") return '"';
      if (entity === "&apos;") return "'";

      const code = entity.startsWith("&#x") || entity.startsWith("&#X")
        ? Number.parseInt(entity.slice(3, -1), 16)
        : Number.parseInt(entity.slice(2, -1), 10);

      return Number.isInteger(code) && code >= 0 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : entity;
    },
  );
}
