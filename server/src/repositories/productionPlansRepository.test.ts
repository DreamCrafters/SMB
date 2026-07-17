import assert from "node:assert/strict";
import test from "node:test";
import type { DatabasePool } from "../db/pool.js";
import { createProductionPlansRepository } from "./productionPlansRepository.js";

test("production plans repository appends a revision and reads the latest month plan", async () => {
  const queries: Array<{ sql: string; parameters?: unknown[] }> = [];
  const pool = {
    async query(sql: string, parameters?: unknown[]) {
      queries.push({ sql: normalizeSql(sql), parameters });

      if (sql.includes("select id, plan_month")) {
        return [[{
          id: "revision-1",
          plan_month: "2026-07",
          monthly_plans: JSON.stringify({
            forming: 100,
            sorting: 80,
            unformed: 50,
            chamotte: 20,
          }),
          working_dates: JSON.stringify(["2026-07-01", "2026-07-02", "2026-07-03"]),
          category_daily_plans: JSON.stringify([
            { date: "2026-07-01", values: { forming: 34, sorting: 27, unformed: 17, chamotte: 7 } },
            { date: "2026-07-02", values: { forming: 34, sorting: 27, unformed: 17, chamotte: 7 } },
            { date: "2026-07-03", values: { forming: 32, sorting: 26, unformed: 16, chamotte: 6 } },
          ]),
          created_by_user_id: "economist-user",
          created_at: "2026-07-17T10:00:00.000Z",
        }], []];
      }

      return [[], []];
    },
  } as unknown as DatabasePool;
  const repository = createProductionPlansRepository(pool, {
    createId: () => "revision-1",
    now: () => new Date("2026-07-17T10:00:00.000Z"),
  });

  const saved = await repository.saveRevision({
    plan: {
      month: "2026-07",
      monthlyPlans: {
        forming: 100,
        sorting: 80,
        unformed: 50,
        chamotte: 20,
      },
      workingDayCount: 3,
      dailyPlans: [
        { date: "2026-07-01", values: { forming: 34, sorting: 27, unformed: 17, chamotte: 7 } },
        { date: "2026-07-02", values: { forming: 34, sorting: 27, unformed: 17, chamotte: 7 } },
        { date: "2026-07-03", values: { forming: 32, sorting: 26, unformed: 16, chamotte: 6 } },
      ],
    },
    createdByUserId: "economist-user",
  });
  const latest = await repository.readLatest("2026-07");

  assert.equal(saved.revisionId, "revision-1");
  assert.deepEqual(queries[0]?.parameters, [
    "revision-1",
    "2026-07",
    JSON.stringify({ forming: 100, sorting: 80, unformed: 50, chamotte: 20 }),
    JSON.stringify(["2026-07-01", "2026-07-02", "2026-07-03"]),
    JSON.stringify([
      { date: "2026-07-01", values: { forming: 34, sorting: 27, unformed: 17, chamotte: 7 } },
      { date: "2026-07-02", values: { forming: 34, sorting: 27, unformed: 17, chamotte: 7 } },
      { date: "2026-07-03", values: { forming: 32, sorting: 26, unformed: 16, chamotte: 6 } },
    ]),
    "economist-user",
  ]);
  assert.deepEqual(latest, saved);
});

function normalizeSql(sql: string) {
  return sql.replace(/\s+/g, " ").trim();
}
