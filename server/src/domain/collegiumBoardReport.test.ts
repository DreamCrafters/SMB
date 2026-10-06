import assert from "node:assert/strict";
import test from "node:test";
import type { CollegiumInitiative, CollegiumInitiativeRevision } from "../contracts/collegiumInitiatives.js";
import type { DirectorAssignment } from "../contracts/directorAssignments.js";
import { buildCollegiumBoardReport, readCollegiumQuarter } from "./collegiumBoardReport.js";
import { unsetCollegiumSettings } from "./collegiumEconomics.js";
import { CollegiumInitiativeError } from "./collegiumInitiative.js";

test("quarters have Moscow calendar bounds and default to the current one", () => {
  assert.deepEqual(readCollegiumQuarter("2026-Q4", "2026-10-06"), { quarter: "2026-Q4", from: "2026-10-01", to: "2026-12-31" });
  assert.deepEqual(readCollegiumQuarter(null, "2026-05-20"), { quarter: "2026-Q2", from: "2026-04-01", to: "2026-06-30" });
  assert.equal(readCollegiumQuarter("2028-Q1", "2026-01-01").to, "2028-03-31");
  assert.throws(() => readCollegiumQuarter("2026-Q5", "2026-01-01"), CollegiumInitiativeError);
});

const card = (title: string, overrides: Record<string, unknown> = {}) => ({
  title, expectedEffectAmount: "100.00", expectedEffectPeriod: "month", oneTimeCostAmount: "", recurringCostAmount: "",
  recurringCostPeriod: "", capexAmount: "", risks: [], plannedStart: "", plannedResult: "", effectControllerId: "",
  ...overrides,
}) as unknown as CollegiumInitiative["card"];

function revision(number: number, createdAt: string, status: CollegiumInitiative["status"], extra: Partial<CollegiumInitiativeRevision> = {}) {
  return { revision: number, createdAt, authorDisplayName: "", status, changedFields: [], reason: "", comment: "", card: card("x"), ...extra } as CollegiumInitiativeRevision;
}

test("the report reads each initiative as of the quarter end and counts the quarter's events", () => {
  const approvedCard = card("Новая горелка", { risks: [{ text: "Срыв поставок", levelCode: "high", levelLabel: "Высокий" }] });
  const approved = {
    id: "a", number: "И-2026-0001", status: "closed", card: approvedCard, workflow: {},
  } as unknown as CollegiumInitiative;
  const confirmedEffects = [{ effectId: "main", label: "Эффект", plannedAnnual: "1200.00", actualAmount: "900.00", status: "confirmed" as const, shareBp: 10000, verdicts: {} }];
  const result = { description: "", actualEffectAmount: "", source: "", conclusion: "" as const, recordedAt: "", recordedByDisplayName: "" };
  const confirmed = {
    id: "b", number: "И-2026-0002", status: "done_confirmed", card: card("Обучение"), workflow: {},
  } as unknown as CollegiumInitiative;
  const legacy = {
    id: "c", number: "И-2026-0003", status: "done_confirmed", card: card("Старый учёт"),
    workflow: { effectConfirmation: { confirmedByDisplayName: "", confirmedAt: "2026-11-10T09:00:00.000Z", result: { ...result, actualEffectAmount: "50.00" } } },
  } as unknown as CollegiumInitiative;
  const future = { id: "d", number: "И-2027-0001", status: "draft", card: card("Будущая"), workflow: {} } as unknown as CollegiumInitiative;
  const revisions = new Map<string, CollegiumInitiativeRevision[]>([
    ["a", [
      revision(1, "2026-08-01T09:00:00.000Z", "preliminary_review"),
      revision(2, "2026-10-20T09:00:00.000Z", "approved_implementation", {
        card: approvedCard, event: { action: "meeting_decision", fromStatus: "in_discussion", toStatus: "approved_implementation" },
      }),
      // After the quarter: must not change the report.
      revision(3, "2027-01-10T09:00:00.000Z", "closed", { card: approvedCard, event: { action: "close", fromStatus: "approved_implementation", toStatus: "closed" } }),
    ]],
    ["b", [
      revision(1, "2026-09-01T09:00:00.000Z", "result_confirmation", {
        card: card("Обучение"),
        effectSnapshot: { effectFacts: { main: { actualAmount: "900.00", period: "", sources: "", calculation: "", version: 1, recordedByUserId: "", recordedByDisplayName: "", recordedAt: "", verdicts: {} } } },
      }),
      revision(2, "2026-12-30T20:30:00.000Z", "done_confirmed", {
        card: card("Обучение"),
        event: { action: "confirm_effect", fromStatus: "result_confirmation", toStatus: "done_confirmed" },
        // A snapshot always carries the whole effect-control state.
        effectSnapshot: {
          effectFacts: { main: { actualAmount: "900.00", period: "", sources: "", calculation: "", version: 1, recordedByUserId: "", recordedByDisplayName: "", recordedAt: "", verdicts: {} } },
          effectConfirmation: { confirmedByDisplayName: "", confirmedAt: "", result, effects: confirmedEffects },
        },
      }),
    ]],
    ["c", [revision(1, "2026-11-10T09:00:00.000Z", "done_confirmed", { card: card("Старый учёт") })]],
    // 2026-12-31 21:30 UTC is already 2027-01-01 in Moscow.
    ["d", [revision(1, "2026-12-31T21:30:00.000Z", "preliminary_review")]],
  ]);
  const assignments = [
    { number: "К-1", summary: "Закупка", status: "in_progress", currentOccurrenceDate: "2026-11-01", importance: " Высокая ", sourceInitiativeId: "a" },
    { number: "К-2", summary: "Обучение", status: "completed", currentOccurrenceDate: "2026-11-01", completedOn: "2026-11-15", importance: "", sourceInitiativeId: "b" },
    { number: "К-3", summary: "Отчёт", status: "completed", currentOccurrenceDate: "2026-12-01", completedOn: "2027-01-15", importance: "обычная", sourceInitiativeId: "b" },
  ] as unknown as DirectorAssignment[];

  const report = buildCollegiumBoardReport({
    period: readCollegiumQuarter("2026-Q4", "2027-02-01"),
    today: "2027-02-01",
    initiatives: [approved, confirmed, legacy, future],
    revisions,
    assignments,
    settings: { ...unsetCollegiumSettings, criticalImportance: ["высокая"] },
    reference: { direction: [], effect_type: [], risk_level: [{ code: "high", label: "Высокий" }], site: [], kpi: [] },
  });
  assert.equal(report.asOf, "2026-12-31");
  assert.equal(report.total, 3);
  assert.deepEqual([report.approved, report.implemented, report.rejected, report.suspended], [1, 1, 0, 0]);
  // Planned: the approved initiative's 1 200/year (it was approved, not closed, at the quarter end).
  assert.equal(report.plannedEffect, "3600.00");
  assert.equal(report.confirmedEffect, "950.00");
  assert.deepEqual(report.keyImplemented.map(({ number, confirmedEffect }) => [number, confirmedEffect]), [
    ["И-2026-0002", "900.00"], ["И-2026-0003", "50.00"],
  ]);
  assert.deepEqual(report.deviations.map(({ number, deviationAmount }) => [number, deviationAmount]), [["И-2026-0002", "-300.00"]]);
  assert.deepEqual(report.keyRisks.map(({ number, levelLabel }) => [number, levelLabel]), [["И-2026-0001", "Высокий"]]);
  // Overdue at the quarter end: open, or completed only after it; critical first.
  assert.deepEqual(report.overdueAssignments.map(({ number, critical }) => [number, critical]), [["К-1", true], ["К-3", false]]);
});
