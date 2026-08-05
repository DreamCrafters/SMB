import {
  laboratoryRawMaterialQualityDisintegratorValues,
  laboratoryRawMaterialQualityFields,
  laboratoryRawMaterialQualityRecommendationRecipientValues,
  laboratoryRawMaterialQualityShiftValues,
  type LaboratoryRawMaterialQualityFilters,
  type LaboratoryRawMaterialQualityOptions,
  type LaboratoryRawMaterialQualityRecord,
  type LaboratoryRawMaterialQualitySubmission,
} from "../contracts/laboratoryRawMaterialQualityJournal.js";
import { buildDevAccessHeaders } from "./devAccessSessionStorage.js";
import {
  describeRemoteNetworkFailure,
  resolveApiEndpoint,
  type RemoteServerErrorCode,
} from "./remoteServer.js";

const JOURNAL_PATH = "/api/laboratory/raw-material-quality-journal";
const DRAFT_PATH = "/api/laboratory/raw-material-quality-draft";
const OPTIONS_PATH = "/api/laboratory/raw-material-quality-options";

type RequestOptions = { baseUrl?: string; signal?: AbortSignal };
type ErrorResult = {
  status: "error";
  message: string;
  code?: RemoteServerErrorCode;
};

export type LaboratoryRawMaterialQualityListResult =
  | { status: "ready"; records: LaboratoryRawMaterialQualityRecord[] }
  | ErrorResult;
export type LaboratoryRawMaterialQualityDraftResult =
  | { status: "ready"; recordDate: string }
  | ErrorResult;
export type LaboratoryRawMaterialQualityOptionsResult =
  | { status: "ready"; options: LaboratoryRawMaterialQualityOptions }
  | ErrorResult;
export type LaboratoryRawMaterialQualitySaveResult =
  | { status: "ready"; record: LaboratoryRawMaterialQualityRecord }
  | ErrorResult;

export async function requestLaboratoryRawMaterialQualityJournal(
  filters: LaboratoryRawMaterialQualityFilters = {},
  options: RequestOptions = {},
): Promise<LaboratoryRawMaterialQualityListResult> {
  const params = new URLSearchParams();
  if (filters.dateFrom !== undefined) params.set("dateFrom", filters.dateFrom);
  if (filters.dateTo !== undefined) params.set("dateTo", filters.dateTo);
  if (filters.query !== undefined) params.set("query", filters.query);
  if (filters.nameQuery !== undefined) params.set("name", filters.nameQuery);
  const suffix = params.size === 0 ? "" : `?${params.toString()}`;
  const result = await requestJson(
    `${JOURNAL_PATH}${suffix}`,
    "GET",
    undefined,
    options,
  );

  if (result.status === "error") return result;
  if (
    !isRecord(result.payload) ||
    !Array.isArray(result.payload.records) ||
    !result.payload.records.every(isJournalRecord)
  ) {
    return invalidResponse("Сервер вернул журнал качества сырья в неподдерживаемом формате.");
  }
  return { status: "ready", records: result.payload.records };
}

export async function requestLaboratoryRawMaterialQualityDraft(
  options: RequestOptions = {},
): Promise<LaboratoryRawMaterialQualityDraftResult> {
  const result = await requestJson(DRAFT_PATH, "GET", undefined, options);
  if (result.status === "error") return result;
  if (!isRecord(result.payload) || typeof result.payload.recordDate !== "string") {
    return invalidResponse("Сервер вернул дату журнала в неподдерживаемом формате.");
  }
  return { status: "ready", recordDate: result.payload.recordDate };
}

export async function requestLaboratoryRawMaterialQualityOptions(
  options: RequestOptions = {},
): Promise<LaboratoryRawMaterialQualityOptionsResult> {
  const result = await requestJson(OPTIONS_PATH, "GET", undefined, options);
  if (result.status === "error") return result;
  const optionNames = [
    "laboratoryAssistants",
    "shiftSupervisors",
    "clayBrands",
    "temperBrands",
    "slipMixerNumbers",
    "runnerNumbers",
  ] as const;
  const optionPayload = isRecord(result.payload) &&
      isRecord(result.payload.options)
    ? result.payload.options
    : undefined;
  if (
    optionPayload === undefined ||
    !optionNames.every((name) => isStringArray(optionPayload[name]))
  ) {
    return invalidResponse("Сервер вернул списки журнала в неподдерживаемом формате.");
  }
  return {
    status: "ready",
    options: optionPayload as LaboratoryRawMaterialQualityOptions,
  };
}

export async function submitLaboratoryRawMaterialQualityRecord(
  submission: LaboratoryRawMaterialQualitySubmission,
  options: RequestOptions = {},
): Promise<LaboratoryRawMaterialQualitySaveResult> {
  return readSaveResult(await requestJson(JOURNAL_PATH, "POST", submission, options));
}

export async function correctLaboratoryRawMaterialQualityRecord(
  id: string,
  submission: LaboratoryRawMaterialQualitySubmission,
  options: RequestOptions = {},
): Promise<LaboratoryRawMaterialQualitySaveResult> {
  return readSaveResult(await requestJson(
    `${JOURNAL_PATH}/${encodeURIComponent(id)}`,
    "PATCH",
    submission,
    options,
  ));
}

function readSaveResult(
  result: { status: "ready"; payload: unknown } | ErrorResult,
): LaboratoryRawMaterialQualitySaveResult {
  if (result.status === "error") return result;
  if (!isRecord(result.payload) || !isJournalRecord(result.payload.record)) {
    return invalidResponse("Сервер не вернул сохранённую запись журнала.");
  }
  return { status: "ready", record: result.payload.record };
}

async function requestJson(
  path: string,
  method: "GET" | "POST" | "PATCH",
  body: LaboratoryRawMaterialQualitySubmission | undefined,
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
      return readRemoteError(payload, "Не удалось обработать журнал качества сырья.");
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
        "Не удалось загрузить журнал качества сырья.",
        { baseUrl },
      ),
    };
  }
}

function isJournalRecord(value: unknown): value is LaboratoryRawMaterialQualityRecord {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.createdAt !== "string") {
    return false;
  }
  return laboratoryRawMaterialQualityFields.every((field) => {
    const fieldValue = value[field.id];
    if (field.id === "shift") {
      return typeof fieldValue === "string" &&
        laboratoryRawMaterialQualityShiftValues.includes(
          fieldValue as (typeof laboratoryRawMaterialQualityShiftValues)[number],
        );
    }
    if (field.id === "disintegratorNumber") {
      return typeof fieldValue === "string" &&
        laboratoryRawMaterialQualityDisintegratorValues.includes(
          fieldValue as (typeof laboratoryRawMaterialQualityDisintegratorValues)[number],
        );
    }
    if (field.id === "recommendationRecipient") {
      return typeof fieldValue === "string" &&
        laboratoryRawMaterialQualityRecommendationRecipientValues.includes(
          fieldValue as (typeof laboratoryRawMaterialQualityRecommendationRecipientValues)[number],
        );
    }
    return typeof fieldValue === "string";
  });
}

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

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
