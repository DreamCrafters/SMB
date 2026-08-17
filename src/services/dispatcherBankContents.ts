import type {
  BankNumber,
  DispatcherProductionBankContent,
  DispatcherProductionBankMeasurement,
  DispatcherProductionBankContentsResponse,
} from "../contracts/laboratoryBanks.js";
import { buildDevAccessHeaders } from "./devAccessSessionStorage.js";
import {
  describeRemoteNetworkFailure,
  resolveApiEndpoint,
} from "./remoteServer.js";

const PRODUCTION_BANK_CONTENTS_PATH =
  "/api/dispatcher/production-bank-contents";

type RequestOptions = {
  baseUrl?: string;
  signal?: AbortSignal;
};

type DispatcherProductionBankContentsRequest = {
  reportDate: string;
};

type ErrorResult = {
  status: "error";
  message: string;
};

export type DispatcherProductionBankContentsResult =
  | ({ status: "ready" } & DispatcherProductionBankContentsResponse)
  | ErrorResult;

export async function requestDispatcherProductionBankContents(
  request: DispatcherProductionBankContentsRequest,
  options: RequestOptions = {},
): Promise<DispatcherProductionBankContentsResult> {
  const path =
    `${PRODUCTION_BANK_CONTENTS_PATH}?date=${encodeURIComponent(request.reportDate)}`;
  const endpoint = resolveApiEndpoint(
    path,
    path,
    options,
  );

  try {
    const response = await fetch(endpoint, {
      method: "GET",
      credentials: "include",
      signal: options.signal,
      headers: buildDevAccessHeaders({ Accept: "application/json" }),
    });
    const payload = await readJson(response);

    if (!response.ok) {
      return readError(payload);
    }

    if (!isDispatcherProductionBankContentsResponse(payload)) {
      return invalidResponse();
    }

    return { status: "ready", ...payload };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return {
        status: "error",
        message: "Запрос содержимого банок отменён.",
      };
    }

    return {
      status: "error",
      message: describeRemoteNetworkFailure(
        "Не удалось загрузить содержимое банок.",
        options,
      ),
    };
  }
}

function isDispatcherProductionBankContentsResponse(
  value: unknown,
): value is DispatcherProductionBankContentsResponse {
  return (
    isRecord(value) &&
    Array.isArray(value.bankContents) &&
    value.bankContents.every(isDispatcherProductionBankContent) &&
    Array.isArray(value.bankMeasurements) &&
    value.bankMeasurements.every(isDispatcherProductionBankMeasurement) &&
    (value.bankReport === undefined ||
      isDispatcherProductionBankReport(value.bankReport)) &&
    typeof value.reportDate === "string" &&
    typeof value.previousReportDate === "string"
  );
}

function isDispatcherProductionBankContent(
  value: unknown,
): value is DispatcherProductionBankContent {
  return (
    isRecord(value) &&
    isBankNumber(value.bankNumber) &&
    typeof value.materialLabel === "string" &&
    value.materialLabel.trim().length > 0
  );
}

function isDispatcherProductionBankMeasurement(
  value: unknown,
): value is DispatcherProductionBankMeasurement {
  return (
    isRecord(value) &&
    isBankNumber(value.bankNumber) &&
    isOptionalFiniteNumber(value.start) &&
    isOptionalFiniteNumber(value.shipmentStart) &&
    isOptionalFiniteNumber(value.end) &&
    isOptionalFiniteNumber(value.shipmentEnd)
  );
}

function isDispatcherProductionBankReport(value: unknown) {
  return (
    isRecord(value) &&
    typeof value.reportDate === "string" &&
    (value.shiftNumber === 1 || value.shiftNumber === 2) &&
    typeof value.coshMaster === "string" &&
    Array.isArray(value.banks) &&
    value.banks.every(isDispatcherProductionBankReportRow)
  );
}

function isDispatcherProductionBankReportRow(value: unknown) {
  return (
    isRecord(value) &&
    isBankNumber(value.bankNumber) &&
    (value.materialLabel === undefined ||
      typeof value.materialLabel === "string") &&
    Array.isArray(value.measurements) &&
    value.measurements.every(isFiniteNumber) &&
    isOptionalFiniteNumber(value.averageHeightMeters) &&
    isOptionalFiniteNumber(value.bulkDensityTonsPerCubicMeter) &&
    (value.bulkDensityLatestRecordDate === undefined ||
      typeof value.bulkDensityLatestRecordDate === "string") &&
    isOptionalFiniteNumber(value.volumeCubicMeters) &&
    isOptionalFiniteNumber(value.materialMassTons) &&
    isOptionalFiniteNumber(value.loadedTons) &&
    isOptionalFiniteNumber(value.shippedTons) &&
    isOptionalFiniteNumber(value.shipmentMassTons)
  );
}

function isBankNumber(value: unknown): value is BankNumber {
  return value === 1 || value === 2 || value === 3;
}

function isOptionalFiniteNumber(value: unknown) {
  return value === undefined || isFiniteNumber(value);
}

function isFiniteNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value);
}

function readError(payload: unknown): ErrorResult {
  return isRecord(payload) &&
      isRecord(payload.error) &&
      typeof payload.error.message === "string"
    ? { status: "error", message: payload.error.message }
    : invalidResponse();
}

function invalidResponse(): ErrorResult {
  return {
    status: "error",
    message: "Сервер вернул содержимое банок в неподдерживаемом формате.",
  };
}

async function readJson(response: Response) {
  try {
    return (await response.json()) as unknown;
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
