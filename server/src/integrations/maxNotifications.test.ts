import assert from "node:assert/strict";
import test from "node:test";
import { createMaxNotificationService } from "./maxNotifications.js";
import type { MaxNotificationRecipients } from "./googleSheetsReference.js";
import type { DispatcherSubmission } from "../domain/dispatcherSubmission.js";

const recipients: MaxNotificationRecipients = {
  incidentAndEquipment: ["-1001"],
  mechanicalDowntime: ["2001"],
  electricalDowntime: ["3001"],
  visitors: ["4001"],
};

test("createMaxNotificationService does not send when disabled", async () => {
  const sent: string[] = [];
  const service = createMaxNotificationService(
    {
      enabled: false,
      apiBaseUrl: "https://platform-api2.max.ru",
      recipientIdType: "user_id",
      subjectPrefix: "SMB Monitor",
    },
    {
      async fetchImpl(input) {
        sent.push(String(input));

        return new Response(null, { status: 200 });
      },
    },
  );

  await service.sendDispatcherSubmissionNotification(
    buildSubmission("incident", { incidentNumber: "INC-2026-1" }),
    recipients,
  );

  assert.deepEqual(sent, []);
});

test("createMaxNotificationService sends incident openings to user ids", async () => {
  const sent: { url: string; init: RequestInit | undefined }[] = [];
  const service = createMaxNotificationService(
    {
      enabled: true,
      botToken: "bot-token",
      apiBaseUrl: "https://platform-api2.max.ru",
      recipientIdType: "user_id",
      subjectPrefix: "SMB Monitor",
    },
    {
      async fetchImpl(input, init) {
        sent.push({ url: String(input), init });

        return new Response(JSON.stringify({ message: { id: "message-id" } }), {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        });
      },
    },
  );

  await service.sendDispatcherSubmissionNotification(
    buildSubmission("incident", {
      incidentNumber: "INC-2026-1",
      datetime: "06.07.2026 21:51",
      location: "Цех №1",
      incidentType: "Травма",
      description: "Описание",
      criticality: "Средний",
      responsible: "Соколова Т.В.",
      immediateActions: "Оперативные меры",
      incidentStatus: "Новый",
    }),
    recipients,
  );

  assert.equal(sent.length, 1);
  assert.equal(
    sent[0]?.url,
    "https://platform-api2.max.ru/messages?user_id=-1001",
  );
  assert.equal(sent[0]?.init?.method, "POST");
  assert.equal(
    (sent[0]?.init?.headers as Record<string, string>).Authorization,
    "bot-token",
  );
  assert.equal(
    (sent[0]?.init?.headers as Record<string, string>)["Content-Type"],
    "application/json",
  );
  assert.deepEqual(JSON.parse(String(sent[0]?.init?.body)), {
    text: [
      "[SMB Monitor] Новый инцидент",
      "№: INC-2026-1",
      "Когда: 06.07.2026 21:51",
      "Место: Цех №1",
      "Тип: Травма",
      "Критичность: Средний",
      "Описание: Описание",
    ].join("\n"),
    notify: true,
  });
});

test("createMaxNotificationService sends an addressed text notification", async () => {
  const sent: { url: string; init: RequestInit | undefined }[] = [];
  const service = createMaxNotificationService(
    {
      enabled: true,
      botToken: "bot-token",
      apiBaseUrl: "https://platform-api2.max.ru",
      recipientIdType: "user_id",
      subjectPrefix: "SMB Monitor",
    },
    {
      async fetchImpl(input, init) {
        sent.push({ url: String(input), init });
        return new Response(null, { status: 200 });
      },
    },
  );

  await service.sendTextNotification?.(
    ["1001", "1001", "2002"],
    "Поручение передано на проверку.",
  );

  assert.deepEqual(sent.map(({ url }) => url), [
    "https://platform-api2.max.ru/messages?user_id=1001",
    "https://platform-api2.max.ru/messages?user_id=2002",
  ]);
  assert.match(String(sent[0]?.init?.body), /\[SMB Monitor\]/u);
  assert.match(String(sent[0]?.init?.body), /Поручение передано на проверку/u);
});

test("createMaxNotificationService sends production reports to equipment recipients", async () => {
  const sent: { url: string; body: string }[] = [];
  const service = createMaxNotificationService(
    {
      enabled: true,
      botToken: "bot-token",
      apiBaseUrl: "https://platform-api2.max.ru",
      recipientIdType: "user_id",
      subjectPrefix: "SMB Monitor",
    },
    {
      async fetchImpl(input, init) {
        sent.push({ url: String(input), body: String(init?.body) });
        return new Response(null, { status: 200 });
      },
    },
  );
  const submission = buildSubmission("production", {
    reportDate: "27.07.2026",
    formingProductBrand: "ША-5",
    formingDay: "12",
  });
  submission.formTitle = "Выработка";

  await service.sendDispatcherSubmissionNotification(submission, recipients);

  assert.deepEqual(sent.map((item) => item.url), [
    "https://platform-api2.max.ru/messages?user_id=-1001",
  ]);
  assert.match(
    JSON.parse(sent[0]?.body ?? "{}").text,
    /^\[SMB Monitor\] Форма: Выработка$/mu,
  );
  assert.match(
    JSON.parse(sent[0]?.body ?? "{}").text,
    /^Статус: Получено$/mu,
  );
  assert.doesNotMatch(
    JSON.parse(sent[0]?.body ?? "{}").text,
    /^Получено:/mu,
  );
});

test("createMaxNotificationService marks every test-site message at the end", async () => {
  const sentBodies: string[] = [];
  const service = createMaxNotificationService(
    {
      enabled: true,
      botToken: "bot-token",
      apiBaseUrl: "https://platform-api2.max.ru",
      recipientIdType: "user_id",
      subjectPrefix: "SMB Monitor",
    },
    {
      async fetchImpl(_input, init) {
        sentBodies.push(String(init?.body));
        return new Response(null, { status: 200 });
      },
    },
    "test",
  );
  const testRecipients: MaxNotificationRecipients = {
    incidentAndEquipment: ["-1001"],
    mechanicalDowntime: [],
    electricalDowntime: [],
    visitors: [],
  };

  await service.sendDispatcherSubmissionNotification(
    buildSubmission("incident", { incidentNumber: "INC-2026-1" }),
    testRecipients,
  );
  await service.sendEquipmentReportNotification(
    [buildSubmission("equipment", { equipment: "Пресс №1" })],
    testRecipients,
    "created",
  );
  await service.sendDispatcherSubmissionNotification(
    buildSubmission("incident", {
      incidentNumber: "INC-2026-2",
      description: "Д".repeat(5_000),
    }),
    testRecipients,
  );
  await service.sendRefractoryReportNotification(
    buildApprovedRefractoryReport(),
    ["5001"],
    "approved",
  );

  assert.equal(sentBodies.length, 4);
  for (const body of sentBodies) {
    assert.equal(
      JSON.parse(body).text.endsWith(
        "\n\nПримечание: Тестовое сообщение",
      ),
      true,
    );
  }
  assert.equal(JSON.parse(sentBodies[2] ?? "{}").text.length, 4_000);
});

test("createMaxNotificationService sends complete incident closure context", async () => {
  const sent: { url: string; body: string }[] = [];
  const service = createMaxNotificationService(
    {
      enabled: true,
      botToken: "bot-token",
      apiBaseUrl: "https://platform-api2.max.ru",
      recipientIdType: "user_id",
      subjectPrefix: "SMB Monitor",
    },
    {
      async fetchImpl(input, init) {
        sent.push({ url: String(input), body: String(init?.body) });

        return new Response(null, { status: 200 });
      },
    },
  );

  await service.sendDispatcherSubmissionNotification(
    buildSubmission("incident_close", {
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
      incidentStatus: "Закрыт",
    }),
    recipients,
  );

  assert.equal(sent.length, 2);
  assert.deepEqual(
    sent.map((item) => item.url),
    [
      "https://platform-api2.max.ru/messages?user_id=-1001",
      "https://platform-api2.max.ru/messages?user_id=3001",
    ],
  );
  assert.deepEqual(JSON.parse(sent[0]?.body ?? "{}"), {
    text: [
      "[SMB Monitor] Инцидент закрыт",
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
    ].join("\n"),
    notify: true,
  });
});

test("createMaxNotificationService adds specialized recipients", async () => {
  const sent: { url: string; body: string }[] = [];
  const service = createMaxNotificationService(
    {
      enabled: true,
      botToken: "bot-token",
      apiBaseUrl: "https://platform-api2.max.ru",
      recipientIdType: "user_id",
      subjectPrefix: "SMB Monitor",
    },
    {
      async fetchImpl(input, init) {
        sent.push({ url: String(input), body: String(init?.body) });

        return new Response(null, { status: 200 });
      },
    },
  );

  await service.sendDispatcherSubmissionNotification(
    buildSubmission("equipment", {
      equipment: "Пресс №1",
      downtimeReason: "Простой по мех. и эл. части",
      downtimeHours: "8",
    }),
    {
      incidentAndEquipment: ["1001", "2001"],
      mechanicalDowntime: ["2001"],
      electricalDowntime: ["3001"],
      visitors: [],
    },
  );

  assert.deepEqual(sent.map((item) => item.url), [
    "https://platform-api2.max.ru/messages?user_id=1001",
    "https://platform-api2.max.ru/messages?user_id=2001",
    "https://platform-api2.max.ru/messages?user_id=3001",
  ]);
  assert.match(
    JSON.parse(sent[0]?.body ?? "{}").text,
    /📢 Новый отчет по оборудованию!/,
  );
  assert.match(
    JSON.parse(sent[0]?.body ?? "{}").text,
    /1\. Пресс №1\nПричина простоя: Простой по мех\. и эл\. части\nВремя \(ч\): 8/,
  );
  assert.doesNotMatch(JSON.parse(sent[0]?.body ?? "{}").text, /^Форма:/m);
});

test("createMaxNotificationService rejects when MAX responds with an error", async () => {
  const service = createMaxNotificationService(
    {
      enabled: true,
      botToken: "bot-token",
      apiBaseUrl: "https://platform-api2.max.ru",
      recipientIdType: "user_id",
      subjectPrefix: "SMB Monitor",
    },
    {
      async fetchImpl() {
        return new Response(JSON.stringify({ message: "access denied" }), {
          status: 403,
        });
      },
    },
  );

  await assert.rejects(
    () =>
      service.sendDispatcherSubmissionNotification(
        buildSubmission("incident", { incidentNumber: "INC-2026-1" }),
        recipients,
      ),
    (error: unknown) => {
      assert.ok(error instanceof AggregateError);
      assert.match(error.message, /1 of 1 recipients/u);
      assert.doesNotMatch(error.message, /access denied/u);
      assert.doesNotMatch(JSON.stringify(error.errors), /access denied/u);
      return true;
    },
  );
});

test("createMaxNotificationService keeps sending after a failed recipient", async () => {
  const sentUserIds: string[] = [];
  const service = createMaxNotificationService(
    {
      enabled: true,
      botToken: "bot-token",
      apiBaseUrl: "https://platform-api2.max.ru",
      recipientIdType: "user_id",
      subjectPrefix: "SMB Monitor",
    },
    {
      async fetchImpl(input) {
        const userId = new URL(String(input)).searchParams.get("user_id") ?? "";

        sentUserIds.push(userId);

        return userId === "4002"
          ? new Response(JSON.stringify({ message: "chat not found" }), {
              status: 404,
            })
          : new Response(null, { status: 200 });
      },
    },
  );

  await assert.rejects(
    () =>
      service.sendDispatcherSubmissionNotification(
        buildSubmission("visitor", { fio: "Иванов И.И." }),
        { ...recipients, visitors: ["4001", "4002", "4003"] },
      ),
    (error: unknown) => {
      assert.ok(error instanceof AggregateError);
      assert.match(error.message, /1 of 3 recipients/u);
      assert.doesNotMatch(error.message, /4002/u);
      return true;
    },
  );

  assert.deepEqual(sentUserIds, ["4001", "4002", "4003"]);
});

test("createMaxNotificationService skips the bot token stored with recipients", async () => {
  const sentUserIds: string[] = [];
  const service = createMaxNotificationService(
    {
      enabled: true,
      botToken: "sheet-bot-token",
      apiBaseUrl: "https://platform-api2.max.ru",
      recipientIdType: "user_id",
      subjectPrefix: "SMB Monitor",
    },
    {
      async fetchImpl(input) {
        sentUserIds.push(
          new URL(String(input)).searchParams.get("user_id") ?? "",
        );

        return new Response(null, { status: 200 });
      },
    },
  );

  await service.sendDispatcherSubmissionNotification(
    buildSubmission("incident", { incidentNumber: "INC-2026-1" }),
    {
      ...recipients,
      incidentAndEquipment: ["sheet-bot-token", "1001"],
      mechanicalDowntime: [],
      electricalDowntime: [],
    },
  );

  assert.deepEqual(sentUserIds, ["1001"]);
});

test("createMaxNotificationService retries a throttled recipient", async () => {
  const sentUserIds: string[] = [];
  const delays: number[] = [];
  const service = createMaxNotificationService(
    {
      enabled: true,
      botToken: "bot-token",
      apiBaseUrl: "https://platform-api2.max.ru",
      recipientIdType: "user_id",
      subjectPrefix: "SMB Monitor",
    },
    {
      async fetchImpl(input) {
        const userId = new URL(String(input)).searchParams.get("user_id") ?? "";

        sentUserIds.push(userId);

        return sentUserIds.filter((value) => value === userId).length === 1
          ? new Response(JSON.stringify({ message: "too many requests" }), {
              status: 429,
            })
          : new Response(null, { status: 200 });
      },
      async sleep(milliseconds) {
        delays.push(milliseconds);
      },
    },
  );

  await service.sendDispatcherSubmissionNotification(
    buildSubmission("visitor", { fio: "Иванов И.И." }),
    { ...recipients, visitors: ["4001"] },
  );

  assert.deepEqual(sentUserIds, ["4001", "4001"]);
  assert.deepEqual(delays, [1000]);
});

test("createMaxNotificationService can send to chat_id", async () => {
  const sentUrls: string[] = [];
  const service = createMaxNotificationService(
    {
      enabled: true,
      botToken: "bot-token",
      apiBaseUrl: "https://platform-api2.max.ru",
      recipientIdType: "chat_id",
      subjectPrefix: "SMB Monitor",
    },
    {
      async fetchImpl(input) {
        sentUrls.push(String(input));

        return new Response(null, { status: 200 });
      },
    },
  );

  await service.sendDispatcherSubmissionNotification(
    buildSubmission("incident", { incidentNumber: "INC-2026-1" }),
    recipients,
  );

  assert.deepEqual(sentUrls, [
    "https://platform-api2.max.ru/messages?chat_id=-1001",
  ]);
});

test("createMaxNotificationService sends visitor notifications to visitor chat ids", async () => {
  const sent: { url: string; body: string }[] = [];
  const service = createMaxNotificationService(
    {
      enabled: true,
      botToken: "bot-token",
      apiBaseUrl: "https://platform-api2.max.ru",
      recipientIdType: "chat_id",
      subjectPrefix: "SMB Monitor",
    },
    {
      async fetchImpl(input, init) {
        sent.push({ url: String(input), body: String(init?.body) });

        return new Response(null, { status: 200 });
      },
    },
  );

  await service.sendDispatcherSubmissionNotification(
    buildSubmission("visitor_exit", {
      visitorEntryId: "visitor-entry-id",
      fio: "Иван Иванов",
      organization: "ООО Ромашка",
      whom: "Склад",
      entryAt: "06.07.2026 09:10",
      exitAt: "06.07.2026 12:40",
    }),
    recipients,
  );

  assert.deepEqual(sent.map((item) => item.url), [
    "https://platform-api2.max.ru/messages?chat_id=4001",
  ]);
  assert.match(JSON.parse(sent[0]?.body ?? "{}").text, /Посетитель вышел/);
  assert.match(
    JSON.parse(sent[0]?.body ?? "{}").text,
    /Выход: 06\.07\.2026 12:40/,
  );
});

test("createMaxNotificationService sends MAX requests with configured CA certificate", async () => {
  const sent: { url: string; ca: string | undefined }[] = [];
  const service = createMaxNotificationService(
    {
      enabled: true,
      botToken: "bot-token",
      apiBaseUrl: "https://platform-api2.max.ru",
      recipientIdType: "chat_id",
      subjectPrefix: "SMB Monitor",
      caCertFile: "/secure/russiantrustedca.pem",
    },
    {
      async readTextFile(path) {
        assert.equal(path, "/secure/russiantrustedca.pem");

        return "trusted-ca-pem";
      },
      async httpClient(url, request) {
        sent.push({ url: url.toString(), ca: request.ca });

        return {
          ok: true,
          status: 200,
          text: async () => "",
        };
      },
    },
  );

  await service.sendDispatcherSubmissionNotification(
    buildSubmission("incident", { incidentNumber: "INC-2026-1" }),
    recipients,
  );

  assert.deepEqual(sent, [
    {
      url: "https://platform-api2.max.ru/messages?chat_id=-1001",
      ca: "trusted-ca-pem",
    },
  ]);
});

test("createMaxNotificationService sends equipment report as one message", async () => {
  const sent: { url: string; body: string }[] = [];
  const service = createMaxNotificationService(
    {
      enabled: true,
      botToken: "bot-token",
      apiBaseUrl: "https://platform-api2.max.ru",
      recipientIdType: "chat_id",
      subjectPrefix: "SMB Monitor",
    },
    {
      async fetchImpl(input, init) {
        sent.push({ url: String(input), body: String(init?.body) });

        return new Response(null, { status: 200 });
      },
    },
  );

  await service.sendEquipmentReportNotification(
    [
      buildSubmission("equipment", {
        reportDate: "06.07.2026",
        equipment: "Пресс №1",
        productionTons: "12",
      }),
      buildSubmission("equipment", {
        reportDate: "06.07.2026",
        equipment: "Пресс №2",
        productionTons: "0",
        downtimeReason: "Простой по мех. и эл. части",
        downtimeHours: "8",
      }),
    ],
    recipients,
    "updated",
  );

  assert.deepEqual(sent.map((item) => item.url), [
    "https://platform-api2.max.ru/messages?chat_id=-1001",
    "https://platform-api2.max.ru/messages?chat_id=2001",
    "https://platform-api2.max.ru/messages?chat_id=3001",
  ]);
  assert.match(
    JSON.parse(sent[0]?.body ?? "{}").text,
    /📢 Отчет по оборудованию изменен!/,
  );
  assert.match(
    JSON.parse(sent[0]?.body ?? "{}").text,
    /1\. Пресс №1\nОбъём \(т\): 12/,
  );
  assert.match(
    JSON.parse(sent[0]?.body ?? "{}").text,
    /2\. Пресс №2\nПричина простоя: Простой по мех\. и эл\. части\nВремя \(ч\): 8/,
  );
});

test("createMaxNotificationService sends an approved OC table to its MAX recipients", async () => {
  const sent: { url: string; body: string }[] = [];
  const service = createMaxNotificationService(
    {
      enabled: true,
      botToken: "bot-token",
      apiBaseUrl: "https://platform-api2.max.ru",
      recipientIdType: "chat_id",
      subjectPrefix: "SMB Monitor",
    },
    {
      async fetchImpl(input, init) {
        sent.push({ url: String(input), body: String(init?.body) });
        return new Response(null, { status: 200 });
      },
    },
  );

  await service.sendRefractoryReportNotification(
    buildApprovedRefractoryReport(),
    ["5001", "oc_chat_2"],
    "approved",
  );

  assert.deepEqual(
    sent.map((item) => item.url),
    [
      "https://platform-api2.max.ru/messages?chat_id=5001",
      "https://platform-api2.max.ru/messages?chat_id=oc_chat_2",
    ],
  );
  assert.match(
    JSON.parse(sent[0]?.body ?? "{}").text,
    /^\[SMB Monitor\] Таблица ОЦ подтверждена\nТаблица: Печное отделение/mu,
  );
  assert.match(JSON.parse(sent[0]?.body ?? "{}").text, /Брак всего, шт: 2/u);
  assert.match(
    JSON.parse(sent[0]?.body ?? "{}").text,
    /1\. ША; кол-во, шт\. 100/u,
  );
  assert.match(
    JSON.parse(sent[0]?.body ?? "{}").text,
    /Причина невыполнения плана: Наладка/u,
  );
});

test("createMaxNotificationService notifies dispatchers about a pending OC table", async () => {
  const sent: { url: string; body: string }[] = [];
  const service = createMaxNotificationService(
    {
      enabled: true,
      botToken: "bot-token",
      apiBaseUrl: "https://platform-api2.max.ru",
      recipientIdType: "chat_id",
      subjectPrefix: "SMB Monitor",
    },
    {
      async fetchImpl(input, init) {
        sent.push({ url: String(input), body: String(init?.body) });
        return new Response(null, { status: 200 });
      },
    },
  );

  await service.sendRefractoryReportNotification(
    buildApprovedRefractoryReport(),
    ["6001", "dispatcher_chat_2"],
    "review_requested",
  );

  assert.deepEqual(
    sent.map((item) => item.url),
    [
      "https://platform-api2.max.ru/messages?chat_id=6001",
      "https://platform-api2.max.ru/messages?chat_id=dispatcher_chat_2",
    ],
  );
  assert.match(
    JSON.parse(sent[0]?.body ?? "{}").text,
    /^\[SMB Monitor\] Новая таблица ОЦ ожидает подтверждения/mu,
  );
  assert.match(JSON.parse(sent[0]?.body ?? "{}").text, /Мастер смены: Мастер ОЦ/u);
  assert.doesNotMatch(JSON.parse(sent[0]?.body ?? "{}").text, /Данные таблицы:/u);
});

test("createMaxNotificationService splits a large OC table without dropping its rows", async () => {
  const sentTexts: string[] = [];
  const service = createMaxNotificationService(
    {
      enabled: true,
      botToken: "bot-token",
      apiBaseUrl: "https://platform-api2.max.ru",
      recipientIdType: "chat_id",
      subjectPrefix: "SMB Monitor",
    },
    {
      async fetchImpl(_input, init) {
        sentTexts.push(JSON.parse(String(init?.body)).text);
        return new Response(null, { status: 200 });
      },
    },
  );
  const baseReport = buildApprovedRefractoryReport();

  await service.sendRefractoryReportNotification(
    {
      ...baseReport,
      payload: {
        ...baseReport.payload,
        rows: Array.from({ length: 4 }, (_, index) => ({
          ...baseReport.payload.rows[0]!,
          productBrand: `ША-${index + 1}`,
          note: `${index + 1}-${"Д".repeat(1_500)}`,
        })),
      },
    },
    ["5001"],
    "approved",
  );

  assert.equal(sentTexts.length > 1, true);
  assert.equal(sentTexts.every((text) => text.length <= 4_000), true);
  assert.equal(sentTexts.some((text) => text.includes("1-ДДД")), true);
  assert.equal(sentTexts.some((text) => text.includes("4-ДДД")), true);
  assert.equal(sentTexts.some((text) => text.endsWith("\u2026")), false);
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
