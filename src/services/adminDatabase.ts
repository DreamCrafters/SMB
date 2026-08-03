import type {
  AccountAccessErrorCode,
  AdminDatabaseCellValue,
  AdminDatabaseRowsResponse,
  AdminDatabaseTablesResponse,
  ProductionSnapshotResponse,
  ProductionSnapshotStatusResponse,
} from "../contracts";
import { buildDevAccessHeaders } from "./devAccessSessionStorage.js";
import {
  describeRemoteNetworkFailure,
  resolveApiEndpoint,
  type RemoteServerErrorCode,
} from "./remoteServer.js";

const ADMIN_DATABASE_PATH = "/api/admin/database";
const PRODUCTION_SNAPSHOT_PATH =
  `${ADMIN_DATABASE_PATH}/production-snapshot`;

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

export type AdminDatabaseClearResult =
  | {
      status: "ready";
      deleted: number;
    }
  | AdminDatabaseErrorState;

export type ProductionSnapshotStatusResult =
  | ({ status: "ready" } & ProductionSnapshotStatusResponse)
  | AdminDatabaseErrorState;

export type ProductionSnapshotMutationResult =
  | ({ status: "ready" } & Omit<ProductionSnapshotResponse, "ok">)
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
    search,
  }: AdminDatabaseRequestOptions & {
    limit?: number;
    offset?: number;
    search?: string;
  } = {},
): Promise<AdminDatabaseRowsResult> {
  const endpoint = buildRowsEndpoint(tableName, { baseUrl, limit, offset, search });

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

export async function mergeAdminDatabaseRows(
  tableName: string,
  value: {
    sourcePrimaryKey: Record<string, AdminDatabaseCellValue>;
    targetPrimaryKey: Record<string, AdminDatabaseCellValue>;
  },
  { baseUrl, signal }: AdminDatabaseRequestOptions = {},
): Promise<AdminDatabaseMutationResult> {
  return mutateAdminDatabaseRow(
    "POST",
    tableName,
    value,
    { baseUrl, signal },
    {
      endpointSuffix: "/merge",
      rejectedMessage: "Сервер отклонил слияние строк.",
      invalidResponseMessage: "Сервер вернул результат слияния в неподдерживаемом формате.",
      cancelledMessage: "Запрос слияния строк отменён.",
      networkFailureMessage: "Не удалось слить строки.",
    },
  );
}

export async function clearAdminDatabaseTable(
  tableName: string,
  { baseUrl, signal }: AdminDatabaseRequestOptions = {},
): Promise<AdminDatabaseClearResult> {
  const endpoint = `${buildRowsEndpoint(tableName, { baseUrl })}/all`;

  try {
    const response = await fetch(endpoint, {
      method: "DELETE",
      headers: buildDevAccessHeaders({
        Accept: "application/json",
        "Content-Type": "application/json",
      }),
      credentials: "include",
      signal,
      body: JSON.stringify({ confirmation: tableName }),
    });
    const payload = await readJson(response);

    if (!response.ok) {
      return readRemoteError(payload, response.status, "Сервер отклонил очистку раздела БД.");
    }

    if (isClearResponse(payload)) {
      return {
        status: "ready",
        deleted: payload.deleted,
      };
    }

    return {
      status: "error",
      message: "Сервер вернул результат очистки БД в неподдерживаемом формате.",
      code: "invalid_response",
      statusCode: response.status,
    };
  } catch (error) {
    if (isAbortError(error)) {
      return {
        status: "error",
        message: "Запрос очистки БД отменён.",
      };
    }

    return {
      status: "error",
      message: describeRemoteNetworkFailure("Не удалось очистить раздел БД.", {
        baseUrl,
      }),
      code: "network_error",
    };
  }
}

export async function requestProductionSnapshotStatus({
  baseUrl,
  signal,
}: AdminDatabaseRequestOptions = {}): Promise<ProductionSnapshotStatusResult> {
  const endpoint = resolveApiEndpoint(
    PRODUCTION_SNAPSHOT_PATH,
    PRODUCTION_SNAPSHOT_PATH,
    { baseUrl },
  );

  try {
    const response = await fetch(endpoint, {
      method: "GET",
      headers: buildDevAccessHeaders({ Accept: "application/json" }),
      credentials: "include",
      signal,
    });
    const payload = await readJson(response);

    if (!response.ok) {
      return readRemoteError(
        payload,
        response.status,
        "Сервер отклонил проверку синхронизации.",
      );
    }

    if (isProductionSnapshotStatusResponse(payload)) {
      return { status: "ready", ...payload };
    }

    return {
      status: "error",
      message: "Сервер вернул неподдерживаемый статус синхронизации.",
      code: "invalid_response",
      statusCode: response.status,
    };
  } catch (error) {
    if (isAbortError(error)) {
      return {
        status: "error",
        message: "Проверка синхронизации отменена.",
      };
    }

    return {
      status: "error",
      message: describeRemoteNetworkFailure(
        "Не удалось проверить синхронизацию с production.",
        { baseUrl },
      ),
      code: "network_error",
    };
  }
}

export async function replaceTestDatabaseWithProductionSnapshot(
  confirmation: string,
  { baseUrl, signal }: AdminDatabaseRequestOptions = {},
): Promise<ProductionSnapshotMutationResult> {
  const endpoint = resolveApiEndpoint(
    PRODUCTION_SNAPSHOT_PATH,
    PRODUCTION_SNAPSHOT_PATH,
    { baseUrl },
  );

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: buildDevAccessHeaders({
        Accept: "application/json",
        "Content-Type": "application/json",
      }),
      credentials: "include",
      signal,
      body: JSON.stringify({ confirmation }),
    });
    const payload = await readJson(response);

    if (!response.ok) {
      return readRemoteError(
        payload,
        response.status,
        "Сервер отклонил замену тестовой БД.",
      );
    }

    if (isProductionSnapshotResponse(payload)) {
      return {
        status: "ready",
        tableCount: payload.tableCount,
        rowCount: payload.rowCount,
        authSessionsCleared: true,
      };
    }

    return {
      status: "error",
      message: "Сервер вернул неподдерживаемый результат синхронизации.",
      code: "invalid_response",
      statusCode: response.status,
    };
  } catch (error) {
    if (isAbortError(error)) {
      return {
        status: "error",
        message: "Замена тестовой БД отменена.",
      };
    }

    return {
      status: "error",
      message: describeRemoteNetworkFailure(
        "Не удалось заменить тестовую БД.",
        { baseUrl },
      ),
      code: "network_error",
    };
  }
}

async function mutateAdminDatabaseRow(
  method: "PATCH" | "DELETE" | "POST",
  tableName: string,
  value: object,
  { baseUrl, signal }: AdminDatabaseRequestOptions,
  messages: {
    endpointSuffix?: string;
    rejectedMessage?: string;
    invalidResponseMessage?: string;
    cancelledMessage?: string;
    networkFailureMessage?: string;
  } = {},
): Promise<AdminDatabaseMutationResult> {
  const endpoint = `${buildRowsEndpoint(tableName, { baseUrl })}${messages.endpointSuffix ?? ""}`;

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
      return readRemoteError(
        payload,
        response.status,
        messages.rejectedMessage ?? "Сервер отклонил изменение БД.",
      );
    }

    if (isOkResponse(payload)) {
      return {
        status: "ready",
      };
    }

    return {
      status: "error",
      message: messages.invalidResponseMessage ??
        "Сервер вернул изменение БД в неподдерживаемом формате.",
      code: "invalid_response",
      statusCode: response.status,
    };
  } catch (error) {
    if (isAbortError(error)) {
      return {
        status: "error",
        message: messages.cancelledMessage ?? "Запрос изменения БД отменён.",
      };
    }

    return {
      status: "error",
      message: describeRemoteNetworkFailure(
        messages.networkFailureMessage ?? "Не удалось изменить строку БД.",
        { baseUrl },
      ),
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
    search,
  }: {
    baseUrl?: string;
    limit?: number;
    offset?: number;
    search?: string;
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

  if (search !== undefined && search.trim().length > 0) {
    url.searchParams.set("search", search.trim());
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
    Array.isArray(value.mergeTargets) &&
    value.mergeTargets.every(isAdminDatabaseMergeTarget) &&
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
    typeof value.canDelete === "boolean" &&
    typeof value.canClear === "boolean" &&
    typeof value.canMerge === "boolean"
  );
}

function isAdminDatabaseMergeTarget(value: unknown) {
  return (
    isRecord(value) &&
    isDatabaseValueMap(value.primaryKey) &&
    typeof value.label === "string"
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
    isDatabaseValueMap(value.values) &&
    Array.isArray(value.editorFields) &&
    value.editorFields.every(isAdminDatabaseEditorField)
  );
}

function isAdminDatabaseEditorField(value: unknown) {
  return (
    isRecord(value) &&
    typeof value.name === "string" &&
    typeof value.label === "string" &&
    (value.inputType === "text" ||
      value.inputType === "textarea" ||
      value.inputType === "select" ||
      value.inputType === "number" ||
      value.inputType === "date" ||
      value.inputType === "month" ||
      value.inputType === "datetime-local" ||
      value.inputType === "production_brand") &&
    typeof value.required === "boolean" &&
    Array.isArray(value.options) &&
    value.options.every(
      (option) =>
        isRecord(option) &&
        typeof option.value === "string" &&
        typeof option.label === "string",
    ) &&
    (typeof value.value === "string" || value.value === null)
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

function isClearResponse(value: unknown): value is { ok: true; deleted: number } {
  return (
    isRecord(value) &&
    value.ok === true &&
    typeof value.deleted === "number" &&
    Number.isInteger(value.deleted) &&
    value.deleted >= 0
  );
}

function isProductionSnapshotStatusResponse(
  value: unknown,
): value is ProductionSnapshotStatusResponse {
  return (
    isRecord(value) &&
    typeof value.available === "boolean" &&
    typeof value.inProgress === "boolean" &&
    typeof value.confirmationPhrase === "string" &&
    value.confirmationPhrase.length > 0
  );
}

function isProductionSnapshotResponse(
  value: unknown,
): value is ProductionSnapshotResponse {
  return (
    isRecord(value) &&
    value.ok === true &&
    Number.isInteger(value.tableCount) &&
    Number(value.tableCount) >= 0 &&
    Number.isInteger(value.rowCount) &&
    Number(value.rowCount) >= 0 &&
    value.authSessionsCleared === true
  );
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
