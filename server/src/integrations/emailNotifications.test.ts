import assert from "node:assert/strict";
import test from "node:test";
import {
  buildEquipmentReportEmail,
  buildDispatcherSubmissionEmail,
  buildRefractoryReviewRequestEmail,
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

test("buildDispatcherSubmissionEmail sends production reports to equipment recipients", () => {
  const submission = buildSubmission("production", {
    reportDate: "27.07.2026",
    jarShipmentStart1: "760",
    jarShipmentEnd1: "760",
    jarShipmentStart2: "316",
    jarShipmentEnd2: "316",
    jarShipmentStart3: "1208",
    jarShipmentEnd3: "1256",
    formingBrand1: "ШЦУ-15 (вес 1,39), т",
    formingBrand2: "ША-8",
    formingFact1: "19.79",
    formingFact2: "33.16",
    sortingBrand1: "ШБ-5 класс 4",
    sortingBrand2: "ШБ-22",
    sortingFact1: "9.31",
    sortingFact2: "7.72",
    chamotteBrand1: "Мертель МШ-28 (ШГР-28), т",
    chamotteFact1: "60",
    reportMonth: "2026-07",
  });
  submission.formTitle = "Выработка";
  submission.summary = "Дата отчета: 27.07.2026";

  const message = buildDispatcherSubmissionEmail(
    submission,
    recipients,
    "noreply@example.com",
    "SMB Monitor",
  );

  assert.deepEqual(message?.to, ["common@example.com"]);
  assert.equal(message?.subject, "[SMB Monitor] Выработка");
  assert.equal(
    message?.text,
    [
      "Форма: Выработка",
      "Статус: Получено",
      "Кратко: Дата отчета: 27.07.2026",
      "",
      "Данные:",
      "Дата отчета: 27.07.2026",
      "Формовка — Марка изделия 1: ШЦУ-15 (вес 1,39), т",
      "Формовка — Марка изделия 2: ША-8",
      "Формовка — Факт по марке 1: 19.79",
      "Формовка — Факт по марке 2: 33.16",
      "Сортировка — Марка изделия 1: ШБ-5 класс 4",
      "Сортировка — Марка изделия 2: ШБ-22",
      "Сортировка — Факт по марке 1: 9.31",
      "Сортировка — Факт по марке 2: 7.72",
      "Цех обжига шамота — Марка изделия 1: Мертель МШ-28 (ШГР-28), т",
      "Цех обжига шамота — Факт по марке 1: 60",
      "Месяц отчета: 2026-07",
      "",
      // Задача 100: банки уходят одним блоком, сырые поля в текст не попадают.
      "Содержимое банок:",
      "- Банка 1 (Не назначено), начало дня, по отгрузкам: 760; " +
        "по замерам —, на конец дня 760 / —",
      "- Банка 2 (Не назначено), начало дня, по отгрузкам: 316; " +
        "по замерам —, на конец дня 316 / —",
      "- Банка 3 (Не назначено), начало дня, по отгрузкам: 1208; " +
        "по замерам —, на конец дня 1256 / —",
    ].join("\n"),
  );
  assert.doesNotMatch(message?.text ?? "", /^Получено:/mu);
  assert.doesNotMatch(
    message?.text ?? "",
    /(?:forming|sorting|unformed|chamotte)(?:Brand|Fact)\d+|reportMonth/u,
  );
});

test("buildDispatcherSubmissionEmail lists bank contents in a single block", () => {
  const submission = buildSubmission("production", {
    jarStart1: "45",
    jarStart2: "12",
    jarStart3: "8",
    coshMaster: "Сидоров С.С.",
  });
  submission.formTitle = "Выработка";

  const message = buildDispatcherSubmissionEmail(
    submission,
    recipients,
    "noreply@example.com",
    "SMB Monitor",
    "production",
    [
      { bankNumber: 1, materialLabel: "ША-22" },
      { bankNumber: 3, materialLabel: "ШКИ-66" },
    ],
  );

  assert.equal(
    (message?.text ?? "").split("\n").slice(-5).join("\n"),
    [
      "Содержимое банок:",
      "- Банка 1 (ША-22), начало дня, по отгрузкам: —; " +
        "по замерам 45, на конец дня — / —",
      "- Банка 2 (Не назначено), начало дня, по отгрузкам: —; " +
        "по замерам 12, на конец дня — / —",
      "- Банка 3 (ШКИ-66), начало дня, по отгрузкам: —; " +
        "по замерам 8, на конец дня — / —",
      "Мастер ЦОШ: Сидоров С.С.",
    ].join("\n"),
  );
  // Задача 100: сырые поля замеров в рассылку больше не попадают.
  assert.doesNotMatch(message?.text ?? "", /Замеры банок —/u);
});

test("buildDispatcherSubmissionEmail omits the bank block without bank fields", () => {
  const submission = buildSubmission("production", {
    reportDate: "27.07.2026",
    formingBrand1: "ША-8",
    formingFact1: "12",
  });
  submission.formTitle = "Выработка";

  const message = buildDispatcherSubmissionEmail(
    submission,
    recipients,
    "noreply@example.com",
  );

  // Legacy-сводка без блока банок не получает пустой список банок.
  assert.doesNotMatch(message?.text ?? "", /Содержимое банок/u);
});

test("buildDispatcherSubmissionEmail falls back to the report bank snapshot", () => {
  const submission = buildSubmission("production", {
    jarStart1: "45",
    jarMaterial1: "ША-22",
  });
  submission.formTitle = "Выработка";

  const message = buildDispatcherSubmissionEmail(
    submission,
    recipients,
    "noreply@example.com",
  );

  // Без текущих назначений содержимое берётся из снимка самой сводки.
  assert.match(
    message?.text ?? "",
    /- Банка 1 \(ША-22\), начало дня, по отгрузкам: —; по замерам 45,/u,
  );
  assert.match(message?.text ?? "", /- Банка 2 \(Не назначено\),/u);
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

test("buildDispatcherSubmissionEmail sends complete incident closure context", () => {
  const submission = buildSubmission("incident_close", {
    incidentNumber: "INC-2026-47",
    datetime: "22.07.2026 10:16",
    location: "ОЦ (Огнеупорный цех)",
    incidentType: "Поломка оборудования по эл. части",
    criticality: "Средний",
    description: "Пресс 2 встал по эл. части",
    rootCauses: "Отказ контактора",
    preventiveMeasures: "Плановая проверка контакторов",
    closureDateTime: "28.07.2026 14:00",
    approvedBy: "Фридман",
  });
  const message = buildDispatcherSubmissionEmail(
    submission,
    recipients,
    "noreply@example.com",
    "SMB Monitor",
  );
  const expectedText = [
    "Инцидент закрыт",
    "№: INC-2026-47",
    "Открыт: 22.07.2026 10:16",
    "Место: ОЦ (Огнеупорный цех)",
    "Тип: Поломка оборудования по эл. части",
    "Критичность: Средний",
    "Описание: Пресс 2 встал по эл. части",
    "Корневые причины: Отказ контактора",
    "Предотвращающие меры: Плановая проверка контакторов",
    "Закрыт: 28.07.2026 14:00",
    "Утвердил: Фридман",
  ].join("\n");

  assert.deepEqual(message?.to, ["common@example.com", "electric@example.com"]);
  assert.equal(
    message?.subject,
    "[SMB Monitor] Закрытие инцидента INC-2026-47",
  );
  assert.equal(message?.text, expectedText);

  const testMessage = buildDispatcherSubmissionEmail(
    submission,
    recipients,
    "noreply@example.com",
    "SMB Monitor",
    "test",
  );

  assert.equal(
    testMessage?.text,
    `${expectedText}\n\nПримечание: Тестовое сообщение`,
  );
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
    subject: "[SMB Monitor] Таблица ОЦ подтверждена: Обжиг/Сортировка",
    text: [
      "Таблица ОЦ подтверждена",
      "Таблица: Обжиг/Сортировка",
      "Дата смены: 20.07.2026",
      "Смена: 2 (20:00–08:00)",
      "Ревизия: 1",
      "Мастер смены: Мастер ОЦ",
      "Подтвердил: Диспетчер",
      "",
      "Данные таблицы:",
      "Выпуск обожжённых огнеупоров",
      "1. ША; кол-во, шт. 100; кол-во, поддонов 5; годная, т по среднему весу 10,5; годная, т по взвешиванию 10,2; брак всего, шт. 2; недожог 1; трещины 1; выплавка 0; сколы 0; примечание Партия 7",
      "Время прогонки, час(а): 7,5",
      "Присутствуют на смене, сортировщиков: 3",
      "Причина невыполнения плана: Наладка",
      "",
      "Итоги:",
      "Кол-во, шт: 100",
      "Кол-во, поддонов: 5",
      "Годная по среднему весу, т: 10,5",
      "Годная по взвешиванию, т: 10,2",
      "Брак всего, шт: 2",
      "Недожог, шт: 1",
      "Трещины, шт: 1",
      "Выплавка, шт: 0",
      "Сколы, шт: 0",
    ].join("\n"),
  });
});

test("buildRefractoryReviewRequestEmail notifies dispatchers about a pending OC table", () => {
  const message = buildRefractoryReviewRequestEmail(
    buildApprovedRefractoryReport(),
    ["dispatcher@example.com", "DISPATCHER@example.com"],
    "noreply@example.com",
    "SMB Monitor",
  );

  assert.deepEqual(message?.to, ["dispatcher@example.com"]);
  assert.equal(
    message?.subject,
    "[SMB Monitor] Таблица ОЦ ожидает подтверждения: Обжиг/Сортировка",
  );
  assert.match(message?.text ?? "", /^Новая таблица ОЦ ожидает подтверждения/mu);
  assert.match(message?.text ?? "", /Дата смены: 20\.07\.2026/u);
  assert.match(message?.text ?? "", /Смена: 2 \(20:00–08:00\)/u);
  assert.match(message?.text ?? "", /Мастер смены: Мастер ОЦ/u);
  assert.doesNotMatch(message?.text ?? "", /Подтвердил:/u);
  assert.doesNotMatch(message?.text ?? "", /Данные таблицы:/u);
});

test("buildRefractoryReportEmail formats the calculated totals of the other OC tables", () => {
  const baseReport = buildApprovedRefractoryReport();
  const coshMessage = buildRefractoryReportEmail(
    {
      ...baseReport,
      reportType: "cosh",
      payload: {
        coshMaster: "Сидоров С.С.",
        kilnNumber: "3",
        chamotteOutputRows: [
          { productBrand: "ШБО", quantityTons: 12.5 },
        ],
        jarMeasurements: [{
          jarNumber: 1,
          values: [1.2, 1.4],
          material: "ШКИ",
          averageHeightMeters: 1.3,
          volumeCubicMeters: 886.45,
          bulkDensityTonsPerCubicMeter: 1.16,
          materialMassTons: 1028.282,
          loadedTons: 12,
          shippedTons: 8,
          shipmentMassTons: 1032.282,
        }],
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
        jarMaterialMassTons: 1028.282,
        jarShipmentMassTons: 1032.282,
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

  assert.match(coshMessage?.text ?? "", /Выпуск шамота, т: 12,5/u);
  assert.match(coshMessage?.text ?? "", /1\. ШБО: 12,5 т/u);
  assert.match(coshMessage?.text ?? "", /Заполнение ж\/д бункеров, т: 8/u);
  assert.match(coshMessage?.text ?? "", /Затарка в мешки, т: 2/u);
  assert.match(coshMessage?.text ?? "", /Банка I: 1,2; 1,4/u);
  assert.match(coshMessage?.text ?? "", /Мастер ЦОШ: Сидоров С\.С\./u);
  assert.match(coshMessage?.text ?? "", /засыпали 12 т; отгрузили 8 т/u);
  assert.match(coshMessage?.text ?? "", /в отчёте 1028,282 \/ 1032,282 т/u);
  assert.match(coshMessage?.text ?? "", /Вес в банках по отгрузкам, т: 1032,282/u);
  assert.match(coshMessage?.text ?? "", /уличн\.: продукт ШГР/u);
  assert.match(coshMessage?.text ?? "", /Примечание: Смена без остановок/u);
  assert.match(coshMessage?.text ?? "", /Вывоз недопала, т: 0,5/u);
  assert.match(equipmentMessage?.text ?? "", /Формованные изделия, шт: 120/u);
  assert.match(equipmentMessage?.text ?? "", /Простой всего, ч: 8/u);
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

test("createEmailNotificationService sends an addressed text notification", async () => {
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

  await service.sendTextNotification?.(
    [" first@example.com ", "first@example.com", "second@example.com"],
    "Проверка поручения",
    "Поручение передано на проверку.",
  );

  assert.deepEqual(sent, [{
    from: "noreply@example.com",
    to: ["first@example.com", "second@example.com"],
    subject: "[SMB Monitor] Проверка поручения",
    text: "Поручение передано на проверку.",
  }]);
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
    "approved",
  );
  await service.sendRefractoryReportNotification(
    buildApprovedRefractoryReport(),
    ["dispatcher@example.com"],
    "review_requested",
  );

  assert.equal(sent.length, 4);
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
        sortingWagons: [{ id: "wagon-1", number: "В-1", productBrand: "ША" }],
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
