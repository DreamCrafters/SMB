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
      "Новый инцидент!",
      "Дата и время инцидента: 06.07.2026 21:51",
      "Место (цех/участок): Цех №1",
      "Тип инцидента: Травма",
      "Описание: Описание",
      "Критичность: Средний",
      "Ответственный за регистрацию: Соколова Т.В.",
      "Оперативные меры: Оперативные меры",
      "Статус: Новый",
      "Номер инцидента: INC-2026-1",
    ].join("\n"),
    notify: true,
  });
});

test("createMaxNotificationService sends incident closure location", async () => {
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
      incidentNumber: "INC-2026-1",
      location: "Цех №1",
      rootCauses: "Root cause",
      preventiveMeasures: "Preventive measures",
      closureDateTime: "06.07.2026 12:40",
      approvedBy: "Иван Иванов",
      incidentStatus: "Закрыт",
    }),
    recipients,
  );

  assert.equal(sent.length, 1);
  assert.equal(
    sent[0]?.url,
    "https://platform-api2.max.ru/messages?user_id=-1001",
  );
  assert.match(
    JSON.parse(sent[0]?.body ?? "{}").text,
    /Место \(цех\/участок\): Цех №1/,
  );
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
    /Отчет по оборудованию!/,
  );
  assert.match(
    JSON.parse(sent[0]?.body ?? "{}").text,
    /Пресс №1: выработка 0 т; простой 8 ч; причина: Простой по мех\. и эл\. части/,
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
    /MAX responded with 403: \{"message":"access denied"\}/,
  );
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
  assert.match(JSON.parse(sent[0]?.body ?? "{}").text, /Посетитель вышел!/);
  assert.match(
    JSON.parse(sent[0]?.body ?? "{}").text,
    /Время выхода: 06\.07\.2026 12:40/,
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
    /Отчет по оборудованию изменен!/,
  );
  assert.match(JSON.parse(sent[0]?.body ?? "{}").text, /Позиций в отчете: 2/);
  assert.match(
    JSON.parse(sent[0]?.body ?? "{}").text,
    /Пресс №1: выработка 12 т; простой 0 ч/,
  );
  assert.match(
    JSON.parse(sent[0]?.body ?? "{}").text,
    /Пресс №2: выработка 0 т; простой 8 ч; причина: Простой по мех\. и эл\. части/,
  );
});

function buildSubmission(
  formId: DispatcherSubmission["formId"],
  payload: DispatcherSubmission["payload"],
): DispatcherSubmission {
  return {
    id: "submission-id",
    businessAccountId: "business-id",
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
