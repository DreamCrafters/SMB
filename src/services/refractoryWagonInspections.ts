import type {
  RefractoryWagonInspectionRecord,
  RefractoryWagonInspectionSubmission,
} from "../contracts/refractoryWagons.js";
import { buildDevAccessHeaders } from "./devAccessSessionStorage.js";
import {
  describeRemoteNetworkFailure,
  resolveApiEndpoint,
  type RemoteServerErrorCode,
} from "./remoteServer.js";

const INSPECTIONS_PATH = "/api/refractory-wagon-inspections";

type RequestOptions = { baseUrl?: string; signal?: AbortSignal };
type ErrorResult = {
  status: "error";
  message: string;
  code?: RemoteServerErrorCode;
};

export type RefractoryWagonInspectionsListResult =
  | { status: "ready"; inspections: RefractoryWagonInspectionRecord[] }
  | ErrorResult;
export type RefractoryWagonInspectionSaveResult =
  | { status: "ready"; inspection: RefractoryWagonInspectionRecord }
  | ErrorResult;

export async function requestRefractoryWagonInspections(
  options: RequestOptions = {},
): Promise<RefractoryWagonInspectionsListResult> {
  const result = await requestJson("GET", undefined, options);
  if (result.status === "error") return result;
  if (
    !isRecord(result.payload) ||
    !Array.isArray(result.payload.inspections) ||
    !result.payload.inspections.every(isInspectionRecord)
  ) {
    return invalidResponse(
      "Сервер вернул журнал осмотра вагонов в неподдерживаемом формате.",
    );
  }
  return { status: "ready", inspections: result.payload.inspections };
}

export async function submitRefractoryWagonInspection(
  submission: RefractoryWagonInspectionSubmission,
  options: RequestOptions = {},
): Promise<RefractoryWagonInspectionSaveResult> {
  const result = await requestJson("POST", submission, options);
  if (result.status === "error") return result;
  if (!isRecord(result.payload) || !isInspectionRecord(result.payload.inspection)) {
    return invalidResponse("Сервер не вернул сохранённый осмотр.");
  }
  return { status: "ready", inspection: result.payload.inspection };
}

async function requestJson(
  method: "GET" | "POST",
  body: RefractoryWagonInspectionSubmission | undefined,
  { baseUrl, signal }: RequestOptions,
): Promise<{ status: "ready"; payload: unknown } | ErrorResult> {
  const endpoint = resolveApiEndpoint(INSPECTIONS_PATH, INSPECTIONS_PATH, {
    baseUrl,
  });
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
      return readRemoteError(payload, "Не удалось обработать осмотр вагона.");
    }
    return { status: "ready", payload };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return { status: "error", message: "Запрос журнала отменён." };
    }
    return {
      status: "error",
      code: "network_error",
      message: describeRemoteNetworkFailure(
        "Не удалось загрузить журнал осмотра вагонов.",
        { baseUrl },
      ),
    };
  }
}

function isInspectionRecord(
  value: unknown,
): value is RefractoryWagonInspectionRecord {
  return isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.wagonId === "string" &&
    typeof value.wagonNumber === "string" &&
    (value.sortingDate === null || typeof value.sortingDate === "string") &&
    (value.condition === "Можно эксплуатировать" ||
      value.condition === "В ремонт") &&
    typeof value.approvalDate === "string" &&
    typeof value.inspectedByDisplayName === "string" &&
    typeof value.createdAt === "string";
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
