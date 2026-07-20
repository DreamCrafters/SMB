import assert from "node:assert/strict";
import test from "node:test";
import {
  buildProductionCategoryPlan,
  buildProductionPlan,
  buildProductionPlanDatePresets,
} from "./productionPlan.js";

test("buildProductionPlanDatePresets offers all dates and Monday through Friday", () => {
  const presets = buildProductionPlanDatePresets("2026-07");

  assert.equal(presets.allDates.length, 31);
  assert.equal(presets.allDates[0], "2026-07-01");
  assert.equal(presets.allDates.at(-1), "2026-07-31");
  assert.equal(presets.weekdayDates.length, 23);
  assert.equal(presets.weekdayDates.includes("2026-07-04"), false);
});

test("buildProductionCategoryPlan validates and distributes one selected category", () => {
  const result = buildProductionCategoryPlan({
    month: "2026-07",
    category: "forming",
    schedule: {
      monthlyPlan: 100,
      workingDates: ["2026-07-03", "2026-07-01", "2026-07-02"],
    },
  });

  assert.deepEqual(result, {
    ok: true,
    category: "forming",
    schedule: {
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

test("buildProductionCategoryPlan keeps every day integer except the final decimal remainder", () => {
  const result = buildProductionCategoryPlan({
    month: "2026-07",
    category: "forming",
    schedule: {
      monthlyPlan: 100.1,
      workingDates: ["2026-07-01", "2026-07-02", "2026-07-03"],
    },
  });

  assert.deepEqual(result, {
    ok: true,
    category: "forming",
    schedule: {
      monthlyPlan: 100.1,
      workingDayCount: 3,
      dailyPlans: [
        { date: "2026-07-01", value: 34 },
        { date: "2026-07-02", value: 34 },
        { date: "2026-07-03", value: 32.1 },
      ],
    },
  });
});

test("buildProductionCategoryPlan rejects more than two decimal places", () => {
  assert.deepEqual(
    buildProductionCategoryPlan({
      month: "2026-07",
      category: "forming",
      schedule: {
        monthlyPlan: 100.123,
        workingDates: ["2026-07-01"],
      },
    }),
    {
      ok: false,
      errors: [
        "Укажите положительный месячный план максимум с двумя знаками после запятой для категории «Формовка».",
      ],
    },
  );
});

test("buildProductionPlan distributes every category over its own confirmed dates", () => {
  const result = buildProductionPlan({
    month: "2026-07",
    schedules: {
      forming: {
        monthlyPlan: 100,
        workingDates: ["2026-07-03", "2026-07-01", "2026-07-02"],
      },
      sorting: {
        monthlyPlan: 80,
        workingDates: ["2026-07-01", "2026-07-02"],
      },
      unformed: {
        monthlyPlan: 50,
        workingDates: ["2026-07-04"],
      },
      chamotte: {
        monthlyPlan: 20,
        workingDates: ["2026-07-02", "2026-07-04"],
      },
    },
  });

  assert.deepEqual(result, {
    ok: true,
    plan: {
      month: "2026-07",
      schedules: {
        forming: {
          monthlyPlan: 100,
          workingDayCount: 3,
          dailyPlans: [
            { date: "2026-07-01", value: 34 },
            { date: "2026-07-02", value: 34 },
            { date: "2026-07-03", value: 32 },
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
    },
  });
});

test("buildProductionPlan validates dates and remainder inside the affected category", () => {
  const validSchedules = {
    forming: { monthlyPlan: 100, workingDates: ["2026-07-01"] },
    sorting: { monthlyPlan: 80, workingDates: ["2026-07-01"] },
    unformed: { monthlyPlan: 50, workingDates: ["2026-07-01"] },
    chamotte: { monthlyPlan: 20, workingDates: ["2026-07-01"] },
  };

  assert.deepEqual(
    buildProductionPlan({
      month: "2026-07",
      schedules: {
        ...validSchedules,
        sorting: {
          monthlyPlan: 80,
          workingDates: ["2026-07-01", "2026-08-03"],
        },
      },
    }),
    {
      ok: false,
      errors: [
        "Все рабочие дни категории «Сортировка» должны относиться к выбранному месяцу.",
      ],
    },
  );
  assert.deepEqual(
    buildProductionPlan({
      month: "2026-07",
      schedules: {
        ...validSchedules,
        chamotte: {
          monthlyPlan: 1,
          workingDates: ["2026-07-01", "2026-07-02", "2026-07-03"],
        },
      },
    }),
    {
      ok: false,
      errors: [
        "Месячный план категории «Цех обжига шамота» слишком мал для выбранного количества рабочих дней.",
      ],
    },
  );
});

test("buildProductionPlan requires a plan and at least one date for every category", () => {
  const validSchedules = {
    forming: { monthlyPlan: 100, workingDates: ["2026-07-01"] },
    sorting: { monthlyPlan: 80, workingDates: ["2026-07-01"] },
    unformed: { monthlyPlan: 50, workingDates: ["2026-07-01"] },
    chamotte: { monthlyPlan: 20, workingDates: ["2026-07-01"] },
  };

  assert.deepEqual(
    buildProductionPlan({
      month: "2026-07",
      schedules: {
        ...validSchedules,
        chamotte: { monthlyPlan: 0, workingDates: ["2026-07-01"] },
      },
    }),
    {
      ok: false,
      errors: [
        "Укажите положительный месячный план максимум с двумя знаками после запятой для категории «Цех обжига шамота».",
      ],
    },
  );
  assert.deepEqual(
    buildProductionPlan({
      month: "2026-07",
      schedules: {
        ...validSchedules,
        unformed: { monthlyPlan: 50, workingDates: [] },
      },
    }),
    {
      ok: false,
      errors: [
        "Выберите хотя бы один рабочий день для категории «Неформованная продукция, контейнеры».",
      ],
    },
  );
});
