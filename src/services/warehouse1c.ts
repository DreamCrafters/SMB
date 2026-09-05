import type {
  Warehouse1cAccount,
  Warehouse1cStockBalance,
  Warehouse1cStockFilters,
  Warehouse1cStockReport,
  Warehouse1cStockResponse,
} from "../contracts/warehouse1c.js";
import { buildDevAccessHeaders } from "./devAccessSessionStorage.js";
import {
  describeRemoteNetworkFailure,
  resolveApiEndpoint,
  type RemoteServerErrorCode,
} from "./remoteServer.js";

const STOCK_BALANCES_PATH = "/api/warehouse-1c/stock-balances";

type RequestOptions = { baseUrl?: string; signal?: AbortSignal };

export type Warehouse1cStockResult =
  | ({ status: "ready" } & Warehouse1cStockResponse)
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

function readRemoteError(payload: unknown): Warehouse1cStockResult {
  const error = isRecord(payload) && isRecord(payload.error)
    ? payload.error
    : undefined;

  return {
    status: "error",
    message: error !== undefined && typeof error.message === "string"
      ? error.message
      : "Не удалось загрузить остатки 1С.",
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
