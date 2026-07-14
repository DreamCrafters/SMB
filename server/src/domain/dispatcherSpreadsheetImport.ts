import { createHash } from "node:crypto";
import {
  buildDispatcherSubmissionSummary,
  type DispatcherSubmissionPayload,
} from "./dispatcherSubmission.js";
import {
  getDispatcherFormDefinition,
  type DispatcherFormId,
} from "./dispatcherForms.js";

export const dispatcherImportSheetNames = [
  "Оборудование",
  "Инциденты",
  "Посетители",
] as const;

export type DispatcherImportSheetName =
  (typeof dispatcherImportSheetNames)[number];

export type DispatcherSpreadsheetImportRecord = {
  id: string;
  sourceKey: string;
  formId: DispatcherFormId;
  payload: DispatcherSubmissionPayload;
  summary: string;
  period: string;
  rawValue: string;
  comment: string | null;
  dedupeKey: string | null;
  occurredAt: Date;
};

export type DispatcherSpreadsheetImportSheetSummary = {
  sheetName: DispatcherImportSheetName;
  sourceRows: number;
  importRecords: number;
  skippedRows: number;
};

export type DispatcherSpreadsheetImportPlan = {
  fingerprint: string;
  records: DispatcherSpreadsheetImportRecord[];
  sheets: DispatcherSpreadsheetImportSheetSummary[];
  warnings: string[];
};

export class DispatcherSpreadsheetImportFormatError extends Error {}

const expectedHeaders: Record<DispatcherImportSheetName, readonly string[]> = {
  Оборудование: [
    "Дата внесения данных в отчет",
    "Дата отчета",
    "Месяц отчета",
    "Оборудование",
    "Выработка, тонн",
    "Причина простоя",
    "Время простоя, часов",
    "Примечание",
  ],
  Инциденты: [
    "№",
    "Дата и время",
    "Место",
    "Тип",
    "Описание",
    "Крит.",
    "Ответственный за регистрацию",
    "Статус",
    "Меры оперативные",
    "Причины",
    "Меры после закрытия",
    "Примечание",
    "Дата и время закрытия",
    "Расходы на инцидент",
    "Ответственный о внесении записи о закрытии",
    "Запись о закрытии",
  ],
  Посетители: [
    "Дата время",
    "ФИО посетителя",
    "Должность",
    "Организация",
    "Цель визита",
    "Кого посещает",
    "Дата время выхода",
    "Примечание",
  ],
};

const maxRowsPerSheet = 5_000;
const maxWarnings = 500;

export function buildDispatcherSpreadsheetImportPlan({
  spreadsheetId,
  rowsBySheet,
}: {
  spreadsheetId: string;
  rowsBySheet: Record<string, string[][]>;
}): DispatcherSpreadsheetImportPlan {
  if (!/^[a-zA-Z0-9_-]{10,200}$/.test(spreadsheetId)) {
    throw new DispatcherSpreadsheetImportFormatError(
      "Google Sheets spreadsheet id is invalid.",
    );
  }

  const records: DispatcherSpreadsheetImportRecord[] = [];
  const warnings: string[] = [];
  const sheets: DispatcherSpreadsheetImportSheetSummary[] = [];

  for (const sheetName of dispatcherImportSheetNames) {
    const rows = rowsBySheet[sheetName];

    if (!Array.isArray(rows) || rows.length === 0) {
      throw new DispatcherSpreadsheetImportFormatError(
        `Вкладка «${sheetName}» отсутствует или пуста.`,
      );
    }

    if (rows.length - 1 > maxRowsPerSheet) {
      throw new DispatcherSpreadsheetImportFormatError(
        `Вкладка «${sheetName}» содержит больше ${maxRowsPerSheet} строк.`,
      );
    }

    const headerMap = buildHeaderMap(sheetName, rows[0] ?? []);
    const sheetRecords: DispatcherSpreadsheetImportRecord[] = [];
    let sourceRows = 0;
    let skippedRows = 0;

    rows.slice(1).forEach((row, rowIndex) => {
      if (isEmptyRow(row)) {
        return;
      }

      sourceRows += 1;
      const rowNumber = rowIndex + 2;
      const nextRecords = mapSheetRow({
        spreadsheetId,
        sheetName,
        rowNumber,
        row,
        headerMap,
        warnings,
      });

      if (nextRecords.length === 0) {
        skippedRows += 1;
      }

      sheetRecords.push(...nextRecords);
    });

    records.push(...sheetRecords);
    sheets.push({
      sheetName,
      sourceRows,
      importRecords: sheetRecords.length,
      skippedRows,
    });
  }

  const fingerprint = createHash("sha256")
    .update(
      JSON.stringify(
        records.map((record) => ({
          sourceKey: record.sourceKey,
          formId: record.formId,
          payload: record.payload,
          occurredAt: record.occurredAt.toISOString(),
        })),
      ),
    )
    .digest("hex");

  return {
    fingerprint,
    records,
    sheets,
    warnings,
  };
}

export function scopeDispatcherSpreadsheetImportRecords(
  records: readonly DispatcherSpreadsheetImportRecord[],
  businessAccountId: string,
) {
  const idByOriginalId = new Map(
    records.map((record) => [
      record.id,
      buildStableUuid(`${businessAccountId}:${record.sourceKey}`),
    ]),
  );

  return records.map((record) => {
    const id = idByOriginalId.get(record.id) ?? record.id;
    const visitorEntryId = record.payload.visitorEntryId;

    return {
      ...record,
      id,
      sourceKey: `${businessAccountId}:${record.sourceKey}`,
      payload:
        visitorEntryId === undefined
          ? record.payload
          : {
              ...record.payload,
              visitorEntryId: idByOriginalId.get(visitorEntryId) ?? visitorEntryId,
            },
    };
  });
}

function mapSheetRow({
  spreadsheetId,
  sheetName,
  rowNumber,
  row,
  headerMap,
  warnings,
}: {
  spreadsheetId: string;
  sheetName: DispatcherImportSheetName;
  rowNumber: number;
  row: string[];
  headerMap: Map<string, number>;
  warnings: string[];
}) {
  if (sheetName === "Оборудование") {
    return mapEquipmentRow(
      spreadsheetId,
      rowNumber,
      row,
      headerMap,
      warnings,
    );
  }

  if (sheetName === "Инциденты") {
    return mapIncidentRow(
      spreadsheetId,
      rowNumber,
      row,
      headerMap,
      warnings,
    );
  }

  return mapVisitorRow(
    spreadsheetId,
    rowNumber,
    row,
    headerMap,
    warnings,
  );
}

function mapEquipmentRow(
  spreadsheetId: string,
  rowNumber: number,
  row: string[],
  headerMap: Map<string, number>,
  warnings: string[],
) {
  const reportDate = normalizeDate(readCell(row, headerMap, "Дата отчета"));
  const equipment = readCell(row, headerMap, "Оборудование");
  const occurredAtValue = readCell(
    row,
    headerMap,
    "Дата внесения данных в отчет",
  );
  const occurredAt = parseMoscowDateTime(occurredAtValue);

  if (reportDate === undefined || equipment.length === 0 || occurredAt === undefined) {
    addWarning(
      warnings,
      `Оборудование, строка ${rowNumber}: пропущена — нужны дата отчёта, оборудование и дата внесения.`,
    );
    return [];
  }

  const payload = compactPayload({
    reportDate,
    reportMonth:
      normalizeMonth(readCell(row, headerMap, "Месяц отчета")) ??
      readPeriodFromDate(reportDate),
    equipment,
    productionTons: normalizeNumber(
      readCell(row, headerMap, "Выработка, тонн"),
    ),
    downtimeReason: readCell(row, headerMap, "Причина простоя"),
    downtimeHours: normalizeNumber(
      readCell(row, headerMap, "Время простоя, часов"),
    ),
    note: readCell(row, headerMap, "Примечание"),
  });

  addEquipmentWarnings(payload, rowNumber, warnings);
  const sourceKey = buildSourceKey(spreadsheetId, "equipment", [
    reportDate,
    equipment,
  ]);

  return [buildRecord(sourceKey, "equipment", payload, occurredAt)];
}

function mapIncidentRow(
  spreadsheetId: string,
  rowNumber: number,
  row: string[],
  headerMap: Map<string, number>,
  warnings: string[],
) {
  const incidentNumber = readCell(row, headerMap, "№");
  const openedAtValue = readCell(row, headerMap, "Дата и время");
  const openedAt = parseMoscowDateTime(openedAtValue);

  if (incidentNumber.length === 0 || openedAt === undefined) {
    addWarning(
      warnings,
      `Инциденты, строка ${rowNumber}: пропущена — нужны номер и дата открытия.`,
    );
    return [];
  }

  const location = readCell(row, headerMap, "Место");
  const status = readCell(row, headerMap, "Статус");
  const openingPayload = compactPayload({
    incidentNumber,
    datetime: formatPayloadDateTime(openedAtValue),
    location,
    incidentType: readCell(row, headerMap, "Тип"),
    description: readCell(row, headerMap, "Описание"),
    criticality: readCell(row, headerMap, "Крит."),
    responsible: readCell(row, headerMap, "Ответственный за регистрацию"),
    incidentStatus: status.length > 0 ? status : "Новый",
    immediateActions: readCell(row, headerMap, "Меры оперативные"),
    note: readCell(row, headerMap, "Примечание"),
  });

  const missingOpeningFields = [
    ["место", openingPayload.location],
    ["тип", openingPayload.incidentType],
    ["описание", openingPayload.description],
    ["критичность", openingPayload.criticality],
    ["ответственный", openingPayload.responsible],
    ["оперативные меры", openingPayload.immediateActions],
  ]
    .filter(([, value]) => value === undefined)
    .map(([label]) => label);

  if (missingOpeningFields.length > 0) {
    addWarning(
      warnings,
      `Инциденты, строка ${rowNumber}: неполное открытие (${missingOpeningFields.join(", ")}).`,
    );
  }
  const openingSourceKey = buildSourceKey(spreadsheetId, "incident-open", [
    incidentNumber,
  ]);
  const records = [
    buildRecord(openingSourceKey, "incident", openingPayload, openedAt),
  ];
  const closedAtValue = readCell(row, headerMap, "Дата и время закрытия");
  const closedAt = parseMoscowDateTime(closedAtValue);

  if (closedAt !== undefined) {
    const closingPayload = compactPayload({
      incidentNumber,
      location,
      rootCauses: readCell(row, headerMap, "Причины"),
      preventiveMeasures: readCell(row, headerMap, "Меры после закрытия"),
      closureNote: readCell(row, headerMap, "Примечание"),
      closureDateTime: formatPayloadDateTime(closedAtValue),
      costs: normalizeNumber(
        readCell(row, headerMap, "Расходы на инцидент"),
      ),
      approvedBy: readCell(
        row,
        headerMap,
        "Ответственный о внесении записи о закрытии",
      ),
      closeRecord: readCell(row, headerMap, "Запись о закрытии"),
      incidentStatus: "Закрыт",
    });
    const closingSourceKey = buildSourceKey(spreadsheetId, "incident-close", [
      incidentNumber,
    ]);

    records.push(
      buildRecord(
        closingSourceKey,
        "incident_close",
        closingPayload,
        closedAt,
      ),
    );
  } else if (normalizeHeader(status) === normalizeHeader("Закрыт")) {
    addWarning(
      warnings,
      `Инциденты, строка ${rowNumber}: закрытие не создано — нет даты закрытия.`,
    );
  }

  return records;
}

function mapVisitorRow(
  spreadsheetId: string,
  rowNumber: number,
  row: string[],
  headerMap: Map<string, number>,
  warnings: string[],
) {
  const entryAtValue = readCell(row, headerMap, "Дата время");
  const entryAt = parseMoscowDateTime(entryAtValue);
  const fio = readCell(row, headerMap, "ФИО посетителя");

  if (entryAt === undefined || fio.length === 0) {
    addWarning(
      warnings,
      `Посетители, строка ${rowNumber}: пропущена — нужны дата входа и ФИО.`,
    );
    return [];
  }

  const organization = readCell(row, headerMap, "Организация");
  const entrySourceKey = buildSourceKey(spreadsheetId, "visitor-entry", [
    formatPayloadDateTime(entryAtValue),
    fio,
    organization,
  ]);
  const entryPayload = compactPayload({
    entryAt: formatPayloadDateTime(entryAtValue),
    fio,
    position: readCell(row, headerMap, "Должность"),
    organization,
    purpose: readCell(row, headerMap, "Цель визита"),
    whom: readCell(row, headerMap, "Кого посещает"),
    note: readCell(row, headerMap, "Примечание"),
  });
  const entryRecord = buildRecord(
    entrySourceKey,
    "visitor",
    entryPayload,
    entryAt,
  );
  const records = [entryRecord];
  const exitAtValue = readCell(row, headerMap, "Дата время выхода");
  const exitAt = parseMoscowDateTime(exitAtValue);

  if (exitAt !== undefined) {
    const exitSourceKey = buildSourceKey(spreadsheetId, "visitor-exit", [
      formatPayloadDateTime(entryAtValue),
      fio,
      organization,
    ]);
    const exitPayload = compactPayload({
      visitorEntryId: entryRecord.id,
      entryAt: formatPayloadDateTime(entryAtValue),
      exitAt: formatPayloadDateTime(exitAtValue),
      fio,
      organization,
    });

    records.push(
      buildRecord(exitSourceKey, "visitor_exit", exitPayload, exitAt),
    );
  }

  return records;
}

function buildRecord(
  sourceKey: string,
  formId: DispatcherFormId,
  payload: DispatcherSubmissionPayload,
  occurredAt: Date,
): DispatcherSpreadsheetImportRecord {
  const form = getDispatcherFormDefinition(formId);

  if (form === undefined) {
    throw new DispatcherSpreadsheetImportFormatError(
      `Unsupported dispatcher form: ${formId}.`,
    );
  }

  const summary = buildDispatcherSubmissionSummary(form, payload);
  const period = readPeriod(payload, occurredAt);
  const dedupeKey =
    formId === "equipment" &&
    payload.reportDate !== undefined &&
    payload.equipment !== undefined
      ? `equipment:${payload.reportDate}:${payload.equipment}`
      : null;

  return {
    id: buildStableUuid(sourceKey),
    sourceKey,
    formId,
    payload,
    summary,
    period,
    rawValue: summary,
    comment: payload.note ?? null,
    dedupeKey,
    occurredAt,
  };
}

function buildHeaderMap(
  sheetName: DispatcherImportSheetName,
  headerRow: string[],
) {
  const map = new Map<string, number>();

  headerRow.forEach((value, index) => {
    const header = normalizeHeader(value);

    if (header.length > 0 && !map.has(header)) {
      map.set(header, index);
    }
  });

  const missing = expectedHeaders[sheetName].filter(
    (header) => !map.has(normalizeHeader(header)),
  );

  if (missing.length > 0) {
    throw new DispatcherSpreadsheetImportFormatError(
      `Вкладка «${sheetName}»: отсутствуют колонки ${missing.join(", ")}.`,
    );
  }

  return map;
}

function readCell(
  row: string[],
  headerMap: Map<string, number>,
  header: string,
) {
  const index = headerMap.get(normalizeHeader(header));

  return index === undefined ? "" : String(row[index] ?? "").trim();
}

function compactPayload(values: Record<string, string | undefined>) {
  return Object.fromEntries(
    Object.entries(values).filter(
      (entry): entry is [string, string] =>
        typeof entry[1] === "string" && entry[1].trim().length > 0,
    ),
  );
}

function parseMoscowDateTime(value: string) {
  const trimmed = value.trim();
  const serialDate = parseGoogleSerialDate(trimmed);

  if (serialDate !== undefined) {
    return serialDate.timestamp;
  }

  const russian = /^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(
    trimmed,
  );
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(
    trimmed,
  );

  if (russian === null && iso === null) {
    return undefined;
  }

  const parts = russian ?? iso;
  const year = Number(russian === null ? parts?.[1] : parts?.[3]);
  const month = Number(parts?.[2]);
  const day = Number(russian === null ? parts?.[3] : parts?.[1]);
  const hour = Number(parts?.[4] ?? 0);
  const minute = Number(parts?.[5] ?? 0);
  const second = Number(parts?.[6] ?? 0);

  if (
    !Number.isInteger(year) ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31 ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59 ||
    second < 0 ||
    second > 59
  ) {
    return undefined;
  }

  const timestamp = new Date(
    Date.UTC(year, month - 1, day, hour - 3, minute, second),
  );
  const moscowDate = new Date(timestamp.getTime() + 3 * 60 * 60 * 1_000);

  if (
    moscowDate.getUTCFullYear() !== year ||
    moscowDate.getUTCMonth() !== month - 1 ||
    moscowDate.getUTCDate() !== day ||
    moscowDate.getUTCHours() !== hour ||
    moscowDate.getUTCMinutes() !== minute ||
    moscowDate.getUTCSeconds() !== second
  ) {
    return undefined;
  }

  return timestamp;
}

function formatPayloadDateTime(value: string) {
  const trimmed = value.trim();
  const serialDate = parseGoogleSerialDate(trimmed);

  if (serialDate !== undefined) {
    return `${String(serialDate.day).padStart(2, "0")}.${String(
      serialDate.month,
    ).padStart(2, "0")}.${serialDate.year} ${String(serialDate.hour).padStart(
      2,
      "0",
    )}:${String(serialDate.minute).padStart(2, "0")}`;
  }

  const russian = /^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::\d{2})?)?$/.exec(
    trimmed,
  );
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s]+(\d{1,2}):(\d{2})(?::\d{2})?)?$/.exec(
    trimmed,
  );

  if (russian !== null) {
    return `${russian[1]?.padStart(2, "0")}.${russian[2]?.padStart(2, "0")}.${
      russian[3]
    } ${russian[4]?.padStart(2, "0") ?? "00"}:${russian[5] ?? "00"}`;
  }

  if (iso !== null) {
    return `${iso[3]?.padStart(2, "0")}.${iso[2]?.padStart(2, "0")}.${
      iso[1]
    } ${iso[4]?.padStart(2, "0") ?? "00"}:${iso[5] ?? "00"}`;
  }

  return trimmed;
}

function normalizeDate(value: string) {
  const serialDate = parseGoogleSerialDate(value.trim());

  if (serialDate !== undefined) {
    return `${String(serialDate.day).padStart(2, "0")}.${String(
      serialDate.month,
    ).padStart(2, "0")}.${serialDate.year}`;
  }

  const russian = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(value.trim());
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(value.trim());

  if (russian !== null) {
    return `${russian[1]?.padStart(2, "0")}.${russian[2]?.padStart(2, "0")}.${
      russian[3]
    }`;
  }

  if (iso !== null) {
    return `${iso[3]?.padStart(2, "0")}.${iso[2]?.padStart(2, "0")}.${
      iso[1]
    }`;
  }

  return undefined;
}

function normalizeMonth(value: string) {
  const serialDate = parseGoogleSerialDate(value.trim());

  if (serialDate !== undefined) {
    return `${serialDate.year}-${String(serialDate.month).padStart(2, "0")}`;
  }

  const monthYear = /^(\d{1,2})[./-](\d{4})$/.exec(value.trim());
  const yearMonth = /^(\d{4})[./-](\d{1,2})$/.exec(value.trim());

  if (monthYear !== null) {
    return `${monthYear[2]}-${monthYear[1]?.padStart(2, "0")}`;
  }

  if (yearMonth !== null) {
    return `${yearMonth[1]}-${yearMonth[2]?.padStart(2, "0")}`;
  }

  return undefined;
}

function normalizeNumber(value: string) {
  const normalized = value
    .replace(/[\s\u00a0]/gu, "")
    .replace(",", ".")
    .trim();

  if (normalized.length === 0 || !/^-?\d+(?:\.\d+)?$/.test(normalized)) {
    return undefined;
  }

  return normalized;
}

function parseGoogleSerialDate(value: string) {
  if (!/^\d{4,5}(?:\.\d+)?$/.test(value)) {
    return undefined;
  }

  const serial = Number(value);

  if (!Number.isFinite(serial) || serial < 20_000 || serial > 80_000) {
    return undefined;
  }

  const wallClockTimestamp =
    Math.round((serial - 25_569) * 86_400) * 1_000;
  const wallClock = new Date(wallClockTimestamp);
  const year = wallClock.getUTCFullYear();
  const month = wallClock.getUTCMonth() + 1;
  const day = wallClock.getUTCDate();
  const hour = wallClock.getUTCHours();
  const minute = wallClock.getUTCMinutes();
  const second = wallClock.getUTCSeconds();

  return {
    year,
    month,
    day,
    hour,
    minute,
    second,
    timestamp: new Date(
      Date.UTC(year, month - 1, day, hour - 3, minute, second),
    ),
  };
}

function addEquipmentWarnings(
  payload: DispatcherSubmissionPayload,
  rowNumber: number,
  warnings: string[],
) {
  const reportValues = [
    payload.productionTons,
    payload.downtimeReason,
    payload.downtimeHours,
    payload.note,
  ];

  if (reportValues.every((value) => value === undefined)) {
    addWarning(
      warnings,
      `Оборудование, строка ${rowNumber}: отчёт не содержит показателей.`,
    );
  }

  const downtimeHours = Number(payload.downtimeHours);

  if (
    payload.downtimeReason === "Резерв" &&
    (!Number.isFinite(downtimeHours) || downtimeHours !== 8)
  ) {
    addWarning(
      warnings,
      `Оборудование, строка ${rowNumber}: «Резерв» указан не с 8 часами простоя.`,
    );
  }

  if (payload.downtimeReason === "Простой по мех. эл. части") {
    addWarning(
      warnings,
      `Оборудование, строка ${rowNumber}: причина простоя отличается от текущего справочника.`,
    );
  }

  const productionTons = Number(payload.productionTons);

  if (Number.isFinite(productionTons) && productionTons >= 40_000) {
    addWarning(
      warnings,
      `Оборудование, строка ${rowNumber}: выработка ${payload.productionTons} выглядит как дата Google Sheets.`,
    );
  }
}

function readPeriod(payload: DispatcherSubmissionPayload, occurredAt: Date) {
  return (
    payload.reportMonth ??
    readPeriodFromDate(payload.reportDate) ??
    readPeriodFromDate(payload.datetime) ??
    readPeriodFromDate(payload.closureDateTime) ??
    readPeriodFromDate(payload.entryAt) ??
    occurredAt.toISOString().slice(0, 7)
  );
}

function readPeriodFromDate(value: string | undefined) {
  if (value === undefined) {
    return undefined;
  }

  const russian = /^\d{2}\.(\d{2})\.(\d{4})/.exec(value);
  const iso = /^(\d{4})-(\d{2})/.exec(value);

  if (russian !== null) {
    return `${russian[2]}-${russian[1]}`;
  }

  return iso === null ? undefined : `${iso[1]}-${iso[2]}`;
}

function buildSourceKey(
  spreadsheetId: string,
  kind: string,
  identity: readonly string[],
) {
  const hash = createHash("sha256")
    .update(JSON.stringify(identity.map((value) => value.trim())))
    .digest("hex");

  return `google-sheets:${spreadsheetId}:${kind}:${hash}`;
}

function buildStableUuid(value: string) {
  const hash = createHash("sha256").update(value).digest("hex");

  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(
    13,
    16,
  )}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

function isEmptyRow(row: string[]) {
  return row.every((value) => String(value ?? "").trim().length === 0);
}

function normalizeHeader(value: string) {
  return value
    .trim()
    .replace(/\s+/gu, " ")
    .replace(/:+$/u, "")
    .trim()
    .toLocaleLowerCase("ru-RU");
}

function addWarning(warnings: string[], message: string) {
  if (warnings.length < maxWarnings) {
    warnings.push(message);
  }
}
