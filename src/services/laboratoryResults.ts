import {
  laboratoryIndicatorIds,
  type LaboratoryIndicatorId,
  type LaboratoryReference,
  type LaboratoryResult,
  type LaboratoryResultFilters,
  type LaboratoryResultSubmission,
} from "../contracts/laboratoryResults.js";
import { buildDevAccessHeaders } from "./devAccessSessionStorage.js";
import {
  describeRemoteNetworkFailure,
  resolveApiEndpoint,
  type RemoteServerErrorCode,
} from "./remoteServer.js";

const REFERENCE_PATH = "/api/laboratory/reference";
const RESULTS_PATH = "/api/laboratory/results";

type RequestOptions = { baseUrl?: string; signal?: AbortSignal };
type ErrorResult = {
  status: "error";
  message: string;
  code?: RemoteServerErrorCode;
};

export type LaboratoryReferenceResult =
  | { status: "ready"; reference: LaboratoryReference }
  | ErrorResult;
export type LaboratoryResultsResult =
  | { status: "ready"; results: LaboratoryResult[] }
  | ErrorResult;
export type LaboratoryResultSaveResult =
  | { status: "ready"; result: LaboratoryResult }
  | ErrorResult;

export async function requestLaboratoryReference(
  options: RequestOptions = {},
): Promise<LaboratoryReferenceResult> {
  const result = await requestJson(REFERENCE_PATH, "GET", undefined, options);
  if (result.status === "error") return result;
  if (!isRecord(result.payload) || !isLaboratoryReference(result.payload.reference)) {
    return invalidResponse("Сервер вернул справочник лаборатории в неподдерживаемом формате.");
  }
  return { status: "ready", reference: result.payload.reference };
}

export async function requestLaboratoryResults(
  filters: LaboratoryResultFilters = {},
  options: RequestOptions = {},
): Promise<LaboratoryResultsResult> {
  const params = new URLSearchParams();
  if (filters.section !== undefined) params.set("section", filters.section);
  if (filters.dateFrom !== undefined) params.set("dateFrom", filters.dateFrom);
  if (filters.dateTo !== undefined) params.set("dateTo", filters.dateTo);
  if (filters.materialLabel !== undefined) {
    params.set("material", filters.materialLabel);
  }
  if (filters.productBrand !== undefined) {
    params.set("brand", filters.productBrand);
  }
  const suffix = params.size === 0 ? "" : `?${params.toString()}`;
  const result = await requestJson(
    `${RESULTS_PATH}${suffix}`,
    "GET",
    undefined,
    options,
  );
  if (result.status === "error") return result;
  if (
    !isRecord(result.payload) ||
    !Array.isArray(result.payload.results) ||
    !result.payload.results.every(isLaboratoryResult)
  ) {
    return invalidResponse("Сервер вернул результаты испытаний в неподдерживаемом формате.");
  }
  return { status: "ready", results: result.payload.results };
}

export async function submitLaboratoryResult(
  submission: LaboratoryResultSubmission,
  options: RequestOptions = {},
): Promise<LaboratoryResultSaveResult> {
  const result = await requestJson(RESULTS_PATH, "POST", submission, options);
  if (result.status === "error") return result;
  if (!isRecord(result.payload) || !isLaboratoryResult(result.payload.result)) {
    return invalidResponse("Сервер не вернул сохранённый результат испытаний.");
  }
  return { status: "ready", result: result.payload.result };
}

async function requestJson(
  path: string,
  method: "GET" | "POST",
  body: LaboratoryResultSubmission | undefined,
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
      return readRemoteError(payload, "Не удалось обработать результаты испытаний.");
    }
    return { status: "ready", payload };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return { status: "error", message: "Запрос результатов отменён." };
    }
    return {
      status: "error",
      code: "network_error",
      message: describeRemoteNetworkFailure(
        "Не удалось загрузить результаты испытаний.",
        { baseUrl },
      ),
    };
  }
}

function isLaboratoryReference(value: unknown): value is LaboratoryReference {
  return isRecord(value) &&
    Array.isArray(value.indicators) &&
    value.indicators.every(isIndicatorReference) &&
    Array.isArray(value.finishedProductTypes) &&
    value.finishedProductTypes.every(isProductTypeReference);
}

function isProductTypeReference(value: unknown) {
  return isRecord(value) && typeof value.label === "string";
}

function isIndicatorReference(indicator: unknown) {
  return isRecord(indicator) &&
    isIndicatorId(indicator.id) &&
    typeof indicator.label === "string" &&
    (indicator.standard === undefined || typeof indicator.standard === "string");
}

function isLaboratoryResult(value: unknown): value is LaboratoryResult {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    typeof value.analysisDate !== "string" ||
    typeof value.materialLabel !== "string" ||
    typeof value.laboratoryAssistantDisplayName !== "string" ||
    typeof value.createdAt !== "string"
  ) {
    return false;
  }
  return value.section === "incoming"
    ? Array.isArray(value.samples) && value.samples.every((sample) =>
        isRecord(sample) &&
        typeof sample.sampleIdentifier === "string" &&
        isIndicatorValues(sample.values)
      )
    : value.section === "finished_product" &&
        typeof value.productBrand === "string" &&
        isIndicatorValues(value.values);
}

function isIndicatorValues(value: unknown) {
  return isRecord(value) && Object.entries(value).every(
    ([key, item]) => isIndicatorId(key) && typeof item === "string",
  );
}

function isIndicatorId(value: unknown): value is LaboratoryIndicatorId {
  return typeof value === "string" &&
    laboratoryIndicatorIds.includes(value as LaboratoryIndicatorId);
}

async function readJson(response: Response) {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

function readRemoteError(payload: unknown, fallback: string): ErrorResult {
  if (
    isRecord(payload) &&
    isRecord(payload.error) &&
    typeof payload.error.message === "string"
  ) {
    return {
      status: "error",
      message: payload.error.message,
      ...(typeof payload.error.code === "string"
        ? { code: payload.error.code as RemoteServerErrorCode }
        : {}),
    };
  }
  return { status: "error", message: fallback };
}

function invalidResponse(message: string): ErrorResult {
  return { status: "error", code: "invalid_response", message };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
