import { randomUUID } from "node:crypto";
import type { RowDataPacket } from "mysql2/promise";
import type { DatabasePool } from "../db/pool.js";
import type {
  ProductionCategory,
  ProductionCategoryDailyPlan,
  ProductionCategoryPlans,
  ProductionPlan,
  ProductionPlanSchedules,
} from "../domain/productionPlan.js";
import { productionCategories } from "../domain/productionPlan.js";

export type ProductionPlanRevision = ProductionPlan & {
  revisionId: string;
  createdByUserId: string;
  createdAt: string;
};

export type ProductionPlansRepository = {
  readLatest: (month: string) => Promise<ProductionPlanRevision | undefined>;
  readLatestForUpdate: (
    month: string,
  ) => Promise<ProductionPlanRevision | undefined>;
  saveRevision: (input: {
    plan: ProductionPlan;
    createdByUserId: string;
  }) => Promise<ProductionPlanRevision>;
};

type ProductionPlanRevisionRow = RowDataPacket & {
  id: string;
  plan_month: string;
  monthly_plans: unknown;
  working_dates: unknown;
  category_daily_plans: unknown;
  created_by_user_id: string;
  created_at: Date | string;
};

type ProductionPlansRepositoryOptions = {
  createId?: () => string;
  now?: () => Date;
};

export function createProductionPlansRepository(
  pool: DatabasePool,
  {
    createId = randomUUID,
    now = () => new Date(),
  }: ProductionPlansRepositoryOptions = {},
): ProductionPlansRepository {
  async function readLatestRevision(month: string) {
    const [rows] = await pool.query<ProductionPlanRevisionRow[]>(`
      select id, plan_month, monthly_plans, working_dates, category_daily_plans,
        created_by_user_id, created_at
      from production_plan_revisions
      where plan_month = ? and monthly_plans is not null
      order by revision_sequence desc
      limit 1
    `, [month]);
    const row = rows[0];

    return row === undefined ? undefined : mapProductionPlanRevision(row);
  }

  function readLatest(month: string) {
    return readLatestRevision(month);
  }

  async function readLatestForUpdate(month: string) {
    await pool.query(
      `insert into production_plan_month_locks (plan_month)
        values (?)
        on duplicate key update plan_month = values(plan_month)`,
      [month],
    );

    return readLatestRevision(month);
  }

  async function saveRevision(input: {
    plan: ProductionPlan;
    createdByUserId: string;
  }) {
    const revision: ProductionPlanRevision = {
      ...input.plan,
      revisionId: createId(),
      createdByUserId: input.createdByUserId,
      createdAt: now().toISOString(),
    };
    const monthlyPlans = mapStoredSchedules(
      revision.schedules,
      (schedule) => schedule.monthlyPlan,
    );
    const storedDailyPlans = mapStoredSchedules(
      revision.schedules,
      (schedule) => schedule.dailyPlans,
    );
    const workingDates = readScheduleDateUnion(revision.schedules);

    await pool.query(
      `insert into production_plan_revisions (
        id, plan_month, monthly_plans, working_dates, category_daily_plans,
        created_by_user_id
      ) values (?, ?, ?, ?, ?, ?)`,
      [
        revision.revisionId,
        revision.month,
        JSON.stringify(monthlyPlans),
        JSON.stringify(workingDates),
        JSON.stringify(storedDailyPlans),
        revision.createdByUserId,
      ],
    );

    return revision;
  }

  return { readLatest, readLatestForUpdate, saveRevision };
}

function mapProductionPlanRevision(
  row: ProductionPlanRevisionRow,
): ProductionPlanRevision {
  const workingDates = readStringArray(row.working_dates);
  const monthlyPlans = readCategoryPlans(row.monthly_plans);
  const schedules = readCategorySchedules(
    row.category_daily_plans,
    monthlyPlans,
  );

  if (!arraysEqual(workingDates, readScheduleDateUnion(schedules))) {
    throw new Error("Stored production plan dates are inconsistent.");
  }

  return {
    revisionId: row.id,
    month: row.plan_month,
    schedules,
    createdByUserId: row.created_by_user_id,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

function readCategorySchedules(
  value: unknown,
  monthlyPlans: Partial<ProductionCategoryPlans>,
): ProductionPlanSchedules {
  const parsed = readJson(value);

  if (isLegacyDailyPlans(parsed)) {
    if (!isCompleteCategoryPlans(monthlyPlans)) {
      throw new Error("Stored production plan category values are invalid.");
    }

    return mapCategoryValues((category) => ({
      monthlyPlan: monthlyPlans[category],
      workingDayCount: parsed.length,
      dailyPlans: parsed.map((item) => ({
        date: item.date,
        value: item.values[category],
      })),
    }));
  }

  if (
    !isRecord(parsed) ||
    !hasValidStoredCategoryKeys(parsed) ||
    !arraysEqual(Object.keys(parsed).sort(), Object.keys(monthlyPlans).sort())
  ) {
    throw new Error("Stored production plan daily values are invalid.");
  }

  return Object.fromEntries(Object.keys(parsed).map((category) => {
    const typedCategory = category as (typeof productionCategories)[number];
    const dailyPlans = parsed[category];
    const monthlyPlan = monthlyPlans[typedCategory];

    if (!isCategoryDailyPlans(dailyPlans) || monthlyPlan === undefined) {
      throw new Error("Stored production plan daily values are invalid.");
    }

    return [typedCategory, {
      monthlyPlan,
      workingDayCount: dailyPlans.length,
      dailyPlans,
    }];
  })) as ProductionPlanSchedules;
}

function readStringArray(value: unknown) {
  const parsed = readJson(value);

  if (!Array.isArray(parsed) || !parsed.every((item) => typeof item === "string")) {
    throw new Error("Stored production plan working dates are invalid.");
  }

  return parsed;
}

type LegacyProductionDailyPlan = {
  date: string;
  values: ProductionCategoryPlans;
};

function isLegacyDailyPlans(value: unknown): value is LegacyProductionDailyPlan[] {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        isRecord(item) &&
        typeof item.date === "string" &&
        isCompleteIntegerCategoryPlans(item.values),
    )
  );
}

function isCategoryDailyPlans(
  value: unknown,
): value is ProductionCategoryDailyPlan[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every(
      (item, index) =>
        isRecord(item) &&
        typeof item.date === "string" &&
        typeof item.value === "number" &&
        Number.isFinite(item.value) &&
        item.value >= 0 &&
        readDecimalPlaces(item.value) <= 2 &&
        (index === value.length - 1 || Number.isSafeInteger(item.value)),
    )
  );
}

function readCategoryPlans(value: unknown): Partial<ProductionCategoryPlans> {
  const parsed = readJson(value);

  if (!isStoredCategoryPlans(parsed)) {
    throw new Error("Stored production plan category values are invalid.");
  }

  return parsed as Partial<ProductionCategoryPlans>;
}

function isCompleteCategoryPlans(value: unknown): value is ProductionCategoryPlans {
  return (
    isStoredCategoryPlans(value) &&
    Object.keys(value).length === productionCategories.length
  );
}

function isCompleteIntegerCategoryPlans(
  value: unknown,
): value is ProductionCategoryPlans {
  return (
    isRecord(value) &&
    hasValidStoredCategoryKeys(value) &&
    Object.keys(value).length === productionCategories.length &&
    Object.values(value).every(
      (plan) =>
        typeof plan === "number" &&
        Number.isSafeInteger(plan) &&
        plan > 0,
    )
  );
}

function isStoredCategoryPlans(
  value: unknown,
): value is Partial<ProductionCategoryPlans> {
  if (!isRecord(value) || !hasValidStoredCategoryKeys(value)) {
    return false;
  }

  return Object.values(value).every(
    (plan) =>
      typeof plan === "number" &&
      Number.isFinite(plan) &&
      plan > 0 &&
      readDecimalPlaces(plan) <= 2,
  );
}

function readDecimalPlaces(value: number) {
  const [coefficient, exponentText] = String(value).toLowerCase().split("e");
  const fractionLength = coefficient?.split(".")[1]?.length ?? 0;
  const exponent = exponentText === undefined ? 0 : Number(exponentText);

  return Math.max(0, fractionLength - exponent);
}

function readScheduleDateUnion(schedules: ProductionPlanSchedules) {
  return Array.from(
    new Set(
      productionCategories.flatMap((category) =>
        schedules[category]?.dailyPlans.map((item) => item.date) ?? [],
      ),
    ),
  ).sort();
}

function mapStoredSchedules<Value>(
  schedules: ProductionPlanSchedules,
  readValue: (schedule: NonNullable<ProductionPlanSchedules[ProductionCategory]>) => Value,
) {
  return Object.fromEntries(
    productionCategories.flatMap((category) => {
      const schedule = schedules[category];

      return schedule === undefined ? [] : [[category, readValue(schedule)]];
    }),
  ) as Partial<Record<ProductionCategory, Value>>;
}

function hasValidStoredCategoryKeys(value: Record<string, unknown>) {
  const categories = Object.keys(value);

  return (
    categories.length > 0 &&
    categories.every((category) =>
      productionCategories.includes(category as ProductionCategory),
    )
  );
}

function mapCategoryValues<Value>(
  readValue: (category: (typeof productionCategories)[number]) => Value,
) {
  return Object.fromEntries(
    productionCategories.map((category) => [category, readValue(category)]),
  ) as Record<(typeof productionCategories)[number], Value>;
}

function arraysEqual(left: string[], right: string[]) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function readJson(value: unknown) {
  if (typeof value !== "string") {
    return value;
  }

  try {
    return JSON.parse(value) as unknown;
  } catch {
    throw new Error("Stored production plan JSON is invalid.");
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
