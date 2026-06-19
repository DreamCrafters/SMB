import type {
  AccountAccessErrorCode,
  DispatcherFeedResponse,
  DispatcherSubmission,
  DispatcherSubmissionDraft,
  DispatcherSubmissionResponse,
  DispatcherSubmissionStatus,
} from "../contracts";
import {
  buildRemoteEndpoint,
  describeRemoteNetworkFailure,
  type RemoteServerErrorCode,
} from "./remoteServer.js";

const DISPATCHER_SUBMISSIONS_PATH = "/api/dispatcher/submissions";

export type DispatcherSubmissionReadyState = {
  status: "ready";
  submission: DispatcherSubmission;
};

export type DispatcherFeedReadyState = {
  status: "ready";
  submissions: DispatcherSubmission[];
  receivedAt: string;
};

export type DispatcherRemoteErrorState = {
  status: "error";
  message: string;
  code?: AccountAccessErrorCode | RemoteServerErrorCode;
  statusCode?: number;
};

export type DispatcherSubmissionResult =
  | DispatcherSubmissionReadyState
  | DispatcherRemoteErrorState;

export type DispatcherFeedResult =
  | DispatcherFeedReadyState
  | DispatcherRemoteErrorState;

type DispatcherRemoteOptions = {
  baseUrl?: string;
  signal?: AbortSignal;
};

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
}: DispatcherRemoteOptions = {}): Promise<DispatcherFeedResult> {
  const endpoint = buildRemoteEndpoint(DISPATCHER_SUBMISSIONS_PATH, { baseUrl });

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
    typeof value.receivedAt === "string"
  );
}

function isDispatcherSubmission(value: unknown): value is DispatcherSubmission {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.businessAccountId === "string" &&
    typeof value.period === "string" &&
    typeof value.metricCode === "string" &&
    typeof value.rawValue === "string" &&
    (value.comment === undefined || typeof value.comment === "string") &&
    isDispatcherSubmissionStatus(value.status) &&
    typeof value.submittedByAccountId === "string" &&
    typeof value.submittedAt === "string" &&
    typeof value.receivedAt === "string"
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
    value === "unauthenticated" ||
    value === "account_disabled" ||
    value === "business_unavailable" ||
    value === "access_denied" ||
    value === "server_not_configured" ||
    value === "invalid_response" ||
    value === "network_error"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}
