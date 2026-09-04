import assert from "node:assert/strict";
import test from "node:test";
import {
  parseMultipartFormData,
  readMultipartBoundary,
} from "./multipartFormData.js";

test("multipart boundary is read only from form-data requests", () => {
  assert.equal(
    readMultipartBoundary("multipart/form-data; boundary=abc123"),
    "abc123",
  );
  assert.equal(
    readMultipartBoundary('multipart/form-data; boundary="a b c"'),
    "a b c",
  );
  assert.equal(readMultipartBoundary("application/json"), undefined);
  assert.equal(readMultipartBoundary("multipart/form-data"), undefined);
  assert.equal(readMultipartBoundary(undefined), undefined);
});

test("multipart body keeps binary files and text fields apart", () => {
  const boundary = "----smbBoundary";
  const fileContent = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x0d, 0x0a]);
  const body = buildMultipartBody(boundary, [
    {
      headers:
        'Content-Disposition: form-data; name="file"; filename="Остатки.xlsx"\r\n' +
        "Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      content: fileContent,
    },
    {
      headers: 'Content-Disposition: form-data; name="timestamp"',
      content: Buffer.from("2026-08-23T06:00:00", "utf8"),
    },
    {
      headers: 'Content-Disposition: form-data; name="source"',
      content: Buffer.from("1С:Предприятие", "utf8"),
    },
  ]);

  const form = parseMultipartFormData(body, boundary);

  assert.deepEqual(form?.fields, {
    timestamp: "2026-08-23T06:00:00",
    source: "1С:Предприятие",
  });
  assert.equal(form?.files.length, 1);
  assert.equal(form?.files[0].fieldName, "file");
  assert.equal(form?.files[0].fileName, "Остатки.xlsx");
  // Байты файла не должны потерять завершающий CRLF внутри содержимого.
  assert.deepEqual([...(form?.files[0].content ?? [])], [...fileContent]);
});

test("multipart body without the boundary is rejected", () => {
  const body = buildMultipartBody("----other", [
    {
      headers: 'Content-Disposition: form-data; name="source"',
      content: Buffer.from("1С", "utf8"),
    },
  ]);

  assert.equal(parseMultipartFormData(body, "----smbBoundary"), undefined);
});

function buildMultipartBody(
  boundary: string,
  parts: { headers: string; content: Buffer }[],
) {
  const chunks: Buffer[] = [];

  for (const part of parts) {
    chunks.push(
      Buffer.from(`--${boundary}\r\n${part.headers}\r\n\r\n`, "utf8"),
      part.content,
      Buffer.from("\r\n", "utf8"),
    );
  }

  chunks.push(Buffer.from(`--${boundary}--\r\n`, "utf8"));

  return Buffer.concat(chunks);
}
