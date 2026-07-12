import {
  accountCapabilities,
  accountNavigationItems,
  type AccountAccessErrorCode,
  type AccountCapability,
  type AccountNavigationItem,
  type AccountType,
  type DevAccessOption,
} from "../contracts/accounts.js";
import {
  buildDevAccessHeaders,
  clearStoredDevAccessSessionId,
  storeDevAccessSessionId,
} from "./devAccessSessionStorage.js";
import {
  clearLocalDevAccessSession,
  createLocalDevAccessSession,
  localDevAccessOptions,
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

export type DevAccessOptionsResult =
  | { status: "ready"; options: DevAccessOption[] }
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
  selection: AccountType | DevAccessOption,
  {
    endpoint,
    remoteBaseUrl,
    localDevFallback,
    signal,
  }: RequestDevAccessSessionOptions = {},
): Promise<DevAccessSessionResult> {
  const option = typeof selection === "string"
    ? localDevAccessOptions.find((item) => item.accountType === selection)
    : selection;
  const body = typeof selection === "string"
    ? { accountType: selection }
    : { position: selection.position, accountType: selection.accountType };
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
    body,
    shouldUseLocalDevEndpointFallback(
      shouldUseClientLocalFallback,
      requestEndpoint,
    )
      ? DEV_ACCESS_SESSION_ENDPOINT
      : undefined,
    shouldUseClientLocalFallback ? { enabled: true } : undefined,
    option,
  );
}

export async function requestDevAccessOptions({
  endpoint,
  remoteBaseUrl,
  localDevFallback,
  signal,
}: RequestDevAccessSessionOptions = {}): Promise<DevAccessOptionsResult> {
  const requestEndpoint =
    endpoint ??
    resolveApiEndpoint(DEV_ACCESS_SESSION_ENDPOINT, DEV_ACCESS_SESSION_ENDPOINT, {
      baseUrl: remoteBaseUrl,
    });
  const shouldUseClientLocalFallback = shouldUseClientLocalDevSessionFallback(
    localDevFallback,
    endpoint,
  );
  const fallbackEndpoint = shouldUseLocalDevEndpointFallback(
    shouldUseClientLocalFallback,
    requestEndpoint,
  )
    ? DEV_ACCESS_SESSION_ENDPOINT
    : undefined;

  return requestDevAccessOptionsFromEndpoint(
    requestEndpoint,
    signal,
    fallbackEndpoint,
    shouldUseClientLocalFallback,
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

async function requestDevAccessOptionsFromEndpoint(
  endpoint: string,
  signal: AbortSignal | undefined,
  fallbackEndpoint: string | undefined,
  useClientLocalFallback: boolean,
): Promise<DevAccessOptionsResult> {
  try {
    const response = await fetch(endpoint, {
      method: "GET",
      headers: buildDevAccessHeaders({ Accept: "application/json" }),
      credentials: "include",
      signal,
    });
    const payload = await readJson(response);

    if (response.ok && isDevAccessOptionsPayload(payload)) {
      return { status: "ready", options: payload.options };
    }

    if (
      fallbackEndpoint !== undefined &&
      shouldRetryLocalDevEndpoint(fallbackEndpoint, endpoint, response.status)
    ) {
      return requestDevAccessOptionsFromEndpoint(
        fallbackEndpoint,
        signal,
        undefined,
        useClientLocalFallback,
      );
    }

    const localResult = readClientLocalDevAccessOptionsFallback(
      useClientLocalFallback,
      response.status,
    );

    if (localResult !== undefined) {
      return localResult;
    }

    return {
      status: "error",
      message: readErrorMessage(payload, "Не удалось загрузить тестовые аккаунты."),
      code: response.ok ? "invalid_response" : readErrorCode(payload),
      statusCode: response.status,
    };
  } catch (error) {
    if (isAbortError(error)) {
      return { status: "error", message: "Запрос тестовых аккаунтов отменён." };
    }

    if (fallbackEndpoint !== undefined && fallbackEndpoint !== endpoint) {
      return requestDevAccessOptionsFromEndpoint(
        fallbackEndpoint,
        signal,
        undefined,
        useClientLocalFallback,
      );
    }

    return readClientLocalDevAccessOptionsFallback(useClientLocalFallback) ?? {
      status: "error",
      message: "Не удалось загрузить тестовые аккаунты.",
      code: "network_error",
    };
  }
}

async function requestDevAccessSession(
  endpoint: string,
  method: "POST" | "DELETE",
  signal?: AbortSignal,
  body?: unknown,
  fallbackEndpoint?: string,
  clientLocalFallback?: ClientLocalDevSessionFallback,
  clientLocalOption?: DevAccessOption,
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
          clientLocalOption,
        );
      }

      const clientLocalResult = readClientLocalDevSessionFallback(
        method,
        body,
        clientLocalFallback,
        response.status,
        clientLocalOption,
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
        clientLocalOption,
      );
    }

    const clientLocalResult = readClientLocalDevSessionFallback(
      method,
      body,
      clientLocalFallback,
      response.status,
      clientLocalOption,
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
        clientLocalOption,
      );
    }

    const clientLocalResult = readClientLocalDevSessionFallback(
      method,
      body,
      clientLocalFallback,
      undefined,
      clientLocalOption,
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
  option?: DevAccessOption,
): DevAccessSessionResult | undefined {
  if (clientLocalFallback?.enabled !== true) {
    return undefined;
  }

  if (
    statusCode !== undefined &&
      statusCode !== 404 &&
      statusCode !== 405 &&
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

  const localOption = option ?? readDefaultOptionFromRequestBody(body);

  if (localOption === undefined) {
    return {
      status: "error",
      message: "Нельзя создать локальную dev-сессию без типа доступа.",
      code: "invalid_response",
    };
  }

  const sessionId = createLocalDevAccessSession(localOption);

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
      statusCode === 405 ||
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

function readDefaultOptionFromRequestBody(body: unknown): DevAccessOption | undefined {
  if (!isRecord(body) || !isAccountType(body.accountType)) {
    return undefined;
  }

  return localDevAccessOptions.find(
    (option) => option.accountType === body.accountType,
  );
}

function readClientLocalDevAccessOptionsFallback(
  enabled: boolean,
  statusCode?: number,
): DevAccessOptionsResult | undefined {
  if (
    !enabled ||
    (statusCode !== undefined &&
      statusCode !== 404 &&
      statusCode !== 405 &&
      statusCode !== 502 &&
      statusCode !== 503 &&
      statusCode !== 504)
  ) {
    return undefined;
  }

  return {
    status: "ready",
    options: localDevAccessOptions.map((option) => ({
      ...option,
      navigationItems: [...option.navigationItems],
      capabilities: [...option.capabilities],
    })),
  };
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

function isDevAccessOptionsPayload(
  value: unknown,
): value is { options: DevAccessOption[] } {
  return (
    isRecord(value) &&
    Array.isArray(value.options) &&
    value.options.length > 0 &&
    value.options.every(isDevAccessOption)
  );
}

function isDevAccessOption(value: unknown): value is DevAccessOption {
  return (
    isRecord(value) &&
    typeof value.position === "string" &&
    typeof value.positionDisplayName === "string" &&
    isAccountType(value.accountType) &&
    Array.isArray(value.navigationItems) &&
    value.navigationItems.every(isAccountNavigationItem) &&
    Array.isArray(value.capabilities) &&
    value.capabilities.every(isAccountCapability)
  );
}

function isAccountNavigationItem(value: unknown): value is AccountNavigationItem {
  return accountNavigationItems.some((item) => item === value);
}

function isAccountCapability(value: unknown): value is AccountCapability {
  return accountCapabilities.some((capability) => capability === value);
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
