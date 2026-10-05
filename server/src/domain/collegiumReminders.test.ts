import assert from "node:assert/strict";
import test from "node:test";
import type { CollegiumInitiative, CollegiumMeeting } from "../contracts/collegiumInitiatives.js";
import type { DirectorAssignment } from "../contracts/directorAssignments.js";
import {
  effectiveDueDate,
  firstWorkdayAfter,
  isWorkday,
  listCollegiumReminders,
  workdaysBefore,
} from "./collegiumReminders.js";

// 2026-10-09 is a Friday, 2026-10-12 a Monday.
test("workday arithmetic around a weekend", () => {
  assert.equal(isWorkday("2026-10-09"), true);
  assert.equal(isWorkday("2026-10-10"), false);
  assert.equal(effectiveDueDate("2026-10-11"), "2026-10-09");
  assert.equal(effectiveDueDate("2026-10-12"), "2026-10-12");
  assert.equal(workdaysBefore("2026-10-12", 1), "2026-10-09");
  assert.equal(workdaysBefore("2026-10-12", 2), "2026-10-08");
  assert.equal(workdaysBefore("2026-10-14", 2), "2026-10-12");
  assert.equal(firstWorkdayAfter("2026-10-09"), "2026-10-12");
  assert.equal(firstWorkdayAfter("2026-10-11"), "2026-10-12");
  assert.equal(firstWorkdayAfter("2026-10-12"), "2026-10-13");
});

function initiative(overrides: Partial<CollegiumInitiative> = {}): CollegiumInitiative {
  return {
    id: "i-1", number: "И-2026-0001", status: "rework", revision: 3, createdByUserId: "author",
    createdAt: "", updatedAt: "",
    workflow: {
      submittedAt: "2026-10-01T00:00:00.000Z",
      rework: { remarks: ["x"], responsibleId: "account:author", dueDate: "2026-10-12", readinessCriterion: "y", requestedByDisplayName: "s", requestedAt: "2026-10-05T09:00:00.000Z" },
    },
    card: { title: "Идея", ownerId: "account:owner", initiatorId: "account:author" } as CollegiumInitiative["card"],
    ...overrides,
  };
}

const run = (today: string, data: Partial<Parameters<typeof listCollegiumReminders>[0]> = {}) =>
  listCollegiumReminders({ today, initiatives: [initiative()], meetings: [], assignments: [], ...data });

test("rework reminders fall on workdays before the due date and once on the overdue day", () => {
  assert.deepEqual(run("2026-10-08").map(({ kind, offset, userIds }) => [kind, offset, userIds]), [["rework", 2, ["author"]]]);
  assert.deepEqual(run("2026-10-09").map(({ offset }) => offset), [1]);
  // Weekends never send, and Monday (the due date itself) is not a reminder day.
  assert.deepEqual(run("2026-10-10"), []);
  assert.deepEqual(run("2026-10-12"), []);
  assert.deepEqual(run("2026-10-13").map(({ offset, subject }) => [offset, subject]), [[-1, "И-2026-0001: срок доработки истёк"]]);
  assert.deepEqual(run("2026-10-14"), []);
  // The cycle key separates a second return with the same due date.
  assert.equal(run("2026-10-08")[0].cycle, "2026-10-05T09:00:00.000Z");
  // Nothing once the initiative left rework.
  assert.deepEqual(run("2026-10-08", { initiatives: [initiative({ status: "preliminary_review" })] }), []);
});

test("materials reminders cover planned meetings only and escalations fire once", () => {
  const meeting = {
    id: "m-1", number: "КЗ-2026-01", status: "planned", meetingDate: "2026-10-14", meetingTime: "10:00",
    items: [
      { id: "item-1", order: 1, initiativeId: "i-1", initiativeNumber: "И-2026-0001", snapshot: { revision: 3, card: { title: "Идея", initiatorId: "account:author", ownerId: "account:owner" } }, speakerId: "account:speaker", participantIds: [], durationMinutes: 15 },
      { id: "item-2", order: 2, initiativeId: "i-2", initiativeNumber: "И-2026-0002", snapshot: { revision: 1, card: { title: "Снятая" } }, speakerId: "", participantIds: [], durationMinutes: 15, removedAt: "2026-10-06T00:00:00.000Z" },
    ],
  } as unknown as CollegiumMeeting;
  const reminders = run("2026-10-12", { initiatives: [], meetings: [meeting] });
  assert.deepEqual(reminders.map(({ kind, subjectId, offset, userIds }) => [kind, subjectId, offset, userIds]), [
    ["materials", "item-1", 2, ["author", "owner", "speaker"]],
  ]);
  assert.deepEqual(run("2026-10-12", { initiatives: [], meetings: [{ ...meeting, status: "cancelled" }] }), []);

  const assignments = [
    { id: "a-1", number: "К-1", status: "in_progress", currentOccurrenceDate: "2026-10-09", sourceInitiativeId: "i-1" },
    { id: "a-2", number: "К-2", status: "in_progress", currentOccurrenceDate: "2026-10-01", sourceInitiativeId: "i-1" },
    { id: "a-3", number: "К-3", status: "completed", currentOccurrenceDate: "2026-10-09", sourceInitiativeId: "i-1" },
  ] as unknown as DirectorAssignment[];
  const escalations = run("2026-10-12", { initiatives: [initiative({ status: "in_progress" })], assignments });
  assert.deepEqual(escalations.map(({ kind, subjectId, userIds, audienceCapability }) => [kind, subjectId, userIds, audienceCapability]), [
    ["escalation", "a-1", ["owner"], "business.approve_collegium_initiatives"],
  ]);
  assert.match(escalations[0].subject, /повторная просрочка/u);
  // The older overdue assignment is not re-escalated every day.
  assert.deepEqual(run("2026-10-13", { initiatives: [initiative({ status: "in_progress" })], assignments }), []);
});
