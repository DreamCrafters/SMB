import {
  collegiumInitiativesApiPath,
  type CollegiumInitiative,
  type CollegiumInitiativeDetailResponse,
  type CollegiumInitiativeListResponse,
  type CollegiumInitiativeSaveRequest,
} from "../contracts/collegiumInitiatives.js";
import { buildDevAccessHeaders } from "./devAccessSessionStorage.js";
import { describeRemoteNetworkFailure, resolveApiEndpoint } from "./remoteServer.js";

/** Граница запросов модуля «Инициативы Коллегии»: данные и права — только с сервера. */
export class CollegiumInitiativesRequestError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "CollegiumInitiativesRequestError";
  }
}

async function request<T>(
  path: string,
  method: "GET" | "POST" | "PATCH",
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(resolveApiEndpoint(path, path, {}), {
      method,
      credentials: "include",
      signal,
      headers: buildDevAccessHeaders({
        Accept: "application/json",
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      }),
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new CollegiumInitiativesRequestError(
      describeRemoteNetworkFailure("Не удалось связаться с сервером.", {}),
      0,
    );
  }
  const payload: unknown = await response.json().catch(() => undefined);
  if (!response.ok) {
    const message = isRecord(payload) && isRecord(payload.error) &&
        typeof payload.error.message === "string"
      ? payload.error.message
      : "Не удалось выполнить действие.";
    throw new CollegiumInitiativesRequestError(message, response.status);
  }
  return payload as T;
}

export function requestCollegiumInitiatives(signal?: AbortSignal) {
  return request<CollegiumInitiativeListResponse>(
    collegiumInitiativesApiPath,
    "GET",
    undefined,
    signal,
  );
}

export function requestCollegiumInitiative(id: string, signal?: AbortSignal) {
  return request<CollegiumInitiativeDetailResponse>(
    `${collegiumInitiativesApiPath}/${encodeURIComponent(id)}`,
    "GET",
    undefined,
    signal,
  );
}

export async function saveCollegiumInitiative(
  id: string | undefined,
  body: CollegiumInitiativeSaveRequest,
) {
  const result = await request<{ initiative: CollegiumInitiative }>(
    id === undefined
      ? collegiumInitiativesApiPath
      : `${collegiumInitiativesApiPath}/${encodeURIComponent(id)}`,
    id === undefined ? "POST" : "PATCH",
    body,
  );
  return result.initiative;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
