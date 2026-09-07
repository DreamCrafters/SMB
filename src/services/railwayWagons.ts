import {
  railwayWagonStageFields,
  type RailwayEtsngOption,
  type RailwaySecuringMethodOption,
  type RailwayStationOption,
  type RailwayWagonCargoLine,
  type RailwayWagonOrder,
  type RailwayWagonRole,
} from "../contracts/railwayWagons.js";
import { buildDevAccessHeaders } from "./devAccessSessionStorage.js";
import {
  describeRemoteNetworkFailure,
  resolveApiEndpoint,
  type RemoteServerErrorCode,
} from "./remoteServer.js";

const ORDERS_PATH = "/api/railway-wagons";
const REFERENCE_PATH = "/api/railway-reference";

type RequestOptions = { baseUrl?: string; signal?: AbortSignal };
type ErrorResult = {
  status: "error";
  message: string;
  code?: RemoteServerErrorCode;
};

export type RailwayWagonOrderSubmission = {
  contractReference: string;
  movementDirection: string;
  destinationStation: string;
  wagonType: string;
  cargoLines: Array<Omit<RailwayWagonCargoLine, "etsngName">>;
};

export type RailwayWagonsListResult =
  | {
      status: "ready";
      orders: RailwayWagonOrder[];
      carrierOptions: string[];
      roles: RailwayWagonRole[];
    }
  | ErrorResult;

export type RailwayWagonSaveResult =
  | { status: "ready"; order: RailwayWagonOrder; replacement?: RailwayWagonOrder }
  | ErrorResult;

export type RailwayStationsResult =
  | { status: "ready"; stations: RailwayStationOption[] }
  | ErrorResult;

export type RailwayEtsngResult =
  | { status: "ready"; codes: RailwayEtsngOption[] }
  | ErrorResult;

export type RailwaySecuringMethodsResult =
  | { status: "ready"; securingMethods: RailwaySecuringMethodOption[] }
  | ErrorResult;

export async function requestRailwayWagons(
  options: RequestOptions = {},
): Promise<RailwayWagonsListResult> {
  const result = await requestJson("GET", undefined, options);
  if (result.status === "error") return result;

  const payload = result.payload;
  if (
    !isRecord(payload) ||
    !Array.isArray(payload.orders) ||
    !payload.orders.every(isOrder) ||
    !Array.isArray(payload.carrierOptions) ||
    !payload.carrierOptions.every((option) => typeof option === "string") ||
    !Array.isArray(payload.roles) ||
    !payload.roles.every((role) => typeof role === "string")
  ) {
    return invalidResponse("Сервер вернул заявки на вагоны в неподдерживаемом формате.");
  }

  return {
    status: "ready",
    orders: payload.orders,
    carrierOptions: payload.carrierOptions as string[],
    roles: payload.roles as RailwayWagonRole[],
  };
}

export async function submitRailwayWagonOrder(
  submission: RailwayWagonOrderSubmission,
  options: RequestOptions = {},
): Promise<RailwayWagonSaveResult> {
  const result = await requestJson("POST", submission, options);
  return readSavedOrder(result, "Сервер не вернул сохранённую заявку.");
}

export async function correctRailwayWagonOrder(
  orderId: string,
  submission: RailwayWagonOrderSubmission,
  options: RequestOptions = {},
): Promise<RailwayWagonSaveResult> {
  const result = await requestJson(
    "PATCH",
    submission,
    options,
    `${ORDERS_PATH}/${encodeURIComponent(orderId)}`,
  );
  return readSavedOrder(result, "Сервер не вернул исправленную заявку.");
}

export async function submitRailwayWagonStage(
  orderId: string,
  stage: { stageId: string } & Record<string, unknown>,
  options: RequestOptions = {},
): Promise<RailwayWagonSaveResult> {
  const result = await requestJson(
    "POST",
    stage,
    options,
    `${ORDERS_PATH}/${encodeURIComponent(orderId)}/stage`,
  );
  return readSavedOrder(result, "Сервер не вернул обновлённую заявку.");
}

export async function requestRailwayStations(
  query: string,
  options: RequestOptions = {},
): Promise<RailwayStationsResult> {
  const result = await requestJson(
    "GET",
    undefined,
    options,
    `${REFERENCE_PATH}/stations?query=${encodeURIComponent(query)}`,
  );
  if (result.status === "error") return result;

  const payload = result.payload;
  if (
    !isRecord(payload) ||
    !Array.isArray(payload.stations) ||
    !payload.stations.every(isStation)
  ) {
    return invalidResponse("Сервер вернул станции в неподдерживаемом формате.");
  }

  return { status: "ready", stations: payload.stations };
}

export async function requestRailwayEtsngCodes(
  query: string,
  options: RequestOptions = {},
): Promise<RailwayEtsngResult> {
  const result = await requestJson(
    "GET",
    undefined,
    options,
    `${REFERENCE_PATH}/etsng?query=${encodeURIComponent(query)}`,
  );
  if (result.status === "error") return result;

  const payload = result.payload;
  if (
    !isRecord(payload) ||
    !Array.isArray(payload.codes) ||
    !payload.codes.every(isEtsngCode)
  ) {
    return invalidResponse("Сервер вернул коды ЕТСНГ в неподдерживаемом формате.");
  }

  return { status: "ready", codes: payload.codes };
}

export async function requestRailwaySecuringMethods(
  options: RequestOptions = {},
): Promise<RailwaySecuringMethodsResult> {
  const result = await requestJson(
    "GET",
    undefined,
    options,
    `${REFERENCE_PATH}/securing-methods`,
  );
  if (result.status === "error") return result;

  const payload = result.payload;
  if (
    !isRecord(payload) ||
    !Array.isArray(payload.securingMethods) ||
    !payload.securingMethods.every(isSecuringMethod)
  ) {
    return invalidResponse("Сервер вернул способы крепления в неподдерживаемом формате.");
  }

  return { status: "ready", securingMethods: payload.securingMethods };
}

function readSavedOrder(
  result: { status: "ready"; payload: unknown } | ErrorResult,
  fallback: string,
): RailwayWagonSaveResult {
  if (result.status === "error") return result;

  const payload = result.payload;
  if (!isRecord(payload) || !isOrder(payload.order)) {
    return invalidResponse(fallback);
  }

  return {
    status: "ready",
    order: payload.order,
    ...(isOrder(payload.replacement) ? { replacement: payload.replacement } : {}),
  };
}

async function requestJson(
  method: "GET" | "POST" | "PATCH",
  body: unknown,
  { baseUrl, signal }: RequestOptions,
  path = ORDERS_PATH,
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
      return readRemoteError(payload, "Не удалось обработать заявку на вагон.");
    }

    return { status: "ready", payload };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return { status: "error", message: "Запрос раздела «ЖД Вагоны» отменён." };
    }

    return {
      status: "error",
      code: "network_error",
      message: describeRemoteNetworkFailure(
        "Не удалось загрузить раздел «ЖД Вагоны».",
        { baseUrl },
      ),
    };
  }
}

function isOrder(value: unknown): value is RailwayWagonOrder {
  return isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.contractReference === "string" &&
    typeof value.movementDirection === "string" &&
    typeof value.destinationStation === "string" &&
    typeof value.wagonType === "string" &&
    isOptionalString(value.destinationStationRoad) &&
    isOptionalNumber(value.rentCost) &&
    isOptionalNumber(value.tariffCost) &&
    isOptionalString(value.demurragePenalty) &&
    isOptionalString(value.carrier) &&
    isOptionalString(value.wagonNumber) &&
    isOptionalString(value.expectedArrivalDate) &&
    isOptionalString(value.currentLocation) &&
    isOptionalString(value.replacedByOrderId) &&
    typeof value.createdAt === "string" &&
    railwayWagonStageFields.every((field) => isOptionalString(value[field])) &&
    Array.isArray(value.cargoLines) &&
    value.cargoLines.every(isCargoLine);
}

function isCargoLine(value: unknown): value is RailwayWagonCargoLine {
  return isRecord(value) &&
    typeof value.cargoName === "string" &&
    isOptionalString(value.etsngCode) &&
    isOptionalString(value.etsngName) &&
    isOptionalNumber(value.palletCount) &&
    isOptionalNumber(value.palletWeight) &&
    isOptionalNumber(value.palletWidth) &&
    isOptionalNumber(value.palletHeight) &&
    isOptionalNumber(value.palletLength) &&
    isOptionalString(value.securingMethod) &&
    isOptionalNumber(value.securingWeight);
}

function isStation(value: unknown): value is RailwayStationOption {
  return isRecord(value) &&
    typeof value.name === "string" &&
    isOptionalString(value.road);
}

function isEtsngCode(value: unknown): value is RailwayEtsngOption {
  return isRecord(value) &&
    typeof value.code === "string" &&
    typeof value.name === "string";
}

function isSecuringMethod(value: unknown): value is RailwaySecuringMethodOption {
  return isRecord(value) &&
    typeof value.name === "string" &&
    isOptionalString(value.description);
}

function isOptionalString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isOptionalNumber(value: unknown): value is number | null {
  return value === null || typeof value === "number";
}

function invalidResponse(message: string): ErrorResult {
  return { status: "error", code: "invalid_response", message };
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
