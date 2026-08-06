import {
  laboratoryGreenProductQualityFields,
  laboratoryGreenProductQualityPressNumberValues,
  type LaboratoryGreenProductQualityFilters,
  type LaboratoryGreenProductQualityAvailableWagon,
  type LaboratoryGreenProductQualityOptions,
  type LaboratoryGreenProductQualityRecord,
  type LaboratoryGreenProductQualitySubmission,
  type LaboratoryGreenProductQualityWagonOption,
} from "../contracts/laboratoryGreenProductQualityJournal.js";
import { buildDevAccessHeaders } from "./devAccessSessionStorage.js";
import {
  describeRemoteNetworkFailure,
  resolveApiEndpoint,
  type RemoteServerErrorCode,
} from "./remoteServer.js";

const JOURNAL_PATH = "/api/laboratory/green-product-quality-journal";
const DRAFT_PATH = "/api/laboratory/green-product-quality-draft";
const OPTIONS_PATH = "/api/laboratory/green-product-quality-options";

type RequestOptions = { baseUrl?: string; signal?: AbortSignal };
type ErrorResult = {
  status: "error";
  message: string;
  code?: RemoteServerErrorCode;
};

export type LaboratoryGreenProductQualityListResult =
  | { status: "ready"; records: LaboratoryGreenProductQualityRecord[] }
  | ErrorResult;
export type LaboratoryGreenProductQualityDraftResult =
  | { status: "ready"; recordDate: string }
  | ErrorResult;
export type LaboratoryGreenProductQualityOptionsResult =
  | { status: "ready"; options: LaboratoryGreenProductQualityOptions }
  | ErrorResult;
export type LaboratoryGreenProductQualitySaveResult =
  | { status: "ready"; record: LaboratoryGreenProductQualityRecord }
  | ErrorResult;

export async function requestLaboratoryGreenProductQualityJournal(
  filters: LaboratoryGreenProductQualityFilters = {},
  options: RequestOptions = {},
): Promise<LaboratoryGreenProductQualityListResult> {
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
    return invalidResponse(
      "Сервер вернул журнал качества сырцовой продукции в неподдерживаемом формате.",
    );
  }
  return { status: "ready", records: result.payload.records };
}

export async function requestLaboratoryGreenProductQualityDraft(
  options: RequestOptions = {},
): Promise<LaboratoryGreenProductQualityDraftResult> {
  const result = await requestJson(DRAFT_PATH, "GET", undefined, options);
  if (result.status === "error") return result;
  if (!isRecord(result.payload) || typeof result.payload.recordDate !== "string") {
    return invalidResponse("Сервер вернул дату журнала в неподдерживаемом формате.");
  }
  return { status: "ready", recordDate: result.payload.recordDate };
}

export async function requestLaboratoryGreenProductQualityOptions(
  options: RequestOptions = {},
): Promise<LaboratoryGreenProductQualityOptionsResult> {
  const result = await requestJson(OPTIONS_PATH, "GET", undefined, options);
  if (result.status === "error") return result;
  const optionPayload = isRecord(result.payload) && isRecord(result.payload.options)
    ? result.payload.options
    : undefined;
  if (
    optionPayload === undefined ||
    !isStringArray(optionPayload.setters) ||
    !isStringArray(optionPayload.pressOperators) ||
    !Array.isArray(optionPayload.wagons) ||
    !optionPayload.wagons.every(isAvailableWagon)
  ) {
    return invalidResponse("Сервер вернул списки журнала в неподдерживаемом формате.");
  }
  return {
    status: "ready",
    options: optionPayload as LaboratoryGreenProductQualityOptions,
  };
}

export async function submitLaboratoryGreenProductQualityRecord(
  submission: LaboratoryGreenProductQualitySubmission,
  options: RequestOptions = {},
): Promise<LaboratoryGreenProductQualitySaveResult> {
  return readSaveResult(await requestJson(JOURNAL_PATH, "POST", submission, options));
}

export async function correctLaboratoryGreenProductQualityRecord(
  id: string,
  submission: LaboratoryGreenProductQualitySubmission,
  options: RequestOptions = {},
): Promise<LaboratoryGreenProductQualitySaveResult> {
  return readSaveResult(await requestJson(
    `${JOURNAL_PATH}/${encodeURIComponent(id)}`,
    "PATCH",
    submission,
    options,
  ));
}

function readSaveResult(
  result: { status: "ready"; payload: unknown } | ErrorResult,
): LaboratoryGreenProductQualitySaveResult {
  if (result.status === "error") return result;
  if (!isRecord(result.payload) || !isJournalRecord(result.payload.record)) {
    return invalidResponse("Сервер не вернул сохранённую запись журнала.");
  }
  return { status: "ready", record: result.payload.record };
}

async function requestJson(
  path: string,
  method: "GET" | "POST" | "PATCH",
  body: LaboratoryGreenProductQualitySubmission | undefined,
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
        "Не удалось обработать журнал качества сырцовой продукции.",
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
        "Не удалось загрузить журнал качества сырцовой продукции.",
        { baseUrl },
      ),
    };
  }
}

function isJournalRecord(value: unknown): value is LaboratoryGreenProductQualityRecord {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    typeof value.createdAt !== "string" ||
    !isStringArray(value.wagonIds) ||
    !Array.isArray(value.wagons) ||
    !value.wagons.every(isWagonOption)
  ) {
    return false;
  }
  return laboratoryGreenProductQualityFields.every((field) => {
    const fieldValue = value[field.id];
    if (field.id === "wagonIds") return isStringArray(fieldValue);
    if (field.id === "pressNumber") {
      return typeof fieldValue === "string" &&
        laboratoryGreenProductQualityPressNumberValues.includes(
          fieldValue as (typeof laboratoryGreenProductQualityPressNumberValues)[number],
        );
    }
    return typeof fieldValue === "string";
  });
}

function isWagonOption(value: unknown): value is LaboratoryGreenProductQualityWagonOption {
  return isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.number === "string";
}

function isAvailableWagon(
  value: unknown,
): value is LaboratoryGreenProductQualityAvailableWagon {
  return isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.number === "string" &&
    isOptionalString(value.loadingDate) &&
    isOptionalString(value.productBrand) &&
    isOptionalString(value.setter) &&
    isOptionalString(value.pressOperator);
}

function isOptionalString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
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
