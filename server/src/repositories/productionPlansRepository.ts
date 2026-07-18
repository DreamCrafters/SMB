import { randomUUID } from "node:crypto";
import type { RowDataPacket } from "mysql2/promise";
import type { DatabasePool } from "../db/pool.js";
import type {
  ProductionCategoryDailyPlan,
  ProductionCategoryPlans,
  ProductionCategorySchedules,
  ProductionPlan,
} from "../domain/productionPlan.js";
import { productionCategories } from "../domain/productionPlan.js";

export type ProductionPlanRevision = ProductionPlan & {
  revisionId: string;
  createdByUserId: string;
  createdAt: string;
};

export type ProductionPlansRepository = {
  readLatest: (month: string) => Promise<ProductionPlanRevision | undefined>;
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
  async function readLatest(month: string) {
    const [rows] = await pool.query<ProductionPlanRevisionRow[]>(`
      select id, plan_month, monthly_plans, working_dates, category_daily_plans,
        created_by_user_id, created_at
      from production_plan_revisions
      where plan_month = ? and monthly_plans is not null
      order by created_at desc, id desc
      limit 1
    `, [month]);
    const row = rows[0];

    return row === undefined ? undefined : mapProductionPlanRevision(row);
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
    const monthlyPlans = mapCategoryValues(
      (category) => revision.schedules[category].monthlyPlan,
    );
    const storedDailyPlans = mapCategoryValues(
      (category) => revision.schedules[category].dailyPlans,
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

  return { readLatest, saveRevision };
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
  monthlyPlans: ProductionCategoryPlans,
): ProductionCategorySchedules {
  const parsed = readJson(value);

  if (isLegacyDailyPlans(parsed)) {
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
    Object.keys(parsed).length !== productionCategories.length
  ) {
    throw new Error("Stored production plan daily values are invalid.");
  }

  return mapCategoryValues((category) => {
    const dailyPlans = parsed[category];

    if (!isCategoryDailyPlans(dailyPlans)) {
      throw new Error("Stored production plan daily values are invalid.");
    }

    return {
      monthlyPlan: monthlyPlans[category],
      workingDayCount: dailyPlans.length,
      dailyPlans,
    };
  });
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
        isCategoryPlans(item.values),
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
      (item) =>
        isRecord(item) &&
        typeof item.date === "string" &&
        typeof item.value === "number" &&
        Number.isSafeInteger(item.value) &&
        item.value >= 0,
    )
  );
}

function readCategoryPlans(value: unknown): ProductionCategoryPlans {
  const parsed = readJson(value);

  if (!isCategoryPlans(parsed)) {
    throw new Error("Stored production plan category values are invalid.");
  }

  return parsed;
}

function isCategoryPlans(value: unknown): value is ProductionCategoryPlans {
  return (
    isRecord(value) &&
    productionCategories.every((category) => {
      const plan = value[category];
      return typeof plan === "number" && Number.isSafeInteger(plan) && plan > 0;
    })
  );
}

function readScheduleDateUnion(schedules: ProductionCategorySchedules) {
  return Array.from(
    new Set(
      productionCategories.flatMap((category) =>
        schedules[category].dailyPlans.map((item) => item.date),
      ),
    ),
  ).sort();
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
