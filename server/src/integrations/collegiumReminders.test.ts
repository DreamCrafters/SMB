import assert from "node:assert/strict";
import test from "node:test";
import type { CollegiumInitiative } from "../contracts/collegiumInitiatives.js";
import type { DirectorAssignment } from "../contracts/directorAssignments.js";
import type { CollegiumReminderDelivery } from "../repositories/collegiumInitiativesRepository.js";
import { createCollegiumReminderRunner } from "./collegiumReminders.js";

test("collegium reminder runner claims each delivery once and respects viewers", async () => {
  const delivered = new Set<string>();
  const leased = new Set<string>();
  const sent: Array<[string, string]> = [];
  const key = (delivery: CollegiumReminderDelivery) =>
    [delivery.kind, delivery.subjectId, delivery.cycle, delivery.targetDate, delivery.offset, delivery.userId, delivery.channel].join("|");
  const initiative = {
    id: "i-1", number: "И-2026-0001", status: "in_progress", card: { title: "Идея", ownerId: "account:owner" },
    workflow: {},
  } as unknown as CollegiumInitiative;
  const runner = createCollegiumReminderRunner({
    repository: {
      async list() { return [initiative]; },
      async listMeetings() { return []; },
      async listUserIdsWithCapability(capability: string) {
        return capability === "business.view_collegium_initiatives" ? ["owner", "chair"] : ["chair", "former-chair"];
      },
      async claimReminder(delivery: CollegiumReminderDelivery) {
        const id = key(delivery);
        if (delivered.has(id) || leased.has(id)) return false;
        leased.add(id);
        return true;
      },
      async completeReminder(delivery: CollegiumReminderDelivery) {
        delivered.add(key(delivery));
      },
    },
    assignments: {
      async listWithInitiativeLink() {
        return [{ id: "a-1", number: "К-1", status: "in_progress", currentOccurrenceDate: "2026-10-09", sourceInitiativeId: "i-1" }] as unknown as DirectorAssignment[];
      },
    },
    notificationSettings: {
      async listDeliveryRecipients() {
        return [
          { userId: "owner", position: "p", email: "owner@example.com" },
          { userId: "chair", position: "p", maxUserId: "max-chair" },
          { userId: "former-chair", position: "p", email: "former@example.com" },
        ];
      },
    },
    sendEmail: async (recipient, subject) => { sent.push([recipient, subject]); },
    sendMax: async (recipient, subject) => { sent.push([recipient, subject]); },
    // Monday 2026-10-12 is the first workday after Friday's deadline.
    now: () => new Date("2026-10-12T07:00:00.000Z"),
  });

  await runner.run();
  await runner.run();
  // The owner and the current chair are escalated once; a chair without the tab is skipped.
  assert.deepEqual(sent, [
    ["owner@example.com", "И-2026-0001: просрочено поручение К-1"],
    ["max-chair", "И-2026-0001: просрочено поручение К-1"],
  ]);
});
