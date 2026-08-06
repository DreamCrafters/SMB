import type {
  RefractoryWagonRecord,
  RefractoryWagonSubmission,
} from "../contracts/refractoryWagons.js";
import { buildDevAccessHeaders } from "./devAccessSessionStorage.js";
import {
  describeRemoteNetworkFailure,
  resolveApiEndpoint,
  type RemoteServerErrorCode,
} from "./remoteServer.js";

const WAGONS_PATH = "/api/refractory-wagons";

type RequestOptions = { baseUrl?: string; signal?: AbortSignal };
type ErrorResult = {
  status: "error";
  message: string;
  code?: RemoteServerErrorCode;
};

export type RefractoryWagonsListResult =
  | { status: "ready"; wagons: RefractoryWagonRecord[] }
  | ErrorResult;
export type RefractoryWagonSaveResult =
  | { status: "ready"; wagon: RefractoryWagonRecord }
  | ErrorResult;

export async function requestRefractoryWagons(
  options: RequestOptions = {},
): Promise<RefractoryWagonsListResult> {
  const result = await requestJson("GET", undefined, options);
  if (result.status === "error") return result;
  if (
    !isRecord(result.payload) ||
    !Array.isArray(result.payload.wagons) ||
    !result.payload.wagons.every(isWagonRecord)
  ) {
    return invalidResponse(
      "Сервер вернул журнал вагонов в неподдерживаемом формате.",
    );
  }
  return { status: "ready", wagons: result.payload.wagons };
}

export async function submitRefractoryWagon(
  submission: RefractoryWagonSubmission,
  options: RequestOptions = {},
): Promise<RefractoryWagonSaveResult> {
  const result = await requestJson("POST", submission, options);
  if (result.status === "error") return result;
  if (!isRecord(result.payload) || !isWagonRecord(result.payload.wagon)) {
    return invalidResponse("Сервер не вернул сохранённый вагон.");
  }
  return { status: "ready", wagon: result.payload.wagon };
}

export async function correctRefractoryWagon(
  id: string,
  submission: RefractoryWagonSubmission,
  options: RequestOptions = {},
): Promise<RefractoryWagonSaveResult> {
  const path = `${WAGONS_PATH}/${encodeURIComponent(id)}`;
  const result = await requestJson("PATCH", submission, options, path);
  if (result.status === "error") return result;
  if (!isRecord(result.payload) || !isWagonRecord(result.payload.wagon)) {
    return invalidResponse("Сервер не вернул исправленный вагон.");
  }
  return { status: "ready", wagon: result.payload.wagon };
}

async function requestJson(
  method: "GET" | "POST" | "PATCH",
  body: RefractoryWagonSubmission | undefined,
  { baseUrl, signal }: RequestOptions,
  path = WAGONS_PATH,
): Promise<{ status: "ready"; payload: unknown } | ErrorResult> {
  const endpoint = resolveApiEndpoint(path, path, { baseUrl });
  try {
    const response = await fetch(endpoint, {
      method,
      headers: buildDevAccessHeaders({
        Accept: "application/json",
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      }),
      credentials: "include",
      signal,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const payload = await readJson(response);
    if (!response.ok) {
      return readRemoteError(payload, "Не удалось обработать журнал вагонов.");
    }
    return { status: "ready", payload };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return { status: "error", message: "Запрос журнала отменён." };
    }
    return {
      status: "error",
      code: "network_error",
      message: describeRemoteNetworkFailure("Не удалось загрузить журнал вагонов.", {
        baseUrl,
      }),
    };
  }
}

function isWagonRecord(value: unknown): value is RefractoryWagonRecord {
  return isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.number === "string" &&
    isOptionalString(value.loadingDate) &&
    isOptionalString(value.productBrand) &&
    isOptionalString(value.rawControlDate) &&
    typeof value.createdAt === "string";
}

function isOptionalString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function readRemoteError(payload: unknown, fallback: string): ErrorResult {
  const error = isRecord(payload) && isRecord(payload.error)
    ? payload.error
    : undefined;
  return {
    status: "error",
    message: error !== undefined && typeof error.message === "string"
      ? error.message
      : fallback,
    ...(error !== undefined && typeof error.code === "string"
      ? { code: error.code as RemoteServerErrorCode }
      : {}),
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

function invalidResponse(message: string): ErrorResult {
  return { status: "error", code: "invalid_response", message };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
