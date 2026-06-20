import type {
  AccountAccessErrorCode,
  AccountType,
} from "../contracts/accounts";
import {
  buildDevAccessHeaders,
  clearStoredDevAccessSessionId,
  storeDevAccessSessionId,
} from "./devAccessSessionStorage.js";
import {
  clearLocalDevAccessSession,
  createLocalDevAccessSession,
} from "./localDevAccess.js";
import { resolveApiEndpoint } from "./remoteServer.js";

export const DEV_ACCESS_SESSION_ENDPOINT = "/api/dev/access-session";

export type DevAccessSessionReadyState = {
  status: "ready";
  sessionId?: string;
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
  remoteBaseUrl?: string;
  localDevFallback?: boolean;
  signal?: AbortSignal;
};

type ClientLocalDevSessionFallback = {
  enabled: boolean;
};

export async function selectDevAccessSession(
  accountType: AccountType,
  {
    endpoint,
    remoteBaseUrl,
    localDevFallback,
    signal,
  }: RequestDevAccessSessionOptions = {},
): Promise<DevAccessSessionResult> {
  const requestEndpoint =
    endpoint ??
    resolveApiEndpoint(DEV_ACCESS_SESSION_ENDPOINT, DEV_ACCESS_SESSION_ENDPOINT, {
      baseUrl: remoteBaseUrl,
    });
  const shouldUseClientLocalFallback = shouldUseClientLocalDevSessionFallback(
    localDevFallback,
    endpoint,
  );

  return requestDevAccessSession(
    requestEndpoint,
    "POST",
    signal,
    { accountType },
    shouldUseLocalDevEndpointFallback(
      shouldUseClientLocalFallback,
      requestEndpoint,
    )
      ? DEV_ACCESS_SESSION_ENDPOINT
      : undefined,
    shouldUseClientLocalFallback ? { enabled: true } : undefined,
  );
}

export async function clearDevAccessSession({
  endpoint,
  remoteBaseUrl,
  localDevFallback,
  signal,
}: RequestDevAccessSessionOptions = {}): Promise<DevAccessSessionResult> {
  const requestEndpoint =
    endpoint ??
    resolveApiEndpoint(DEV_ACCESS_SESSION_ENDPOINT, DEV_ACCESS_SESSION_ENDPOINT, {
      baseUrl: remoteBaseUrl,
    });
  const shouldUseClientLocalFallback = shouldUseClientLocalDevSessionFallback(
    localDevFallback,
    endpoint,
  );

  return requestDevAccessSession(
    requestEndpoint,
    "DELETE",
    signal,
    undefined,
    shouldUseLocalDevEndpointFallback(
      shouldUseClientLocalFallback,
      requestEndpoint,
    )
      ? DEV_ACCESS_SESSION_ENDPOINT
      : undefined,
    shouldUseClientLocalFallback ? { enabled: true } : undefined,
  );
}

async function requestDevAccessSession(
  endpoint: string,
  method: "POST" | "DELETE",
  signal?: AbortSignal,
  body?: unknown,
  fallbackEndpoint?: string,
  clientLocalFallback?: ClientLocalDevSessionFallback,
): Promise<DevAccessSessionResult> {
  try {
    const response = await fetch(endpoint, {
      method,
      headers:
        body === undefined
          ? buildDevAccessHeaders({
              Accept: "application/json",
            })
          : buildDevAccessHeaders({
              Accept: "application/json",
              "Content-Type": "application/json",
            }),
      credentials: "include",
      signal,
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    const payload = await readJson(response);

    if (!response.ok) {
      if (
        fallbackEndpoint !== undefined &&
        shouldRetryLocalDevEndpoint(fallbackEndpoint, endpoint, response.status)
      ) {
        return requestDevAccessSession(
          fallbackEndpoint,
          method,
          signal,
          body,
          undefined,
          clientLocalFallback,
        );
      }

      const clientLocalResult = readClientLocalDevSessionFallback(
        method,
        body,
        clientLocalFallback,
        response.status,
      );

      if (clientLocalResult !== undefined) {
        return clientLocalResult;
      }

      return {
        status: "error",
        message: readErrorMessage(payload, "Сервер отклонил dev-сессию."),
        code: readErrorCode(payload),
        statusCode: response.status,
      };
    }

    if (isReadyPayload(payload)) {
      if (method === "DELETE") {
        clearStoredDevAccessSessionId();
        clearLocalDevAccessSession();
      } else {
        storeDevAccessSessionId(payload.sessionId);
        clearLocalDevAccessSession();
      }

      return {
        status: "ready",
        sessionId: payload.sessionId,
      };
    }

    if (fallbackEndpoint !== undefined && fallbackEndpoint !== endpoint) {
      return requestDevAccessSession(
        fallbackEndpoint,
        method,
        signal,
        body,
        undefined,
        clientLocalFallback,
      );
    }

    const clientLocalResult = readClientLocalDevSessionFallback(
      method,
      body,
      clientLocalFallback,
      response.status,
    );

    if (clientLocalResult !== undefined) {
      return clientLocalResult;
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

    if (fallbackEndpoint !== undefined && fallbackEndpoint !== endpoint) {
      return requestDevAccessSession(
        fallbackEndpoint,
        method,
        signal,
        body,
        undefined,
        clientLocalFallback,
      );
    }

    const clientLocalResult = readClientLocalDevSessionFallback(
      method,
      body,
      clientLocalFallback,
    );

    if (clientLocalResult !== undefined) {
      return clientLocalResult;
    }

    return {
      status: "error",
      message: "Не удалось обновить dev-сессию.",
      code: "network_error",
    };
  }
}

function readClientLocalDevSessionFallback(
  method: "POST" | "DELETE",
  body: unknown,
  clientLocalFallback: ClientLocalDevSessionFallback | undefined,
  statusCode?: number,
): DevAccessSessionResult | undefined {
  if (clientLocalFallback?.enabled !== true) {
    return undefined;
  }

  if (
    statusCode !== undefined &&
    statusCode !== 404 &&
    statusCode !== 502 &&
    statusCode !== 503 &&
    statusCode !== 504
  ) {
    return undefined;
  }

  clearStoredDevAccessSessionId();

  if (method === "DELETE") {
    clearLocalDevAccessSession();

    return {
      status: "ready",
    };
  }

  const accountType = readAccountTypeFromRequestBody(body);

  if (accountType === undefined) {
    return {
      status: "error",
      message: "Нельзя создать локальную dev-сессию без типа доступа.",
      code: "invalid_response",
    };
  }

  const sessionId = createLocalDevAccessSession(accountType);

  if (sessionId === undefined) {
    return {
      status: "error",
      message: "Не удалось создать локальную тестовую dev-сессию.",
      code: "network_error",
    };
  }

  return {
    status: "ready",
    sessionId,
  };
}

function shouldRetryLocalDevEndpoint(
  fallbackEndpoint: string | undefined,
  endpoint: string,
  statusCode: number,
) {
  return (
    fallbackEndpoint !== undefined &&
    fallbackEndpoint !== endpoint &&
    (statusCode === 404 ||
      statusCode === 502 ||
      statusCode === 503 ||
      statusCode === 504)
  );
}

function shouldUseLocalDevEndpointFallback(
  shouldUseClientLocalFallback: boolean,
  requestEndpoint: string,
) {
  if (requestEndpoint === DEV_ACCESS_SESSION_ENDPOINT) {
    return false;
  }

  return shouldUseClientLocalFallback;
}

function shouldUseClientLocalDevSessionFallback(
  localDevFallback: boolean | undefined,
  endpoint: string | undefined,
) {
  if (localDevFallback !== undefined) {
    return localDevFallback;
  }

  if (endpoint !== undefined) {
    return false;
  }

  const viteEnv = import.meta.env as ImportMetaEnv | undefined;

  return viteEnv?.DEV === true;
}

function readAccountTypeFromRequestBody(body: unknown): AccountType | undefined {
  if (!isRecord(body) || !isAccountType(body.accountType)) {
    return undefined;
  }

  return body.accountType;
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

function isReadyPayload(value: unknown): value is { ok: true; sessionId?: string } {
  return (
    isRecord(value) &&
    value.ok === true &&
    (value.sessionId === undefined || typeof value.sessionId === "string")
  );
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

function isAccountType(value: unknown): value is AccountType {
  return (
    value === "admin" ||
    value === "business_owner" ||
    value === "worker" ||
    value === "dispatcher"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}
