import type { BusinessOverview } from "../contracts/businessOverview.js";
import { buildDevAccessHeaders } from "./devAccessSessionStorage.js";
import {
  describeRemoteNetworkFailure,
  resolveApiEndpoint,
  type RemoteServerErrorCode,
} from "./remoteServer.js";

const BUSINESS_OVERVIEW_PATH = "/api/business/overview";

type BusinessOverviewRequestOptions = {
  baseUrl?: string;
  signal?: AbortSignal;
};

type BusinessOverviewErrorResult = {
  status: "error";
  message: string;
  code?: RemoteServerErrorCode;
};

export type BusinessOverviewResult =
  | { status: "ready"; overview: BusinessOverview }
  | BusinessOverviewErrorResult;

export async function requestBusinessOverview({
  baseUrl,
  signal,
}: BusinessOverviewRequestOptions = {}): Promise<BusinessOverviewResult> {
  const endpoint = resolveApiEndpoint(
    BUSINESS_OVERVIEW_PATH,
    BUSINESS_OVERVIEW_PATH,
    { baseUrl },
  );

  try {
    const response = await fetch(endpoint, {
      method: "GET",
      headers: buildDevAccessHeaders({ Accept: "application/json" }),
      credentials: "include",
      signal,
    });
    const payload = await readJson(response);

    if (!response.ok) {
      return readRemoteError(
        payload,
        "Сервер отклонил запрос обзора.",
      );
    }

    if (!isBusinessOverview(payload)) {
      return {
        status: "error",
        code: "invalid_response",
        message: "Сервер вернул обзор в неподдерживаемом формате.",
      };
    }

    return {
      status: "ready",
      overview: payload,
    };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return {
        status: "error",
        message: "Запрос обзора отменён.",
      };
    }

    return {
      status: "error",
      code: "network_error",
      message: describeRemoteNetworkFailure(
        "Не удалось загрузить обзор.",
        { baseUrl },
      ),
    };
  }
}

function isBusinessOverview(value: unknown): value is BusinessOverview {
  return isRecord(value) &&
    isRecord(value.period) &&
    isCalendarDate(value.period.monthStart) &&
    isCalendarDate(value.period.today) &&
    isRecord(value.incidents) &&
    isNonNegativeInteger(value.incidents.monthTotal) &&
    isNonNegativeInteger(value.incidents.monthClosed) &&
    isNonNegativeInteger(value.incidents.todayTotal) &&
    isNonNegativeInteger(value.incidents.openNow) &&
    isRecord(value.laboratory) &&
    isNonNegativeInteger(value.laboratory.monthTotal) &&
    isNonNegativeInteger(value.laboratory.todayTotal) &&
    typeof value.receivedAt === "string";
}

function isCalendarDate(value: unknown) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/u.test(value);
}

function isNonNegativeInteger(value: unknown) {
  return typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 0;
}

async function readJson(response: Response) {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

function readRemoteError(
  payload: unknown,
  fallback: string,
): BusinessOverviewErrorResult {
  if (
    isRecord(payload) &&
    isRecord(payload.error) &&
    typeof payload.error.message === "string"
  ) {
    return {
      status: "error",
      message: payload.error.message,
      ...(typeof payload.error.code === "string"
        ? { code: payload.error.code as RemoteServerErrorCode }
        : {}),
    };
  }

  return {
    status: "error",
    message: fallback,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
