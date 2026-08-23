import {
  laboratoryRawMaterialWarehouseStatuses,
  type LaboratoryRawMaterialWarehouseFilters,
  type LaboratoryRawMaterialWarehouseRecord,
  type LaboratoryRawMaterialWarehouseResponse,
  type LaboratoryRawMaterialWarehouseReviewRequest,
  type LaboratoryRawMaterialWarehouseSubmission,
} from "../contracts/laboratoryRawMaterialWarehouse.js";
import { buildDevAccessHeaders } from "./devAccessSessionStorage.js";
import {
  describeRemoteNetworkFailure,
  resolveApiEndpoint,
  type RemoteServerErrorCode,
} from "./remoteServer.js";

const WAREHOUSE_PATH = "/api/laboratory/raw-material-warehouse";

type RequestOptions = { baseUrl?: string; signal?: AbortSignal };
type ErrorResult = {
  status: "error";
  message: string;
  code?: RemoteServerErrorCode;
};

export type LaboratoryRawMaterialWarehouseListResult =
  | ({ status: "ready" } & LaboratoryRawMaterialWarehouseResponse)
  | ErrorResult;

export type LaboratoryRawMaterialWarehouseSaveResult =
  | { status: "ready"; record: LaboratoryRawMaterialWarehouseRecord }
  | ErrorResult;

export async function requestLaboratoryRawMaterialWarehouse(
  filters: LaboratoryRawMaterialWarehouseFilters = {},
  options: RequestOptions = {},
): Promise<LaboratoryRawMaterialWarehouseListResult> {
  const params = new URLSearchParams();
  if (filters.dateFrom !== undefined) params.set("dateFrom", filters.dateFrom);
  if (filters.dateTo !== undefined) params.set("dateTo", filters.dateTo);
  if (filters.query !== undefined) params.set("query", filters.query);
  const suffix = params.size === 0 ? "" : `?${params.toString()}`;
  const result = await requestJson(`${WAREHOUSE_PATH}${suffix}`, "GET", undefined, options);
  if (result.status === "error") return result;
  if (!isWarehouseResponse(result.payload)) return invalidResponse();
  return { status: "ready", ...result.payload };
}

export async function submitLaboratoryRawMaterialMovement(
  submission: LaboratoryRawMaterialWarehouseSubmission,
  options: RequestOptions = {},
): Promise<LaboratoryRawMaterialWarehouseSaveResult> {
  return readSaveResult(await requestJson(WAREHOUSE_PATH, "POST", submission, options));
}

export async function reviewLaboratoryRawMaterialMovement(
  id: string,
  review: LaboratoryRawMaterialWarehouseReviewRequest,
  options: RequestOptions = {},
): Promise<LaboratoryRawMaterialWarehouseSaveResult> {
  return readSaveResult(await requestJson(
    `${WAREHOUSE_PATH}/${encodeURIComponent(id)}/review`,
    "PATCH",
    review,
    options,
  ));
}

function readSaveResult(
  result: { status: "ready"; payload: unknown } | ErrorResult,
): LaboratoryRawMaterialWarehouseSaveResult {
  if (result.status === "error") return result;
  if (!isRecord(result.payload) || !isWarehouseRecord(result.payload.record)) {
    return invalidResponse();
  }
  return { status: "ready", record: result.payload.record };
}

async function requestJson(
  path: string,
  method: "GET" | "POST" | "PATCH",
  body: LaboratoryRawMaterialWarehouseSubmission | LaboratoryRawMaterialWarehouseReviewRequest | undefined,
  { baseUrl, signal }: RequestOptions,
): Promise<{ status: "ready"; payload: unknown } | ErrorResult> {
  const endpoint = resolveApiEndpoint(path, path, { baseUrl });
  try {
    const response = await fetch(endpoint, {
      method,
      credentials: "include",
      signal,
      headers: buildDevAccessHeaders({
        Accept: "application/json",
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      }),
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const payload = await readJson(response);
    if (!response.ok) return readRemoteError(payload);
    return { status: "ready", payload };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return { status: "error", message: "Запрос склада сырья отменён." };
    }
    return {
      status: "error",
      code: "network_error",
      message: describeRemoteNetworkFailure(
        "Не удалось загрузить склад сырья.",
        { baseUrl },
      ),
    };
  }
}

function isWarehouseResponse(value: unknown): value is LaboratoryRawMaterialWarehouseResponse {
  return isRecord(value) &&
    Array.isArray(value.records) && value.records.every(isWarehouseRecord) &&
    Array.isArray(value.pendingRecords) && value.pendingRecords.every(isWarehouseRecord) &&
    isRecord(value.options) &&
    isStringArray(value.options.materials) &&
    isStringArray(value.options.stackLocations) &&
    isStringArray(value.options.suppliers) &&
    isStringArray(value.options.recipients) &&
    isRecord(value.totals) &&
    Number.isInteger(value.totals.recordCount) &&
    typeof value.totals.receivedTons === "string" &&
    typeof value.totals.shippedTons === "string" &&
    typeof value.totals.balanceTons === "string" &&
    isRecord(value.permissions) &&
    typeof value.permissions.canSubmit === "boolean" &&
    typeof value.permissions.canReview === "boolean" &&
    typeof value.draftDate === "string";
}

function isWarehouseRecord(value: unknown): value is LaboratoryRawMaterialWarehouseRecord {
  return isRecord(value) &&
    typeof value.id === "string" &&
    Number.isInteger(value.revisionNumber) &&
    laboratoryRawMaterialWarehouseStatuses.some((status) => status === value.status) &&
    typeof value.movementDate === "string" &&
    typeof value.materialLabel === "string" &&
    typeof value.stackLocation === "string" &&
    typeof value.receivedTons === "string" &&
    typeof value.supplier === "string" &&
    typeof value.shippedTons === "string" &&
    typeof value.recipient === "string" &&
    typeof value.submittedByDisplayName === "string" &&
    typeof value.submittedAt === "string" &&
    (value.warehouseKeeperDisplayName === undefined || typeof value.warehouseKeeperDisplayName === "string") &&
    (value.reviewedAt === undefined || typeof value.reviewedAt === "string");
}

function readRemoteError(payload: unknown): ErrorResult {
  const error = isRecord(payload) && isRecord(payload.error) ? payload.error : undefined;
  return {
    status: "error",
    message: error !== undefined && typeof error.message === "string"
      ? error.message
      : "Не удалось обработать данные склада сырья.",
    ...(error !== undefined && typeof error.code === "string"
      ? { code: error.code as RemoteServerErrorCode }
      : {}),
  };
}

function invalidResponse(): ErrorResult {
  return {
    status: "error",
    message: "Сервер вернул данные склада сырья в неподдерживаемом формате.",
  };
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function readJson(response: Response) {
  try {
    return await response.json() as unknown;
  } catch {
    return undefined;
  }
}
