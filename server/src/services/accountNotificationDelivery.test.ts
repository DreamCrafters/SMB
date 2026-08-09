import assert from "node:assert/strict";
import test from "node:test";
import type { EmailNotificationService } from "../integrations/emailNotifications.js";
import type { MaxNotificationService } from "../integrations/maxNotifications.js";
import type { NotificationSettingsRepository } from "../repositories/notificationSettingsRepository.js";
import {
  sendBoardAssignmentReviewNotification,
  sendOverdueBoardAssignmentNotification,
} from "./accountNotificationDelivery.js";

function createFixture() {
  const emails: { recipients: readonly string[]; subject: string; text: string }[] = [];
  const maxMessages: { recipients: readonly string[]; text: string }[] = [];
  const repository: Pick<
    NotificationSettingsRepository,
    "listDeliveryRecipients"
  > = {
    async listDeliveryRecipients() {
      return [
        { userId: "chair", position: "board_chair" as const, email: "chair@example.com", maxUserId: "101" },
        { userId: "deputy", position: "board_deputy_chair" as const, email: "deputy@example.com", maxUserId: "102" },
        { userId: "reviewer", position: "board_assignment_reviewer" as const, email: "reviewer@example.com", maxUserId: "103" },
        { userId: "member", position: "board_member" as const, email: "member@example.com", maxUserId: "104" },
        { userId: "director", position: "general_director" as const, email: "director@example.com", maxUserId: "105" },
      ];
    },
  };
  const emailService = {
    async sendTextNotification(recipients, subject, text) {
      emails.push({ recipients, subject, text });
    },
  } as EmailNotificationService;
  const maxService = {
    async sendTextNotification(recipients, text) {
      maxMessages.push({ recipients, text });
    },
  } as MaxNotificationService;

  return { repository, emailService, maxService, emails, maxMessages };
}

test("review notification follows the administrator-selected recipient channels", async () => {
  const fixture = createFixture();
  fixture.repository.listDeliveryRecipients = async () => [
    { userId: "chair", position: "board_chair", email: "chair@example.com" },
    { userId: "deputy", position: "board_deputy_chair", maxUserId: "102" },
    { userId: "reviewer", position: "board_assignment_reviewer", email: "reviewer@example.com", maxUserId: "103" },
    { userId: "member", position: "board_member", email: "member@example.com" },
    { userId: "director", position: "general_director", maxUserId: "105" },
  ];

  await sendBoardAssignmentReviewNotification({
    repository: fixture.repository,
    emailService: fixture.emailService,
    maxService: fixture.maxService,
    notification: { subject: "На проверку", text: "Текст поручения" },
  });

  assert.deepEqual(fixture.emails[0]?.recipients, [
    "chair@example.com",
    "reviewer@example.com",
    "member@example.com",
  ]);
  assert.deepEqual(fixture.maxMessages[0]?.recipients, [
    "102",
    "103",
    "105",
  ]);
});

test("overdue assignment reaches the general director and every board role", async () => {
  const fixture = createFixture();

  await sendOverdueBoardAssignmentNotification({
    repository: fixture.repository,
    emailService: fixture.emailService,
    maxService: fixture.maxService,
    message: "Просрочено поручение",
  });

  assert.deepEqual(fixture.emails[0]?.recipients, []);
  assert.deepEqual(fixture.maxMessages[0]?.recipients, [
    "101", "102", "103", "104", "105",
  ]);
});

test("overdue delivery sends the combined assignment text once", async () => {
  const fixture = createFixture();
  const attempted: string[] = [];
  fixture.maxService.sendTextNotification = async (_recipients, text) => {
    attempted.push(text);
  };

  await sendOverdueBoardAssignmentNotification({
    repository: fixture.repository,
    emailService: fixture.emailService,
    maxService: fixture.maxService,
    message: "Первое\n\nВторое",
  });

  assert.deepEqual(attempted, ["Первое\n\nВторое"]);
});
