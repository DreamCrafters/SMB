import {
  productionCategories,
  type ProductionCategorySchedule,
  type ProductionCategoryPlans,
  type ProductionPlanPreviewRequest,
  type ProductionPlanPreviewResponse,
  type ProductionDailyPlan,
  type ProductionDailyPlanResponse,
  type ProductionMonthToDate,
  type ProductionPlanResponse,
  type ProductionPlanRevision,
  type SaveProductionPlanRequest,
} from "../contracts/productionPlans.js";
import { buildDevAccessHeaders } from "./devAccessSessionStorage.js";
import {
  describeRemoteNetworkFailure,
  resolveApiEndpoint,
  type RemoteServerErrorCode,
} from "./remoteServer.js";

const PRODUCTION_PLANS_PATH = "/api/production-plans";
const PRODUCTION_PLANS_PREVIEW_PATH = "/api/production-plans/preview";
const PRODUCTION_PLANS_DAILY_PATH = "/api/production-plans/daily";

type ProductionPlansRequestOptions = {
  baseUrl?: string;
  signal?: AbortSignal;
};

type ProductionPlansErrorResult = {
  status: "error";
  message: string;
  code?: RemoteServerErrorCode;
};

export type ProductionPlanLoadResult =
  | { status: "ready"; plan?: ProductionPlanRevision }
  | ProductionPlansErrorResult;

export type ProductionPlanPreviewResult =
  | ({ status: "ready" } & ProductionPlanPreviewResponse)
  | ProductionPlansErrorResult;

export type ProductionPlanSaveResult =
  | { status: "ready"; plan: ProductionPlanRevision }
  | ProductionPlansErrorResult;

export type ProductionDailyPlanLoadResult =
  | { status: "ready"; plan?: ProductionDailyPlan }
  | ProductionPlansErrorResult;

export async function requestProductionPlan(
  month: string,
  options: ProductionPlansRequestOptions = {},
): Promise<ProductionPlanLoadResult> {
  const path = `${PRODUCTION_PLANS_PATH}?month=${encodeURIComponent(month)}`;
  const result = await requestJson(path, "GET", undefined, options);

  if (result.status === "error") {
    return result;
  }

  if (!isProductionPlanResponse(result.payload)) {
    return invalidResponse("Сервер вернул план в неподдерживаемом формате.");
  }

  return {
    status: "ready",
    ...(result.payload.plan === null ? {} : { plan: result.payload.plan }),
  };
}

export async function requestProductionDailyPlan(
  date: string,
  options: ProductionPlansRequestOptions = {},
): Promise<ProductionDailyPlanLoadResult> {
  const path = `${PRODUCTION_PLANS_DAILY_PATH}?date=${encodeURIComponent(date)}`;
  const result = await requestJson(path, "GET", undefined, options);

  if (result.status === "error") {
    return result;
  }

  if (!isProductionDailyPlanResponse(result.payload)) {
    return invalidResponse("Сервер вернул дневной план в неподдерживаемом формате.");
  }

  return {
    status: "ready",
    ...(result.payload.plan === null ? {} : { plan: result.payload.plan }),
  };
}

export async function requestProductionPlanPreview(
  value: ProductionPlanPreviewRequest,
  options: ProductionPlansRequestOptions = {},
): Promise<ProductionPlanPreviewResult> {
  const result = await requestJson(
    PRODUCTION_PLANS_PREVIEW_PATH,
    "POST",
    value,
    options,
  );

  if (result.status === "error") {
    return result;
  }

  if (!isProductionPlanPreviewResponse(result.payload)) {
    return invalidResponse("Сервер вернул рабочие дни в неподдерживаемом формате.");
  }

  return { status: "ready", ...result.payload };
}

export async function saveProductionPlan(
  value: SaveProductionPlanRequest,
  options: ProductionPlansRequestOptions = {},
): Promise<ProductionPlanSaveResult> {
  const result = await requestJson(PRODUCTION_PLANS_PATH, "POST", value, options);

  if (result.status === "error") {
    return result;
  }

  if (!isProductionPlanResponse(result.payload) || result.payload.plan === null) {
    return invalidResponse("Сервер не вернул сохранённый план.");
  }

  return { status: "ready", plan: result.payload.plan };
}

async function requestJson(
  path: string,
  method: "GET" | "POST",
  body: ProductionPlanPreviewRequest | SaveProductionPlanRequest | undefined,
  { baseUrl, signal }: ProductionPlansRequestOptions,
): Promise<
  | { status: "ready"; payload: unknown }
  | ProductionPlansErrorResult
> {
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
      return readRemoteError(payload, "Не удалось обработать план выработки.");
    }

    return { status: "ready", payload };
  } catch (error) {
    if (isAbortError(error)) {
      return { status: "error", message: "Запрос плана отменён." };
    }

    return {
      status: "error",
      message: describeRemoteNetworkFailure(
        "Не удалось загрузить план выработки.",
        { baseUrl },
      ),
      code: "network_error",
    };
  }
}

function isProductionPlanPreviewResponse(
  value: unknown,
): value is ProductionPlanPreviewResponse {
  return (
    isRecord(value) &&
    typeof value.month === "string" &&
    Array.isArray(value.allDates) &&
    value.allDates.every((date) => typeof date === "string") &&
    Array.isArray(value.weekdayDates) &&
    value.weekdayDates.every((date) => typeof date === "string")
  );
}

function isProductionPlanResponse(value: unknown): value is ProductionPlanResponse {
  return (
    isRecord(value) &&
    (value.plan === null || isProductionPlanRevision(value.plan))
  );
}

function isProductionDailyPlanResponse(
  value: unknown,
): value is ProductionDailyPlanResponse {
  return (
    isRecord(value) &&
    (value.plan === null ||
      (isRecord(value.plan) &&
        typeof value.plan.date === "string" &&
        isProductionDailyCategoryPlans(value.plan.values) &&
        isProductionMonthToDate(value.plan.monthToDate)))
  );
}

function isProductionPlanRevision(value: unknown): value is ProductionPlanRevision {
  return (
    isRecord(value) &&
    typeof value.revisionId === "string" &&
    typeof value.month === "string" &&
    isProductionCategorySchedules(value.schedules) &&
    typeof value.createdByUserId === "string" &&
    typeof value.createdAt === "string"
  );
}

function isProductionCategorySchedules(value: unknown) {
  if (!isRecord(value)) {
    return false;
  }

  const categories = Object.keys(value);

  return (
    categories.length > 0 &&
    categories.every(
      (category) =>
        productionCategories.includes(category as (typeof productionCategories)[number]) &&
        isProductionCategorySchedule(value[category]),
    )
  );
}

function isProductionCategorySchedule(
  value: unknown,
): value is ProductionCategorySchedule {
  if (
    !isRecord(value) ||
    typeof value.monthlyPlan !== "number" ||
    !Number.isFinite(value.monthlyPlan) ||
    value.monthlyPlan <= 0 ||
    readDecimalPlaces(value.monthlyPlan) > 2 ||
    typeof value.workingDayCount !== "number" ||
    !Number.isSafeInteger(value.workingDayCount) ||
    value.workingDayCount <= 0 ||
    !Array.isArray(value.dailyPlans) ||
    value.dailyPlans.length !== value.workingDayCount
  ) {
    return false;
  }

  const dailyPlans = value.dailyPlans;

  return dailyPlans.every(
    (item, index) =>
      isRecord(item) &&
      typeof item.date === "string" &&
      typeof item.value === "number" &&
      Number.isFinite(item.value) &&
      item.value >= 0 &&
      readDecimalPlaces(item.value) <= 2 &&
      (index === dailyPlans.length - 1 || Number.isSafeInteger(item.value)),
  );
}

function isProductionDailyCategoryPlans(
  value: unknown,
): value is Partial<ProductionCategoryPlans> {
  if (!isRecord(value)) {
    return false;
  }

  const keys = Object.keys(value);

  return keys.every(
    (category) =>
      productionCategories.includes(category as (typeof productionCategories)[number]) &&
      typeof value[category] === "number" &&
      Number.isFinite(value[category]) &&
      value[category] >= 0 &&
      readDecimalPlaces(value[category]) <= 2,
  );
}

function isProductionMonthToDate(
  value: unknown,
): value is ProductionMonthToDate {
  if (!isRecord(value)) {
    return false;
  }

  return Object.entries(value).every(([category, categoryValue]) => {
    if (
      !productionCategories.includes(
        category as (typeof productionCategories)[number],
      ) ||
      !isRecord(categoryValue)
    ) {
      return false;
    }

    const allowedFields = new Set([
      "monthPlan",
      "monthFactBeforeDay",
    ]);

    return (
      Object.keys(categoryValue).every((field) => allowedFields.has(field)) &&
      isOptionalProductionValue(categoryValue.monthPlan, false, true) &&
      categoryValue.monthFactBeforeDay !== undefined &&
      isOptionalProductionValue(categoryValue.monthFactBeforeDay, false)
    );
  });
}

function isOptionalProductionValue(
  value: unknown,
  signed: boolean,
  limitDecimalPlaces = false,
) {
  return (
    value === undefined ||
    (typeof value === "number" &&
      Number.isFinite(value) &&
      (signed || value >= 0) &&
      (!limitDecimalPlaces || readDecimalPlaces(value) <= 2))
  );
}

function readDecimalPlaces(value: number) {
  const [coefficient, exponentText] = String(value).toLowerCase().split("e");
  const fractionLength = coefficient?.split(".")[1]?.length ?? 0;
  const exponent = exponentText === undefined ? 0 : Number(exponentText);

  return Math.max(0, fractionLength - exponent);
}

function readRemoteError(
  payload: unknown,
  fallbackMessage: string,
): ProductionPlansErrorResult {
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

  return invalidResponse(fallbackMessage);
}

function invalidResponse(message: string): ProductionPlansErrorResult {
  return { status: "error", message, code: "invalid_response" };
}

async function readJson(response: Response) {
  try {
    return await response.json() as unknown;
  } catch {
    return undefined;
  }
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
