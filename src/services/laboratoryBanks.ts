import type {
  BankNumber,
  LaboratoryBankAssignment,
  LaboratoryBanksResponse,
  LaboratoryBankProduct,
} from "../contracts/laboratoryBanks.js";
import { buildDevAccessHeaders } from "./devAccessSessionStorage.js";
import { describeRemoteNetworkFailure, resolveApiEndpoint } from "./remoteServer.js";

const BANKS_PATH = "/api/laboratory/banks";
type RequestOptions = { baseUrl?: string; signal?: AbortSignal };
type ErrorResult = { status: "error"; message: string };

export type LaboratoryBanksResult =
  | ({ status: "ready" } & LaboratoryBanksResponse)
  | ErrorResult;

export async function requestLaboratoryBanks(
  options: RequestOptions = {},
): Promise<LaboratoryBanksResult> {
  const result = await requestJson("GET", undefined, options);
  if (result.status === "error") return result;
  if (!isLaboratoryBanksResponse(result.payload)) return invalidResponse();
  return { status: "ready", ...result.payload };
}

export async function assignLaboratoryBank(
  input: {
    bankNumber: BankNumber;
    laboratoryResultId: string;
  },
  options: RequestOptions = {},
): Promise<{ status: "ready"; assignment: LaboratoryBankAssignment } | ErrorResult> {
  const result = await requestJson("POST", input, options);
  if (
    result.status === "error" ||
    !isRecord(result.payload) ||
    !isLaboratoryBankAssignment(result.payload.assignment)
  ) {
    return result.status === "error" ? result : invalidResponse();
  }
  return { status: "ready", assignment: result.payload.assignment };
}

async function requestJson(
  method: "GET" | "POST",
  body: Record<string, unknown> | undefined,
  { baseUrl, signal }: RequestOptions,
): Promise<{ status: "ready"; payload: unknown } | ErrorResult> {
  const endpoint = resolveApiEndpoint(BANKS_PATH, BANKS_PATH, { baseUrl });
  try {
    const response = await fetch(endpoint, {
      method,
      credentials: "include",
      signal,
      headers: buildDevAccessHeaders({
        Accept: "application/json",
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      }),
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const payload = await readJson(response);
    if (!response.ok) return readError(payload);
    return { status: "ready", payload };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return { status: "error", message: "Запрос данных банок отменён." };
    }
    return {
      status: "error",
      message: describeRemoteNetworkFailure("Не удалось загрузить данные банок.", {
        baseUrl,
      }),
    };
  }
}

function isLaboratoryBanksResponse(value: unknown): value is LaboratoryBanksResponse {
  return isRecord(value) &&
    Array.isArray(value.currentAssignments) &&
    value.currentAssignments.every(isLaboratoryBankAssignment) &&
    Array.isArray(value.history) &&
    value.history.every(isLaboratoryBankAssignment) &&
    Array.isArray(value.eligibleProducts) &&
    value.eligibleProducts.every(isLaboratoryBankProduct);
}

export function isLaboratoryBankAssignment(
  value: unknown,
): value is LaboratoryBankAssignment {
  return isRecord(value) &&
    typeof value.assignmentId === "string" &&
    isBankNumber(value.bankNumber) &&
    typeof value.laboratoryResultId === "string" &&
    Number.isInteger(value.sampleIndex) &&
    typeof value.sampleIdentifier === "string" &&
    typeof value.materialLabel === "string" &&
    isFiniteNumber(value.bulkDensityTonsPerCubicMeter) &&
    typeof value.assignedByDisplayName === "string" &&
    typeof value.assignedAt === "string";
}

function isLaboratoryBankProduct(
  value: unknown,
): value is LaboratoryBankProduct {
  return isRecord(value) &&
    typeof value.laboratoryResultId === "string" &&
    typeof value.productType === "string" &&
    typeof value.productBrand === "string" &&
    typeof value.analysisDate === "string" &&
    isFiniteNumber(value.bulkDensityTonsPerCubicMeter);
}

function isBankNumber(value: unknown): value is BankNumber {
  return value === 1 || value === 2 || value === 3;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function readError(payload: unknown): ErrorResult {
  return isRecord(payload) && isRecord(payload.error) &&
    typeof payload.error.message === "string"
    ? { status: "error", message: payload.error.message }
    : invalidResponse();
}

function invalidResponse(): ErrorResult {
  return { status: "error", message: "Сервер вернул данные банок в неподдерживаемом формате." };
}

async function readJson(response: Response) {
  try {
    return await response.json() as unknown;
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
