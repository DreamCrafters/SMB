import assert from "node:assert/strict";
import test from "node:test";
import { deflateRawSync } from "node:zlib";
import { readXlsxWorkbook, XlsxFormatError } from "./xlsxWorkbook.js";

test("xlsx reader returns shared strings, numbers and formatted dates", () => {
  const workbook = readXlsxWorkbook(buildStockReportWorkbook());
  const sheet = workbook[0];

  assert.equal(workbook.length, 1);
  assert.equal(sheet.name, "Остатки");
  assert.equal(sheet.rows[0][0]?.text, "Остатки по счету 43 «Готовая продукция»");
  // Дата хранится числом с датным форматом, а не строкой.
  assert.equal(sheet.rows[1][0]?.text, "Период");
  assert.equal(sheet.rows[1][1]?.date, "2026-08-23");
  assert.deepEqual(
    sheet.rows[3].map((cell) => cell.text),
    ["Номенклатура", "Ост. нач.", "Ост. кон."],
  );
  assert.equal(sheet.rows[4][0]?.text, "ША-8 & «Стандарт»");
  assert.equal(sheet.rows[4][1]?.number, 12.5);
  // Пропущенная ячейка B6 не сдвигает колонку C6.
  assert.equal(sheet.rows[5][1]?.text, "");
  assert.equal(sheet.rows[5][2]?.number, 3);
});

test("xlsx reader rejects files that are not workbooks", () => {
  assert.throws(
    () => readXlsxWorkbook(Buffer.from("не архив")),
    XlsxFormatError,
  );
  assert.throws(
    () => readXlsxWorkbook(buildZipArchive([
      { name: "readme.txt", content: "просто текст" },
    ])),
    XlsxFormatError,
  );
});

function buildStockReportWorkbook() {
  return buildZipArchive([
    {
      name: "xl/workbook.xml",
      content:
        `<?xml version="1.0"?><workbook><sheets>` +
        `<sheet name="Остатки" sheetId="1" r:id="rId1"/>` +
        `</sheets></workbook>`,
    },
    {
      name: "xl/_rels/workbook.xml.rels",
      content:
        `<?xml version="1.0"?><Relationships>` +
        `<Relationship Id="rId1" Target="worksheets/sheet1.xml"/>` +
        `</Relationships>`,
    },
    {
      name: "xl/styles.xml",
      content:
        `<?xml version="1.0"?><styleSheet>` +
        `<numFmts><numFmt numFmtId="165" formatCode="dd.mm.yyyy"/></numFmts>` +
        `<cellXfs count="3">` +
        `<xf numFmtId="0"/><xf numFmtId="165"/><xf numFmtId="4"/>` +
        `</cellXfs></styleSheet>`,
    },
    {
      name: "xl/sharedStrings.xml",
      content:
        `<?xml version="1.0"?><sst>` +
        `<si><t>Остатки по счету 43 &#171;Готовая продукция&#187;</t></si>` +
        `<si><t>Период</t></si>` +
        `<si><t>Номенклатура</t></si>` +
        `<si><t>Ост. нач.</t></si>` +
        `<si><t>Ост. кон.</t></si>` +
        `<si><t>ША-8 &amp; &#171;Стандарт&#187;</t></si>` +
        `<si><t>ШБ-5</t></si>` +
        `</sst>`,
    },
    {
      name: "xl/worksheets/sheet1.xml",
      content:
        `<?xml version="1.0"?><worksheet><sheetData>` +
        `<row r="1"><c r="A1" t="s"><v>0</v></c></row>` +
        `<row r="2"><c r="A2" t="s"><v>1</v></c><c r="B2" s="1"><v>46257</v></c></row>` +
        `<row r="3"/>` +
        `<row r="4">` +
        `<c r="A4" t="s"><v>2</v></c>` +
        `<c r="B4" t="s"><v>3</v></c>` +
        `<c r="C4" t="s"><v>4</v></c>` +
        `</row>` +
        `<row r="5">` +
        `<c r="A5" t="s"><v>5</v></c>` +
        `<c r="B5" s="2"><v>12.5</v></c>` +
        `<c r="C5" s="2"><v>10</v></c>` +
        `</row>` +
        `<row r="6">` +
        `<c r="A6" t="inlineStr"><is><t>ШБ-5</t></is></c>` +
        `<c r="C6" s="2"><v>3</v></c>` +
        `</row>` +
        `</sheetData></worksheet>`,
    },
  ]);
}

function buildZipArchive(entries: { name: string; content: string }[]) {
  const locals: Buffer[] = [];
  const directory: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name, "utf8");
    const compressed = deflateRawSync(Buffer.from(entry.content, "utf8"));
    const uncompressedSize = Buffer.byteLength(entry.content, "utf8");
    const localHeader = Buffer.alloc(30);

    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(8, 8);
    localHeader.writeUInt32LE(compressed.length, 18);
    localHeader.writeUInt32LE(uncompressedSize, 22);
    localHeader.writeUInt16LE(name.length, 26);
    locals.push(localHeader, name, compressed);

    const centralHeader = Buffer.alloc(46);

    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(8, 10);
    centralHeader.writeUInt32LE(compressed.length, 20);
    centralHeader.writeUInt32LE(uncompressedSize, 24);
    centralHeader.writeUInt16LE(name.length, 28);
    centralHeader.writeUInt32LE(offset, 42);
    directory.push(centralHeader, name);

    offset += localHeader.length + name.length + compressed.length;
  }

  const directoryBuffer = Buffer.concat(directory);
  const end = Buffer.alloc(22);

  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directoryBuffer.length, 12);
  end.writeUInt32LE(offset, 16);

  return Buffer.concat([...locals, directoryBuffer, end]);
}
