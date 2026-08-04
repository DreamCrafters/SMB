import type {
  RotaryKiln2FiringJournalDraft,
  RotaryKiln2FiringJournalFilters,
  RotaryKiln2FiringJournalPersonnelOptions,
  RotaryKiln2FiringJournalRecord,
  RotaryKiln2FiringJournalSelection,
  RotaryKiln2FiringJournalSubmission,
} from "../contracts/rotaryKiln2FiringJournal.js";
import { buildDevAccessHeaders } from "./devAccessSessionStorage.js";
import {
  describeRemoteNetworkFailure,
  resolveApiEndpoint,
  type RemoteServerErrorCode,
} from "./remoteServer.js";

const JOURNAL_PATH = "/api/laboratory/rotary-kiln-2-journal";
const DRAFT_PATH = "/api/laboratory/rotary-kiln-2-draft";
const PERSONNEL_OPTIONS_PATH =
  "/api/laboratory/rotary-kiln-2-personnel-options";

type RequestOptions = { baseUrl?: string; signal?: AbortSignal };
type ErrorResult = {
  status: "error";
  message: string;
  code?: RemoteServerErrorCode;
};

export type RotaryKiln2FiringJournalListResult =
  | ({ status: "ready" } & RotaryKiln2FiringJournalSelection)
  | ErrorResult;
export type RotaryKiln2FiringJournalSaveResult =
  | { status: "ready"; record: RotaryKiln2FiringJournalRecord }
  | ErrorResult;
export type RotaryKiln2FiringJournalDraftResult =
  | ({ status: "ready" } & RotaryKiln2FiringJournalDraft)
  | ErrorResult;
export type RotaryKiln2PersonnelOptionsResult =
  | ({ status: "ready" } & RotaryKiln2FiringJournalPersonnelOptions)
  | ErrorResult;

export async function requestRotaryKiln2FiringJournalDraft(
  options: RequestOptions = {},
): Promise<RotaryKiln2FiringJournalDraftResult> {
  const result = await requestJson(DRAFT_PATH, "GET", undefined, options);

  if (result.status === "error") return result;
  if (
    !isRecord(result.payload) ||
    !(
      result.payload.previousRecord === null ||
      isJournalRecord(result.payload.previousRecord)
    )
  ) {
    return invalidResponse(
      "Сервер вернул заготовку журнала вращающейся печи 2 в неподдерживаемом формате.",
    );
  }

  return {
    status: "ready",
    previousRecord: result.payload.previousRecord,
  };
}

export async function requestRotaryKiln2PersonnelOptions(
  options: RequestOptions = {},
): Promise<RotaryKiln2PersonnelOptionsResult> {
  const result = await requestJson(
    PERSONNEL_OPTIONS_PATH,
    "GET",
    undefined,
    options,
  );

  if (result.status === "error") return result;
  if (
    !isRecord(result.payload) ||
    !isStringArray(result.payload.shiftSupervisors) ||
    !isStringArray(result.payload.burnerOperators)
  ) {
    return invalidResponse(
      "Сервер вернул список сотрудников журнала в неподдерживаемом формате.",
    );
  }

  return {
    status: "ready",
    shiftSupervisors: result.payload.shiftSupervisors,
    burnerOperators: result.payload.burnerOperators,
  };
}

export async function requestRotaryKiln2FiringJournal(
  filters: RotaryKiln2FiringJournalFilters = {},
  options: RequestOptions = {},
): Promise<RotaryKiln2FiringJournalListResult> {
  const params = new URLSearchParams();
  if (filters.dateFrom !== undefined) params.set("dateFrom", filters.dateFrom);
  if (filters.dateTo !== undefined) params.set("dateTo", filters.dateTo);
  if (filters.query !== undefined) params.set("query", filters.query);
  const suffix = params.size === 0 ? "" : `?${params.toString()}`;
  const result = await requestJson(`${JOURNAL_PATH}${suffix}`, "GET", undefined, options);

  if (result.status === "error") return result;
  if (
    !isRecord(result.payload) ||
    !Array.isArray(result.payload.records) ||
    !result.payload.records.every(isJournalRecord) ||
    !(
      result.payload.averageBulkDensity === null ||
      typeof result.payload.averageBulkDensity === "number"
    )
  ) {
    return invalidResponse(
      "Сервер вернул журнал вращающейся печи 2 в неподдерживаемом формате.",
    );
  }

  return {
    status: "ready",
    records: result.payload.records,
    averageBulkDensity: result.payload.averageBulkDensity,
  };
}

export async function submitRotaryKiln2FiringJournalRecord(
  submission: RotaryKiln2FiringJournalSubmission,
  options: RequestOptions = {},
): Promise<RotaryKiln2FiringJournalSaveResult> {
  const result = await requestJson(JOURNAL_PATH, "POST", submission, options);

  if (result.status === "error") return result;
  if (!isRecord(result.payload) || !isJournalRecord(result.payload.record)) {
    return invalidResponse(
      "Сервер не вернул сохранённую запись журнала вращающейся печи 2.",
    );
  }
  return { status: "ready", record: result.payload.record };
}

async function requestJson(
  path: string,
  method: "GET" | "POST",
  body: RotaryKiln2FiringJournalSubmission | undefined,
  { baseUrl, signal }: RequestOptions,
): Promise<{ status: "ready"; payload: unknown } | ErrorResult> {
  const endpoint = resolveApiEndpoint(path, path, { baseUrl });

  try {
    const response = await fetch(endpoint, {
      method,
      headers: buildDevAccessHeaders({
        Accept: "application/json",
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      }),
      credentials: "include",
      signal,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const payload = await readJson(response);

    if (!response.ok) {
      return readRemoteError(
        payload,
        "Не удалось обработать журнал вращающейся печи 2.",
      );
    }
    return { status: "ready", payload };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return { status: "error", message: "Запрос журнала отменён." };
    }
    return {
      status: "error",
      code: "network_error",
      message: describeRemoteNetworkFailure(
        "Не удалось загрузить журнал вращающейся печи 2.",
        { baseUrl },
      ),
    };
  }
}

function isJournalRecord(value: unknown): value is RotaryKiln2FiringJournalRecord {
  return isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.recordDate === "string" &&
    typeof value.recordTime === "string" &&
    (value.producedMaterial === undefined ||
      typeof value.producedMaterial === "string") &&
    numericFieldNames.every((field) => typeof value[field] === "number") &&
    typeof value.shiftSupervisor === "string" &&
    typeof value.burnerOperator === "string" &&
    typeof value.laboratoryAssistant === "string" &&
    (value.note === undefined || typeof value.note === "string") &&
    typeof value.createdAt === "string";
}

const numericFieldNames = [
  "waterAbsorption",
  "temperatureBeforeCyclone",
  "temperatureBeforeFilter",
  "temperatureInFieldChamber",
  "temperatureAtRollback",
  "gasConsumptionPerHour",
  "vacuum",
  "pressure",
  "sievePass05",
  "bulkDensity",
  "kilnLoadBucketsPerHour",
] as const;

function readRemoteError(payload: unknown, fallback: string): ErrorResult {
  const error = isRecord(payload) && isRecord(payload.error)
    ? payload.error
    : undefined;
  const message = error !== undefined && typeof error.message === "string"
    ? error.message
    : fallback;
  const code = error !== undefined && typeof error.code === "string"
    ? error.code as RemoteServerErrorCode
    : undefined;

  return {
    status: "error",
    message,
    ...(code === undefined ? {} : { code }),
  };
}

async function readJson(response: Response) {
  const text = await response.text();
  if (text.length === 0) return undefined;

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

function invalidResponse(message: string): ErrorResult {
  return { status: "error", code: "invalid_response", message };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}
