import { buildDevAccessHeaders } from "./devAccessSessionStorage.js";
import {
  describeRemoteNetworkFailure,
  resolveApiEndpoint,
  type RemoteServerErrorCode,
} from "./remoteServer.js";

type ProtectedPdfRequest = {
  path: string;
  fallbackFilename: string;
  failureMessage: string;
  cancellationMessage: string;
  baseUrl?: string;
  signal?: AbortSignal;
};

export type ProtectedPdfResult =
  | { status: "ready"; blob: Blob; filename: string }
  | {
      status: "error";
      message: string;
      code?: RemoteServerErrorCode;
    };

export async function requestProtectedPdf({
  path,
  fallbackFilename,
  failureMessage,
  cancellationMessage,
  baseUrl,
  signal,
}: ProtectedPdfRequest): Promise<ProtectedPdfResult> {
  const endpoint = resolveApiEndpoint(path, path, { baseUrl });

  try {
    const response = await fetch(endpoint, {
      method: "GET",
      headers: buildDevAccessHeaders({ Accept: "application/pdf" }),
      credentials: "include",
      signal,
    });
    if (!response.ok) {
      return readRemoteError(await readJson(response), failureMessage);
    }
    if (!(response.headers.get("content-type") ?? "").startsWith("application/pdf")) {
      return {
        status: "error",
        code: "invalid_response",
        message: "Сервер вернул протокол в неподдерживаемом формате.",
      };
    }

    return {
      status: "ready",
      blob: await response.blob(),
      filename: readDownloadFilename(response.headers.get("content-disposition")) ??
        fallbackFilename,
    };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return { status: "error", message: cancellationMessage };
    }

    return {
      status: "error",
      code: "network_error",
      message: describeRemoteNetworkFailure(failureMessage, { baseUrl }),
    };
  }
}

function readRemoteError(payload: unknown, fallback: string): ProtectedPdfResult {
  const error = isRecord(payload) && isRecord(payload.error)
    ? payload.error
    : undefined;
  const message = error !== undefined && typeof error.message === "string"
    ? error.message
    : fallback;
  const code = error !== undefined && typeof error.code === "string"
    ? error.code as RemoteServerErrorCode
    : undefined;

  return {
    status: "error",
    message,
    ...(code === undefined ? {} : { code }),
  };
}

async function readJson(response: Response) {
  const text = await response.text();
  if (text.length === 0) return undefined;

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

function readDownloadFilename(contentDisposition: string | null) {
  if (contentDisposition === null) return undefined;
  const encoded = /filename\*=UTF-8''([^;]+)/iu.exec(contentDisposition)?.[1];
  if (encoded !== undefined) {
    try {
      return decodeURIComponent(encoded);
    } catch {
      return undefined;
    }
  }
  return /filename="([^"]+)"/iu.exec(contentDisposition)?.[1];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
