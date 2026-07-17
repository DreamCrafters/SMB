import { randomUUID } from "node:crypto";
import type { RowDataPacket } from "mysql2/promise";
import type { DatabasePool } from "../db/pool.js";
import type {
  ProductionDailyPlan,
  ProductionPlan,
} from "../domain/productionPlan.js";

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
  monthly_plan: number | string;
  working_dates: unknown;
  daily_plans: unknown;
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
      select id, plan_month, monthly_plan, working_dates, daily_plans,
        created_by_user_id, created_at
      from production_plan_revisions
      where plan_month = ?
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
    const workingDates = input.plan.dailyPlans.map(({ date }) => date);

    await pool.query(
      `insert into production_plan_revisions (
        id, plan_month, monthly_plan, working_dates, daily_plans,
        created_by_user_id
      ) values (?, ?, ?, ?, ?, ?)`,
      [
        revision.revisionId,
        revision.month,
        revision.monthlyPlan,
        JSON.stringify(workingDates),
        JSON.stringify(revision.dailyPlans),
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
  const dailyPlans = readDailyPlans(row.daily_plans);

  if (
    workingDates.length !== dailyPlans.length ||
    dailyPlans.some((item, index) => item.date !== workingDates[index])
  ) {
    throw new Error("Stored production plan dates are inconsistent.");
  }

  return {
    revisionId: row.id,
    month: row.plan_month,
    monthlyPlan: Number(row.monthly_plan),
    workingDayCount: workingDates.length,
    dailyPlans,
    createdByUserId: row.created_by_user_id,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

function readStringArray(value: unknown) {
  const parsed = readJson(value);

  if (!Array.isArray(parsed) || !parsed.every((item) => typeof item === "string")) {
    throw new Error("Stored production plan working dates are invalid.");
  }

  return parsed;
}

function readDailyPlans(value: unknown): ProductionDailyPlan[] {
  const parsed = readJson(value);

  if (
    !Array.isArray(parsed) ||
    !parsed.every(
      (item) =>
        typeof item === "object" &&
        item !== null &&
        typeof (item as Record<string, unknown>).date === "string" &&
        typeof (item as Record<string, unknown>).value === "number" &&
        Number.isSafeInteger((item as Record<string, unknown>).value),
    )
  ) {
    throw new Error("Stored production plan daily values are invalid.");
  }

  return parsed as ProductionDailyPlan[];
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
