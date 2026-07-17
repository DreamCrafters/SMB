import assert from "node:assert/strict";
import test from "node:test";
import {
  buildEquipmentReportEmail,
  buildDispatcherSubmissionEmail,
  createEmailNotificationService,
  type EmailMessage,
} from "./emailNotifications.js";
import type { NotificationRecipients } from "./googleSheetsReference.js";
import type { DispatcherSubmission } from "../domain/dispatcherSubmission.js";

const recipients: NotificationRecipients = {
  incidentAndEquipment: ["common@example.com"],
  mechanicalDowntime: ["mechanic@example.com"],
  electricalDowntime: ["electric@example.com"],
  visitors: ["visitors@example.com"],
};

test("buildDispatcherSubmissionEmail sends incident openings to common recipients", () => {
  const message = buildDispatcherSubmissionEmail(
    buildSubmission("incident", {
      incidentNumber: "INC-2026-1",
      location: "Цех №1",
    }),
    recipients,
    "noreply@example.com",
  );

  assert.deepEqual(message?.to, ["common@example.com"]);
  assert.equal(message?.from, "noreply@example.com");
  assert.equal(message?.subject, "[НМОУ Вектор] Открытие инцидента INC-2026-1");
  assert.match(message?.text ?? "", /Место: Цех №1/);
});

test("buildDispatcherSubmissionEmail adds mechanical recipients for mechanical incidents", () => {
  const message = buildDispatcherSubmissionEmail(
    buildSubmission("incident", {
      incidentNumber: "INC-2026-1",
      incidentType: "Поломка оборудования по мех. части",
    }),
    recipients,
    "noreply@example.com",
    "SMB Monitor",
  );

  assert.deepEqual(message?.to, ["common@example.com", "mechanic@example.com"]);
});

test("buildDispatcherSubmissionEmail adds electrical recipients for electrical incidents", () => {
  const message = buildDispatcherSubmissionEmail(
    buildSubmission("incident", {
      incidentNumber: "INC-2026-2",
      incidentType: "Поломка оборудования по эл. части",
    }),
    recipients,
    "noreply@example.com",
    "SMB Monitor",
  );

  assert.deepEqual(message?.to, ["common@example.com", "electric@example.com"]);
});

test("buildDispatcherSubmissionEmail sends incident closures to common recipients", () => {
  const message = buildDispatcherSubmissionEmail(
    buildSubmission("incident_close", {
      incidentNumber: "INC-2026-1",
      location: "Цех №1",
      approvedBy: "Иван Иванов",
    }),
    recipients,
    "noreply@example.com",
    "SMB Monitor",
  );

  assert.deepEqual(message?.to, ["common@example.com"]);
  assert.equal(message?.subject, "[SMB Monitor] Закрытие инцидента INC-2026-1");
  assert.match(message?.text ?? "", /Место: Цех №1/);
});

test("buildDispatcherSubmissionEmail adds mechanical and electrical recipients for downtime reason", () => {
  const message = buildDispatcherSubmissionEmail(
    buildSubmission("equipment", {
      equipment: "Пресс №1",
      downtimeReason: "Простой по мех, эл. части",
      downtimeHours: "8",
    }),
    {
      incidentAndEquipment: ["common@example.com", "mechanic@example.com"],
      mechanicalDowntime: ["mechanic@example.com"],
      electricalDowntime: ["electric@example.com"],
      visitors: [],
    },
    "noreply@example.com",
    "SMB Monitor",
  );

  assert.deepEqual(message?.to, [
    "common@example.com",
    "mechanic@example.com",
    "electric@example.com",
  ]);
  assert.equal(message?.subject, "[SMB Monitor] Отчет по оборудованию: Пресс №1");
  assert.match(message?.text ?? "", /Отчет по оборудованию!/);
  assert.match(
    message?.text ?? "",
    /Пресс №1: выработка 0 т; простой 8 ч; причина: Простой по мех, эл\. части/,
  );
  assert.doesNotMatch(message?.text ?? "", /^Форма:/m);
});

test("buildEquipmentReportEmail sends one message with all equipment rows", () => {
  const message = buildEquipmentReportEmail(
    [
      buildSubmission("equipment", {
        reportDate: "06.07.2026",
        equipment: "Пресс №1",
        productionTons: "42",
      }),
      buildSubmission("equipment", {
        reportDate: "06.07.2026",
        equipment: "Пресс №2",
        downtimeReason: "Простой по мех, эл. части",
        downtimeHours: "8",
      }),
    ],
    {
      incidentAndEquipment: ["common@example.com", "mechanic@example.com"],
      mechanicalDowntime: ["mechanic@example.com"],
      electricalDowntime: ["electric@example.com"],
      visitors: [],
    },
    "noreply@example.com",
    "SMB Monitor",
    "updated",
  );

  assert.deepEqual(message?.to, [
    "common@example.com",
    "mechanic@example.com",
    "electric@example.com",
  ]);
  assert.equal(
    message?.subject,
    "[SMB Monitor] Отчет по оборудованию изменен за 06.07.2026",
  );
  assert.match(message?.text ?? "", /Отчет по оборудованию изменен!/);
  assert.match(message?.text ?? "", /Позиций в отчете: 2/);
  assert.match(
    message?.text ?? "",
    /Пресс №1: выработка 42 т; простой 0 ч/,
  );
  assert.match(
    message?.text ?? "",
    /Пресс №2: выработка 0 т; простой 8 ч; причина: Простой по мех, эл\. части/,
  );
});

test("buildDispatcherSubmissionEmail sends visitor entry to visitor recipients", () => {
  const message = buildDispatcherSubmissionEmail(
    buildSubmission("visitor", {
      fio: "Иван Иванов",
      position: "Инженер",
      organization: "ООО Ромашка",
      purpose: "Проверка",
      whom: "Склад",
      entryAt: "06.07.2026 09:10",
    }),
    recipients,
    "noreply@example.com",
    "SMB Monitor",
  );

  assert.deepEqual(message?.to, ["visitors@example.com"]);
  assert.equal(message?.subject, "[SMB Monitor] Вход посетителя: Иван Иванов");
  assert.match(message?.text ?? "", /Посетитель вошёл/);
  assert.match(message?.text ?? "", /К кому: Склад/);
  assert.match(message?.text ?? "", /Вход: 06\.07\.2026 09:10/);
});

test("buildDispatcherSubmissionEmail sends visitor exit to visitor recipients", () => {
  const message = buildDispatcherSubmissionEmail(
    buildSubmission("visitor_exit", {
      visitorEntryId: "visitor-entry-id",
      fio: "Иван Иванов",
      organization: "ООО Ромашка",
      whom: "Склад",
      entryAt: "06.07.2026 09:10",
      exitAt: "06.07.2026 12:40",
    }),
    recipients,
    "noreply@example.com",
    "SMB Monitor",
  );

  assert.deepEqual(message?.to, ["visitors@example.com"]);
  assert.equal(message?.subject, "[SMB Monitor] Выход посетителя: Иван Иванов");
  assert.match(message?.text ?? "", /Посетитель вышел/);
  assert.match(message?.text ?? "", /К кому: Склад/);
  assert.match(message?.text ?? "", /Выход: 06\.07\.2026 12:40/);
});

test("createEmailNotificationService does not send when disabled", async () => {
  const sent: EmailMessage[] = [];
  const service = createEmailNotificationService(
    {
      enabled: false,
      from: "noreply@example.com",
      subjectPrefix: "SMB Monitor",
      smtpPort: 587,
      smtpSecure: false,
    },
    {
      async sendMail(message) {
        sent.push(message);
      },
    },
  );

  await service.sendDispatcherSubmissionNotification(
    buildSubmission("incident", { incidentNumber: "INC-2026-1" }),
    recipients,
  );

  assert.deepEqual(sent, []);
});

test("createEmailNotificationService sends through injected mailer when enabled", async () => {
  const sent: EmailMessage[] = [];
  const service = createEmailNotificationService(
    {
      enabled: true,
      from: "noreply@example.com",
      subjectPrefix: "SMB Monitor",
      smtpHost: "smtp.example.com",
      smtpPort: 587,
      smtpSecure: false,
    },
    {
      async sendMail(message) {
        sent.push(message);
      },
    },
  );

  await service.sendDispatcherSubmissionNotification(
    buildSubmission("incident", { incidentNumber: "INC-2026-1" }),
    recipients,
  );

  assert.equal(sent.length, 1);
  assert.deepEqual(sent[0]?.to, ["common@example.com"]);
  assert.doesNotMatch(sent[0]?.text ?? "", /Тестовое сообщение/u);
});

test("createEmailNotificationService marks every test-site message at the end", async () => {
  const sent: EmailMessage[] = [];
  const service = createEmailNotificationService(
    {
      enabled: true,
      from: "noreply@example.com",
      subjectPrefix: "SMB Monitor",
      smtpHost: "smtp.example.com",
      smtpPort: 587,
      smtpSecure: false,
    },
    {
      async sendMail(message) {
        sent.push(message);
      },
    },
    "test",
  );

  await service.sendDispatcherSubmissionNotification(
    buildSubmission("incident", { incidentNumber: "INC-2026-1" }),
    recipients,
  );
  await service.sendEquipmentReportNotification(
    [buildSubmission("equipment", { equipment: "Пресс №1" })],
    recipients,
    "created",
  );

  assert.equal(sent.length, 2);
  for (const message of sent) {
    assert.equal(
      message.text.endsWith("\n\nПримечание: Тестовое сообщение"),
      true,
    );
  }
});

function buildSubmission(
  formId: DispatcherSubmission["formId"],
  payload: DispatcherSubmission["payload"],
): DispatcherSubmission {
  return {
    id: "submission-id",
    formId,
    formTitle: formId,
    payload,
    summary: "submission summary",
    status: "received",
    submittedByAccountId: "dispatcher-account",
    submittedAt: "2026-07-06T00:00:00.000Z",
    receivedAt: "2026-07-06T00:00:01.000Z",
  };
}
