import assert from "node:assert/strict";
import test from "node:test";
import type { CollegiumInitiative, CollegiumMeeting } from "../contracts/collegiumInitiatives.js";
import type { DirectorAssignment } from "../contracts/directorAssignments.js";
import { buildCollegiumDashboard } from "./collegiumDashboard.js";

let sequence = 0;
function initiative(
  status: CollegiumInitiative["status"],
  card: Partial<CollegiumInitiative["card"]> = {},
  workflow: CollegiumInitiative["workflow"] = {},
): CollegiumInitiative {
  sequence += 1;
  return {
    id: `i-${sequence}`, number: `И-2026-${String(sequence).padStart(4, "0")}`, status, revision: 1,
    createdByUserId: "author", createdAt: "", updatedAt: "", workflow,
    card: { title: `Идея ${sequence}`, directionLabel: "", expectedEffectAmount: "", risks: [], ...card } as CollegiumInitiative["card"],
  };
}

test("dashboard counts stages, sums effect exactly and ranks the top lists", () => {
  sequence = 0;
  const result = { description: "", actualEffectAmount: "100.10" } as NonNullable<CollegiumInitiative["workflow"]["result"]>;
  const initiatives = [
    initiative("preliminary_review", { expectedEffectAmount: "999999.00" }),
    initiative("rework", {}, { rework: { dueDate: "2026-10-01" } as CollegiumInitiative["workflow"]["rework"] }),
    initiative("rework", {}, { rework: { dueDate: "2026-10-09" } as CollegiumInitiative["workflow"]["rework"] }),
    initiative("approved_pilot", { directionLabel: "Энергия", expectedEffectAmount: "0.10", risks: ["Сбой поставки"] }),
    initiative("in_progress", { directionLabel: "Энергия", expectedEffectAmount: "0.20" }, { lastDecision: { decision: "pilot" } as CollegiumInitiative["workflow"]["lastDecision"] }),
    initiative("in_progress", { directionLabel: "Сырьё", expectedEffectAmount: "500.00", risks: ["Рост цен", "Простой"] }),
    initiative("done_confirmed", { directionLabel: "Сырьё", expectedEffectAmount: "300.00" }, {
      result,
      effectConfirmation: { confirmedByDisplayName: "Контролёр", confirmedAt: "", result },
    }),
    initiative("done_unconfirmed", { expectedEffectAmount: "50.00" }),
    initiative("board_referral", { expectedEffectAmount: "70.00" }),
    initiative("rejected", { expectedEffectAmount: "123.00" }),
  ];
  const meetings = [
    { id: "m-old", number: "КЗ-2026-01", status: "planned", meetingDate: "2026-10-01", meetingTime: "10:00", items: [] },
    { id: "m-late", number: "КЗ-2026-03", status: "planned", meetingDate: "2026-10-20", meetingTime: "10:00", items: [] },
    {
      id: "m-next", number: "КЗ-2026-02", status: "planned", meetingDate: "2026-10-12", meetingTime: "09:00",
      items: [
        { initiativeId: "i-9", initiativeNumber: "И-2026-0009", snapshot: { card: { title: "Снимок" } } },
        { initiativeId: "hidden", initiativeNumber: "И-2026-0099", snapshot: { card: { title: "Скрытая" } } },
        { initiativeId: "i-1", initiativeNumber: "И-2026-0001", snapshot: { card: { title: "Снята" } }, removedAt: "x" },
      ],
    },
    { id: "m-cancel", number: "КЗ-2026-04", status: "cancelled", meetingDate: "2026-10-06", meetingTime: "10:00", items: [] },
  ] as unknown as CollegiumMeeting[];
  const assignments = [
    { status: "in_progress", currentOccurrenceDate: "2026-10-01", sourceInitiativeId: "i-6" },
    { status: "completed", currentOccurrenceDate: "2026-10-01", sourceInitiativeId: "i-6" },
    { status: "in_progress", currentOccurrenceDate: "2026-10-05", sourceInitiativeId: "i-6" },
    { status: "in_progress", currentOccurrenceDate: "2026-10-01", sourceInitiativeId: "hidden" },
  ] as unknown as DirectorAssignment[];

  const dashboard = buildCollegiumDashboard({ today: "2026-10-05", initiatives, meetings, assignments });

  assert.equal(dashboard.total, 10);
  assert.deepEqual(dashboard.statusCounts.find(({ status }) => status === "rework"), { status: "rework", count: 2 });
  assert.equal(dashboard.awaitingReview, 1);
  assert.deepEqual([dashboard.rework, dashboard.reworkOverdue], [2, 1]);
  assert.deepEqual([dashboard.inPilot, dashboard.inImplementation], [2, 1]);
  // Only open, past-due assignments of visible initiatives count.
  assert.equal(dashboard.overdueAssignments, 1);
  // Planned covers approved and later stages; kopecks never drift.
  assert.equal(dashboard.plannedEffect, "850.30");
  assert.equal(dashboard.confirmedEffect, "100.10");
  assert.deepEqual(dashboard.effectByDirection, [
    { directionLabel: "Сырьё", planned: "800.00", confirmed: "100.10" },
    { directionLabel: "Без направления", planned: "50.00", confirmed: "0.00" },
    { directionLabel: "Энергия", planned: "0.30", confirmed: "0.00" },
  ]);
  assert.equal(dashboard.nextMeeting?.id, "m-next");
  assert.deepEqual(dashboard.nextMeeting?.items, [{ id: "i-9", number: "И-2026-0009", title: "Снимок" }]);
  assert.deepEqual(dashboard.unconfirmed.map(({ id }) => id), ["i-8"]);
  assert.deepEqual(dashboard.boardDecisions.map(({ id }) => id), ["i-9"]);
  // Finished and rejected initiatives leave the top lists.
  assert.deepEqual(dashboard.topByEffect.map(({ id }) => id), ["i-1", "i-6", "i-9", "i-5", "i-4"]);
  assert.deepEqual(dashboard.topRisks.map(({ id, risk }) => [id, risk]), [
    ["i-6", "Рост цен"], ["i-6", "Простой"], ["i-4", "Сбой поставки"],
  ]);
});

test("an empty portfolio has zero effect and no meeting", () => {
  const dashboard = buildCollegiumDashboard({ today: "2026-10-05", initiatives: [], meetings: [], assignments: [] });
  assert.equal(dashboard.plannedEffect, "0.00");
  assert.equal(dashboard.nextMeeting, undefined);
  assert.deepEqual(dashboard.statusCounts, []);
});
