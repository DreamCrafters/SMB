import type {
  AccountAccessErrorCode,
  AccountType,
} from "../contracts/accounts";

export const DEV_ACCESS_SESSION_ENDPOINT = "/api/dev/access-session";

export type DevAccessSessionReadyState = {
  status: "ready";
};

export type DevAccessSessionErrorState = {
  status: "error";
  message: string;
  code?: AccountAccessErrorCode | "invalid_response" | "network_error";
  statusCode?: number;
};

export type DevAccessSessionResult =
  | DevAccessSessionReadyState
  | DevAccessSessionErrorState;

type RequestDevAccessSessionOptions = {
  endpoint?: string;
  signal?: AbortSignal;
};

export async function selectDevAccessSession(
  accountType: AccountType,
  {
    endpoint = DEV_ACCESS_SESSION_ENDPOINT,
    signal,
  }: RequestDevAccessSessionOptions = {},
): Promise<DevAccessSessionResult> {
  return requestDevAccessSession(endpoint, "POST", signal, { accountType });
}

export async function clearDevAccessSession({
  endpoint = DEV_ACCESS_SESSION_ENDPOINT,
  signal,
}: RequestDevAccessSessionOptions = {}): Promise<DevAccessSessionResult> {
  return requestDevAccessSession(endpoint, "DELETE", signal);
}

async function requestDevAccessSession(
  endpoint: string,
  method: "POST" | "DELETE",
  signal?: AbortSignal,
  body?: unknown,
): Promise<DevAccessSessionResult> {
  try {
    const response = await fetch(endpoint, {
      method,
      headers:
        body === undefined
          ? {
              Accept: "application/json",
            }
          : {
              Accept: "application/json",
              "Content-Type": "application/json",
            },
      credentials: "include",
      signal,
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    const payload = await readJson(response);

    if (!response.ok) {
      return {
        status: "error",
        message: readErrorMessage(payload, "Сервер отклонил dev-сессию."),
        code: readErrorCode(payload),
        statusCode: response.status,
      };
    }

    if (isReadyPayload(payload)) {
      return {
        status: "ready",
      };
    }

    return {
      status: "error",
      message: "Сервер вернул dev-сессию в неподдерживаемом формате.",
      code: "invalid_response",
      statusCode: response.status,
    };
  } catch (error) {
    if (isAbortError(error)) {
      return {
        status: "error",
        message: "Запрос dev-сессии отменён.",
      };
    }

    return {
      status: "error",
      message: "Не удалось обновить dev-сессию.",
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

function isReadyPayload(value: unknown): value is { ok: true } {
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
