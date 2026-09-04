/**
 * Интеграция с 1С: отправитель отчётов шлёт `multipart/form-data`, а не JSON.
 * Разбор держится здесь, потому что это транспорт HTTP, а не доменное правило,
 * и потому что кроме приёмника 1С такой формат в проекте больше нигде не нужен.
 */
export type MultipartFile = {
  fieldName: string;
  fileName: string;
  contentType: string;
  content: Buffer;
};

export type MultipartFormData = {
  fields: Record<string, string>;
  files: MultipartFile[];
};

const maxParts = 32;
const maxFieldValueBytes = 10_000;

export function readMultipartBoundary(contentType: string | undefined) {
  if (contentType === undefined) return undefined;
  if (!/^\s*multipart\/form-data\s*;/iu.test(contentType)) return undefined;

  const boundary = /;\s*boundary=(?:"([^"]+)"|([^;\s]+))/iu.exec(contentType);
  const value = boundary?.[1] ?? boundary?.[2];

  return value === undefined || value.length === 0 || value.length > 200
    ? undefined
    : value;
}

export function parseMultipartFormData(
  body: Buffer,
  boundary: string,
): MultipartFormData | undefined {
  const delimiter = Buffer.from(`--${boundary}`, "utf8");
  const form: MultipartFormData = { fields: {}, files: [] };
  let cursor = body.indexOf(delimiter);

  if (cursor === -1) return undefined;

  for (let index = 0; index < maxParts; index += 1) {
    cursor += delimiter.length;

    if (body.subarray(cursor, cursor + 2).toString("latin1") === "--") {
      return form;
    }

    const headerStart = skipLineBreak(body, cursor);
    const headerEnd = body.indexOf("\r\n\r\n", headerStart, "latin1");

    if (headerEnd === -1) return undefined;

    const next = body.indexOf(delimiter, headerEnd);

    if (next === -1) return undefined;

    const part = readPart(
      body.toString("utf8", headerStart, headerEnd),
      body.subarray(headerEnd + 4, trimTrailingLineBreak(body, next)),
    );

    if (part === undefined) return undefined;

    if (part.kind === "file") {
      form.files.push(part.file);
    } else if (part.value.length <= maxFieldValueBytes) {
      form.fields[part.name] = part.value.toString("utf8");
    }

    cursor = next;
  }

  return undefined;
}

type ParsedPart =
  | { kind: "file"; file: MultipartFile }
  | { kind: "field"; name: string; value: Buffer };

function readPart(headers: string, content: Buffer): ParsedPart | undefined {
  const disposition = readHeader(headers, "content-disposition");

  if (disposition === undefined) return undefined;

  const name = readDispositionParameter(disposition, "name");

  if (name === undefined) return undefined;

  const fileName = readDispositionParameter(disposition, "filename");

  return fileName === undefined
    ? { kind: "field", name, value: content }
    : {
        kind: "file",
        file: {
          fieldName: name,
          fileName,
          contentType: readHeader(headers, "content-type") ??
            "application/octet-stream",
          content,
        },
      };
}

function readHeader(headers: string, name: string) {
  for (const line of headers.split("\r\n")) {
    const separator = line.indexOf(":");

    if (separator === -1) continue;
    if (line.slice(0, separator).trim().toLowerCase() !== name) continue;

    return line.slice(separator + 1).trim();
  }

  return undefined;
}

function readDispositionParameter(disposition: string, name: string) {
  const quoted = new RegExp(`;\\s*${name}="([^"]*)"`, "iu").exec(disposition);

  if (quoted?.[1] !== undefined) return decodeParameter(quoted[1]);

  const encoded = new RegExp(`;\\s*${name}\\*=([^;]+)`, "iu").exec(disposition);
  const extended = encoded?.[1]?.trim();

  if (extended !== undefined) {
    const value = /^utf-8''(.*)$/iu.exec(extended)?.[1];
    if (value !== undefined) return decodeParameter(value);
  }

  const bare = new RegExp(`;\\s*${name}=([^;]+)`, "iu").exec(disposition);

  return bare?.[1] === undefined ? undefined : decodeParameter(bare[1].trim());
}

function decodeParameter(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function skipLineBreak(body: Buffer, offset: number) {
  return body.subarray(offset, offset + 2).toString("latin1") === "\r\n"
    ? offset + 2
    : offset;
}

function trimTrailingLineBreak(body: Buffer, offset: number) {
  return body.subarray(offset - 2, offset).toString("latin1") === "\r\n"
    ? offset - 2
    : offset;
}
