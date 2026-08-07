import {
  laboratoryUnshapedProductSampleFields,
  laboratoryUnshapedProductSampleSuitabilityValues,
  type LaboratoryUnshapedProductSampleCorrection,
  type LaboratoryUnshapedProductSampleDraft,
  type LaboratoryUnshapedProductSampleFilters,
  type LaboratoryUnshapedProductSampleRecord,
  type LaboratoryUnshapedProductSampleSubmission,
} from "../contracts/laboratoryUnshapedProductSampleJournal.js";
import { buildDevAccessHeaders } from "./devAccessSessionStorage.js";
import {
  describeRemoteNetworkFailure,
  resolveApiEndpoint,
  type RemoteServerErrorCode,
} from "./remoteServer.js";

const JOURNAL_PATH = "/api/laboratory/unshaped-product-sample-journal";
const DRAFT_PATH = "/api/laboratory/unshaped-product-sample-draft";

type RequestOptions = { baseUrl?: string; signal?: AbortSignal };
type ErrorResult = {
  status: "error";
  message: string;
  code?: RemoteServerErrorCode;
};

export type LaboratoryUnshapedProductSampleListResult =
  | { status: "ready"; records: LaboratoryUnshapedProductSampleRecord[] }
  | ErrorResult;
export type LaboratoryUnshapedProductSampleDraftResult =
  | ({ status: "ready" } & LaboratoryUnshapedProductSampleDraft)
  | ErrorResult;
export type LaboratoryUnshapedProductSampleSaveResult =
  | { status: "ready"; record: LaboratoryUnshapedProductSampleRecord }
  | ErrorResult;

export async function requestLaboratoryUnshapedProductSampleJournal(
  filters: LaboratoryUnshapedProductSampleFilters = {},
  options: RequestOptions = {},
): Promise<LaboratoryUnshapedProductSampleListResult> {
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
      "Сервер вернул журнал проб неформованной продукции в неподдерживаемом формате.",
    );
  }

  return { status: "ready", records: result.payload.records };
}

export async function requestLaboratoryUnshapedProductSampleDraft(
  options: RequestOptions = {},
): Promise<LaboratoryUnshapedProductSampleDraftResult> {
  const result = await requestJson(DRAFT_PATH, "GET", undefined, options);

  if (result.status === "error") return result;
  if (
    !isRecord(result.payload) ||
    typeof result.payload.sampleNumber !== "string" ||
    !Number.isInteger(result.payload.currentYear) ||
    typeof result.payload.sampleCode !== "string" ||
    typeof result.payload.sampleDate !== "string" ||
    typeof result.payload.sampledBy !== "string"
  ) {
    return invalidResponse(
      "Сервер вернул заготовку пробы в неподдерживаемом формате.",
    );
  }

  return {
    status: "ready",
    sampleNumber: result.payload.sampleNumber,
    currentYear: result.payload.currentYear as number,
    sampleCode: result.payload.sampleCode,
    sampleDate: result.payload.sampleDate,
    sampledBy: result.payload.sampledBy,
  };
}

export async function submitLaboratoryUnshapedProductSampleRecord(
  submission: LaboratoryUnshapedProductSampleSubmission,
  options: RequestOptions = {},
): Promise<LaboratoryUnshapedProductSampleSaveResult> {
  return readSaveResult(
    await requestJson(JOURNAL_PATH, "POST", submission, options),
  );
}

export async function correctLaboratoryUnshapedProductSampleRecord(
  id: string,
  submission: LaboratoryUnshapedProductSampleCorrection,
  options: RequestOptions = {},
): Promise<LaboratoryUnshapedProductSampleSaveResult> {
  return readSaveResult(await requestJson(
    `${JOURNAL_PATH}/${encodeURIComponent(id)}`,
    "PATCH",
    submission,
    options,
  ));
}

function readSaveResult(
  result: { status: "ready"; payload: unknown } | ErrorResult,
): LaboratoryUnshapedProductSampleSaveResult {
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
    | LaboratoryUnshapedProductSampleSubmission
    | LaboratoryUnshapedProductSampleCorrection
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
        "Не удалось обработать журнал проб неформованной продукции.",
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
        "Не удалось загрузить журнал проб неформованной продукции.",
        { baseUrl },
      ),
    };
  }
}

function isJournalRecord(
  value: unknown,
): value is LaboratoryUnshapedProductSampleRecord {
  return isRecord(value) &&
    typeof value.id === "string" &&
    laboratoryUnshapedProductSampleFields.every((field) => {
      const fieldValue = value[field.id];
      if (field.id === "chemicalAnalysisNumber" || field.id === "notes") {
        return fieldValue === undefined || typeof fieldValue === "string";
      }
      if (field.id === "suitability") {
        return typeof fieldValue === "string" &&
          laboratoryUnshapedProductSampleSuitabilityValues.includes(
            fieldValue as (typeof laboratoryUnshapedProductSampleSuitabilityValues)[number],
          );
      }
      return typeof fieldValue === "string";
    }) &&
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
