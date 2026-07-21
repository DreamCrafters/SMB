import {
  type CreateProductionBrandRequest,
  type ProductionBrandLabel,
  type ProductionBrandResponse,
  type ProductionBrandsResponse,
} from "../contracts/productionPlans.js";
import { buildDevAccessHeaders } from "./devAccessSessionStorage.js";
import {
  describeRemoteNetworkFailure,
  resolveApiEndpoint,
  type RemoteServerErrorCode,
} from "./remoteServer.js";

const PRODUCTION_BRANDS_PATH = "/api/production-brands";

type ProductionBrandsOptions = {
  baseUrl?: string;
  signal?: AbortSignal;
};

type ProductionBrandsError = {
  status: "error";
  message: string;
  code?: RemoteServerErrorCode;
};

export type ProductionBrandsLoadResult =
  | { status: "ready"; labels: ProductionBrandLabel[] }
  | ProductionBrandsError;

export type ProductionBrandCreateResult =
  | { status: "ready"; label: ProductionBrandLabel }
  | ProductionBrandsError;

export async function requestProductionBrands(
  options: ProductionBrandsOptions = {},
): Promise<ProductionBrandsLoadResult> {
  const result = await requestJson("GET", undefined, options);

  if (result.status === "error") {
    return result;
  }

  if (!isProductionBrandsResponse(result.payload)) {
    return invalidResponse("Сервер вернул справочник марок в неподдерживаемом формате.");
  }

  return { status: "ready", labels: result.payload.labels };
}

export async function createProductionBrand(
  value: CreateProductionBrandRequest,
  options: ProductionBrandsOptions = {},
): Promise<ProductionBrandCreateResult> {
  const result = await requestJson("POST", value, options);

  if (result.status === "error") {
    return result;
  }

  if (!isProductionBrandResponse(result.payload)) {
    return invalidResponse("Сервер не вернул сохранённую марку.");
  }

  return { status: "ready", label: result.payload.label };
}

async function requestJson(
  method: "GET" | "POST",
  body: CreateProductionBrandRequest | undefined,
  { baseUrl, signal }: ProductionBrandsOptions,
): Promise<
  | { status: "ready"; payload: unknown }
  | ProductionBrandsError
> {
  const endpoint = resolveApiEndpoint(
    PRODUCTION_BRANDS_PATH,
    PRODUCTION_BRANDS_PATH,
    { baseUrl },
  );

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
      return readRemoteError(payload);
    }

    return { status: "ready", payload };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return { status: "error", message: "Загрузка марок отменена." };
    }

    return {
      status: "error",
      message: describeRemoteNetworkFailure(
        "Не удалось загрузить справочник марок.",
        { baseUrl },
      ),
      code: "network_error",
    };
  }
}

function isProductionBrandsResponse(value: unknown): value is ProductionBrandsResponse {
  return (
    isRecord(value) &&
    Array.isArray(value.labels) &&
    value.labels.every(isProductionBrandLabel)
  );
}

function isProductionBrandResponse(value: unknown): value is ProductionBrandResponse {
  return isRecord(value) && isProductionBrandLabel(value.label);
}

function isProductionBrandLabel(value: unknown): value is ProductionBrandLabel {
  return typeof value === "string" && value.trim().length > 0;
}

function readRemoteError(payload: unknown): ProductionBrandsError {
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

  return invalidResponse("Не удалось обработать справочник марок.");
}

function invalidResponse(message: string): ProductionBrandsError {
  return { status: "error", message, code: "invalid_response" };
}

async function readJson(response: Response) {
  try {
    return await response.json() as unknown;
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
