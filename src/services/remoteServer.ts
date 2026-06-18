export const REMOTE_SERVER_ENV_NAME = "VITE_SMB_REMOTE_API_URL";

export type RemoteServerConnection =
  | {
      status: "configured";
      baseUrl: string;
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
};

export function getRemoteServerConnection({
  baseUrl = readRemoteBaseUrl(),
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

function readRemoteBaseUrl() {
  const viteEnv = import.meta.env as ImportMetaEnv | undefined;

  return viteEnv?.VITE_SMB_REMOTE_API_URL;
}

function normalizeRemoteBaseUrl(baseUrl: string | undefined) {
  const trimmed = baseUrl?.trim();

  if (trimmed === undefined || trimmed.length === 0) {
    return undefined;
  }

  return trimmed.replace(/\/+$/, "");
}
