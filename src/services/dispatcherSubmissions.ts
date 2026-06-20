import type {
  AccountAccessErrorCode,
  DispatcherFeedResponse,
  DispatcherFeedSummary,
  DispatcherFormDefinition,
  DispatcherFormField,
  DispatcherFormFieldType,
  DispatcherFormId,
  DispatcherFormsResponse,
  DispatcherSubmission,
  DispatcherSubmissionDraft,
  DispatcherSubmissionPayload,
  DispatcherSubmissionResponse,
  DispatcherSubmissionStatus,
} from "../contracts";
import {
  buildRemoteEndpoint,
  describeRemoteNetworkFailure,
  type RemoteServerErrorCode,
} from "./remoteServer.js";

const DISPATCHER_FORMS_PATH = "/api/dispatcher/forms";
const DISPATCHER_SUBMISSIONS_PATH = "/api/dispatcher/submissions";

const dispatcherFormIds: readonly DispatcherFormId[] = [
  "equipment",
  "incident",
  "incident_close",
  "visitor",
  "gas_oc",
  "gas_cosh",
];

const dispatcherFieldTypes: readonly DispatcherFormFieldType[] = [
  "text",
  "number",
  "date",
  "month",
  "datetime-local",
  "select",
  "textarea",
];

export type DispatcherFormsReadyState = {
  status: "ready";
  forms: DispatcherFormDefinition[];
};

export type DispatcherSubmissionReadyState = {
  status: "ready";
  submission: DispatcherSubmission;
};

export type DispatcherFeedReadyState = {
  status: "ready";
  submissions: DispatcherSubmission[];
  receivedAt: string;
  summary: DispatcherFeedSummary;
};

export type DispatcherRemoteErrorState = {
  status: "error";
  message: string;
  code?: AccountAccessErrorCode | RemoteServerErrorCode;
  statusCode?: number;
};

export type DispatcherFormsResult =
  | DispatcherFormsReadyState
  | DispatcherRemoteErrorState;

export type DispatcherSubmissionResult =
  | DispatcherSubmissionReadyState
  | DispatcherRemoteErrorState;

export type DispatcherFeedResult =
  | DispatcherFeedReadyState
  | DispatcherRemoteErrorState;

export type DispatcherFeedFilters = {
  formId?: DispatcherFormId;
  dateFrom?: string;
  dateTo?: string;
};

type DispatcherRemoteOptions = {
  baseUrl?: string;
  signal?: AbortSignal;
};

export async function requestDispatcherForms({
  baseUrl,
  signal,
}: DispatcherRemoteOptions = {}): Promise<DispatcherFormsResult> {
  const endpoint = buildRemoteEndpoint(DISPATCHER_FORMS_PATH, { baseUrl });

  if (endpoint.status === "missing") {
    return {
      status: "error",
      message: endpoint.message,
      code: "server_not_configured",
    };
  }

  try {
    const response = await fetch(endpoint.endpoint, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
      credentials: "include",
      signal,
    });

    const payload = await readJson(response);

    if (!response.ok) {
      return readRemoteError(payload, response.status, "Сервер отклонил запрос форм.");
    }

    if (isDispatcherFormsResponse(payload)) {
      return {
        status: "ready",
        forms: payload.forms,
      };
    }

    return {
      status: "error",
      message: "Сервер вернул формы в неподдерживаемом формате.",
      code: "invalid_response",
      statusCode: response.status,
    };
  } catch (error) {
    if (isAbortError(error)) {
      return {
        status: "error",
        message: "Запрос форм отменён.",
      };
    }

    return {
      status: "error",
      message: describeRemoteNetworkFailure(
        "Не удалось запросить диспетчерские формы.",
        { baseUrl },
      ),
      code: "network_error",
    };
  }
}

export async function submitDispatcherSubmission(
  draft: DispatcherSubmissionDraft,
  options: DispatcherRemoteOptions = {},
): Promise<DispatcherSubmissionResult> {
  const endpoint = buildRemoteEndpoint(DISPATCHER_SUBMISSIONS_PATH, options);

  if (endpoint.status === "missing") {
    return {
      status: "error",
      message: endpoint.message,
      code: "server_not_configured",
    };
  }

  try {
    const response = await fetch(endpoint.endpoint, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      credentials: "include",
      signal: options.signal,
      body: JSON.stringify(draft),
    });

    const payload = await readJson(response);

    if (!response.ok) {
      return readRemoteError(payload, response.status, "Сервер отклонил отправку.");
    }

    if (isDispatcherSubmissionResponse(payload)) {
      return {
        status: "ready",
        submission: payload.submission,
      };
    }

    return {
      status: "error",
      message: "Сервер вернул отправку в неподдерживаемом формате.",
      code: "invalid_response",
      statusCode: response.status,
    };
  } catch (error) {
    if (isAbortError(error)) {
      return {
        status: "error",
        message: "Запрос отправки отменён.",
      };
    }

    return {
      status: "error",
      message: describeRemoteNetworkFailure(
        "Не удалось отправить данные на удалённый сервер.",
        options,
      ),
      code: "network_error",
    };
  }
}

export async function requestDispatcherFeed({
  baseUrl,
  signal,
  formId,
  dateFrom,
  dateTo,
}: DispatcherRemoteOptions & DispatcherFeedFilters = {}): Promise<DispatcherFeedResult> {
  const endpoint = buildRemoteEndpoint(DISPATCHER_SUBMISSIONS_PATH, { baseUrl });

  if (endpoint.status === "missing") {
    return {
      status: "error",
      message: endpoint.message,
      code: "server_not_configured",
    };
  }

  const feedEndpoint = buildFeedEndpoint(endpoint.endpoint, {
    formId,
    dateFrom,
    dateTo,
  });

  try {
    const response = await fetch(feedEndpoint, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
      credentials: "include",
      signal,
    });

    const payload = await readJson(response);

    if (!response.ok) {
      return readRemoteError(
        payload,
        response.status,
        "Сервер отклонил запрос диспетчерской истории.",
      );
    }

    if (isDispatcherFeedResponse(payload)) {
      return {
        status: "ready",
        submissions: payload.submissions,
        receivedAt: payload.receivedAt,
        summary: payload.summary,
      };
    }

    return {
      status: "error",
      message: "Сервер вернул диспетчерскую историю в неподдерживаемом формате.",
      code: "invalid_response",
      statusCode: response.status,
    };
  } catch (error) {
    if (isAbortError(error)) {
      return {
        status: "error",
        message: "Запрос диспетчерской истории отменён.",
      };
    }

    return {
      status: "error",
      message: describeRemoteNetworkFailure(
        "Не удалось запросить диспетчерскую историю.",
        { baseUrl },
      ),
      code: "network_error",
    };
  }
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

function buildFeedEndpoint(endpoint: string, filters: DispatcherFeedFilters) {
  const url = new URL(endpoint);

  if (filters.formId !== undefined) {
    url.searchParams.set("formId", filters.formId);
  }

  if (filters.dateFrom !== undefined) {
    url.searchParams.set("dateFrom", filters.dateFrom);
  }

  if (filters.dateTo !== undefined) {
    url.searchParams.set("dateTo", filters.dateTo);
  }

  return url.toString();
}

function readRemoteError(
  payload: unknown,
  statusCode: number,
  fallback: string,
): DispatcherRemoteErrorState {
  return {
    status: "error",
    message: readErrorMessage(payload, fallback),
    code: readErrorCode(payload),
    statusCode,
  };
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
    isKnownErrorCode(payload.error.code)
  ) {
    return payload.error.code;
  }

  return undefined;
}

function isDispatcherFormsResponse(value: unknown): value is DispatcherFormsResponse {
  return (
    isRecord(value) &&
    Array.isArray(value.forms) &&
    value.forms.every(isDispatcherFormDefinition)
  );
}

function isDispatcherSubmissionResponse(
  value: unknown,
): value is DispatcherSubmissionResponse {
  return isRecord(value) && isDispatcherSubmission(value.submission);
}

function isDispatcherFeedResponse(value: unknown): value is DispatcherFeedResponse {
  return (
    isRecord(value) &&
    Array.isArray(value.submissions) &&
    value.submissions.every(isDispatcherSubmission) &&
    typeof value.receivedAt === "string" &&
    isDispatcherFeedSummary(value.summary)
  );
}

function isDispatcherFormDefinition(
  value: unknown,
): value is DispatcherFormDefinition {
  return (
    isRecord(value) &&
    isDispatcherFormId(value.id) &&
    typeof value.title === "string" &&
    typeof value.sheetName === "string" &&
    Array.isArray(value.fields) &&
    value.fields.every(isDispatcherFormField)
  );
}

function isDispatcherFormField(value: unknown): value is DispatcherFormField {
  return (
    isRecord(value) &&
    typeof value.name === "string" &&
    typeof value.label === "string" &&
    isDispatcherFormFieldType(value.type) &&
    typeof value.required === "boolean" &&
    (value.options === undefined ||
      (Array.isArray(value.options) &&
        value.options.every((option) => typeof option === "string")))
  );
}

function isDispatcherSubmission(value: unknown): value is DispatcherSubmission {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.businessAccountId === "string" &&
    isDispatcherFormId(value.formId) &&
    typeof value.formTitle === "string" &&
    isDispatcherSubmissionPayload(value.payload) &&
    typeof value.summary === "string" &&
    isDispatcherSubmissionStatus(value.status) &&
    typeof value.submittedByAccountId === "string" &&
    typeof value.submittedAt === "string" &&
    typeof value.receivedAt === "string"
  );
}

function isDispatcherFeedSummary(
  value: unknown,
): value is DispatcherFeedSummary {
  return (
    isRecord(value) &&
    typeof value.total === "number" &&
    Array.isArray(value.byForm) &&
    value.byForm.every(
      (item) =>
        isRecord(item) &&
        isDispatcherFormId(item.formId) &&
        typeof item.formTitle === "string" &&
        typeof item.count === "number",
    )
  );
}

function isDispatcherSubmissionPayload(
  value: unknown,
): value is DispatcherSubmissionPayload {
  return (
    isRecord(value) &&
    Object.values(value).every((payloadValue) => typeof payloadValue === "string")
  );
}

function isDispatcherFormId(value: unknown): value is DispatcherFormId {
  return (
    typeof value === "string" &&
    dispatcherFormIds.includes(value as DispatcherFormId)
  );
}

function isDispatcherFormFieldType(
  value: unknown,
): value is DispatcherFormFieldType {
  return (
    typeof value === "string" &&
    dispatcherFieldTypes.includes(value as DispatcherFormFieldType)
  );
}

function isDispatcherSubmissionStatus(
  value: unknown,
): value is DispatcherSubmissionStatus {
  return (
    value === "received" ||
    value === "queued" ||
    value === "accepted" ||
    value === "rejected"
  );
}

function isKnownErrorCode(
  value: unknown,
): value is AccountAccessErrorCode | RemoteServerErrorCode {
  return (
    value === "server_not_configured" ||
    value === "network_error" ||
    value === "invalid_response" ||
    value === "access_denied" ||
    value === "not_found" ||
    value === "server_error"
  );
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
