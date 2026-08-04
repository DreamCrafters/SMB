import {
  laboratoryChemicalAnalysisFields,
  type LaboratoryChemicalAnalysisJournalFilters,
  type LaboratoryChemicalAnalysisJournalRecord,
  type LaboratoryChemicalAnalysisJournalSelection,
  type LaboratoryChemicalAnalysisJournalSubmission,
  type LaboratorySampleRegistrationOption,
} from "../contracts/laboratoryChemicalAnalysisJournal.js";
import { buildDevAccessHeaders } from "./devAccessSessionStorage.js";
import {
  describeRemoteNetworkFailure,
  resolveApiEndpoint,
  type RemoteServerErrorCode,
} from "./remoteServer.js";
import {
  requestProtectedPdf,
  type ProtectedPdfResult,
} from "./protectedPdf.js";

const JOURNAL_PATH = "/api/laboratory/chemical-analysis-journal";

type RequestOptions = { baseUrl?: string; signal?: AbortSignal };
type ErrorResult = {
  status: "error";
  message: string;
  code?: RemoteServerErrorCode;
};

export type LaboratoryChemicalAnalysisJournalListResult =
  | ({ status: "ready" } & LaboratoryChemicalAnalysisJournalSelection)
  | ErrorResult;
export type LaboratoryChemicalAnalysisJournalSaveResult =
  | {
      status: "ready";
      record: LaboratoryChemicalAnalysisJournalRecord;
    }
  | ErrorResult;
export type LaboratoryChemicalAnalysisProtocolPdfResult = ProtectedPdfResult;

export async function requestLaboratoryChemicalAnalysisJournal(
  filters: LaboratoryChemicalAnalysisJournalFilters = {},
  options: RequestOptions = {},
): Promise<LaboratoryChemicalAnalysisJournalListResult> {
  const params = new URLSearchParams();
  if (filters.dateFrom !== undefined) params.set("dateFrom", filters.dateFrom);
  if (filters.dateTo !== undefined) params.set("dateTo", filters.dateTo);
  if (filters.query !== undefined) params.set("query", filters.query);
  if (filters.sampleQuery !== undefined) {
    params.set("sampleQuery", filters.sampleQuery);
  }
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
    !result.payload.records.every(isJournalRecord) ||
    !Array.isArray(result.payload.sampleOptions) ||
    !result.payload.sampleOptions.every(isSampleOption)
  ) {
    return invalidResponse(
      "Сервер вернул журнал химических анализов в неподдерживаемом формате.",
    );
  }

  return {
    status: "ready",
    records: result.payload.records,
    sampleOptions: result.payload.sampleOptions,
  };
}

export async function submitLaboratoryChemicalAnalysisJournalRecord(
  submission: LaboratoryChemicalAnalysisJournalSubmission,
  options: RequestOptions = {},
): Promise<LaboratoryChemicalAnalysisJournalSaveResult> {
  const result = await requestJson(JOURNAL_PATH, "POST", submission, options);

  return readJournalSaveResult(
    result,
    "Сервер не вернул сохранённую запись журнала химических анализов.",
  );
}

export async function correctLaboratoryChemicalAnalysisJournalRecord(
  id: string,
  submission: LaboratoryChemicalAnalysisJournalSubmission,
  options: RequestOptions = {},
): Promise<LaboratoryChemicalAnalysisJournalSaveResult> {
  const result = await requestJson(
    `${JOURNAL_PATH}/${encodeURIComponent(id)}`,
    "PATCH",
    submission,
    options,
  );

  return readJournalSaveResult(
    result,
    "Сервер не вернул исправленную запись журнала химических анализов.",
  );
}

export async function requestLaboratoryChemicalAnalysisProtocolPdf(
  filters: Pick<
    LaboratoryChemicalAnalysisJournalFilters,
    "dateFrom" | "dateTo" | "query"
  > = {},
  { baseUrl, signal }: RequestOptions = {},
): Promise<LaboratoryChemicalAnalysisProtocolPdfResult> {
  const params = new URLSearchParams();
  if (filters.dateFrom !== undefined) params.set("dateFrom", filters.dateFrom);
  if (filters.dateTo !== undefined) params.set("dateTo", filters.dateTo);
  if (filters.query !== undefined) params.set("query", filters.query);
  const suffix = params.size === 0 ? "" : `?${params.toString()}`;
  const path = `${JOURNAL_PATH}/protocol.pdf${suffix}`;
  return requestProtectedPdf({
    path,
    fallbackFilename: "Протокол химических анализов.pdf",
    failureMessage: "Не удалось сформировать протокол химических анализов.",
    cancellationMessage: "Формирование протокола отменено.",
    baseUrl,
    signal,
  });
}

function readJournalSaveResult(
  result: { status: "ready"; payload: unknown } | ErrorResult,
  invalidMessage: string,
): LaboratoryChemicalAnalysisJournalSaveResult {
  if (result.status === "error") return result;
  if (!isRecord(result.payload) || !isJournalRecord(result.payload.record)) {
    return invalidResponse(invalidMessage);
  }

  return { status: "ready", record: result.payload.record };
}

async function requestJson(
  path: string,
  method: "GET" | "POST" | "PATCH",
  body: LaboratoryChemicalAnalysisJournalSubmission | undefined,
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
        "Не удалось обработать журнал химических анализов.",
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
        "Не удалось загрузить журнал химических анализов.",
        { baseUrl },
      ),
    };
  }
}

function isJournalRecord(
  value: unknown,
): value is LaboratoryChemicalAnalysisJournalRecord {
  return isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.sampleRegistrationId === "string" &&
    typeof value.laboratorySampleCode === "string" &&
    typeof value.sampleNumber === "string" &&
    typeof value.sampleName === "string" &&
    laboratoryChemicalAnalysisFields.every(
      (field) => field.required
        ? typeof value[field.id] === "string"
        : value[field.id] === undefined || typeof value[field.id] === "string",
    ) &&
    typeof value.createdAt === "string";
}

function isSampleOption(
  value: unknown,
): value is LaboratorySampleRegistrationOption {
  return isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.laboratorySampleCode === "string" &&
    typeof value.sampleNumber === "string" &&
    typeof value.sampleName === "string" &&
    typeof value.samplingDate === "string" &&
    typeof value.registrationDate === "string";
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
