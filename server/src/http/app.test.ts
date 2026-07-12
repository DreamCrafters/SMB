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
import { getDispatcherFormDefinition } from "../domain/dispatcherForms.js";
import { createApiServer } from "./app.js";

const config: ServerConfig = {
  appEnv: "test",
  port: 0,
  databaseUrl: "mysql://unused:unused@127.0.0.1:3306/unused",
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

const adminDatabaseTable = {
  name: "dispatcher_submissions",
  rowCount: 1,
  primaryKey: ["id"],
  columns: [
    {
      name: "id",
      dataType: "varchar",
      columnType: "varchar(64)",
      nullable: false,
      primaryKey: true,
      defaultValue: null,
      extra: "",
    },
    {
      name: "summary",
      dataType: "text",
      columnType: "text",
      nullable: true,
      primaryKey: false,
      defaultValue: null,
      extra: "",
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
        },
      ],
      limit: 100,
      offset: 0,
    };
  },
  async updateRow() {
    // The default test repository does not need mutation assertions.
  },
  async deleteRow() {
    // The default test repository does not need mutation assertions.
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
  );

  assert.deepEqual(updatePayload, {
    tableName: "dispatcher_submissions",
    primaryKey: {
      id: "row-id",
    },
    values: {
      summary: "updated",
    },
  });
  assert.deepEqual(deletePayload, {
    tableName: "dispatcher_submissions",
    primaryKey: {
      id: "row-id",
    },
  });
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
  scope: {
    kind: "department" as const,
    businessAccountId: "business-id",
    departmentId: "department-id",
  },
  businessDisplayName: "Цех 1",
  departmentDisplayName: "Смена А",
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
        navigationItems: ["business.overview", "business.dispatcher", "business.work"],
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
          navigationItems: ["business.dispatcher_form"],
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
  );

  assert.equal(createInput?.login, "dispatcher-1");
  assert.equal(createInput?.password, "supersecret1");
  assert.equal(createInput?.businessAccountId, undefined);
  assert.equal(createInput?.departmentId, undefined);
  assert.deepEqual(
    createInput?.capabilities,
    ["business.submit_dispatcher_forms", "business.view_dispatcher_feed"],
  );
  assert.deepEqual(resetInput, {
    login: "dispatcher-1",
    password: "newsecret1",
  });
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

test("admin accounts API requires manage_access to change login status", async () => {
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
  const profile = buildProductionProfile("admin");

  profile.activeAccess.capabilities = ["platform.manage_users"];

  await withApiServer(
    async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/admin/accounts`, {
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

      assert.equal(response.status, 403);
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
          businessAccountId: "client-business",
          departmentId: "client-department",
          accessDisplayName: "Privileged access",
          accessLevelId: "removed-level",
          capabilities: ["platform.manage_users"],
          businessDisplayName: "Клиентский бизнес",
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
      assert.match(message, /businessAccountId is managed by the server/);
      assert.match(message, /accessDisplayName is managed by the server/);
      assert.match(message, /accessLevelId is managed by the server/);
      assert.match(message, /capabilities is managed by the server/);
      assert.match(message, /businessDisplayName is managed by the server/);
      assert.match(message, /departmentDisplayName is managed by the server/);
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
          navigationItems: ["business.overview", "business.dispatcher"],
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
  );
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
            businessAccountId: "client-business",
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

test("production API lets dispatcher submit with server-owned business scope", async () => {
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
          businessAccountId: "client-forged-business",
          formId: "visitor",
          payload: {
            fio: "Visitor Name",
          },
        }),
      });

      assert.equal(response.status, 201);
      assert.equal(created?.value.draft.businessAccountId, "prod-business");
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
          businessAccountId: "client-business",
          formId: "visitor",
          payload: {
            fio: "Visitor Name",
          },
        }),
      });

      assert.equal(feedResponse.status, 200);
      assert.deepEqual(listFilters, {
        limit: 25,
        businessAccountId: "prod-business",
      });
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
      `${baseUrl}/api/dispatcher/submissions?formId=equipment&reportDate=2026-07-09&limit=500`,
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
    });
    assert.deepEqual(summaryFilters, listFilters);
  }, repository);
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
    const sessionId = await createDevSession(baseUrl, "dispatcher");
    const response = await fetch(`${baseUrl}/api/dispatcher/submissions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-SMB-Dev-Session": sessionId,
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
      const headers = await createDispatcherHeaders(baseUrl);
      const response = await fetch(`${baseUrl}/api/dispatcher/submissions`, {
        method: "POST",
        headers,
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
      const headers = await createDispatcherHeaders(baseUrl);
      const response = await fetch(`${baseUrl}/api/dispatcher/submissions`, {
        method: "POST",
        headers,
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
      const headers = await createDispatcherHeaders(baseUrl);
      const response = await fetch(
        `${baseUrl}/api/dispatcher/equipment-report`,
        {
          method: "POST",
          headers,
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
    const headers = await createDispatcherHeaders(baseUrl);
    const response = await fetch(`${baseUrl}/api/dispatcher/equipment-report`, {
      method: "POST",
      headers,
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
    const sessionId = await createDevSession(baseUrl, "dispatcher");
    const response = await fetch(`${baseUrl}/api/dispatcher/equipment-report`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-SMB-Dev-Session": sessionId,
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
    const headers = await createDispatcherHeaders(baseUrl);
    const response = await fetch(`${baseUrl}/api/dispatcher/submissions`, {
      method: "POST",
      headers,
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
    const headers = await createDispatcherHeaders(baseUrl);
    const response = await fetch(`${baseUrl}/api/dispatcher/submissions`, {
      method: "POST",
      headers,
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
    const headers = await createDispatcherHeaders(baseUrl);
    const response = await fetch(`${baseUrl}/api/dispatcher/submissions`, {
      method: "POST",
      headers,
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
    const headers = await createDispatcherHeaders(baseUrl);
    const response = await fetch(`${baseUrl}/api/dispatcher/submissions`, {
      method: "POST",
      headers,
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
) {
  const server = createApiServer({
    config: serverConfig,
    dispatcherSubmissions: repository,
    adminDatabase: adminDatabaseRepository,
    accounts: accountsRepository,
    authService,
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
  const scope =
    accountType === "admin"
      ? {
          kind: "platform" as const,
        }
      : accountType === "business_owner"
        ? {
            kind: "business" as const,
            businessAccountId: "prod-business",
          }
        : {
            kind: "department" as const,
            businessAccountId: "prod-business",
            departmentId: "prod-department",
          };

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
    businessAccounts:
      accountType === "admin"
        ? []
        : [
            {
              id: "prod-business",
              displayName: "Production business",
              status: "active",
            },
          ],
    departments:
      accountType === "admin" || accountType === "business_owner"
        ? []
        : [
            {
              id: "prod-department",
              businessAccountId: "prod-business",
              displayName: "Production department",
              structureMode: "current",
            },
          ],
    organizationStructureMode: "current",
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
