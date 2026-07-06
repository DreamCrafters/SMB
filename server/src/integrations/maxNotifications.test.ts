import assert from "node:assert/strict";
import test from "node:test";
import { createMaxNotificationService } from "./maxNotifications.js";
import type { MaxNotificationRecipients } from "./googleSheetsReference.js";
import type { DispatcherSubmission } from "../domain/dispatcherSubmission.js";

const recipients: MaxNotificationRecipients = {
  incidentAndEquipment: ["-1001"],
  mechanicalDowntime: ["2001"],
  electricalDowntime: ["3001"],
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
      location: "Цех №1",
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
      "[SMB Monitor] Открытие инцидента INC-2026-1",
      "",
      "Форма: incident",
      "Статус: received",
      "Бизнес-аккаунт: business-id",
      "Кратко: submission summary",
      "Получено: 2026-07-06T00:00:01.000Z",
      "",
      "Данные:",
      "incidentNumber: INC-2026-1",
      "Место (цех/участок): Цех №1",
    ].join("\n"),
    notify: true,
  });
});

test("createMaxNotificationService adds specialized recipients", async () => {
  const sentUrls: string[] = [];
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
        sentUrls.push(String(input));

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
    },
  );

  assert.deepEqual(sentUrls, [
    "https://platform-api2.max.ru/messages?user_id=1001",
    "https://platform-api2.max.ru/messages?user_id=2001",
    "https://platform-api2.max.ru/messages?user_id=3001",
  ]);
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
