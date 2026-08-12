import {
  laboratoryFormedProductSampleFields,
  type LaboratoryFormedProductSampleCorrection,
  type LaboratoryFormedProductSampleFilters,
  type LaboratoryFormedProductSampleRecord,
  type LaboratoryFormedProductSampleSubmission,
} from "../contracts/laboratoryFormedProductSampleJournal.js";
import { buildDevAccessHeaders } from "./devAccessSessionStorage.js";
import {
  describeRemoteNetworkFailure,
  resolveApiEndpoint,
  type RemoteServerErrorCode,
} from "./remoteServer.js";

const JOURNAL_PATH = "/api/laboratory/formed-product-sample-journal";

type RequestOptions = { baseUrl?: string; signal?: AbortSignal };
type ErrorResult = {
  status: "error";
  message: string;
  code?: RemoteServerErrorCode;
};

export type LaboratoryFormedProductSampleListResult =
  | { status: "ready"; records: LaboratoryFormedProductSampleRecord[] }
  | ErrorResult;
export type LaboratoryFormedProductSampleSaveResult =
  | { status: "ready"; record: LaboratoryFormedProductSampleRecord }
  | ErrorResult;

export async function requestLaboratoryFormedProductSampleJournal(
  filters: LaboratoryFormedProductSampleFilters = {},
  options: RequestOptions = {},
): Promise<LaboratoryFormedProductSampleListResult> {
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
      "Сервер вернул журнал регистрации проб формованной продукции в неподдерживаемом формате.",
    );
  }

  return { status: "ready", records: result.payload.records };
}

export async function submitLaboratoryFormedProductSampleRecord(
  submission: LaboratoryFormedProductSampleSubmission,
  options: RequestOptions = {},
): Promise<LaboratoryFormedProductSampleSaveResult> {
  return readSaveResult(
    await requestJson(JOURNAL_PATH, "POST", submission, options),
  );
}

export async function correctLaboratoryFormedProductSampleRecord(
  id: string,
  submission: LaboratoryFormedProductSampleCorrection,
  options: RequestOptions = {},
): Promise<LaboratoryFormedProductSampleSaveResult> {
  return readSaveResult(await requestJson(
    `${JOURNAL_PATH}/${encodeURIComponent(id)}`,
    "PATCH",
    submission,
    options,
  ));
}

function readSaveResult(
  result: { status: "ready"; payload: unknown } | ErrorResult,
): LaboratoryFormedProductSampleSaveResult {
  if (result.status === "error") return result;
  if (!isRecord(result.payload) || !isJournalRecord(result.payload.record)) {
    return invalidResponse("Сервер не вернул сохранённую пробу.");
  }
  return { status: "ready", record: result.payload.record };
}

async function requestJson(
  path: string,
  method: "GET" | "POST" | "PATCH",
  body:
    | LaboratoryFormedProductSampleSubmission
    | LaboratoryFormedProductSampleCorrection
    | undefined,
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
        "Не удалось обработать журнал регистрации проб формованной продукции.",
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
        "Не удалось загрузить журнал регистрации проб формованной продукции.",
        { baseUrl },
      ),
    };
  }
}

function isJournalRecord(
  value: unknown,
): value is LaboratoryFormedProductSampleRecord {
  return isRecord(value) &&
    typeof value.id === "string" &&
    laboratoryFormedProductSampleFields.every(
      (field) => typeof value[field.id] === "string",
    ) &&
    typeof value.createdAt === "string";
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
