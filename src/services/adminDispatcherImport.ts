import type {
  AdminDispatcherImportExecuteResponse,
  AdminDispatcherImportOptionsResponse,
  AdminDispatcherImportPreviewResponse,
} from "../contracts";
import { buildDevAccessHeaders } from "./devAccessSessionStorage.js";
import {
  describeRemoteNetworkFailure,
  resolveApiEndpoint,
  type RemoteServerErrorCode,
} from "./remoteServer.js";

const ADMIN_DISPATCHER_IMPORT_PATH =
  "/api/admin/database/imports/dispatcher";

export type AdminDispatcherImportError = {
  status: "error";
  message: string;
  code?: RemoteServerErrorCode;
  statusCode?: number;
};

export type AdminDispatcherImportOptionsResult =
  | ({ status: "ready" } & AdminDispatcherImportOptionsResponse)
  | AdminDispatcherImportError;

export type AdminDispatcherImportPreviewResult =
  | ({ status: "ready" } & AdminDispatcherImportPreviewResponse)
  | AdminDispatcherImportError;

export type AdminDispatcherImportExecuteResult =
  | ({ status: "ready" } & AdminDispatcherImportExecuteResponse)
  | AdminDispatcherImportError;

type RequestOptions = {
  baseUrl?: string;
  signal?: AbortSignal;
};

export async function requestAdminDispatcherImportOptions({
  baseUrl,
  signal,
}: RequestOptions = {}): Promise<AdminDispatcherImportOptionsResult> {
  return requestImportEndpoint(
    ADMIN_DISPATCHER_IMPORT_PATH,
    "GET",
    undefined,
    isOptionsResponse,
    { baseUrl, signal },
  );
}

export async function previewAdminDispatcherImport(
  value: {
    spreadsheetUrl: string;
    businessAccountId: string;
  },
  options: RequestOptions = {},
): Promise<AdminDispatcherImportPreviewResult> {
  return requestImportEndpoint(
    `${ADMIN_DISPATCHER_IMPORT_PATH}/preview`,
    "POST",
    value,
    isPreviewResponse,
    options,
  );
}

export async function executeAdminDispatcherImport(
  value: {
    spreadsheetUrl: string;
    businessAccountId: string;
    previewToken: string;
  },
  options: RequestOptions = {},
): Promise<AdminDispatcherImportExecuteResult> {
  return requestImportEndpoint(
    `${ADMIN_DISPATCHER_IMPORT_PATH}/execute`,
    "POST",
    value,
    isExecuteResponse,
    options,
  );
}

async function requestImportEndpoint<T extends object>(
  path: string,
  method: "GET" | "POST",
  body: object | undefined,
  isResponse: (value: unknown) => value is T,
  { baseUrl, signal }: RequestOptions,
): Promise<({ status: "ready" } & T) | AdminDispatcherImportError> {
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
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const payload = await readJson(response);

    if (!response.ok) {
      return {
        status: "error",
        message: readErrorMessage(payload, "Сервер отклонил импорт."),
        statusCode: response.status,
      };
    }

    if (!isResponse(payload)) {
      return {
        status: "error",
        message: "Сервер вернул импорт в неподдерживаемом формате.",
        code: "invalid_response",
        statusCode: response.status,
      };
    }

    return {
      status: "ready",
      ...payload,
    };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return {
        status: "error",
        message: "Запрос импорта отменён.",
      };
    }

    return {
      status: "error",
      message: describeRemoteNetworkFailure("Не удалось выполнить импорт.", {
        baseUrl,
      }),
      code: "network_error",
    };
  }
}

async function readJson(response: Response): Promise<unknown> {
  if (!(response.headers.get("content-type") ?? "").includes("application/json")) {
    return null;
  }

  try {
    return await response.json();
  } catch {
    return null;
  }
}

function readErrorMessage(value: unknown, fallback: string) {
  return isRecord(value) &&
    isRecord(value.error) &&
    typeof value.error.message === "string"
    ? value.error.message
    : fallback;
}

function isOptionsResponse(
  value: unknown,
): value is AdminDispatcherImportOptionsResponse {
  return (
    isRecord(value) &&
    Array.isArray(value.businessAccounts) &&
    value.businessAccounts.every(
      (account) =>
        isRecord(account) &&
        typeof account.id === "string" &&
        typeof account.displayName === "string",
    )
  );
}

function isPreviewResponse(
  value: unknown,
): value is AdminDispatcherImportPreviewResponse {
  return (
    isRecord(value) &&
    typeof value.previewToken === "string" &&
    typeof value.totalRecords === "number" &&
    typeof value.newRecords === "number" &&
    typeof value.existingRecords === "number" &&
    Array.isArray(value.sheets) &&
    value.sheets.every(isSheetSummary) &&
    Array.isArray(value.warnings) &&
    value.warnings.every((warning) => typeof warning === "string")
  );
}

function isSheetSummary(value: unknown) {
  return (
    isRecord(value) &&
    (value.sheetName === "Оборудование" ||
      value.sheetName === "Инциденты" ||
      value.sheetName === "Посетители") &&
    typeof value.sourceRows === "number" &&
    typeof value.importRecords === "number" &&
    typeof value.skippedRows === "number"
  );
}

function isExecuteResponse(
  value: unknown,
): value is AdminDispatcherImportExecuteResponse {
  return (
    isRecord(value) &&
    typeof value.totalRecords === "number" &&
    typeof value.inserted === "number" &&
    typeof value.skipped === "number"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
