import { once } from "node:events";
import assert from "node:assert/strict";
import test from "node:test";
import type { AddressInfo } from "node:net";
import type { ServerConfig } from "../config/env.js";
import type { DispatcherSubmissionsRepository } from "../repositories/dispatcherSubmissionsRepository.js";
import type { ValidatedDispatcherSubmissionDraft } from "../domain/dispatcherSubmission.js";
import type {
  DispatcherReferenceDataSource,
  NotificationRecipients,
} from "../integrations/googleSheetsReference.js";
import type { EmailNotificationService } from "../integrations/emailNotifications.js";
import type { MaxNotificationService } from "../integrations/maxNotifications.js";
import { getDispatcherFormDefinition } from "../domain/dispatcherForms.js";
import { createApiServer } from "./app.js";

const config: ServerConfig = {
  port: 0,
  databaseUrl: "mysql://unused:unused@127.0.0.1:3306/unused",
  corsOrigins: [
    "http://frontend.test",
    "https://smb-*-artemi-z-s-projects.vercel.app",
  ],
  runMigrationsOnStart: false,
  googleSheetsReference: {
    url: "https://docs.google.com/spreadsheets/d/test/edit?gid=0#gid=0",
    responsibleColumn: "Ответственный за регистрацию",
    locationColumn: "Места (цех/участок)",
    notificationEmailColumns: [
      "Адресаты по инцидентам и оборуджованию (емейлы)",
    ],
    maxUserIdColumns: [
      "Чаты пользователей",
    ],
    visitorNotificationEmailColumns: [
      "Адресаты по посетителям (емейлы)",
    ],
    visitorMaxUserIdColumns: [
      "Адресаты по посетителям (МАКС)",
    ],
    cacheTtlMs: 300_000,
    authMode: "public_csv",
  },
  emailNotifications: {
    enabled: false,
    from: "",
    subjectPrefix: "SMB Monitor",
    smtpPort: 587,
    smtpSecure: false,
  },
  maxNotifications: {
    enabled: false,
    apiBaseUrl: "https://platform-api2.max.ru",
    recipientIdType: "user_id",
    subjectPrefix: "SMB Monitor",
  },
};

const dispatcherSubmissions: DispatcherSubmissionsRepository = {
  async create(value, submittedByAccountId) {
    return {
      id: "submission-id",
      businessAccountId: value.draft.businessAccountId,
      formId: value.draft.formId,
      formTitle: "Оборудование",
      payload: value.draft.payload,
      summary: value.summary,
      status: "received",
      submittedByAccountId,
      submittedAt: "2026-06-18T00:00:00.000Z",
      receivedAt: "2026-06-18T00:00:01.000Z",
    };
  },
  async recordEquipmentReportRevision() {
    // The default test repository does not need revision assertions.
  },
  async listLatest() {
    return [];
  },
  async readSummary() {
    return {
      total: 0,
      byForm: [],
    };
  },
};

const emptyReferenceDataSource: DispatcherReferenceDataSource = {
  async read() {
    return {
      incidentLocationOptions: [],
      incidentResponsibleOptions: [],
      notificationRecipients: {
        incidentAndEquipment: [],
        mechanicalDowntime: [],
        electricalDowntime: [],
        visitors: [],
      },
      maxNotificationRecipients: {
        incidentAndEquipment: [],
        mechanicalDowntime: [],
        electricalDowntime: [],
        visitors: [],
      },
    };
  },
};

const equipmentOptions =
  getDispatcherFormDefinition("equipment")?.fields.find(
    (field) => field.name === "equipment",
  )?.options ?? [];

function buildCompleteEquipmentReport(
  overrides: Record<string, Record<string, string>> = {},
) {
  return equipmentOptions.map((equipment, index) => ({
    reportDate: "2026-06-18",
    equipment,
    productionTons: String(index + 1),
    ...overrides[equipment],
  }));
}

const today = new Date();

const openVisitorSubmission = {
  id: "visitor-entry-id",
  businessAccountId: "business-id",
  formId: "visitor" as const,
  formTitle: "Вход посетителя",
  payload: {
    fio: "Visitor Name",
    organization: "External Org",
    entryAt: formatScriptDateTime(today),
  },
  summary: "Visitor Name",
  status: "received" as const,
  submittedByAccountId: "dispatcher-account",
  submittedAt: today.toISOString(),
  receivedAt: today.toISOString(),
};

const openIncidentSubmission = {
  id: "incident-id",
  businessAccountId: "business-id",
  formId: "incident" as const,
  formTitle: "Открытие инцидента",
  payload: {
    incidentNumber: "INC-2026-1",
    datetime: formatScriptDateTime(today),
    location: "Цех 1",
    incidentType: "Травма",
    criticality: "Высокий",
  },
  summary: "INC-2026-1",
  status: "received" as const,
  submittedByAccountId: "dispatcher-account",
  submittedAt: today.toISOString(),
  receivedAt: today.toISOString(),
};

test("remote API returns an empty access profile without a dev session", async () => {
  await withApiServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/access/profile`, {
      headers: {
        Origin: "http://frontend.test",
      },
    });

    assert.equal(response.status, 200);
    assert.equal(
      response.headers.get("access-control-allow-origin"),
      "http://frontend.test",
    );
    assert.deepEqual(await response.json(), { profile: null });
  });
});

test("remote API allows configured Vercel preview origin patterns", async () => {
  await withApiServer(async (baseUrl) => {
    const origin = "https://smb-14uw5huc0-artemi-z-s-projects.vercel.app";
    const response = await fetch(`${baseUrl}/health`, {
      headers: { Origin: origin },
    });

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("access-control-allow-origin"), origin);
  });
});

test("remote API does not allow unrelated Vercel origins", async () => {
  await withApiServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/health`, {
      headers: { Origin: "https://other-project.vercel.app" },
    });

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("access-control-allow-origin"), null);
  });
});

test("remote API allows dev access session DELETE preflight", async () => {
  await withApiServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/dev/access-session`, {
      method: "OPTIONS",
      headers: {
        Origin: "http://frontend.test",
        "Access-Control-Request-Method": "DELETE",
        "Access-Control-Request-Headers": "Accept,X-SMB-Dev-Session",
      },
    });

    assert.equal(response.status, 204);
    assert.equal(
      response.headers.get("access-control-allow-origin"),
      "http://frontend.test",
    );
    assert.match(
      response.headers.get("access-control-allow-methods") ?? "",
      /\bDELETE\b/,
    );
    assert.match(
      response.headers.get("access-control-allow-headers") ?? "",
      /\bX-SMB-Dev-Session\b/,
    );
  });
});

test("remote API creates and reads dev access sessions by header", async () => {
  await withApiServer(async (baseUrl) => {
    const sessionResponse = await fetch(`${baseUrl}/api/dev/access-session`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ accountType: "dispatcher" }),
    });
    const sessionPayload = await sessionResponse.json();

    assert.equal(sessionResponse.status, 200);
    assert.equal(isRecord(sessionPayload) ? sessionPayload.ok : undefined, true);
    assert.equal(
      isRecord(sessionPayload) ? typeof sessionPayload.sessionId : undefined,
      "string",
    );

    if (!isRecord(sessionPayload) || typeof sessionPayload.sessionId !== "string") {
      throw new Error("Expected dev access session id.");
    }

    const profileResponse = await fetch(`${baseUrl}/api/access/profile`, {
      headers: {
        "X-SMB-Dev-Session": sessionPayload.sessionId,
      },
    });
    const profilePayload = await profileResponse.json();

    assert.equal(profileResponse.status, 200);
    assert.equal(readProfileAccountType(profilePayload), "dispatcher");
    assert.deepEqual(readProfileCapabilities(profilePayload), [
      "business.submit_dispatcher_forms",
    ]);
  });
});

test("remote API returns dispatcher form definitions", async () => {
  await withApiServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/dispatcher/forms`);
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(Array.isArray(isRecord(payload) ? payload.forms : undefined), true);
    assert.equal(
      isRecord(payload) && Array.isArray(payload.forms)
        ? payload.forms.some(
            (form) => isRecord(form) && form.id === "equipment",
          )
        : false,
      true,
    );
  });
});

test("remote API enriches incident location and responsible options from reference data", async () => {
  const referenceDataSource: DispatcherReferenceDataSource = {
    async read() {
      return {
        incidentLocationOptions: ["Цех №1", "Участок №2"],
        incidentResponsibleOptions: ["Иван Иванов", "Пётр Петров"],
        notificationRecipients: {
          incidentAndEquipment: [],
          mechanicalDowntime: [],
          electricalDowntime: [],
          visitors: [],
        },
        maxNotificationRecipients: {
          incidentAndEquipment: [],
          mechanicalDowntime: [],
          electricalDowntime: [],
          visitors: [],
        },
      };
    },
  };

  await withApiServer(
    async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/dispatcher/forms`);
      const payload = await response.json();
      const incidentForm =
        isRecord(payload) && Array.isArray(payload.forms)
          ? payload.forms.find(
              (form) => isRecord(form) && form.id === "incident",
            )
          : undefined;
      const locationField =
        isRecord(incidentForm) && Array.isArray(incidentForm.fields)
          ? incidentForm.fields.find(
              (field) => isRecord(field) && field.name === "location",
            )
          : undefined;
      const responsibleField =
        isRecord(incidentForm) && Array.isArray(incidentForm.fields)
          ? incidentForm.fields.find(
              (field) => isRecord(field) && field.name === "responsible",
            )
          : undefined;

      assert.equal(response.status, 200);
      assert.equal(
        isRecord(locationField) ? locationField.type : undefined,
        "select",
      );
      assert.deepEqual(
        isRecord(locationField) ? locationField.options : undefined,
        ["Цех №1", "Участок №2"],
      );
      assert.equal(
        isRecord(responsibleField) ? responsibleField.type : undefined,
        "select",
      );
      assert.deepEqual(
        isRecord(responsibleField) ? responsibleField.options : undefined,
        ["Иван Иванов", "Пётр Петров"],
      );
    },
    dispatcherSubmissions,
    referenceDataSource,
  );
});

test("remote API creates dispatcher submissions with form payload", async () => {
  await withApiServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/dispatcher/submissions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-SMB-Account-Id": "dispatcher-account",
      },
      body: JSON.stringify({
        businessAccountId: "business-id",
        formId: "equipment",
        payload: {
          reportDate: "2026-06-18",
          equipment: "Пресс №1",
          productionTons: "42",
        },
      }),
    });
    const payload = await response.json();

    assert.equal(response.status, 201);
    assert.equal(
      isRecord(payload) && isRecord(payload.submission)
        ? payload.submission.formId
        : undefined,
      "equipment",
    );
    assert.equal(
      isRecord(payload) && isRecord(payload.submission)
        ? payload.submission.submittedByAccountId
        : undefined,
      "dispatcher-account",
    );
  });
});

test("remote API notifies recipients after successful incident submission", async () => {
  let notifiedSubmissionId: string | undefined;
  let notifiedRecipients: NotificationRecipients | undefined;
  let maxNotifiedSubmissionId: string | undefined;
  let maxNotifiedRecipients: NotificationRecipients | undefined;
  const referenceDataSource: DispatcherReferenceDataSource = {
    async read() {
      return {
        incidentLocationOptions: [],
        incidentResponsibleOptions: [],
        notificationRecipients: {
          incidentAndEquipment: ["common@example.com"],
          mechanicalDowntime: ["mechanic@example.com"],
          electricalDowntime: [],
          visitors: [],
        },
        maxNotificationRecipients: {
          incidentAndEquipment: ["1001"],
          mechanicalDowntime: ["2001"],
          electricalDowntime: [],
          visitors: [],
        },
      };
    },
  };
  const emailNotificationService: EmailNotificationService = {
    async sendDispatcherSubmissionNotification(submission, recipients) {
      notifiedSubmissionId = submission.id;
      notifiedRecipients = recipients;
    },
    async sendEquipmentReportNotification() {
      throw new Error("Unexpected equipment report notification.");
    },
  };
  const maxNotificationService: MaxNotificationService = {
    async sendDispatcherSubmissionNotification(submission, recipients) {
      maxNotifiedSubmissionId = submission.id;
      maxNotifiedRecipients = recipients;
    },
    async sendEquipmentReportNotification() {
      throw new Error("Unexpected equipment report notification.");
    },
  };

  await withApiServer(
    async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/dispatcher/submissions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          businessAccountId: "business-id",
          formId: "incident",
          payload: {
            datetime: "2026-06-18T10:30",
            location: "Цех №1",
            incidentType: "Поломка оборудования по мех. части",
            description: "Поломка",
            criticality: "Средний",
            responsible: "Диспетчер",
            immediateActions: "Остановили участок",
          },
        }),
      });

      assert.equal(response.status, 201);
      assert.equal(notifiedSubmissionId, "submission-id");
      assert.deepEqual(notifiedRecipients, {
        incidentAndEquipment: ["common@example.com"],
        mechanicalDowntime: ["mechanic@example.com"],
        electricalDowntime: [],
        visitors: [],
      });
      assert.equal(maxNotifiedSubmissionId, "submission-id");
      assert.deepEqual(maxNotifiedRecipients, {
        incidentAndEquipment: ["1001"],
        mechanicalDowntime: ["2001"],
        electricalDowntime: [],
        visitors: [],
      });
    },
    dispatcherSubmissions,
    referenceDataSource,
    emailNotificationService,
    maxNotificationService,
  );
});

test("remote API notifies visitor recipients after successful visitor submission", async () => {
  let notifiedSubmissionId: string | undefined;
  let notifiedRecipients: NotificationRecipients | undefined;
  let maxNotifiedSubmissionId: string | undefined;
  let maxNotifiedRecipients: NotificationRecipients | undefined;
  const referenceDataSource: DispatcherReferenceDataSource = {
    async read() {
      return {
        incidentLocationOptions: [],
        incidentResponsibleOptions: [],
        notificationRecipients: {
          incidentAndEquipment: [],
          mechanicalDowntime: [],
          electricalDowntime: [],
          visitors: ["visitors@example.com"],
        },
        maxNotificationRecipients: {
          incidentAndEquipment: [],
          mechanicalDowntime: [],
          electricalDowntime: [],
          visitors: ["4001"],
        },
      };
    },
  };
  const emailNotificationService: EmailNotificationService = {
    async sendDispatcherSubmissionNotification(submission, recipients) {
      notifiedSubmissionId = submission.id;
      notifiedRecipients = recipients;
    },
    async sendEquipmentReportNotification() {
      throw new Error("Unexpected equipment report notification.");
    },
  };
  const maxNotificationService: MaxNotificationService = {
    async sendDispatcherSubmissionNotification(submission, recipients) {
      maxNotifiedSubmissionId = submission.id;
      maxNotifiedRecipients = recipients;
    },
    async sendEquipmentReportNotification() {
      throw new Error("Unexpected equipment report notification.");
    },
  };

  await withApiServer(
    async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/dispatcher/submissions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          businessAccountId: "business-id",
          formId: "visitor",
          payload: {
            fio: "Иван Иванов",
            organization: "ООО Ромашка",
            whom: "Склад",
          },
        }),
      });

      assert.equal(response.status, 201);
      assert.equal(notifiedSubmissionId, "submission-id");
      assert.deepEqual(notifiedRecipients, {
        incidentAndEquipment: [],
        mechanicalDowntime: [],
        electricalDowntime: [],
        visitors: ["visitors@example.com"],
      });
      assert.equal(maxNotifiedSubmissionId, "submission-id");
      assert.deepEqual(maxNotifiedRecipients, {
        incidentAndEquipment: [],
        mechanicalDowntime: [],
        electricalDowntime: [],
        visitors: ["4001"],
      });
    },
    dispatcherSubmissions,
    referenceDataSource,
    emailNotificationService,
    maxNotificationService,
  );
});

test("remote API sends one notification for a complete batched equipment report", async () => {
  let notifiedCount = 0;
  let notifiedStatus: "created" | "updated" | undefined;
  let maxNotifiedCount = 0;
  let maxNotifiedStatus: "created" | "updated" | undefined;
  const referenceDataSource: DispatcherReferenceDataSource = {
    async read() {
      return {
        incidentLocationOptions: [],
        incidentResponsibleOptions: [],
        notificationRecipients: {
          incidentAndEquipment: ["common@example.com"],
          mechanicalDowntime: ["mechanic@example.com"],
          electricalDowntime: [],
          visitors: [],
        },
        maxNotificationRecipients: {
          incidentAndEquipment: ["1001"],
          mechanicalDowntime: ["2001"],
          electricalDowntime: [],
          visitors: [],
        },
      };
    },
  };
  const emailNotificationService: EmailNotificationService = {
    async sendDispatcherSubmissionNotification() {
      throw new Error("Unexpected single submission notification.");
    },
    async sendEquipmentReportNotification(submissions, _recipients, status) {
      notifiedCount = submissions.length;
      notifiedStatus = status;
    },
  };
  const maxNotificationService: MaxNotificationService = {
    async sendDispatcherSubmissionNotification() {
      throw new Error("Unexpected single submission notification.");
    },
    async sendEquipmentReportNotification(submissions, _recipients, status) {
      maxNotifiedCount = submissions.length;
      maxNotifiedStatus = status;
    },
  };

  await withApiServer(
    async (baseUrl) => {
      const response = await fetch(
        `${baseUrl}/api/dispatcher/equipment-report`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            businessAccountId: "business-id",
            items: buildCompleteEquipmentReport({
              "Пресс №1": {
                productionTons: "42",
              },
              "Пресс №2": {
                productionTons: "12",
                downtimeReason: "Простой по мех, эл. части",
                downtimeHours: "8",
              },
            }),
          }),
        },
      );
      const payload = await response.json();

      assert.equal(response.status, 201);
      assert.equal(
        isRecord(payload) && Array.isArray(payload.submissions)
          ? payload.submissions.length
          : undefined,
        equipmentOptions.length,
      );
      assert.equal(
        isRecord(payload) ? payload.reportStatus : undefined,
        "created",
      );
      assert.equal(notifiedCount, equipmentOptions.length);
      assert.equal(notifiedStatus, "created");
      assert.equal(maxNotifiedCount, equipmentOptions.length);
      assert.equal(maxNotifiedStatus, "created");
    },
    dispatcherSubmissions,
    referenceDataSource,
    emailNotificationService,
    maxNotificationService,
  );
});

test("remote API rejects incomplete equipment reports", async () => {
  await withApiServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/dispatcher/equipment-report`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        businessAccountId: "business-id",
        items: [
          {
            reportDate: "2026-06-18",
            equipment: "Пресс №1",
            productionTons: "42",
          },
        ],
      }),
    });
    const payload = await response.json();

    assert.equal(response.status, 400);
    assert.match(
      isRecord(payload) && isRecord(payload.error)
        ? String(payload.error.message)
        : "",
      /must include all equipment/,
    );
  });
});

test("remote API records a revision when a batched equipment report changes", async () => {
  let revision:
    | Parameters<
        DispatcherSubmissionsRepository["recordEquipmentReportRevision"]
      >[0]
    | undefined;
  const repository = buildRepositoryWithHistory(
    [
      {
        id: "existing-submission-id",
        businessAccountId: "business-id",
        formId: "equipment",
        formTitle: "Оборудование",
        payload: {
          reportDate: "18.06.2026",
          equipment: "Пресс №1",
          productionTons: "40",
        },
        summary: "Оборудование: Пресс №1",
        status: "received",
        submittedByAccountId: "dispatcher-access-id",
        submittedAt: "2026-06-18T00:00:00.000Z",
        receivedAt: "2026-06-18T00:00:01.000Z",
      },
    ],
    undefined,
    (value) => {
      revision = value;
    },
  );

  await withApiServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/dispatcher/equipment-report`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-SMB-Account-Id": "dispatcher-access-id",
      },
      body: JSON.stringify({
        businessAccountId: "business-id",
        items: buildCompleteEquipmentReport({
          "Пресс №1": {
            productionTons: "42",
          },
        }),
      }),
    });
    const payload = await response.json();

    assert.equal(response.status, 201);
    assert.equal(isRecord(payload) ? payload.reportStatus : undefined, "updated");
    assert.equal(revision?.businessAccountId, "business-id");
    assert.equal(revision?.reportDate, "18.06.2026");
    assert.equal(revision?.status, "updated");
    assert.equal(revision?.submittedByAccountId, "dispatcher-access-id");
    assert.equal(revision?.submissions.length, equipmentOptions.length);
    assert.equal(revision?.submissions[0].payload.productionTons, "42");
  }, repository);
});

test("remote API rejects visitor entry when the visitor is already inside", async () => {
  await withApiServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/dispatcher/submissions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        businessAccountId: "business-id",
        formId: "visitor",
        payload: {
          fio: "Visitor Name",
          organization: "External Org",
        },
      }),
    });
    const payload = await response.json();

    assert.equal(response.status, 400);
    assert.match(
      isRecord(payload) && isRecord(payload.error)
        ? String(payload.error.message)
        : "",
      /already inside/,
    );
  }, buildRepositoryWithHistory([openVisitorSubmission]));
});

test("remote API enriches visitor exit from an open visitor entry", async () => {
  let createdPayload: Record<string, string> | undefined;
  const repository = buildRepositoryWithHistory([openVisitorSubmission], (value) => {
    createdPayload = value.draft.payload;
  });

  await withApiServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/dispatcher/submissions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        businessAccountId: "business-id",
        formId: "visitor_exit",
        payload: {
          visitorEntryId: "visitor-entry-id",
        },
      }),
    });
    const payload = await response.json();

    assert.equal(response.status, 201);
    assert.equal(
      isRecord(payload) && isRecord(payload.submission)
        ? payload.submission.formId
        : undefined,
      "visitor_exit",
    );
    assert.equal(createdPayload?.fio, "Visitor Name");
    assert.equal(createdPayload?.organization, "External Org");
  }, repository);
});

test("remote API rejects incident close when the incident is not open", async () => {
  await withApiServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/dispatcher/submissions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        businessAccountId: "business-id",
        formId: "incident_close",
        payload: {
          incidentNumber: "INC-2026-404",
          rootCauses: "Root cause",
          preventiveMeasures: "Preventive measures",
          closureDateTime: "2026-06-18T12:00",
          approvedBy: "Approver",
        },
      }),
    });
    const payload = await response.json();

    assert.equal(response.status, 400);
    assert.match(
      isRecord(payload) && isRecord(payload.error)
        ? String(payload.error.message)
        : "",
      /open incident/,
    );
  }, buildRepositoryWithHistory([]));
});

test("remote API accepts incident close for an earlier-day open incident", async () => {
  let createdPayload: Record<string, string> | undefined;
  const earlierOpenIncidentSubmission = {
    ...openIncidentSubmission,
    payload: {
      ...openIncidentSubmission.payload,
      datetime: "04.07.2026 10:00",
    },
    submittedAt: "2026-07-04T05:00:00.000Z",
    receivedAt: "2026-07-04T05:00:00.000Z",
  };
  const repository = buildRepositoryWithHistory(
    [earlierOpenIncidentSubmission],
    (value) => {
      createdPayload = value.draft.payload;
    },
  );

  await withApiServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/dispatcher/submissions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        businessAccountId: "business-id",
        formId: "incident_close",
        payload: {
          incidentNumber: "INC-2026-1",
          rootCauses: "Root cause",
          preventiveMeasures: "Preventive measures",
          closureDateTime: "2026-07-07T12:00",
          approvedBy: "Approver",
        },
      }),
    });
    const payload = await response.json();

    assert.equal(response.status, 201);
    assert.equal(
      isRecord(payload) && isRecord(payload.submission)
        ? payload.submission.formId
        : undefined,
      "incident_close",
    );
    assert.equal(createdPayload?.incidentNumber, "INC-2026-1");
    assert.equal(createdPayload?.incidentStatus, "Закрыт");
  }, repository);
});

async function withApiServer(
  callback: (baseUrl: string) => Promise<void>,
  repository = dispatcherSubmissions,
  referenceDataSource: DispatcherReferenceDataSource = emptyReferenceDataSource,
  emailNotificationService?: EmailNotificationService,
  maxNotificationService?: MaxNotificationService,
) {
  const server = createApiServer({
    config,
    dispatcherSubmissions: repository,
    referenceDataSource,
    emailNotificationService,
    maxNotificationService,
  });

  server.listen(0, "127.0.0.1");
  await once(server, "listening");

  const address = server.address() as AddressInfo;

  try {
    await callback(`http://127.0.0.1:${address.port}`);
  } finally {
    server.close();
    await once(server, "close");
  }
}

function buildRepositoryWithHistory(
  history: Awaited<ReturnType<DispatcherSubmissionsRepository["listLatest"]>>,
  onCreate?: (value: ValidatedDispatcherSubmissionDraft) => void,
  onRevision?: (
    value: Parameters<
      DispatcherSubmissionsRepository["recordEquipmentReportRevision"]
    >[0],
  ) => void,
): DispatcherSubmissionsRepository {
  return {
    async create(value, submittedByAccountId) {
      onCreate?.(value);

      return {
        id: "submission-id",
        businessAccountId: value.draft.businessAccountId,
        formId: value.draft.formId,
        formTitle: value.draft.formId,
        payload: value.draft.payload,
        summary: value.summary,
        status: "received",
        submittedByAccountId,
        submittedAt: "2026-06-18T00:00:00.000Z",
        receivedAt: "2026-06-18T00:00:01.000Z",
      };
    },
    async recordEquipmentReportRevision(value) {
      onRevision?.(value);
    },
    async listLatest() {
      return history;
    },
    async readSummary() {
      return {
        total: history.length,
        byForm: [],
      };
    },
  };
}

function readProfileAccountType(payload: unknown) {
  if (
    isRecord(payload) &&
    isRecord(payload.profile) &&
    typeof payload.profile.accountType === "string"
  ) {
    return payload.profile.accountType;
  }

  return undefined;
}

function readProfileCapabilities(payload: unknown) {
  if (
    isRecord(payload) &&
    isRecord(payload.profile) &&
    isRecord(payload.profile.activeAccess) &&
    Array.isArray(payload.profile.activeAccess.capabilities)
  ) {
    return payload.profile.activeAccess.capabilities;
  }

  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function formatScriptDateTime(value: Date) {
  return `${String(value.getDate()).padStart(2, "0")}.${String(
    value.getMonth() + 1,
  ).padStart(2, "0")}.${value.getFullYear()} ${String(
    value.getHours(),
  ).padStart(2, "0")}:${String(value.getMinutes()).padStart(2, "0")}`;
}
