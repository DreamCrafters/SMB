import {
  laboratorySampleRegistrationFields,
  type LaboratorySampleRegistrationDraft,
  type LaboratorySampleRegistrationJournalFilters,
  type LaboratorySampleRegistrationJournalRecord,
  type LaboratorySampleRegistrationJournalSubmission,
} from "../contracts/laboratorySampleRegistrationJournal.js";
import {
  laboratoryChemicalAnalysisFields,
} from "../contracts/laboratoryChemicalAnalysisJournal.js";
import { buildDevAccessHeaders } from "./devAccessSessionStorage.js";
import {
  describeRemoteNetworkFailure,
  resolveApiEndpoint,
  type RemoteServerErrorCode,
} from "./remoteServer.js";

const JOURNAL_PATH = "/api/laboratory/sample-registration-journal";
const DRAFT_PATH = "/api/laboratory/sample-registration-draft";
const SAMPLING_LOCATIONS_PATH =
  "/api/laboratory/sample-registration-locations";

type RequestOptions = { baseUrl?: string; signal?: AbortSignal };
type ErrorResult = {
  status: "error";
  message: string;
  code?: RemoteServerErrorCode;
};

export type LaboratorySampleRegistrationJournalListResult =
  | {
      status: "ready";
      records: LaboratorySampleRegistrationJournalRecord[];
    }
  | ErrorResult;
export type LaboratorySampleRegistrationLocationsResult =
  | {
      status: "ready";
      samplingLocations: string[];
    }
  | ErrorResult;
export type LaboratorySampleRegistrationDraftResult =
  | ({ status: "ready" } & LaboratorySampleRegistrationDraft)
  | ErrorResult;
export type LaboratorySampleRegistrationJournalSaveResult =
  | {
      status: "ready";
      record: LaboratorySampleRegistrationJournalRecord;
    }
  | ErrorResult;

export async function requestLaboratorySampleRegistrationJournal(
  filters: LaboratorySampleRegistrationJournalFilters = {},
  options: RequestOptions = {},
): Promise<LaboratorySampleRegistrationJournalListResult> {
  const params = new URLSearchParams();
  if (filters.dateFrom !== undefined) params.set("dateFrom", filters.dateFrom);
  if (filters.dateTo !== undefined) params.set("dateTo", filters.dateTo);
  if (filters.query !== undefined) params.set("query", filters.query);
  if (filters.nameQuery !== undefined) params.set("name", filters.nameQuery);
  const suffix = params.size === 0 ? "" : `?${params.toString()}`;
  const result = await requestJson(
    `${JOURNAL_PATH}${suffix}`,
    "GET",
    undefined,
    options,
  );

  if (result.status === "error") return result;
  if (
    !isRecord(result.payload) ||
    !Array.isArray(result.payload.records) ||
    !result.payload.records.every(isJournalRecord)
  ) {
    return invalidResponse(
      "Сервер вернул журнал регистрации отбора проб в неподдерживаемом формате.",
    );
  }

  return { status: "ready", records: result.payload.records };
}

export async function requestLaboratorySampleRegistrationLocations(
  options: RequestOptions = {},
): Promise<LaboratorySampleRegistrationLocationsResult> {
  const result = await requestJson(
    SAMPLING_LOCATIONS_PATH,
    "GET",
    undefined,
    options,
  );

  if (result.status === "error") return result;
  if (
    !isRecord(result.payload) ||
    !Array.isArray(result.payload.samplingLocations) ||
    !result.payload.samplingLocations.every(
      (location) => typeof location === "string",
    )
  ) {
    return invalidResponse(
      "Сервер вернул список мест отбора проб в неподдерживаемом формате.",
    );
  }

  return {
    status: "ready",
    samplingLocations: result.payload.samplingLocations,
  };
}

export async function requestLaboratorySampleRegistrationDraft(
  options: RequestOptions = {},
): Promise<LaboratorySampleRegistrationDraftResult> {
  const result = await requestJson(DRAFT_PATH, "GET", undefined, options);

  if (result.status === "error") return result;
  if (
    !isRecord(result.payload) ||
    typeof result.payload.sampleNumber !== "string" ||
    typeof result.payload.laboratorySampleCode !== "string"
  ) {
    return invalidResponse(
      "Сервер вернул заготовку номера пробы в неподдерживаемом формате.",
    );
  }

  return {
    status: "ready",
    sampleNumber: result.payload.sampleNumber,
    laboratorySampleCode: result.payload.laboratorySampleCode,
  };
}

export async function submitLaboratorySampleRegistrationJournalRecord(
  submission: LaboratorySampleRegistrationJournalSubmission,
  options: RequestOptions = {},
): Promise<LaboratorySampleRegistrationJournalSaveResult> {
  const result = await requestJson(JOURNAL_PATH, "POST", submission, options);

  if (result.status === "error") return result;
  if (!isRecord(result.payload) || !isJournalRecord(result.payload.record)) {
    return invalidResponse(
      "Сервер не вернул сохранённую запись журнала регистрации отбора проб.",
    );
  }

  return { status: "ready", record: result.payload.record };
}

async function requestJson(
  path: string,
  method: "GET" | "POST",
  body: LaboratorySampleRegistrationJournalSubmission | undefined,
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

    if (!response.ok) {
      return readRemoteError(
        payload,
        "Не удалось обработать журнал регистрации отбора проб.",
      );
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
        "Не удалось загрузить журнал регистрации отбора проб.",
        { baseUrl },
      ),
    };
  }
}

function isJournalRecord(
  value: unknown,
): value is LaboratorySampleRegistrationJournalRecord {
  return isRecord(value) &&
    typeof value.id === "string" &&
    laboratorySampleRegistrationFields.every(
      (field) => field.id === "waterAbsorption" ||
        typeof value[field.id] === "string",
    ) &&
    (value.waterAbsorption === undefined ||
      typeof value.waterAbsorption === "string") &&
    laboratoryChemicalAnalysisFields.every(
      (field) => value[field.id] === undefined ||
        typeof value[field.id] === "string",
    ) &&
    typeof value.createdAt === "string";
}

function readRemoteError(payload: unknown, fallback: string): ErrorResult {
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

function invalidResponse(message: string): ErrorResult {
  return { status: "error", code: "invalid_response", message };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
