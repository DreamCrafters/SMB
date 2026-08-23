import {
  rawMaterialNomenclatureFields,
  type RawMaterialNomenclatureFilters,
  type RawMaterialNomenclatureRecord,
  type RawMaterialNomenclatureSubmission,
} from "../contracts/rawMaterialNomenclature.js";
import { buildDevAccessHeaders } from "./devAccessSessionStorage.js";
import {
  describeRemoteNetworkFailure,
  resolveApiEndpoint,
  type RemoteServerErrorCode,
} from "./remoteServer.js";

const JOURNAL_PATH = "/api/laboratory/raw-material-nomenclature";

type RequestOptions = { baseUrl?: string; signal?: AbortSignal };
type ErrorResult = {
  status: "error";
  message: string;
  code?: RemoteServerErrorCode;
};

export type RawMaterialNomenclatureListResult =
  | { status: "ready"; records: RawMaterialNomenclatureRecord[] }
  | ErrorResult;

export type RawMaterialNomenclatureSaveResult =
  | { status: "ready"; record: RawMaterialNomenclatureRecord }
  | ErrorResult;

export async function requestRawMaterialNomenclature(
  filters: RawMaterialNomenclatureFilters = {},
  options: RequestOptions = {},
): Promise<RawMaterialNomenclatureListResult> {
  const params = new URLSearchParams();
  if (filters.query !== undefined) params.set("query", filters.query);
  const path = params.size === 0
    ? JOURNAL_PATH
    : `${JOURNAL_PATH}?${params.toString()}`;
  const result = await requestJson(path, "GET", undefined, options);
  if (result.status === "error") return result;
  if (
    !isRecord(result.payload) ||
    !Array.isArray(result.payload.records) ||
    !result.payload.records.every(isRawMaterialRecord)
  ) {
    return invalidResponse(
      "Сервер вернул номенклатуру сырья в неподдерживаемом формате.",
    );
  }
  return { status: "ready", records: result.payload.records };
}

export async function submitRawMaterialNomenclature(
  submission: RawMaterialNomenclatureSubmission,
  options: RequestOptions = {},
): Promise<RawMaterialNomenclatureSaveResult> {
  return readSaveResult(
    await requestJson(JOURNAL_PATH, "POST", submission, options),
  );
}

export async function correctRawMaterialNomenclature(
  id: string,
  submission: RawMaterialNomenclatureSubmission,
  options: RequestOptions = {},
): Promise<RawMaterialNomenclatureSaveResult> {
  return readSaveResult(await requestJson(
    `${JOURNAL_PATH}/${encodeURIComponent(id)}`,
    "PATCH",
    submission,
    options,
  ));
}

function readSaveResult(
  result: { status: "ready"; payload: unknown } | ErrorResult,
): RawMaterialNomenclatureSaveResult {
  if (result.status === "error") return result;
  if (!isRecord(result.payload) || !isRawMaterialRecord(result.payload.record)) {
    return invalidResponse("Сервер не вернул сохранённое сырьё.");
  }
  return { status: "ready", record: result.payload.record };
}

async function requestJson(
  path: string,
  method: "GET" | "POST" | "PATCH",
  body: RawMaterialNomenclatureSubmission | undefined,
  { baseUrl, signal }: RequestOptions,
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
    if (!response.ok) return readRemoteError(payload);
    return { status: "ready", payload };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return { status: "error", message: "Запрос номенклатуры сырья отменён." };
    }
    return {
      status: "error",
      code: "network_error",
      message: describeRemoteNetworkFailure(
        "Не удалось загрузить номенклатуру сырья.",
        { baseUrl },
      ),
    };
  }
}

function isRawMaterialRecord(
  value: unknown,
): value is RawMaterialNomenclatureRecord {
  return isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.createdAt === "string" &&
    typeof value.updatedAt === "string" &&
    rawMaterialNomenclatureFields.every(
      (field) => typeof value[field.id] === "string",
    );
}

function readRemoteError(payload: unknown): ErrorResult {
  const error = isRecord(payload) && isRecord(payload.error)
    ? payload.error
    : undefined;
  return {
    status: "error",
    message: error !== undefined && typeof error.message === "string"
      ? error.message
      : "Не удалось обработать номенклатуру сырья.",
    ...(error !== undefined && typeof error.code === "string"
      ? { code: error.code as RemoteServerErrorCode }
      : {}),
  };
}

async function readJson(response: Response) {
  try {
    return await response.json() as unknown;
  } catch {
    return undefined;
  }
}

function invalidResponse(message: string): ErrorResult {
  return { status: "error", code: "invalid_response", message };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
