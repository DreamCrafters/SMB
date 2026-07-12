import type {
  AccountAccessErrorCode,
  AdminAccountSummary,
  AdminPositionSummary,
  AdminPositionsListResponse,
  AdminAccountsListResponse,
  CreateAdminAccountRequest,
  CreateAdminAccountResponse,
  ResetAdminAccountPasswordRequest,
  SaveAdminPositionRequest,
  SaveAdminPositionResponse,
  SetAdminAccountLoginEnabledRequest,
  SetAdminAccountLoginEnabledResponse,
  SetAdminAccountNavigationRequest,
  SetAdminAccountNavigationResponse,
} from "../contracts";
import { buildDevAccessHeaders } from "./devAccessSessionStorage.js";
import {
  describeRemoteNetworkFailure,
  resolveApiEndpoint,
  type RemoteServerErrorCode,
} from "./remoteServer.js";

const ADMIN_ACCOUNTS_PATH = "/api/admin/accounts";
const ADMIN_ACCOUNTS_RESET_PASSWORD_PATH = "/api/admin/accounts/reset-password";
const ADMIN_POSITIONS_PATH = "/api/admin/positions";

export type AdminAccountsErrorState = {
  status: "error";
  message: string;
  code?: AccountAccessErrorCode | RemoteServerErrorCode;
  statusCode?: number;
};

export type AdminAccountsListResult =
  | {
      status: "ready";
      accounts: AdminAccountSummary[];
    }
  | AdminAccountsErrorState;

export type CreateAdminAccountResult =
  | {
      status: "ready";
      account: AdminAccountSummary;
    }
  | AdminAccountsErrorState;

export type ResetAdminAccountPasswordResult =
  | {
      status: "ready";
    }
  | AdminAccountsErrorState;

export type SetAdminAccountLoginEnabledResult =
  | {
      status: "ready";
      userId: string;
      userStatus: "active" | "suspended";
    }
  | AdminAccountsErrorState;

export type SetAdminAccountNavigationResult =
  | { status: "ready"; account: AdminAccountSummary }
  | AdminAccountsErrorState;

export type AdminPositionsResult =
  | { status: "ready"; positions: AdminPositionSummary[] }
  | AdminAccountsErrorState;
export type SaveAdminPositionResult =
  | { status: "ready"; position: AdminPositionSummary }
  | AdminAccountsErrorState;

export async function requestAdminPositions(
  { baseUrl, signal }: AdminAccountsRequestOptions = {},
): Promise<AdminPositionsResult> {
  return requestPositions("GET", undefined, { baseUrl, signal });
}

export async function createAdminPosition(
  value: SaveAdminPositionRequest,
  options: AdminAccountsRequestOptions = {},
): Promise<SaveAdminPositionResult> {
  return requestPositionSave(ADMIN_POSITIONS_PATH, "POST", value, options);
}

export async function updateAdminPosition(
  id: string,
  value: SaveAdminPositionRequest,
  options: AdminAccountsRequestOptions = {},
): Promise<SaveAdminPositionResult> {
  return requestPositionSave(`${ADMIN_POSITIONS_PATH}/${encodeURIComponent(id)}`, "PATCH", value, options);
}

async function requestPositions(
  method: "GET",
  body: undefined,
  { baseUrl, signal }: AdminAccountsRequestOptions,
): Promise<AdminPositionsResult> {
  const endpoint = resolveApiEndpoint(ADMIN_POSITIONS_PATH, ADMIN_POSITIONS_PATH, { baseUrl });
  try {
    const response = await fetch(endpoint, { method, headers: buildDevAccessHeaders({ Accept: "application/json" }), credentials: "include", signal });
    const payload = await readJson(response);
    if (!response.ok) return readRemoteError(payload, response.status, "Не удалось загрузить должности.");
    if (isAdminPositionsListResponse(payload)) return { status: "ready", positions: payload.positions };
    return { status: "error", message: "Сервер вернул должности в неподдерживаемом формате.", code: "invalid_response" };
  } catch (error) {
    if (isAbortError(error)) return { status: "error", message: "Запрос должностей отменён." };
    return { status: "error", message: describeRemoteNetworkFailure("Не удалось загрузить должности.", { baseUrl }), code: "network_error" };
  }
}

async function requestPositionSave(
  path: string,
  method: "POST" | "PATCH",
  value: SaveAdminPositionRequest,
  { baseUrl, signal }: AdminAccountsRequestOptions,
): Promise<SaveAdminPositionResult> {
  const endpoint = resolveApiEndpoint(path, path, { baseUrl });
  try {
    const response = await fetch(endpoint, {
      method,
      headers: buildDevAccessHeaders({ Accept: "application/json", "Content-Type": "application/json" }),
      credentials: "include",
      signal,
      body: JSON.stringify(value),
    });
    const payload = await readJson(response);
    if (!response.ok) return readRemoteError(payload, response.status, "Не удалось сохранить должность.");
    if (isSaveAdminPositionResponse(payload)) return { status: "ready", position: payload.position };
    return { status: "error", message: "Сервер вернул должность в неподдерживаемом формате.", code: "invalid_response" };
  } catch (error) {
    if (isAbortError(error)) return { status: "error", message: "Запрос должности отменён." };
    return { status: "error", message: describeRemoteNetworkFailure("Не удалось сохранить должность.", { baseUrl }), code: "network_error" };
  }
}

export function hasAdminAccountLogin(
  accounts: AdminAccountSummary[],
  login: string,
) {
  const normalizedLogin = login.trim().toLowerCase();

  return accounts.some(
    (account) => account.login.trim().toLowerCase() === normalizedLogin,
  );
}

type AdminAccountsRequestOptions = {
  baseUrl?: string;
  signal?: AbortSignal;
};

export async function requestAdminAccounts({
  baseUrl,
  signal,
}: AdminAccountsRequestOptions = {}): Promise<AdminAccountsListResult> {
  const endpoint = resolveApiEndpoint(ADMIN_ACCOUNTS_PATH, ADMIN_ACCOUNTS_PATH, {
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
      return readRemoteError(payload, response.status, "Сервер отклонил запрос учётных записей.");
    }

    if (isAdminAccountsListResponse(payload)) {
      return {
        status: "ready",
        accounts: payload.accounts,
      };
    }

    return {
      status: "error",
      message: "Сервер вернул список учётных записей в неподдерживаемом формате.",
      code: "invalid_response",
      statusCode: response.status,
    };
  } catch (error) {
    if (isAbortError(error)) {
      return {
        status: "error",
        message: "Запрос учётных записей отменён.",
      };
    }

    return {
      status: "error",
      message: describeRemoteNetworkFailure("Не удалось запросить учётные записи.", {
        baseUrl,
      }),
      code: "network_error",
    };
  }
}

export async function createAdminAccount(
  value: CreateAdminAccountRequest,
  { baseUrl, signal }: AdminAccountsRequestOptions = {},
): Promise<CreateAdminAccountResult> {
  const endpoint = resolveApiEndpoint(ADMIN_ACCOUNTS_PATH, ADMIN_ACCOUNTS_PATH, {
    baseUrl,
  });

  try {
    const response = await fetch(endpoint, {
      method: "POST",
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
      return readRemoteError(payload, response.status, "Сервер отклонил создание учётной записи.");
    }

    if (isCreateAdminAccountResponse(payload)) {
      return {
        status: "ready",
        account: payload.account,
      };
    }

    return {
      status: "error",
      message: "Сервер вернул созданную учётную запись в неподдерживаемом формате.",
      code: "invalid_response",
      statusCode: response.status,
    };
  } catch (error) {
    if (isAbortError(error)) {
      return {
        status: "error",
        message: "Запрос создания учётной записи отменён.",
      };
    }

    return {
      status: "error",
      message: describeRemoteNetworkFailure("Не удалось создать учётную запись.", {
        baseUrl,
      }),
      code: "network_error",
    };
  }
}

export async function setAdminAccountLoginEnabled(
  value: SetAdminAccountLoginEnabledRequest,
  { baseUrl, signal }: AdminAccountsRequestOptions = {},
): Promise<SetAdminAccountLoginEnabledResult> {
  const endpoint = resolveApiEndpoint(ADMIN_ACCOUNTS_PATH, ADMIN_ACCOUNTS_PATH, {
    baseUrl,
  });

  try {
    const response = await fetch(endpoint, {
      method: "PATCH",
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
        "Сервер отклонил изменение доступа.",
      );
    }

    if (isSetAdminAccountLoginEnabledResponse(payload)) {
      return {
        status: "ready",
        userId: payload.userId,
        userStatus: payload.userStatus,
      };
    }

    return {
      status: "error",
      message: "Сервер вернул статус доступа в неподдерживаемом формате.",
      code: "invalid_response",
      statusCode: response.status,
    };
  } catch (error) {
    if (isAbortError(error)) {
      return {
        status: "error",
        message: "Запрос изменения доступа отменён.",
      };
    }

    return {
      status: "error",
      message: describeRemoteNetworkFailure("Не удалось изменить доступ.", {
        baseUrl,
      }),
      code: "network_error",
    };
  }
}

export async function setAdminAccountNavigation(
  value: SetAdminAccountNavigationRequest,
  { baseUrl, signal }: AdminAccountsRequestOptions = {},
): Promise<SetAdminAccountNavigationResult> {
  const endpoint = resolveApiEndpoint(ADMIN_ACCOUNTS_PATH, ADMIN_ACCOUNTS_PATH, {
    baseUrl,
  });

  try {
    const response = await fetch(endpoint, {
      method: "PATCH",
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
      return readRemoteError(payload, response.status, "Сервер отклонил изменение вкладок.");
    }

    if (isSetAdminAccountNavigationResponse(payload)) {
      return { status: "ready", account: payload.account };
    }

    return { status: "error", message: "Сервер вернул доступы в неподдерживаемом формате.", code: "invalid_response" };
  } catch (error) {
    if (isAbortError(error)) return { status: "error", message: "Запрос отменён." };
    return { status: "error", message: describeRemoteNetworkFailure("Не удалось изменить вкладки.", { baseUrl }), code: "network_error" };
  }
}

export async function resetAdminAccountPassword(
  value: ResetAdminAccountPasswordRequest,
  { baseUrl, signal }: AdminAccountsRequestOptions = {},
): Promise<ResetAdminAccountPasswordResult> {
  const endpoint = resolveApiEndpoint(
    ADMIN_ACCOUNTS_RESET_PASSWORD_PATH,
    ADMIN_ACCOUNTS_RESET_PASSWORD_PATH,
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
      body: JSON.stringify(value),
    });
    const payload = await readJson(response);

    if (!response.ok) {
      return readRemoteError(payload, response.status, "Сервер отклонил сброс пароля.");
    }

    if (isOkResponse(payload)) {
      return { status: "ready" };
    }

    return {
      status: "error",
      message: "Сервер вернул сброс пароля в неподдерживаемом формате.",
      code: "invalid_response",
      statusCode: response.status,
    };
  } catch (error) {
    if (isAbortError(error)) {
      return {
        status: "error",
        message: "Запрос сброса пароля отменён.",
      };
    }

    return {
      status: "error",
      message: describeRemoteNetworkFailure("Не удалось сбросить пароль.", {
        baseUrl,
      }),
      code: "network_error",
    };
  }
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
): AdminAccountsErrorState {
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

function isAdminAccountsListResponse(
  value: unknown,
): value is AdminAccountsListResponse {
  return (
    isRecord(value) &&
    Array.isArray(value.accounts) &&
    value.accounts.every(isAdminAccountSummary)
  );
}

function isAdminPositionsListResponse(value: unknown): value is AdminPositionsListResponse {
  return isRecord(value) && Array.isArray(value.positions) && value.positions.every(isAdminPositionSummary);
}

function isSaveAdminPositionResponse(value: unknown): value is SaveAdminPositionResponse {
  return isRecord(value) && isAdminPositionSummary(value.position);
}

function isAdminPositionSummary(value: unknown): value is AdminPositionSummary {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.displayName === "string" &&
    typeof value.accountType === "string" &&
    Array.isArray(value.navigationItems) &&
    Array.isArray(value.capabilities) &&
    typeof value.isProtected === "boolean" &&
    typeof value.usageCount === "number" &&
    typeof value.createdAt === "string"
  );
}

function isCreateAdminAccountResponse(
  value: unknown,
): value is CreateAdminAccountResponse {
  return isRecord(value) && isAdminAccountSummary(value.account);
}

function isSetAdminAccountLoginEnabledResponse(
  value: unknown,
): value is SetAdminAccountLoginEnabledResponse {
  return (
    isRecord(value) &&
    typeof value.userId === "string" &&
    (value.userStatus === "active" || value.userStatus === "suspended")
  );
}

function isSetAdminAccountNavigationResponse(
  value: unknown,
): value is SetAdminAccountNavigationResponse {
  return isRecord(value) && isAdminAccountSummary(value.account);
}

function isAdminAccountSummary(value: unknown): value is AdminAccountSummary {
  return (
    isRecord(value) &&
    typeof value.accessId === "string" &&
    typeof value.userId === "string" &&
    typeof value.login === "string" &&
    typeof value.userDisplayName === "string" &&
    typeof value.userStatus === "string" &&
    typeof value.accessDisplayName === "string" &&
    typeof value.accountType === "string" &&
    typeof value.position === "string" &&
    typeof value.positionDisplayName === "string" &&
    isRecord(value.scope) &&
    (typeof value.businessDisplayName === "string" ||
      value.businessDisplayName === null) &&
    (typeof value.departmentDisplayName === "string" ||
      value.departmentDisplayName === null) &&
    Array.isArray(value.capabilities) &&
    Array.isArray(value.navigationItems) &&
    typeof value.createdAt === "string"
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
