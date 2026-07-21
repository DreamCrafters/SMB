import assert from "node:assert/strict";
import test from "node:test";
import {
  buildEquipmentReportEmail,
  buildDispatcherSubmissionEmail,
  buildRefractoryReportEmail,
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
  assert.equal(
    message?.text,
    [
      "📢 Новый отчет по оборудованию!",
      "📊 Отчет по оборудованию",
      "",
      "1. Пресс №1",
      "Причина простоя: Простой по мех, эл. части",
      "Время (ч): 8",
    ].join("\n"),
  );
  assert.doesNotMatch(message?.text ?? "", /^Форма:/m);
});

test("buildEquipmentReportEmail sends one message with all equipment rows", () => {
  const message = buildEquipmentReportEmail(
    [
      buildSubmission("equipment", {
        reportDate: "06.07.2026",
        equipment: "Бегуны №1",
        productionTons: "14",
      }),
      buildSubmission("equipment", {
        reportDate: "06.07.2026",
        equipment: "Пресс №2",
        downtimeReason: "Простой по мех, эл. части",
        downtimeHours: "8",
      }),
      buildSubmission("equipment", {
        reportDate: "06.07.2026",
        equipment: "Пресс №1",
        productionTons: "42.5",
        note: "План выполнен",
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
  assert.equal(
    message?.text,
    [
      "📢 Отчет по оборудованию изменен!",
      "📊 Отчет по оборудованию за 06.07.2026",
      "",
      "1. Пресс №1",
      "Объём (т): 42,5",
      "Примечание: План выполнен",
      "",
      "2. Пресс №2",
      "Причина простоя: Простой по мех, эл. части",
      "Время (ч): 8",
      "",
      "3. Бегуны №1",
      "Объём (т): 14",
    ].join("\n"),
  );
});

test("buildRefractoryReportEmail sends an approved OC table with all entered fields", () => {
  const message = buildRefractoryReportEmail(
    buildApprovedRefractoryReport(),
    ["oc@example.com"],
    "noreply@example.com",
    "SMB Monitor",
  );

  assert.deepEqual(message, {
    from: "noreply@example.com",
    to: ["oc@example.com"],
    subject: "[SMB Monitor] Таблица ОЦ подтверждена: Печное отделение",
    text: [
      "Таблица ОЦ подтверждена",
      "Таблица: Печное отделение",
      "Дата смены: 20.07.2026",
      "Смена: 2 (20:00–08:00)",
      "Ревизия: 1",
      "Мастер смены: Мастер ОЦ",
      "Подтвердил: Диспетчер",
      "",
      "Данные таблицы:",
      "Выпуск обожжённых огнеупоров",
      "1. ША; количество, шт. 100; поддоны 5; годные, т (ср. вес) 10,5; годные, т (взвешено) 10,2; недожог 1; трещины 1; сплав 0; сколы 0; брак всего 2; примечание Партия 7",
      "Время обжига, часов: 7,5",
      "Количество сортировщиков: 3",
      "Причина невыполнения плана: Наладка",
      "",
      "Итоги:",
      "Выпуск, шт: 100",
      "Поддоны, шт: 5",
      "Годное по среднему весу, т: 10,5",
      "Годное по взвешиванию, т: 10,2",
      "Брак, шт: 2",
      "Недожог, шт: 1",
      "Трещины, шт: 1",
      "Сплав, шт: 0",
      "Сколы, шт: 0",
    ].join("\n"),
  });
});

test("buildRefractoryReportEmail formats the calculated totals of the other OC tables", () => {
  const baseReport = buildApprovedRefractoryReport();
  const coshMessage = buildRefractoryReportEmail(
    {
      ...baseReport,
      reportType: "cosh",
      payload: {
        kilnNumber: "3",
        chamotteOutput: { shbo: 12.5 },
        jarMeasurements: [{ jarNumber: 1, values: [1.2, 1.4] }],
        bunkerFill: [{ bunker: "I", productName: "ШБО", quantity: 8 }],
        chamotteSupply: [{
          source: "street",
          productName: "ШГР",
          quantity: 4.25,
        }],
        bagging: { jarNumber: "2", quantity: 2 },
        note: "Смена без остановок",
      },
      totals: {
        chamotteOutputTons: 12.5,
        bunkerFillTons: 8,
        chamotteSupplyTons: 4.25,
        baggingTons: 2,
        scrapRemovalTons: 0.5,
      },
    },
    ["oc@example.com"],
    "noreply@example.com",
  );
  const equipmentMessage = buildRefractoryReportEmail(
    {
      ...baseReport,
      reportType: "equipment",
      payload: {
        formedRows: [{
          equipment: "Пресс СМ-1085 №1",
          productBrand: "ША",
          actualPieces: 120,
          actualTons: 6.5,
          workedHours: 16,
          mechanicalRepairHours: 8,
          totalDowntimeHours: 8,
          note: "Ремонт завершён",
        }],
        unformedRows: [{
          productBrand: "ММК-85",
          outputNormContainers: 4,
          actualContainers: 3,
          actualTons: 1.25,
        }],
      },
      totals: {
        formedActualPieces: 120,
        formedActualTons: 6.5,
        formedWorkedHours: 16,
        formedDowntimeHours: 8,
        unformedActualContainers: 3,
        unformedActualTons: 1.25,
      },
    },
    ["oc@example.com"],
    "noreply@example.com",
  );

  assert.match(coshMessage?.text ?? "", /Выработка шамота, т: 12,5/u);
  assert.match(coshMessage?.text ?? "", /Банка 1: 1,2; 1,4/u);
  assert.match(coshMessage?.text ?? "", /Источник улица: продукт ШГР/u);
  assert.match(coshMessage?.text ?? "", /Примечание: Смена без остановок/u);
  assert.match(coshMessage?.text ?? "", /Вывоз брака, т: 0,5/u);
  assert.match(equipmentMessage?.text ?? "", /Формованные изделия, шт: 120/u);
  assert.match(equipmentMessage?.text ?? "", /1\. Пресс СМ-1085 №1; марка ША/u);
  assert.match(equipmentMessage?.text ?? "", /примечание Ремонт завершён/u);
  assert.match(equipmentMessage?.text ?? "", /1\. ММК-85; норма, контейнеры 4/u);
  assert.match(equipmentMessage?.text ?? "", /Неформованные изделия, т: 1,25/u);
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
  await service.sendRefractoryReportNotification(
    buildApprovedRefractoryReport(),
    ["oc@example.com"],
  );

  assert.equal(sent.length, 3);
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

function buildApprovedRefractoryReport() {
  return {
    reportId: "refractory-report-id",
    reportType: "firing" as const,
    reportDate: "2026-07-20",
    shiftNumber: 2 as const,
    revisionNumber: 1,
    payload: {
      rows: [{
        productBrand: "ША",
        quantityPieces: 100,
        palletCount: 5,
        goodTonsAverageWeight: 10.5,
        goodTonsWeighed: 10.2,
        rejectUnderburnPieces: 1,
        rejectCracksPieces: 1,
        rejectFusionPieces: 0,
        rejectChipsPieces: 0,
        rejectTotalPieces: 2,
        note: "Партия 7",
      }],
      calcinationHours: 7.5,
      sorterCount: 3,
      planFailureReason: "Наладка",
    },
    totals: {
      quantityPieces: 100,
      palletCount: 5,
      goodTonsAverageWeight: 10.5,
      goodTonsWeighed: 10.2,
      rejectTotalPieces: 2,
      rejectUnderburnPieces: 1,
      rejectCracksPieces: 1,
      rejectFusionPieces: 0,
      rejectChipsPieces: 0,
    },
    masterDisplayName: "Мастер ОЦ",
    reviewerDisplayName: "Диспетчер",
  };
}
