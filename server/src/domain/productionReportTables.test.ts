import assert from "node:assert/strict";
import test from "node:test";
import type { DispatcherSubmission } from "./dispatcherSubmission.js";
import type { ProductionPlan } from "./productionPlan.js";
import {
  buildProductionMonthOverview,
  buildProductionMonthToDate,
  buildProductionReportTableTotals,
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

test("buildProductionReportTables keeps jar history from shipment-based values", () => {
  const tables = buildProductionReportTables([
    buildSubmission("august-shipment", {
      reportDate: "05.08.2026",
      jarShipmentStart1: "118.5",
      jarShipmentEnd1: "94",
    }),
  ]);

  assert.deepEqual(tables.jars, [
    {
      reportId: "august-shipment",
      reportDate: "2026-08-05",
      jarNumber: 1,
      start: undefined,
      end: undefined,
      consumption: undefined,
      shipmentStart: 118.5,
      shipmentEnd: 94,
      shipmentConsumption: 24.5,
      receivedAt: "2026-07-02T18:00:00.000Z",
    },
  ]);
  assert.deepEqual(buildProductionReportTableTotals(tables).jars, {
    rowCount: 1,
    start: undefined,
    end: undefined,
    consumption: undefined,
    shipmentStart: 118.5,
    shipmentEnd: 94,
    shipmentConsumption: 24.5,
  });
});

test("buildProductionReportTables sorts jar history by report date descending", () => {
  const tables = buildProductionReportTables([
    buildSubmission("august", {
      reportDate: "05.08.2026",
      jarShipmentStart1: "118.5",
      jarShipmentEnd1: "94",
    }),
    buildSubmission("july", {
      reportDate: "31.07.2026",
      jarStart1: "120",
      jarEnd1: "95",
    }),
  ]);

  assert.deepEqual(
    tables.jars.map((row) => row.reportDate),
    ["2026-08-05", "2026-07-31"],
  );
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

test("buildProductionMonthOverview returns month and today values for every overview category", () => {
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
      new Date("2026-07-02T12:00:00.000Z"),
    ),
    {
      month: "2026-07",
      totalFact: 46,
      forming: { monthFact: 19, todayFact: 11 },
      sorting: { monthFact: 12, todayFact: 7 },
      unformed: { monthFact: 7, todayFact: 5 },
      chamotte: { monthFact: 8, todayFact: 5 },
      granulation: { monthFact: 120, todayFact: 70 },
    },
  );
});

test("buildProductionMonthOverview starts a new Moscow month with zero values", () => {
  const tables = buildProductionReportTables([
    buildSubmission("july", {
      reportDate: "31.07.2026",
      formingDay: "8",
    }),
  ]);

  assert.deepEqual(
    buildProductionMonthOverview(
      tables,
      new Date("2026-07-31T22:30:00.000Z"),
    ),
    {
      month: "2026-08",
      totalFact: 0,
      forming: { monthFact: 0, todayFact: 0 },
      sorting: { monthFact: 0, todayFact: 0 },
      unformed: { monthFact: 0, todayFact: 0 },
      chamotte: { monthFact: 0, todayFact: 0 },
      granulation: { monthFact: 0, todayFact: 0 },
    },
  );
});

test("buildProductionMonthOverview uses the Moscow day after UTC evening", () => {
  const tables = buildProductionReportTables([
    buildSubmission("july-3", {
      reportDate: "03.07.2026",
      formingDay: "9",
    }),
  ]);

  assert.equal(
    buildProductionMonthOverview(
      tables,
      new Date("2026-07-02T22:30:00.000Z"),
    )?.forming.todayFact,
    9,
  );
});

test("buildProductionReportTableTotals returns server-owned totals for the visible report-date range", () => {
  const tables = buildProductionReportTables([
    buildSubmission("day-1", {
      reportDate: "01.07.2026",
      formingBrand1: "ФЛ-1",
      formingFact1: "8",
      granulationFraction1630Day: "1.5",
      granulationFraction1218Day: "2",
    }),
    buildSubmission("day-2", {
      reportDate: "02.07.2026",
      formingBrand1: "ФЛ-1",
      formingFact1: "11",
      jarStart1: "100",
      jarEnd1: "80",
      granulationPlatesInOperation: "2",
      granulationMillHours: "7.5",
      granulationFraction1630Day: "2.5",
      granulationFraction1218Day: "3",
    }),
    buildSubmission(
      "day-3",
      {
        reportDate: "03.07.2026",
        formingBrand1: "ФЛ-1",
        formingFact1: "7",
        jarStart1: "80",
        jarEnd1: "60",
        granulationPlatesInOperation: "3",
        granulationMillHours: "8",
        granulationFraction1630Day: "1",
        granulationFraction1218Day: "4",
      },
      "2026-07-03T18:00:00.000Z",
    ),
  ], [productionPlan]);

  const totals = buildProductionReportTableTotals(tables, {
    dateFrom: "2026-07-02",
    dateTo: "2026-07-03",
  });

  assert.deepEqual(totals.forming, {
    rowCount: 2,
    dayPlan: 20,
    dayFact: 18,
    monthPlan: 30,
    monthFact: 26,
    deviation: -4,
  });
  assert.deepEqual(totals.jars, {
    rowCount: 2,
    start: 180,
    end: 140,
    consumption: 40,
  });
  assert.deepEqual(totals.granulation, {
    rowCount: 2,
    platesInOperation: 5,
    millHours: 15.5,
    fraction1630Day: 3.5,
    fraction1630Month: 5,
    fraction1218Day: 7,
    fraction1218Month: 9,
  });
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
