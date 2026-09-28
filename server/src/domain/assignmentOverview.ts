import type { BoardAssignmentStatus } from "../contracts/assignmentStates.js";
import { isBoardAssignmentOverdueOn } from "./boardAssignment.js";

export type AssignmentOverviewCounts = {
  total: number;
  completed: number;
  overdue: number;
};

export type AssignmentOverviewSummary = AssignmentOverviewCounts & {
  month: AssignmentOverviewCounts;
};

export type AssignmentOverviewLiveRow = {
  id: string;
  status: BoardAssignmentStatus;
  currentOccurrenceDate: string;
};

export type AssignmentOverviewCompletion = {
  assignmentId: string;
  occurrenceDate: string;
};

/**
 * Counts executions, not registry rows: every accepted period of a recurring
 * assignment is one completed execution, the live row is the open one. A
 * completed live row without its own snapshot (legacy data) still counts once.
 */
export function buildAssignmentOverviewSummary({
  liveRows,
  completions,
  period,
}: {
  liveRows: AssignmentOverviewLiveRow[];
  completions: AssignmentOverviewCompletion[];
  period: { monthStart: string; today: string };
}): AssignmentOverviewSummary {
  const completedKeys = new Set(
    completions.map(({ assignmentId, occurrenceDate }) =>
      executionKey(assignmentId, occurrenceDate)
    ),
  );
  const executions: Array<{ occurrenceDate: string; completed: boolean; overdue: boolean }> =
    Array.from(completedKeys, (key) => ({
      occurrenceDate: key.slice(key.lastIndexOf("|") + 1),
      completed: true,
      overdue: false,
    }));

  for (const row of liveRows) {
    if (row.status === "completed") {
      if (!completedKeys.has(executionKey(row.id, row.currentOccurrenceDate))) {
        executions.push({
          occurrenceDate: row.currentOccurrenceDate,
          completed: true,
          overdue: false,
        });
      }
      continue;
    }
    executions.push({
      occurrenceDate: row.currentOccurrenceDate,
      completed: false,
      overdue: isBoardAssignmentOverdueOn(row, period.today),
    });
  }

  const monthExecutions = executions.filter(({ occurrenceDate }) =>
    occurrenceDate >= period.monthStart && occurrenceDate <= period.today
  );

  return {
    ...countExecutions(executions),
    month: countExecutions(monthExecutions),
  };
}

function countExecutions(
  executions: Array<{ completed: boolean; overdue: boolean }>,
): AssignmentOverviewCounts {
  return {
    total: executions.length,
    completed: executions.filter(({ completed }) => completed).length,
    overdue: executions.filter(({ overdue }) => overdue).length,
  };
}

function executionKey(assignmentId: string, occurrenceDate: string) {
  return `${assignmentId}|${occurrenceDate}`;
}
