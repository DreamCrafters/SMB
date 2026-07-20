import { once } from "node:events";
import assert from "node:assert/strict";
import test from "node:test";
import type { AddressInfo } from "node:net";
import type { ServerConfig } from "../config/env.js";
import type {
  AccountType,
  AuthSessionService,
  ServerUserProfile,
} from "../domain/auth.js";
import { defaultCapabilitiesByAccountType } from "../domain/auth.js";
import type { DispatcherSubmissionsRepository } from "../repositories/dispatcherSubmissionsRepository.js";
import type { AdminDatabaseRepository } from "../repositories/adminDatabaseRepository.js";
import {
  ArchivedAccountLoginStatusError,
  AccountLoginAlreadyExistsError,
  type AccountsRepository,
} from "../repositories/accountsRepository.js";
import type { ValidatedDispatcherSubmissionDraft } from "../domain/dispatcherSubmission.js";
import type {
  DispatcherReferenceDataSource,
  NotificationRecipients,
} from "../integrations/googleSheetsReference.js";
import type { EmailNotificationService } from "../integrations/emailNotifications.js";
import type { MaxNotificationService } from "../integrations/maxNotifications.js";
import type { DispatcherSpreadsheetImportService } from "../integrations/dispatcherSpreadsheetImport.js";
import type { AuditRepository } from "../repositories/auditRepository.js";
import type { DatabaseTransactionRunner } from "../db/transactionContext.js";
import {
  productionSnapshotConfirmation,
  type ProductionDatabaseSnapshotService,
} from "../db/productionSnapshot.js";
import type {
  ProductionPlanRevision,
  ProductionPlansRepository,
} from "../repositories/productionPlansRepository.js";
import type {
  ProductionBrandLabel,
  ProductionBrandsRepository,
} from "../repositories/productionBrandsRepository.js";
import { getDispatcherFormDefinition } from "../domain/dispatcherForms.js";
import { createApiServer } from "./app.js";

const config: ServerConfig = {
  appEnv: "test",
  port: 0,
  databaseUrl: "mysql://unused:unused@127.0.0.1:3306/unused",
  productionSnapshot: {
    enabled: false,
  },
  corsOrigins: [
    "http://frontend.test",
    "https://smb-*-artemi-z-s-projects.vercel.app",
  ],
  runMigrationsOnStart: false,
  devAccessEnabled: true,
  session: {
    cookieName: "smb_test_session",
    ttlHours: 12,
  },
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

const productionConfig: ServerConfig = {
  ...config,
  appEnv: "production",
  devAccessEnabled: false,
  corsOrigins: ["https://smb.aonmou.ru"],
  session: {
    cookieName: "smb_session",
    ttlHours: 12,
  },
};

const dispatcherSubmissions: DispatcherSubmissionsRepository = {
  async create(value, submittedByAccountId) {
    return {
      id: "submission-id",
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

const adminDatabaseTable = {
  name: "dispatcher_submissions",
  label: "Диспетчерские записи",
  rowCount: 1,
  primaryKey: ["id"],
  canDelete: true,
  canClear: true,
  canMerge: false,
  columns: [
    {
      name: "summary",
      label: "Краткое описание",
      format: "text" as const,
      editable: true,
      multiline: true,
      nullable: false,
    },
  ],
};

const adminDatabase: AdminDatabaseRepository = {
  async listTables() {
    return [adminDatabaseTable];
  },
  async listRows() {
    return {
      table: adminDatabaseTable,
      rows: [
        {
          primaryKey: {
            id: "row-id",
          },
          values: {
            id: "row-id",
            summary: "saved",
          },
          editorFields: [
            {
              name: "summary",
              label: "Краткое описание",
              inputType: "textarea",
              required: true,
              options: [],
              value: "saved",
            },
          ],
        },
      ],
      mergeTargets: [],
      limit: 100,
      offset: 0,
    };
  },
  async updateRow() {
    // The default test repository does not need mutation assertions.
  },
  async mergeRows() {
    return {
      sourceLabel: "Исходная",
      targetLabel: "Целевая",
      updatedSubmissions: 0,
      combinedFacts: 0,
    };
  },
  async deleteRow() {
    // The default test repository does not need mutation assertions.
  },
  async clearTable() {
    return 0;
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
      "business.view_dispatcher_feed",
    ]);
  });
});

test("remote dev worker profile has no navigation or capabilities", async () => {
  await withApiServer(async (baseUrl) => {
    const sessionId = await createDevSession(baseUrl, "worker");
    const response = await fetch(`${baseUrl}/api/access/profile`, {
      headers: { "X-SMB-Dev-Session": sessionId },
    });
    const payload = await response.json();
    const profile = isRecord(payload) && isRecord(payload.profile) ? payload.profile : undefined;
    const access = profile !== undefined && isRecord(profile.activeAccess)
      ? profile.activeAccess
      : undefined;

    assert.equal(response.status, 200);
    assert.deepEqual(access?.navigationItems, []);
    assert.deepEqual(access?.capabilities, []);
  });
});

test("admin database API rejects non-admin dev sessions", async () => {
  await withApiServer(async (baseUrl) => {
    const sessionId = await createDevSession(baseUrl, "dispatcher");
    const response = await fetch(`${baseUrl}/api/admin/database`, {
      headers: {
        "X-SMB-Dev-Session": sessionId,
      },
    });
    const payload = await response.json();

    assert.equal(response.status, 403);
    assert.equal(
      isRecord(payload) && isRecord(payload.error)
        ? payload.error.code
        : undefined,
      "access_denied",
    );
  });
});

test("admin database API lists tables for admin dev sessions", async () => {
  await withApiServer(async (baseUrl) => {
    const sessionId = await createDevSession(baseUrl, "admin");
    const response = await fetch(`${baseUrl}/api/admin/database`, {
      headers: {
        "X-SMB-Dev-Session": sessionId,
      },
    });
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(
      isRecord(payload) &&
        Array.isArray(payload.tables) &&
        isRecord(payload.tables[0])
        ? payload.tables[0].name
        : undefined,
      "dispatcher_submissions",
    );
  });
});

test("test admin can fully replace the test database with a production snapshot", async () => {
  let replaceCalls = 0;
  const snapshotService: ProductionDatabaseSnapshotService = {
    isRunning() {
      return false;
    },
    async replaceTestDatabase() {
      replaceCalls += 1;
      return {
        tableCount: 12,
        rowCount: 345,
        authSessionsCleared: true,
      };
    },
  };

  await withApiServer(
    async (baseUrl) => {
      const sessionId = await createDevSession(baseUrl, "admin");
      const headers = {
        "Content-Type": "application/json",
        "X-SMB-Dev-Session": sessionId,
      };
      const statusResponse = await fetch(
        `${baseUrl}/api/admin/database/production-snapshot`,
        { headers },
      );
      const statusPayload = await statusResponse.json();

      assert.equal(statusResponse.status, 200);
      assert.equal(
        isRecord(statusPayload) ? statusPayload.available : undefined,
        true,
      );
      assert.equal(
        isRecord(statusPayload) ? statusPayload.confirmationPhrase : undefined,
        productionSnapshotConfirmation,
      );

      const rejectedResponse = await fetch(
        `${baseUrl}/api/admin/database/production-snapshot`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({ confirmation: "неверно" }),
        },
      );
      assert.equal(rejectedResponse.status, 400);
      assert.equal(replaceCalls, 0);

      const response = await fetch(
        `${baseUrl}/api/admin/database/production-snapshot`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            confirmation: productionSnapshotConfirmation,
          }),
        },
      );
      const payload = await response.json();

      assert.equal(response.status, 200);
      assert.equal(isRecord(payload) ? payload.tableCount : undefined, 12);
      assert.equal(isRecord(payload) ? payload.rowCount : undefined, 345);
      assert.equal(replaceCalls, 1);
    },
    dispatcherSubmissions,
    emptyReferenceDataSource,
    undefined,
    undefined,
    adminDatabase,
    config,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    snapshotService,
  );
});

test("admin audit API returns a per-account report limited by the server", async () => {
  let receivedFilters: Parameters<AuditRepository["listReport"]>[0];
  const auditRepository: AuditRepository = {
    async record() {},
    async listReport(filters) {
      receivedFilters = filters;
      return {
        events: [],
        actors: [],
        summary: {
          total: 0,
          byCategory: [
            { category: "authentication", count: 0 },
            { category: "navigation", count: 0 },
            { category: "form_submission", count: 0 },
            { category: "data_change", count: 0 },
            { category: "administration", count: 0 },
          ],
        },
        window: {
          from: "2026-04-16T00:00:00.000Z",
          to: "2026-07-16T00:00:00.000Z",
        },
        limit: filters?.limit ?? 50,
        offset: filters?.offset ?? 0,
      };
    },
  };

  await withApiServer(
    async (baseUrl) => {
      const adminSessionId = await createDevSession(baseUrl, "admin");
      const response = await fetch(
        `${baseUrl}/api/admin/audit-events?actorAccountId=access-1&category=navigation&limit=25&offset=50`,
        { headers: { "X-SMB-Dev-Session": adminSessionId } },
      );

      assert.equal(response.status, 200);
      assert.deepEqual(receivedFilters, {
        actorAccountId: "access-1",
        category: "navigation",
        limit: 25,
        offset: 50,
      });
      assert.equal(isRecord(await response.json()), true);
    },
    dispatcherSubmissions,
    emptyReferenceDataSource,
    undefined,
    undefined,
    adminDatabase,
    config,
    undefined,
    undefined,
    undefined,
    auditRepository,
  );
});

test("admin audit API rejects accounts without the audit capability", async () => {
  const auditRepository: AuditRepository = {
    async record() {},
    async listReport() {
      throw new Error("must not be called");
    },
  };

  await withApiServer(
    async (baseUrl) => {
      const dispatcherSessionId = await createDevSession(baseUrl, "dispatcher");
      const response = await fetch(`${baseUrl}/api/admin/audit-events`, {
        headers: { "X-SMB-Dev-Session": dispatcherSessionId },
      });

      assert.equal(response.status, 403);
    },
    dispatcherSubmissions,
    emptyReferenceDataSource,
    undefined,
    undefined,
    adminDatabase,
    config,
    undefined,
    undefined,
    undefined,
    auditRepository,
  );
});

test("manager audit API is scoped to the organization", async () => {
  let receivedFilters: Parameters<AuditRepository["listReport"]>[0];
  const auditRepository: AuditRepository = {
    async record() {},
    async listReport(filters) {
      receivedFilters = filters;
      return {
        events: [],
        actors: [],
        summary: {
          total: 0,
          byCategory: [
            { category: "authentication", count: 0 },
            { category: "navigation", count: 0 },
            { category: "form_submission", count: 0 },
            { category: "data_change", count: 0 },
            { category: "administration", count: 0 },
          ],
        },
        window: {
          from: "2026-04-16T00:00:00.000Z",
          to: "2026-07-16T00:00:00.000Z",
        },
        limit: filters?.limit ?? 50,
        offset: filters?.offset ?? 0,
      };
    },
  };
  const profile = buildProductionProfile("business_owner");
  profile.activeAccess.navigationItems.push("business.user_actions");
  profile.activeAccess.capabilities.push("business.view_user_actions");
  const authService = buildAuthService({ profile });

  await withApiServer(
    async (baseUrl) => {
      const response = await fetch(
        `${baseUrl}/api/admin/audit-events?category=navigation`,
        { headers: { Cookie: "smb_session=prod-session" } },
      );

      assert.equal(response.status, 200);
      assert.deepEqual(receivedFilters, {
        organizationOnly: true,
        category: "navigation",
      });
    },
    dispatcherSubmissions,
    emptyReferenceDataSource,
    undefined,
    undefined,
    adminDatabase,
    productionConfig,
    authService,
    undefined,
    undefined,
    auditRepository,
  );
});

test("screen view API derives the actor from the session and allows known screens only", async () => {
  const recorded: Parameters<AuditRepository["record"]>[0][] = [];
  const auditRepository: AuditRepository = {
    async record(event) {
      recorded.push(event);
    },
    async listReport() {
      throw new Error("not used");
    },
  };

  await withApiServer(
    async (baseUrl) => {
      const dispatcherSessionId = await createDevSession(baseUrl, "dispatcher");
      const headers = {
        "Content-Type": "application/json",
        "X-SMB-Dev-Session": dispatcherSessionId,
      };
      const response = await fetch(`${baseUrl}/api/audit/events`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          screenId: "business.dispatcher_form",
          actorAccountId: "forged-account",
          summary: "forged summary",
        }),
      });
      const invalidResponse = await fetch(`${baseUrl}/api/audit/events`, {
        method: "POST",
        headers,
        body: JSON.stringify({ screenId: "admin.secret-screen" }),
      });
      const forbiddenResponse = await fetch(`${baseUrl}/api/audit/events`, {
        method: "POST",
        headers,
        body: JSON.stringify({ screenId: "admin.database" }),
      });

      assert.equal(response.status, 201);
      assert.equal(invalidResponse.status, 400);
      assert.equal(forbiddenResponse.status, 403);
      const viewEvents = recorded.filter((event) => event.action === "view.screen");
      assert.equal(viewEvents.length, 1);
      assert.equal(viewEvents[0]?.actor.accountId, "dev-access-dispatcher");
      assert.equal(viewEvents[0]?.summary, "Открыт экран «Выбор диспетчерской формы»");
      assert.equal(viewEvents[0]?.targetId, "business.dispatcher_form");
      assert.doesNotMatch(JSON.stringify(viewEvents), /forged/u);
    },
    dispatcherSubmissions,
    emptyReferenceDataSource,
    undefined,
    undefined,
    adminDatabase,
    config,
    undefined,
    undefined,
    undefined,
    auditRepository,
  );
});

test("admin dispatcher import API previews and executes for admin sessions", async () => {
  let submittedByAccountId = "";
  let previewCalls = 0;
  const importService: DispatcherSpreadsheetImportService = {
    async preview() {
      previewCalls += 1;
      return {
        previewToken: "a".repeat(64),
        totalRecords: 5,
        newRecords: 5,
        existingRecords: 0,
        sheets: [],
        warnings: [],
      };
    },
    async execute(value) {
      submittedByAccountId = value.submittedByAccountId;
      return { totalRecords: 5, inserted: 5, skipped: 0 };
    },
  };

  await withApiServer(
    async (baseUrl) => {
      const sessionId = await createDevSession(baseUrl, "admin");
      const headers = {
        "Content-Type": "application/json",
        "X-SMB-Dev-Session": sessionId,
      };
      const previewResponse = await fetch(
        `${baseUrl}/api/admin/database/imports/dispatcher/preview`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            spreadsheetUrl:
              "https://docs.google.com/spreadsheets/d/source_sheet_123/edit",
          }),
        },
      );
      const executeResponse = await fetch(
        `${baseUrl}/api/admin/database/imports/dispatcher/execute`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            spreadsheetUrl:
              "https://docs.google.com/spreadsheets/d/source_sheet_123/edit",
            previewToken: "a".repeat(64),
          }),
        },
      );
      assert.equal(previewResponse.status, 200);
      assert.equal(executeResponse.status, 200);
      assert.equal(previewCalls, 1);
      assert.equal(submittedByAccountId, "dev-access-admin");
    },
    dispatcherSubmissions,
    emptyReferenceDataSource,
    undefined,
    undefined,
    adminDatabase,
    config,
    undefined,
    undefined,
    importService,
  );
});

test("admin dispatcher import API rejects dispatcher sessions", async () => {
  const importService: DispatcherSpreadsheetImportService = {
    async preview() {
      throw new Error("must not be called");
    },
    async execute() {
      throw new Error("must not be called");
    },
  };

  await withApiServer(
    async (baseUrl) => {
      const sessionId = await createDevSession(baseUrl, "dispatcher");
      const response = await fetch(
        `${baseUrl}/api/admin/database/imports/dispatcher`,
        { headers: { "X-SMB-Dev-Session": sessionId } },
      );

      assert.equal(response.status, 403);
    },
    dispatcherSubmissions,
    emptyReferenceDataSource,
    undefined,
    undefined,
    adminDatabase,
    config,
    undefined,
    undefined,
    importService,
  );
});

test("admin database API forwards update and delete mutations for admin sessions", async () => {
  let updatePayload:
    | Parameters<AdminDatabaseRepository["updateRow"]>[0]
    | undefined;
  let deletePayload:
    | Parameters<AdminDatabaseRepository["deleteRow"]>[0]
    | undefined;
  const repository: AdminDatabaseRepository = {
    ...adminDatabase,
    async updateRow(value) {
      updatePayload = value;
    },
    async deleteRow(value) {
      deletePayload = value;
    },
  };
  const auditEvents: Parameters<AuditRepository["record"]>[0][] = [];
  const auditRepository: AuditRepository = {
    async record(event) {
      auditEvents.push(event);
    },
    async listReport() {
      throw new Error("not used");
    },
  };

  await withApiServer(
    async (baseUrl) => {
      const sessionId = await createDevSession(baseUrl, "admin");
      const headers = {
        "Content-Type": "application/json",
        "X-SMB-Dev-Session": sessionId,
      };
      const updateResponse = await fetch(
        `${baseUrl}/api/admin/database/tables/dispatcher_submissions/rows`,
        {
          method: "PATCH",
          headers,
          body: JSON.stringify({
            primaryKey: {
              id: "row-id",
            },
            values: {
              summary: "updated",
            },
          }),
        },
      );
      const deleteResponse = await fetch(
        `${baseUrl}/api/admin/database/tables/dispatcher_submissions/rows`,
        {
          method: "DELETE",
          headers,
          body: JSON.stringify({
            primaryKey: {
              id: "row-id",
            },
            values: {},
          }),
        },
      );

      assert.equal(updateResponse.status, 200);
      assert.equal(deleteResponse.status, 200);
    },
    dispatcherSubmissions,
    emptyReferenceDataSource,
    undefined,
    undefined,
    repository,
    config,
    undefined,
    undefined,
    undefined,
    auditRepository,
  );

  assert.deepEqual(updatePayload, {
    tableName: "dispatcher_submissions",
    primaryKey: {
      id: "row-id",
    },
    values: {
      summary: "updated",
    },
    changedByAccountId: "dev-access-admin",
  });
  assert.deepEqual(deletePayload, {
    tableName: "dispatcher_submissions",
    primaryKey: {
      id: "row-id",
    },
  });
  assert.deepEqual(
    auditEvents.find((event) => event.action === "data.delete")?.details,
    [],
  );
});

test("admin database API merges two rows through an audited server action", async () => {
  let mergePayload:
    | Parameters<AdminDatabaseRepository["mergeRows"]>[0]
    | undefined;
  const repository: AdminDatabaseRepository = {
    ...adminDatabase,
    async mergeRows(value) {
      mergePayload = value;
      return {
        sourceLabel: "ША-1",
        targetLabel: "ША-2",
        updatedSubmissions: 3,
        combinedFacts: 1,
      };
    },
  };
  const auditEvents: Parameters<AuditRepository["record"]>[0][] = [];
  const auditRepository: AuditRepository = {
    async record(event) {
      auditEvents.push(event);
    },
    async listReport() {
      throw new Error("not used");
    },
  };

  await withApiServer(
    async (baseUrl) => {
      const sessionId = await createDevSession(baseUrl, "admin");
      const response = await fetch(
        `${baseUrl}/api/admin/database/tables/production_chamotte_brands/rows/merge`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-SMB-Dev-Session": sessionId,
          },
          body: JSON.stringify({
            sourcePrimaryKey: { id: "brand-source" },
            targetPrimaryKey: { id: "brand-target" },
          }),
        },
      );

      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { ok: true });
    },
    dispatcherSubmissions,
    emptyReferenceDataSource,
    undefined,
    undefined,
    repository,
    config,
    undefined,
    undefined,
    undefined,
    auditRepository,
  );

  assert.deepEqual(mergePayload, {
    tableName: "production_chamotte_brands",
    sourcePrimaryKey: { id: "brand-source" },
    targetPrimaryKey: { id: "brand-target" },
  });
  assert.deepEqual(
    auditEvents.find((event) => event.action === "data.update"),
    {
      actor: {
        accountId: "dev-access-admin",
        userId: "dev-user-admin",
        displayName: "Dev administrator",
        positionDisplayName: "Администратор",
      },
      category: "data_change",
      action: "data.update",
      summary: "Марка «ША-1» слита в «ША-2»",
      details: [
        { label: "Исходная марка", value: "ША-1" },
        { label: "Целевая марка", value: "ША-2" },
        { label: "Обновлено отчётов", value: "3" },
        { label: "Объединено фактов", value: "1" },
      ],
      targetType: "production_brand",
      targetId: "production_chamotte_brands",
    },
  );
});

test("admin database mutations require the capability of the affected admin area", async () => {
  let didUpdate = false;
  const repository: AdminDatabaseRepository = {
    ...adminDatabase,
    async updateRow() {
      didUpdate = true;
    },
  };
  const profile = buildProductionProfile("admin");
  profile.activeAccess.capabilities = ["platform.manage_analytics_database"];

  await withApiServer(
    async (baseUrl) => {
      const response = await fetch(
        `${baseUrl}/api/admin/database/tables/app_users/rows`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Cookie: `${productionConfig.session.cookieName}=prod-session`,
          },
          body: JSON.stringify({
            primaryKey: { id: "another-user" },
            values: { status: "suspended" },
          }),
        },
      );

      assert.equal(response.status, 403);
    },
    dispatcherSubmissions,
    emptyReferenceDataSource,
    undefined,
    undefined,
    repository,
    productionConfig,
    buildAuthService({ profile }),
  );

  assert.equal(didUpdate, false);
});

test("admin database API does not disable the current administrator", async () => {
  let didUpdate = false;
  const repository: AdminDatabaseRepository = {
    ...adminDatabase,
    async updateRow() {
      didUpdate = true;
    },
  };

  await withApiServer(
    async (baseUrl) => {
      const sessionId = await createDevSession(baseUrl, "admin");
      const response = await fetch(
        `${baseUrl}/api/admin/database/tables/app_users/rows`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            "X-SMB-Dev-Session": sessionId,
          },
          body: JSON.stringify({
            primaryKey: { id: "dev-user-admin" },
            values: { status: "suspended" },
          }),
        },
      );

      assert.equal(response.status, 400);
    },
    dispatcherSubmissions,
    emptyReferenceDataSource,
    undefined,
    undefined,
    repository,
  );

  assert.equal(didUpdate, false);
});

test("admin mutation rolls back when its audit event cannot be persisted", async () => {
  let updatePersisted = false;
  const repository: AdminDatabaseRepository = {
    ...adminDatabase,
    async updateRow() {
      updatePersisted = true;
    },
  };
  const auditRepository: AuditRepository = {
    async record(event) {
      if (event.action === "data.update") {
        throw new Error("audit unavailable");
      }
    },
    async listReport() {
      throw new Error("not used");
    },
  };
  const databaseTransaction: DatabaseTransactionRunner = {
    async run(operation) {
      const previousValue = updatePersisted;

      try {
        return await operation();
      } catch (error) {
        updatePersisted = previousValue;
        throw error;
      }
    },
  };

  await withApiServer(
    async (baseUrl) => {
      const sessionId = await createDevSession(baseUrl, "admin");
      const response = await fetch(
        `${baseUrl}/api/admin/database/tables/dispatcher_submissions/rows`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            "X-SMB-Dev-Session": sessionId,
          },
          body: JSON.stringify({
            primaryKey: { id: "row-id" },
            values: { summary: "updated" },
          }),
        },
      );

      assert.equal(response.status, 400);
      assert.match(JSON.stringify(await response.json()), /audit unavailable/u);
      assert.equal(updatePersisted, false);
    },
    dispatcherSubmissions,
    emptyReferenceDataSource,
    undefined,
    undefined,
    repository,
    config,
    undefined,
    undefined,
    undefined,
    auditRepository,
    databaseTransaction,
  );
});

test("admin database API clears a section only after exact confirmation", async () => {
  const clearedTables: string[] = [];
  const repository: AdminDatabaseRepository = {
    ...adminDatabase,
    async clearTable(tableName) {
      clearedTables.push(tableName);
      return 582;
    },
  };

  await withApiServer(
    async (baseUrl) => {
      const adminSessionId = await createDevSession(baseUrl, "admin");
      const dispatcherSessionId = await createDevSession(baseUrl, "dispatcher");
      const endpoint =
        `${baseUrl}/api/admin/database/tables/dispatcher_submissions/rows/all`;
      const validResponse = await fetch(endpoint, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          "X-SMB-Dev-Session": adminSessionId,
        },
        body: JSON.stringify({ confirmation: "dispatcher_submissions" }),
      });
      const validPayload = await validResponse.json();
      const invalidConfirmationResponse = await fetch(endpoint, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          "X-SMB-Dev-Session": adminSessionId,
        },
        body: JSON.stringify({ confirmation: "wrong_table" }),
      });
      const forbiddenResponse = await fetch(endpoint, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          "X-SMB-Dev-Session": dispatcherSessionId,
        },
        body: JSON.stringify({ confirmation: "dispatcher_submissions" }),
      });

      assert.equal(validResponse.status, 200);
      assert.deepEqual(validPayload, { ok: true, deleted: 582 });
      assert.equal(invalidConfirmationResponse.status, 400);
      assert.equal(forbiddenResponse.status, 403);
    },
    dispatcherSubmissions,
    emptyReferenceDataSource,
    undefined,
    undefined,
    repository,
  );

  assert.deepEqual(clearedTables, ["dispatcher_submissions"]);
});

const adminAccount = {
  accessId: "access-id",
  userId: "user-id",
  login: "dispatcher-1",
  userDisplayName: "Диспетчер Один",
  userStatus: "active" as const,
  accessDisplayName: "Диспетчер Один access",
  accountType: "dispatcher" as AccountType,
  position: "dispatcher" as const,
  positionDisplayName: "Диспетчер",
  scope: { kind: "organization" as const },
  capabilities: ["business.submit_dispatcher_forms" as const],
  navigationItems: ["business.dispatcher_form" as const],
  createdAt: "2026-07-10T00:00:00.000Z",
};

const accounts: AccountsRepository = {
  async listAccounts() {
    return [adminAccount];
  },
  async createAccount() {
    return adminAccount;
  },
  async resetPassword() {
    return true;
  },
  async setAccountLoginEnabled({ userId, isEnabled }) {
    return {
      userId,
      userStatus: isEnabled ? "active" : "suspended",
    };
  },
  async deleteAccount() {
    return true;
  },
  async setAccountNavigation() {
    return adminAccount;
  },
  async setAccountPosition() {
    return { previous: adminAccount, updated: adminAccount };
  },
  async listPositions() {
    return [
      {
        id: "dispatcher",
        displayName: "Диспетчер",
        accountType: "dispatcher",
        navigationItems: ["business.dispatcher", "business.dispatcher_form"],
        capabilities: ["business.submit_dispatcher_forms", "business.view_dispatcher_feed"],
        isProtected: true,
        usageCount: 1,
        createdAt: "2026-07-10T00:00:00.000Z",
      },
      {
        id: "business_owner",
        displayName: "Владелец бизнеса",
        accountType: "business_owner",
        navigationItems: ["business.overview", "business.dispatcher"],
        capabilities: ["business.view_all_statistics", "business.view_dispatcher_feed"],
        isProtected: true,
        usageCount: 0,
        createdAt: "2026-07-10T00:00:00.000Z",
      },
    ];
  },
  async createPosition(input) {
    return { id: "created-position", ...input, isProtected: false, usageCount: 0, createdAt: "2026-07-10T00:00:00.000Z" };
  },
  async updatePosition(input) {
    return { id: input.id, displayName: input.displayName, accountType: "dispatcher", navigationItems: input.navigationItems, capabilities: input.capabilities, isProtected: false, usageCount: 1, createdAt: "2026-07-10T00:00:00.000Z" };
  },
  async deletePosition() {
    return "deleted";
  },
};

test("dev access options list current positions and open the selected cabinet", async () => {
  await withApiServer(
    async (baseUrl) => {
      const optionsResponse = await fetch(`${baseUrl}/api/dev/access-session`);
      const optionsPayload = await optionsResponse.json();

      assert.equal(optionsResponse.status, 200);
      assert.equal(
        isRecord(optionsPayload) &&
          Array.isArray(optionsPayload.options) &&
          isRecord(optionsPayload.options[0])
          ? optionsPayload.options[0].position
          : undefined,
        "dispatcher",
      );

      const sessionResponse = await fetch(`${baseUrl}/api/dev/access-session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ position: "business_owner" }),
      });
      const sessionPayload = await sessionResponse.json();
      const sessionId = isRecord(sessionPayload) && typeof sessionPayload.sessionId === "string"
        ? sessionPayload.sessionId
        : "";
      const profileResponse = await fetch(`${baseUrl}/api/access/profile`, {
        headers: { "X-SMB-Dev-Session": sessionId },
      });
      const profilePayload = await profileResponse.json();

      assert.equal(sessionResponse.status, 200);
      assert.equal(profileResponse.status, 200);
      assert.equal(
        isRecord(profilePayload) &&
          isRecord(profilePayload.profile) &&
          isRecord(profilePayload.profile.activeAccess)
          ? profilePayload.profile.activeAccess.positionDisplayName
          : undefined,
        "Владелец бизнеса",
      );
      assert.deepEqual(
        isRecord(profilePayload) &&
          isRecord(profilePayload.profile) &&
          isRecord(profilePayload.profile.activeAccess)
          ? profilePayload.profile.activeAccess.navigationItems
          : undefined,
        ["business.overview", "business.dispatcher"],
      );
    },
    dispatcherSubmissions,
    emptyReferenceDataSource,
    undefined,
    undefined,
    adminDatabase,
    config,
    undefined,
    accounts,
  );
});

test("admin accounts API rejects non-admin dev sessions", async () => {
  await withApiServer(
    async (baseUrl) => {
      const sessionId = await createDevSession(baseUrl, "dispatcher");
      const response = await fetch(`${baseUrl}/api/admin/accounts`, {
        headers: {
          "X-SMB-Dev-Session": sessionId,
        },
      });
      const payload = await response.json();

      assert.equal(response.status, 403);
      assert.equal(
        isRecord(payload) && isRecord(payload.error)
          ? payload.error.code
          : undefined,
        "access_denied",
      );
    },
    dispatcherSubmissions,
    emptyReferenceDataSource,
    undefined,
    undefined,
    adminDatabase,
    config,
    undefined,
    accounts,
  );
});

test("admin accounts API lists accounts for admin dev sessions", async () => {
  await withApiServer(
    async (baseUrl) => {
      const sessionId = await createDevSession(baseUrl, "admin");
      const response = await fetch(`${baseUrl}/api/admin/accounts`, {
        headers: {
          "X-SMB-Dev-Session": sessionId,
        },
      });
      const payload = await response.json();

      assert.equal(response.status, 200);
      assert.equal(
        isRecord(payload) &&
          Array.isArray(payload.accounts) &&
          isRecord(payload.accounts[0])
          ? payload.accounts[0].login
          : undefined,
        "dispatcher-1",
      );
    },
    dispatcherSubmissions,
    emptyReferenceDataSource,
    undefined,
    undefined,
    adminDatabase,
    config,
    undefined,
    accounts,
  );
});

test("admin access levels API is removed", async () => {
  await withApiServer(
    async (baseUrl) => {
      const sessionId = await createDevSession(baseUrl, "admin");
      const response = await fetch(`${baseUrl}/api/admin/access-levels`, {
        headers: { "X-SMB-Dev-Session": sessionId },
      });

      assert.equal(response.status, 404);
    },
    dispatcherSubmissions,
    emptyReferenceDataSource,
    undefined,
    undefined,
    adminDatabase,
    config,
    undefined,
    accounts,
  );
});

test("admin positions API creates a position from a supported base cabinet", async () => {
  let createdInput: Parameters<AccountsRepository["createPosition"]>[0] | undefined;
  const repository: AccountsRepository = {
    ...accounts,
    async createPosition(input) {
      createdInput = input;
      return { id: "position-chief", ...input, isProtected: false, usageCount: 0, createdAt: "2026-07-12T00:00:00.000Z" };
    },
  };

  await withApiServer(async (baseUrl) => {
    const sessionId = await createDevSession(baseUrl, "admin");
    const response = await fetch(`${baseUrl}/api/admin/positions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-SMB-Dev-Session": sessionId },
      body: JSON.stringify({
        displayName: "Главный инженер",
        accountType: "business_owner",
        navigationItems: ["business.overview", "business.dispatcher"],
      }),
    });

    assert.equal(response.status, 201);
  }, dispatcherSubmissions, emptyReferenceDataSource, undefined, undefined, adminDatabase, config, undefined, repository);

  assert.equal(createdInput?.accountType, "business_owner");
  assert.deepEqual(createdInput?.navigationItems, ["business.overview", "business.dispatcher"]);
  assert.equal(createdInput?.capabilities.includes("business.view_dispatcher_feed"), true);
});

test("admin positions API keeps the worker workspace empty", async () => {
  const created: Parameters<AccountsRepository["createPosition"]>[0][] = [];
  const repository: AccountsRepository = {
    ...accounts,
    async createPosition(input) {
      created.push(input);
      return { id: "position-worker", ...input, isProtected: false, usageCount: 0, createdAt: "2026-07-12T00:00:00.000Z" };
    },
  };

  await withApiServer(async (baseUrl) => {
    const sessionId = await createDevSession(baseUrl, "admin");
    const headers = { "Content-Type": "application/json", "X-SMB-Dev-Session": sessionId };
    const emptyResponse = await fetch(`${baseUrl}/api/admin/positions`, {
      method: "POST",
      headers,
      body: JSON.stringify({ displayName: "Работник склада", accountType: "worker", navigationItems: [] }),
    });
    const ownerAccessResponse = await fetch(`${baseUrl}/api/admin/positions`, {
      method: "POST",
      headers,
      body: JSON.stringify({ displayName: "Работник с обзором", accountType: "worker", navigationItems: ["business.overview"] }),
    });

    assert.equal(emptyResponse.status, 201);
    assert.equal(ownerAccessResponse.status, 400);
  }, dispatcherSubmissions, emptyReferenceDataSource, undefined, undefined, adminDatabase, config, undefined, repository);

  assert.equal(created.length, 1);
  assert.deepEqual(created[0]?.navigationItems, []);
  assert.deepEqual(created[0]?.capabilities, []);
});

test("admin positions API separates manager and dispatcher tabs", async () => {
  const repository: AccountsRepository = {
    ...accounts,
    async createPosition(input) {
      return { id: "position-split", ...input, isProtected: false, usageCount: 0, createdAt: "2026-07-12T00:00:00.000Z" };
    },
  };

  await withApiServer(async (baseUrl) => {
    const sessionId = await createDevSession(baseUrl, "admin");
    const headers = { "Content-Type": "application/json", "X-SMB-Dev-Session": sessionId };
    const managerResponse = await fetch(`${baseUrl}/api/admin/positions`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        displayName: "Руководитель участка",
        accountType: "business_owner",
        navigationItems: [
          "business.overview",
          "business.dispatcher",
          "business.work",
          "business.user_actions",
        ],
      }),
    });
    const managerFormResponse = await fetch(`${baseUrl}/api/admin/positions`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        displayName: "Руководитель с формой",
        accountType: "business_owner",
        navigationItems: ["business.dispatcher_form"],
      }),
    });
    const dispatcherResponse = await fetch(`${baseUrl}/api/admin/positions`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        displayName: "Старший диспетчер",
        accountType: "dispatcher",
        navigationItems: ["business.dispatcher_form"],
      }),
    });
    const dispatcherOverviewResponse = await fetch(`${baseUrl}/api/admin/positions`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        displayName: "Диспетчер с обзором",
        accountType: "dispatcher",
        navigationItems: ["business.overview"],
      }),
    });

    assert.equal(managerResponse.status, 201);
    assert.equal(managerFormResponse.status, 400);
    assert.equal(dispatcherResponse.status, 201);
    assert.equal(dispatcherOverviewResponse.status, 400);
  }, dispatcherSubmissions, emptyReferenceDataSource, undefined, undefined, adminDatabase, config, undefined, repository);
});

test("admin positions API changes the base cabinet after creation", async () => {
  let updateInput: Parameters<AccountsRepository["updatePosition"]>[0] | undefined;
  const existingPosition = {
    id: "position-custom",
    displayName: "Начальник смены",
    accountType: "business_owner" as const,
    navigationItems: ["business.overview" as const],
    capabilities: ["business.view_all_statistics" as const],
    isProtected: false,
    usageCount: 2,
    createdAt: "2026-07-12T00:00:00.000Z",
  };
  const repository: AccountsRepository = {
    ...accounts,
    async listPositions() { return [existingPosition]; },
    async updatePosition(input) {
      updateInput = input;
      return { ...existingPosition, ...input };
    },
  };

  await withApiServer(async (baseUrl) => {
    const sessionId = await createDevSession(baseUrl, "admin");
    const response = await fetch(`${baseUrl}/api/admin/positions/position-custom`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "X-SMB-Dev-Session": sessionId },
      body: JSON.stringify({
        displayName: "Диспетчер смены",
        accountType: "dispatcher",
        navigationItems: ["business.dispatcher_form"],
      }),
    });

    assert.equal(response.status, 200);
  }, dispatcherSubmissions, emptyReferenceDataSource, undefined, undefined, adminDatabase, config, undefined, repository);

  assert.equal(updateInput?.accountType, "dispatcher");
  assert.deepEqual(updateInput?.navigationItems, ["business.dispatcher_form"]);
  assert.deepEqual(updateInput?.capabilities, [
    "business.submit_dispatcher_forms",
    "business.view_dispatcher_feed",
  ]);
});

test("admin positions API deletes only an unused position", async () => {
  const unusedPosition = {
    id: "position-unused",
    displayName: "Временная должность",
    accountType: "worker" as const,
    navigationItems: [],
    capabilities: [],
    isProtected: false,
    usageCount: 0,
    createdAt: "2026-07-12T00:00:00.000Z",
  };
  const unusedRepository: AccountsRepository = {
    ...accounts,
    async listPositions() { return [unusedPosition]; },
    async deletePosition() { return "deleted"; },
  };
  const usedRepository: AccountsRepository = {
    ...unusedRepository,
    async listPositions() { return [{ ...unusedPosition, usageCount: 1 }]; },
    async deletePosition() { return "in_use"; },
  };

  await withApiServer(async (baseUrl) => {
    const sessionId = await createDevSession(baseUrl, "admin");
    const response = await fetch(`${baseUrl}/api/admin/positions/position-unused`, {
      method: "DELETE",
      headers: { "X-SMB-Dev-Session": sessionId },
    });
    assert.equal(response.status, 200);
  }, dispatcherSubmissions, emptyReferenceDataSource, undefined, undefined, adminDatabase, config, undefined, unusedRepository);

  await withApiServer(async (baseUrl) => {
    const sessionId = await createDevSession(baseUrl, "admin");
    const response = await fetch(`${baseUrl}/api/admin/positions/position-unused`, {
      method: "DELETE",
      headers: { "X-SMB-Dev-Session": sessionId },
    });
    assert.equal(response.status, 409);
  }, dispatcherSubmissions, emptyReferenceDataSource, undefined, undefined, adminDatabase, config, undefined, usedRepository);
});

test("admin accounts API creates accounts and resets passwords for admin sessions", async () => {
  let createInput: Parameters<AccountsRepository["createAccount"]>[0] | undefined;
  let resetInput: Parameters<AccountsRepository["resetPassword"]>[0] | undefined;
  const recorded: Parameters<AuditRepository["record"]>[0][] = [];
  const auditRepository: AuditRepository = {
    async record(event) { recorded.push(event); },
    async listReport() { throw new Error("not used"); },
  };
  const repository: AccountsRepository = {
    ...accounts,
    async createAccount(input) {
      createInput = input;

      return adminAccount;
    },
    async resetPassword(input) {
      resetInput = input;

      return true;
    },
  };

  await withApiServer(
    async (baseUrl) => {
      const sessionId = await createDevSession(baseUrl, "admin");
      const headers = {
        "Content-Type": "application/json",
        "X-SMB-Dev-Session": sessionId,
      };

      const createResponse = await fetch(`${baseUrl}/api/admin/accounts`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          login: "dispatcher-1",
          password: "supersecret1",
          displayName: "Диспетчер Один",
          position: "dispatcher",
        }),
      });
      const resetResponse = await fetch(
        `${baseUrl}/api/admin/accounts/reset-password`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            login: "dispatcher-1",
            password: "newsecret1",
          }),
        },
      );

      assert.equal(createResponse.status, 201);
      assert.equal(resetResponse.status, 200);
    },
    dispatcherSubmissions,
    emptyReferenceDataSource,
    undefined,
    undefined,
    adminDatabase,
    config,
    undefined,
    repository,
    undefined,
    auditRepository,
  );

  assert.equal(createInput?.login, "dispatcher-1");
  assert.equal(createInput?.password, "supersecret1");
  assert.deepEqual(
    createInput?.capabilities,
    ["business.submit_dispatcher_forms", "business.view_dispatcher_feed"],
  );
  assert.deepEqual(resetInput, {
    login: "dispatcher-1",
    password: "newsecret1",
  });
  assert.deepEqual(
    recorded
      .filter((event) => event.category === "administration")
      .map((event) => event.action),
    ["admin.account_create", "admin.account_password_reset"],
  );
  assert.match(JSON.stringify(recorded), /dispatcher-1/u);
  assert.doesNotMatch(JSON.stringify(recorded), /supersecret1|newsecret1/u);
});

test("admin accounts API suspends another user login", async () => {
  let updateInput:
    | Parameters<AccountsRepository["setAccountLoginEnabled"]>[0]
    | undefined;
  const repository: AccountsRepository = {
    ...accounts,
    async setAccountLoginEnabled(input) {
      updateInput = input;

      return {
        userId: input.userId,
        userStatus: input.isEnabled ? "active" : "suspended",
      };
    },
  };

  await withApiServer(
    async (baseUrl) => {
      const sessionId = await createDevSession(baseUrl, "admin");
      const response = await fetch(`${baseUrl}/api/admin/accounts`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "X-SMB-Dev-Session": sessionId,
        },
        body: JSON.stringify({
          userId: "dispatcher-user-id",
          isEnabled: false,
        }),
      });

      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), {
        userId: "dispatcher-user-id",
        userStatus: "suspended",
      });
    },
    dispatcherSubmissions,
    emptyReferenceDataSource,
    undefined,
    undefined,
    adminDatabase,
    config,
    undefined,
    repository,
  );

  assert.deepEqual(updateInput, {
    userId: "dispatcher-user-id",
    isEnabled: false,
  });
});

test("admin accounts API changes an existing account position and audits access", async () => {
  let updateInput:
    | Parameters<AccountsRepository["setAccountPosition"]>[0]
    | undefined;
  const recorded: Parameters<AuditRepository["record"]>[0][] = [];
  const updatedAccount = {
    ...adminAccount,
    accountType: "business_owner" as const,
    position: "business_owner" as const,
    positionDisplayName: "Владелец бизнеса",
    scope: { kind: "organization" as const },
    capabilities: ["business.view_all_statistics" as const],
    navigationItems: ["business.overview" as const],
  };
  const lockedPreviousAccount = {
    ...adminAccount,
    position: "worker" as const,
    positionDisplayName: "Работник",
  };
  const repository: AccountsRepository = {
    ...accounts,
    async setAccountPosition(input) {
      updateInput = input;
      return {
        previous: lockedPreviousAccount,
        updated: updatedAccount,
      };
    },
  };
  const auditRepository: AuditRepository = {
    async record(event) { recorded.push(event); },
    async listReport() { throw new Error("not used"); },
  };

  await withApiServer(
    async (baseUrl) => {
      const sessionId = await createDevSession(baseUrl, "admin");
      const response = await fetch(
        `${baseUrl}/api/admin/accounts/access-id/position`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            "X-SMB-Dev-Session": sessionId,
          },
          body: JSON.stringify({ position: "business_owner" }),
        },
      );
      const payload = await response.json();

      assert.equal(response.status, 200);
      assert.equal(
        isRecord(payload) && isRecord(payload.account)
          ? payload.account.position
          : undefined,
        "business_owner",
      );
    },
    dispatcherSubmissions,
    emptyReferenceDataSource,
    undefined,
    undefined,
    adminDatabase,
    config,
    undefined,
    repository,
    undefined,
    auditRepository,
  );

  assert.deepEqual(updateInput, {
    accessId: "access-id",
    position: "business_owner",
  });
  assert.deepEqual(
    recorded
      .filter((event) => event.category === "administration")
      .map((event) => event.action),
    ["admin.account_position_update"],
  );
  const positionAudit = recorded.find(
    (event) => event.action === "admin.account_position_update",
  );
  assert.deepEqual(positionAudit?.details?.slice(-2), [
    { label: "Прежняя должность", value: "Работник (worker)" },
    {
      label: "Новая должность",
      value: "Владелец бизнеса (business_owner)",
    },
  ]);
});

test("admin accounts API does not change another access of the current login", async () => {
  let didUpdate = false;
  const profile = buildProductionProfile("admin");
  const repository: AccountsRepository = {
    ...accounts,
    async listAccounts() {
      return [{
        ...adminAccount,
        accessId: "current-user-secondary-access",
        userId: profile.userId,
      }];
    },
    async setAccountPosition() {
      didUpdate = true;
      return { previous: adminAccount, updated: adminAccount };
    },
  };

  await withApiServer(
    async (baseUrl) => {
      const response = await fetch(
        `${baseUrl}/api/admin/accounts/current-user-secondary-access/position`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Cookie: `${productionConfig.session.cookieName}=prod-session`,
          },
          body: JSON.stringify({ position: "business_owner" }),
        },
      );

      assert.equal(response.status, 409);
    },
    dispatcherSubmissions,
    emptyReferenceDataSource,
    undefined,
    undefined,
    adminDatabase,
    productionConfig,
    buildAuthService({ profile }),
    repository,
  );

  assert.equal(didUpdate, false);
});

test("admin accounts API deletes another account but not the current account", async () => {
  const deletedUserIds: string[] = [];
  const repository: AccountsRepository = {
    ...accounts,
    async deleteAccount(userId) {
      deletedUserIds.push(userId);
      return true;
    },
  };

  await withApiServer(async (baseUrl) => {
    const sessionId = await createDevSession(baseUrl, "admin");
    const deletedResponse = await fetch(`${baseUrl}/api/admin/accounts/target-user`, {
      method: "DELETE",
      headers: { "X-SMB-Dev-Session": sessionId },
    });
    const selfResponse = await fetch(`${baseUrl}/api/admin/accounts/dev-user-admin`, {
      method: "DELETE",
      headers: { "X-SMB-Dev-Session": sessionId },
    });

    assert.equal(deletedResponse.status, 200);
    assert.equal(selfResponse.status, 409);
  }, dispatcherSubmissions, emptyReferenceDataSource, undefined, undefined, adminDatabase, config, undefined, repository);

  assert.deepEqual(deletedUserIds, ["target-user"]);
});

test("admin accounts API rejects individual navigation changes", async () => {
  await withApiServer(
    async (baseUrl) => {
      const sessionId = await createDevSession(baseUrl, "admin");
      const response = await fetch(`${baseUrl}/api/admin/accounts`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "X-SMB-Dev-Session": sessionId,
        },
        body: JSON.stringify({
          accessId: adminAccount.accessId,
          navigationItems: ["business.dispatcher_form"],
        }),
      });

      assert.equal(response.status, 400);
    },
    dispatcherSubmissions,
    emptyReferenceDataSource,
    undefined,
    undefined,
    adminDatabase,
    config,
    undefined,
    accounts,
  );
});

test("admin accounts API requires manage_access to change login or position", async () => {
  let didLoginUpdate = false;
  let didPositionUpdate = false;
  const repository: AccountsRepository = {
    ...accounts,
    async setAccountLoginEnabled() {
      didLoginUpdate = true;
      return {
        userId: "dispatcher-user-id",
        userStatus: "suspended",
      };
    },
    async setAccountPosition() {
      didPositionUpdate = true;
      return { previous: adminAccount, updated: adminAccount };
    },
  };
  const profile = buildProductionProfile("admin");

  profile.activeAccess.capabilities = ["platform.manage_users"];

  await withApiServer(
    async (baseUrl) => {
      const loginResponse = await fetch(`${baseUrl}/api/admin/accounts`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Cookie: `${productionConfig.session.cookieName}=prod-session`,
        },
        body: JSON.stringify({
          userId: "dispatcher-user-id",
          isEnabled: false,
        }),
      });
      const positionResponse = await fetch(
        `${baseUrl}/api/admin/accounts/${adminAccount.accessId}/position`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Cookie: `${productionConfig.session.cookieName}=prod-session`,
          },
          body: JSON.stringify({ position: "business_owner" }),
        },
      );

      assert.equal(loginResponse.status, 403);
      assert.equal(positionResponse.status, 403);
    },
    dispatcherSubmissions,
    emptyReferenceDataSource,
    undefined,
    undefined,
    adminDatabase,
    productionConfig,
    buildAuthService({ profile }),
    repository,
  );

  assert.equal(didLoginUpdate, false);
  assert.equal(didPositionUpdate, false);
});

test("admin accounts API rejects disabling the current login", async () => {
  let didUpdate = false;
  const repository: AccountsRepository = {
    ...accounts,
    async setAccountLoginEnabled() {
      didUpdate = true;
      return {
        userId: "prod-user-admin",
        userStatus: "suspended",
      };
    },
  };
  const profile = buildProductionProfile("admin");

  await withApiServer(
    async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/admin/accounts`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Cookie: `${productionConfig.session.cookieName}=prod-session`,
        },
        body: JSON.stringify({
          userId: profile.userId,
          isEnabled: false,
        }),
      });
      const payload = await response.json();

      assert.equal(response.status, 409);
      assert.equal(
        isRecord(payload) && isRecord(payload.error)
          ? payload.error.message
          : undefined,
        "Нельзя отключить вход для текущей учётной записи.",
      );
    },
    dispatcherSubmissions,
    emptyReferenceDataSource,
    undefined,
    undefined,
    adminDatabase,
    productionConfig,
    buildAuthService({ profile }),
    repository,
  );

  assert.equal(didUpdate, false);
});

test("admin accounts API validates login status updates", async () => {
  let didUpdate = false;
  const repository: AccountsRepository = {
    ...accounts,
    async setAccountLoginEnabled() {
      didUpdate = true;
      return {
        userId: "dispatcher-user-id",
        userStatus: "suspended",
      };
    },
  };

  await withApiServer(
    async (baseUrl) => {
      const sessionId = await createDevSession(baseUrl, "admin");
      const response = await fetch(`${baseUrl}/api/admin/accounts`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "X-SMB-Dev-Session": sessionId,
        },
        body: JSON.stringify({
          userId: "",
          isEnabled: "false",
        }),
      });
      const payload = await response.json();
      const message =
        isRecord(payload) && isRecord(payload.error)
          ? String(payload.error.message)
          : "";

      assert.equal(response.status, 400);
      assert.match(message, /userId is required/);
      assert.match(message, /isEnabled must be a boolean/);
    },
    dispatcherSubmissions,
    emptyReferenceDataSource,
    undefined,
    undefined,
    adminDatabase,
    config,
    undefined,
    repository,
  );

  assert.equal(didUpdate, false);
});

test("admin accounts API reports missing and archived login identities", async () => {
  let updateCount = 0;
  const missingRepository: AccountsRepository = {
    ...accounts,
    async setAccountLoginEnabled() {
      updateCount += 1;
      return undefined;
    },
  };
  const archivedRepository: AccountsRepository = {
    ...accounts,
    async setAccountLoginEnabled() {
      updateCount += 1;
      throw new ArchivedAccountLoginStatusError();
    },
  };

  async function requestUpdate(
    baseUrl: string,
    repositorySessionId: string,
  ) {
    return fetch(`${baseUrl}/api/admin/accounts`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "X-SMB-Dev-Session": repositorySessionId,
      },
      body: JSON.stringify({
        userId: "target-user-id",
        isEnabled: true,
      }),
    });
  }

  await withApiServer(
    async (baseUrl) => {
      const sessionId = await createDevSession(baseUrl, "admin");
      const response = await requestUpdate(baseUrl, sessionId);

      assert.equal(response.status, 404);
    },
    dispatcherSubmissions,
    emptyReferenceDataSource,
    undefined,
    undefined,
    adminDatabase,
    config,
    undefined,
    missingRepository,
  );

  await withApiServer(
    async (baseUrl) => {
      const sessionId = await createDevSession(baseUrl, "admin");
      const response = await requestUpdate(baseUrl, sessionId);

      assert.equal(response.status, 409);
    },
    dispatcherSubmissions,
    emptyReferenceDataSource,
    undefined,
    undefined,
    adminDatabase,
    config,
    undefined,
    archivedRepository,
  );

  assert.equal(updateCount, 2);
});

test("admin accounts API rejects client-managed provisioning fields", async () => {
  let didCreateAccount = false;
  const repository: AccountsRepository = {
    ...accounts,
    async createAccount() {
      didCreateAccount = true;
      return adminAccount;
    },
  };

  await withApiServer(
    async (baseUrl) => {
      const sessionId = await createDevSession(baseUrl, "admin");
      const response = await fetch(`${baseUrl}/api/admin/accounts`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-SMB-Dev-Session": sessionId,
        },
        body: JSON.stringify({
          login: "worker-1",
          password: "supersecret1",
          displayName: "Работник Один",
          accountType: "worker",
          departmentId: "client-department",
          accessDisplayName: "Privileged access",
          accessLevelId: "removed-level",
          capabilities: ["platform.manage_users"],
          departmentDisplayName: "Клиентское подразделение",
        }),
      });
      const payload = await response.json();
      const message =
        isRecord(payload) && isRecord(payload.error)
          ? String(payload.error.message)
          : "";

      assert.equal(response.status, 400);
      assert.equal(didCreateAccount, false);
      assert.match(message, /accessDisplayName is not supported/);
      assert.match(message, /accessLevelId is not supported/);
      assert.match(message, /capabilities is not supported/);
      assert.match(message, /departmentDisplayName is not supported/);
    },
    dispatcherSubmissions,
    emptyReferenceDataSource,
    undefined,
    undefined,
    adminDatabase,
    config,
    undefined,
    repository,
  );
});

test("admin accounts API reports duplicate logins as conflict", async () => {
  const repository: AccountsRepository = {
    ...accounts,
    async createAccount() {
      throw new AccountLoginAlreadyExistsError();
    },
  };

  await withApiServer(
    async (baseUrl) => {
      const sessionId = await createDevSession(baseUrl, "admin");
      const response = await fetch(`${baseUrl}/api/admin/accounts`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-SMB-Dev-Session": sessionId,
        },
        body: JSON.stringify({
          login: "owner-1",
          password: "supersecret1",
          displayName: "Владелец Один",
          position: "business_owner",
        }),
      });
      const payload = await response.json();

      assert.equal(response.status, 409);
      assert.equal(
        isRecord(payload) && isRecord(payload.error)
          ? payload.error.code
          : undefined,
        "invalid_response",
      );
      assert.equal(
        isRecord(payload) && isRecord(payload.error)
          ? payload.error.message
          : undefined,
        "Учётная запись с таким логином уже существует.",
      );
    },
    dispatcherSubmissions,
    emptyReferenceDataSource,
    undefined,
    undefined,
    adminDatabase,
    config,
    undefined,
    repository,
  );
});

test("admin accounts API rejects a short password", async () => {
  await withApiServer(
    async (baseUrl) => {
      const sessionId = await createDevSession(baseUrl, "admin");
      const response = await fetch(`${baseUrl}/api/admin/accounts`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-SMB-Dev-Session": sessionId,
        },
        body: JSON.stringify({
          login: "dispatcher-1",
          password: "short",
          displayName: "Диспетчер Один",
          position: "administrator",
          navigationItems: ["admin.accounts"],
        }),
      });
      const payload = await response.json();

      assert.equal(response.status, 400);
      assert.equal(
        isRecord(payload) && isRecord(payload.error)
          ? payload.error.code
          : undefined,
        "invalid_response",
      );
    },
    dispatcherSubmissions,
    emptyReferenceDataSource,
    undefined,
    undefined,
    adminDatabase,
    config,
    undefined,
    accounts,
  );
});

test("production API rejects dev access sessions", async () => {
  await withApiServer(
    async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/dev/access-session`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ accountType: "dispatcher" }),
      });

      assert.equal(response.status, 404);
    },
    dispatcherSubmissions,
    emptyReferenceDataSource,
    undefined,
    undefined,
    adminDatabase,
    productionConfig,
  );
});

test("production API logs in and clears auth sessions", async () => {
  let deletedSessionId: string | undefined;
  const recorded: Parameters<AuditRepository["record"]>[0][] = [];
  const auditRepository: AuditRepository = {
    async record(event) { recorded.push(event); },
    async listReport() { throw new Error("not used"); },
  };
  const authService = buildAuthService({
    loginSessionId: "prod-session",
    profile: buildProductionProfile("dispatcher"),
    onDeleteSession(sessionId) {
      deletedSessionId = sessionId;
    },
  });

  await withApiServer(
    async (baseUrl) => {
      const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          login: "dispatcher",
          password: "secret",
        }),
      });
      const setCookie = loginResponse.headers.get("set-cookie") ?? "";
      const profileResponse = await fetch(`${baseUrl}/api/access/profile`, {
        headers: {
          Cookie: `${productionConfig.session.cookieName}=prod-session`,
        },
      });
      const logoutResponse = await fetch(`${baseUrl}/api/auth/logout`, {
        method: "POST",
        headers: {
          Cookie: `${productionConfig.session.cookieName}=prod-session`,
        },
      });

      assert.equal(loginResponse.status, 200);
      assert.match(setCookie, /smb_session=prod-session/);
      assert.match(setCookie, /HttpOnly/);
      assert.match(setCookie, /Secure/);
      assert.equal(profileResponse.status, 200);
      assert.equal(readProfileAccountType(await profileResponse.json()), "dispatcher");
      assert.equal(logoutResponse.status, 200);
      assert.equal(deletedSessionId, "prod-session");
    },
    dispatcherSubmissions,
    emptyReferenceDataSource,
    undefined,
    undefined,
    adminDatabase,
    productionConfig,
    authService,
    undefined,
    undefined,
    auditRepository,
  );

  assert.deepEqual(recorded.map((event) => event.action), [
    "auth.login",
    "auth.logout",
  ]);
  assert.equal(recorded[0]?.actor.login, "dispatcher");
  assert.doesNotMatch(JSON.stringify(recorded), /secret|prod-session/u);
});

test("production API rejects unauthenticated dispatcher submissions and admin database", async () => {
  await withApiServer(
    async (baseUrl) => {
      const submissionResponse = await fetch(
        `${baseUrl}/api/dispatcher/submissions`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            formId: "visitor",
            payload: {
              fio: "Visitor Name",
            },
          }),
        },
      );
      const adminResponse = await fetch(`${baseUrl}/api/admin/database`);

      assert.equal(submissionResponse.status, 401);
      assert.equal(adminResponse.status, 401);
    },
    dispatcherSubmissions,
    emptyReferenceDataSource,
    undefined,
    undefined,
    adminDatabase,
    productionConfig,
    buildAuthService({ profile: buildProductionProfile("dispatcher") }),
  );
});

test("production API lets dispatcher submit in the organization scope", async () => {
  let created:
    | {
        value: ValidatedDispatcherSubmissionDraft;
        submittedByAccountId: string;
      }
    | undefined;
  const repository: DispatcherSubmissionsRepository = {
    ...dispatcherSubmissions,
    async create(value, submittedByAccountId) {
      created = {
        value,
        submittedByAccountId,
      };

      return dispatcherSubmissions.create(value, submittedByAccountId);
    },
  };

  await withApiServer(
    async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/dispatcher/submissions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `${productionConfig.session.cookieName}=prod-session`,
          "X-SMB-Account-Id": "client-forged-access",
        },
        body: JSON.stringify({
          formId: "visitor",
          payload: {
            fio: "Visitor Name",
          },
        }),
      });

      assert.equal(response.status, 201);
      assert.equal(created?.submittedByAccountId, "prod-access-dispatcher");
    },
    repository,
    emptyReferenceDataSource,
    undefined,
    undefined,
    adminDatabase,
    productionConfig,
    buildAuthService({ profile: buildProductionProfile("dispatcher") }),
  );
});

test("production API lets owner read feed but not submit dispatcher forms", async () => {
  let listFilters:
    | Parameters<DispatcherSubmissionsRepository["listLatest"]>[0]
    | undefined;
  const repository: DispatcherSubmissionsRepository = {
    ...dispatcherSubmissions,
    async listLatest(filters) {
      listFilters = filters;
      return [];
    },
  };

  await withApiServer(
    async (baseUrl) => {
      const headers = {
        Cookie: `${productionConfig.session.cookieName}=prod-session`,
      };
      const feedResponse = await fetch(
        `${baseUrl}/api/dispatcher/submissions?limit=25`,
        { headers },
      );
      const submitResponse = await fetch(`${baseUrl}/api/dispatcher/submissions`, {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          formId: "visitor",
          payload: {
            fio: "Visitor Name",
          },
        }),
      });

      assert.equal(feedResponse.status, 200);
      assert.deepEqual(listFilters, { limit: 25 });
      assert.equal(submitResponse.status, 403);
    },
    repository,
    emptyReferenceDataSource,
    undefined,
    undefined,
    adminDatabase,
    productionConfig,
    buildAuthService({ profile: buildProductionProfile("business_owner") }),
  );
});

test("production plan API saves independent category schedules with audit", async () => {
  const profile = buildProductionProfile("business_owner");
  let latest: ProductionPlanRevision | undefined;
  let insideTransaction = false;
  const recorded: Parameters<AuditRepository["record"]>[0][] = [];
  const productionPlans: ProductionPlansRepository = {
    async readLatest(month) {
      return latest?.month === month ? latest : undefined;
    },
    async readLatestForUpdate(month) {
      assert.equal(insideTransaction, true);
      return latest?.month === month ? latest : undefined;
    },
    async saveRevision(input) {
      latest = {
        ...input.plan,
        revisionId: "revision-1",
        createdByUserId: input.createdByUserId,
        createdAt: "2026-07-17T10:00:00.000Z",
      };
      return latest;
    },
  };
  const directTransaction: DatabaseTransactionRunner = {
    async run(operation) {
      insideTransaction = true;

      try {
        return await operation();
      } finally {
        insideTransaction = false;
      }
    },
  };
  const server = createApiServer({
    config: productionConfig,
    dispatcherSubmissions,
    authService: buildAuthService({ profile }),
    productionPlans,
    referenceDataSource: emptyReferenceDataSource,
    audit: {
      async record(event) {
        recorded.push(event);
      },
      async listReport() {
        throw new Error("not used");
      },
    },
    databaseTransaction: directTransaction,
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const headers = {
    "Content-Type": "application/json",
    Cookie: `${productionConfig.session.cookieName}=prod-session`,
  };

  try {
    const forbidden = await fetch(`${baseUrl}/api/production-plans?month=2026-07`, {
      headers,
    });
    assert.equal(forbidden.status, 403);

    profile.activeAccess.position = "economist";
    profile.activeAccess.positionDisplayName = "Экономист";
    profile.activeAccess.navigationItems = ["business.production_plan"];
    profile.activeAccess.capabilities = ["business.manage_production_plan"];

    const previewResponse = await fetch(`${baseUrl}/api/production-plans/preview`, {
      method: "POST",
      headers,
      body: JSON.stringify({ month: "2026-07" }),
    });
    const preview = await previewResponse.json();
    assert.equal(previewResponse.status, 200);
    assert.equal(
      isRecord(preview) && Array.isArray(preview.weekdayDates)
        ? preview.weekdayDates.length
        : undefined,
      23,
    );
    assert.equal(
      isRecord(preview) && Array.isArray(preview.allDates)
        ? preview.allDates.length
        : undefined,
      31,
    );

    const saveResponse = await fetch(`${baseUrl}/api/production-plans`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        month: "2026-07",
        category: "forming",
        schedule: {
          monthlyPlan: 1_000.25,
          workingDates: ["2026-07-01", "2026-07-02", "2026-07-03"],
        },
      }),
    });
    const saved = await saveResponse.json();
    assert.equal(saveResponse.status, 201);
    assert.deepEqual(
      isRecord(saved) && isRecord(saved.plan) && isRecord(saved.plan.schedules)
        ? saved.plan.schedules.forming
        : undefined,
      {
        monthlyPlan: 1_000.25,
        workingDayCount: 3,
        dailyPlans: [
          { date: "2026-07-01", value: 334 },
          { date: "2026-07-02", value: 334 },
          { date: "2026-07-03", value: 332.25 },
        ],
      },
    );

    const partialDailyResponse = await fetch(
      `${baseUrl}/api/production-plans/daily?date=2026-07-01`,
      { headers },
    );
    const partialDaily = await partialDailyResponse.json();

    assert.equal(partialDailyResponse.status, 200);
    assert.deepEqual(isRecord(partialDaily) ? partialDaily.plan : undefined, {
      date: "2026-07-01",
      values: { forming: 334 },
    });

    for (const [category, schedule] of Object.entries({
      sorting: {
        monthlyPlan: 800,
        workingDates: ["2026-07-01", "2026-07-02"],
      },
      unformed: {
        monthlyPlan: 500,
        workingDates: ["2026-07-04"],
      },
      chamotte: {
        monthlyPlan: 200,
        workingDates: ["2026-07-02", "2026-07-04"],
      },
    })) {
      const categoryResponse = await fetch(`${baseUrl}/api/production-plans`, {
        method: "POST",
        headers,
        body: JSON.stringify({ month: "2026-07", category, schedule }),
      });
      const categoryResult = await categoryResponse.json();

      assert.equal(categoryResponse.status, 201);
      assert.equal(
        isRecord(categoryResult) &&
          isRecord(categoryResult.plan) &&
          isRecord(categoryResult.plan.schedules) &&
          isRecord(categoryResult.plan.schedules.forming)
          ? categoryResult.plan.schedules.forming.monthlyPlan
          : undefined,
        1_000.25,
      );
    }

    assert.equal(latest?.createdByUserId, profile.userId);
    assert.equal(recorded.at(-1)?.action, "production_plan.save");

    for (const capability of [
      "business.submit_dispatcher_forms",
      "business.view_dispatcher_feed",
    ] as const) {
      profile.activeAccess.capabilities = [capability];
      const dailyResponse = await fetch(
        `${baseUrl}/api/production-plans/daily?date=2026-07-01`,
        { headers },
      );
      const daily = await dailyResponse.json();
      assert.equal(dailyResponse.status, 200);
      assert.deepEqual(
        isRecord(daily) ? daily.plan : undefined,
        {
          date: "2026-07-01",
          values: { forming: 334, sorting: 400 },
        },
      );
    }

    const fourthDayResponse = await fetch(
      `${baseUrl}/api/production-plans/daily?date=2026-07-04`,
      { headers },
    );
    const fourthDay = await fourthDayResponse.json();
    assert.equal(fourthDayResponse.status, 200);
    assert.deepEqual(isRecord(fourthDay) ? fourthDay.plan : undefined, {
      date: "2026-07-04",
      values: { unformed: 500, chamotte: 100 },
    });

    const missingDailyResponse = await fetch(
      `${baseUrl}/api/production-plans/daily?date=2026-07-05`,
      { headers },
    );
    const missingDaily = await missingDailyResponse.json();
    assert.equal(missingDailyResponse.status, 200);
    assert.equal(isRecord(missingDaily) ? missingDaily.plan : undefined, null);

    const forbiddenSaveResponse = await fetch(`${baseUrl}/api/production-plans`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        month: "2026-07",
        schedules: {
          forming: { monthlyPlan: 1_000, workingDates: ["2026-07-01"] },
          sorting: { monthlyPlan: 800, workingDates: ["2026-07-01"] },
          unformed: { monthlyPlan: 500, workingDates: ["2026-07-01"] },
          chamotte: { monthlyPlan: 200, workingDates: ["2026-07-01"] },
        },
      }),
    });
    assert.equal(forbiddenSaveResponse.status, 403);

    profile.activeAccess.capabilities = ["business.manage_production_plan"];
    const readResponse = await fetch(`${baseUrl}/api/production-plans?month=2026-07`, {
      headers,
    });
    const read = await readResponse.json();
    assert.equal(readResponse.status, 200);
    assert.deepEqual(
      isRecord(read) && isRecord(read.plan) && isRecord(read.plan.schedules)
        && isRecord(read.plan.schedules.sorting)
        ? read.plan.schedules.sorting.dailyPlans
        : undefined,
      [
        { date: "2026-07-01", value: 400 },
        { date: "2026-07-02", value: 400 },
      ],
    );
  } finally {
    server.close();
    await once(server, "close");
  }
});

test("production brand API lets dispatcher permanently add a normalized catalog label", async () => {
  const profile = buildProductionProfile("dispatcher");
  const labels: ProductionBrandLabel[] = [];
  const recorded: Parameters<AuditRepository["record"]>[0][] = [];
  const auditRepository: AuditRepository = {
    async record(event) {
      recorded.push(event);
    },
    async listReport() {
      throw new Error("not used");
    },
  };
  const productionBrands: ProductionBrandsRepository = {
    async list() {
      return labels;
    },
    async resolveReferences(references) {
      return {
        ok: true,
        references: references.map((reference) => ({
          fieldName: reference.fieldName,
          label: reference.label,
        })),
      };
    },
    async create(input) {
      const existing = labels.find(
        (label) =>
          label.category === input.category &&
          label.label.toLocaleLowerCase("ru-RU") === input.normalizedLabel,
      );

      if (existing !== undefined) {
        return { label: existing, created: false };
      }

      const label = {
        id: "brand-1",
        category: input.category,
        label: input.label,
        createdAt: "2026-07-17T10:00:00.000Z",
      };
      labels.push(label);
      return { label, created: true };
    },
  };
  await withApiServer(async (baseUrl) => {
    const headers = {
      "Content-Type": "application/json",
      Cookie: `${productionConfig.session.cookieName}=prod-session`,
    };
    const createResponse = await fetch(`${baseUrl}/api/production-brands`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        category: "unformed",
        label: "  ПБ-5   огнеупорный  ",
      }),
    });
    const created = await createResponse.json();

    assert.equal(createResponse.status, 201);
    assert.equal(
      isRecord(created) && isRecord(created.label)
        ? created.label.label
        : undefined,
      "ПБ-5 огнеупорный",
    );
    assert.equal(recorded.at(-1)?.action, "production_brand.create");

    const duplicateResponse = await fetch(`${baseUrl}/api/production-brands`, {
      method: "POST",
      headers,
      body: JSON.stringify({ category: "unformed", label: "пб-5 огнеупорный" }),
    });
    assert.equal(duplicateResponse.status, 200);
    assert.equal(recorded.length, 1);

    const unexpectedFieldResponse = await fetch(
      `${baseUrl}/api/production-brands`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          category: "unformed",
          label: "ПБ-6",
          createdByUserId: "forged-user",
        }),
      },
    );
    assert.equal(unexpectedFieldResponse.status, 400);
    assert.equal(labels.length, 1);

    const nestedLabelResponse = await fetch(
      `${baseUrl}/api/production-brands`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({ category: "unformed", label: { value: "ПБ-6" } }),
      },
    );
    assert.equal(nestedLabelResponse.status, 400);
    assert.equal(labels.length, 1);

    profile.activeAccess.capabilities = ["business.view_dispatcher_feed"];
    const listResponse = await fetch(`${baseUrl}/api/production-brands`, {
      headers,
    });
    const list = await listResponse.json();
    assert.equal(listResponse.status, 200);
    assert.equal(
      isRecord(list) && Array.isArray(list.labels)
        ? list.labels.length
        : undefined,
      1,
    );

    const forbiddenCreate = await fetch(`${baseUrl}/api/production-brands`, {
      method: "POST",
      headers,
      body: JSON.stringify({ category: "chamotte", label: "Ш-1" }),
    });
    assert.equal(forbiddenCreate.status, 403);
  }, dispatcherSubmissions, emptyReferenceDataSource, undefined, undefined,
  adminDatabase, productionConfig, buildAuthService({ profile }), undefined,
  undefined, auditRepository, undefined, productionBrands);
});

test("production submission accepts only brands saved in the matching catalog", async () => {
  const profile = buildProductionProfile("dispatcher");
  let createdDraft: ValidatedDispatcherSubmissionDraft | undefined;
  let insideTransaction = false;
  const repository: DispatcherSubmissionsRepository = {
    ...dispatcherSubmissions,
    async create(value, submittedByAccountId) {
      createdDraft = value;
      return dispatcherSubmissions.create(value, submittedByAccountId);
    },
  };
  const productionBrands: ProductionBrandsRepository = {
    async list() {
      return [
        { id: "product-1", category: "product", label: "ФЛ-1", createdAt: "2026-07-17T10:00:00.000Z" },
        { id: "unformed-1", category: "unformed", label: "ПБ-5", createdAt: "2026-07-17T10:00:00.000Z" },
      ];
    },
    async resolveReferences(references) {
      assert.equal(insideTransaction, true);
      const labels = await this.list();
      const resolved = references.map((reference) => ({
        reference,
        saved: labels.find(
          (label) =>
            label.category === reference.category &&
            label.label.toLocaleLowerCase("ru-RU") ===
              reference.label.trim().toLocaleLowerCase("ru-RU"),
        ),
      }));
      const missing = resolved.find((item) => item.saved === undefined)?.reference;

      return missing === undefined
        ? {
            ok: true,
            references: resolved.map((item) => ({
              fieldName: item.reference.fieldName,
              label: item.saved?.label ?? item.reference.label,
            })),
          }
        : { ok: false, missing };
    },
    async create() {
      throw new Error("not used");
    },
  };
  const transaction: DatabaseTransactionRunner = {
    async run(operation) {
      insideTransaction = true;

      try {
        return await operation();
      } finally {
        insideTransaction = false;
      }
    },
  };
  await withApiServer(async (baseUrl) => {
    const headers = {
      "Content-Type": "application/json",
      Cookie: `${productionConfig.session.cookieName}=prod-session`,
    };
    const accepted = await fetch(`${baseUrl}/api/dispatcher/submissions`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        formId: "production",
        payload: {
          reportDate: "2026-07-17",
          formingDay: "12",
          formingProductBrand: " фл-1 ",
          unformedBrand3: "ПБ-5",
          unformedFact3: "8",
        },
      }),
    });

    assert.equal(accepted.status, 201);
    assert.equal(createdDraft?.draft.payload.formingProductBrand, "ФЛ-1");
    assert.equal(createdDraft?.draft.payload.unformedBrand3, "ПБ-5");

    createdDraft = undefined;
    const rejected = await fetch(`${baseUrl}/api/dispatcher/submissions`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        formId: "production",
        payload: {
          reportDate: "2026-07-17",
          chamotteBrand1: "Ш-404",
          chamotteFact1: "3",
        },
      }),
    });

    assert.equal(rejected.status, 400);
    assert.equal(createdDraft, undefined);
  }, repository, emptyReferenceDataSource, undefined, undefined, adminDatabase,
  productionConfig, buildAuthService({ profile }), undefined, undefined,
  undefined, transaction, productionBrands);
});

test("production API keeps admin database gated by admin capability", async () => {
  await withApiServer(
    async (baseUrl) => {
      const ownerResponse = await fetch(`${baseUrl}/api/admin/database`, {
        headers: {
          Cookie: `${productionConfig.session.cookieName}=prod-session`,
        },
      });

      assert.equal(ownerResponse.status, 403);
    },
    dispatcherSubmissions,
    emptyReferenceDataSource,
    undefined,
    undefined,
    adminDatabase,
    productionConfig,
    buildAuthService({ profile: buildProductionProfile("business_owner") }),
  );

  await withApiServer(
    async (baseUrl) => {
      const adminResponse = await fetch(`${baseUrl}/api/admin/database`, {
        headers: {
          Cookie: `${productionConfig.session.cookieName}=prod-session`,
        },
      });

      assert.equal(adminResponse.status, 200);
    },
    dispatcherSubmissions,
    emptyReferenceDataSource,
    undefined,
    undefined,
    adminDatabase,
    productionConfig,
    buildAuthService({ profile: buildProductionProfile("admin") }),
  );
});

test("remote API returns dispatcher form definitions", async () => {
  await withApiServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/dispatcher/forms`);
    const payload = await response.json();
    const forms =
      isRecord(payload) && Array.isArray(payload.forms) ? payload.forms : [];
    const productionForm = forms.find(
      (form) => isRecord(form) && form.id === "production",
    );
    const productionFieldNames =
      isRecord(productionForm) && Array.isArray(productionForm.fields)
        ? productionForm.fields.flatMap((field) =>
            isRecord(field) && typeof field.name === "string"
              ? [field.name]
              : [],
          )
        : [];

    assert.equal(response.status, 200);
    assert.equal(Array.isArray(isRecord(payload) ? payload.forms : undefined), true);
    assert.equal(
      forms.some((form) => isRecord(form) && form.id === "equipment"),
      true,
    );
    assert.equal(productionForm !== undefined, true);
    assert.equal(productionFieldNames.includes("formingMonth"), false);
    assert.equal(productionFieldNames.includes("unformedDeviation1"), false);
    assert.equal(productionFieldNames.includes("jarStart1"), true);
    assert.equal(productionFieldNames.includes("jarEnd1"), true);
    assert.equal(
      productionFieldNames.includes("granulationFraction1630Day"),
      true,
    );
    assert.equal(
      productionFieldNames.includes("granulationFraction1218Day"),
      true,
    );
  });
});

test("remote API passes equipment reportDate feed filters to repository", async () => {
  let listFilters:
    | Parameters<DispatcherSubmissionsRepository["listLatest"]>[0]
    | undefined;
  let summaryFilters:
    | Parameters<DispatcherSubmissionsRepository["readSummary"]>[0]
    | undefined;
  const repository: DispatcherSubmissionsRepository = {
    ...dispatcherSubmissions,
    async listLatest(filters) {
      listFilters = filters;
      return [];
    },
    async readSummary(filters) {
      summaryFilters = filters;
      return {
        total: 0,
        byForm: [],
      };
    },
  };

  await withApiServer(async (baseUrl) => {
    const sessionId = await createDevSession(baseUrl, "business_owner");
    const response = await fetch(
      `${baseUrl}/api/dispatcher/submissions?formId=equipment&reportDate=2026-07-09&limit=500&offset=250`,
      {
        headers: {
          "X-SMB-Dev-Session": sessionId,
        },
      },
    );

    assert.equal(response.status, 200);
    assert.deepEqual(listFilters, {
      formId: "equipment",
      reportDate: "2026-07-09",
      limit: 500,
      offset: 250,
    });
    assert.deepEqual(summaryFilters, listFilters);
  }, repository);
});

test("remote API returns server-calculated production report tables", async () => {
  const productionOffsets: number[] = [];
  const firstProductionSubmission = {
    id: "production-2026-07-01",
    formId: "production" as const,
    formTitle: "Выработка",
    payload: {
      reportDate: "01.07.2026",
      formingPlan: "10",
      formingDay: "8",
    },
    summary: "Выработка за 01.07.2026",
    status: "received" as const,
    submittedByAccountId: "dispatcher-access-id",
    submittedAt: "2026-07-01T18:00:00.000Z",
    receivedAt: "2026-07-01T18:00:01.000Z",
  };
  const repository: DispatcherSubmissionsRepository = {
    ...dispatcherSubmissions,
    async listLatest(filters) {
      if (filters?.formId !== "production") {
        return [];
      }

      productionOffsets.push(filters.offset ?? 0);

      if ((filters.offset ?? 0) === 0) {
        return Array.from({ length: 2_000 }, () => firstProductionSubmission);
      }

      return [
        {
          id: "production-2026-07-02",
          formId: "production",
          formTitle: "Выработка",
          payload: {
            reportDate: "02.07.2026",
            formingPlan: "10",
            formingDay: "12",
          },
          summary: "Выработка за 02.07.2026",
          status: "received",
          submittedByAccountId: "dispatcher-access-id",
          submittedAt: "2026-07-02T18:00:00.000Z",
          receivedAt: "2026-07-02T18:00:01.000Z",
        },
      ];
    },
  };

  await withApiServer(async (baseUrl) => {
    const sessionId = await createDevSession(baseUrl, "business_owner");
    const response = await fetch(`${baseUrl}/api/dispatcher/submissions`, {
      headers: {
        "X-SMB-Dev-Session": sessionId,
      },
    });
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(productionOffsets, [0, 2_000]);
    assert.equal(
      isRecord(payload) && "productionMonthOverview" in payload,
      true,
    );
    assert.deepEqual(
      isRecord(payload) && isRecord(payload.productionReportTables)
        ? payload.productionReportTables.forming
        : undefined,
      [
        {
          reportId: "production-2026-07-01",
          reportDate: "2026-07-01",
          dayPlan: 10,
          dayFact: 8,
          monthPlan: 10,
          monthFact: 8,
          deviation: -2,
          receivedAt: "2026-07-01T18:00:01.000Z",
        },
        {
          reportId: "production-2026-07-02",
          reportDate: "2026-07-02",
          dayPlan: 10,
          dayFact: 12,
          monthPlan: 20,
          monthFact: 20,
          deviation: 0,
          receivedAt: "2026-07-02T18:00:01.000Z",
        },
      ],
    );
  }, repository);
});

test("remote API validates dispatcher feed offsets", async () => {
  await withApiServer(async (baseUrl) => {
    const sessionId = await createDevSession(baseUrl, "business_owner");
    const request = (offset: string) =>
      fetch(`${baseUrl}/api/dispatcher/submissions?offset=${offset}`, {
        headers: {
          "X-SMB-Dev-Session": sessionId,
        },
      });

    assert.equal((await request("0")).status, 200);
    assert.equal((await request("-1")).status, 400);
    assert.equal((await request("1.5")).status, 400);
    assert.equal((await request("not-a-number")).status, 400);
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
  const recorded: Parameters<AuditRepository["record"]>[0][] = [];
  const auditRepository: AuditRepository = {
    async record(event) { recorded.push(event); },
    async listReport() { throw new Error("not used"); },
  };

  await withApiServer(
    async (baseUrl) => {
      const sessionId = await createDevSession(baseUrl, "dispatcher");
      const response = await fetch(`${baseUrl}/api/dispatcher/submissions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-SMB-Dev-Session": sessionId,
          "X-SMB-Account-Id": "dispatcher-account",
        },
        body: JSON.stringify({
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
    },
    dispatcherSubmissions,
    emptyReferenceDataSource,
    undefined,
    undefined,
    adminDatabase,
    config,
    undefined,
    undefined,
    undefined,
    auditRepository,
  );

  const formEvent = recorded.find((event) => event.action === "form.submit");
  assert.equal(formEvent?.actor.accountId, "dev-access-dispatcher");
  assert.deepEqual(formEvent?.details, [
    { label: "Дата отчета", value: "18.06.2026" },
    { label: "Оборудование", value: "Пресс №1" },
    { label: "Выработка, тонн", value: "42" },
  ]);
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
      const headers = await createDispatcherHeaders(baseUrl);
      const response = await fetch(`${baseUrl}/api/dispatcher/submissions`, {
        method: "POST",
        headers,
        body: JSON.stringify({
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
      const headers = await createDispatcherHeaders(baseUrl);
      const response = await fetch(`${baseUrl}/api/dispatcher/submissions`, {
        method: "POST",
        headers,
        body: JSON.stringify({
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
      const headers = await createDispatcherHeaders(baseUrl);
      const response = await fetch(
        `${baseUrl}/api/dispatcher/equipment-report`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({
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
    const headers = await createDispatcherHeaders(baseUrl);
    const response = await fetch(`${baseUrl}/api/dispatcher/equipment-report`, {
      method: "POST",
      headers,
      body: JSON.stringify({
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
    const sessionId = await createDevSession(baseUrl, "dispatcher");
    const response = await fetch(`${baseUrl}/api/dispatcher/equipment-report`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-SMB-Dev-Session": sessionId,
        "X-SMB-Account-Id": "dispatcher-access-id",
      },
      body: JSON.stringify({
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
    assert.equal(revision?.reportDate, "18.06.2026");
    assert.equal(revision?.status, "updated");
    assert.equal(revision?.submittedByAccountId, "dispatcher-access-id");
    assert.equal(revision?.submissions.length, equipmentOptions.length);
    assert.equal(revision?.submissions[0].payload.productionTons, "42");
  }, repository);
});

test("remote API rejects visitor entry when the visitor is already inside", async () => {
  await withApiServer(async (baseUrl) => {
    const headers = await createDispatcherHeaders(baseUrl);
    const response = await fetch(`${baseUrl}/api/dispatcher/submissions`, {
      method: "POST",
      headers,
      body: JSON.stringify({
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
    const headers = await createDispatcherHeaders(baseUrl);
    const response = await fetch(`${baseUrl}/api/dispatcher/submissions`, {
      method: "POST",
      headers,
      body: JSON.stringify({
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
    const headers = await createDispatcherHeaders(baseUrl);
    const response = await fetch(`${baseUrl}/api/dispatcher/submissions`, {
      method: "POST",
      headers,
      body: JSON.stringify({
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
    const headers = await createDispatcherHeaders(baseUrl);
    const response = await fetch(`${baseUrl}/api/dispatcher/submissions`, {
      method: "POST",
      headers,
      body: JSON.stringify({
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
    assert.equal(createdPayload?.location, "Цех 1");
    assert.equal(createdPayload?.incidentStatus, "Закрыт");
  }, repository);
});

async function withApiServer(
  callback: (baseUrl: string) => Promise<void>,
  repository = dispatcherSubmissions,
  referenceDataSource: DispatcherReferenceDataSource = emptyReferenceDataSource,
  emailNotificationService?: EmailNotificationService,
  maxNotificationService?: MaxNotificationService,
  adminDatabaseRepository: AdminDatabaseRepository = adminDatabase,
  serverConfig: ServerConfig = config,
  authService?: AuthSessionService,
  accountsRepository?: AccountsRepository,
  dispatcherSpreadsheetImport?: DispatcherSpreadsheetImportService,
  audit?: AuditRepository,
  databaseTransaction?: DatabaseTransactionRunner,
  productionBrands?: ProductionBrandsRepository,
  productionSnapshot?: ProductionDatabaseSnapshotService,
) {
  const directTransaction: DatabaseTransactionRunner = {
    async run(operation) {
      return operation();
    },
  };
  const fallbackAudit: AuditRepository = {
    async record() {},
    async listReport() {
      throw new Error("Audit report repository is not configured for this test.");
    },
  };
  const server = createApiServer({
    config: serverConfig,
    dispatcherSubmissions: repository,
    adminDatabase: adminDatabaseRepository,
    accounts: accountsRepository,
    authService,
    referenceDataSource,
    emailNotificationService,
    maxNotificationService,
    dispatcherSpreadsheetImport,
    productionBrands,
    audit: audit ?? fallbackAudit,
    databaseTransaction: databaseTransaction ?? directTransaction,
    productionSnapshot,
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

async function createDispatcherHeaders(baseUrl: string) {
  const sessionId = await createDevSession(baseUrl, "dispatcher");

  return {
    "Content-Type": "application/json",
    "X-SMB-Dev-Session": sessionId,
  };
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

function buildAuthService({
  loginSessionId = "prod-session",
  profile,
  onDeleteSession,
}: {
  loginSessionId?: string;
  profile: ServerUserProfile;
  onDeleteSession?: (sessionId: string) => void;
}): AuthSessionService {
  return {
    async login(credentials) {
      if (credentials.login === "bad" || credentials.password === "bad") {
        return { ok: false };
      }

      return {
        ok: true,
        session: {
          sessionId: loginSessionId,
          expiresAt: "2026-07-10T00:00:00.000Z",
          profile,
        },
      };
    },
    async readSession(sessionId) {
      if (sessionId !== loginSessionId) {
        return undefined;
      }

      return {
        sessionId,
        expiresAt: "2026-07-10T00:00:00.000Z",
        profile,
      };
    },
    async deleteSession(sessionId) {
      onDeleteSession?.(sessionId);
    },
  };
}

function buildProductionProfile(accountType: AccountType): ServerUserProfile {
  const scope = accountType === "admin"
    ? { kind: "platform" as const }
    : { kind: "organization" as const };

  return {
    userId: `prod-user-${accountType}`,
    displayName: `Production ${accountType}`,
    accountType,
    activeAccess: {
      accountId: `prod-access-${accountType}`,
      accountType,
      position:
        accountType === "admin"
          ? "administrator"
          : accountType === "business_owner"
            ? "business_owner"
            : accountType,
      positionDisplayName: accountType === "admin" ? "Администратор" : accountType,
      displayName: `Production ${accountType} access`,
      scope,
      capabilities: [...defaultCapabilitiesByAccountType[accountType]],
      navigationItems:
        accountType === "admin"
          ? ["admin.account_preview", "admin.accounts", "admin.database"]
          : accountType === "business_owner"
            ? ["business.overview", "business.dispatcher"]
            : accountType === "dispatcher"
              ? ["business.dispatcher_form"]
              : ["business.work"],
      issuedAt: "2026-07-09T00:00:00.000Z",
      expiresAt: "2026-07-10T00:00:00.000Z",
    },
    receivedAt: "2026-07-09T00:00:00.000Z",
  };
}

async function createDevSession(
  baseUrl: string,
  accountType: "admin" | "business_owner" | "worker" | "dispatcher",
) {
  const response = await fetch(`${baseUrl}/api/dev/access-session`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ accountType }),
  });
  const payload = await response.json();

  if (!isRecord(payload) || typeof payload.sessionId !== "string") {
    throw new Error("Expected dev access session id.");
  }

  return payload.sessionId;
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
