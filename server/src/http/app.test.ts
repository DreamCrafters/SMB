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
import { resolveCapabilitiesForPosition } from "../domain/accountAccessConfiguration.js";
import type { DispatcherSubmissionsRepository } from "../repositories/dispatcherSubmissionsRepository.js";
import type { AdminDatabaseRepository } from "../repositories/adminDatabaseRepository.js";
import {
  ArchivedAccountLoginStatusError,
  AccountLoginAlreadyExistsError,
  type AccountsRepository,
} from "../repositories/accountsRepository.js";
import type {
  DispatcherSubmission,
  ValidatedDispatcherSubmissionDraft,
} from "../domain/dispatcherSubmission.js";
import type {
  DispatcherReferenceDataSource,
  BankVolumeReferenceDataSource,
  LaboratoryReferenceDataSource,
  NotificationRecipients,
  ProductionBrandsDataSource,
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
  RefractoryReportRevision,
  RefractoryReportsRepository,
} from "../repositories/refractoryReportsRepository.js";
import type { LaboratoryResultsRepository } from "../repositories/laboratoryResultsRepository.js";
import type { LaboratoryBankAssignmentsRepository } from "../repositories/laboratoryBankAssignmentsRepository.js";
import type { RotaryKiln2FiringJournalRepository } from "../repositories/rotaryKiln2FiringJournalRepository.js";
import type { LaboratorySampleRegistrationJournalRepository } from "../repositories/laboratorySampleRegistrationJournalRepository.js";
import type { LaboratoryChemicalAnalysisJournalRepository } from "../repositories/laboratoryChemicalAnalysisJournalRepository.js";
import type {
  BoardAssignment,
  BoardAssignmentCompletion,
  BoardAssignmentCompletionSummary,
  BoardAssignmentFilters,
  BoardAssignmentsRepository,
} from "../repositories/boardAssignmentsRepository.js";
import { getDispatcherFormDefinition } from "../domain/dispatcherForms.js";
import type { RefractoryCoshPayload } from "../domain/refractoryReport.js";
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
      refractoryNotificationRecipients: [],
      refractoryMaxNotificationRecipients: [],
      refractoryReviewNotificationRecipients: [],
      refractoryReviewMaxNotificationRecipients: [],
    };
  },
};

const passthroughProductionBrands: ProductionBrandsDataSource = {
  async list() {
    return [];
  },
  async create(label, commitCreated) {
    await commitCreated(label);
    return { label, created: true };
  },
  async resolveReferences(references) {
    return { ok: true, references };
  },
};

const emptyRefractoryReports: RefractoryReportsRepository = {
  async submit() { throw new Error("not used"); },
  async listLatestForShift() { return []; },
  async listLatestApprovedCoshForDates() { return []; },
  async listPending() { return []; },
  async listRecentForSubmitter() { return []; },
  async review() { throw new Error("not used"); },
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
    description: "Повреждение ограждения",
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

test("business overview returns server-owned incident and laboratory counts", async () => {
  const history: DispatcherSubmission[] = [
    {
      id: "incident-1",
      formId: "incident" as const,
      formTitle: "Открытие инцидента",
      payload: {
        incidentNumber: "INC-2026-1",
        datetime: "03.07.2026 08:30",
      },
      summary: "INC-2026-1",
      status: "received" as const,
      submittedByAccountId: "dispatcher",
      submittedAt: "2026-07-03T05:30:00.000Z",
      receivedAt: "2026-07-03T05:30:00.000Z",
    },
    {
      id: "incident-close-1",
      formId: "incident_close" as const,
      formTitle: "Закрытие инцидента",
      payload: {
        incidentNumber: "INC-2026-1",
        closureDateTime: "04.07.2026 14:00",
      },
      summary: "INC-2026-1",
      status: "received" as const,
      submittedByAccountId: "dispatcher",
      submittedAt: "2026-07-04T11:00:00.000Z",
      receivedAt: "2026-07-04T11:00:00.000Z",
    },
    {
      id: "incident-2",
      formId: "incident" as const,
      formTitle: "Открытие инцидента",
      payload: {
        incidentNumber: "INC-2026-2",
        datetime: "23.07.2026 11:45",
      },
      summary: "INC-2026-2",
      status: "received" as const,
      submittedByAccountId: "dispatcher",
      submittedAt: "2026-07-23T08:45:00.000Z",
      receivedAt: "2026-07-23T08:45:00.000Z",
    },
  ];
  const overviewRepository: DispatcherSubmissionsRepository = {
    ...dispatcherSubmissions,
    async listLatest(filters) {
      return history.filter((submission) =>
        filters?.formId === undefined || submission.formId === filters.formId
      );
    },
  };
  let requestedLaboratoryPeriod:
    | { monthStart: string; today: string }
    | undefined;
  const laboratoryResults: LaboratoryResultsRepository = {
    async create() {
      throw new Error("not used");
    },
    async list() {
      return [];
    },
    async readOverviewSummary(period) {
      requestedLaboratoryPeriod = period;
      return { monthTotal: 7, todayTotal: 2 };
    },
    async findById() {
      return undefined;
    },
  };
  const profile = buildProductionProfile("business_owner");

  await withApiServer(
    async (baseUrl) => {
      const unauthenticatedResponse = await fetch(
        `${baseUrl}/api/business/overview`,
      );
      const response = await fetch(`${baseUrl}/api/business/overview`, {
        headers: { Cookie: "smb_session=prod-session" },
      });

      assert.equal(unauthenticatedResponse.status, 401);
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), {
        period: {
          monthStart: "2026-07-01",
          today: "2026-07-23",
        },
        incidents: {
          monthTotal: 2,
          monthClosed: 1,
          todayTotal: 1,
          openNow: 1,
        },
        laboratory: {
          monthTotal: 7,
          todayTotal: 2,
        },
        receivedAt: "2026-07-23T12:00:00.000Z",
      });
      assert.deepEqual(requestedLaboratoryPeriod, {
        monthStart: "2026-07-01",
        today: "2026-07-23",
      });
    },
    overviewRepository,
    emptyReferenceDataSource,
    undefined,
    undefined,
    adminDatabase,
    productionConfig,
    buildAuthService({ profile }),
    undefined,
    undefined,
    undefined,
    undefined,
    passthroughProductionBrands,
    undefined,
    undefined,
    undefined,
    laboratoryResults,
    undefined,
    undefined,
    () => new Date("2026-07-23T12:00:00.000Z"),
  );
});

test("laboratory API reads the live matrix and saves the session-authored result", async () => {
  const profile: ServerUserProfile = {
    ...buildProductionProfile("business_owner"),
    displayName: "Иванова Анна",
    activeAccess: {
      ...buildProductionProfile("business_owner").activeAccess,
      position: "laboratory_assistant",
      positionDisplayName: "Лаборант",
      navigationItems: ["business.laboratory_results"],
      capabilities: ["business.manage_laboratory_results"],
    },
  };
  const laboratoryReferenceDataSource: LaboratoryReferenceDataSource = {
    async read() {
      return {
        indicators: [
          { id: "al2o3", label: "Al2O3", standard: "ГОСТ 1" },
          { id: "bulk_density", label: "Насыпной вес" },
        ],
        incomingTestProfiles: [],
        finishedProductTypes: [{
          label: "Неформованные изделия",
          indicatorIds: ["al2o3", "bulk_density"],
        }],
      };
    },
  };
  let savedInput: Parameters<LaboratoryResultsRepository["create"]>[0] | undefined;
  const laboratoryResultFilters: Parameters<
    LaboratoryResultsRepository["list"]
  >[0][] = [];
  const laboratoryResults: LaboratoryResultsRepository = {
    async create(input) {
      savedInput = input;
      return {
        id: "laboratory-result-1",
        ...input.result,
        laboratoryAssistantDisplayName: input.laboratoryAssistantDisplayName,
        createdAt: "2026-07-22T08:30:00.000Z",
      };
    },
    async list(filters) {
      laboratoryResultFilters.push(filters);
      return savedInput === undefined ||
          (filters?.section !== undefined &&
            filters.section !== savedInput.result.section)
        ? []
        : [{
            id: "laboratory-result-1",
            ...savedInput.result,
            laboratoryAssistantDisplayName:
              savedInput.laboratoryAssistantDisplayName,
            createdAt: "2026-07-22T08:30:00.000Z",
          }];
    },
    async readOverviewSummary() {
      return {
        monthTotal: savedInput === undefined ? 0 : 1,
        todayTotal: savedInput?.result.analysisDate === "2026-07-22" ? 1 : 0,
      };
    },
    async findById() {
      return savedInput === undefined
        ? undefined
        : {
            id: "laboratory-result-1",
            ...savedInput.result,
            protocolReference: savedInput.protocolReference,
            laboratoryAssistantDisplayName:
              savedInput.laboratoryAssistantDisplayName,
            createdAt: "2026-07-22T08:30:00.000Z",
          };
    },
  };
  let currentBankAssignments: Awaited<ReturnType<
    LaboratoryBankAssignmentsRepository["listCurrent"]
  >> = [];
  const laboratoryBankAssignments: LaboratoryBankAssignmentsRepository = {
    async assign(input) {
      const assignment = {
        assignmentId: "bank-assignment-1",
        bankNumber: input.bankNumber,
        materialLabel: input.materialLabel,
        bulkDensityTonsPerCubicMeter: input.bulkDensityTonsPerCubicMeter,
        bulkDensitySource: input.bulkDensitySource,
        bulkDensitySampleCount: input.bulkDensitySampleCount,
        assignedByDisplayName: input.assignedByDisplayName,
        assignedAt: "2026-07-22T09:00:00.000Z",
      };
      currentBankAssignments = [assignment];
      return assignment;
    },
    async listCurrent() {
      return currentBankAssignments;
    },
    async listHistory() {
      return currentBankAssignments;
    },
  };
  const kilnMaterialFilters: Parameters<
    RotaryKiln2FiringJournalRepository["listMaterialBulkDensities"]
  >[0][] = [];
  const kilnJournal: RotaryKiln2FiringJournalRepository = {
    async create() {
      throw new Error("The bank flow must not create kiln records.");
    },
    async list() {
      return { records: [], averageBulkDensity: null };
    },
    async listMaterialBulkDensities(filters) {
      kilnMaterialFilters.push(filters);
      const materials = [{
        material: "ШКИ-66",
        averageBulkDensityTonsPerCubicMeter: 1.16,
        sampleCount: 10,
        latestRecordDate: "2026-07-30",
      }];
      return filters?.material === undefined
        ? materials
        : materials.filter((item) => item.material === filters.material);
    },
  };
  const bankVolumeReferenceDataSource: BankVolumeReferenceDataSource = {
    async read() {
      return { points: [
        { heightMeters: 0, volumeCubicMeters: 988.5 },
        { heightMeters: 15, volumeCubicMeters: 0 },
      ] };
    },
  };
  await withApiServer(async (baseUrl) => {
    const headers = {
        "Content-Type": "application/json",
        Cookie: "smb_session=prod-session",
      };
      const referenceResponse = await fetch(
        `${baseUrl}/api/laboratory/reference`,
        { headers },
      );
      const createResponse = await fetch(
        `${baseUrl}/api/laboratory/results`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            section: "finished_product",
            analysisDate: "2026-07-22",
            materialLabel: "Неформованные изделия",
            productBrand: "ШКИ-66",
            purpose: "Определение химического состава",
            protocolNote: "Соответствует требованиям.",
            laboratoryAssistantDisplayName: "Подмена с клиента",
            values: { al2o3: "31,4", bulk_density: "1,16" },
          }),
        },
      );
      const listResponse = await fetch(
        `${baseUrl}/api/laboratory/results?section=finished_product&dateFrom=2026-07-01`,
        { headers },
      );
      const protocolResponse = await fetch(
        `${baseUrl}/api/laboratory/results/laboratory-result-1/protocol.pdf`,
        { headers },
      );
      const protocol = Buffer.from(await protocolResponse.arrayBuffer());
      const assignBankResponse = await fetch(
        `${baseUrl}/api/laboratory/banks`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({ bankNumber: 1, material: "ШКИ-66" }),
        },
      );
      const unknownMaterialResponse = await fetch(
        `${baseUrl}/api/laboratory/banks`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({ bankNumber: 1, material: "ШГР-28" }),
        },
      );
      const banksResponse = await fetch(`${baseUrl}/api/laboratory/banks`, {
        headers,
      });
      const banksPayload = await banksResponse.json();

      assert.equal(referenceResponse.status, 200);
      assert.equal(createResponse.status, 201);
      assert.equal(listResponse.status, 200);
      assert.equal(protocolResponse.status, 200);
      assert.equal(protocolResponse.headers.get("content-type"), "application/pdf");
      assert.equal(protocol.subarray(0, 5).toString("ascii"), "%PDF-");
      assert.equal(assignBankResponse.status, 201);
      assert.equal(unknownMaterialResponse.status, 400);
      assert.equal(banksResponse.status, 200);
      assert.equal(
        isRecord(banksPayload) && Array.isArray(banksPayload.currentAssignments)
          ? banksPayload.currentAssignments[0]?.materialLabel
          : undefined,
        "ШКИ-66",
      );
      assert.deepEqual(
        isRecord(banksPayload) && Array.isArray(banksPayload.availableMaterials)
          ? banksPayload.availableMaterials
          : undefined,
        [{
          material: "ШКИ-66",
          averageBulkDensityTonsPerCubicMeter: 1.16,
          sampleCount: 10,
          latestRecordDate: "2026-07-30",
        }],
      );
      assert.deepEqual(kilnMaterialFilters, [
        { material: "ШКИ-66" },
        { material: "ШГР-28" },
        undefined,
      ]);
      assert.equal(currentBankAssignments[0]?.bulkDensityTonsPerCubicMeter, 1.16);
      assert.equal(
        currentBankAssignments[0]?.bulkDensitySource,
        "rotary_kiln_2_journal",
      );
      assert.equal(currentBankAssignments[0]?.bulkDensitySampleCount, 10);
      assert.ok(laboratoryResultFilters.every((filters) =>
        filters?.limit === undefined
      ));
      assert.equal(savedInput?.laboratoryAssistantDisplayName, "Иванова Анна");
      assert.deepEqual(savedInput?.protocolReference, {
        indicators: [
          { id: "al2o3", label: "Al2O3", standard: "ГОСТ 1" },
          { id: "bulk_density", label: "Насыпной вес" },
        ],
        incomingTestProfiles: [],
        finishedProductTypes: [{
          label: "Неформованные изделия",
          indicatorIds: ["al2o3", "bulk_density"],
        }],
      });
      assert.equal(savedInput?.result.materialLabel, "Неформованные изделия");
      assert.equal(savedInput?.submittedByUserId, profile.userId);
      assert.equal(savedInput?.submittedByAccountId, profile.activeAccess.accountId);
    },
    dispatcherSubmissions,
    emptyReferenceDataSource,
    undefined,
    undefined,
    adminDatabase,
    productionConfig,
    buildAuthService({ profile }),
    undefined,
    undefined,
    undefined,
    undefined,
    passthroughProductionBrands,
    undefined,
    undefined,
    laboratoryReferenceDataSource,
    laboratoryResults,
    laboratoryBankAssignments,
    bankVolumeReferenceDataSource,
    undefined,
    kilnJournal,
  );
});

test("laboratory review access reads every journal by name but cannot change laboratory data", async () => {
  const profile: ServerUserProfile = {
    ...buildProductionProfile("business_owner"),
    displayName: "Петров Пётр",
    activeAccess: {
      ...buildProductionProfile("business_owner").activeAccess,
      position: "general_director",
      positionDisplayName: "Генеральный директор",
      navigationItems: ["business.laboratory_review"],
      capabilities: ["business.view_laboratory_results"],
    },
  };
  const storedResult = {
    id: "laboratory-result-1",
    section: "finished_product" as const,
    analysisDate: "2026-07-22",
    materialLabel: "Неформованные изделия",
    productBrand: "ШКИ-66",
    purpose: "Определение химического состава",
    protocolNote: "Соответствует требованиям.",
    values: { al2o3: "31,4" },
    laboratoryAssistantDisplayName: "Иванова Анна",
    createdAt: "2026-07-22T08:30:00.000Z",
  };
  const laboratoryReferenceDataSource: LaboratoryReferenceDataSource = {
    async read() {
      return {
        indicators: [{ id: "al2o3", label: "Al2O3", standard: "ГОСТ 1" }],
        incomingTestProfiles: [],
        finishedProductTypes: [{
          label: "Неформованные изделия",
          indicatorIds: ["al2o3"],
        }],
      };
    },
  };
  const laboratoryResultFilters: Parameters<
    LaboratoryResultsRepository["list"]
  >[0][] = [];
  const laboratoryResults: LaboratoryResultsRepository = {
    async create() {
      throw new Error("Laboratory review access must not create results.");
    },
    async list(filters) {
      laboratoryResultFilters.push(filters);
      return [storedResult];
    },
    async readOverviewSummary() {
      return { monthTotal: 1, todayTotal: 0 };
    },
    async findById() {
      return storedResult;
    },
  };
  const kilnJournalFilters: Parameters<
    RotaryKiln2FiringJournalRepository["list"]
  >[0][] = [];
  const kilnJournal: RotaryKiln2FiringJournalRepository = {
    async create() {
      throw new Error("Laboratory review access must not create kiln records.");
    },
    async list(filters) {
      kilnJournalFilters.push(filters);
      return { records: [], averageBulkDensity: null };
    },
    async listMaterialBulkDensities() {
      return [];
    },
  };
  const sampleRegistrationFilters: Parameters<
    LaboratorySampleRegistrationJournalRepository["list"]
  >[0][] = [];
  const sampleRegistrationJournal: LaboratorySampleRegistrationJournalRepository = {
    async create() {
      throw new Error("Laboratory review access must not create samples.");
    },
    async list(filters) {
      sampleRegistrationFilters.push(filters);
      return [];
    },
    async listOptions() {
      return [];
    },
    async findOptionById() {
      return undefined;
    },
  };
  const chemicalAnalysisFilters: Parameters<
    LaboratoryChemicalAnalysisJournalRepository["list"]
  >[0][] = [];
  const chemicalAnalysisJournal: LaboratoryChemicalAnalysisJournalRepository = {
    async create() {
      throw new Error("Laboratory review access must not create analyses.");
    },
    async list(filters) {
      chemicalAnalysisFilters.push(filters);
      return [];
    },
  };

  await withApiServer(
    async (baseUrl) => {
      const headers = {
        "Content-Type": "application/json",
        Cookie: "smb_session=prod-session",
      };
      const referenceResponse = await fetch(
        `${baseUrl}/api/laboratory/reference`,
        { headers },
      );
      const listResponse = await fetch(
        `${baseUrl}/api/laboratory/results?name=%D0%A8%D0%9A%D0%98&dateFrom=2026-07-01`,
        { headers },
      );
      const protocolResponse = await fetch(
        `${baseUrl}/api/laboratory/results/laboratory-result-1/protocol.pdf`,
        { headers },
      );
      const createResponse = await fetch(`${baseUrl}/api/laboratory/results`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          section: "finished_product",
          analysisDate: "2026-07-22",
          materialLabel: "Неформованные изделия",
          productBrand: "ШКИ-66",
          purpose: "Определение химического состава",
          protocolNote: "Соответствует требованиям.",
          values: { al2o3: "31,4" },
        }),
      });
      const banksResponse = await fetch(`${baseUrl}/api/laboratory/banks`, {
        headers,
      });
      const kilnJournalResponse = await fetch(
        `${baseUrl}/api/laboratory/rotary-kiln-2-journal?dateFrom=2026-07-01`,
        { headers },
      );
      const sampleRegistrationResponse = await fetch(
        `${baseUrl}/api/laboratory/sample-registration-journal?name=%D0%A8%D0%9A%D0%98`,
        { headers },
      );
      const chemicalAnalysisResponse = await fetch(
        `${baseUrl}/api/laboratory/chemical-analysis-journal?name=%D0%A8%D0%9A%D0%98`,
        { headers },
      );
      const kilnJournalCreateResponse = await fetch(
        `${baseUrl}/api/laboratory/rotary-kiln-2-journal`,
        { method: "POST", headers, body: JSON.stringify({}) },
      );

      assert.equal(referenceResponse.status, 200);
      assert.equal(listResponse.status, 200);
      assert.equal(protocolResponse.status, 200);
      assert.equal(
        protocolResponse.headers.get("content-type"),
        "application/pdf",
      );
      assert.equal(createResponse.status, 403);
      assert.equal(banksResponse.status, 403);
      assert.equal(kilnJournalResponse.status, 200);
      assert.equal(sampleRegistrationResponse.status, 200);
      assert.equal(chemicalAnalysisResponse.status, 200);
      assert.equal(kilnJournalCreateResponse.status, 403);
      assert.deepEqual(laboratoryResultFilters, [{
        dateFrom: "2026-07-01",
        nameQuery: "ШКИ",
      }]);
      assert.deepEqual(kilnJournalFilters, [{ dateFrom: "2026-07-01" }]);
      assert.deepEqual(sampleRegistrationFilters, [{ nameQuery: "ШКИ" }]);
      assert.deepEqual(chemicalAnalysisFilters, [{ nameQuery: "ШКИ" }]);
    },
    dispatcherSubmissions,
    emptyReferenceDataSource,
    undefined,
    undefined,
    adminDatabase,
    productionConfig,
    buildAuthService({ profile }),
    undefined,
    undefined,
    undefined,
    undefined,
    passthroughProductionBrands,
    undefined,
    undefined,
    laboratoryReferenceDataSource,
    laboratoryResults,
    undefined,
    undefined,
    undefined,
    kilnJournal,
    sampleRegistrationJournal,
    chemicalAnalysisJournal,
  );
});

test("rotary kiln 2 firing journal saves, filters, and averages records", async () => {
  const profile: ServerUserProfile = {
    ...buildProductionProfile("business_owner"),
    displayName: "Иванова Анна",
    activeAccess: {
      ...buildProductionProfile("business_owner").activeAccess,
      position: "laboratory_assistant",
      positionDisplayName: "Лаборант",
      navigationItems: ["business.laboratory_results"],
      capabilities: ["business.manage_laboratory_results"],
    },
  };
  let savedInput:
    | Parameters<RotaryKiln2FiringJournalRepository["create"]>[0]
    | undefined;
  let requestedFilters:
    | Parameters<RotaryKiln2FiringJournalRepository["list"]>[0]
    | undefined;
  const journal: RotaryKiln2FiringJournalRepository = {
    async create(input) {
      savedInput = input;
      return {
        id: "kiln-record-1",
        ...input.record,
        createdAt: "2026-07-29T08:30:00.000Z",
      };
    },
    async list(filters) {
      requestedFilters = filters;
      return {
        records: savedInput === undefined
          ? []
          : [{
              id: "kiln-record-1",
              ...savedInput.record,
              createdAt: "2026-07-29T08:30:00.000Z",
            }],
        averageBulkDensity: savedInput?.record.bulkDensity ?? null,
      };
    },
    async listMaterialBulkDensities() {
      return savedInput === undefined ? [] : [{
        material: savedInput.record.producedMaterial,
        averageBulkDensityTonsPerCubicMeter: savedInput.record.bulkDensity,
        sampleCount: 1,
        latestRecordDate: savedInput.record.recordDate,
      }];
    },
  };
  const auditEvents: Parameters<AuditRepository["record"]>[0][] = [];
  const audit: AuditRepository = {
    async record(event) {
      auditEvents.push(event);
    },
    async listReport() {
      throw new Error("not used");
    },
  };
  const headers = {
    "Content-Type": "application/json",
    Cookie: "smb_session=prod-session",
  };
  const record = {
    recordDate: "2026-07-29",
    recordTime: "08:05",
    producedMaterial: "ШКИ-66",
    waterAbsorption: 4.2,
    temperatureBeforeCyclone: 850,
    temperatureBeforeFilter: 210.5,
    temperatureInFieldChamber: 118,
    temperatureAtRollback: 96,
    gasConsumptionPerHour: 320.4,
    vacuum: 14.5,
    pressure: 1.8,
    shiftSupervisor: "Петров П.П.",
    burnerOperator: "Сидоров С.С.",
    laboratoryAssistant: "Иванова А.А.",
    sievePass05: 0.7,
    bulkDensity: 1.16,
    kilnLoadBucketsPerHour: 12,
    note: "Краткая остановка для осмотра.",
  };

  await withApiServer(
    async (baseUrl) => {
      const createResponse = await fetch(
        `${baseUrl}/api/laboratory/rotary-kiln-2-journal`,
        {
          method: "POST",
          headers,
          body: JSON.stringify(record),
        },
      );
      const listResponse = await fetch(
        `${baseUrl}/api/laboratory/rotary-kiln-2-journal?dateFrom=2026-07-01&dateTo=2026-07-31&query=Петров`,
        { headers },
      );
      const invalidFilterResponse = await fetch(
        `${baseUrl}/api/laboratory/rotary-kiln-2-journal?dateFrom=2026-02-30`,
        { headers },
      );

      assert.equal(createResponse.status, 201);
      assert.equal(listResponse.status, 200);
      assert.deepEqual(await listResponse.json(), {
        records: [{
          id: "kiln-record-1",
          ...record,
          createdAt: "2026-07-29T08:30:00.000Z",
        }],
        averageBulkDensity: 1.16,
      });
      assert.equal(invalidFilterResponse.status, 400);
      assert.deepEqual(requestedFilters, {
        dateFrom: "2026-07-01",
        dateTo: "2026-07-31",
        query: "Петров",
      });
      assert.equal(savedInput?.submittedByUserId, profile.userId);
      assert.equal(savedInput?.submittedByAccountId, profile.activeAccess.accountId);
      assert.equal(auditEvents[0]?.action, "rotary_kiln_2_firing_record.submit");
      assert.equal(auditEvents[0]?.targetType, "rotary_kiln_2_firing_record");
      assert.equal(auditEvents[0]?.targetId, "kiln-record-1");
      assert.equal(savedInput?.record.producedMaterial, "ШКИ-66");
      assert.ok(auditEvents[0]?.details?.some((detail) =>
        detail.label === "Производимый материал" && detail.value === "ШКИ-66"
      ));
    },
    dispatcherSubmissions,
    emptyReferenceDataSource,
    undefined,
    undefined,
    adminDatabase,
    productionConfig,
    buildAuthService({ profile }),
    undefined,
    undefined,
    audit,
    undefined,
    passthroughProductionBrands,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    journal,
  );
});

test("sample registration journal saves and filters registration records", async () => {
  const profile: ServerUserProfile = {
    ...buildProductionProfile("business_owner"),
    displayName: "Иванова Анна",
    activeAccess: {
      ...buildProductionProfile("business_owner").activeAccess,
      position: "laboratory_assistant",
      positionDisplayName: "Лаборант",
      navigationItems: ["business.laboratory_results"],
      capabilities: ["business.manage_laboratory_results"],
    },
  };
  let savedInput:
    | Parameters<LaboratorySampleRegistrationJournalRepository["create"]>[0]
    | undefined;
  let requestedFilters:
    | Parameters<LaboratorySampleRegistrationJournalRepository["list"]>[0]
    | undefined;
  const journal: LaboratorySampleRegistrationJournalRepository = {
    async create(input) {
      savedInput = input;
      return {
        id: "sample-registration-1",
        ...input.record,
        createdAt: "2026-07-30T08:30:00.000Z",
      };
    },
    async list(filters) {
      requestedFilters = filters;
      return savedInput === undefined
        ? []
        : [{
            id: "sample-registration-1",
            ...savedInput.record,
            createdAt: "2026-07-30T08:30:00.000Z",
          }];
    },
    async listOptions() {
      return [];
    },
    async findOptionById() {
      return undefined;
    },
  };
  const auditEvents: Parameters<AuditRepository["record"]>[0][] = [];
  const audit: AuditRepository = {
    async record(event) {
      auditEvents.push(event);
    },
    async listReport() {
      throw new Error("not used");
    },
  };
  const headers = {
    "Content-Type": "application/json",
    Cookie: "smb_session=prod-session",
  };
  const record = {
    sampleNumber: "17-А",
    laboratorySampleCode: "ЛП-2026-017",
    samplingDate: "2026-07-29",
    samplingLaboratoryAssistant: "Иванова А.А.",
    sampleName: "Шамот молотый",
    registrationDate: "2026-07-29",
    samplingLocation: "Склад сырья",
  };

  await withApiServer(
    async (baseUrl) => {
      const createResponse = await fetch(
        `${baseUrl}/api/laboratory/sample-registration-journal`,
        {
          method: "POST",
          headers,
          body: JSON.stringify(record),
        },
      );
      const listResponse = await fetch(
        `${baseUrl}/api/laboratory/sample-registration-journal?dateFrom=2026-07-01&dateTo=2026-07-31&query=ЛП-2026-017`,
        { headers },
      );
      const invalidFilterResponse = await fetch(
        `${baseUrl}/api/laboratory/sample-registration-journal?dateTo=2026-02-30`,
        { headers },
      );

      assert.equal(createResponse.status, 201);
      assert.equal(listResponse.status, 200);
      assert.deepEqual(await listResponse.json(), {
        records: [{
          id: "sample-registration-1",
          ...record,
          createdAt: "2026-07-30T08:30:00.000Z",
        }],
      });
      assert.equal(invalidFilterResponse.status, 400);
      assert.deepEqual(requestedFilters, {
        dateFrom: "2026-07-01",
        dateTo: "2026-07-31",
        query: "ЛП-2026-017",
      });
      assert.equal(savedInput?.submittedByUserId, profile.userId);
      assert.equal(savedInput?.submittedByAccountId, profile.activeAccess.accountId);
      assert.equal(
        auditEvents[0]?.action,
        "laboratory_sample_registration.submit",
      );
      assert.equal(
        auditEvents[0]?.targetType,
        "laboratory_sample_registration",
      );
      assert.equal(auditEvents[0]?.targetId, "sample-registration-1");
    },
    dispatcherSubmissions,
    emptyReferenceDataSource,
    undefined,
    undefined,
    adminDatabase,
    productionConfig,
    buildAuthService({ profile }),
    undefined,
    undefined,
    audit,
    undefined,
    passthroughProductionBrands,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    journal,
  );
});

test("chemical analysis journal saves an analysis for a registered sample", async () => {
  const profile: ServerUserProfile = {
    ...buildProductionProfile("business_owner"),
    displayName: "Иванова Анна",
    activeAccess: {
      ...buildProductionProfile("business_owner").activeAccess,
      position: "laboratory_assistant",
      positionDisplayName: "Лаборант",
      navigationItems: ["business.laboratory_results"],
      capabilities: ["business.manage_laboratory_results"],
    },
  };
  const sampleOption = {
    id: "sample-registration-1",
    laboratorySampleCode: "ЛП-2026-017",
    sampleNumber: "17-А",
    sampleName: "Шамот молотый",
    samplingDate: "2026-07-29",
    registrationDate: "2026-07-30",
  };
  let requestedSampleFilters:
    | Parameters<LaboratorySampleRegistrationJournalRepository["listOptions"]>[0]
    | undefined;
  const sampleJournal: LaboratorySampleRegistrationJournalRepository = {
    async create() {
      throw new Error("not used");
    },
    async list() {
      return [];
    },
    async listOptions(filters) {
      requestedSampleFilters = filters;
      return [sampleOption];
    },
    async findOptionById(id) {
      return id === sampleOption.id ? sampleOption : undefined;
    },
  };
  let savedInput:
    | Parameters<LaboratoryChemicalAnalysisJournalRepository["create"]>[0]
    | undefined;
  let requestedFilters:
    | Parameters<LaboratoryChemicalAnalysisJournalRepository["list"]>[0]
    | undefined;
  const chemicalJournal: LaboratoryChemicalAnalysisJournalRepository = {
    async create(input) {
      savedInput = input;
      return {
        id: "chemical-analysis-1",
        ...input.analysis,
        laboratorySampleCode: input.sample.laboratorySampleCode,
        sampleNumber: input.sample.sampleNumber,
        sampleName: input.sample.sampleName,
        createdAt: "2026-07-30T08:30:00.000Z",
      };
    },
    async list(filters) {
      requestedFilters = filters;
      return savedInput === undefined
        ? []
        : [{
            id: "chemical-analysis-1",
            ...savedInput.analysis,
            laboratorySampleCode: savedInput.sample.laboratorySampleCode,
            sampleNumber: savedInput.sample.sampleNumber,
            sampleName: savedInput.sample.sampleName,
            createdAt: "2026-07-30T08:30:00.000Z",
          }];
    },
  };
  const auditEvents: Parameters<AuditRepository["record"]>[0][] = [];
  const audit: AuditRepository = {
    async record(event) {
      auditEvents.push(event);
    },
    async listReport() {
      throw new Error("not used");
    },
  };
  const headers = {
    "Content-Type": "application/json",
    Cookie: "smb_session=prod-session",
  };
  const analysis = {
    sampleRegistrationId: "sample-registration-1",
    batchNumber: "П-42",
  };

  await withApiServer(
    async (baseUrl) => {
      const createResponse = await fetch(
        `${baseUrl}/api/laboratory/chemical-analysis-journal`,
        {
          method: "POST",
          headers,
          body: JSON.stringify(analysis),
        },
      );
      const listResponse = await fetch(
        `${baseUrl}/api/laboratory/chemical-analysis-journal?dateFrom=2026-07-01&dateTo=2026-07-31&query=ЛП-2026-017&sampleQuery=Шамот`,
        { headers },
      );
      const unknownSampleResponse = await fetch(
        `${baseUrl}/api/laboratory/chemical-analysis-journal`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            ...analysis,
            sampleRegistrationId: "missing-registration",
          }),
        },
      );

      assert.equal(createResponse.status, 201);
      assert.equal(listResponse.status, 200);
      assert.deepEqual(await listResponse.json(), {
        records: [{
          id: "chemical-analysis-1",
          ...analysis,
          laboratorySampleCode: "ЛП-2026-017",
          sampleNumber: "17-А",
          sampleName: "Шамот молотый",
          createdAt: "2026-07-30T08:30:00.000Z",
        }],
        sampleOptions: [sampleOption],
      });
      assert.equal(unknownSampleResponse.status, 400);
      assert.deepEqual(requestedFilters, {
        dateFrom: "2026-07-01",
        dateTo: "2026-07-31",
        query: "ЛП-2026-017",
      });
      assert.deepEqual(requestedSampleFilters, { query: "Шамот" });
      assert.equal(savedInput?.submittedByUserId, profile.userId);
      assert.equal(savedInput?.submittedByAccountId, profile.activeAccess.accountId);
      assert.equal(
        auditEvents[0]?.action,
        "laboratory_chemical_analysis.submit",
      );
      assert.equal(
        auditEvents[0]?.targetType,
        "laboratory_chemical_analysis",
      );
      assert.equal(auditEvents[0]?.targetId, "chemical-analysis-1");
      assert.deepEqual(auditEvents[0]?.details, [
        {
          label: "Код лабораторной пробы",
          value: "ЛП-2026-017",
        },
        { label: "Номер партии", value: "П-42" },
      ]);
    },
    dispatcherSubmissions,
    emptyReferenceDataSource,
    undefined,
    undefined,
    adminDatabase,
    productionConfig,
    buildAuthService({ profile }),
    undefined,
    undefined,
    audit,
    undefined,
    passthroughProductionBrands,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    sampleJournal,
    chemicalJournal,
  );
});

test("laboratory PDF protocol requires an authenticated laboratory access", async () => {
  await withApiServer(
    async (baseUrl) => {
      const response = await fetch(
        `${baseUrl}/api/laboratory/results/laboratory-result-1/protocol.pdf`,
      );

      assert.equal(response.status, 401);
      assert.match(response.headers.get("content-type") ?? "", /application\/json/u);
    },
    dispatcherSubmissions,
    emptyReferenceDataSource,
    undefined,
    undefined,
    adminDatabase,
    productionConfig,
  );
});

test("dispatcher reads current bank materials and approved COSH measurements by date", async () => {
  const laboratoryBankAssignments: LaboratoryBankAssignmentsRepository = {
    async assign() {
      throw new Error("Assignments are not created through the dispatcher endpoint.");
    },
    async listCurrent() {
      return [
        buildLaboratoryBankAssignment(1, "ШКИ-66", 1.16),
        buildLaboratoryBankAssignment(3, "ШГР-1", 1.24),
      ];
    },
    async listHistory() {
      throw new Error("Dispatcher bank contents must not expose assignment history.");
    },
  };
  const requestedReportDates: string[][] = [];
  const refractoryReports: RefractoryReportsRepository = {
    async submit() { throw new Error("not used"); },
    async listLatestForShift() { return []; },
    async listLatestApprovedCoshForDates(input) {
      requestedReportDates.push([...input.reportDates]);
      return [
        buildApprovedCoshReport({
          id: "cosh-previous",
          reportDate: "2026-07-22",
          shiftNumber: 2,
          measurements: [1.25, 1.5, 1.75],
        }),
        buildApprovedCoshReport({
          id: "cosh-current",
          reportDate: "2026-07-23",
          shiftNumber: 1,
          measurements: [1.1, 1.4, 1.6],
        }),
      ];
    },
    async listPending() { return []; },
    async listRecentForSubmitter() { return []; },
    async review() { throw new Error("not used"); },
  };

  await withApiServer(
    async (baseUrl) => {
      const unauthorizedResponse = await fetch(
        `${baseUrl}/api/dispatcher/production-bank-contents?date=2026-07-23`,
      );
      const headers = await createDispatcherHeaders(baseUrl);
      const missingDateResponse = await fetch(
        `${baseUrl}/api/dispatcher/production-bank-contents`,
        { headers },
      );
      const response = await fetch(
        `${baseUrl}/api/dispatcher/production-bank-contents?date=2026-07-23`,
        { headers },
      );

      assert.equal(unauthorizedResponse.status, 401);
      assert.equal(missingDateResponse.status, 400);
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), {
        reportDate: "2026-07-23",
        previousReportDate: "2026-07-22",
        bankContents: [
          { bankNumber: 1, materialLabel: "ШКИ-66" },
          { bankNumber: 3, materialLabel: "ШГР-1" },
        ],
        bankMeasurements: [
          { bankNumber: 1, start: 1.25, end: 1.1 },
          { bankNumber: 2, start: 1.5, end: 1.4 },
          { bankNumber: 3, start: 1.75, end: 1.6 },
        ],
      });
      assert.deepEqual(requestedReportDates, [
        ["2026-07-22", "2026-07-23"],
      ]);
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
    passthroughProductionBrands,
    undefined,
    refractoryReports,
    undefined,
    undefined,
    laboratoryBankAssignments,
  );
});

test("production submission replaces client bank values with approved COSH measurements", async () => {
  let createdDraft: ValidatedDispatcherSubmissionDraft | undefined;
  const repository = buildRepositoryWithHistory([], (draft) => {
    createdDraft = draft;
  });
  const refractoryReports: RefractoryReportsRepository = {
    ...emptyRefractoryReports,
    async listLatestApprovedCoshForDates() {
      return [
        buildApprovedCoshReport({
          id: "cosh-previous",
          reportDate: "2026-07-22",
          shiftNumber: 2,
          measurements: [1.25, 1.5, 1.75],
        }),
        buildApprovedCoshReport({
          id: "cosh-current",
          reportDate: "2026-07-23",
          shiftNumber: 2,
          measurements: [1.1, 1.4, 1.6],
        }),
      ];
    },
  };

  await withApiServer(
    async (baseUrl) => {
      const headers = await createDispatcherHeaders(baseUrl);
      const response = await fetch(`${baseUrl}/api/dispatcher/submissions`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          formId: "production",
          payload: {
            reportDate: "2026-07-23",
            granulationPlatesInOperation: "2",
            jarStart1: "999",
            jarShipmentStart1: "118.5",
            jarEnd1: "998",
            jarShipmentEnd1: "94",
          },
        }),
      });

      assert.equal(response.status, 201);
      assert.deepEqual(createdDraft?.draft.payload, {
        reportDate: "23.07.2026",
        reportMonth: "2026-07",
        granulationPlatesInOperation: "2",
        jarStart1: "1.25",
        jarShipmentStart1: "118.5",
        jarEnd1: "1.1",
        jarShipmentEnd1: "94",
        jarStart2: "1.5",
        jarEnd2: "1.4",
        jarStart3: "1.75",
        jarEnd3: "1.6",
      });
    },
    repository,
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
    passthroughProductionBrands,
    undefined,
    refractoryReports,
  );
});

test("COSH API calculates and snapshots all three current bank assignments", async () => {
  const profile = buildProductionProfile("worker");
  profile.displayName = "Мастер ОЦ";
  profile.activeAccess.navigationItems = ["business.refractory_shop"];
  profile.activeAccess.capabilities = ["business.submit_refractory_reports"];
  let stored: RefractoryReportRevision | undefined;
  const refractoryReports: RefractoryReportsRepository = {
    async submit(input) {
      stored = {
        id: "cosh-report-1",
        ...input.report,
        revisionNumber: 1,
        status: "pending",
        submittedByUserId: input.submittedByUserId,
        submittedByAccountId: input.submittedByAccountId,
        masterDisplayName: input.masterDisplayName,
        submittedAt: "2026-07-23T10:00:00.000Z",
      };
      return stored;
    },
    async listLatestForShift() { return []; },
    async listLatestApprovedCoshForDates() { return []; },
    async listPending() { return []; },
    async listRecentForSubmitter() { return []; },
    async review() { throw new Error("not used"); },
  };
  const assignments = [
    buildLaboratoryBankAssignment(1, "ШКИ", 1),
    buildLaboratoryBankAssignment(2, "ШКИ-66", 2),
    buildLaboratoryBankAssignment(3, "ШГР-28", 3),
  ];
  const laboratoryBankAssignments: LaboratoryBankAssignmentsRepository = {
    async assign() { throw new Error("not used"); },
    async listCurrent() { return assignments; },
    async listHistory() { return assignments; },
  };
  const bankVolumeReferenceDataSource: BankVolumeReferenceDataSource = {
    async read() {
      return { points: [
        { heightMeters: 0, volumeCubicMeters: 100 },
        { heightMeters: 1, volumeCubicMeters: 80 },
        { heightMeters: 2, volumeCubicMeters: 40 },
        { heightMeters: 3, volumeCubicMeters: 0 },
      ] };
    },
  };
  const productionBrands: ProductionBrandsDataSource = {
    async list() { return ["ШБО-69"]; },
    async create() { throw new Error("not used"); },
    async resolveReferences(references) {
      const missing = references.find(
        (reference) =>
          reference.label.trim().toLocaleLowerCase("ru-RU") !== "шбо-69",
      );

      return missing === undefined
        ? {
            ok: true,
            references: references.map((reference) => ({
              fieldName: reference.fieldName,
              label: "ШБО-69",
            })),
          }
        : { ok: false, missing };
    },
  };

  await withApiServer(
    async (baseUrl) => {
      const invalidResponse = await fetch(
        `${baseUrl}/api/refractory-reports`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Cookie: "smb_session=prod-session",
          },
          body: JSON.stringify({
            reportType: "cosh",
            reportDate: "2026-07-23",
            shiftNumber: 1,
            payload: {
              chamotteOutputRows: [
                { productBrand: "ШБО", quantityTons: 2.5 },
              ],
              jarMeasurements: [
                { jarNumber: 1, values: [1, 1] },
                { jarNumber: 2, values: [2] },
                { jarNumber: 3, values: [3] },
              ],
            },
          }),
        },
      );
      const invalidPayload = await invalidResponse.json();

      assert.equal(invalidResponse.status, 400);
      assert.deepEqual(
        isRecord(invalidPayload) && isRecord(invalidPayload.error)
          ? invalidPayload.error
          : undefined,
        {
          code: "invalid_response",
          message:
            "Выпуск шамота, строка 1, поле «Марка изделия»: значение «ШБО» отсутствует в номенклатуре. Выберите марку из списка.",
          details: [{
            fieldPath: "chamotteOutputRows.0.productBrand",
            message:
              "Выпуск шамота, строка 1, поле «Марка изделия»: значение «ШБО» отсутствует в номенклатуре. Выберите марку из списка.",
          }],
        },
      );

      const response = await fetch(`${baseUrl}/api/refractory-reports`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: "smb_session=prod-session",
        },
        body: JSON.stringify({
          reportType: "cosh",
          reportDate: "2026-07-23",
          shiftNumber: 1,
          payload: {
            chamotteOutputRows: [
              { productBrand: " шбо-69 ", quantityTons: 2.5 },
            ],
            jarMeasurements: [
              { jarNumber: 1, values: [1, 1] },
              { jarNumber: 2, values: [2] },
              { jarNumber: 3, values: [3] },
            ],
          },
        }),
      });

      assert.equal(response.status, 201);
      assert.equal(stored?.reportType, "cosh");
      if (stored?.reportType !== "cosh") return;
      const rows = (stored.payload as {
        jarMeasurements?: Array<{ material?: string; materialMassTons?: number }>;
      }).jarMeasurements;
      const totals = stored.totals as { jarMaterialMassTons?: number };
      assert.equal(rows?.[0]?.material, "ШКИ");
      assert.equal(rows?.[1]?.materialMassTons, 80);
      assert.equal(rows?.[2]?.materialMassTons, 0);
      assert.equal(totals.jarMaterialMassTons, 160);
      assert.deepEqual((stored.payload as RefractoryCoshPayload).chamotteOutputRows, [
        { productBrand: "ШБО-69", quantityTons: 2.5 },
      ]);
    },
    dispatcherSubmissions,
    emptyReferenceDataSource,
    undefined,
    undefined,
    adminDatabase,
    productionConfig,
    buildAuthService({ profile }),
    undefined,
    undefined,
    undefined,
    undefined,
    productionBrands,
    undefined,
    refractoryReports,
    undefined,
    undefined,
    laboratoryBankAssignments,
    bankVolumeReferenceDataSource,
  );
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
      "business.review_refractory_reports",
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
    allowProtectedAccounts: false,
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

test("admin database rows endpoint forwards a bounded search term", async () => {
  const listed: Array<{ limit?: number; offset?: number; search?: string }> = [];
  const repository: AdminDatabaseRepository = {
    ...adminDatabase,
    async listRows(_tableName, options) {
      listed.push({ ...options });
      return {
        table: adminDatabaseTable,
        rows: [],
        mergeTargets: [],
        limit: 100,
        offset: 0,
      };
    },
  };

  await withApiServer(
    async (baseUrl) => {
      const headers = {
        "X-SMB-Dev-Session": await createDevSession(baseUrl, "admin"),
      };
      const rowsEndpoint =
        `${baseUrl}/api/admin/database/tables/dispatcher_submissions/rows`;
      const searchResponse = await fetch(
        `${rowsEndpoint}?search=${encodeURIComponent("  INC-2026-51  ")}`,
        { headers },
      );
      const blankResponse = await fetch(`${rowsEndpoint}?search=%20%20`, { headers });
      const longResponse = await fetch(
        `${rowsEndpoint}?search=${"и".repeat(121)}`,
        { headers },
      );

      assert.equal(searchResponse.status, 200);
      assert.equal(blankResponse.status, 200);
      assert.equal(longResponse.status, 400);
      assert.equal(listed[0]?.search, "INC-2026-51");
      assert.equal(listed[1]?.search, undefined);
      assert.equal(listed.length, 2);
    },
    dispatcherSubmissions,
    emptyReferenceDataSource,
    undefined,
    undefined,
    repository,
  );
});

test("admin dispatcher editor uses and enforces the shared production brands", async () => {
  let updatedValues: Record<string, string | null> | undefined;
  const repository: AdminDatabaseRepository = {
    ...adminDatabase,
    async listRows() {
      return {
        table: adminDatabaseTable,
        rows: [{
          primaryKey: { id: "production-row" },
          values: {
            id: "production-row",
            "payload.formingProductBrand": "Старая марка",
          },
          editorFields: [{
            name: "payload.formingProductBrand",
            label: "Марка изделия",
            inputType: "text",
            required: false,
            options: [],
            value: "Старая марка",
          }],
        }],
        mergeTargets: [],
        limit: 100,
        offset: 0,
      };
    },
    async updateRow(value) {
      updatedValues = value.values;
    },
  };
  const productionBrands: ProductionBrandsDataSource = {
    async list() {
      return ["ФЛ-1", "ША-22"];
    },
    async create(label, commitCreated) {
      await commitCreated(label);
      return { label, created: true };
    },
    async resolveReferences(references) {
      return {
        ok: true,
        references: references.map((reference) => ({
          ...reference,
          label: reference.label.trim().toLocaleLowerCase("ru-RU") === "фл-1"
            ? "ФЛ-1"
            : reference.label,
        })),
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
      const rowsResponse = await fetch(
        `${baseUrl}/api/admin/database/tables/dispatcher_submissions/rows`,
        { headers },
      );
      const rowsPayload = await rowsResponse.json();
      const firstField = isRecord(rowsPayload) && Array.isArray(rowsPayload.rows) &&
          isRecord(rowsPayload.rows[0]) && Array.isArray(rowsPayload.rows[0].editorFields)
        ? rowsPayload.rows[0].editorFields[0]
        : undefined;

      assert.equal(rowsResponse.status, 200);
      assert.equal(isRecord(firstField) ? firstField.inputType : undefined, "production_brand");
      assert.deepEqual(isRecord(firstField) ? firstField.options : undefined, [
        { value: "ФЛ-1", label: "ФЛ-1" },
        { value: "ША-22", label: "ША-22" },
      ]);

      const updateResponse = await fetch(
        `${baseUrl}/api/admin/database/tables/dispatcher_submissions/rows`,
        {
          method: "PATCH",
          headers,
          body: JSON.stringify({
            primaryKey: { id: "production-row" },
            values: { "payload.formingProductBrand": " фл-1 " },
          }),
        },
      );

      assert.equal(updateResponse.status, 200);
      assert.equal(updatedValues?.["payload.formingProductBrand"], "ФЛ-1");
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
    undefined,
    undefined,
    productionBrands,
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

test("delegated database admin cannot edit a protected account", async () => {
  let didUpdate = false;
  const databaseRepository: AdminDatabaseRepository = {
    ...adminDatabase,
    async updateRow() {
      didUpdate = true;
    },
  };
  const profile = buildProductionProfile("business_owner");
  profile.activeAccess.navigationItems = ["admin.database"];
  profile.activeAccess.capabilities = [
    "platform.manage_analytics_database",
    "platform.manage_users",
    "platform.manage_access",
  ];
  const actorAccount = {
    ...adminAccount,
    accessId: profile.activeAccess.accountId,
    userId: profile.userId,
    login: "database-manager",
    accountType: profile.accountType,
    position: profile.activeAccess.position,
    positionDisplayName: profile.activeAccess.positionDisplayName,
    capabilities: profile.activeAccess.capabilities,
    navigationItems: profile.activeAccess.navigationItems,
  };
  const protectedAccount = {
    ...adminAccount,
    accessId: "protected-access-id",
    userId: "protected-user-id",
    login: "protected-admin",
    isProtected: true,
  };
  const accountRepository: AccountsRepository = {
    ...accounts,
    async listAccounts() {
      return [actorAccount, protectedAccount];
    },
  };

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
            primaryKey: { id: protectedAccount.userId },
            values: { display_name: "Новое имя" },
          }),
        },
      );

      assert.equal(response.status, 403);
    },
    dispatcherSubmissions,
    emptyReferenceDataSource,
    undefined,
    undefined,
    databaseRepository,
    productionConfig,
    buildAuthService({ profile }),
    accountRepository,
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
  isProtected: false,
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
  async setAccountProtected({ userId, isProtected }) {
    return { userId, isProtected };
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
        boardAssignmentAccess: "none",
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
        boardAssignmentAccess: "none",
        isProtected: true,
        usageCount: 0,
        createdAt: "2026-07-10T00:00:00.000Z",
      },
    ];
  },
  async createPosition(input) {
    return { id: "created-position", accountType: "business_owner", ...input, boardAssignmentAccess: "none", isProtected: false, usageCount: 0, createdAt: "2026-07-10T00:00:00.000Z" };
  },
  async updatePosition(input) {
    return { id: input.id, displayName: input.displayName, accountType: "dispatcher", navigationItems: input.navigationItems, capabilities: input.capabilities, boardAssignmentAccess: "none", isProtected: false, usageCount: 1, createdAt: "2026-07-10T00:00:00.000Z" };
  },
  async deletePosition() {
    return "deleted";
  },
  async setPositionOrder() {
    return true;
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

test("account preview navigation grants reads without business mutations", async () => {
  const profile = buildProductionProfile("business_owner");
  profile.activeAccess.navigationItems = ["admin.account_preview"];
  profile.activeAccess.capabilities = resolveCapabilitiesForPosition(
    "preview-only",
    profile.activeAccess.navigationItems,
    "none",
  );
  const repository: AccountsRepository = {
    ...accounts,
    async listAccounts() {
      return [{
        ...adminAccount,
        accessId: profile.activeAccess.accountId,
        userId: profile.userId,
        login: "account-preview-user",
        capabilities: [],
        navigationItems: ["admin.account_preview"],
      }];
    },
  };
  const authService = buildAuthService({ profile });
  const laboratoryBankAssignments: LaboratoryBankAssignmentsRepository = {
    async assign() {
      throw new Error("Account preview must not assign laboratory banks.");
    },
    async listCurrent() {
      return [];
    },
    async listHistory() {
      return [];
    },
  };
  const rotaryKiln2FiringJournal: RotaryKiln2FiringJournalRepository = {
    async create() {
      throw new Error("Account preview must not create kiln records.");
    },
    async list() {
      return { records: [], averageBulkDensity: null };
    },
    async listMaterialBulkDensities() {
      return [];
    },
  };

  await withApiServer(async (baseUrl) => {
    const headers = {
      "Content-Type": "application/json",
      Cookie: `${productionConfig.session.cookieName}=prod-session`,
    };
    const accountsResponse = await fetch(`${baseUrl}/api/admin/accounts`, {
      headers,
    });
    const positionsResponse = await fetch(`${baseUrl}/api/admin/positions`, {
      headers,
    });
    const dispatcherFeedResponse = await fetch(
      `${baseUrl}/api/dispatcher/submissions`,
      { headers },
    );
    const productionBrandsResponse = await fetch(
      `${baseUrl}/api/production-brands`,
      { headers },
    );
    const laboratoryBanksResponse = await fetch(
      `${baseUrl}/api/laboratory/banks`,
      { headers },
    );
    const submitDispatcherResponse = await fetch(
      `${baseUrl}/api/dispatcher/submissions`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({}),
      },
    );
    const createProductionBrandResponse = await fetch(
      `${baseUrl}/api/production-brands`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({ label: "Недопустимая марка" }),
      },
    );
    const assignLaboratoryBankResponse = await fetch(
      `${baseUrl}/api/laboratory/banks`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({ bankNumber: 1, material: "ШКИ-66" }),
      },
    );
    const additionalBusinessMutationResponses = await Promise.all(
      [
        "/api/dispatcher/equipment-report",
        "/api/production-plans",
        "/api/production-plans/preview",
        "/api/refractory-reports",
        "/api/refractory-reports/report-1/decision",
        "/api/laboratory/results",
        "/api/laboratory/rotary-kiln-2-journal",
        "/api/laboratory/sample-registration-journal",
        "/api/laboratory/chemical-analysis-journal",
        "/api/board-assignments",
      ].map((pathname) =>
        fetch(`${baseUrl}${pathname}`, {
          method: "POST",
          headers,
          body: JSON.stringify({}),
        })
      ),
    );
    const createAccountResponse = await fetch(`${baseUrl}/api/admin/accounts`, {
      method: "POST",
      headers,
      body: JSON.stringify({}),
    });
    const updateAccountResponse = await fetch(`${baseUrl}/api/admin/accounts`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({}),
    });
    const createPositionResponse = await fetch(`${baseUrl}/api/admin/positions`, {
      method: "POST",
      headers,
      body: JSON.stringify({}),
    });
    const updatePositionResponse = await fetch(
      `${baseUrl}/api/admin/positions/dispatcher`,
      {
        method: "PATCH",
        headers,
        body: JSON.stringify({}),
      },
    );

    assert.equal(accountsResponse.status, 200);
    assert.equal(positionsResponse.status, 200);
    assert.equal(dispatcherFeedResponse.status, 200);
    assert.equal(productionBrandsResponse.status, 200);
    assert.equal(laboratoryBanksResponse.status, 200);
    assert.equal(submitDispatcherResponse.status, 403);
    assert.equal(createProductionBrandResponse.status, 403);
    assert.equal(assignLaboratoryBankResponse.status, 403);
    assert.deepEqual(
      additionalBusinessMutationResponses.map((response) => response.status),
      Array(additionalBusinessMutationResponses.length).fill(403),
    );
    assert.equal(createAccountResponse.status, 403);
    assert.equal(updateAccountResponse.status, 403);
    assert.equal(createPositionResponse.status, 403);
    assert.equal(updatePositionResponse.status, 403);
  },
    dispatcherSubmissions,
    emptyReferenceDataSource,
    undefined,
    undefined,
    adminDatabase,
    productionConfig,
    authService,
    repository,
    undefined,
    undefined,
    undefined,
    passthroughProductionBrands,
    undefined,
    emptyRefractoryReports,
    undefined,
    undefined,
    laboratoryBankAssignments,
    undefined,
    undefined,
    rotaryKiln2FiringJournal,
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

test("admin positions API creates a position with tabs from the unified workspace", async () => {
  let createdInput: Parameters<AccountsRepository["createPosition"]>[0] | undefined;
  const repository: AccountsRepository = {
    ...accounts,
    async createPosition(input) {
      createdInput = input;
      return { id: "position-chief", accountType: "business_owner", ...input, boardAssignmentAccess: "none", isProtected: false, usageCount: 0, createdAt: "2026-07-12T00:00:00.000Z" };
    },
  };

  await withApiServer(async (baseUrl) => {
    const sessionId = await createDevSession(baseUrl, "admin");
    const response = await fetch(`${baseUrl}/api/admin/positions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-SMB-Dev-Session": sessionId },
      body: JSON.stringify({
        displayName: "Главный инженер",
        navigationItems: ["business.overview", "business.dispatcher_form"],
      }),
    });

    assert.equal(response.status, 201);
  }, dispatcherSubmissions, emptyReferenceDataSource, undefined, undefined, adminDatabase, config, undefined, repository);

  assert.deepEqual(createdInput?.navigationItems, ["business.overview", "business.dispatcher_form"]);
  assert.equal(createdInput?.capabilities.includes("business.view_dispatcher_feed"), true);
});

test("admin positions API saves the complete order and rejects a stale catalog", async () => {
  const requestedOrders: string[][] = [];
  let shouldAccept = true;
  const repository: AccountsRepository = {
    ...accounts,
    async setPositionOrder(positionIds) {
      requestedOrders.push(positionIds);
      return shouldAccept;
    },
  };

  await withApiServer(async (baseUrl) => {
    const sessionId = await createDevSession(baseUrl, "admin");
    const headers = {
      "Content-Type": "application/json",
      "X-SMB-Dev-Session": sessionId,
    };
    const response = await fetch(`${baseUrl}/api/admin/positions/order`, {
      method: "PUT",
      headers,
      body: JSON.stringify({
        positionIds: ["business_owner", "dispatcher"],
      }),
    });
    shouldAccept = false;
    const staleResponse = await fetch(`${baseUrl}/api/admin/positions/order`, {
      method: "PUT",
      headers,
      body: JSON.stringify({
        positionIds: ["dispatcher"],
      }),
    });

    assert.equal(response.status, 200);
    assert.equal(staleResponse.status, 409);
  }, dispatcherSubmissions, emptyReferenceDataSource, undefined, undefined, adminDatabase, config, undefined, repository);

  assert.deepEqual(requestedOrders, [
    ["business_owner", "dispatcher"],
    ["dispatcher"],
  ]);
});

test("admin positions order API rejects duplicate ids before writing", async () => {
  let didWrite = false;
  const repository: AccountsRepository = {
    ...accounts,
    async setPositionOrder() {
      didWrite = true;
      return true;
    },
  };

  await withApiServer(async (baseUrl) => {
    const sessionId = await createDevSession(baseUrl, "admin");
    const response = await fetch(`${baseUrl}/api/admin/positions/order`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "X-SMB-Dev-Session": sessionId,
      },
      body: JSON.stringify({
        positionIds: ["dispatcher", "dispatcher"],
      }),
    });

    assert.equal(response.status, 400);
  }, dispatcherSubmissions, emptyReferenceDataSource, undefined, undefined, adminDatabase, config, undefined, repository);

  assert.equal(didWrite, false);
});

test("admin positions API stores the selected board assignment access variant", async () => {
  const created: Parameters<AccountsRepository["createPosition"]>[0][] = [];
  const repository: AccountsRepository = {
    ...accounts,
    async createPosition(input) {
      created.push(input);
      return {
        id: "position-board-reviewer",
        accountType: "business_owner",
        ...input,
        boardAssignmentAccess: "review",
        isProtected: false,
        usageCount: 0,
        createdAt: "2026-07-27T00:00:00.000Z",
      };
    },
  };

  await withApiServer(async (baseUrl) => {
    const sessionId = await createDevSession(baseUrl, "admin");
    const headers = {
      "Content-Type": "application/json",
      "X-SMB-Dev-Session": sessionId,
    };
    const response = await fetch(`${baseUrl}/api/admin/positions`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        displayName: "Проверяющий поручений",
        navigationItems: ["business.board_assignments"],
        boardAssignmentAccess: "review",
      }),
    });
    const invalidResponse = await fetch(`${baseUrl}/api/admin/positions`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        displayName: "Несогласованная должность",
        navigationItems: ["business.overview"],
        boardAssignmentAccess: "execute",
      }),
    });

    assert.equal(response.status, 201);
    assert.equal(invalidResponse.status, 400);
  }, dispatcherSubmissions, emptyReferenceDataSource, undefined, undefined, adminDatabase, config, undefined, repository);

  assert.deepEqual(created[0]?.capabilities, [
    "business.view_board_assignments",
    "business.create_board_assignments",
    "business.review_board_assignments",
  ]);
});

test("admin positions API requires a tab and rejects the removed base cabinet field", async () => {
  const created: Parameters<AccountsRepository["createPosition"]>[0][] = [];
  const repository: AccountsRepository = {
    ...accounts,
    async createPosition(input) {
      created.push(input);
      return { id: "position-worker", accountType: "business_owner", ...input, boardAssignmentAccess: "none", isProtected: false, usageCount: 0, createdAt: "2026-07-12T00:00:00.000Z" };
    },
  };

  await withApiServer(async (baseUrl) => {
    const sessionId = await createDevSession(baseUrl, "admin");
    const headers = { "Content-Type": "application/json", "X-SMB-Dev-Session": sessionId };
    const emptyResponse = await fetch(`${baseUrl}/api/admin/positions`, {
      method: "POST",
      headers,
      body: JSON.stringify({ displayName: "Работник склада", navigationItems: [] }),
    });
    const legacyBaseResponse = await fetch(`${baseUrl}/api/admin/positions`, {
      method: "POST",
      headers,
      body: JSON.stringify({ displayName: "Работник с обзором", accountType: "worker", navigationItems: ["business.overview"] }),
    });

    assert.equal(emptyResponse.status, 400);
    assert.equal(legacyBaseResponse.status, 400);
  }, dispatcherSubmissions, emptyReferenceDataSource, undefined, undefined, adminDatabase, config, undefined, repository);

  assert.equal(created.length, 0);
});

test("primary admin can add admin tabs to a unified position", async () => {
  const created: Parameters<AccountsRepository["createPosition"]>[0][] = [];
  const repository: AccountsRepository = {
    ...accounts,
    async createPosition(input) {
      created.push(input);
      return { id: "position-shared", accountType: "business_owner", ...input, boardAssignmentAccess: "none", isProtected: false, usageCount: 0, createdAt: "2026-07-12T00:00:00.000Z" };
    },
  };

  await withApiServer(async (baseUrl) => {
    const sessionId = await createDevSession(baseUrl, "admin");
    const headers = { "Content-Type": "application/json", "X-SMB-Dev-Session": sessionId };
    const businessResponse = await fetch(`${baseUrl}/api/admin/positions`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        displayName: "Универсальная должность",
        navigationItems: [
          "business.overview",
          "business.dispatcher",
          "business.work",
          "business.user_actions",
          "business.production_plan",
          "business.refractory_shop",
          "business.dispatcher_form",
        ],
      }),
    });
    const adminResponse = await fetch(`${baseUrl}/api/admin/positions`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        displayName: "Руководитель с админской БД",
        navigationItems: ["business.overview", "admin.database"],
      }),
    });

    assert.equal(businessResponse.status, 201);
    assert.equal(adminResponse.status, 201);
  }, dispatcherSubmissions, emptyReferenceDataSource, undefined, undefined, adminDatabase, config, undefined, repository);

  assert.deepEqual(created[1], {
    displayName: "Руководитель с админской БД",
    navigationItems: ["business.overview", "admin.database"],
    capabilities: [
      "business.view_all_statistics",
      "business.view_notifications",
      "business.view_dispatcher_feed",
      "platform.manage_analytics_database",
    ],
  });
});

test("production account with canonical admin login can assign admin tabs", async () => {
  const profile = buildProductionProfile("admin");
  const actorAccount = {
    ...adminAccount,
    accessId: profile.activeAccess.accountId,
    userId: profile.userId,
    login: "admin",
    accountType: profile.accountType,
    position: profile.activeAccess.position,
    positionDisplayName: profile.activeAccess.positionDisplayName,
    capabilities: profile.activeAccess.capabilities,
    navigationItems: profile.activeAccess.navigationItems,
  };
  const created: Parameters<AccountsRepository["createPosition"]>[0][] = [];
  const repository: AccountsRepository = {
    ...accounts,
    async listAccounts() {
      return [actorAccount];
    },
    async createPosition(input) {
      created.push(input);
      return {
        id: "position-production-hybrid",
        accountType: "business_owner",
        ...input,
        boardAssignmentAccess: "none",
        isProtected: false,
        usageCount: 0,
        createdAt: "2026-07-12T00:00:00.000Z",
      };
    },
  };
  const authService = buildAuthService({ profile });

  await withApiServer(async (baseUrl) => {
    const headers = {
      "Content-Type": "application/json",
      Cookie: `${productionConfig.session.cookieName}=prod-session`,
    };
    const positionsResponse = await fetch(`${baseUrl}/api/admin/positions`, {
      headers,
    });
    const positionsPayload = await positionsResponse.json();
    const createResponse = await fetch(`${baseUrl}/api/admin/positions`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        displayName: "Руководитель с админской БД",
        navigationItems: ["business.overview", "admin.database"],
      }),
    });

    assert.equal(positionsResponse.status, 200);
    assert.equal(
      isRecord(positionsPayload)
        ? positionsPayload.canAssignAdminNavigation
        : undefined,
      true,
    );
    assert.equal(createResponse.status, 201);
  }, dispatcherSubmissions, emptyReferenceDataSource, undefined, undefined, adminDatabase, productionConfig, authService, repository);

  assert.deepEqual(created[0]?.navigationItems, [
    "business.overview",
    "admin.database",
  ]);
});

test("delegated account manager cannot change admin tabs on a position", async () => {
  const profile = buildProductionProfile("business_owner");
  profile.activeAccess.navigationItems = ["admin.accounts"];
  profile.activeAccess.capabilities = [
    "platform.manage_users",
    "platform.manage_access",
  ];
  const actorAccount = {
    ...adminAccount,
    accessId: profile.activeAccess.accountId,
    userId: profile.userId,
    login: "accounts-manager",
    accountType: profile.accountType,
    position: "position-accounts-manager",
    positionDisplayName: "Менеджер учётных записей",
    capabilities: profile.activeAccess.capabilities,
    navigationItems: profile.activeAccess.navigationItems,
  };
  const existingPosition = {
    id: "position-hybrid",
    displayName: "Руководитель с БД",
    accountType: "business_owner" as const,
    navigationItems: [
      "business.overview" as const,
      "admin.database" as const,
    ],
    capabilities: [
      "business.view_all_statistics" as const,
      "business.view_notifications" as const,
      "business.view_dispatcher_feed" as const,
      "platform.manage_analytics_database" as const,
    ],
    boardAssignmentAccess: "none" as const,
    isProtected: false,
    usageCount: 1,
    createdAt: "2026-07-12T00:00:00.000Z",
  };
  const updates: Parameters<AccountsRepository["updatePosition"]>[0][] = [];
  const repository: AccountsRepository = {
    ...accounts,
    async listAccounts() {
      return [actorAccount];
    },
    async listPositions() {
      return [existingPosition];
    },
    async updatePosition(input) {
      updates.push(input);
      return { ...existingPosition, ...input };
    },
  };
  const authService = buildAuthService({ profile });

  await withApiServer(async (baseUrl) => {
    const headers = {
      "Content-Type": "application/json",
      Cookie: `${productionConfig.session.cookieName}=prod-session`,
    };
    const listResponse = await fetch(`${baseUrl}/api/admin/positions`, {
      headers,
    });
    const listPayload = await listResponse.json();
    const unchangedAdminResponse = await fetch(
      `${baseUrl}/api/admin/positions/${existingPosition.id}`,
      {
        method: "PATCH",
        headers,
        body: JSON.stringify({
          displayName: "Руководитель с БД и диспетчерской",
          navigationItems: [
            "business.overview",
            "business.dispatcher",
            "admin.database",
          ],
        }),
      },
    );
    const removedAdminResponse = await fetch(
      `${baseUrl}/api/admin/positions/${existingPosition.id}`,
      {
        method: "PATCH",
        headers,
        body: JSON.stringify({
          displayName: existingPosition.displayName,
          navigationItems: ["business.overview"],
        }),
      },
    );

    assert.equal(listResponse.status, 200);
    assert.equal(
      isRecord(listPayload) ? listPayload.canAssignAdminNavigation : undefined,
      false,
    );
    assert.equal(unchangedAdminResponse.status, 200);
    assert.equal(removedAdminResponse.status, 403);
  }, dispatcherSubmissions, emptyReferenceDataSource, undefined, undefined, adminDatabase, productionConfig, authService, repository);

  assert.equal(updates.length, 1);
  assert.deepEqual(updates[0]?.navigationItems, [
    "business.overview",
    "business.dispatcher",
    "admin.database",
  ]);
});

test("delegated account manager cannot assign a position with admin tabs", async () => {
  const profile = buildProductionProfile("business_owner");
  profile.activeAccess.navigationItems = ["admin.accounts"];
  profile.activeAccess.capabilities = [
    "platform.manage_users",
    "platform.manage_access",
  ];
  const actorAccount = {
    ...adminAccount,
    accessId: profile.activeAccess.accountId,
    userId: profile.userId,
    login: "accounts-manager",
    accountType: profile.accountType,
    position: "position-accounts-manager",
    positionDisplayName: "Менеджер учётных записей",
    capabilities: profile.activeAccess.capabilities,
    navigationItems: profile.activeAccess.navigationItems,
  };
  const targetAccount = {
    ...adminAccount,
    accessId: "target-access",
    userId: "target-user",
    login: "target-user",
  };
  const privilegedPosition = {
    id: "position-hybrid",
    displayName: "Руководитель с БД",
    accountType: "business_owner" as const,
    navigationItems: [
      "business.overview" as const,
      "admin.database" as const,
    ],
    capabilities: [
      "business.view_all_statistics" as const,
      "business.view_notifications" as const,
      "business.view_dispatcher_feed" as const,
      "platform.manage_analytics_database" as const,
    ],
    boardAssignmentAccess: "none" as const,
    isProtected: false,
    usageCount: 0,
    createdAt: "2026-07-12T00:00:00.000Z",
  };
  let createCount = 0;
  let positionChangeCount = 0;
  const repository: AccountsRepository = {
    ...accounts,
    async listAccounts() {
      return [actorAccount, targetAccount];
    },
    async listPositions() {
      return [privilegedPosition];
    },
    async createAccount() {
      createCount += 1;
      return targetAccount;
    },
    async setAccountPosition() {
      positionChangeCount += 1;
      return { previous: targetAccount, updated: targetAccount };
    },
  };
  const authService = buildAuthService({ profile });

  await withApiServer(async (baseUrl) => {
    const headers = {
      "Content-Type": "application/json",
      Cookie: `${productionConfig.session.cookieName}=prod-session`,
    };
    const createResponse = await fetch(`${baseUrl}/api/admin/accounts`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        login: "new-user",
        password: "supersecret1",
        displayName: "Новый пользователь",
        position: privilegedPosition.id,
      }),
    });
    const positionResponse = await fetch(
      `${baseUrl}/api/admin/accounts/${targetAccount.accessId}/position`,
      {
        method: "PATCH",
        headers,
        body: JSON.stringify({ position: privilegedPosition.id }),
      },
    );

    assert.equal(createResponse.status, 403);
    assert.equal(positionResponse.status, 403);
  }, dispatcherSubmissions, emptyReferenceDataSource, undefined, undefined, adminDatabase, productionConfig, authService, repository);

  assert.equal(createCount, 0);
  assert.equal(positionChangeCount, 0);
});

test("admin positions API updates a protected non-admin position without changing its technical type", async () => {
  let updateInput: Parameters<AccountsRepository["updatePosition"]>[0] | undefined;
  const existingPosition = {
    id: "position-custom",
    displayName: "Начальник смены",
    accountType: "dispatcher" as const,
    navigationItems: ["business.dispatcher_form" as const],
    capabilities: ["business.submit_dispatcher_forms" as const],
    boardAssignmentAccess: "none" as const,
    isProtected: true,
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
        navigationItems: ["business.overview", "business.dispatcher_form"],
      }),
    });

    assert.equal(response.status, 200);
  }, dispatcherSubmissions, emptyReferenceDataSource, undefined, undefined, adminDatabase, config, undefined, repository);

  assert.deepEqual(updateInput?.navigationItems, ["business.overview", "business.dispatcher_form"]);
  assert.deepEqual(updateInput?.capabilities, [
    "business.view_all_statistics",
    "business.view_notifications",
    "business.view_dispatcher_feed",
    "business.submit_dispatcher_forms",
    "business.review_refractory_reports",
  ]);
});

test("admin positions API keeps the administrator outside the unified workspace", async () => {
  let didUpdate = false;
  let didDelete = false;
  const repository: AccountsRepository = {
    ...accounts,
    async listPositions() {
      return [{
        id: "administrator",
        displayName: "Администратор",
        accountType: "admin",
        navigationItems: ["admin.accounts"],
        capabilities: ["platform.manage_users", "platform.manage_access"],
        boardAssignmentAccess: "none",
        isProtected: true,
        usageCount: 1,
        createdAt: "2026-07-12T00:00:00.000Z",
      }];
    },
    async updatePosition() {
      didUpdate = true;
      return undefined;
    },
    async deletePosition() {
      didDelete = true;
      return "deleted";
    },
  };

  await withApiServer(async (baseUrl) => {
    const sessionId = await createDevSession(baseUrl, "admin");
    const response = await fetch(`${baseUrl}/api/admin/positions/administrator`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "X-SMB-Dev-Session": sessionId },
      body: JSON.stringify({
        displayName: "Администратор",
        navigationItems: ["business.overview"],
      }),
    });

    assert.equal(response.status, 409);
    assert.equal(didUpdate, false);
  }, dispatcherSubmissions, emptyReferenceDataSource, undefined, undefined, adminDatabase, config, undefined, repository);

  await withApiServer(async (baseUrl) => {
    const sessionId = await createDevSession(baseUrl, "admin");
    const response = await fetch(`${baseUrl}/api/admin/positions/administrator`, {
      method: "DELETE",
      headers: { "X-SMB-Dev-Session": sessionId },
    });

    assert.equal(response.status, 409);
    assert.equal(didDelete, false);
  }, dispatcherSubmissions, emptyReferenceDataSource, undefined, undefined, adminDatabase, config, undefined, repository);
});

test("admin positions API deletes only an unused position", async () => {
  const unusedPosition = {
    id: "position-unused",
    displayName: "Временная должность",
    accountType: "worker" as const,
    navigationItems: [],
    capabilities: [],
    boardAssignmentAccess: "none" as const,
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

test("admin positions API deletes an unused laboratory system position", async () => {
  const laboratoryPosition = {
    id: "laboratory_assistant",
    displayName: "Лаборант",
    accountType: "business_owner" as const,
    navigationItems: ["business.laboratory_results" as const],
    capabilities: ["business.manage_laboratory_results" as const],
    boardAssignmentAccess: "none" as const,
    isProtected: true,
    usageCount: 0,
    createdAt: "2026-07-22T00:00:00.000Z",
  };
  const repository: AccountsRepository = {
    ...accounts,
    async listPositions() { return [laboratoryPosition]; },
    async deletePosition() { return "deleted"; },
  };

  await withApiServer(async (baseUrl) => {
    const sessionId = await createDevSession(baseUrl, "admin");
    const response = await fetch(`${baseUrl}/api/admin/positions/laboratory_assistant`, {
      method: "DELETE",
      headers: { "X-SMB-Dev-Session": sessionId },
    });

    assert.equal(response.status, 200);
  }, dispatcherSubmissions, emptyReferenceDataSource, undefined, undefined, adminDatabase, config, undefined, repository);
});

test("admin positions API deletes an unused program-created non-admin position", async () => {
  let didDelete = false;
  const reviewerPosition = {
    id: "board_assignment_reviewer",
    displayName: "Член Совета директоров с правом приёмки поручений",
    accountType: "business_owner" as const,
    navigationItems: ["business.board_assignments" as const],
    capabilities: [
      "business.view_board_assignments" as const,
      "business.review_board_assignments" as const,
    ],
    boardAssignmentAccess: "review" as const,
    isProtected: true,
    usageCount: 0,
    createdAt: "2026-07-10T00:00:00.000Z",
  };
  const repository: AccountsRepository = {
    ...accounts,
    async listPositions() { return [reviewerPosition]; },
    async deletePosition() {
      didDelete = true;
      return "deleted";
    },
  };

  await withApiServer(async (baseUrl) => {
    const sessionId = await createDevSession(baseUrl, "admin");
    const response = await fetch(
      `${baseUrl}/api/admin/positions/board_assignment_reviewer`,
      {
        method: "DELETE",
        headers: { "X-SMB-Dev-Session": sessionId },
      },
    );

    assert.equal(response.status, 200);
    assert.equal(didDelete, true);
  }, dispatcherSubmissions, emptyReferenceDataSource, undefined, undefined, adminDatabase, config, undefined, repository);
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

test("delegated account manager cannot reset a protected account password", async () => {
  let didReset = false;
  const profile = buildProductionProfile("business_owner");
  profile.activeAccess.navigationItems = ["admin.accounts"];
  profile.activeAccess.capabilities = [
    "platform.manage_users",
    "platform.manage_access",
  ];
  const actorAccount = {
    ...adminAccount,
    accessId: profile.activeAccess.accountId,
    userId: profile.userId,
    login: "accounts-manager",
    accountType: profile.accountType,
    position: profile.activeAccess.position,
    positionDisplayName: profile.activeAccess.positionDisplayName,
    capabilities: profile.activeAccess.capabilities,
    navigationItems: profile.activeAccess.navigationItems,
  };
  const protectedAccount = {
    ...adminAccount,
    accessId: "protected-access-id",
    userId: "protected-user-id",
    login: "protected-admin",
    isProtected: true,
  };
  const repository: AccountsRepository = {
    ...accounts,
    async listAccounts() {
      return [actorAccount, protectedAccount];
    },
    async resetPassword() {
      didReset = true;
      return true;
    },
  };

  await withApiServer(
    async (baseUrl) => {
      const response = await fetch(
        `${baseUrl}/api/admin/accounts/reset-password`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Cookie: `${productionConfig.session.cookieName}=prod-session`,
          },
          body: JSON.stringify({
            login: protectedAccount.login,
            password: "newsecret1",
          }),
        },
      );

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

  assert.equal(didReset, false);
});

test("delegated account manager cannot disable a protected account", async () => {
  let didUpdate = false;
  const profile = buildProductionProfile("business_owner");
  profile.activeAccess.navigationItems = ["admin.accounts"];
  profile.activeAccess.capabilities = [
    "platform.manage_users",
    "platform.manage_access",
  ];
  const actorAccount = {
    ...adminAccount,
    accessId: profile.activeAccess.accountId,
    userId: profile.userId,
    login: "accounts-manager",
    accountType: profile.accountType,
    position: profile.activeAccess.position,
    positionDisplayName: profile.activeAccess.positionDisplayName,
    capabilities: profile.activeAccess.capabilities,
    navigationItems: profile.activeAccess.navigationItems,
  };
  const protectedAccount = {
    ...adminAccount,
    accessId: "protected-access-id",
    userId: "protected-user-id",
    login: "protected-admin",
    isProtected: true,
  };
  const repository: AccountsRepository = {
    ...accounts,
    async listAccounts() {
      return [actorAccount, protectedAccount];
    },
    async setAccountLoginEnabled() {
      didUpdate = true;
      return {
        userId: protectedAccount.userId,
        userStatus: "suspended",
      };
    },
  };

  await withApiServer(
    async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/admin/accounts`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Cookie: `${productionConfig.session.cookieName}=prod-session`,
        },
        body: JSON.stringify({
          userId: protectedAccount.userId,
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

test("delegated account manager cannot change a protected account position", async () => {
  let didUpdate = false;
  const profile = buildProductionProfile("business_owner");
  profile.activeAccess.navigationItems = ["admin.accounts"];
  profile.activeAccess.capabilities = [
    "platform.manage_users",
    "platform.manage_access",
  ];
  const actorAccount = {
    ...adminAccount,
    accessId: profile.activeAccess.accountId,
    userId: profile.userId,
    login: "accounts-manager",
    accountType: profile.accountType,
    position: profile.activeAccess.position,
    positionDisplayName: profile.activeAccess.positionDisplayName,
    capabilities: profile.activeAccess.capabilities,
    navigationItems: profile.activeAccess.navigationItems,
  };
  const protectedAccount = {
    ...adminAccount,
    accessId: "protected-access-id",
    userId: "protected-user-id",
    login: "protected-admin",
    isProtected: true,
  };
  const repository: AccountsRepository = {
    ...accounts,
    async listAccounts() {
      return [actorAccount, protectedAccount];
    },
    async setAccountPosition() {
      didUpdate = true;
      return { previous: protectedAccount, updated: protectedAccount };
    },
  };

  await withApiServer(
    async (baseUrl) => {
      const response = await fetch(
        `${baseUrl}/api/admin/accounts/${protectedAccount.accessId}/position`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Cookie: `${productionConfig.session.cookieName}=prod-session`,
          },
          body: JSON.stringify({ position: "business_owner" }),
        },
      );

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

test("delegated account manager cannot delete a protected account", async () => {
  let didDelete = false;
  const profile = buildProductionProfile("business_owner");
  profile.activeAccess.navigationItems = ["admin.accounts"];
  profile.activeAccess.capabilities = [
    "platform.manage_users",
    "platform.manage_access",
  ];
  const actorAccount = {
    ...adminAccount,
    accessId: profile.activeAccess.accountId,
    userId: profile.userId,
    login: "accounts-manager",
    accountType: profile.accountType,
    position: profile.activeAccess.position,
    positionDisplayName: profile.activeAccess.positionDisplayName,
    capabilities: profile.activeAccess.capabilities,
    navigationItems: profile.activeAccess.navigationItems,
  };
  const protectedAccount = {
    ...adminAccount,
    accessId: "protected-access-id",
    userId: "protected-user-id",
    login: "protected-admin",
    isProtected: true,
  };
  const repository: AccountsRepository = {
    ...accounts,
    async listAccounts() {
      return [actorAccount, protectedAccount];
    },
    async deleteAccount() {
      didDelete = true;
      return true;
    },
  };

  await withApiServer(
    async (baseUrl) => {
      const response = await fetch(
        `${baseUrl}/api/admin/accounts/${protectedAccount.userId}`,
        {
          method: "DELETE",
          headers: {
            Cookie: `${productionConfig.session.cookieName}=prod-session`,
          },
        },
      );

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

  assert.equal(didDelete, false);
});

test("original admin can protect another account", async () => {
  let protectionInput:
    | { userId: string; isProtected: boolean }
    | undefined;
  const repository = {
    ...accounts,
    async setAccountProtected(input: { userId: string; isProtected: boolean }) {
      protectionInput = input;
      return input;
    },
  };

  await withApiServer(
    async (baseUrl) => {
      const sessionId = await createDevSession(baseUrl, "admin");
      const response = await fetch(
        `${baseUrl}/api/admin/accounts/${adminAccount.userId}/protection`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            "X-SMB-Dev-Session": sessionId,
          },
          body: JSON.stringify({ isProtected: true }),
        },
      );

      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), {
        userId: adminAccount.userId,
        isProtected: true,
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

  assert.deepEqual(protectionInput, {
    userId: adminAccount.userId,
    isProtected: true,
  });
});

test("original admin account protection cannot be removed", async () => {
  let didUpdate = false;
  const profile = buildProductionProfile("admin");
  const originalAdmin = {
    ...adminAccount,
    accessId: profile.activeAccess.accountId,
    userId: profile.userId,
    login: "admin",
    accountType: profile.accountType,
    position: profile.activeAccess.position,
    positionDisplayName: profile.activeAccess.positionDisplayName,
    capabilities: profile.activeAccess.capabilities,
    navigationItems: profile.activeAccess.navigationItems,
    isProtected: true,
  };
  const repository: AccountsRepository = {
    ...accounts,
    async listAccounts() {
      return [originalAdmin];
    },
    async setAccountProtected() {
      didUpdate = true;
      return { userId: originalAdmin.userId, isProtected: false };
    },
  };

  await withApiServer(
    async (baseUrl) => {
      const response = await fetch(
        `${baseUrl}/api/admin/accounts/${originalAdmin.userId}/protection`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Cookie: `${productionConfig.session.cookieName}=prod-session`,
          },
          body: JSON.stringify({ isProtected: false }),
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
  const listCalls: Parameters<
    DispatcherSubmissionsRepository["listLatest"]
  >[0][] = [];
  const repository: DispatcherSubmissionsRepository = {
    ...dispatcherSubmissions,
    async listLatest(filters) {
      listCalls.push(filters);
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
      assert.deepEqual(
        listCalls.find((filters) => filters?.limit === 25),
        { limit: 25 },
      );
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
      monthToDate: {
        forming: { monthPlan: 334, monthFactBeforeDay: 0 },
        sorting: { monthFactBeforeDay: 0 },
        unformed: { monthFactBeforeDay: 0 },
        chamotte: { monthFactBeforeDay: 0 },
      },
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
          monthToDate: {
            forming: { monthPlan: 334, monthFactBeforeDay: 0 },
            sorting: { monthPlan: 400, monthFactBeforeDay: 0 },
            unformed: { monthPlan: 0, monthFactBeforeDay: 0 },
            chamotte: { monthPlan: 0, monthFactBeforeDay: 0 },
          },
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
      monthToDate: {
        forming: { monthPlan: 1_000.25, monthFactBeforeDay: 0 },
        sorting: { monthPlan: 800, monthFactBeforeDay: 0 },
        unformed: { monthPlan: 500, monthFactBeforeDay: 0 },
        chamotte: { monthPlan: 200, monthFactBeforeDay: 0 },
      },
    });

    const missingDailyResponse = await fetch(
      `${baseUrl}/api/production-plans/daily?date=2026-07-05`,
      { headers },
    );
    const missingDaily = await missingDailyResponse.json();
    assert.equal(missingDailyResponse.status, 200);
    assert.deepEqual(isRecord(missingDaily) ? missingDaily.plan : undefined, {
      date: "2026-07-05",
      values: {},
      monthToDate: {
        forming: { monthPlan: 1_000.25, monthFactBeforeDay: 0 },
        sorting: { monthPlan: 800, monthFactBeforeDay: 0 },
        unformed: { monthPlan: 500, monthFactBeforeDay: 0 },
        chamotte: { monthPlan: 200, monthFactBeforeDay: 0 },
      },
    });

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

test("dispatcher daily plan excludes the selected-day fact from the live deviation baseline", async () => {
  const profile = buildProductionProfile("dispatcher");
  const productionReports = [
    {
      id: "production-2026-07-01",
      formId: "production" as const,
      formTitle: "Выработка",
      payload: {
        reportDate: "01.07.2026",
        formingDay: "8",
        sortingDay: "5",
        unformedBrand1: "ПБ-5",
        unformedFact1: "2",
        chamotteBrand1: "Ш-1",
        chamotteFact1: "3",
      },
      summary: "Выработка за 01.07.2026",
      status: "received" as const,
      submittedByAccountId: "dispatcher-access-id",
      submittedAt: "2026-07-01T18:00:00.000Z",
      receivedAt: "2026-07-10T18:00:01.000Z",
    },
    {
      id: "production-2026-07-02",
      formId: "production" as const,
      formTitle: "Выработка",
      payload: {
        reportDate: "02.07.2026",
        formingDay: "11",
        sortingDay: "7",
        unformedBrand1: "ПБ-5",
        unformedFact1: "5",
        chamotteBrand1: "Ш-1",
        chamotteFact1: "5",
      },
      summary: "Выработка за 02.07.2026",
      status: "received" as const,
      submittedByAccountId: "dispatcher-access-id",
      submittedAt: "2026-07-02T18:00:00.000Z",
      receivedAt: "2026-07-02T18:00:01.000Z",
    },
    {
      id: "production-2026-07-03",
      formId: "production" as const,
      formTitle: "Выработка",
      payload: {
        reportDate: "03.07.2026",
        formingDay: "4",
        sortingDay: "3",
        unformedBrand1: "ПБ-5",
        unformedFact1: "1",
        chamotteBrand1: "Ш-1",
        chamotteFact1: "2",
      },
      summary: "Выработка за 03.07.2026",
      status: "received" as const,
      submittedByAccountId: "dispatcher-access-id",
      submittedAt: "2026-07-03T18:00:00.000Z",
      receivedAt: "2026-07-03T18:00:01.000Z",
    },
  ];
  let productionFilters:
    | Parameters<DispatcherSubmissionsRepository["listLatest"]>[0]
    | undefined;
  const repository: DispatcherSubmissionsRepository = {
    ...dispatcherSubmissions,
    async listLatest(filters) {
      productionFilters = filters;
      return filters?.formId === "production" ? productionReports : [];
    },
  };
  const revision: ProductionPlanRevision = {
    revisionId: "revision-1",
    month: "2026-07",
    schedules: {
      forming: {
        monthlyPlan: 30,
        workingDayCount: 3,
        dailyPlans: [
          { date: "2026-07-01", value: 10 },
          { date: "2026-07-02", value: 10 },
          { date: "2026-07-03", value: 10 },
        ],
      },
      sorting: {
        monthlyPlan: 18,
        workingDayCount: 3,
        dailyPlans: [
          { date: "2026-07-01", value: 6 },
          { date: "2026-07-02", value: 6 },
          { date: "2026-07-03", value: 6 },
        ],
      },
      unformed: {
        monthlyPlan: 21,
        workingDayCount: 3,
        dailyPlans: [
          { date: "2026-07-01", value: 7 },
          { date: "2026-07-02", value: 7 },
          { date: "2026-07-03", value: 7 },
        ],
      },
      chamotte: {
        monthlyPlan: 12,
        workingDayCount: 2,
        dailyPlans: [
          { date: "2026-07-02", value: 6 },
          { date: "2026-07-03", value: 6 },
        ],
      },
    },
    createdByUserId: "economist-user-id",
    createdAt: "2026-07-01T08:00:00.000Z",
  };
  const productionPlans: ProductionPlansRepository = {
    async readLatest(month) {
      return month === revision.month ? revision : undefined;
    },
    async readLatestForUpdate() {
      throw new Error("not used");
    },
    async saveRevision() {
      throw new Error("not used");
    },
  };
  const server = createApiServer({
    config: productionConfig,
    dispatcherSubmissions: repository,
    authService: buildAuthService({ profile }),
    productionPlans,
    referenceDataSource: emptyReferenceDataSource,
    audit: {
      async record() {},
      async listReport() {
        throw new Error("not used");
      },
    },
    databaseTransaction: {
      async run(operation) {
        return operation();
      },
    },
  });

  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address() as AddressInfo;

  try {
    const response = await fetch(
      `http://127.0.0.1:${address.port}/api/production-plans/daily?date=2026-07-03`,
      {
        headers: {
          Cookie: `${productionConfig.session.cookieName}=prod-session`,
        },
      },
    );
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(productionFilters, {
      formId: "production",
      reportMonth: "2026-07",
      limit: 2_000,
      offset: 0,
    });
    assert.deepEqual(isRecord(payload) ? payload.plan : undefined, {
      date: "2026-07-03",
      values: {
        forming: 10,
        sorting: 6,
        unformed: 7,
        chamotte: 6,
      },
      monthToDate: {
        forming: { monthPlan: 30, monthFactBeforeDay: 19 },
        sorting: { monthPlan: 18, monthFactBeforeDay: 12 },
        unformed: { monthPlan: 21, monthFactBeforeDay: 7 },
        chamotte: { monthPlan: 12, monthFactBeforeDay: 8 },
      },
    });
  } finally {
    server.close();
    await once(server, "close");
  }
});

test("production brand API lets dispatcher add a normalized Google Sheets label", async () => {
  const profile = buildProductionProfile("dispatcher");
  const labels: string[] = [];
  const recorded: Parameters<AuditRepository["record"]>[0][] = [];
  const auditRepository: AuditRepository = {
    async record(event) {
      recorded.push(event);
    },
    async listReport() {
      throw new Error("not used");
    },
  };
  const productionBrands: ProductionBrandsDataSource = {
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
    async create(input, commitCreated) {
      const existing = labels.find(
        (label) =>
          label.toLocaleLowerCase("ru-RU") === input.toLocaleLowerCase("ru-RU"),
      );

      if (existing !== undefined) {
        return { label: existing, created: false };
      }

      labels.push(input);
      await commitCreated(input);
      return { label: input, created: true };
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
        label: "  ПБ-5   огнеупорный  ",
      }),
    });
    const created = await createResponse.json();

    assert.equal(createResponse.status, 201);
    assert.equal(
      isRecord(created) ? created.label : undefined,
      "ПБ-5 огнеупорный",
    );
    assert.equal(recorded.at(-1)?.action, "production_brand.create");

    const duplicateResponse = await fetch(`${baseUrl}/api/production-brands`, {
      method: "POST",
      headers,
      body: JSON.stringify({ label: "пб-5 огнеупорный" }),
    });
    assert.equal(duplicateResponse.status, 200);
    assert.equal(recorded.length, 1);

    const unexpectedFieldResponse = await fetch(
      `${baseUrl}/api/production-brands`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
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
        body: JSON.stringify({ label: { value: "ПБ-6" } }),
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
      body: JSON.stringify({ label: "Ш-1" }),
    });
    assert.equal(forbiddenCreate.status, 403);
  }, dispatcherSubmissions, emptyReferenceDataSource, undefined, undefined,
  adminDatabase, productionConfig, buildAuthService({ profile }), undefined,
  undefined, auditRepository, undefined, productionBrands);
});

test("test environment rejects production brand creation before Google Sheets write", async () => {
  const profile = buildProductionProfile("dispatcher");
  let createCalls = 0;
  const productionBrands: ProductionBrandsDataSource = {
    async list() {
      return ["ША-22"];
    },
    async resolveReferences(references) {
      return { ok: true, references };
    },
    async create(label) {
      createCalls += 1;
      return { label, created: true };
    },
  };

  await withApiServer(
    async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/production-brands`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `${config.session.cookieName}=prod-session`,
        },
        body: JSON.stringify({ label: "Тестовая марка" }),
      });
      const payload = await response.json();

      assert.equal(response.status, 403);
      assert.equal(
        isRecord(payload) && isRecord(payload.error)
          ? payload.error.message
          : undefined,
        "На тестовом сайте добавление марок отключено.",
      );
      assert.equal(createCalls, 0);
    },
    dispatcherSubmissions,
    emptyReferenceDataSource,
    undefined,
    undefined,
    adminDatabase,
    config,
    buildAuthService({ profile }),
    undefined,
    undefined,
    undefined,
    undefined,
    productionBrands,
  );
});

test("production submission accepts only brands from the shared nomenclature", async () => {
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
  const productionBrands: ProductionBrandsDataSource = {
    async list() {
      return ["ФЛ-1", "ПБ-5"];
    },
    async resolveReferences(references) {
      assert.equal(insideTransaction, false);
      const labels = await this.list();
      const resolved = references.map((reference) => ({
        reference,
        saved: labels.find(
          (label) =>
            label.toLocaleLowerCase("ru-RU") ===
              reference.label.trim().toLocaleLowerCase("ru-RU"),
        ),
      }));
      const missing = resolved.find((item) => item.saved === undefined)?.reference;

      return missing === undefined
        ? {
            ok: true,
            references: resolved.map((item) => ({
              fieldName: item.reference.fieldName,
              label: item.saved ?? item.reference.label,
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
          formingFact1: "7",
          formingBrand1: " фл-1 ",
          formingFact2: "5",
          formingBrand2: "ПБ-5",
          unformedBrand3: "ПБ-5",
          unformedFact3: "8",
        },
      }),
    });

    assert.equal(accepted.status, 201);
    assert.equal(createdDraft?.draft.payload.formingBrand1, "ФЛ-1");
    assert.equal(createdDraft?.draft.payload.formingBrand2, "ПБ-5");
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
    assert.equal(productionFieldNames.includes("jarShipmentStart1"), true);
    assert.equal(productionFieldNames.includes("jarEnd1"), true);
    assert.equal(productionFieldNames.includes("jarShipmentEnd1"), true);
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
  const listCalls: Parameters<
    DispatcherSubmissionsRepository["listLatest"]
  >[0][] = [];
  let summaryFilters:
    | Parameters<DispatcherSubmissionsRepository["readSummary"]>[0]
    | undefined;
  const repository: DispatcherSubmissionsRepository = {
    ...dispatcherSubmissions,
    async listLatest(filters) {
      listCalls.push(filters);
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

    const feedFilters = listCalls.find((filters) => filters?.offset === 250);

    assert.equal(response.status, 200);
    assert.deepEqual(feedFilters, {
      formId: "equipment",
      reportDate: "2026-07-09",
      limit: 500,
      offset: 250,
    });
    assert.deepEqual(summaryFilters, feedFilters);
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
    const response = await fetch(
      `${baseUrl}/api/dispatcher/submissions?productionDateFrom=2026-07-02&productionDateTo=2026-07-02`,
      {
        headers: {
          "X-SMB-Dev-Session": sessionId,
        },
      },
    );
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
          facts: [],
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
          facts: [],
          dayPlan: 10,
          dayFact: 12,
          monthPlan: 20,
          monthFact: 20,
          deviation: 0,
          receivedAt: "2026-07-02T18:00:01.000Z",
        },
      ],
    );
    assert.deepEqual(
      isRecord(payload) && isRecord(payload.productionReportTableTotals)
        ? payload.productionReportTableTotals.forming
        : undefined,
      {
        rowCount: 1,
        dayPlan: 10,
        dayFact: 12,
        monthPlan: 20,
        monthFact: 20,
        deviation: 0,
      },
    );
  }, repository);
});

test("remote API returns the current bank contents with the dispatcher feed", async () => {
  const assignments = [
    buildLaboratoryBankAssignment(1, "ШКИ", 1.16),
    buildLaboratoryBankAssignment(3, "ШГР-28", 1.09),
  ];
  const laboratoryBankAssignments: LaboratoryBankAssignmentsRepository = {
    async assign() { throw new Error("not used"); },
    async listCurrent() { return assignments; },
    async listHistory() { return assignments; },
  };

  await withApiServer(
    async (baseUrl) => {
      const sessionId = await createDevSession(baseUrl, "business_owner");
      const response = await fetch(`${baseUrl}/api/dispatcher/submissions`, {
        headers: {
          "X-SMB-Dev-Session": sessionId,
        },
      });
      const payload = await response.json();

      assert.equal(response.status, 200);
      assert.deepEqual(
        isRecord(payload) ? payload.bankContents : undefined,
        [
          { bankNumber: 1, materialLabel: "ШКИ" },
          { bankNumber: 3, materialLabel: "ШГР-28" },
        ],
      );
    },
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    laboratoryBankAssignments,
  );
});

test("remote API returns every unclosed incident with a filtered feed page", async () => {
  const openedIncident = {
    id: "incident-old-open",
    formId: "incident" as const,
    formTitle: "Открытие инцидента",
    payload: {
      incidentNumber: "INC-2026-1",
      datetime: "28.06.2026 10:00",
      location: "ЦОШ (Цех обжига шамота)",
    },
    summary: "INC-2026-1",
    status: "received" as const,
    submittedByAccountId: "dispatcher-access-id",
    submittedAt: "2026-06-28T07:00:00.000Z",
    receivedAt: "2026-06-28T07:00:00.000Z",
  };
  const closedIncident = {
    ...openedIncident,
    id: "incident-closed",
    payload: {
      incidentNumber: "INC-2026-2",
      datetime: "03.07.2026 08:30",
    },
    summary: "INC-2026-2",
    submittedAt: "2026-07-03T05:30:00.000Z",
    receivedAt: "2026-07-03T05:30:00.000Z",
  };
  const incidentClosure = {
    ...openedIncident,
    id: "incident-closure",
    formId: "incident_close" as const,
    formTitle: "Закрытие инцидента",
    payload: {
      incidentNumber: "INC-2026-2",
      closureDateTime: "04.07.2026 14:00",
    },
    summary: "INC-2026-2",
    submittedAt: "2026-07-04T11:00:00.000Z",
    receivedAt: "2026-07-04T11:00:00.000Z",
  };
  const repository: DispatcherSubmissionsRepository = {
    ...dispatcherSubmissions,
    async listLatest(filters) {
      if (filters?.formId === "incident") {
        return [closedIncident, openedIncident];
      }

      if (filters?.formId === "incident_close") {
        return [incidentClosure];
      }

      return [];
    },
  };

  await withApiServer(async (baseUrl) => {
    const sessionId = await createDevSession(baseUrl, "business_owner");
    const response = await fetch(
      `${baseUrl}/api/dispatcher/submissions?dateFrom=2026-07-20&dateTo=2026-07-23`,
      {
        headers: {
          "X-SMB-Dev-Session": sessionId,
        },
      },
    );
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(
      isRecord(payload) ? payload.openIncidents : undefined,
      [
        {
          incidentNumber: "INC-2026-1",
          openedAt: "28.06.2026 10:00",
          location: "ЦОШ (Цех обжига шамота)",
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
        refractoryNotificationRecipients: [],
        refractoryMaxNotificationRecipients: [],
        refractoryReviewNotificationRecipients: [],
        refractoryReviewMaxNotificationRecipients: [],
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
        refractoryNotificationRecipients: [],
        refractoryMaxNotificationRecipients: [],
        refractoryReviewNotificationRecipients: [],
        refractoryReviewMaxNotificationRecipients: [],
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
    async sendRefractoryReportNotification() {
      throw new Error("Unexpected refractory report notification.");
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
    async sendRefractoryReportNotification() {
      throw new Error("Unexpected refractory report notification.");
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
        refractoryNotificationRecipients: [],
        refractoryMaxNotificationRecipients: [],
        refractoryReviewNotificationRecipients: [],
        refractoryReviewMaxNotificationRecipients: [],
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
    async sendRefractoryReportNotification() {
      throw new Error("Unexpected refractory report notification.");
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
    async sendRefractoryReportNotification() {
      throw new Error("Unexpected refractory report notification.");
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
        refractoryNotificationRecipients: [],
        refractoryMaxNotificationRecipients: [],
        refractoryReviewNotificationRecipients: [],
        refractoryReviewMaxNotificationRecipients: [],
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
    async sendRefractoryReportNotification() {
      throw new Error("Unexpected refractory report notification.");
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
    async sendRefractoryReportNotification() {
      throw new Error("Unexpected refractory report notification.");
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
    assert.equal(createdPayload?.datetime, "04.07.2026 10:00");
    assert.equal(createdPayload?.location, "Цех 1");
    assert.equal(createdPayload?.incidentType, "Травма");
    assert.equal(createdPayload?.criticality, "Высокий");
    assert.equal(createdPayload?.description, "Повреждение ограждения");
    assert.equal(createdPayload?.incidentStatus, "Закрыт");
  }, repository);
});

test("refractory user reads the same shared production brand list", async () => {
  const profile = buildProductionProfile("worker");
  profile.activeAccess.capabilities = ["business.submit_refractory_reports"];
  profile.activeAccess.navigationItems = ["business.refractory_shop"];
  const productionBrands: ProductionBrandsDataSource = {
    async list() {
      return ["ША-22", "Смесь МК", "Гранулы 0-5"];
    },
    async create(label, commitCreated) {
      await commitCreated(label);
      return { label, created: true };
    },
    async resolveReferences(references) {
      return { ok: true, references };
    },
  };

  await withApiServer(
    async (baseUrl) => {
      const response = await fetch(
        `${baseUrl}/api/production-brands`,
        { headers: { Cookie: "smb_session=prod-session" } },
      );

      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), {
        labels: ["ША-22", "Смесь МК", "Гранулы 0-5"],
      });
    },
    dispatcherSubmissions,
    emptyReferenceDataSource,
    undefined,
    undefined,
    adminDatabase,
    productionConfig,
    buildAuthService({ profile }),
    undefined,
    undefined,
    undefined,
    undefined,
    productionBrands,
  );
});

test("refractory reports are submitted and reviewed independently through protected API", async () => {
  let stored: RefractoryReportRevision | undefined;
  let listedForAccountId = "";
  let emailedRefractoryReportId = "";
  let emailedRefractoryRecipients: readonly string[] = [];
  let maxedRefractoryReportId = "";
  let maxedRefractoryRecipients: readonly string[] = [];
  let emailedReviewRequestReportId = "";
  let emailedReviewRequestRecipients: readonly string[] = [];
  let maxedReviewRequestReportId = "";
  let maxedReviewRequestRecipients: readonly string[] = [];
  let refractoryEmailAttemptCount = 0;
  let refractoryMaxAttemptCount = 0;
  let refractoryReviewEmailAttemptCount = 0;
  let refractoryReviewMaxAttemptCount = 0;
  let refractoryMutationCommitted = false;
  const repository: RefractoryReportsRepository = {
    async submit(input) {
      stored = {
        id: "refractory-1",
        ...input.report,
        revisionNumber: 1,
        status: "pending",
        submittedByUserId: input.submittedByUserId,
        submittedByAccountId: input.submittedByAccountId,
        masterDisplayName: input.masterDisplayName,
        submittedAt: "2026-07-20T20:30:00.000Z",
      };
      return stored;
    },
    async listLatestForShift() {
      return stored === undefined ? [] : [stored];
    },
    async listLatestApprovedCoshForDates() {
      return [];
    },
    async listPending() {
      return stored?.status === "pending" ? [stored] : [];
    },
    async listRecentForSubmitter(input) {
      listedForAccountId = input.submittedByAccountId;
      return stored === undefined ? [] : [stored];
    },
    async review(input) {
      assert.equal(input.reviewerAccountId, "prod-access-dispatcher");
      stored = input.decision.decision === "approve"
        ? {
            ...stored!,
            status: "approved",
            reviewerDisplayName: input.reviewerDisplayName,
            reviewedAt: "2026-07-20T20:35:00.000Z",
          }
        : {
            ...stored!,
            status: "rejected",
            reviewerDisplayName: input.reviewerDisplayName,
            reviewedAt: "2026-07-20T20:40:00.000Z",
            rejectionComment: input.decision.comment,
          };
      return stored;
    },
  };
  const refractoryReferenceDataSource: DispatcherReferenceDataSource = {
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
        refractoryNotificationRecipients: ["oc@example.com"],
        refractoryMaxNotificationRecipients: ["5001"],
        refractoryReviewNotificationRecipients: ["dispatcher@example.com"],
        refractoryReviewMaxNotificationRecipients: ["6001"],
      };
    },
  };
  const refractoryEmailNotificationService: EmailNotificationService = {
    async sendDispatcherSubmissionNotification() {},
    async sendEquipmentReportNotification() {},
    async sendRefractoryReportNotification(report, recipients, notificationKind) {
      assert.equal(refractoryMutationCommitted, true);
      if (notificationKind === "approved") {
        refractoryEmailAttemptCount += 1;
        emailedRefractoryReportId = report.reportId;
        emailedRefractoryRecipients = recipients;
      } else {
        refractoryReviewEmailAttemptCount += 1;
        emailedReviewRequestReportId = report.reportId;
        emailedReviewRequestRecipients = recipients;
      }
      throw new Error("SMTP is temporarily unavailable");
    },
  };
  const refractoryMaxNotificationService: MaxNotificationService = {
    async sendDispatcherSubmissionNotification() {},
    async sendEquipmentReportNotification() {},
    async sendRefractoryReportNotification(report, recipients, notificationKind) {
      assert.equal(refractoryMutationCommitted, true);
      if (notificationKind === "approved") {
        refractoryMaxAttemptCount += 1;
        maxedRefractoryReportId = report.reportId;
        maxedRefractoryRecipients = recipients;
      } else {
        refractoryReviewMaxAttemptCount += 1;
        maxedReviewRequestReportId = report.reportId;
        maxedReviewRequestRecipients = recipients;
      }
      throw new Error("MAX is temporarily unavailable");
    },
  };
  const refractoryMutationTransaction: DatabaseTransactionRunner = {
    async run(operation) {
      refractoryMutationCommitted = false;
      const result = await operation();

      refractoryMutationCommitted = true;
      return result;
    },
  };
  const operatorProfile = buildProductionProfile("worker");
  operatorProfile.displayName = "Мастер ОЦ";
  operatorProfile.activeAccess.navigationItems = ["business.refractory_shop"];
  operatorProfile.activeAccess.capabilities = [
    "business.submit_refractory_reports",
  ];
  const productionBrands: ProductionBrandsDataSource = {
    async list() {
      return ["ША"];
    },
    async create(label, commitCreated) {
      await commitCreated(label);
      return { label, created: true };
    },
    async resolveReferences(references) {
      const missing = references.find(
        (reference) => reference.label.trim().toLocaleLowerCase("ru-RU") !== "ша",
      );

      return missing === undefined
        ? {
            ok: true,
            references: references.map((reference) => ({
              fieldName: reference.fieldName,
              label: "ША",
            })),
          }
        : { ok: false, missing };
    },
  };

  await withApiServer(
    async (baseUrl) => {
      const invalidResponse = await fetch(
        `${baseUrl}/api/refractory-reports`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Cookie: "smb_session=prod-session",
          },
          body: JSON.stringify({
            reportType: "equipment",
            reportDate: "2026-07-20",
            shiftNumber: 2,
            payload: {
              formedRows: [{
                equipment: "Пресс СМ-1085 №1",
                workedHours: 42,
              }],
              unformedRows: [],
            },
          }),
        },
      );
      const invalidPayload = await invalidResponse.json();

      assert.equal(invalidResponse.status, 400);
      assert.deepEqual(
        isRecord(invalidPayload) && isRecord(invalidPayload.error)
          ? invalidPayload.error.details
          : undefined,
        [{
          fieldPath: "formed.0.workedHours",
          message: "Строка 1, «Отработано, ч»: укажите число от 0 до 24.",
        }],
      );

      const response = await fetch(`${baseUrl}/api/refractory-reports`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: "smb_session=prod-session",
        },
        body: JSON.stringify({
          reportType: "firing",
          reportDate: "2026-07-20",
          shiftNumber: 2,
          payload: {
            rows: [{
              productBrand: " ша ",
              quantityPieces: 100,
              rejectCracksPieces: 2,
            }],
          },
        }),
      });
      const payload = await response.json();

      assert.equal(response.status, 201);
      assert.equal(stored?.masterDisplayName, "Мастер ОЦ");
      assert.equal(
        (stored?.payload as { rows?: Array<{ productBrand?: string }> } | undefined)
          ?.rows?.[0]?.productBrand,
        "ША",
      );
      assert.equal(
        (stored?.totals as { rejectTotalPieces?: number } | undefined)
          ?.rejectTotalPieces,
        2,
      );
      assert.equal(
        isRecord(payload) && isRecord(payload.report)
          ? "submittedByAccountId" in payload.report
          : true,
        false,
      );
      const ownResponse = await fetch(
        `${baseUrl}/api/refractory-reports/own`,
        { headers: { Cookie: "smb_session=prod-session" } },
      );
      const ownPayload = await ownResponse.json();

      assert.equal(ownResponse.status, 200);
      assert.equal(listedForAccountId, "prod-access-worker");
      assert.equal(
        isRecord(ownPayload) && Array.isArray(ownPayload.reports)
          ? ownPayload.reports.length
          : 0,
        1,
      );
    },
    dispatcherSubmissions,
    refractoryReferenceDataSource,
    refractoryEmailNotificationService,
    refractoryMaxNotificationService,
    adminDatabase,
    productionConfig,
    buildAuthService({ profile: operatorProfile }),
    undefined,
    undefined,
    undefined,
    refractoryMutationTransaction,
    productionBrands,
    undefined,
    repository,
  );

  assert.equal(refractoryReviewEmailAttemptCount, 1);
  assert.equal(emailedReviewRequestReportId, "refractory-1");
  assert.deepEqual(emailedReviewRequestRecipients, ["dispatcher@example.com"]);
  assert.equal(refractoryReviewMaxAttemptCount, 1);
  assert.equal(maxedReviewRequestReportId, "refractory-1");
  assert.deepEqual(maxedReviewRequestRecipients, ["6001"]);

  const dispatcherProfile = buildProductionProfile("dispatcher");
  await withApiServer(
    async (baseUrl) => {
      const headers = {
        "Content-Type": "application/json",
        Cookie: "smb_session=prod-session",
      };
      const pendingResponse = await fetch(
        `${baseUrl}/api/refractory-reports/pending`,
        { headers },
      );
      const invalidRejectResponse = await fetch(
        `${baseUrl}/api/refractory-reports/refractory-1/decision`,
        { method: "POST", headers, body: JSON.stringify({ decision: "reject" }) },
      );
      const approvalResponse = await fetch(
        `${baseUrl}/api/refractory-reports/refractory-1/decision`,
        { method: "POST", headers, body: JSON.stringify({ decision: "approve" }) },
      );

      assert.equal(pendingResponse.status, 200);
      assert.equal(invalidRejectResponse.status, 400);
      assert.equal(approvalResponse.status, 200);
      assert.equal(stored?.status, "approved");
      assert.equal(refractoryEmailAttemptCount, 1);
      assert.equal(emailedRefractoryReportId, "refractory-1");
      assert.deepEqual(emailedRefractoryRecipients, ["oc@example.com"]);
      assert.equal(refractoryMaxAttemptCount, 1);
      assert.equal(maxedRefractoryReportId, "refractory-1");
      assert.deepEqual(maxedRefractoryRecipients, ["5001"]);

      const {
        reviewerDisplayName: _reviewerDisplayName,
        reviewedAt: _reviewedAt,
        rejectionComment: _rejectionComment,
        ...storedReport
      } = stored!;
      stored = {
        ...storedReport,
        id: "refractory-2",
        status: "pending",
      };
      const rejectionResponse = await fetch(
        `${baseUrl}/api/refractory-reports/refractory-2/decision`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            decision: "reject",
            comment: "Уточните замеры.",
          }),
        },
      );

      assert.equal(rejectionResponse.status, 200);
      assert.equal(stored.status, "rejected");
      assert.equal(stored.rejectionComment, "Уточните замеры.");
      assert.equal(refractoryEmailAttemptCount, 1);
      assert.equal(refractoryMaxAttemptCount, 1);
    },
    dispatcherSubmissions,
    refractoryReferenceDataSource,
    refractoryEmailNotificationService,
    refractoryMaxNotificationService,
    adminDatabase,
    productionConfig,
    buildAuthService({ profile: dispatcherProfile }),
    undefined,
    undefined,
    undefined,
    refractoryMutationTransaction,
    undefined,
    undefined,
    repository,
  );
});

test("board assignment API enforces creation, execution and review capabilities", async () => {
  const profile = buildProductionProfile("business_owner");
  profile.activeAccess.position = "board_member";
  profile.activeAccess.positionDisplayName = "Член Совета директоров";
  profile.activeAccess.navigationItems = ["business.board_assignments"];
  profile.activeAccess.capabilities = [
    "business.view_board_assignments",
    "business.create_board_assignments",
  ];
  let current: BoardAssignment = {
    id: "assignment-1",
    meetingDate: "2026-07-10",
    protocolNumber: "369",
    decisionNumber: "2.3",
    summary: "Подготовить анализ причин невыполнения плана",
    details: "Представить Совету директоров письменный анализ.",
    coExecutors: ["Экономист"],
    dueDate: "До 24.07.2026",
    recurrence: "daily",
    activeFrom: "2026-07-10",
    activeTo: "2026-07-31",
    currentOccurrenceDate: "2026-07-10",
    status: "in_progress",
    createdByDisplayName: profile.displayName,
    createdAt: "2026-07-10T08:00:00.000Z",
    updatedAt: "2026-07-10T08:00:00.000Z",
    documents: [],
    comments: [],
  };
  let listFilters: BoardAssignmentFilters | undefined;
  let listOptions: { activeOn?: string } | undefined;
  let completedOccurrenceDate: string | undefined;
  const repository: BoardAssignmentsRepository = {
    async list(filters, options) {
      listFilters = filters;
      listOptions = options;
      return [current];
    },
    async readById() {
      return current;
    },
    async readByIdForUpdate() {
      return current;
    },
    async create(input) {
      current = {
        ...current,
        ...input.assignment,
        dueDate: "Каждый день, с 10.07.2026 по 31.07.2026",
        currentOccurrenceDate: input.assignment.activeFrom,
        createdByDisplayName: input.actor.displayName,
        comments: input.assignment.comment === undefined
          ? []
          : [{
              id: "comment-create",
              authorDisplayName: input.actor.displayName,
              comment: input.assignment.comment,
              statusAfter: "in_progress",
              createdAt: "2026-07-10T08:00:00.000Z",
            }],
      };
      return current;
    },
    async update(input) {
      current = {
        ...current,
        ...input.assignment,
        currentOccurrenceDate: input.currentOccurrenceDate,
      };
      return current;
    },
    async applyAction(input) {
      completedOccurrenceDate = input.completedOccurrenceDate;
      current = {
        ...current,
        status: input.status,
        currentOccurrenceDate: input.currentOccurrenceDate,
        comments: [
          ...current.comments,
          {
            id: `comment-${current.comments.length + 1}`,
            authorDisplayName: input.actor.displayName,
            comment: input.comment,
            statusAfter: input.commentStatus,
            createdAt: "2026-07-20T10:00:00.000Z",
          },
        ],
      };
      return current;
    },
    async listCompletions() {
      return [];
    },
    async readCompletionById() {
      return undefined;
    },
    async addDocument() {
      return { kind: "not_found" };
    },
    async removeDocument() {
      return { kind: "not_found" };
    },
    async readDocument() {
      return undefined;
    },
  };
  const events: Parameters<AuditRepository["record"]>[0][] = [];
  const server = createApiServer({
    config: productionConfig,
    dispatcherSubmissions,
    authService: buildAuthService({ profile }),
    boardAssignments: repository,
    referenceDataSource: emptyReferenceDataSource,
    audit: {
      async record(event) {
        events.push(event);
      },
      async listReport() {
        throw new Error("not used");
      },
    },
    databaseTransaction: {
      async run(operation) {
        return operation();
      },
    },
    now: () => new Date("2026-07-20T10:00:00.000Z"),
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
    const listResponse = await fetch(
      `${baseUrl}/api/board-assignments?status=in_progress&meetingDateFrom=2026-07-01&query=анализ`,
      { headers },
    );
    assert.equal(listResponse.status, 200);
    assert.deepEqual(listFilters, {
      status: "in_progress",
      meetingDateFrom: "2026-07-01",
      query: "анализ",
    });
    const materialResponse = await fetch(
      `${baseUrl}/api/board-assignment-materials/protocol-369-2026-07-10`,
      { headers },
    );
    assert.equal(materialResponse.status, 200);
    assert.equal(materialResponse.headers.get("content-type"), "application/pdf");
    assert.ok((await materialResponse.arrayBuffer()).byteLength > 1_000_000);

    const createResponse = await fetch(`${baseUrl}/api/board-assignments`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        meetingDate: "2026-07-10",
        protocolNumber: "369",
        decisionNumber: "2.3",
        summary: "Подготовить анализ причин невыполнения плана",
        details: "Представить Совету директоров письменный анализ.",
        coExecutors: ["Экономист"],
        recurrence: "daily",
        activeFrom: "2026-07-10",
        activeTo: "2026-07-31",
        comment: "Внесено по протоколу.",
      }),
    });
    assert.equal(createResponse.status, 201);

    profile.activeAccess.position = "general_director";
    profile.activeAccess.positionDisplayName = "Генеральный директор";
    profile.activeAccess.capabilities = [
      "business.view_board_assignments",
      "business.execute_board_assignments",
    ];
    const activeListResponse = await fetch(
      `${baseUrl}/api/board-assignments`,
      { headers },
    );
    assert.equal(activeListResponse.status, 200);
    assert.deepEqual(listOptions, { activeOn: "2026-07-20" });
    current.currentOccurrenceDate = "2026-07-21";
    const inactiveDetailResponse = await fetch(
      `${baseUrl}/api/board-assignments/assignment-1`,
      { headers },
    );
    assert.equal(inactiveDetailResponse.status, 404);
    current.currentOccurrenceDate = "2026-07-10";
    const submitResponse = await fetch(
      `${baseUrl}/api/board-assignments/assignment-1/action`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          action: "submit_for_review",
          comment: "Работа выполнена.",
        }),
      },
    );
    assert.equal(submitResponse.status, 200);
    assert.equal(current.status, "under_review");

    profile.activeAccess.position = "board_chair";
    profile.activeAccess.positionDisplayName = "Председатель Совета директоров";
    profile.activeAccess.capabilities = [
      "business.view_board_assignments",
      "business.create_board_assignments",
      "business.review_board_assignments",
    ];
    const completeResponse = await fetch(
      `${baseUrl}/api/board-assignments/assignment-1/action`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          action: "complete",
          comment: "Поручение принято.",
        }),
      },
    );
    assert.equal(completeResponse.status, 200);
    assert.equal(current.status, "in_progress");
    assert.equal(current.currentOccurrenceDate, "2026-07-21");
    assert.equal(completedOccurrenceDate, "2026-07-10");
    assert.equal(current.comments.at(-1)?.statusAfter, "completed");
    assert.deepEqual(
      events.map((event) => event.action),
      [
        "board_assignment.create",
        "board_assignment.submit_for_review",
        "board_assignment.complete",
      ],
    );
    assert.deepEqual(events.at(-1)?.details, [
      { label: "Результат", value: "Завершено" },
      { label: "Следующая дата исполнения", value: "2026-07-21" },
      { label: "Протокол", value: "369" },
      { label: "Пункт решения", value: "2.3" },
    ]);

    profile.activeAccess.position = "administrator";
    profile.activeAccess.positionDisplayName = "Администратор";
    profile.activeAccess.capabilities = [
      "business.view_board_assignments",
    ];
    const forbiddenAdminCreateResponse = await fetch(
      `${baseUrl}/api/board-assignments`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          meetingDate: "2026-07-10",
          protocolNumber: "369",
          decisionNumber: "9.1",
          summary: "Недоступное администратору поручение",
          details: "Администратор не должен создавать поручения.",
          coExecutors: [],
          recurrence: "once",
          activeFrom: "2026-07-10",
          activeTo: "2026-07-31",
        }),
      },
    );
    const forbiddenAdminActionResponse = await fetch(
      `${baseUrl}/api/board-assignments/assignment-1/action`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          action: "return_for_revision",
          comment: "Администратор не должен менять статус.",
        }),
      },
    );

    assert.equal(forbiddenAdminCreateResponse.status, 403);
    assert.equal(forbiddenAdminActionResponse.status, 403);
    assert.equal(events.length, 3);
  } finally {
    server.close();
    await once(server, "close");
  }
});

test("board assignment API lets creators upload and remove up to five protected PDFs", async () => {
  const profile = buildProductionProfile("business_owner");
  profile.activeAccess.position = "board_member";
  profile.activeAccess.positionDisplayName = "Член Совета директоров";
  profile.activeAccess.navigationItems = ["business.board_assignments"];
  profile.activeAccess.capabilities = [
    "business.view_board_assignments",
    "business.create_board_assignments",
  ];
  const initialDocuments = Array.from({ length: 4 }, (_, index) => ({
    id: `document-${index + 1}`,
    fileName: `Приложение ${index + 1}.pdf`,
    sizeBytes: 100,
    uploadedAt: "2026-07-10T08:00:00.000Z",
  }));
  const storedPdf = Buffer.from("%PDF-1.7\nprotected");
  let documents = [...initialDocuments];
  let uploadedFileName = "";
  let uploadedPdf: Uint8Array = new Uint8Array();
  const assignment: BoardAssignment = {
    id: "assignment-documents",
    meetingDate: "2026-07-10",
    protocolNumber: "369",
    decisionNumber: "2.3",
    summary: "Поручение с приложениями",
    details: "К поручению можно приложить до пяти PDF.",
    coExecutors: [],
    dueDate: "Один раз, 10.07.2026",
    recurrence: "once",
    activeFrom: "2026-07-10",
    activeTo: "2026-07-10",
    currentOccurrenceDate: "2026-07-10",
    status: "in_progress",
    createdByDisplayName: profile.displayName,
    createdAt: "2026-07-10T08:00:00.000Z",
    updatedAt: "2026-07-10T08:00:00.000Z",
    documents,
    comments: [],
  };
  const repository: BoardAssignmentsRepository = {
    async list() { return [assignment]; },
    async readById() {
      assignment.documents = documents;
      return assignment;
    },
    async readByIdForUpdate() {
      assignment.documents = documents;
      return assignment;
    },
    async create() { return assignment; },
    async update() { return assignment; },
    async applyAction() { return assignment; },
    async listCompletions() { return []; },
    async readCompletionById() { return undefined; },
    async addDocument(input) {
      if (assignment.status === "completed") {
        return { kind: "immutable" };
      }
      if (documents.length >= 5) {
        return { kind: "limit_reached" };
      }
      uploadedFileName = input.fileName;
      uploadedPdf = input.pdf;
      const document = {
        id: "document-5",
        fileName: input.fileName,
        sizeBytes: input.pdf.length,
        uploadedAt: "2026-07-28T14:00:00.000Z",
      };
      documents = [...documents, document];
      return { kind: "saved", document };
    },
    async removeDocument(input) {
      const document = documents.find(({ id }) => id === input.documentId);
      if (document === undefined) {
        return { kind: "not_found" };
      }
      documents = documents.filter(({ id }) => id !== input.documentId);
      return { kind: "removed", document };
    },
    async readDocument(id) {
      const document = [...documents, {
        id: "document-5",
        fileName: uploadedFileName,
        sizeBytes: uploadedPdf.length,
        uploadedAt: "2026-07-28T14:00:00.000Z",
      }].find((item) => item.id === id);
      return document === undefined
        ? undefined
        : { ...document, pdf: storedPdf };
    },
  };
  const events: Parameters<AuditRepository["record"]>[0][] = [];
  const server = createApiServer({
    config: productionConfig,
    dispatcherSubmissions,
    authService: buildAuthService({ profile }),
    boardAssignments: repository,
    referenceDataSource: emptyReferenceDataSource,
    audit: {
      async record(event) { events.push(event); },
      async listReport() { throw new Error("not used"); },
    },
    databaseTransaction: {
      async run(operation) { return operation(); },
    },
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const cookie = `${productionConfig.session.cookieName}=prod-session`;
  const uploadUrl =
    `${baseUrl}/api/board-assignments/${assignment.id}/documents?` +
    new URLSearchParams({ fileName: "Финансовое приложение.pdf" });

  try {
    const uploadResponse = await fetch(uploadUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/pdf",
        Cookie: cookie,
      },
      body: storedPdf,
    });
    const uploadPayload = await uploadResponse.json();
    const uploadedDocument = isRecord(uploadPayload) &&
        isRecord(uploadPayload.document)
      ? uploadPayload.document
      : undefined;

    assert.equal(uploadResponse.status, 201);
    assert.equal(uploadedDocument?.fileName, "Финансовое приложение.pdf");
    assert.equal(uploadedFileName, "Финансовое приложение.pdf");
    assert.deepEqual(uploadedPdf, storedPdf);

    const limitResponse = await fetch(uploadUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/pdf",
        Cookie: cookie,
      },
      body: storedPdf,
    });
    assert.equal(limitResponse.status, 409);
    assert.match(JSON.stringify(await limitResponse.json()), /пяти/u);

    const materialResponse = await fetch(
      `${baseUrl}/api/board-assignment-materials/document-5`,
      { headers: { Cookie: cookie } },
    );
    assert.equal(materialResponse.status, 200);
    assert.equal(materialResponse.headers.get("content-type"), "application/pdf");
    assert.deepEqual(Buffer.from(await materialResponse.arrayBuffer()), storedPdf);

    const deleteResponse = await fetch(
      `${baseUrl}/api/board-assignments/${assignment.id}/documents/document-5`,
      {
        method: "DELETE",
        headers: { Cookie: cookie },
      },
    );
    assert.equal(deleteResponse.status, 200);
    assert.equal(documents.length, 4);
    assert.deepEqual(
      events.map(({ action }) => action),
      ["board_assignment.document_upload", "board_assignment.document_delete"],
    );

    const invalidResponse = await fetch(
      `${baseUrl}/api/board-assignments/${assignment.id}/documents?` +
        new URLSearchParams({ fileName: "Не PDF.pdf" }),
      {
        method: "POST",
        headers: {
          "Content-Type": "application/pdf",
          Cookie: cookie,
        },
        body: Buffer.from("not a pdf"),
      },
    );
    assert.equal(invalidResponse.status, 400);

    profile.activeAccess.capabilities = ["business.view_board_assignments"];
    const forbiddenResponse = await fetch(uploadUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/pdf",
        Cookie: cookie,
      },
      body: storedPdf,
    });
    assert.equal(forbiddenResponse.status, 403);
  } finally {
    server.close();
    await once(server, "close");
  }
});

test("board assignment API lets any creator edit a live assignment but keeps a completed one immutable", async () => {
  const profile = buildProductionProfile("business_owner");
  profile.activeAccess.position = "board_member";
  profile.activeAccess.positionDisplayName = "Член Совета директоров";
  profile.activeAccess.navigationItems = ["business.board_assignments"];
  profile.activeAccess.capabilities = [
    "business.view_board_assignments",
    "business.create_board_assignments",
  ];
  let current: BoardAssignment = {
    id: "assignment-edit",
    meetingDate: "2026-07-10",
    protocolNumber: "369",
    decisionNumber: "2.3",
    summary: "Первоначальное содержание",
    details: "Первоначальное полное содержание.",
    coExecutors: ["Экономист"],
    dueDate: "Каждый месяц, с 10.07.2026 по 31.12.2026",
    recurrence: "monthly",
    activeFrom: "2026-07-10",
    activeTo: "2026-12-31",
    currentOccurrenceDate: "2026-08-10",
    status: "under_review",
    createdByDisplayName: "Белов Ю.И.",
    createdAt: "2026-07-10T08:00:00.000Z",
    updatedAt: "2026-07-20T08:00:00.000Z",
    documents: [],
    comments: [],
  };
  let updateInput: Record<string, unknown> | undefined;
  const repository = {
    async list() {
      return [current];
    },
    async readById() {
      return current;
    },
    async readByIdForUpdate() {
      return current;
    },
    async create() {
      return current;
    },
    async applyAction() {
      return current;
    },
    async update(input: Record<string, unknown>) {
      updateInput = input;
      const assignment = input.assignment as Record<string, unknown>;
      current = {
        ...current,
        ...assignment,
        dueDate: "Каждую неделю, с 15.07.2026 по 31.12.2026",
        updatedAt: "2026-07-28T10:00:00.000Z",
      };
      return current;
    },
  } as unknown as BoardAssignmentsRepository;
  const events: Parameters<AuditRepository["record"]>[0][] = [];
  const server = createApiServer({
    config: productionConfig,
    dispatcherSubmissions,
    authService: buildAuthService({ profile }),
    boardAssignments: repository,
    referenceDataSource: emptyReferenceDataSource,
    audit: {
      async record(event) {
        events.push(event);
      },
      async listReport() {
        throw new Error("not used");
      },
    },
    databaseTransaction: {
      async run(operation) {
        return operation();
      },
    },
    now: () => new Date("2026-07-28T10:00:00.000Z"),
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const headers = {
    "Content-Type": "application/json",
    Cookie: `${productionConfig.session.cookieName}=prod-session`,
  };
  const updateBody = {
    meetingDate: "2026-07-12",
    protocolNumber: "370",
    decisionNumber: "3.1",
    summary: "Уточнённое содержание",
    details: "Уточнённое полное содержание.",
    coExecutors: ["Экономист", "Главный инженер"],
    recurrence: "weekly",
    activeFrom: "2026-07-15",
    activeTo: "2026-12-31",
    comment: "Исправлены сроки и содержание.",
    expectedUpdatedAt: "2026-07-20T08:00:00.000Z",
  };
  const { expectedUpdatedAt, ...assignmentUpdateBody } = updateBody;

  try {
    const updateResponse = await fetch(
      `${baseUrl}/api/board-assignments/assignment-edit`,
      {
        method: "PATCH",
        headers,
        body: JSON.stringify(updateBody),
      },
    );

    assert.equal(updateResponse.status, 200);
    assert.deepEqual(
      updateInput === undefined
        ? undefined
        : {
            assignmentId: updateInput.assignmentId,
            expectedUpdatedAt: updateInput.expectedUpdatedAt,
            assignment: updateInput.assignment,
            actor: updateInput.actor,
          },
      {
        assignmentId: "assignment-edit",
        expectedUpdatedAt,
        assignment: assignmentUpdateBody,
        actor: {
          userId: profile.userId,
          accountId: profile.activeAccess.accountId,
          displayName: profile.displayName,
        },
      },
    );
    assert.equal(events.at(-1)?.action, "board_assignment.update");

    current.status = "completed";
    updateInput = undefined;
    const completedResponse = await fetch(
      `${baseUrl}/api/board-assignments/assignment-edit`,
      {
        method: "PATCH",
        headers,
        body: JSON.stringify(updateBody),
      },
    );

    assert.equal(completedResponse.status, 409);
    assert.equal(updateInput, undefined);
  } finally {
    server.close();
    await once(server, "close");
  }
});

test("board assignment completion history returns immutable accepted snapshots", async () => {
  const profile = buildProductionProfile("business_owner");
  profile.activeAccess.navigationItems = ["business.board_assignments"];
  profile.activeAccess.capabilities = ["business.view_board_assignments"];
  const assignment: BoardAssignment = {
    id: "assignment-history",
    meetingDate: "2026-07-10",
    protocolNumber: "369",
    decisionNumber: "2.4",
    summary: "Состояние поручения на момент приёмки",
    details: "Это содержание не меняется после завершения периода.",
    coExecutors: ["Экономист"],
    dueDate: "Каждый месяц, с 10.07.2026 по 31.12.2026",
    recurrence: "monthly",
    activeFrom: "2026-07-10",
    activeTo: "2026-12-31",
    currentOccurrenceDate: "2026-07-10",
    status: "completed",
    createdByDisplayName: "Белов Ю.И.",
    createdAt: "2026-07-10T08:00:00.000Z",
    updatedAt: "2026-07-28T12:00:00.000Z",
    documents: [],
    comments: [{
      id: "completion-comment",
      authorDisplayName: "Лариков А.Т.",
      comment: "Исполнение принято.",
      statusAfter: "completed",
      createdAt: "2026-07-28T12:00:00.000Z",
    }],
  };
  const completion: BoardAssignmentCompletion = {
    id: "completion-1",
    assignmentId: assignment.id,
    occurrenceDate: "2026-07-10",
    completedByDisplayName: "Лариков А.Т.",
    completedAt: "2026-07-28T12:00:00.000Z",
    assignment,
  };
  const completionSummary: BoardAssignmentCompletionSummary = {
    ...completion,
    assignment: {
      id: assignment.id,
      meetingDate: assignment.meetingDate,
      protocolNumber: assignment.protocolNumber,
      decisionNumber: assignment.decisionNumber,
      summary: assignment.summary,
      coExecutors: assignment.coExecutors,
      dueDate: assignment.dueDate,
      recurrence: assignment.recurrence,
      activeFrom: assignment.activeFrom,
      activeTo: assignment.activeTo,
      currentOccurrenceDate: assignment.currentOccurrenceDate,
      status: assignment.status,
      createdByDisplayName: assignment.createdByDisplayName,
      createdAt: assignment.createdAt,
      updatedAt: assignment.updatedAt,
    },
  };
  let historyFilters: Omit<BoardAssignmentFilters, "status"> | undefined;
  const repository = {
    async list() {
      return [];
    },
    async readById() {
      return undefined;
    },
    async readByIdForUpdate() {
      return undefined;
    },
    async create() {
      throw new Error("not used");
    },
    async update() {
      throw new Error("not used");
    },
    async applyAction() {
      throw new Error("not used");
    },
    async listCompletions(filters: Omit<BoardAssignmentFilters, "status">) {
      historyFilters = filters;
      return [completionSummary];
    },
    async readCompletionById(id: string) {
      return id === completion.id ? completion : undefined;
    },
  } as unknown as BoardAssignmentsRepository;
  const server = createApiServer({
    config: productionConfig,
    dispatcherSubmissions,
    authService: buildAuthService({ profile }),
    boardAssignments: repository,
    referenceDataSource: emptyReferenceDataSource,
    audit: {
      async record() {},
      async listReport() {
        throw new Error("not used");
      },
    },
    databaseTransaction: {
      async run(operation) {
        return operation();
      },
    },
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const headers = {
    Cookie: `${productionConfig.session.cookieName}=prod-session`,
  };

  try {
    const listResponse = await fetch(
      `${baseUrl}/api/board-assignment-completions?meetingDateFrom=2026-07-01&query=состояние`,
      { headers },
    );
    assert.equal(listResponse.status, 200);
    assert.deepEqual(historyFilters, {
      meetingDateFrom: "2026-07-01",
      query: "состояние",
    });
    const listPayload = await listResponse.json() as {
      completions: BoardAssignmentCompletionSummary[];
    };
    assert.equal(listPayload.completions[0]?.id, "completion-1");

    const detailResponse = await fetch(
      `${baseUrl}/api/board-assignment-completions/completion-1`,
      { headers },
    );
    assert.equal(detailResponse.status, 200);
    const detailPayload = await detailResponse.json() as {
      completion: BoardAssignmentCompletion;
    };
    assert.equal(detailPayload.completion.assignment.status, "completed");
    assert.equal(
      detailPayload.completion.assignment.comments.at(-1)?.comment,
      "Исполнение принято.",
    );
  } finally {
    server.close();
    await once(server, "close");
  }
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
  productionBrands: ProductionBrandsDataSource = passthroughProductionBrands,
  productionSnapshot?: ProductionDatabaseSnapshotService,
  refractoryReports: RefractoryReportsRepository = emptyRefractoryReports,
  laboratoryReferenceDataSource?: LaboratoryReferenceDataSource,
  laboratoryResults?: LaboratoryResultsRepository,
  laboratoryBankAssignments?: LaboratoryBankAssignmentsRepository,
  bankVolumeReferenceDataSource?: BankVolumeReferenceDataSource,
  now?: () => Date,
  rotaryKiln2FiringJournal?: RotaryKiln2FiringJournalRepository,
  laboratorySampleRegistrationJournal?:
    LaboratorySampleRegistrationJournalRepository,
  laboratoryChemicalAnalysisJournal?:
    LaboratoryChemicalAnalysisJournalRepository,
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
    refractoryReports,
    laboratoryReferenceDataSource,
    laboratoryResults,
    laboratoryBankAssignments,
    rotaryKiln2FiringJournal,
    laboratorySampleRegistrationJournal,
    laboratoryChemicalAnalysisJournal,
    bankVolumeReferenceDataSource,
    audit: audit ?? fallbackAudit,
    databaseTransaction: databaseTransaction ?? directTransaction,
    productionSnapshot,
    now,
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

function buildLaboratoryBankAssignment(
  bankNumber: 1 | 2 | 3,
  materialLabel: string,
  bulkDensityTonsPerCubicMeter: number,
) {
  return {
    assignmentId: `assignment-${bankNumber}`,
    bankNumber,
    materialLabel,
    bulkDensityTonsPerCubicMeter,
    bulkDensitySource: "rotary_kiln_2_journal" as const,
    bulkDensitySampleCount: 10,
    assignedByDisplayName: "Лаборант",
    assignedAt: "2026-07-23T08:00:00.000Z",
  };
}

function buildApprovedCoshReport({
  id,
  reportDate,
  shiftNumber,
  measurements,
}: {
  id: string;
  reportDate: string;
  shiftNumber: 1 | 2;
  measurements: readonly [number, number, number];
}): RefractoryReportRevision {
  return {
    id,
    reportType: "cosh",
    reportDate,
    shiftNumber,
    revisionNumber: 1,
    status: "approved",
    payload: {
      jarMeasurements: measurements.map((averageHeightMeters, index) => ({
        jarNumber: (index + 1) as 1 | 2 | 3,
        values: [averageHeightMeters],
        averageHeightMeters,
      })),
    },
    totals: {
      chamotteOutputTons: 0,
      bunkerFillTons: 0,
      chamotteSupplyTons: 0,
      baggingTons: 0,
      scrapRemovalTons: 0,
    },
    submittedByUserId: "oc-user",
    submittedByAccountId: "oc-access",
    masterDisplayName: "Мастер ОЦ",
    submittedAt: `${reportDate}T17:00:00.000Z`,
    reviewerDisplayName: "Диспетчер",
    reviewedAt: `${reportDate}T17:05:00.000Z`,
  };
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
