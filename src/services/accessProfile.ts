import type {
  AccountAccessErrorCode,
  AccountCapability,
  AccountType,
  ServerIssuedAccountAccess,
  ServerUserProfile,
} from "../contracts";
import { accountCapabilities } from "../contracts/accounts.js";
import { buildDevAccessHeaders } from "./devAccessSessionStorage.js";
import { resolveApiEndpoint } from "./remoteServer.js";

export const ACCESS_PROFILE_ENDPOINT = "/api/access/profile";

export type AccessProfileReadyState = {
  status: "ready";
  profile: ServerUserProfile;
};

export type AccessProfileEmptyState = {
  status: "empty";
  message: string;
  statusCode?: number;
};

export type AccessProfileErrorState = {
  status: "error";
  message: string;
  code?: AccountAccessErrorCode | "invalid_response" | "network_error";
  statusCode?: number;
};

export type AccessProfileResult =
  | AccessProfileReadyState
  | AccessProfileEmptyState
  | AccessProfileErrorState;

export type AccessProfileLoadState =
  | {
      status: "loading";
      message: string;
    }
  | AccessProfileResult;

type RequestAccessProfileOptions = {
  endpoint?: string;
  signal?: AbortSignal;
};

type AccessProfilePayload = {
  profile: ServerUserProfile | null;
};

export async function requestAccessProfile({
  endpoint,
  signal,
}: RequestAccessProfileOptions = {}): Promise<AccessProfileResult> {
  const requestEndpoint = endpoint ?? resolveApiEndpoint(ACCESS_PROFILE_ENDPOINT);

  try {
    const response = await fetch(requestEndpoint, {
      method: "GET",
      headers: buildDevAccessHeaders({
        Accept: "application/json",
      }),
      credentials: "include",
      signal,
    });

    if (response.status === 204) {
      return {
        status: "empty",
        message: "Сервер вернул пустой access/profile.",
        statusCode: response.status,
      };
    }

    const payload = await readJson(response);

    if (!response.ok) {
      return {
        status: "error",
        message: readAccessProfileErrorMessage(payload, response.status),
        code: readErrorCode(payload),
        statusCode: response.status,
      };
    }

    if (isAccessProfilePayload(payload) && payload.profile === null) {
      return {
        status: "empty",
        message: "Профиль доступа пока не назначен сервером.",
        statusCode: response.status,
      };
    }

    if (isAccessProfilePayload(payload) && isServerUserProfile(payload.profile)) {
      return {
        status: "ready",
        profile: payload.profile,
      };
    }

    return {
      status: "error",
      message: "Сервер вернул access/profile в неподдерживаемом формате.",
      code: "invalid_response",
      statusCode: response.status,
    };
  } catch (error) {
    if (isAbortError(error)) {
      return {
        status: "empty",
        message: "Запрос access/profile отменён.",
      };
    }

    return {
      status: "error",
      message: "Не удалось запросить access/profile.",
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

function readErrorMessage(payload: unknown, fallback: string) {
  if (isRecord(payload) && isRecord(payload.error) && typeof payload.error.message === "string") {
    return payload.error.message;
  }

  return fallback;
}

function readAccessProfileErrorMessage(payload: unknown, statusCode: number) {
  const message = readErrorMessage(payload, "Сервер отклонил access/profile.");

  if (
    statusCode === 404 &&
    /page could not be found|endpoint not found|not found/i.test(message)
  ) {
    return "Не найден /api/access/profile. Если сайт открыт как удалённый frontend или static preview, укажите VITE_SMB_REMOTE_API_URL на backend API и перезапустите frontend.";
  }

  return message;
}

function readErrorCode(payload: unknown) {
  if (isRecord(payload) && isRecord(payload.error) && isAccountAccessErrorCode(payload.error.code)) {
    return payload.error.code;
  }

  return undefined;
}

function isAccessProfilePayload(value: unknown): value is AccessProfilePayload {
  return isRecord(value) && "profile" in value;
}

function isServerUserProfile(value: unknown): value is ServerUserProfile {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.userId === "string" &&
    typeof value.displayName === "string" &&
    isAccountType(value.accountType) &&
    isServerIssuedAccountAccess(value.activeAccess) &&
    Array.isArray(value.businessAccounts) &&
    Array.isArray(value.departments) &&
    (value.organizationStructureMode === "classic" ||
      value.organizationStructureMode === "current") &&
    typeof value.receivedAt === "string"
  );
}

function isServerIssuedAccountAccess(value: unknown): value is ServerIssuedAccountAccess {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.accountId === "string" &&
    isAccountType(value.accountType) &&
    typeof value.displayName === "string" &&
    Array.isArray(value.capabilities) &&
    value.capabilities.every(isAccountCapability) &&
    typeof value.issuedAt === "string"
  );
}

function isAccountType(value: unknown): value is AccountType {
  return (
    value === "admin" ||
    value === "business_owner" ||
    value === "worker" ||
    value === "dispatcher"
  );
}

function isAccountCapability(value: unknown): value is AccountCapability {
  return (
    typeof value === "string" &&
    accountCapabilities.includes(value as AccountCapability)
  );
}

function isAccountAccessErrorCode(value: unknown): value is AccountAccessErrorCode {
  return (
    value === "unauthenticated" ||
    value === "account_disabled" ||
    value === "business_unavailable" ||
    value === "access_denied"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}
