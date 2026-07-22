import assert from "node:assert/strict";
import test from "node:test";
import type { DispatcherSubmission } from "./dispatcherSubmission.js";
import type { ProductionPlan } from "./productionPlan.js";
import {
  buildProductionMonthOverview,
  buildProductionMonthToDate,
  buildProductionReportTables,
} from "./productionReportTables.js";

test("buildProductionReportTables calculates server-owned production analytics", () => {
  const tables = buildProductionReportTables([
    buildSubmission("day-1", {
      reportDate: "01.07.2026",
      formingBrand1: "ФЛ-1",
      formingFact1: "8",
      sortingBrand1: "СО-1",
      sortingFact1: "5",
      unformedBrand1: "ПБ-5",
      unformedFact1: "2",
      chamotteBrand1: "Ш-1",
      chamotteFact1: "3",
      granulationFraction1600Day: "1.5",
      granulationSamplesDay: "2",
    }),
    buildSubmission("day-2", {
      reportDate: "02.07.2026",
      formingBrand1: "ФЛ-2",
      formingFact1: "6",
      formingBrand2: "ФЛ-3",
      formingFact2: "5",
      sortingBrand1: "СО-1",
      sortingFact1: "3",
      sortingBrand2: "СО-2",
      sortingFact2: "4",
      unformedBrand1: " пб-5 ",
      unformedFact1: "4",
      unformedBrand2: "ПБ-6",
      unformedFact2: "1",
      chamotteBrand1: "Ш-1",
      chamotteFact1: "5",
      jarStart1: "120",
      jarEnd1: "95",
      granulationPlatesInOperation: "2",
      granulationMillHours: "7.5",
      granulationFraction1630Day: "2.5",
      granulationFraction1218Day: "3",
    }),
  ], [productionPlan]);

  assert.deepEqual(tables.forming[1], {
    reportId: "day-2",
    reportDate: "2026-07-02",
    facts: [
      { brand: "ФЛ-2", value: 6, monthValue: 6 },
      { brand: "ФЛ-3", value: 5, monthValue: 5 },
    ],
    dayPlan: 10,
    dayFact: 11,
    monthPlan: 20,
    monthFact: 19,
    deviation: -1,
    receivedAt: "2026-07-02T18:00:00.000Z",
  });
  assert.deepEqual(tables.sorting[1], {
    reportId: "day-2",
    reportDate: "2026-07-02",
    facts: [
      { brand: "СО-1", value: 3, monthValue: 8 },
      { brand: "СО-2", value: 4, monthValue: 4 },
    ],
    dayPlan: 6,
    dayFact: 7,
    monthPlan: 12,
    monthFact: 12,
    deviation: 0,
    receivedAt: "2026-07-02T18:00:00.000Z",
  });
  assert.deepEqual(tables.unformed[1], {
    reportId: "day-2",
    reportDate: "2026-07-02",
    facts: [
      { brand: "ПБ-5", value: 4, monthValue: 6 },
      { brand: "ПБ-6", value: 1, monthValue: 1 },
    ],
    dayPlan: 7,
    dayFact: 5,
    monthPlan: 14,
    monthFact: 7,
    deviation: -7,
    receivedAt: "2026-07-02T18:00:00.000Z",
  });
  assert.equal(tables.chamotte[1]?.monthFact, 8);
  assert.equal(tables.jars[0]?.consumption, 25);
  assert.deepEqual(tables.granulation[1], {
    reportId: "day-2",
    reportDate: "2026-07-02",
    platesInOperation: 2,
    millHours: 7.5,
    fraction1630Day: 2.5,
    fraction1630Month: 4,
    fraction1218Day: 3,
    fraction1218Month: 5,
    receivedAt: "2026-07-02T18:00:00.000Z",
  });
});

test("buildProductionMonthToDate returns cumulative plan and fact before the edited day", () => {
  const values = buildProductionMonthToDate([
    buildSubmission("day-1", {
      reportDate: "01.07.2026",
      formingBrand1: "ФЛ-1",
      formingFact1: "8",
    }),
    buildSubmission("day-2", {
      reportDate: "02.07.2026",
      formingBrand1: "ФЛ-1",
      formingFact1: "11",
    }),
  ], productionPlan, "2026-07-02");

  assert.deepEqual(values.forming, {
    monthPlan: 20,
    monthFactBeforeDay: 8,
  });
});

test("buildProductionMonthToDate keeps monthly fact available without a plan", () => {
  const values = buildProductionMonthToDate([
    buildSubmission("day-1", {
      reportDate: "01.07.2026",
      unformedBrand1: "ПБ-5",
      unformedFact1: "5",
    }),
  ], undefined, "2026-07-02");

  assert.deepEqual(values.unformed, { monthFactBeforeDay: 5 });
});

test("buildProductionReportTables uses only the latest report for each date", () => {
  const tables = buildProductionReportTables([
    buildSubmission(
      "stale",
      { reportDate: "02.07.2026", formingDay: "100" },
      "2026-07-02T17:00:00.000Z",
    ),
    buildSubmission(
      "latest",
      { reportDate: "02.07.2026", formingDay: "11" },
      "2026-07-02T18:00:00.000Z",
    ),
  ], [productionPlan]);

  assert.equal(tables.forming.length, 1);
  assert.equal(tables.forming[0]?.reportId, "latest");
  assert.equal(tables.forming[0]?.monthFact, 11);
});

test("buildProductionMonthOverview totals the four production categories for the current month", () => {
  const tables = buildProductionReportTables([
    buildSubmission("june", {
      reportDate: "30.06.2026",
      formingDay: "100",
      sortingDay: "100",
    }),
    buildSubmission("day-1", {
      reportDate: "01.07.2026",
      formingDay: "8",
      sortingDay: "5",
      unformedBrand1: "ПБ-5",
      unformedFact1: "2",
      chamotteBrand1: "Ш-1",
      chamotteFact1: "3",
      granulationFraction1630Day: "50",
    }),
    buildSubmission("day-2", {
      reportDate: "02.07.2026",
      formingDay: "11",
      sortingDay: "7",
      unformedBrand1: "ПБ-5",
      unformedFact1: "5",
      chamotteBrand1: "Ш-1",
      chamotteFact1: "5",
      granulationFraction1630Day: "70",
    }),
  ]);

  assert.deepEqual(
    buildProductionMonthOverview(
      tables,
      new Date("2026-07-18T12:00:00.000Z"),
    ),
    {
      month: "2026-07",
      totalFact: 46,
    },
  );
});

const productionPlan: ProductionPlan = {
  month: "2026-07",
  schedules: {
    forming: {
      monthlyPlan: 30,
      workingDayCount: 3,
      dailyPlans: [
        { date: "2026-07-01", value: 10 },
        { date: "2026-07-02", value: 10 },
        { date: "2026-07-03", value: 10 },
      ],
    },
    sorting: {
      monthlyPlan: 18,
      workingDayCount: 3,
      dailyPlans: [
        { date: "2026-07-01", value: 6 },
        { date: "2026-07-02", value: 6 },
        { date: "2026-07-03", value: 6 },
      ],
    },
    unformed: {
      monthlyPlan: 21,
      workingDayCount: 3,
      dailyPlans: [
        { date: "2026-07-01", value: 7 },
        { date: "2026-07-02", value: 7 },
        { date: "2026-07-03", value: 7 },
      ],
    },
    chamotte: {
      monthlyPlan: 12,
      workingDayCount: 2,
      dailyPlans: [
        { date: "2026-07-02", value: 6 },
        { date: "2026-07-03", value: 6 },
      ],
    },
  },
};

function buildSubmission(
  id: string,
  payload: Record<string, string>,
  receivedAt = id === "day-1"
    ? "2026-07-01T18:00:00.000Z"
    : "2026-07-02T18:00:00.000Z",
): DispatcherSubmission {
  return {
    id,
    formId: "production",
    formTitle: "Выработка",
    payload,
    summary: id,
    status: "received",
    submittedByAccountId: "dispatcher",
    submittedAt: receivedAt,
    receivedAt,
  };
}
