import type {
  Warehouse1cAccount,
  Warehouse1cStockBalance,
  Warehouse1cStockFilters,
  Warehouse1cStockReport,
  Warehouse1cStockResponse,
  Warehouse1cUpload,
  Warehouse1cUploadSheet,
  Warehouse1cUploadSheetsResponse,
  Warehouse1cUploadsResponse,
} from "../contracts/warehouse1c.js";
import { buildDevAccessHeaders } from "./devAccessSessionStorage.js";
import {
  requestProtectedFile,
  type ProtectedPdfResult,
} from "./protectedPdf.js";
import {
  describeRemoteNetworkFailure,
  resolveApiEndpoint,
  type RemoteServerErrorCode,
} from "./remoteServer.js";

const STOCK_BALANCES_PATH = "/api/warehouse-1c/stock-balances";
const UPLOADS_PATH = "/api/warehouse-1c/uploads";
/** Тот же тип, которым сервер отдаёт сохранённую выгрузку. */
const xlsxContentType =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

type RequestOptions = { baseUrl?: string; signal?: AbortSignal };

export type Warehouse1cStockResult =
  | ({ status: "ready" } & Warehouse1cStockResponse)
  | { status: "error"; message: string; code?: RemoteServerErrorCode };

export type Warehouse1cUploadsResult =
  | ({ status: "ready" } & Warehouse1cUploadsResponse)
  | { status: "error"; message: string; code?: RemoteServerErrorCode };

export type Warehouse1cUploadSheetsResult =
  | ({ status: "ready" } & Warehouse1cUploadSheetsResponse)
  | { status: "error"; message: string; code?: RemoteServerErrorCode };

export async function requestWarehouse1cStockBalances(
  filters: Warehouse1cStockFilters = {},
  { baseUrl, signal }: RequestOptions = {},
): Promise<Warehouse1cStockResult> {
  const params = new URLSearchParams();

  if (filters.accountCode !== undefined) {
    params.set("accountCode", filters.accountCode);
  }
  if (filters.reportDate !== undefined) {
    params.set("reportDate", filters.reportDate);
  }

  const path = params.size === 0
    ? STOCK_BALANCES_PATH
    : `${STOCK_BALANCES_PATH}?${params.toString()}`;
  const endpoint = resolveApiEndpoint(path, path, { baseUrl });

  try {
    const response = await fetch(endpoint, {
      method: "GET",
      headers: buildDevAccessHeaders({ Accept: "application/json" }),
      credentials: "include",
      signal,
    });
    const payload = await readJson(response);

    if (!response.ok) return readRemoteError(payload);
    if (!isStockResponse(payload)) {
      return {
        status: "error",
        code: "invalid_response",
        message: "Сервер вернул остатки 1С в неподдерживаемом формате.",
      };
    }

    return { status: "ready", ...payload };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return { status: "error", message: "Запрос остатков 1С отменён." };
    }

    return {
      status: "error",
      code: "network_error",
      message: describeRemoteNetworkFailure(
        "Не удалось загрузить остатки 1С.",
        { baseUrl },
      ),
    };
  }
}

/**
 * Журнал приёма выгрузок: строка на каждую попытку, включая отклонённые.
 * Отдельный запрос от остатков — это разные виды одного раздела.
 */
export async function requestWarehouse1cUploads(
  { baseUrl, signal }: RequestOptions = {},
): Promise<Warehouse1cUploadsResult> {
  const endpoint = resolveApiEndpoint(UPLOADS_PATH, UPLOADS_PATH, { baseUrl });

  try {
    const response = await fetch(endpoint, {
      method: "GET",
      headers: buildDevAccessHeaders({ Accept: "application/json" }),
      credentials: "include",
      signal,
    });
    const payload = await readJson(response);

    if (!response.ok) {
      return readRemoteError(payload, "Не удалось загрузить журнал выгрузок 1С.");
    }
    if (!isUploadsResponse(payload)) {
      return {
        status: "error",
        code: "invalid_response",
        message: "Сервер вернул журнал выгрузок в неподдерживаемом формате.",
      };
    }

    return { status: "ready", ...payload };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return { status: "error", message: "Запрос журнала выгрузок отменён." };
    }

    return {
      status: "error",
      code: "network_error",
      message: describeRemoteNetworkFailure(
        "Не удалось загрузить журнал выгрузок 1С.",
        { baseUrl },
      ),
    };
  }
}

/** Лист выгрузки как он составлен: разбор в остатки здесь не участвует. */
export async function requestWarehouse1cUploadSheets(
  uploadId: string,
  { baseUrl, signal }: RequestOptions = {},
): Promise<Warehouse1cUploadSheetsResult> {
  const path = `${UPLOADS_PATH}/${encodeURIComponent(uploadId)}/sheet`;
  const endpoint = resolveApiEndpoint(path, path, { baseUrl });

  try {
    const response = await fetch(endpoint, {
      method: "GET",
      headers: buildDevAccessHeaders({ Accept: "application/json" }),
      credentials: "include",
      signal,
    });
    const payload = await readJson(response);

    if (!response.ok) {
      return readRemoteError(payload, "Не удалось открыть файл выгрузки.");
    }
    if (!isUploadSheetsResponse(payload)) {
      return {
        status: "error",
        code: "invalid_response",
        message: "Сервер вернул лист выгрузки в неподдерживаемом формате.",
      };
    }

    return { status: "ready", ...payload };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return { status: "error", message: "Просмотр файла выгрузки отменён." };
    }

    return {
      status: "error",
      code: "network_error",
      message: describeRemoteNetworkFailure(
        "Не удалось открыть файл выгрузки.",
        { baseUrl },
      ),
    };
  }
}

function isUploadSheetsResponse(
  value: unknown,
): value is Warehouse1cUploadSheetsResponse {
  return isRecord(value) &&
    typeof value.fileName === "string" &&
    Array.isArray(value.sheets) &&
    value.sheets.every(isUploadSheet);
}

function isUploadSheet(value: unknown): value is Warehouse1cUploadSheet {
  return isRecord(value) &&
    typeof value.name === "string" &&
    typeof value.isTruncated === "boolean" &&
    Array.isArray(value.merges) &&
    value.merges.every(isUploadSheetMerge) &&
    Array.isArray(value.rows) &&
    value.rows.every((row) =>
      Array.isArray(row) && row.every((cell) => typeof cell === "string"));
}

function isUploadSheetMerge(value: unknown) {
  return isRecord(value) &&
    typeof value.row === "number" &&
    typeof value.column === "number" &&
    typeof value.rowSpan === "number" &&
    typeof value.columnSpan === "number";
}

export function requestWarehouse1cUploadFile(
  uploadId: string,
  { baseUrl, signal }: RequestOptions = {},
): Promise<ProtectedPdfResult> {
  const path = `${UPLOADS_PATH}/${encodeURIComponent(uploadId)}/file`;

  return requestProtectedFile({
    path,
    fallbackFilename: `warehouse-1c-${uploadId}.xlsx`,
    failureMessage: "Не удалось скачать файл выгрузки.",
    cancellationMessage: "Скачивание файла выгрузки отменено.",
    contentType: xlsxContentType,
    invalidFormatMessage: "Сервер вернул файл выгрузки в неподдерживаемом формате.",
    ...(baseUrl === undefined ? {} : { baseUrl }),
    ...(signal === undefined ? {} : { signal }),
  });
}

function isUploadsResponse(value: unknown): value is Warehouse1cUploadsResponse {
  return isRecord(value) &&
    Array.isArray(value.uploads) &&
    value.uploads.every(isUpload) &&
    (value.isReadOnlySource === undefined ||
      typeof value.isReadOnlySource === "boolean");
}

function isUpload(value: unknown): value is Warehouse1cUpload {
  return isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.receivedAt === "string" &&
    (value.outcome === "accepted" || value.outcome === "rejected") &&
    typeof value.statusCode === "number" &&
    typeof value.fileName === "string" &&
    typeof value.hasFile === "boolean";
}

function isStockResponse(value: unknown): value is Warehouse1cStockResponse {
  return isRecord(value) &&
    typeof value.accountCode === "string" &&
    Array.isArray(value.accounts) &&
    value.accounts.every(isAccount) &&
    Array.isArray(value.availableDates) &&
    value.availableDates.every((date) => typeof date === "string") &&
    (value.isReadOnlySource === undefined ||
      typeof value.isReadOnlySource === "boolean") &&
    (value.report === undefined || isStockReport(value.report));
}

function isAccount(value: unknown): value is Warehouse1cAccount {
  return isRecord(value) &&
    typeof value.code === "string" &&
    typeof value.label === "string";
}

function isStockReport(value: unknown): value is Warehouse1cStockReport {
  return isRecord(value) &&
    typeof value.accountCode === "string" &&
    typeof value.accountLabel === "string" &&
    typeof value.reportDate === "string" &&
    typeof value.fileName === "string" &&
    typeof value.importedAt === "string" &&
    Array.isArray(value.balances) &&
    value.balances.every(isBalance);
}

function isBalance(value: unknown): value is Warehouse1cStockBalance {
  return isRecord(value) &&
    typeof value.nomenclature === "string" &&
    typeof value.openingBalance === "string" &&
    typeof value.closingBalance === "string";
}

function readRemoteError(
  payload: unknown,
  fallback = "Не удалось загрузить остатки 1С.",
): { status: "error"; message: string; code?: RemoteServerErrorCode } {
  const error = isRecord(payload) && isRecord(payload.error)
    ? payload.error
    : undefined;

  return {
    status: "error",
    message: error !== undefined && typeof error.message === "string"
      ? error.message
      : fallback,
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
