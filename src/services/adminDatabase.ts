import type {
  AccountAccessErrorCode,
  AdminDatabaseCellValue,
  AdminDatabaseRowsResponse,
  AdminDatabaseTablesResponse,
} from "../contracts";
import { buildDevAccessHeaders } from "./devAccessSessionStorage.js";
import {
  describeRemoteNetworkFailure,
  resolveApiEndpoint,
  type RemoteServerErrorCode,
} from "./remoteServer.js";

const ADMIN_DATABASE_PATH = "/api/admin/database";

export type AdminDatabaseErrorState = {
  status: "error";
  message: string;
  code?: AccountAccessErrorCode | RemoteServerErrorCode;
  statusCode?: number;
};

export type AdminDatabaseTablesResult =
  | {
      status: "ready";
      tables: AdminDatabaseTablesResponse["tables"];
    }
  | AdminDatabaseErrorState;

export type AdminDatabaseRowsResult =
  | ({
      status: "ready";
    } & AdminDatabaseRowsResponse)
  | AdminDatabaseErrorState;

export type AdminDatabaseMutationResult =
  | {
      status: "ready";
    }
  | AdminDatabaseErrorState;

type AdminDatabaseRequestOptions = {
  baseUrl?: string;
  signal?: AbortSignal;
};

export async function requestAdminDatabaseTables({
  baseUrl,
  signal,
}: AdminDatabaseRequestOptions = {}): Promise<AdminDatabaseTablesResult> {
  const endpoint = resolveApiEndpoint(ADMIN_DATABASE_PATH, ADMIN_DATABASE_PATH, {
    baseUrl,
  });

  try {
    const response = await fetch(endpoint, {
      method: "GET",
      headers: buildDevAccessHeaders({
        Accept: "application/json",
      }),
      credentials: "include",
      signal,
    });
    const payload = await readJson(response);

    if (!response.ok) {
      return readRemoteError(payload, response.status, "Сервер отклонил запрос БД.");
    }

    if (isAdminDatabaseTablesResponse(payload)) {
      return {
        status: "ready",
        tables: payload.tables,
      };
    }

    return {
      status: "error",
      message: "Сервер вернул список таблиц в неподдерживаемом формате.",
      code: "invalid_response",
      statusCode: response.status,
    };
  } catch (error) {
    if (isAbortError(error)) {
      return {
        status: "error",
        message: "Запрос таблиц БД отменён.",
      };
    }

    return {
      status: "error",
      message: describeRemoteNetworkFailure("Не удалось запросить таблицы БД.", {
        baseUrl,
      }),
      code: "network_error",
    };
  }
}

export async function requestAdminDatabaseRows(
  tableName: string,
  {
    baseUrl,
    signal,
    limit = 100,
    offset = 0,
  }: AdminDatabaseRequestOptions & {
    limit?: number;
    offset?: number;
  } = {},
): Promise<AdminDatabaseRowsResult> {
  const endpoint = buildRowsEndpoint(tableName, { baseUrl, limit, offset });

  try {
    const response = await fetch(endpoint, {
      method: "GET",
      headers: buildDevAccessHeaders({
        Accept: "application/json",
      }),
      credentials: "include",
      signal,
    });
    const payload = await readJson(response);

    if (!response.ok) {
      return readRemoteError(payload, response.status, "Сервер отклонил запрос строк БД.");
    }

    if (isAdminDatabaseRowsResponse(payload)) {
      return {
        status: "ready",
        ...payload,
      };
    }

    return {
      status: "error",
      message: "Сервер вернул строки БД в неподдерживаемом формате.",
      code: "invalid_response",
      statusCode: response.status,
    };
  } catch (error) {
    if (isAbortError(error)) {
      return {
        status: "error",
        message: "Запрос строк БД отменён.",
      };
    }

    return {
      status: "error",
      message: describeRemoteNetworkFailure("Не удалось запросить строки БД.", {
        baseUrl,
      }),
      code: "network_error",
    };
  }
}

export async function updateAdminDatabaseRow(
  tableName: string,
  value: {
    primaryKey: Record<string, AdminDatabaseCellValue>;
    values: Record<string, AdminDatabaseCellValue>;
  },
  { baseUrl, signal }: AdminDatabaseRequestOptions = {},
): Promise<AdminDatabaseMutationResult> {
  return mutateAdminDatabaseRow("PATCH", tableName, value, { baseUrl, signal });
}

export async function deleteAdminDatabaseRow(
  tableName: string,
  value: {
    primaryKey: Record<string, AdminDatabaseCellValue>;
    values?: Record<string, AdminDatabaseCellValue>;
  },
  { baseUrl, signal }: AdminDatabaseRequestOptions = {},
): Promise<AdminDatabaseMutationResult> {
  return mutateAdminDatabaseRow(
    "DELETE",
    tableName,
    {
      primaryKey: value.primaryKey,
      values: value.values ?? {},
    },
    { baseUrl, signal },
  );
}

async function mutateAdminDatabaseRow(
  method: "PATCH" | "DELETE",
  tableName: string,
  value: {
    primaryKey: Record<string, AdminDatabaseCellValue>;
    values: Record<string, AdminDatabaseCellValue>;
  },
  { baseUrl, signal }: AdminDatabaseRequestOptions,
): Promise<AdminDatabaseMutationResult> {
  const endpoint = buildRowsEndpoint(tableName, { baseUrl });

  try {
    const response = await fetch(endpoint, {
      method,
      headers: buildDevAccessHeaders({
        Accept: "application/json",
        "Content-Type": "application/json",
      }),
      credentials: "include",
      signal,
      body: JSON.stringify(value),
    });
    const payload = await readJson(response);

    if (!response.ok) {
      return readRemoteError(payload, response.status, "Сервер отклонил изменение БД.");
    }

    if (isOkResponse(payload)) {
      return {
        status: "ready",
      };
    }

    return {
      status: "error",
      message: "Сервер вернул изменение БД в неподдерживаемом формате.",
      code: "invalid_response",
      statusCode: response.status,
    };
  } catch (error) {
    if (isAbortError(error)) {
      return {
        status: "error",
        message: "Запрос изменения БД отменён.",
      };
    }

    return {
      status: "error",
      message: describeRemoteNetworkFailure("Не удалось изменить строку БД.", {
        baseUrl,
      }),
      code: "network_error",
    };
  }
}

function buildRowsEndpoint(
  tableName: string,
  {
    baseUrl,
    limit,
    offset,
  }: {
    baseUrl?: string;
    limit?: number;
    offset?: number;
  },
) {
  const endpoint = resolveApiEndpoint(
    `${ADMIN_DATABASE_PATH}/tables/${encodeURIComponent(tableName)}/rows`,
    `${ADMIN_DATABASE_PATH}/tables/${encodeURIComponent(tableName)}/rows`,
    { baseUrl },
  );
  const isAbsoluteEndpoint = /^https?:\/\//.test(endpoint);
  const url = isAbsoluteEndpoint
    ? new URL(endpoint)
    : new URL(endpoint, "http://localhost");

  if (limit !== undefined) {
    url.searchParams.set("limit", String(limit));
  }

  if (offset !== undefined) {
    url.searchParams.set("offset", String(offset));
  }

  return isAbsoluteEndpoint ? url.toString() : `${url.pathname}${url.search}`;
}

async function readJson(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type") ?? "";

  if (!contentType.includes("application/json")) {
    return null;
  }

  try {
    return await response.json();
  } catch {
    return null;
  }
}

function readRemoteError(
  payload: unknown,
  statusCode: number,
  fallback: string,
): AdminDatabaseErrorState {
  return {
    status: "error",
    message: readErrorMessage(payload, fallback),
    code: readErrorCode(payload),
    statusCode,
  };
}

function readErrorMessage(payload: unknown, fallback: string) {
  if (
    isRecord(payload) &&
    isRecord(payload.error) &&
    typeof payload.error.message === "string"
  ) {
    return payload.error.message;
  }

  return fallback;
}

function readErrorCode(payload: unknown) {
  if (
    isRecord(payload) &&
    isRecord(payload.error) &&
    isKnownErrorCode(payload.error.code)
  ) {
    return payload.error.code;
  }

  return undefined;
}

function isAdminDatabaseTablesResponse(
  value: unknown,
): value is AdminDatabaseTablesResponse {
  return (
    isRecord(value) &&
    Array.isArray(value.tables) &&
    value.tables.every(isAdminDatabaseTable)
  );
}

function isAdminDatabaseRowsResponse(
  value: unknown,
): value is AdminDatabaseRowsResponse {
  return (
    isRecord(value) &&
    isAdminDatabaseTable(value.table) &&
    Array.isArray(value.rows) &&
    value.rows.every(isAdminDatabaseRow) &&
    typeof value.limit === "number" &&
    typeof value.offset === "number"
  );
}

function isAdminDatabaseTable(value: unknown) {
  return (
    isRecord(value) &&
    typeof value.name === "string" &&
    typeof value.label === "string" &&
    (typeof value.rowCount === "number" || value.rowCount === null) &&
    Array.isArray(value.columns) &&
    value.columns.every(isAdminDatabaseColumn) &&
    Array.isArray(value.primaryKey) &&
    value.primaryKey.every((item) => typeof item === "string") &&
    typeof value.canDelete === "boolean"
  );
}

function isAdminDatabaseColumn(value: unknown) {
  return (
    isRecord(value) &&
    typeof value.name === "string" &&
    typeof value.label === "string" &&
    (value.format === "text" ||
      value.format === "status" ||
      value.format === "date" ||
      value.format === "date_time" ||
      value.format === "number") &&
    typeof value.editable === "boolean" &&
    typeof value.multiline === "boolean" &&
    typeof value.nullable === "boolean"
  );
}

function isAdminDatabaseRow(value: unknown) {
  return (
    isRecord(value) &&
    isDatabaseValueMap(value.primaryKey) &&
    isDatabaseValueMap(value.values)
  );
}

function isDatabaseValueMap(value: unknown): value is Record<
  string,
  AdminDatabaseCellValue
> {
  return (
    isRecord(value) &&
    Object.values(value).every(
      (item) => typeof item === "string" || item === null,
    )
  );
}

function isOkResponse(value: unknown) {
  return isRecord(value) && value.ok === true;
}

function isKnownErrorCode(
  value: unknown,
): value is AccountAccessErrorCode | RemoteServerErrorCode {
  return (
    value === "server_not_configured" ||
    value === "network_error" ||
    value === "invalid_response" ||
    value === "access_denied" ||
    value === "not_found" ||
    value === "server_error"
  );
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
