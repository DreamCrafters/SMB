import assert from "node:assert/strict";
import test from "node:test";
import {
  detectCollegiumAttachmentType,
  readCollegiumAttachmentFileName,
  readCollegiumAttachmentLink,
} from "./collegiumAttachment.js";

/** Minimal stored ZIP with a central directory, enough for the catalog check. */
function buildStoredZip(names: readonly string[]) {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const name of names) {
    const nameBytes = Buffer.from(name, "utf8");
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(nameBytes.length, 26);
    locals.push(local, nameBytes);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBytes);
    offset += local.length + nameBytes.length;
  }
  const directory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(names.length, 8);
  end.writeUInt16LE(names.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}

test("attachment type comes from the content and must match the extension", () => {
  const pdf = Buffer.from("%PDF-1.7\n%…");
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]);
  const docx = buildStoredZip(["[Content_Types].xml", "word/document.xml"]);
  const xlsx = buildStoredZip(["[Content_Types].xml", "xl/workbook.xml"]);

  assert.equal(detectCollegiumAttachmentType("Расчёт.pdf", pdf), "pdf");
  assert.equal(detectCollegiumAttachmentType("схема.PNG", png), "png");
  assert.equal(detectCollegiumAttachmentType("фото.jpeg", jpeg), "jpeg");
  assert.equal(detectCollegiumAttachmentType("фото.jpg", jpeg), "jpeg");
  assert.equal(detectCollegiumAttachmentType("Записка.docx", docx), "docx");
  assert.equal(detectCollegiumAttachmentType("Эффект.xlsx", xlsx), "xlsx");

  assert.throws(() => detectCollegiumAttachmentType("Расчёт.docx", pdf), /не соответствует/u);
  assert.throws(() => detectCollegiumAttachmentType("Эффект.xlsx", docx), /не соответствует/u);
  assert.throws(() => detectCollegiumAttachmentType("a.pdf", Buffer.from("<html>")), /не соответствует/u);
  assert.throws(() => detectCollegiumAttachmentType("a.pdf", Buffer.alloc(0)), /пустой/u);
  assert.throws(
    () => detectCollegiumAttachmentType("a.docx", buildStoredZip(["[Content_Types].xml"])),
    /не соответствует/u,
  );
  assert.throws(
    () => detectCollegiumAttachmentType(
      "Макрос.xlsx",
      buildStoredZip(["[Content_Types].xml", "xl/workbook.xml", "xl/vbaProject.bin"]),
    ),
    /макросами/u,
  );
});

test("attachment names and links are validated before use", () => {
  assert.equal(readCollegiumAttachmentFileName("  Отчёт   ОТК.pdf "), "Отчёт ОТК.pdf");
  for (const name of [null, "", "../secret.pdf", "a\\b.pdf", "evil\u0000.pdf", "script.exe", "a.docm"]) {
    assert.throws(() => readCollegiumAttachmentFileName(name), JSON.stringify(name));
  }
  assert.deepEqual(
    readCollegiumAttachmentLink({ url: " https://drive.google.com/file/d/1 ", label: "Расчёт" }),
    { url: "https://drive.google.com/file/d/1", label: "Расчёт" },
  );
  assert.throws(() => readCollegiumAttachmentLink({ url: "javascript:alert(1)", label: "x" }), /http/u);
  assert.throws(() => readCollegiumAttachmentLink({ url: "https://x.ru", label: " " }), /Подпишите/u);
  assert.throws(() => readCollegiumAttachmentLink({ url: "https://x.ru", label: "x", extra: 1 }), /неизвестные/u);
});
