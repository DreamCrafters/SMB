import type {
  BankNumber,
  DispatcherProductionBankContent,
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

type ErrorResult = {
  status: "error";
  message: string;
};

export type DispatcherProductionBankContentsResult =
  | ({ status: "ready" } & DispatcherProductionBankContentsResponse)
  | ErrorResult;

export async function requestDispatcherProductionBankContents(
  options: RequestOptions = {},
): Promise<DispatcherProductionBankContentsResult> {
  const endpoint = resolveApiEndpoint(
    PRODUCTION_BANK_CONTENTS_PATH,
    PRODUCTION_BANK_CONTENTS_PATH,
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
    value.bankContents.every(isDispatcherProductionBankContent)
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

function isBankNumber(value: unknown): value is BankNumber {
  return value === 1 || value === 2 || value === 3;
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
