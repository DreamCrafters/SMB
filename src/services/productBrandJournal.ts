import {
  productBrandFields,
  type ProductBrandDeletionImpact,
  type ProductBrandDeletionResult,
  type ProductBrandFilters,
  type ProductBrandRecord,
  type ProductBrandSubmission,
} from "../contracts/productBrands.js";
import { buildDevAccessHeaders } from "./devAccessSessionStorage.js";
import {
  describeRemoteNetworkFailure,
  resolveApiEndpoint,
  type RemoteServerErrorCode,
} from "./remoteServer.js";

const JOURNAL_PATH = "/api/laboratory/product-brands";

type RequestOptions = { baseUrl?: string; signal?: AbortSignal };
type ErrorResult = {
  status: "error";
  message: string;
  code?: RemoteServerErrorCode;
};

export type ProductBrandJournalListResult =
  | { status: "ready"; records: ProductBrandRecord[] }
  | ErrorResult;

export type ProductBrandJournalSaveResult =
  | { status: "ready"; record: ProductBrandRecord }
  | ErrorResult;

export type ProductBrandDeletionImpactResult =
  | { status: "ready"; impact: ProductBrandDeletionImpact }
  | ErrorResult;

export type ProductBrandDeleteResult =
  | { status: "ready"; deletion: ProductBrandDeletionResult }
  | ErrorResult;

export async function requestProductBrandJournal(
  filters: ProductBrandFilters = {},
  options: RequestOptions = {},
): Promise<ProductBrandJournalListResult> {
  const params = new URLSearchParams();
  if (filters.query !== undefined) params.set("query", filters.query);
  const path = params.size === 0
    ? JOURNAL_PATH
    : `${JOURNAL_PATH}?${params.toString()}`;
  const result = await requestJson(path, "GET", undefined, options);
  if (result.status === "error") return result;
  if (
    !isRecord(result.payload) ||
    !Array.isArray(result.payload.records) ||
    !result.payload.records.every(isProductBrandRecord)
  ) {
    return invalidResponse("Сервер вернул журнал марок в неподдерживаемом формате.");
  }
  return { status: "ready", records: result.payload.records };
}

export async function submitProductBrand(
  submission: ProductBrandSubmission,
  options: RequestOptions = {},
): Promise<ProductBrandJournalSaveResult> {
  return readSaveResult(
    await requestJson(JOURNAL_PATH, "POST", submission, options),
  );
}

export async function correctProductBrand(
  id: string,
  submission: ProductBrandSubmission,
  options: RequestOptions = {},
): Promise<ProductBrandJournalSaveResult> {
  return readSaveResult(await requestJson(
    `${JOURNAL_PATH}/${encodeURIComponent(id)}`,
    "PATCH",
    submission,
    options,
  ));
}

export async function requestProductBrandDeletionImpact(
  id: string,
  options: RequestOptions = {},
): Promise<ProductBrandDeletionImpactResult> {
  const result = await requestJson(
    `${JOURNAL_PATH}/${encodeURIComponent(id)}/deletion-impact`,
    "GET",
    undefined,
    options,
  );
  if (result.status === "error") return result;
  if (
    !isRecord(result.payload) ||
    !isProductBrandDeletionImpact(result.payload.impact)
  ) {
    return invalidResponse("Сервер не вернул сведения об использовании марки.");
  }
  return { status: "ready", impact: result.payload.impact };
}

export async function deleteProductBrand(
  id: string,
  replacementId: string | undefined,
  options: RequestOptions = {},
): Promise<ProductBrandDeleteResult> {
  const result = await requestJson(
    `${JOURNAL_PATH}/${encodeURIComponent(id)}`,
    "DELETE",
    replacementId === undefined ? {} : { replacementId },
    options,
  );
  if (result.status === "error") return result;
  if (
    !isRecord(result.payload) ||
    !isProductBrandDeletionResult(result.payload.deletion)
  ) {
    return invalidResponse("Сервер не подтвердил удаление марки.");
  }
  return { status: "ready", deletion: result.payload.deletion };
}

function readSaveResult(
  result: { status: "ready"; payload: unknown } | ErrorResult,
): ProductBrandJournalSaveResult {
  if (result.status === "error") return result;
  if (!isRecord(result.payload) || !isProductBrandRecord(result.payload.record)) {
    return invalidResponse("Сервер не вернул сохранённую марку.");
  }
  return { status: "ready", record: result.payload.record };
}

async function requestJson(
  path: string,
  method: "GET" | "POST" | "PATCH" | "DELETE",
  body: ProductBrandSubmission | { replacementId?: string } | undefined,
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
    if (!response.ok) return readRemoteError(payload);
    return { status: "ready", payload };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return { status: "error", message: "Запрос журнала марок отменён." };
    }
    return {
      status: "error",
      code: "network_error",
      message: describeRemoteNetworkFailure(
        "Не удалось загрузить журнал марок.",
        { baseUrl },
      ),
    };
  }
}

function isProductBrandRecord(value: unknown): value is ProductBrandRecord {
  return isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.createdAt === "string" &&
    typeof value.updatedAt === "string" &&
    productBrandFields.every((field) => typeof value[field.id] === "string");
}

function isProductBrandDeletionImpact(
  value: unknown,
): value is ProductBrandDeletionImpact {
  return isRecord(value) &&
    typeof value.usageCount === "number" &&
    Number.isSafeInteger(value.usageCount) &&
    value.usageCount >= 0;
}

function isProductBrandDeletionResult(
  value: unknown,
): value is ProductBrandDeletionResult {
  return isRecord(value) &&
    typeof value.sourceId === "string" &&
    typeof value.sourceName === "string" &&
    typeof value.updatedRecords === "number" &&
    Number.isSafeInteger(value.updatedRecords) &&
    value.updatedRecords >= 0 &&
    (value.replacementId === undefined || typeof value.replacementId === "string") &&
    (value.replacementName === undefined || typeof value.replacementName === "string");
}

function readRemoteError(payload: unknown): ErrorResult {
  const error = isRecord(payload) && isRecord(payload.error)
    ? payload.error
    : undefined;
  return {
    status: "error",
    message: error !== undefined && typeof error.message === "string"
      ? error.message
      : "Не удалось обработать журнал марок.",
    ...(error !== undefined && typeof error.code === "string"
      ? { code: error.code as RemoteServerErrorCode }
      : {}),
  };
}

async function readJson(response: Response) {
  try {
    return await response.json() as unknown;
  } catch {
    return undefined;
  }
}

function invalidResponse(message: string): ErrorResult {
  return { status: "error", code: "invalid_response", message };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
