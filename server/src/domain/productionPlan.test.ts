import assert from "node:assert/strict";
import test from "node:test";
import {
  buildProductionPlan,
  buildSuggestedProductionWorkdays,
} from "./productionPlan.js";

test("buildSuggestedProductionWorkdays proposes Monday through Friday dates", () => {
  const workdays = buildSuggestedProductionWorkdays("2026-07");

  assert.equal(workdays.length, 23);
  assert.equal(workdays[0], "2026-07-01");
  assert.equal(workdays.at(-1), "2026-07-31");
  assert.equal(workdays.includes("2026-07-04"), false);
});

test("buildProductionPlan rounds up every confirmed workday except the last", () => {
  const result = buildProductionPlan({
    month: "2026-07",
    monthlyPlan: 100,
    workingDates: ["2026-07-03", "2026-07-01", "2026-07-02"],
  });

  assert.deepEqual(result, {
    ok: true,
    plan: {
      month: "2026-07",
      monthlyPlan: 100,
      workingDayCount: 3,
      dailyPlans: [
        { date: "2026-07-01", value: 34 },
        { date: "2026-07-02", value: 34 },
        { date: "2026-07-03", value: 32 },
      ],
    },
  });
});

test("buildProductionPlan rejects dates outside the month and a negative remainder", () => {
  assert.deepEqual(
    buildProductionPlan({
      month: "2026-07",
      monthlyPlan: 100,
      workingDates: ["2026-07-01", "2026-08-03"],
    }),
    { ok: false, errors: ["Все рабочие дни должны относиться к выбранному месяцу."] },
  );
  assert.deepEqual(
    buildProductionPlan({
      month: "2026-07",
      monthlyPlan: 1,
      workingDates: ["2026-07-01", "2026-07-02", "2026-07-03"],
    }),
    { ok: false, errors: ["Месячный план слишком мал для выбранного количества рабочих дней."] },
  );
});
