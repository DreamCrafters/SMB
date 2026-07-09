import type {
  AccountAccessErrorCode,
  ServerUserProfile,
} from "../contracts";
import { describeRemoteNetworkFailure, resolveApiEndpoint } from "./remoteServer.js";

export const AUTH_LOGIN_ENDPOINT = "/api/auth/login";
export const AUTH_LOGOUT_ENDPOINT = "/api/auth/logout";

export type AuthSessionReadyState = {
  status: "ready";
  profile?: ServerUserProfile;
};

export type AuthSessionErrorState = {
  status: "error";
  message: string;
  code?: AccountAccessErrorCode | "invalid_response" | "network_error";
  statusCode?: number;
};

export type AuthSessionResult = AuthSessionReadyState | AuthSessionErrorState;

type AuthSessionOptions = {
  endpoint?: string;
  remoteBaseUrl?: string;
  signal?: AbortSignal;
};

export async function loginWithPassword(
  credentials: {
    login: string;
    password: string;
  },
  {
    endpoint,
    remoteBaseUrl,
    signal,
  }: AuthSessionOptions = {},
): Promise<AuthSessionResult> {
  const requestEndpoint =
    endpoint ??
    resolveApiEndpoint(AUTH_LOGIN_ENDPOINT, AUTH_LOGIN_ENDPOINT, {
      baseUrl: remoteBaseUrl,
    });

  try {
    const response = await fetch(requestEndpoint, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      credentials: "include",
      signal,
      body: JSON.stringify(credentials),
    });
    const payload = await readJson(response);

    if (!response.ok) {
      return {
        status: "error",
        message: readErrorMessage(payload, "Не удалось войти."),
        code: readErrorCode(payload),
        statusCode: response.status,
      };
    }

    if (isLoginReadyPayload(payload)) {
      return {
        status: "ready",
        profile: payload.profile,
      };
    }

    return {
      status: "error",
      message: "Сервер вернул вход в неподдерживаемом формате.",
      code: "invalid_response",
      statusCode: response.status,
    };
  } catch (error) {
    if (isAbortError(error)) {
      return {
        status: "error",
        message: "Запрос входа отменён.",
      };
    }

    return {
      status: "error",
      message: describeRemoteNetworkFailure("Не удалось войти.", {
        baseUrl: remoteBaseUrl,
      }),
      code: "network_error",
    };
  }
}

export async function logoutAuthSession({
  endpoint,
  remoteBaseUrl,
  signal,
}: AuthSessionOptions = {}): Promise<AuthSessionResult> {
  const requestEndpoint =
    endpoint ??
    resolveApiEndpoint(AUTH_LOGOUT_ENDPOINT, AUTH_LOGOUT_ENDPOINT, {
      baseUrl: remoteBaseUrl,
    });

  try {
    const response = await fetch(requestEndpoint, {
      method: "POST",
      headers: {
        Accept: "application/json",
      },
      credentials: "include",
      signal,
    });
    const payload = await readJson(response);

    if (!response.ok) {
      return {
        status: "error",
        message: readErrorMessage(payload, "Не удалось выйти."),
        code: readErrorCode(payload),
        statusCode: response.status,
      };
    }

    return {
      status: "ready",
    };
  } catch (error) {
    if (isAbortError(error)) {
      return {
        status: "error",
        message: "Запрос выхода отменён.",
      };
    }

    return {
      status: "error",
      message: describeRemoteNetworkFailure("Не удалось выйти.", {
        baseUrl: remoteBaseUrl,
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

function isLoginReadyPayload(
  value: unknown,
): value is { ok: true; profile?: ServerUserProfile } {
  return isRecord(value) && value.ok === true;
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
    isAccountAccessErrorCode(payload.error.code)
  ) {
    return payload.error.code;
  }

  return undefined;
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
