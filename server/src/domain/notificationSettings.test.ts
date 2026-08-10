import assert from "node:assert/strict";
import test from "node:test";
import {
  boardAssignmentNotificationType,
  buildBoardAssignmentReviewNotification,
  buildGeneralDirectorLoginNotifications,
  notificationTypes,
  validateAdminNotificationSettingRequest,
  validateNotificationContactsRequest,
  validateOwnNotificationSettingRequest,
} from "./notificationSettings.js";

test("notification catalog follows the administrator and user rows from List9", () => {
  assert.deepEqual(
    notificationTypes.map(({ id, label }) => [id, label]),
    [
      ["incidents", "Инциденты"],
      ["visitors", "Посетители"],
      ["equipment_reports", "Отчет по Оборудованию"],
      ["production_reports", "Отчет по Выработке"],
      ["sales", "Продажи"],
      ["shipments", "Отгрузки"],
      ["laboratory_samples", "Лабораторные пробы"],
      ["laboratory_analyses", "Лабораторные анализы"],
      [boardAssignmentNotificationType, "Поручения Совета директоров"],
      ["general_director_assignments", "Поручения Гендиректора"],
    ],
  );
});

test("notification setting requests accept only the supported boolean fields", () => {
  assert.deepEqual(validateAdminNotificationSettingRequest({
    adminEnabled: true,
  }), {
    ok: true,
    value: { adminEnabled: true },
  });
  assert.deepEqual(validateOwnNotificationSettingRequest({
    emailEnabled: true,
    maxEnabled: false,
  }), {
    ok: true,
    value: { emailEnabled: true, maxEnabled: false },
  });

  assert.equal(validateAdminNotificationSettingRequest({
    emailEnabled: true,
    maxEnabled: false,
  }).ok, false);
  assert.equal(validateOwnNotificationSettingRequest({
    emailEnabled: true,
    maxEnabled: false,
    adminEnabled: true,
  }).ok, false);
});

test("notification contact request normalizes optional Email and MAX", () => {
  assert.deepEqual(validateNotificationContactsRequest({
    email: " manager@example.com ",
    maxUserId: " 12345 ",
  }), {
    ok: true,
    value: { email: "manager@example.com", maxUserId: "12345" },
  });
  assert.deepEqual(validateNotificationContactsRequest({
    email: "",
    maxUserId: "",
  }), {
    ok: true,
    value: {},
  });
  assert.equal(validateNotificationContactsRequest({
    email: "not-an-email",
    maxUserId: "12345",
  }).ok, false);
});

test("general director login shows the board reminder only from day 1 through day 14", () => {
  const assignment = {
    id: "assignment-1",
    meetingDate: "2026-07-10",
    protocolNumber: "369",
    decisionNumber: "2.3",
    summary: "Подготовить анализ причин невыполнения плана",
    currentOccurrenceDate: "2026-08-07",
  };

  assert.deepEqual(buildGeneralDirectorLoginNotifications({
    position: "general_director",
    today: "2026-08-08",
    overdueAssignments: [
      assignment,
      {
        ...assignment,
        id: "assignment-2",
        summary: "Согласовать бюджет",
      },
    ],
  }), [
    {
      title: "Совет директоров",
      message: "Необходимо подготовиться к Совету директоров на 15 число",
      tone: "suggestion",
    },
    {
      title: "Просрочено поручение",
      message: "Просрочено поручений: 2",
      tone: "warning",
    },
  ]);

  assert.deepEqual(buildGeneralDirectorLoginNotifications({
    position: "general_director",
    today: "2026-08-15",
    overdueAssignments: [],
  }), []);
  assert.deepEqual(buildGeneralDirectorLoginNotifications({
    position: "board_chair",
    today: "2026-08-08",
    overdueAssignments: [assignment],
  }), []);
});

test("review notification contains the assignment identity and general director actor", () => {
  assert.deepEqual(buildBoardAssignmentReviewNotification({
    summary: "Подготовить анализ причин невыполнения плана",
    meetingDate: "2026-07-10",
    protocolNumber: "369",
    decisionNumber: "2.3",
    submittedByDisplayName: "Фридман Е.М.",
  }), {
    subject: "Поручение Совета директоров передано на проверку",
    text: [
      "Поручение Совета директоров передано на проверку.",
      "Краткое содержание: Подготовить анализ причин невыполнения плана",
      "Дата заседания: 10.07.2026",
      "Протокол: 369",
      "Пункт решения: 2.3",
      "Передал: Фридман Е.М.",
    ].join("\n"),
  });
});
