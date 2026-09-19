import assert from "node:assert/strict";
import test from "node:test";
import type { DirectorAssignment } from "../contracts/directorAssignments.js";
import { directorAssignmentReminderDays } from "./directorAssignmentReminders.js";

const assignment = { assignedOn: "2026-09-01", currentOccurrenceDate: "2026-09-10", status: "in_progress", needsClarification: false } as DirectorAssignment;
test("reminders use calendar days and distinguish ten-day and longer assignments", () => {
  assert.equal(directorAssignmentReminderDays(assignment, "2026-09-03"), undefined);
  for (const day of [1, 2, 3]) assert.equal(directorAssignmentReminderDays(assignment, `2026-09-0${10 - day}`), day);
  assert.equal(directorAssignmentReminderDays({ ...assignment, currentOccurrenceDate: "2026-09-11" }, "2026-09-04"), 7);
  assert.equal(directorAssignmentReminderDays(assignment, "2026-09-10"), undefined);
  assert.equal(directorAssignmentReminderDays(assignment, "2026-09-11"), undefined);
});
test("reviewed, completed, unclear, future-created and invalid assignments are skipped", () => {
  for (const status of ["under_review", "completed"] as const) assert.equal(directorAssignmentReminderDays({ ...assignment, status }, "2026-09-09"), undefined);
  assert.equal(directorAssignmentReminderDays({ ...assignment, status: "revision_requested" }, "2026-09-09"), 1);
  assert.equal(directorAssignmentReminderDays({ ...assignment, needsClarification: true }, "2026-09-09"), undefined);
  assert.equal(directorAssignmentReminderDays({ ...assignment, assignedOn: "2026-09-10" }, "2026-09-09"), undefined);
  assert.equal(directorAssignmentReminderDays({ ...assignment, currentOccurrenceDate: "2026-02-30" }, "2026-02-27"), undefined);
});
