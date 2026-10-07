import assert from "node:assert/strict";
import test from "node:test";
import { deliverCollegiumNotifications } from "./collegiumNotificationDelivery.js";

test("collegium notifications reach only viewers with enabled channels, one address per message", async () => {
  const emails: Array<{ to: readonly string[]; subject: string; text: string }> = [];
  const max: Array<{ to: readonly string[]; text: string }> = [];
  const errors: string[] = [];
  await deliverCollegiumNotifications({
    notifications: [
      { subject: "И-1: возвращена", lines: ["Текст"], userIds: ["author", "owner", "outsider", "silent"], actorUserId: "author" },
      { subject: "И-1: на оценке", lines: ["Оценка"], userIds: [], audienceCapability: "business.manage_collegium_initiatives", actorUserId: "author" },
      // The same message twice in one batch is sent once.
      { subject: "И-1: возвращена", lines: ["Текст"], userIds: ["owner"], actorUserId: "author" },
    ],
    people: {
      async listUserIdsWithCapability(capability) {
        return capability === "business.view_collegium_initiatives"
          ? ["author", "owner", "silent", "secretary"]
          : ["secretary", "author"];
      },
    },
    notificationSettings: {
      async listDeliveryRecipients(type) {
        assert.equal(type, "collegium_initiatives");
        return [
          { userId: "owner", position: "p1", email: "owner@example.com" },
          { userId: "owner", position: "p2", maxUserId: "max-owner" },
          { userId: "outsider", position: "p3", email: "outsider@example.com" },
          { userId: "secretary", position: "p4", email: "secretary@example.com" },
          { userId: "author", position: "p5", email: "author@example.com" },
        ];
      },
    },
    emailService: {
      async sendTextNotification(to, subject, text) {
        if (to[0] === "secretary@example.com") throw new Error("smtp rejected secretary@example.com");
        emails.push({ to, subject, text });
      },
    },
    maxService: {
      async sendTextNotification(to, text) { max.push({ to, text }); },
    },
    onError: () => errors.push("failed"),
  });

  // The actor, outsiders without the tab and users without channels get nothing.
  assert.deepEqual(emails, [{ to: ["owner@example.com"], subject: "И-1: возвращена", text: "Текст" }]);
  assert.deepEqual(max, [{ to: ["max-owner"], text: "И-1: возвращена\nТекст" }]);
  // A failed address does not stop the batch and is not logged.
  assert.deepEqual(errors, ["failed"]);
});

test("a role holder without the tab still gets messages about the own initiative", async () => {
  const emails: string[] = [];
  await deliverCollegiumNotifications({
    notifications: [
      // Explicit addressee holding a temporary role: the tab is not needed.
      { subject: "И-1: вы назначены", lines: ["Роль"], userIds: ["worker"], roleHolderUserIds: ["worker"], actorUserId: "member" },
      // A role holder who is not an addressee of this message gets nothing.
      { subject: "И-1: на оценке", lines: ["Оценка"], userIds: ["outsider"], roleHolderUserIds: ["worker"], actorUserId: "member" },
    ],
    people: { async listUserIdsWithCapability() { return []; } },
    notificationSettings: {
      async listDeliveryRecipients() {
        return [
          { userId: "worker", position: "p1", email: "worker@example.com" },
          { userId: "outsider", position: "p2", email: "outsider@example.com" },
        ];
      },
    },
    emailService: { async sendTextNotification(to) { emails.push(to[0]); } },
    maxService: {},
  });
  assert.deepEqual(emails, ["worker@example.com"]);
});
