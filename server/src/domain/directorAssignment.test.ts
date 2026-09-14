import assert from "node:assert/strict";
import test from "node:test";
import { canExecuteDirectorAssignment, directorWorkdays, readDirectorAssignmentInput } from "./directorAssignment.js";
import type { DirectorAssignment } from "../contracts/directorAssignments.js";

test("execution belongs to the linked user and requires an active occurrence", () => {
  const assignment = {
    responsible: { userId: "employee-a", fullName: "Сотрудник" },
    coExecutors: [],
    status: "in_progress",
    currentOccurrenceDate: "2026-09-14",
    activeFrom: "2026-09-14",
    activeTo: "2026-09-14",
    needsClarification: false,
  } as unknown as DirectorAssignment;
  assert.equal(canExecuteDirectorAssignment(assignment, "employee-a", "2026-09-14"), true);
  assert.equal(canExecuteDirectorAssignment(assignment, "employee-b", "2026-09-14"), false);
  assert.equal(canExecuteDirectorAssignment(assignment, "employee-a", "2026-09-13"), false);
  assert.equal(canExecuteDirectorAssignment({ ...assignment, status: "under_review" }, "employee-a", "2026-09-14"), false);
});

test("workday counters include weekdays at both ends and handle overdue dates", () => {
  assert.equal(directorWorkdays("2026-08-05", "2026-08-21"), 13);
  assert.equal(directorWorkdays("2026-09-14", "2026-08-21"), -17);
  assert.equal(directorWorkdays("2026-09-12", "2026-09-13"), 0);
  assert.equal(directorWorkdays("2026-02-30", "2026-09-14"), undefined);
});

test("assignment input rejects unknown fields, invalid dates and duplicate responsibility", () => {
  const input = { assignedOn: "2026-09-14", kind: "Поручение", summary: "Проверить отчёт", department: "", project: "", responsibleId: "one", coExecutorIds: [], recurrence: "once", activeFrom: "2026-09-15", activeTo: "2026-09-15", urgency: "", importance: "", note: "", progress: "", incomingNumber: "", sourceBoardAssignmentId: null };
  assert.equal(readDirectorAssignmentInput(input).summary, "Проверить отчёт");
  assert.throws(() => readDirectorAssignmentInput({ ...input, status: "completed" }));
  assert.throws(() => readDirectorAssignmentInput({ ...input, assignedOn: "2026-02-30" }));
  assert.throws(() => readDirectorAssignmentInput({ ...input, coExecutorIds: ["one"] }));
  assert.throws(() => readDirectorAssignmentInput({ ...input, activeTo: "2026-09-14" }));
});
