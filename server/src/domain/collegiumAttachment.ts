import {
  collegiumAttachmentFileTypes,
  collegiumAttachmentLimits,
  type CollegiumAttachmentFileType,
} from "../contracts/collegiumInitiatives.js";
import { listZipEntryNames } from "../integrations/xlsxWorkbook.js";
import type { CollegiumAttachmentOwner } from "../repositories/collegiumInitiativesRepository.js";
import { CollegiumInitiativeError } from "./collegiumInitiative.js";

/**
 * Имя файла приходит с клиента и попадает в Content-Disposition, поэтому
 * управляющие символы и разделители путей отклоняются, а расширение должно
 * относиться к разрешённому типу.
 */
export function readCollegiumAttachmentFileName(value: string | null) {
  if (value === null) {
    throw new CollegiumInitiativeError("Укажите имя файла.");
  }
  const normalized = value.normalize("NFKC").trim().replace(/\s+/gu, " ");
  if (
    normalized.length === 0 ||
    normalized.length > collegiumAttachmentLimits.maxLabelLength ||
    /[\\/\u0000-\u001f\u007f]/u.test(normalized)
  ) {
    throw new CollegiumInitiativeError("Проверьте имя файла.");
  }
  if (readExtensionType(normalized) === undefined) {
    throw new CollegiumInitiativeError("Можно прикладывать PDF, DOCX, XLSX, PNG и JPEG.");
  }
  return normalized;
}

/**
 * Тип определяется по содержимому, а не по заголовку клиента; расширение
 * имени должно совпадать с найденным типом. DOCX и XLSX проверяются по
 * каталогу архива, документы с макросами не принимаются.
 */
export function detectCollegiumAttachmentType(
  fileName: string,
  content: Buffer,
): CollegiumAttachmentFileType {
  if (content.length === 0) {
    throw new CollegiumInitiativeError("Файл пустой.");
  }
  const detected = detectBySignature(content);
  if (detected === undefined || readExtensionType(fileName) !== detected) {
    throw new CollegiumInitiativeError(
      "Содержимое файла не соответствует его типу. Можно прикладывать PDF, DOCX, XLSX, PNG и JPEG.",
    );
  }
  return detected;
}

/** Лимиты числа и объёма материалов владельца; вызывать под блокировкой владельца. */
export async function assertCollegiumAttachmentRoom(
  repository: {
    readAttachmentUsage: (owner: CollegiumAttachmentOwner) => Promise<{ items: number; bytes: number }>;
  },
  owner: CollegiumAttachmentOwner,
  addedBytes: number,
) {
  const usage = await repository.readAttachmentUsage(owner);
  if (usage.items >= collegiumAttachmentLimits.maxOwnerItems) {
    throw new CollegiumInitiativeError(
      `Можно приложить не больше ${collegiumAttachmentLimits.maxOwnerItems} материалов.`,
    );
  }
  if (usage.bytes + addedBytes > collegiumAttachmentLimits.maxOwnerBytes) {
    throw new CollegiumInitiativeError("Общий объём файлов не должен превышать 50 МБ.", 413);
  }
}

export function readCollegiumAttachmentLink(body: unknown) {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new CollegiumInitiativeError("Передайте ссылку.");
  }
  const record = body as Record<string, unknown>;
  if (Object.keys(record).some((key) => key !== "url" && key !== "label")) {
    throw new CollegiumInitiativeError("Запрос содержит неизвестные поля.");
  }
  const url = typeof record.url === "string" ? record.url.trim() : "";
  const label = typeof record.label === "string" ? record.label.trim() : "";
  if (url.length === 0 || url.length > collegiumAttachmentLimits.maxUrlLength) {
    throw new CollegiumInitiativeError("Укажите ссылку.");
  }
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new CollegiumInitiativeError("Укажите корректную ссылку http или https.");
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new CollegiumInitiativeError("Укажите корректную ссылку http или https.");
  }
  // The browser-normalized form (percent-encoded Cyrillic) is what gets stored.
  if (parsed.toString().length > collegiumAttachmentLimits.maxUrlLength) {
    throw new CollegiumInitiativeError("Ссылка слишком длинная.");
  }
  if (label.length === 0 || label.length > collegiumAttachmentLimits.maxLabelLength) {
    throw new CollegiumInitiativeError("Подпишите ссылку.");
  }
  return { url: parsed.toString(), label };
}

function readExtensionType(fileName: string): CollegiumAttachmentFileType | undefined {
  const lower = fileName.toLocaleLowerCase("en-US");
  return (Object.keys(collegiumAttachmentFileTypes) as CollegiumAttachmentFileType[]).find(
    (type) => collegiumAttachmentFileTypes[type].extensions.some((extension) => lower.endsWith(extension)),
  );
}

function detectBySignature(content: Buffer): CollegiumAttachmentFileType | undefined {
  if (content.subarray(0, 5).toString("latin1") === "%PDF-") return "pdf";
  if (content.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return "png";
  }
  if (content.length >= 3 && content[0] === 0xff && content[1] === 0xd8 && content[2] === 0xff) {
    return "jpeg";
  }
  if (content.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]))) {
    let names: string[];
    try {
      names = listZipEntryNames(content);
    } catch {
      return undefined;
    }
    if (names.some((name) => /(^|\/)vbaProject\.bin$/iu.test(name))) {
      throw new CollegiumInitiativeError("Документы с макросами прикладывать нельзя.");
    }
    if (!names.includes("[Content_Types].xml")) return undefined;
    if (names.includes("word/document.xml")) return "docx";
    if (names.includes("xl/workbook.xml")) return "xlsx";
  }
  return undefined;
}
