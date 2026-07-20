import assert from "node:assert/strict";
import test from "node:test";
import type { DatabasePool } from "../db/pool.js";
import type { ProductionPlan } from "../domain/productionPlan.js";
import { createProductionPlansRepository } from "./productionPlansRepository.js";

const plan: ProductionPlan = {
  month: "2026-07",
  schedules: {
    forming: {
      monthlyPlan: 100.25,
      workingDayCount: 3,
      dailyPlans: [
        { date: "2026-07-01", value: 34 },
        { date: "2026-07-02", value: 34 },
        { date: "2026-07-03", value: 32.25 },
      ],
    },
    sorting: {
      monthlyPlan: 80,
      workingDayCount: 2,
      dailyPlans: [
        { date: "2026-07-01", value: 40 },
        { date: "2026-07-02", value: 40 },
      ],
    },
    unformed: {
      monthlyPlan: 50,
      workingDayCount: 1,
      dailyPlans: [{ date: "2026-07-04", value: 50 }],
    },
    chamotte: {
      monthlyPlan: 20,
      workingDayCount: 2,
      dailyPlans: [
        { date: "2026-07-02", value: 10 },
        { date: "2026-07-04", value: 10 },
      ],
    },
  },
};

test("production plans repository appends independent category schedules", async () => {
  const queries: Array<{ sql: string; parameters?: unknown[] }> = [];
  const pool = buildPool(queries, {
    id: "revision-1",
    plan_month: "2026-07",
    monthly_plans: JSON.stringify(readMonthlyPlans(plan)),
    working_dates: JSON.stringify([
      "2026-07-01",
      "2026-07-02",
      "2026-07-03",
      "2026-07-04",
    ]),
    category_daily_plans: JSON.stringify(readStoredDailyPlans(plan)),
    created_by_user_id: "economist-user",
    created_at: "2026-07-17T10:00:00.000Z",
  });
  const repository = createProductionPlansRepository(pool, {
    createId: () => "revision-1",
    now: () => new Date("2026-07-17T10:00:00.000Z"),
  });

  const saved = await repository.saveRevision({
    plan,
    createdByUserId: "economist-user",
  });
  const latest = await repository.readLatest("2026-07");

  assert.equal(saved.revisionId, "revision-1");
  assert.deepEqual(queries[0]?.parameters, [
    "revision-1",
    "2026-07",
    JSON.stringify(readMonthlyPlans(plan)),
    JSON.stringify([
      "2026-07-01",
      "2026-07-02",
      "2026-07-03",
      "2026-07-04",
    ]),
    JSON.stringify(readStoredDailyPlans(plan)),
    "economist-user",
  ]);
  assert.deepEqual(latest, saved);
});

test("production plans repository stores a month while only some categories are configured", async () => {
  const queries: Array<{ sql: string; parameters?: unknown[] }> = [];
  const partialPlan: ProductionPlan = {
    month: "2026-08",
    schedules: {
      forming: {
        monthlyPlan: 90,
        workingDayCount: 2,
        dailyPlans: [
          { date: "2026-08-03", value: 45 },
          { date: "2026-08-04", value: 45 },
        ],
      },
    },
  };
  const pool = buildPool(queries, {
    id: "partial-revision",
    plan_month: "2026-08",
    monthly_plans: JSON.stringify({ forming: 90 }),
    working_dates: JSON.stringify(["2026-08-03", "2026-08-04"]),
    category_daily_plans: JSON.stringify({
      forming: [
        { date: "2026-08-03", value: 45 },
        { date: "2026-08-04", value: 45 },
      ],
    }),
    created_by_user_id: "economist-user",
    created_at: "2026-07-18T10:00:00.000Z",
  });
  const repository = createProductionPlansRepository(pool, {
    createId: () => "partial-revision",
    now: () => new Date("2026-07-18T10:00:00.000Z"),
  });

  const saved = await repository.saveRevision({
    plan: partialPlan,
    createdByUserId: "economist-user",
  });
  const latest = await repository.readLatestForUpdate("2026-08");

  assert.deepEqual(queries[0]?.parameters, [
    "partial-revision",
    "2026-08",
    JSON.stringify({ forming: 90 }),
    JSON.stringify(["2026-08-03", "2026-08-04"]),
    JSON.stringify({
      forming: [
        { date: "2026-08-03", value: 45 },
        { date: "2026-08-04", value: 45 },
      ],
    }),
    "economist-user",
  ]);
  assert.match(
    queries[1]?.sql ?? "",
    /insert into production_plan_month_locks .* on duplicate key update/u,
  );
  assert.match(
    queries[2]?.sql ?? "",
    /order by revision_sequence desc limit 1$/u,
  );
  assert.deepEqual(latest, saved);
});

test("production plans repository reads legacy revisions with one shared calendar", async () => {
  const queries: Array<{ sql: string; parameters?: unknown[] }> = [];
  const pool = buildPool(queries, {
    id: "legacy-revision",
    plan_month: "2026-07",
    monthly_plans: JSON.stringify({
      forming: 100,
      sorting: 80,
      unformed: 50,
      chamotte: 20,
    }),
    working_dates: JSON.stringify([
      "2026-07-01",
      "2026-07-02",
      "2026-07-03",
    ]),
    category_daily_plans: JSON.stringify([
      {
        date: "2026-07-01",
        values: { forming: 34, sorting: 27, unformed: 17, chamotte: 7 },
      },
      {
        date: "2026-07-02",
        values: { forming: 34, sorting: 27, unformed: 17, chamotte: 7 },
      },
      {
        date: "2026-07-03",
        values: { forming: 32, sorting: 26, unformed: 16, chamotte: 6 },
      },
    ]),
    created_by_user_id: "economist-user",
    created_at: "2026-07-17T10:00:00.000Z",
  });
  const repository = createProductionPlansRepository(pool);

  const latest = await repository.readLatest("2026-07");

  assert.equal(latest?.schedules.forming?.workingDayCount, 3);
  assert.deepEqual(latest?.schedules.chamotte?.dailyPlans, [
    { date: "2026-07-01", value: 7 },
    { date: "2026-07-02", value: 7 },
    { date: "2026-07-03", value: 6 },
  ]);
});

function buildPool(
  queries: Array<{ sql: string; parameters?: unknown[] }>,
  row: Record<string, unknown>,
) {
  return {
    async query(sql: string, parameters?: unknown[]) {
      queries.push({ sql: normalizeSql(sql), parameters });

      if (sql.includes("select id, plan_month")) {
        return [[row], []];
      }

      return [[], []];
    },
  } as unknown as DatabasePool;
}

function readMonthlyPlans(value: ProductionPlan) {
  return Object.fromEntries(
    Object.entries(value.schedules).map(([category, schedule]) => [
      category,
      schedule.monthlyPlan,
    ]),
  );
}

function readStoredDailyPlans(value: ProductionPlan) {
  return Object.fromEntries(
    Object.entries(value.schedules).map(([category, schedule]) => [
      category,
      schedule.dailyPlans,
    ]),
  );
}

function normalizeSql(sql: string) {
  return sql.replace(/\s+/g, " ").trim();
}
