import assert from "node:assert/strict";
import test from "node:test";
import type { DispatcherSubmission } from "./dispatcherSubmission.js";
import { buildProductionReportTables } from "./productionReportTables.js";

test("buildProductionReportTables calculates server-owned production analytics", () => {
  const tables = buildProductionReportTables([
    buildSubmission("day-1", {
      reportDate: "01.07.2026",
      formingPlan: "10",
      formingDay: "8",
      sortingPlan: "6",
      sortingDay: "5",
      unformedBrand1: "ПБ-5",
      unformedPlan1: "3",
      unformedFact1: "2",
      chamotteBrand1: "Ш-1",
      chamottePlan1: "4",
      chamotteFact1: "3",
      granulationFraction1600Day: "1.5",
      granulationSamplesDay: "2",
    }),
    buildSubmission("day-2", {
      reportDate: "02.07.2026",
      formingPlan: "10",
      formingDay: "11",
      sortingPlan: "6",
      sortingDay: "7",
      unformedBrand1: " пб-5 ",
      unformedPlan1: "3",
      unformedFact1: "4",
      chamotteBrand1: "Ш-1",
      chamottePlan1: "4",
      chamotteFact1: "5",
      jarStart1: "120",
      jarEnd1: "95",
      granulationPlatesInOperation: "2",
      granulationMillHours: "7.5",
      granulationFraction1630Day: "2.5",
      granulationFraction1218Day: "3",
    }),
  ]);

  assert.deepEqual(tables.forming[1], {
    reportId: "day-2",
    reportDate: "2026-07-02",
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
    brand: "ПБ-5",
    dayPlan: 3,
    dayFact: 4,
    monthPlan: 6,
    monthFact: 6,
    deviation: 0,
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

test("buildProductionReportTables uses only the latest report for each date", () => {
  const tables = buildProductionReportTables([
    buildSubmission(
      "stale",
      { reportDate: "02.07.2026", formingPlan: "100", formingDay: "100" },
      "2026-07-02T17:00:00.000Z",
    ),
    buildSubmission(
      "latest",
      { reportDate: "02.07.2026", formingPlan: "10", formingDay: "11" },
      "2026-07-02T18:00:00.000Z",
    ),
  ]);

  assert.equal(tables.forming.length, 1);
  assert.equal(tables.forming[0]?.reportId, "latest");
  assert.equal(tables.forming[0]?.monthFact, 11);
});

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
