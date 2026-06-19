export const REMOTE_SERVER_ENV_NAME = "VITE_SMB_REMOTE_API_URL";

export type RemoteServerConnection =
  | {
      status: "configured";
      baseUrl: string;
      warning?: string;
    }
  | {
      status: "missing";
      message: string;
    };

export type RemoteServerErrorCode =
  | "server_not_configured"
  | "invalid_response"
  | "network_error"
  | "access_denied";

type RemoteServerOptions = {
  baseUrl?: string;
  pageHostname?: string;
  pageOrigin?: string;
};

export function getRemoteServerConnection({
  baseUrl = readRemoteBaseUrl(),
  pageHostname = readPageHostname(),
  pageOrigin = readPageOrigin(),
}: RemoteServerOptions = {}): RemoteServerConnection {
  const normalizedBaseUrl = normalizeRemoteBaseUrl(baseUrl);

  if (normalizedBaseUrl === undefined) {
    return {
      status: "missing",
      message:
        "Удалённый сервер не подключён. Укажите VITE_SMB_REMOTE_API_URL и перезапустите Vite.",
    };
  }

  return {
    status: "configured",
    baseUrl: normalizedBaseUrl,
    warning: buildConnectionWarning(normalizedBaseUrl, pageHostname, pageOrigin),
  };
}

export function buildRemoteEndpoint(
  path: string,
  options: RemoteServerOptions = {},
) {
  const connection = getRemoteServerConnection(options);

  if (connection.status === "missing") {
    return connection;
  }

  return {
    status: "configured" as const,
    endpoint: `${connection.baseUrl}${path.startsWith("/") ? path : `/${path}`}`,
  };
}

export function resolveApiEndpoint(
  path: string,
  fallbackPath = path,
  options: RemoteServerOptions = {},
) {
  const endpoint = buildRemoteEndpoint(path, options);

  return endpoint.status === "configured" ? endpoint.endpoint : fallbackPath;
}

export function describeRemoteNetworkFailure(
  fallbackMessage: string,
  options: RemoteServerOptions = {},
) {
  const connection = getRemoteServerConnection(options);

  if (connection.status === "missing") {
    return connection.message;
  }

  const healthEndpoint = buildRemoteEndpoint("/health", options);
  const healthUrl =
    healthEndpoint.status === "configured" ? healthEndpoint.endpoint : undefined;
  const pageOrigin = options.pageOrigin ?? readPageOrigin();
  const healthCheck = healthUrl
    ? `Проверьте, что ${healthUrl} открывается с этого ПК.`
    : "Проверьте, что backend /health открывается с этого ПК.";
  const corsHint =
    pageOrigin === undefined
      ? "Если браузер показывает CORS error, добавьте origin сайта в CORS_ORIGIN backend и перезапустите API."
      : `Если браузер показывает CORS error, добавьте ${pageOrigin} в CORS_ORIGIN backend и перезапустите API.`;
  const loopbackHint = buildLoopbackHint(
    connection.baseUrl,
    options.pageHostname ?? readPageHostname(),
  );

  return [fallbackMessage, healthCheck, loopbackHint, corsHint]
    .filter((item) => item !== undefined)
    .join(" ");
}

function readRemoteBaseUrl() {
  const viteEnv = import.meta.env as ImportMetaEnv | undefined;

  return viteEnv?.VITE_SMB_REMOTE_API_URL;
}

function readPageHostname() {
  return typeof window === "undefined" ? undefined : window.location.hostname;
}

function readPageOrigin() {
  return typeof window === "undefined" ? undefined : window.location.origin;
}

function normalizeRemoteBaseUrl(baseUrl: string | undefined) {
  const trimmed = baseUrl?.trim();

  if (trimmed === undefined || trimmed.length === 0) {
    return undefined;
  }

  return trimmed.replace(/\/+$/, "");
}

function buildConnectionWarning(
  baseUrl: string,
  pageHostname: string | undefined,
  pageOrigin: string | undefined,
) {
  const loopbackHint = buildLoopbackHint(baseUrl, pageHostname);

  if (loopbackHint !== undefined) {
    return loopbackHint;
  }

  if (pageOrigin === undefined) {
    return undefined;
  }

  return `Remote API URL настроен. Для CORS на backend должен быть разрешён origin ${pageOrigin}.`;
}

function buildLoopbackHint(baseUrl: string, pageHostname: string | undefined) {
  const apiHostname = readHostname(baseUrl);

  if (
    apiHostname === undefined ||
    pageHostname === undefined ||
    !isLoopbackHost(apiHostname) ||
    isLoopbackHost(pageHostname)
  ) {
    return undefined;
  }

  return "Remote API URL указывает на 127.0.0.1/localhost. Для сайта, открытого с другого ПК, укажите LAN IP backend-сервера вместо loopback-адреса.";
}

function readHostname(baseUrl: string) {
  try {
    return new URL(baseUrl).hostname;
  } catch {
    return undefined;
  }
}

function isLoopbackHost(hostname: string) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}
