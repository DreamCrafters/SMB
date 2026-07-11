import type {
  AccountAccessErrorCode,
  AdminAccountSummary,
  AdminAccountsListResponse,
  CreateAdminAccountRequest,
  CreateAdminAccountResponse,
  ResetAdminAccountPasswordRequest,
} from "../contracts";
import { buildDevAccessHeaders } from "./devAccessSessionStorage.js";
import {
  describeRemoteNetworkFailure,
  resolveApiEndpoint,
  type RemoteServerErrorCode,
} from "./remoteServer.js";

const ADMIN_ACCOUNTS_PATH = "/api/admin/accounts";
const ADMIN_ACCOUNTS_RESET_PASSWORD_PATH = "/api/admin/accounts/reset-password";

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

function isCreateAdminAccountResponse(
  value: unknown,
): value is CreateAdminAccountResponse {
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
    isRecord(value.scope) &&
    (typeof value.businessDisplayName === "string" ||
      value.businessDisplayName === null) &&
    (typeof value.departmentDisplayName === "string" ||
      value.departmentDisplayName === null) &&
    Array.isArray(value.capabilities) &&
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
