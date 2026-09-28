import assert from "node:assert/strict";
import test from "node:test";
import { buildAssignmentOverviewSummary } from "./assignmentOverview.js";

const period = { monthStart: "2026-09-01", today: "2026-09-28" };

test("overview counts executions for all time and for due dates since month start", () => {
  const summary = buildAssignmentOverviewSummary({
    period,
    liveRows: [
      // Recurring: two accepted periods in snapshots, current one overdue this month.
      { id: "monthly", status: "in_progress", currentOccurrenceDate: "2026-09-10" },
      // One-time completed with its own snapshot: counted once.
      { id: "once-done", status: "completed", currentOccurrenceDate: "2026-09-05" },
      // Legacy completed row without a snapshot still counts as completed.
      { id: "legacy-done", status: "completed", currentOccurrenceDate: "2026-06-01" },
      // Overdue before this month.
      { id: "old-overdue", status: "revision_requested", currentOccurrenceDate: "2026-08-20" },
      // Under review is not overdue even with a past due date.
      { id: "review", status: "under_review", currentOccurrenceDate: "2026-09-02" },
      // Due today is not overdue yet; due later this month is outside the window.
      { id: "today", status: "in_progress", currentOccurrenceDate: "2026-09-28" },
      { id: "later", status: "in_progress", currentOccurrenceDate: "2026-09-30" },
    ],
    completions: [
      { assignmentId: "monthly", occurrenceDate: "2026-07-10" },
      { assignmentId: "monthly", occurrenceDate: "2026-08-10" },
      { assignmentId: "once-done", occurrenceDate: "2026-09-05" },
    ],
  });

  assert.deepEqual(summary, {
    total: 9,
    completed: 4,
    overdue: 2,
    month: { total: 4, completed: 1, overdue: 1 },
  });
});

test("overview of an empty register is all zeros", () => {
  assert.deepEqual(
    buildAssignmentOverviewSummary({ period, liveRows: [], completions: [] }),
    {
      total: 0,
      completed: 0,
      overdue: 0,
      month: { total: 0, completed: 0, overdue: 0 },
    },
  );
});
