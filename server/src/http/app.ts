import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { ServerConfig } from "../config/env.js";
import {
  hasProfileCapability,
  isAccountNavigationItem,
  isAccountPosition,
  type AccountCapability,
  type AccountNavigationItem,
  type AccountType,
  type AuthSessionService,
  type AuthenticatedSession,
  type ServerUserProfile,
} from "../domain/auth.js";
import {
  accountTypeByPosition,
  hasAdminNavigationItems,
  hasSameAdminNavigationItems,
  isBoardAssignmentAccess,
  resolveCapabilitiesForPosition,
  validatePositionNavigationItems,
} from "../domain/accountAccessConfiguration.js";
import {
  buildDefaultDevAccessOptions,
  buildDevProfile,
  createDevSessionId,
  isDevAccessSessionExpired,
  type DevAccessOption,
  type DevAccessSession,
  isAccountType,
} from "../domain/devAccessProfile.js";
import {
  buildDispatcherSubmissionDedupeKey,
  readProductionSubmissionBrandReferences,
  validateDispatcherSubmissionDraft,
  type DispatcherSubmission,
  type ValidatedDispatcherSubmissionDraft,
} from "../domain/dispatcherSubmission.js";
import {
  applyIncidentStateRules,
  buildIncidentOverviewPeriod,
  buildIncidentOverviewSummary,
  buildOpenIncidentSummaries,
} from "../domain/dispatcherIncidentState.js";
import { applyVisitorStateRules } from "../domain/dispatcherVisitorState.js";
import {
  buildProductionMonthToDate,
  buildProductionMonthOverview,
  buildProductionReportTableTotals,
  buildProductionReportTables,
  type ProductionReportDateRange,
} from "../domain/productionReportTables.js";
import {
  buildProductionCategoryPlan,
  buildProductionPlanDatePresets,
  productionCategories,
  productionCategoryLabels,
  type ProductionCategory,
  type ProductionCategoryScheduleInput,
} from "../domain/productionPlan.js";
import {
  normalizeProductionBrandLabelInput,
} from "../domain/productionBrand.js";
import { validateRefractoryWagonSubmission } from "../domain/refractoryWagons.js";
import type { RefractoryWagonSubmission } from "../contracts/refractoryWagons.js";
import {
  laboratorySections,
  validateLaboratoryResultSubmission,
  type LaboratorySection,
} from "../domain/laboratoryResult.js";
import {
  validateRotaryKiln2FiringJournalSubmission,
} from "../domain/rotaryKiln2FiringJournal.js";
import {
  validateLaboratorySampleRegistrationCorrection,
  validateLaboratorySampleRegistrationJournalSubmission,
} from "../domain/laboratorySampleRegistrationJournal.js";
import {
  buildLaboratorySampleCodeDraft,
} from "../contracts/laboratorySampleRegistrationJournal.js";
import {
  buildLaboratoryUnshapedProductSampleCodeDraft,
  laboratoryUnshapedProductSampleSuitabilityLabels,
} from "../contracts/laboratoryUnshapedProductSampleJournal.js";
import type {
  LaboratoryChemicalAnalysisJournalFilters,
} from "../contracts/laboratoryChemicalAnalysisJournal.js";
import {
  validateLaboratoryChemicalAnalysisJournalSubmission,
} from "../domain/laboratoryChemicalAnalysisJournal.js";
import {
  validateLaboratoryUnshapedProductSampleCorrection,
  validateLaboratoryUnshapedProductSampleSubmission,
} from "../domain/laboratoryUnshapedProductSampleJournal.js";
import { validateLaboratoryRawMaterialQualitySubmission } from "../domain/laboratoryRawMaterialQualityJournal.js";
import { validateLaboratoryGreenProductQualitySubmission } from "../domain/laboratoryGreenProductQualityJournal.js";
import {
  laboratoryRawMaterialQualityFields,
  laboratoryRawMaterialQualityRecommendationRecipientLabels,
  laboratoryRawMaterialQualityShiftLabels,
  type LaboratoryRawMaterialQualitySubmission,
} from "../contracts/laboratoryRawMaterialQualityJournal.js";
import {
  laboratoryGreenProductQualityFields,
  type LaboratoryGreenProductQualityRecord,
  type LaboratoryGreenProductQualitySubmission,
} from "../contracts/laboratoryGreenProductQualityJournal.js";
import { buildLaboratoryProtocol } from "../domain/laboratoryProtocol.js";
import {
  resolveLaboratoryBankAssignment,
  validateLaboratoryBankAssignmentRequest,
} from "../domain/laboratoryBankAssignment.js";
import {
  boardAssignmentStatuses,
  getBoardAssignmentOccurrenceOnOrAfter,
  getNextBoardAssignmentOccurrenceDate,
  getBoardAssignmentPermissions,
  isBoardAssignmentActiveOn,
  validateBoardAssignmentAction,
  validateBoardAssignmentCreateRequest,
  validateBoardAssignmentUpdateRequest,
  type BoardAssignmentAction,
  type BoardAssignmentStatus,
} from "../domain/boardAssignment.js";
import {
  bankNumbers,
  calculateCoshBankMeasurements,
  type BankNumber,
} from "../domain/bankMeasurement.js";
import {
  refractoryReportLabels,
  validateRefractoryReportDecision,
  validateRefractoryReportSubmission,
  type RefractoryCoshPayload,
  type RefractoryCoshTotals,
  type RefractoryEquipmentPayload,
  type RefractoryEquipmentTotals,
  type RefractoryFiringPayload,
  type RefractoryFiringTotals,
  type RefractoryReportNotification,
  type RefractoryShiftNumber,
  type ValidatedRefractoryReportSubmission,
} from "../domain/refractoryReport.js";
import {
  getDispatcherFormDefinition,
  getPublicDispatcherForms,
  isDispatcherFormId,
} from "../domain/dispatcherForms.js";
import {
  isCanonicalAdminLogin,
  ProtectedAccountMutationError,
} from "../domain/adminAccountProtection.js";
import type {
  DispatcherFeedFilters,
  DispatcherSubmissionsRepository,
} from "../repositories/dispatcherSubmissionsRepository.js";
import type {
  AdminDatabaseRepository,
  AdminDatabaseCellValue,
  AdminDatabaseTableRows,
} from "../repositories/adminDatabaseRepository.js";
import {
  ArchivedAccountLoginStatusError,
  AccountLoginAlreadyExistsError,
  type AccountsRepository,
  type AdminAccountSummary,
  type AdminPositionSummary,
  type CreateAccountInput,
  type SetAccountLoginEnabledInput,
  type SetAccountPositionInput,
} from "../repositories/accountsRepository.js";
import {
  createGoogleSheetsProductionBrandsDataSource,
  createGoogleSheetsLaboratoryReferenceDataSource,
  createGoogleSheetsBankVolumeReferenceDataSource,
  createGoogleSheetsReferenceDataSource,
  type DispatcherReferenceDataSource,
  type BankVolumeReferenceDataSource,
  type LaboratoryReferenceDataSource,
  type ProductionBrandReference,
  type ProductionBrandsDataSource,
} from "../integrations/googleSheetsReference.js";
import {
  createEmailNotificationService,
  type EmailNotificationService,
} from "../integrations/emailNotifications.js";
import {
  createMaxNotificationService,
  type MaxNotificationService,
} from "../integrations/maxNotifications.js";
import {
  renderLaboratoryChemicalAnalysisProtocolPdf,
  renderLaboratoryProtocolPdf,
} from "../integrations/laboratoryProtocolPdf.js";
import {
  createBoardAssignmentMaterialsSource,
  type BoardAssignmentMaterialsSource,
} from "../integrations/boardAssignmentMaterials.js";
import type { RefractoryNotificationKind } from "../integrations/refractoryNotifications.js";
import {
  DispatcherSpreadsheetImportChangedError,
  type DispatcherSpreadsheetImportService,
} from "../integrations/dispatcherSpreadsheetImport.js";
import {
  buildAuditActor,
  buildDispatcherSubmissionAuditDetails,
  canProfileViewAuditScreen,
  isAuditEventCategory,
  readAuditScreen,
  type AuditEventCategory,
  type AuditEventDraft,
} from "../domain/audit.js";
import type { AuditRepository } from "../repositories/auditRepository.js";
import type { DatabaseTransactionRunner } from "../db/transactionContext.js";
import {
  productionSnapshotConfirmation,
  ProductionSnapshotAlreadyRunningError,
  ProductionSnapshotRestoreError,
  ProductionSnapshotSchemaMismatchError,
  type ProductionDatabaseSnapshotService,
} from "../db/productionSnapshot.js";
import type { ProductionPlansRepository } from "../repositories/productionPlansRepository.js";
import {
  RefractoryReportAlreadyReviewedError,
  RefractoryReportNotFoundError,
  RefractoryReportPendingError,
  RefractoryReportSelfReviewError,
  toPublicRefractoryReportRevision,
  type RefractoryReportRevision,
  type RefractoryReportsRepository,
} from "../repositories/refractoryReportsRepository.js";
import type { LaboratoryResultsRepository } from "../repositories/laboratoryResultsRepository.js";
import type {
  LaboratoryBankAssignment,
  LaboratoryBankAssignmentsRepository,
} from "../repositories/laboratoryBankAssignmentsRepository.js";
import type { RotaryKiln2FiringJournalRepository } from "../repositories/rotaryKiln2FiringJournalRepository.js";
import type { LaboratorySampleRegistrationJournalRepository } from "../repositories/laboratorySampleRegistrationJournalRepository.js";
import {
  LaboratoryChemicalAnalysisSampleUnavailableError,
  type LaboratoryChemicalAnalysisJournalRepository,
} from "../repositories/laboratoryChemicalAnalysisJournalRepository.js";
import type { LaboratoryUnshapedProductSampleJournalRepository } from "../repositories/laboratoryUnshapedProductSampleJournalRepository.js";
import type { LaboratoryRawMaterialQualityJournalRepository } from "../repositories/laboratoryRawMaterialQualityJournalRepository.js";
import {
  LaboratoryGreenProductQualityWagonUnavailableError,
  type LaboratoryGreenProductQualitySnapshot,
  type LaboratoryGreenProductQualityJournalRepository,
} from "../repositories/laboratoryGreenProductQualityJournalRepository.js";
import {
  RefractoryWagonNumberAlreadyExistsError,
  type RefractoryWagonsRepository,
} from "../repositories/refractoryWagonsRepository.js";
import {
  BoardAssignmentChangedError,
  type BoardAssignmentFilters,
  type BoardAssignmentsRepository,
} from "../repositories/boardAssignmentsRepository.js";

type AppDependencies = {
  config: ServerConfig;
  dispatcherSubmissions: DispatcherSubmissionsRepository;
  adminDatabase?: AdminDatabaseRepository;
  accounts?: AccountsRepository;
  authService?: AuthSessionService;
  referenceDataSource?: DispatcherReferenceDataSource;
  emailNotificationService?: EmailNotificationService;
  maxNotificationService?: MaxNotificationService;
  dispatcherSpreadsheetImport?: DispatcherSpreadsheetImportService;
  productionPlans?: ProductionPlansRepository;
  productionBrands?: ProductionBrandsDataSource;
  refractoryReports?: RefractoryReportsRepository;
  refractoryWagons?: RefractoryWagonsRepository;
  laboratoryReferenceDataSource?: LaboratoryReferenceDataSource;
  laboratoryResults?: LaboratoryResultsRepository;
  laboratoryBankAssignments?: LaboratoryBankAssignmentsRepository;
  rotaryKiln2FiringJournal?: RotaryKiln2FiringJournalRepository;
  laboratorySampleRegistrationJournal?:
    LaboratorySampleRegistrationJournalRepository;
  laboratoryChemicalAnalysisJournal?:
    LaboratoryChemicalAnalysisJournalRepository;
  laboratoryUnshapedProductSampleJournal?:
    LaboratoryUnshapedProductSampleJournalRepository;
  laboratoryRawMaterialQualityJournal?:
    LaboratoryRawMaterialQualityJournalRepository;
  laboratoryGreenProductQualityJournal?:
    LaboratoryGreenProductQualityJournalRepository;
  boardAssignments?: BoardAssignmentsRepository;
  boardAssignmentMaterials?: BoardAssignmentMaterialsSource;
  bankVolumeReferenceDataSource?: BankVolumeReferenceDataSource;
  audit: AuditRepository;
  databaseTransaction: DatabaseTransactionRunner;
  productionSnapshot?: ProductionDatabaseSnapshotService;
  now?: () => Date;
};

type JsonPayload = Record<string, unknown> | unknown[];

const maxBodyBytes = 100_000;
const maxBoardAssignmentDocumentBytes = 10_000_000;
const devSessionCookie = "smb_dev_access_session";
const devSessionHeader = "x-smb-dev-session";
const accountHeader = "x-smb-account-id";
const laboratoryProtocolPathPattern =
  /^\/api\/laboratory\/results\/([a-zA-Z0-9-]{1,100})\/protocol\.pdf$/u;
const laboratorySampleRegistrationRecordPathPattern =
  /^\/api\/laboratory\/sample-registration-journal\/([a-zA-Z0-9-]{1,100})$/u;
const rotaryKiln2FiringRecordPathPattern =
  /^\/api\/laboratory\/rotary-kiln-2-journal\/([a-zA-Z0-9-]{1,100})$/u;
const laboratoryChemicalAnalysisRecordPathPattern =
  /^\/api\/laboratory\/chemical-analysis-journal\/([a-zA-Z0-9-]{1,100})$/u;
const laboratoryUnshapedProductSampleRecordPathPattern =
  /^\/api\/laboratory\/unshaped-product-sample-journal\/([a-zA-Z0-9-]{1,100})$/u;
const laboratoryRawMaterialQualityRecordPathPattern =
  /^\/api\/laboratory\/raw-material-quality-journal\/([a-zA-Z0-9-]{1,100})$/u;
const laboratoryGreenProductQualityRecordPathPattern =
  /^\/api\/laboratory\/green-product-quality-journal\/([a-zA-Z0-9-]{1,100})$/u;
const laboratoryChemicalAnalysisProtocolPath =
  "/api/laboratory/chemical-analysis-journal/protocol.pdf";

class RequestBodyTooLargeError extends Error {
  constructor() {
    super("Request body is too large.");
    this.name = "RequestBodyTooLargeError";
  }
}

export function createApiServer({
  config,
  dispatcherSubmissions,
  adminDatabase,
  accounts,
  authService,
  referenceDataSource = createGoogleSheetsReferenceDataSource(
    config.googleSheetsReference,
  ),
  emailNotificationService = createEmailNotificationService(
    config.emailNotifications,
    {},
    config.appEnv,
  ),
  maxNotificationService = createMaxNotificationService(
    config.maxNotifications,
    {},
    config.appEnv,
  ),
  dispatcherSpreadsheetImport,
  productionPlans,
  productionBrands = createGoogleSheetsProductionBrandsDataSource(
    config.googleSheetsReference,
  ),
  refractoryReports,
  refractoryWagons,
  laboratoryReferenceDataSource = createGoogleSheetsLaboratoryReferenceDataSource(
    config.googleSheetsReference,
  ),
  laboratoryResults,
  laboratoryBankAssignments,
  rotaryKiln2FiringJournal,
  laboratorySampleRegistrationJournal,
  laboratoryChemicalAnalysisJournal,
  laboratoryUnshapedProductSampleJournal,
  laboratoryRawMaterialQualityJournal,
  laboratoryGreenProductQualityJournal,
  boardAssignments,
  boardAssignmentMaterials = createBoardAssignmentMaterialsSource(),
  bankVolumeReferenceDataSource = createGoogleSheetsBankVolumeReferenceDataSource(
    config.googleSheetsReference,
  ),
  audit,
  databaseTransaction,
  productionSnapshot,
  now = () => new Date(),
}: AppDependencies) {
  const devSessions = new Map<string, DevAccessSession>();

  return createServer(async (req, res) => {
    applyCors(req, res, config);

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    try {
      const url = new URL(req.url ?? "/", "http://localhost");

      if (req.method === "GET" && url.pathname === "/health") {
        sendJson(res, 200, { ok: true });
        return;
      }

      if (
        productionSnapshot?.isRunning() === true &&
        url.pathname !== "/api/admin/database/production-snapshot"
      ) {
        sendJson(res, 503, {
          error: {
            code: "server_error",
            message: "Тестовая БД обновляется. Повторите запрос после завершения.",
          },
        });
        return;
      }

      if (url.pathname === "/api/auth/login") {
        await handleAuthLogin(
          req,
          res,
          config,
          authService,
          audit,
          databaseTransaction,
        );
        return;
      }

      if (url.pathname === "/api/auth/logout") {
        await handleAuthLogout(
          req,
          res,
          config,
          authService,
          audit,
          databaseTransaction,
        );
        return;
      }

      if (url.pathname === "/api/access/profile") {
        await handleAccessProfile(req, res, {
          config,
          devSessions,
          authService,
        });
        return;
      }

      if (url.pathname === "/api/dev/access-session") {
        if (!config.devAccessEnabled) {
          sendJson(res, 404, {
            error: {
              code: "not_found",
              message: "Endpoint not found.",
            },
          });
          return;
        }

        await handleDevAccessSession(req, res, devSessions, accounts, audit);
        return;
      }

      if (url.pathname === "/api/admin/audit-events") {
        await handleAdminAuditReportRequest({
          req,
          res,
          url,
          config,
          devSessions,
          authService,
          audit,
        });
        return;
      }

      if (url.pathname === "/api/audit/events") {
        await handleAuditEventRequest({
          req,
          res,
          config,
          devSessions,
          authService,
          audit,
        });
        return;
      }

      if (
        url.pathname === "/api/admin/database" ||
        url.pathname === "/api/admin/database/production-snapshot" ||
        url.pathname.startsWith("/api/admin/database/tables/") ||
        url.pathname.startsWith("/api/admin/database/imports/")
      ) {
        await handleAdminDatabaseRequest({
          req,
          res,
          url,
          config,
          devSessions,
          authService,
          adminDatabase,
          accounts,
          dispatcherSpreadsheetImport,
          productionBrands,
          audit,
          databaseTransaction,
          productionSnapshot,
        });
        return;
      }

      if (
        url.pathname === "/api/admin/accounts" ||
        url.pathname === "/api/admin/accounts/reset-password" ||
        url.pathname.startsWith("/api/admin/accounts/") ||
        url.pathname === "/api/admin/positions" ||
        url.pathname.startsWith("/api/admin/positions/")
      ) {
        await handleAdminAccountsRequest({
          req,
          res,
          url,
          config,
          devSessions,
          authService,
          accounts,
          audit,
          databaseTransaction,
        });
        return;
      }

      if (
        url.pathname === "/api/production-plans" ||
        url.pathname === "/api/production-plans/preview" ||
        url.pathname === "/api/production-plans/daily"
      ) {
        await handleProductionPlansRequest({
          req,
          res,
          url,
          config,
          devSessions,
          authService,
          dispatcherSubmissions,
          productionPlans,
          audit,
          databaseTransaction,
        });
        return;
      }

      if (url.pathname === "/api/production-brands") {
        await handleProductionBrandsRequest({
          req,
          res,
          config,
          devSessions,
          authService,
          productionBrands,
          audit,
          databaseTransaction,
        });
        return;
      }

      if (url.pathname === "/api/dispatcher/production-bank-contents") {
        await handleDispatcherProductionBankContentsRequest({
          req,
          res,
          url,
          config,
          devSessions,
          authService,
          laboratoryBankAssignments,
          refractoryReports,
        });
        return;
      }

      if (url.pathname === "/api/business/overview") {
        await handleBusinessOverviewRequest({
          req,
          res,
          config,
          devSessions,
          authService,
          dispatcherSubmissions,
          laboratoryResults,
          now,
        });
        return;
      }

      if (
        url.pathname === "/api/board-assignments" ||
        /^\/api\/board-assignments\/[^/]+(?:\/action)?$/u.test(url.pathname) ||
        /^\/api\/board-assignments\/[^/]+\/documents(?:\/[^/]+)?$/u.test(
          url.pathname,
        ) ||
        /^\/api\/board-assignment-completions(?:\/[^/]+)?$/u.test(url.pathname) ||
        /^\/api\/board-assignment-materials\/[^/]+$/u.test(url.pathname)
      ) {
        await handleBoardAssignmentsRequest({
          req,
          res,
          url,
          config,
          devSessions,
          authService,
          boardAssignments,
          boardAssignmentMaterials,
          audit,
          databaseTransaction,
          now,
        });
        return;
      }

      if (
        url.pathname === "/api/refractory-wagons" ||
        /^\/api\/refractory-wagons\/[^/]+$/u.test(url.pathname)
      ) {
        await handleRefractoryWagonsRequest({
          req,
          res,
          url,
          config,
          devSessions,
          authService,
          refractoryWagons,
          productionBrands,
          audit,
          databaseTransaction,
        });
        return;
      }

      if (
        url.pathname === "/api/refractory-reports" ||
        url.pathname === "/api/refractory-reports/pending" ||
        url.pathname === "/api/refractory-reports/own" ||
        url.pathname === "/api/refractory-reports/banks" ||
        /^\/api\/refractory-reports\/[^/]+\/decision$/u.test(url.pathname)
      ) {
        await handleRefractoryReportsRequest({
          req,
          res,
          url,
          config,
          devSessions,
          authService,
          refractoryReports,
          laboratoryBankAssignments,
          bankVolumeReferenceDataSource,
          productionBrands,
          referenceDataSource,
          emailNotificationService,
          maxNotificationService,
          audit,
          databaseTransaction,
        });
        return;
      }

      if (
        url.pathname === "/api/laboratory/reference" ||
        url.pathname === "/api/laboratory/results" ||
        url.pathname === "/api/laboratory/banks" ||
        url.pathname === "/api/laboratory/rotary-kiln-2-journal" ||
        rotaryKiln2FiringRecordPathPattern.test(url.pathname) ||
        url.pathname === "/api/laboratory/rotary-kiln-2-draft" ||
        url.pathname === "/api/laboratory/rotary-kiln-2-personnel-options" ||
        url.pathname === "/api/laboratory/sample-registration-draft" ||
        url.pathname === "/api/laboratory/sample-registration-locations" ||
        url.pathname === "/api/laboratory/sample-registration-journal" ||
        laboratorySampleRegistrationRecordPathPattern.test(url.pathname) ||
        url.pathname === "/api/laboratory/chemical-analysis-draft" ||
        url.pathname === "/api/laboratory/chemical-analysis-journal" ||
        url.pathname === laboratoryChemicalAnalysisProtocolPath ||
        laboratoryChemicalAnalysisRecordPathPattern.test(url.pathname) ||
        url.pathname === "/api/laboratory/unshaped-product-sample-draft" ||
        url.pathname === "/api/laboratory/unshaped-product-sample-journal" ||
        laboratoryUnshapedProductSampleRecordPathPattern.test(url.pathname) ||
        url.pathname === "/api/laboratory/raw-material-quality-draft" ||
        url.pathname === "/api/laboratory/raw-material-quality-options" ||
        url.pathname === "/api/laboratory/raw-material-quality-journal" ||
        laboratoryRawMaterialQualityRecordPathPattern.test(url.pathname) ||
        url.pathname === "/api/laboratory/green-product-quality-draft" ||
        url.pathname === "/api/laboratory/green-product-quality-options" ||
        url.pathname === "/api/laboratory/green-product-quality-journal" ||
        laboratoryGreenProductQualityRecordPathPattern.test(url.pathname) ||
        laboratoryProtocolPathPattern.test(url.pathname)
      ) {
        await handleLaboratoryRequest({
          req,
          res,
          url,
          config,
          devSessions,
          authService,
          laboratoryReferenceDataSource,
          laboratoryResults,
          laboratoryBankAssignments,
          rotaryKiln2FiringJournal,
          laboratorySampleRegistrationJournal,
          laboratoryChemicalAnalysisJournal,
          laboratoryUnshapedProductSampleJournal,
          laboratoryRawMaterialQualityJournal,
          laboratoryGreenProductQualityJournal,
          productionBrands,
          audit,
          databaseTransaction,
          now,
        });
        return;
      }

      if (url.pathname === "/api/dispatcher/forms") {
        if (req.method !== "GET") {
          sendJson(res, 405, {
            error: {
              code: "access_denied",
              message: "Only GET is supported for dispatcher forms.",
            },
          });
          return;
        }

        const referenceData = await referenceDataSource.read();

        sendJson(res, 200, {
          forms: getPublicDispatcherForms({
            incidentLocationOptions: referenceData.incidentLocationOptions,
            incidentResponsibleOptions:
              referenceData.incidentResponsibleOptions,
          }),
        });
        return;
      }

      if (url.pathname === "/api/dispatcher/equipment-report") {
        if (req.method !== "POST") {
          sendJson(res, 405, {
            error: {
              code: "access_denied",
              message: "Only POST is supported for dispatcher equipment reports.",
            },
          });
          return;
        }

        const access = await requireCapability(req, res, {
          config,
          devSessions,
          authService,
          capability: "business.submit_dispatcher_forms",
        });

        if (access === undefined) {
          return;
        }

        const payload = await readJsonBody(req);
        const validation = validateDispatcherEquipmentReportRequest(payload);

        if (!validation.ok) {
          sendJson(res, 400, {
            error: {
              code: "invalid_response",
              message: validation.errors.join(" "),
            },
          });
          return;
        }

        const history = await dispatcherSubmissions.listLatest({
          formId: "equipment",
          limit: 2_000,
        });
        const reportStatus = readEquipmentReportStatus(
          validation.value,
          history,
        );
        const submittedByAccountId = readSubmittedByAccountId(
          req,
          access.profile,
          config,
        );
        const submissions = await runAuditedMutation({
          transaction: databaseTransaction,
          audit,
          mutate: async () => {
            const result: DispatcherSubmission[] = [];

            for (const item of validation.value.items) {
              result.push(
                await dispatcherSubmissions.create(item, submittedByAccountId),
              );
            }

            if (reportStatus === "updated") {
              await dispatcherSubmissions.recordEquipmentReportRevision({
                reportDate: readEquipmentReportDate(result),
                status: reportStatus,
                submissions: result,
                submittedByAccountId,
              });
            }

            return result;
          },
          buildEvent: (result) => ({
            actor: buildAuditActor(access.profile),
            category: "form_submission",
            action: "form.submit",
            summary: reportStatus === "updated"
              ? "Обновлён дневной отчёт «Оборудование»"
              : "Отправлен дневной отчёт «Оборудование»",
            details: [
              {
                label: "Дата отчета",
                value: readEquipmentReportDate(result),
              },
              ...validation.value.items.flatMap((item) => {
                const equipment = item.draft.payload.equipment ?? "Оборудование";

                return buildDispatcherSubmissionAuditDetails(
                  item.draft.formId,
                  item.draft.payload,
                )
                  .filter((detail) =>
                    detail.label !== "Дата отчета" && detail.label !== "Оборудование",
                  )
                  .map((detail) => ({
                    label: `${equipment}: ${detail.label}`,
                    value: detail.value,
                  }));
              }),
            ],
            targetType: "equipment_report",
            targetId: readEquipmentReportDate(result),
          }),
        });

        await notifyDispatcherEquipmentReport(
          submissions,
          reportStatus,
          referenceDataSource,
          emailNotificationService,
          maxNotificationService,
        );

        sendJson(res, 201, {
          submissions,
          reportStatus,
        });
        return;
      }

      if (url.pathname === "/api/dispatcher/submissions") {
        if (req.method === "GET") {
          const access = await requireCapability(req, res, {
            config,
            devSessions,
            authService,
            capability: "business.view_dispatcher_feed",
            alternativeNavigationItem: "admin.account_preview",
          });

          if (access === undefined) {
            return;
          }

          const filters = readDispatcherFeedFilters(url);

          if (!filters.ok) {
            sendJson(res, 400, {
              error: {
                code: "invalid_response",
                message: filters.errors.join(" "),
              },
            });
            return;
          }

          const productionTotalsRange = readProductionReportTotalsRange(url);

          if (!productionTotalsRange.ok) {
            sendJson(res, 400, {
              error: {
                code: "invalid_response",
                message: productionTotalsRange.errors.join(" "),
              },
            });
            return;
          }

          const productionSubmissions = await listAllProductionSubmissions(
            dispatcherSubmissions,
          );
          const productionPlanMonths = Array.from(
            new Set(
              productionSubmissions.flatMap((submission) => {
                const month = readProductionSubmissionMonth(
                  submission.payload,
                );
                return month === undefined ? [] : [month];
              }),
            ),
          );
          const productionPlanValues = productionPlans === undefined
            ? []
            : (await Promise.all(
                productionPlanMonths.map((month) =>
                  productionPlans.readLatest(month),
                ),
              )).filter((plan) => plan !== undefined);
          const productionReportTables = buildProductionReportTables(
            productionSubmissions,
            productionPlanValues,
          );
          const productionReportTableTotals = buildProductionReportTableTotals(
            productionReportTables,
            productionTotalsRange.value,
          );
          const productionMonthOverview = buildProductionMonthOverview(
            productionReportTables,
          );
          const submissions = await dispatcherSubmissions.listLatest(filters.value);
          const summary = await dispatcherSubmissions.readSummary(filters.value);
          const openIncidents = buildOpenIncidentSummaries(
            await listAllIncidentSubmissions(dispatcherSubmissions),
            now(),
          );
          const bankContents = laboratoryBankAssignments === undefined
            ? []
            : toDispatcherBankContents(
                await laboratoryBankAssignments.listCurrent(),
              );

          sendJson(res, 200, {
            submissions,
            productionReportTables,
            productionReportTableTotals,
            productionMonthOverview: productionMonthOverview ?? null,
            openIncidents,
            bankContents,
            receivedAt: new Date().toISOString(),
            summary,
          });
          return;
        }

        if (req.method === "POST") {
          const access = await requireCapability(req, res, {
            config,
            devSessions,
            authService,
            capability: "business.submit_dispatcher_forms",
          });

          if (access === undefined) {
            return;
          }

          const payload = await readJsonBody(req);
          let validation = validateDispatcherSubmissionDraft(payload);

          if (!validation.ok) {
            sendJson(res, 400, {
              error: {
                code: "invalid_response",
                message: validation.errors.join(" "),
              },
            });
            return;
          }

          if (validation.value.draft.formId === "production") {
            if (refractoryReports === undefined) {
              sendJson(res, 503, {
                error: {
                  code: "server_error",
                  message: "Хранилище данных банок не настроено.",
                },
              });
              return;
            }

            const reportDate = readIsoDispatcherReportDate(
              validation.value.draft.payload.reportDate,
            );

            if (reportDate === undefined) {
              sendJson(res, 400, {
                error: {
                  code: "invalid_response",
                  message: "Укажите корректную дату отчёта.",
                },
              });
              return;
            }

            const measurementSnapshot =
              await readDispatcherProductionBankMeasurements(
                refractoryReports,
                reportDate,
              );
            validation = validateDispatcherSubmissionDraft({
              formId: "production",
              payload: buildProductionPayloadWithBankMeasurements({
                payload: validation.value.draft.payload,
                reportDate,
                bankMeasurements: measurementSnapshot.bankMeasurements,
              }),
            });

            if (!validation.ok) {
              sendJson(res, 400, {
                error: {
                  code: "invalid_response",
                  message: validation.errors.join(" "),
                },
              });
              return;
            }
          }

          const history = await dispatcherSubmissions.listLatest({ limit: 2_000 });
          const incidentStateValidation = applyIncidentStateRules(
            validation.value,
            history,
          );

          if (!incidentStateValidation.ok) {
            sendJson(res, 400, {
              error: {
                code: "invalid_response",
                message: incidentStateValidation.errors.join(" "),
              },
            });
            return;
          }

          const visitorStateValidation = applyVisitorStateRules(
            incidentStateValidation.value,
            history,
          );

          if (!visitorStateValidation.ok) {
            sendJson(res, 400, {
              error: {
                code: "invalid_response",
                message: visitorStateValidation.errors.join(" "),
              },
            });
            return;
          }

          if (visitorStateValidation.value.draft.formId === "production") {
            const references = await resolveProductionBrandReferencesForRequest({
              res,
              productionBrands,
              references: readProductionSubmissionBrandReferences(
                visitorStateValidation.value.draft.payload,
              ),
              logEvent: "production_brands.google_sheets_fetch_failed",
            });

            if (references === undefined) return;

            for (const reference of references) {
              visitorStateValidation.value.draft.payload[reference.fieldName] =
                reference.label;
            }
          }

          const submission: DispatcherSubmission = await runAuditedMutation({
            transaction: databaseTransaction,
            audit,
            mutate: () => dispatcherSubmissions.create(
              visitorStateValidation.value,
              readSubmittedByAccountId(req, access.profile, config),
            ),
            buildEvent: (result) => ({
              actor: buildAuditActor(access.profile),
              category: "form_submission",
              action: "form.submit",
              summary: `Отправлена форма «${result.formTitle}»`,
              details: buildDispatcherSubmissionAuditDetails(
                result.formId,
                result.payload,
              ),
              targetType: "dispatcher_submission",
              targetId: result.id,
            }),
          });

          await notifyDispatcherSubmission(
            submission,
            referenceDataSource,
            emailNotificationService,
            maxNotificationService,
          );

          sendJson(res, 201, { submission });
          return;
        }

        sendJson(res, 405, {
          error: {
            code: "access_denied",
            message: "Only GET and POST are supported for dispatcher submissions.",
          },
        });
        return;
      }

      sendJson(res, 404, {
        error: {
          code: "not_found",
          message: "Endpoint not found.",
        },
      });
    } catch (error) {
      console.error("api.request_error", error);
      sendJson(res, 500, {
        error: {
          code: "server_error",
          message: "Internal server error.",
        },
      });
    }
  });
}

async function handleBusinessOverviewRequest({
  req,
  res,
  config,
  devSessions,
  authService,
  dispatcherSubmissions,
  laboratoryResults,
  now,
}: {
  req: IncomingMessage;
  res: ServerResponse;
  config: ServerConfig;
  devSessions: Map<string, DevAccessSession>;
  authService: AuthSessionService | undefined;
  dispatcherSubmissions: DispatcherSubmissionsRepository;
  laboratoryResults: LaboratoryResultsRepository | undefined;
  now: () => Date;
}) {
  if (req.method !== "GET") {
    sendJson(res, 405, {
      error: {
        code: "access_denied",
        message: "Для обзора используется GET.",
      },
    });
    return;
  }

  const access = await requireCapability(req, res, {
    config,
    devSessions,
    authService,
    capability: "business.view_all_statistics",
    alternativeNavigationItem: "admin.account_preview",
  });
  if (access === undefined) return;

  if (laboratoryResults === undefined) {
    sendJson(res, 503, {
      error: {
        code: "server_error",
        message: "Хранилище лабораторных испытаний не настроено.",
      },
    });
    return;
  }

  const currentDate = now();
  const period = buildIncidentOverviewPeriod(currentDate);
  const [incidentSubmissions, laboratory] = await Promise.all([
    listAllIncidentSubmissions(dispatcherSubmissions),
    laboratoryResults.readOverviewSummary(period),
  ]);

  sendJson(res, 200, {
    period,
    incidents: buildIncidentOverviewSummary(
      incidentSubmissions,
      currentDate,
    ),
    laboratory,
    receivedAt: currentDate.toISOString(),
  });
}

async function handleBoardAssignmentsRequest({
  req,
  res,
  url,
  config,
  devSessions,
  authService,
  boardAssignments,
  boardAssignmentMaterials,
  audit,
  databaseTransaction,
  now,
}: {
  req: IncomingMessage;
  res: ServerResponse;
  url: URL;
  config: ServerConfig;
  devSessions: Map<string, DevAccessSession>;
  authService: AuthSessionService | undefined;
  boardAssignments: BoardAssignmentsRepository | undefined;
  boardAssignmentMaterials: BoardAssignmentMaterialsSource;
  audit: AuditRepository;
  databaseTransaction: DatabaseTransactionRunner;
  now: () => Date;
}) {
  const access = await requireCapability(req, res, {
    config,
    devSessions,
    authService,
    capability: "business.view_board_assignments",
    alternativeNavigationItem:
      req.method === "GET" ? "admin.account_preview" : undefined,
  });
  if (access === undefined) return;

  const permissions = getBoardAssignmentPermissions(access.profile);
  const materialMatch =
    /^\/api\/board-assignment-materials\/([a-zA-Z0-9-]{1,160})$/u.exec(
      url.pathname,
    );
  if (materialMatch !== null) {
    if (req.method !== "GET") {
      sendJson(res, 405, {
        error: {
          code: "access_denied",
          message: "Для дополнительного материала используется GET.",
        },
      });
      return;
    }

    const materialId = materialMatch[1];
    const storedDocument = materialId === undefined
      ? undefined
      : await boardAssignments?.readDocument(materialId);
    const storedMaterial = storedDocument?.storageKey === undefined
      ? undefined
      : await boardAssignmentMaterials.read(storedDocument.storageKey);
    const legacyMaterial =
      storedDocument === undefined && materialId !== undefined
        ? await boardAssignmentMaterials.read(materialId)
        : undefined;
    const material = storedDocument?.pdf === undefined
      ? (storedMaterial ?? legacyMaterial)
      : {
          fileName: storedDocument.fileName,
          pdf: storedDocument.pdf,
        };
    if (material === undefined) {
      sendJson(res, 404, {
        error: {
          code: "not_found",
          message: "Дополнительный материал не найден.",
        },
      });
      return;
    }

    sendPdf(res, material.pdf, material.fileName);
    return;
  }

  if (boardAssignments === undefined) {
    sendJson(res, 503, {
      error: {
        code: "server_error",
        message: "Хранилище поручений Совета директоров не настроено.",
      },
    });
    return;
  }

  const documentMatch =
    /^\/api\/board-assignments\/([a-zA-Z0-9-]{1,120})\/documents(?:\/([a-zA-Z0-9-]{1,160}))?$/u.exec(
      url.pathname,
    );
  if (documentMatch !== null) {
    if (!permissions.canCreate) {
      sendJson(res, 403, {
        error: {
          code: "access_denied",
          message: "Изменять документы поручения может член Совета директоров.",
        },
      });
      return;
    }

    const assignmentId = documentMatch[1];
    const documentId = documentMatch[2];
    if (assignmentId === undefined) {
      sendBoardAssignmentNotFound(res);
      return;
    }

    if (req.method === "POST" && documentId === undefined) {
      const fileName = readBoardAssignmentDocumentFileName(
        url.searchParams.get("fileName"),
      );
      if (fileName === undefined) {
        sendJson(res, 400, {
          error: {
            code: "invalid_response",
            message: "Выберите PDF-файл с корректным названием.",
          },
        });
        return;
      }
      if ((req.headers["content-type"] ?? "").split(";")[0]?.trim() !==
        "application/pdf") {
        sendJson(res, 400, {
          error: {
            code: "invalid_response",
            message: "Можно загружать только документы в формате PDF.",
          },
        });
        return;
      }

      let pdf: Buffer;
      try {
        pdf = await readBinaryBody(req, maxBoardAssignmentDocumentBytes);
      } catch (error) {
        if (error instanceof RequestBodyTooLargeError) {
          sendJson(res, 413, {
            error: {
              code: "invalid_response",
              message: "Размер одного PDF не должен превышать 10 МБ.",
            },
          });
          return;
        }
        throw error;
      }
      if (
        pdf.length < 5 ||
        pdf.subarray(0, 5).toString("ascii") !== "%PDF-"
      ) {
        sendJson(res, 400, {
          error: {
            code: "invalid_response",
            message: "Выбранный файл не является корректным PDF.",
          },
        });
        return;
      }

      const result = await runAuditedMutation({
        transaction: databaseTransaction,
        audit,
        mutate: () => boardAssignments.addDocument({
          assignmentId,
          fileName,
          pdf,
          actor: {
            userId: access.profile.userId,
            accountId: access.profile.activeAccess.accountId,
            displayName: access.profile.displayName,
          },
        }),
        buildEvent: (uploadResult) => uploadResult.kind === "saved"
          ? {
              actor: buildAuditActor(access.profile),
              category: "data_change",
              action: "board_assignment.document_upload",
              summary: `Добавлен документ поручения: ${uploadResult.document.fileName}`,
              details: [{
                label: "Документ",
                value: uploadResult.document.fileName,
              }],
              targetType: "board_assignment",
              targetId: assignmentId,
            }
          : undefined,
      });
      if (result.kind === "not_found") {
        sendBoardAssignmentNotFound(res);
        return;
      }
      if (result.kind === "immutable") {
        sendJson(res, 409, {
          error: {
            code: "invalid_response",
            message: "Документы завершённого поручения нельзя изменять.",
          },
        });
        return;
      }
      if (result.kind === "limit_reached") {
        sendJson(res, 409, {
          error: {
            code: "invalid_response",
            message: "К одному поручению можно прикрепить не более пяти документов.",
          },
        });
        return;
      }
      if (result.kind !== "saved") {
        sendJson(res, 500, {
          error: {
            code: "server_error",
            message: "Не удалось сохранить документ поручения.",
          },
        });
        return;
      }

      sendJson(res, 201, { document: result.document });
      return;
    }

    if (req.method === "DELETE" && documentId !== undefined) {
      const result = await runAuditedMutation({
        transaction: databaseTransaction,
        audit,
        mutate: () => boardAssignments.removeDocument({
          assignmentId,
          documentId,
        }),
        buildEvent: (removeResult) => removeResult.kind === "removed"
          ? {
              actor: buildAuditActor(access.profile),
              category: "data_change",
              action: "board_assignment.document_delete",
              summary: `Удалён документ поручения: ${removeResult.document.fileName}`,
              details: [{
                label: "Документ",
                value: removeResult.document.fileName,
              }],
              targetType: "board_assignment",
              targetId: assignmentId,
            }
          : undefined,
      });
      if (result.kind === "not_found") {
        sendJson(res, 404, {
          error: {
            code: "not_found",
            message: "Документ поручения не найден.",
          },
        });
        return;
      }
      if (result.kind === "immutable") {
        sendJson(res, 409, {
          error: {
            code: "invalid_response",
            message: "Документы завершённого поручения нельзя изменять.",
          },
        });
        return;
      }

      sendJson(res, 200, { ok: true });
      return;
    }

    sendJson(res, 405, {
      error: {
        code: "access_denied",
        message: "Для документов поручения используются POST и DELETE.",
      },
    });
    return;
  }

  if (url.pathname === "/api/board-assignment-completions") {
    if (req.method !== "GET") {
      sendJson(res, 405, {
        error: {
          code: "access_denied",
          message: "Для истории выполнений используется GET.",
        },
      });
      return;
    }

    const filters = readBoardAssignmentFilters(url);
    if (!filters.ok) {
      sendJson(res, 400, {
        error: {
          code: "invalid_response",
          message: filters.message,
        },
      });
      return;
    }
    const { status: _status, ...historyFilters } = filters.value;
    sendJson(res, 200, {
      completions: await boardAssignments.listCompletions(historyFilters),
      permissions,
    });
    return;
  }

  const completionMatch =
    /^\/api\/board-assignment-completions\/([a-zA-Z0-9-]{1,120})$/u.exec(
      url.pathname,
    );
  if (completionMatch !== null) {
    if (req.method !== "GET") {
      sendJson(res, 405, {
        error: {
          code: "access_denied",
          message: "Для снимка выполненного поручения используется GET.",
        },
      });
      return;
    }

    const completionId = completionMatch[1];
    const completion = completionId === undefined
      ? undefined
      : await boardAssignments.readCompletionById(completionId);
    if (completion === undefined) {
      sendBoardAssignmentNotFound(res);
      return;
    }

    sendJson(res, 200, { completion, permissions });
    return;
  }

  if (url.pathname === "/api/board-assignments") {
    if (req.method === "GET") {
      const filters = readBoardAssignmentFilters(url);
      if (!filters.ok) {
        sendJson(res, 400, {
          error: {
            code: "invalid_response",
            message: filters.message,
          },
        });
        return;
      }

      const today = buildIncidentOverviewPeriod(now()).today;
      sendJson(res, 200, {
        assignments: await boardAssignments.list(
          filters.value,
          permissions.canExecute ? { activeOn: today } : undefined,
        ),
        permissions,
      });
      return;
    }

    if (req.method === "POST") {
      if (!permissions.canCreate) {
        sendJson(res, 403, {
          error: {
            code: "access_denied",
            message: "Вносить поручения может только член Совета директоров.",
          },
        });
        return;
      }

      const validation = validateBoardAssignmentCreateRequest(
        await readJsonBody(req),
      );
      if (!validation.ok) {
        sendJson(res, 400, {
          error: {
            code: "invalid_response",
            message: validation.errors.join(" "),
          },
        });
        return;
      }

      const assignment = await runAuditedMutation({
        transaction: databaseTransaction,
        audit,
        mutate: () => boardAssignments.create({
          assignment: validation.value,
          actor: {
            userId: access.profile.userId,
            accountId: access.profile.activeAccess.accountId,
            displayName: access.profile.displayName,
          },
        }),
        buildEvent: (saved) => ({
          actor: buildAuditActor(access.profile),
          category: "data_change",
          action: "board_assignment.create",
          summary: `Создано поручение Совета директоров: ${saved.summary}`,
          details: [
            { label: "Дата заседания", value: saved.meetingDate },
            { label: "Протокол", value: saved.protocolNumber },
            { label: "Пункт решения", value: saved.decisionNumber },
            { label: "Срок исполнения", value: saved.dueDate },
          ],
          targetType: "board_assignment",
          targetId: saved.id,
        }),
      });
      sendJson(res, 201, { assignment, permissions });
      return;
    }

    sendJson(res, 405, {
      error: {
        code: "access_denied",
        message: "Для реестра поручений используются GET и POST.",
      },
    });
    return;
  }

  const actionMatch =
    /^\/api\/board-assignments\/([a-zA-Z0-9-]{1,120})\/action$/u.exec(
      url.pathname,
    );
  if (actionMatch !== null) {
    if (req.method !== "POST") {
      sendJson(res, 405, {
        error: {
          code: "access_denied",
          message: "Для изменения статуса поручения используется POST.",
        },
      });
      return;
    }
    if (!permissions.canExecute && !permissions.canReview) {
      sendJson(res, 403, {
        error: {
          code: "access_denied",
          message: "Изменение статуса поручения недоступно.",
        },
      });
      return;
    }

    const assignmentId = actionMatch[1];
    if (assignmentId === undefined) {
      sendBoardAssignmentNotFound(res);
      return;
    }
    const payload = await readJsonBody(req);

    try {
      const result = await databaseTransaction.run(async () => {
        const current = await boardAssignments.readByIdForUpdate(assignmentId);
        if (current === undefined) {
          return { kind: "not_found" as const };
        }

        const validation = validateBoardAssignmentAction(
          payload,
          current.status,
          permissions,
        );
        if (!validation.ok) {
          return {
            kind: "invalid" as const,
            message: validation.errors.join(" "),
          };
        }

        const today = buildIncidentOverviewPeriod(now()).today;
        if (
          validation.value.action === "submit_for_review" &&
          !isBoardAssignmentActiveOn(current, today)
        ) {
          return {
            kind: "invalid" as const,
            message: "Поручение пока не активно для исполнения.",
          };
        }
        const nextOccurrenceDate =
          validation.value.action === "complete"
            ? getNextBoardAssignmentOccurrenceDate({
                recurrence: current.recurrence,
                activeFrom: current.activeFrom,
                activeTo: current.activeTo,
                completedOn: today,
              })
            : undefined;
        const storedStatus = nextOccurrenceDate === undefined
          ? validation.value.status
          : "in_progress";
        const assignment = await boardAssignments.applyAction({
          assignmentId,
          expectedStatus: current.status,
          status: storedStatus,
          commentStatus: validation.value.status,
          currentOccurrenceDate:
            nextOccurrenceDate ?? current.currentOccurrenceDate,
          ...(validation.value.action === "complete"
            ? { completedOccurrenceDate: current.currentOccurrenceDate }
            : {}),
          comment: validation.value.comment,
          actor: {
            userId: access.profile.userId,
            accountId: access.profile.activeAccess.accountId,
            displayName: access.profile.displayName,
          },
        });
        await audit.record(buildBoardAssignmentActionAuditEvent({
          profile: access.profile,
          assignment,
          action: validation.value.action,
        }));
        return { kind: "saved" as const, assignment };
      });

      if (result.kind === "not_found") {
        sendBoardAssignmentNotFound(res);
        return;
      }
      if (result.kind === "invalid") {
        sendJson(res, 400, {
          error: {
            code: "invalid_response",
            message: result.message,
          },
        });
        return;
      }

      sendJson(res, 200, {
        assignment: result.assignment,
        permissions,
      });
      return;
    } catch (error) {
      if (error instanceof BoardAssignmentChangedError) {
        sendJson(res, 409, {
          error: {
            code: "invalid_response",
            message: error.message,
          },
        });
        return;
      }

      throw error;
    }
  }

  const detailMatch =
    /^\/api\/board-assignments\/([a-zA-Z0-9-]{1,120})$/u.exec(url.pathname);
  if (detailMatch !== null) {
    const assignmentId = detailMatch[1];
    if (assignmentId === undefined) {
      sendBoardAssignmentNotFound(res);
      return;
    }

    if (req.method === "PATCH") {
      if (!permissions.canCreate) {
        sendJson(res, 403, {
          error: {
            code: "access_denied",
            message: "Редактировать поручения может член Совета директоров.",
          },
        });
        return;
      }

      const validation = validateBoardAssignmentUpdateRequest(
        await readJsonBody(req),
      );
      if (!validation.ok) {
        sendJson(res, 400, {
          error: {
            code: "invalid_response",
            message: validation.errors.join(" "),
          },
        });
        return;
      }

      try {
        const result = await databaseTransaction.run(async () => {
          const current = await boardAssignments.readByIdForUpdate(assignmentId);
          if (current === undefined) {
            return { kind: "not_found" as const };
          }
          if (current.status === "completed") {
            return { kind: "completed" as const };
          }

          const currentOccurrenceDate =
            getBoardAssignmentOccurrenceOnOrAfter({
              recurrence: validation.value.recurrence,
              activeFrom: validation.value.activeFrom,
              activeTo: validation.value.activeTo,
              targetDate: current.currentOccurrenceDate,
            });
          if (currentOccurrenceDate === undefined) {
            return {
              kind: "invalid" as const,
              message:
                "Новый период не содержит текущего или будущего исполнения.",
            };
          }

          const {
            expectedUpdatedAt,
            ...assignmentUpdate
          } = validation.value;
          const assignment = await boardAssignments.update({
            assignmentId,
            expectedUpdatedAt,
            currentOccurrenceDate,
            current,
            assignment: assignmentUpdate,
            actor: {
              userId: access.profile.userId,
              accountId: access.profile.activeAccess.accountId,
              displayName: access.profile.displayName,
            },
          });
          await audit.record({
            actor: buildAuditActor(access.profile),
            category: "data_change",
            action: "board_assignment.update",
            summary: `Изменено поручение Совета директоров: ${assignment.summary}`,
            details: [
              { label: "Причина изменения", value: assignmentUpdate.comment },
              { label: "Протокол", value: assignment.protocolNumber },
              { label: "Пункт решения", value: assignment.decisionNumber },
              { label: "Срок исполнения", value: assignment.dueDate },
            ],
            targetType: "board_assignment",
            targetId: assignment.id,
          });
          return { kind: "saved" as const, assignment };
        });

        if (result.kind === "not_found") {
          sendBoardAssignmentNotFound(res);
          return;
        }
        if (result.kind === "completed") {
          sendJson(res, 409, {
            error: {
              code: "invalid_response",
              message: "Завершённое поручение нельзя редактировать.",
            },
          });
          return;
        }
        if (result.kind === "invalid") {
          sendJson(res, 400, {
            error: {
              code: "invalid_response",
              message: result.message,
            },
          });
          return;
        }

        sendJson(res, 200, { assignment: result.assignment, permissions });
        return;
      } catch (error) {
        if (error instanceof BoardAssignmentChangedError) {
          sendJson(res, 409, {
            error: {
              code: "invalid_response",
              message: error.message,
            },
          });
          return;
        }

        throw error;
      }
    }

    if (req.method !== "GET") {
      sendJson(res, 405, {
        error: {
          code: "access_denied",
          message: "Для карточки поручения используются GET и PATCH.",
        },
      });
      return;
    }

    const assignment = await boardAssignments.readById(assignmentId);
    const isVisibleToExecutor =
      assignment !== undefined &&
      (
        !permissions.canExecute ||
        isBoardAssignmentActiveOn(
          assignment,
          buildIncidentOverviewPeriod(now()).today,
        )
      );
    if (assignment === undefined || !isVisibleToExecutor) {
      sendBoardAssignmentNotFound(res);
      return;
    }

    sendJson(res, 200, { assignment, permissions });
    return;
  }

  sendBoardAssignmentNotFound(res);
}

function readBoardAssignmentFilters(url: URL):
  | { ok: true; value: BoardAssignmentFilters }
  | { ok: false; message: string } {
  const statusValue = readOptionalQueryParam(url, "status");
  const meetingDateFrom = readOptionalQueryParam(url, "meetingDateFrom");
  const meetingDateTo = readOptionalQueryParam(url, "meetingDateTo");
  const query = readOptionalQueryParam(url, "query");

  if (
    statusValue !== undefined &&
    !boardAssignmentStatuses.includes(statusValue as BoardAssignmentStatus)
  ) {
    return { ok: false, message: "Выбран неизвестный статус поручения." };
  }
  if (
    meetingDateFrom !== undefined &&
    !isCalendarDateQueryValue(meetingDateFrom)
  ) {
    return { ok: false, message: "Начальная дата заседания некорректна." };
  }
  if (
    meetingDateTo !== undefined &&
    !isCalendarDateQueryValue(meetingDateTo)
  ) {
    return { ok: false, message: "Конечная дата заседания некорректна." };
  }
  if (
    meetingDateFrom !== undefined &&
    meetingDateTo !== undefined &&
    meetingDateFrom > meetingDateTo
  ) {
    return {
      ok: false,
      message: "Начальная дата заседания не может быть позже конечной.",
    };
  }
  if (query !== undefined && query.length > 200) {
    return {
      ok: false,
      message: "Строка поиска не должна превышать 200 символов.",
    };
  }

  return {
    ok: true,
    value: {
      ...(statusValue === undefined
        ? {}
        : { status: statusValue as BoardAssignmentStatus }),
      ...(meetingDateFrom === undefined ? {} : { meetingDateFrom }),
      ...(meetingDateTo === undefined ? {} : { meetingDateTo }),
      ...(query === undefined ? {} : { query }),
    },
  };
}

function sendBoardAssignmentNotFound(res: ServerResponse) {
  sendJson(res, 404, {
    error: {
      code: "not_found",
      message: "Поручение Совета директоров не найдено.",
    },
  });
}

function buildBoardAssignmentActionAuditEvent({
  profile,
  assignment,
  action,
}: {
  profile: ServerUserProfile;
  assignment: Awaited<ReturnType<BoardAssignmentsRepository["applyAction"]>>;
  action: BoardAssignmentAction;
}): AuditEventDraft {
  const actionDetails = {
    submit_for_review: {
      action: "board_assignment.submit_for_review" as const,
      summary: "Поручение передано на проверку",
      result: "На проверке",
    },
    return_for_revision: {
      action: "board_assignment.return_for_revision" as const,
      summary: "Поручение возвращено на доработку",
      result: "На доработке",
    },
    complete: {
      action: "board_assignment.complete" as const,
      summary: "Поручение принято и завершено",
      result: "Завершено",
    },
  }[action];
  const hasNextOccurrence =
    action === "complete" && assignment.status === "in_progress";

  return {
    actor: buildAuditActor(profile),
    category: "data_change",
    action: actionDetails.action,
    summary: `${
      hasNextOccurrence
        ? "Исполнение поручения принято; назначен следующий повтор"
        : actionDetails.summary
    }: ${assignment.summary}`,
    details: [
      { label: "Результат", value: actionDetails.result },
      ...(hasNextOccurrence
        ? [{
            label: "Следующая дата исполнения",
            value: assignment.currentOccurrenceDate,
          }]
        : []),
      { label: "Протокол", value: assignment.protocolNumber },
      { label: "Пункт решения", value: assignment.decisionNumber },
    ],
    targetType: "board_assignment",
    targetId: assignment.id,
  };
}

async function handleLaboratoryRequest({
  req,
  res,
  url,
  config,
  devSessions,
  authService,
  laboratoryReferenceDataSource,
  laboratoryResults,
  laboratoryBankAssignments,
  rotaryKiln2FiringJournal,
  laboratorySampleRegistrationJournal,
  laboratoryChemicalAnalysisJournal,
  laboratoryUnshapedProductSampleJournal,
  laboratoryRawMaterialQualityJournal,
  laboratoryGreenProductQualityJournal,
  productionBrands,
  audit,
  databaseTransaction,
  now,
}: {
  req: IncomingMessage;
  res: ServerResponse;
  url: URL;
  config: ServerConfig;
  devSessions: Map<string, DevAccessSession>;
  authService: AuthSessionService | undefined;
  laboratoryReferenceDataSource: LaboratoryReferenceDataSource;
  laboratoryResults: LaboratoryResultsRepository | undefined;
  laboratoryBankAssignments: LaboratoryBankAssignmentsRepository | undefined;
  rotaryKiln2FiringJournal: RotaryKiln2FiringJournalRepository | undefined;
  laboratorySampleRegistrationJournal:
    | LaboratorySampleRegistrationJournalRepository
    | undefined;
  laboratoryChemicalAnalysisJournal:
    | LaboratoryChemicalAnalysisJournalRepository
    | undefined;
  laboratoryUnshapedProductSampleJournal:
    | LaboratoryUnshapedProductSampleJournalRepository
    | undefined;
  laboratoryRawMaterialQualityJournal:
    | LaboratoryRawMaterialQualityJournalRepository
    | undefined;
  laboratoryGreenProductQualityJournal:
    | LaboratoryGreenProductQualityJournalRepository
    | undefined;
  productionBrands: ProductionBrandsDataSource;
  audit: AuditRepository;
  databaseTransaction: DatabaseTransactionRunner;
  now: () => Date;
}) {
  const access = await requireAuthentication(req, res, {
    config,
    devSessions,
    authService,
  });

  if (access === undefined) return;

  const canManageLaboratory = hasProfileCapability(
    access.profile,
    "business.manage_laboratory_results",
  );
  const isLaboratoryReadRequest = req.method === "GET" && (
    url.pathname === "/api/laboratory/reference" ||
    url.pathname === "/api/laboratory/results" ||
    url.pathname === "/api/laboratory/rotary-kiln-2-journal" ||
    url.pathname === "/api/laboratory/sample-registration-journal" ||
    url.pathname === "/api/laboratory/chemical-analysis-journal" ||
    url.pathname === "/api/laboratory/unshaped-product-sample-journal" ||
    url.pathname === "/api/laboratory/raw-material-quality-journal" ||
    url.pathname === "/api/laboratory/green-product-quality-journal" ||
    url.pathname === laboratoryChemicalAnalysisProtocolPath ||
    laboratoryProtocolPathPattern.test(url.pathname)
  );
  const canReadLaboratory = canManageLaboratory ||
    (
      isLaboratoryReadRequest &&
      hasProfileCapability(access.profile, "business.view_laboratory_results")
    ) ||
    hasAccountPreviewReadAccess(req, access.profile);

  if (!canReadLaboratory) {
    sendJson(res, 403, {
      error: {
        code: "access_denied",
        message: "Результаты лабораторных испытаний недоступны.",
      },
    });
    return;
  }

  if (url.pathname === "/api/laboratory/reference") {
    if (req.method !== "GET") {
      sendJson(res, 405, {
        error: {
          code: "access_denied",
          message: "Для справочника лаборатории используется GET.",
        },
      });
      return;
    }

    const reference = await readLaboratoryReferenceForRequest(
      res,
      laboratoryReferenceDataSource,
    );
    if (reference !== undefined) sendJson(res, 200, { reference });
    return;
  }

  if (url.pathname === "/api/laboratory/rotary-kiln-2-draft") {
    if (!canManageLaboratory) {
      sendJson(res, 403, {
        error: {
          code: "access_denied",
          message: "Заготовка доступна только для заполнения журнала.",
        },
      });
      return;
    }
    if (req.method !== "GET") {
      sendJson(res, 405, {
        error: {
          code: "access_denied",
          message: "Для заготовки журнала используется GET.",
        },
      });
      return;
    }
    if (rotaryKiln2FiringJournal === undefined) {
      sendJson(res, 503, {
        error: {
          code: "server_error",
          message: "Хранилище журнала вращающейся печи 2 не настроено.",
        },
      });
      return;
    }

    sendJson(res, 200, {
      previousRecord:
        await rotaryKiln2FiringJournal.findLatestCreated() ?? null,
    });
    return;
  }

  if (url.pathname === "/api/laboratory/rotary-kiln-2-personnel-options") {
    if (!canManageLaboratory) {
      sendJson(res, 403, {
        error: {
          code: "access_denied",
          message: "Список сотрудников доступен только для заполнения журнала.",
        },
      });
      return;
    }
    if (req.method !== "GET") {
      sendJson(res, 405, {
        error: {
          code: "access_denied",
          message: "Для списка сотрудников используется GET.",
        },
      });
      return;
    }
    if (rotaryKiln2FiringJournal === undefined) {
      sendJson(res, 503, {
        error: {
          code: "server_error",
          message: "Хранилище журнала вращающейся печи 2 не настроено.",
        },
      });
      return;
    }

    sendJson(
      res,
      200,
      await rotaryKiln2FiringJournal.listPersonnelOptions(),
    );
    return;
  }

  const rotaryKiln2FiringRecordMatch =
    rotaryKiln2FiringRecordPathPattern.exec(url.pathname);
  if (rotaryKiln2FiringRecordMatch !== null) {
    if (!canManageLaboratory) {
      sendJson(res, 403, {
        error: {
          code: "access_denied",
          message: "Исправление записи журнала вращающейся печи 2 недоступно.",
        },
      });
      return;
    }
    if (req.method !== "PATCH") {
      sendJson(res, 405, {
        error: {
          code: "access_denied",
          message: "Для исправления записи журнала используется PATCH.",
        },
      });
      return;
    }
    if (rotaryKiln2FiringJournal === undefined) {
      sendJson(res, 503, {
        error: {
          code: "server_error",
          message: "Хранилище журнала вращающейся печи 2 не настроено.",
        },
      });
      return;
    }

    const validation = validateRotaryKiln2FiringJournalSubmission(
      await readJsonBody(req),
    );
    if (!validation.ok) {
      sendJson(res, 400, {
        error: {
          code: "invalid_response",
          message: validation.errors.join(" "),
        },
      });
      return;
    }

    const materialReferences = await resolveProductionBrandReferencesForRequest({
      res,
      productionBrands,
      references: [{
        fieldName: "producedMaterial",
        label: validation.value.producedMaterial,
      }],
      logEvent: "rotary_kiln_2_correction_brands.google_sheets_fetch_failed",
    });
    if (materialReferences === undefined) return;
    validation.value.producedMaterial = materialReferences[0]?.label ??
      validation.value.producedMaterial;

    const recordId = rotaryKiln2FiringRecordMatch[1];
    const correction = await runAuditedMutation({
      transaction: databaseTransaction,
      audit,
      mutate: () => rotaryKiln2FiringJournal.update({
        id: recordId,
        record: validation.value,
        correctedByUserId: access.profile.userId,
        correctedByAccountId: access.profile.activeAccess.accountId,
        correctedByDisplayName: access.profile.displayName,
      }),
      buildEvent: (result) => result === undefined
        ? undefined
        : {
            actor: buildAuditActor(access.profile),
            category: "data_change",
            action: "rotary_kiln_2_firing_record.correct",
            summary: "Исправлена запись журнала вращающейся печи 2",
            details: [
              {
                label: "Дата и время",
                value:
                  `${result.before.recordDate} ${result.before.recordTime} → ${result.record.recordDate} ${result.record.recordTime}`,
              },
              {
                label: "Производимый материал",
                value:
                  `${result.before.producedMaterial ?? "—"} → ${result.record.producedMaterial ?? "—"}`,
              },
              {
                label: "Насыпной вес",
                value:
                  `${result.before.bulkDensity} → ${result.record.bulkDensity}`,
              },
            ],
            targetType: "rotary_kiln_2_firing_record",
            targetId: result.record.id,
          },
    });
    if (correction === undefined) {
      sendJson(res, 404, {
        error: {
          code: "not_found",
          message: "Запись журнала вращающейся печи 2 не найдена.",
        },
      });
      return;
    }

    sendJson(res, 200, { record: correction.record });
    return;
  }

  if (url.pathname === "/api/laboratory/rotary-kiln-2-journal") {
    if (rotaryKiln2FiringJournal === undefined) {
      sendJson(res, 503, {
        error: {
          code: "server_error",
          message: "Хранилище журнала вращающейся печи 2 не настроено.",
        },
      });
      return;
    }

    if (req.method === "GET") {
      const dateFrom = readOptionalQueryParam(url, "dateFrom");
      const dateTo = readOptionalQueryParam(url, "dateTo");
      const query = readOptionalQueryParam(url, "query");

      if (
        (dateFrom !== undefined && !isCalendarDateQueryValue(dateFrom)) ||
        (dateTo !== undefined && !isCalendarDateQueryValue(dateTo)) ||
        (dateFrom !== undefined && dateTo !== undefined && dateFrom > dateTo) ||
        (query !== undefined && query.length > 120)
      ) {
        sendJson(res, 400, {
          error: {
            code: "invalid_response",
            message: "Проверьте фильтры журнала вращающейся печи 2.",
          },
        });
        return;
      }

      sendJson(res, 200, await rotaryKiln2FiringJournal.list({
        ...(dateFrom === undefined ? {} : { dateFrom }),
        ...(dateTo === undefined ? {} : { dateTo }),
        ...(query === undefined ? {} : { query }),
      }));
      return;
    }

    if (req.method !== "POST") {
      sendJson(res, 405, {
        error: {
          code: "access_denied",
          message: "Для журнала используются GET и POST.",
        },
      });
      return;
    }

    const validation = validateRotaryKiln2FiringJournalSubmission(
      await readJsonBody(req),
    );
    if (!validation.ok) {
      sendJson(res, 400, {
        error: {
          code: "invalid_response",
          message: validation.errors.join(" "),
        },
      });
      return;
    }

    const materialReferences = await resolveProductionBrandReferencesForRequest({
      res,
      productionBrands,
      references: [{
        fieldName: "producedMaterial",
        label: validation.value.producedMaterial,
      }],
      logEvent: "rotary_kiln_2_brands.google_sheets_fetch_failed",
    });
    if (materialReferences === undefined) return;
    validation.value.producedMaterial = materialReferences[0]?.label ??
      validation.value.producedMaterial;

    const saved = await runAuditedMutation({
      transaction: databaseTransaction,
      audit,
      mutate: () => rotaryKiln2FiringJournal.create({
        record: validation.value,
        submittedByUserId: access.profile.userId,
        submittedByAccountId: access.profile.activeAccess.accountId,
      }),
      buildEvent: (record) => ({
        actor: buildAuditActor(access.profile),
        category: "form_submission",
        action: "rotary_kiln_2_firing_record.submit",
        summary: "Добавлена запись журнала вращающейся печи 2",
        details: [
          { label: "Дата", value: record.recordDate },
          { label: "Время", value: record.recordTime },
          {
            label: "Производимый материал",
            value: record.producedMaterial ?? "",
          },
          { label: "Мастер смены", value: record.shiftSupervisor },
          { label: "Обжигальщик", value: record.burnerOperator },
          { label: "Лаборант", value: record.laboratoryAssistant },
          { label: "Насыпной вес", value: String(record.bulkDensity) },
        ],
        targetType: "rotary_kiln_2_firing_record",
        targetId: record.id,
      }),
    });

    sendJson(res, 201, { record: saved });
    return;
  }

  if (url.pathname === "/api/laboratory/sample-registration-draft") {
    if (!canManageLaboratory) {
      sendJson(res, 403, {
        error: {
          code: "access_denied",
          message: "Заготовка номера доступна только для заполнения журнала.",
        },
      });
      return;
    }
    if (req.method !== "GET") {
      sendJson(res, 405, {
        error: {
          code: "access_denied",
          message: "Для заготовки номера используется GET.",
        },
      });
      return;
    }
    if (laboratorySampleRegistrationJournal === undefined) {
      sendJson(res, 503, {
        error: {
          code: "server_error",
          message: "Хранилище журнала регистрации отбора проб не настроено.",
        },
      });
      return;
    }

    const sampleNumber =
      await laboratorySampleRegistrationJournal.getNextSampleNumber();
    sendJson(res, 200, {
      sampleNumber,
      laboratorySampleCode: buildLaboratorySampleCodeDraft(sampleNumber),
    });
    return;
  }

  if (url.pathname === "/api/laboratory/sample-registration-locations") {
    if (!canManageLaboratory) {
      sendJson(res, 403, {
        error: {
          code: "access_denied",
          message: "Список мест отбора доступен только для заполнения журнала.",
        },
      });
      return;
    }
    if (req.method !== "GET") {
      sendJson(res, 405, {
        error: {
          code: "access_denied",
          message: "Для списка мест отбора используется GET.",
        },
      });
      return;
    }
    if (laboratorySampleRegistrationJournal === undefined) {
      sendJson(res, 503, {
        error: {
          code: "server_error",
          message: "Хранилище журнала регистрации отбора проб не настроено.",
        },
      });
      return;
    }

    sendJson(res, 200, {
      samplingLocations:
        await laboratorySampleRegistrationJournal.listSamplingLocations(),
    });
    return;
  }

  const sampleRegistrationRecordMatch =
    laboratorySampleRegistrationRecordPathPattern.exec(url.pathname);
  if (sampleRegistrationRecordMatch !== null) {
    if (!canManageLaboratory) {
      sendJson(res, 403, {
        error: {
          code: "access_denied",
          message: "Исправление зарегистрированной пробы недоступно.",
        },
      });
      return;
    }
    if (req.method !== "PATCH") {
      sendJson(res, 405, {
        error: {
          code: "access_denied",
          message: "Для исправления зарегистрированной пробы используется PATCH.",
        },
      });
      return;
    }
    if (laboratorySampleRegistrationJournal === undefined) {
      sendJson(res, 503, {
        error: {
          code: "server_error",
          message: "Хранилище журнала регистрации отбора проб не настроено.",
        },
      });
      return;
    }

    const validation = validateLaboratorySampleRegistrationCorrection(
      await readJsonBody(req),
    );
    if (!validation.ok) {
      sendJson(res, 400, {
        error: {
          code: "invalid_response",
          message: validation.errors.join(" "),
        },
      });
      return;
    }

    const recordId = sampleRegistrationRecordMatch[1];
    const correction = await runAuditedMutation({
      transaction: databaseTransaction,
      audit,
      mutate: () => laboratorySampleRegistrationJournal.update({
        id: recordId,
        record: validation.value,
        correctedByUserId: access.profile.userId,
        correctedByAccountId: access.profile.activeAccess.accountId,
        correctedByDisplayName: access.profile.displayName,
      }),
      buildEvent: (result) => result === undefined
        ? undefined
        : {
            actor: buildAuditActor(access.profile),
            category: "data_change",
            action: "laboratory_sample_registration.correct",
            summary: "Исправлена зарегистрированная проба",
            details: [
              {
                label: "№ пробы",
                value: `${result.before.sampleNumber} → ${result.record.sampleNumber}`,
              },
              {
                label: "Код лабораторной пробы",
                value:
                  `${result.before.laboratorySampleCode} → ${result.record.laboratorySampleCode}`,
              },
              {
                label: "Наименование пробы",
                value: `${result.before.sampleName} → ${result.record.sampleName}`,
              },
              {
                label: "Водопоглощение",
                value:
                  `${result.before.waterAbsorption ?? "—"} → ${result.record.waterAbsorption ?? "—"}`,
              },
            ],
            targetType: "laboratory_sample_registration",
            targetId: result.record.id,
          },
    });
    if (correction === undefined) {
      sendJson(res, 404, {
        error: {
          code: "not_found",
          message: "Зарегистрированная проба не найдена.",
        },
      });
      return;
    }

    sendJson(res, 200, { record: correction.record });
    return;
  }

  if (url.pathname === "/api/laboratory/sample-registration-journal") {
    if (laboratorySampleRegistrationJournal === undefined) {
      sendJson(res, 503, {
        error: {
          code: "server_error",
          message: "Хранилище журнала регистрации отбора проб не настроено.",
        },
      });
      return;
    }

    if (req.method === "GET") {
      const dateFrom = readOptionalQueryParam(url, "dateFrom");
      const dateTo = readOptionalQueryParam(url, "dateTo");
      const query = readOptionalQueryParam(url, "query");
      const nameQuery = readOptionalQueryParam(url, "name");

      if (
        (dateFrom !== undefined && !isCalendarDateQueryValue(dateFrom)) ||
        (dateTo !== undefined && !isCalendarDateQueryValue(dateTo)) ||
        (dateFrom !== undefined && dateTo !== undefined && dateFrom > dateTo) ||
        (query !== undefined && query.length > 120) ||
        (nameQuery !== undefined && nameQuery.length > 120)
      ) {
        sendJson(res, 400, {
          error: {
            code: "invalid_response",
            message: "Проверьте фильтры журнала регистрации отбора проб.",
          },
        });
        return;
      }

      sendJson(res, 200, {
        records: await laboratorySampleRegistrationJournal.list({
          ...(dateFrom === undefined ? {} : { dateFrom }),
          ...(dateTo === undefined ? {} : { dateTo }),
          ...(query === undefined ? {} : { query }),
          ...(nameQuery === undefined ? {} : { nameQuery }),
        }),
      });
      return;
    }

    if (req.method !== "POST") {
      sendJson(res, 405, {
        error: {
          code: "access_denied",
          message: "Для журнала используются GET и POST.",
        },
      });
      return;
    }

    const validation = validateLaboratorySampleRegistrationJournalSubmission(
      await readJsonBody(req),
    );
    if (!validation.ok) {
      sendJson(res, 400, {
        error: {
          code: "invalid_response",
          message: validation.errors.join(" "),
        },
      });
      return;
    }

    const saved = await runAuditedMutation({
      transaction: databaseTransaction,
      audit,
      mutate: () => laboratorySampleRegistrationJournal.create({
        record: validation.value,
        submittedByUserId: access.profile.userId,
        submittedByAccountId: access.profile.activeAccess.accountId,
      }),
      buildEvent: (record) => ({
        actor: buildAuditActor(access.profile),
        category: "form_submission",
        action: "laboratory_sample_registration.submit",
        summary: "Добавлена запись журнала регистрации отбора проб",
        details: [
          { label: "№ пробы", value: record.sampleNumber },
          {
            label: "Код лабораторной пробы",
            value: record.laboratorySampleCode,
          },
          { label: "Дата отбора", value: record.samplingDate },
          { label: "Наименование пробы", value: record.sampleName },
          { label: "Место отбора пробы", value: record.samplingLocation },
          {
            label: "Водопоглощение",
            value: record.waterAbsorption ?? "—",
          },
        ],
        targetType: "laboratory_sample_registration",
        targetId: record.id,
      }),
    });

    sendJson(res, 201, { record: saved });
    return;
  }

  if (url.pathname === "/api/laboratory/raw-material-quality-draft") {
    if (!canManageLaboratory) {
      sendJson(res, 403, {
        error: {
          code: "access_denied",
          message: "Заготовка доступна только для заполнения журнала.",
        },
      });
      return;
    }
    if (req.method !== "GET") {
      sendJson(res, 405, {
        error: {
          code: "access_denied",
          message: "Для заготовки журнала используется GET.",
        },
      });
      return;
    }
    if (laboratoryRawMaterialQualityJournal === undefined) {
      sendJson(res, 503, {
        error: {
          code: "server_error",
          message: "Хранилище журнала качества сырья не настроено.",
        },
      });
      return;
    }

    sendJson(res, 200, { recordDate: formatMoscowCalendarDate(now()) });
    return;
  }

  if (url.pathname === "/api/laboratory/raw-material-quality-options") {
    if (!canManageLaboratory) {
      sendJson(res, 403, {
        error: {
          code: "access_denied",
          message: "Списки доступны только для заполнения журнала.",
        },
      });
      return;
    }
    if (req.method !== "GET") {
      sendJson(res, 405, {
        error: {
          code: "access_denied",
          message: "Для списков журнала используется GET.",
        },
      });
      return;
    }
    if (laboratoryRawMaterialQualityJournal === undefined) {
      sendJson(res, 503, {
        error: {
          code: "server_error",
          message: "Хранилище журнала качества сырья не настроено.",
        },
      });
      return;
    }

    sendJson(res, 200, {
      options: await laboratoryRawMaterialQualityJournal.listOptions(),
    });
    return;
  }

  const rawMaterialQualityRecordMatch =
    laboratoryRawMaterialQualityRecordPathPattern.exec(url.pathname);
  if (rawMaterialQualityRecordMatch !== null) {
    if (!canManageLaboratory) {
      sendJson(res, 403, {
        error: {
          code: "access_denied",
          message: "Исправление записи журнала качества сырья недоступно.",
        },
      });
      return;
    }
    if (req.method !== "PATCH") {
      sendJson(res, 405, {
        error: {
          code: "access_denied",
          message: "Для исправления записи используется PATCH.",
        },
      });
      return;
    }
    if (laboratoryRawMaterialQualityJournal === undefined) {
      sendJson(res, 503, {
        error: {
          code: "server_error",
          message: "Хранилище журнала качества сырья не настроено.",
        },
      });
      return;
    }

    const validation = validateLaboratoryRawMaterialQualitySubmission(
      await readJsonBody(req),
    );
    if (!validation.ok) {
      sendJson(res, 400, {
        error: {
          code: "invalid_response",
          message: validation.errors.join(" "),
        },
      });
      return;
    }

    const recordId = rawMaterialQualityRecordMatch[1];
    const correction = await runAuditedMutation({
      transaction: databaseTransaction,
      audit,
      mutate: () => laboratoryRawMaterialQualityJournal.update({
        id: recordId,
        record: validation.value,
        correctedByUserId: access.profile.userId,
        correctedByAccountId: access.profile.activeAccess.accountId,
        correctedByDisplayName: access.profile.displayName,
      }),
      buildEvent: (result) => result === undefined
        ? undefined
        : {
            actor: buildAuditActor(access.profile),
            category: "data_change",
            action: "laboratory_raw_material_quality.correct",
            summary: "Исправлена запись журнала качества сырья",
            details: laboratoryRawMaterialQualityFields.map((field) => ({
              label: field.label,
              value:
                `${formatLaboratoryRawMaterialQualityAuditValue(result.before, field.id)} → ${formatLaboratoryRawMaterialQualityAuditValue(result.record, field.id)}`,
            })),
            targetType: "laboratory_raw_material_quality",
            targetId: result.record.id,
          },
    });
    if (correction === undefined) {
      sendJson(res, 404, {
        error: {
          code: "not_found",
          message: "Запись журнала качества сырья не найдена.",
        },
      });
      return;
    }

    sendJson(res, 200, { record: correction.record });
    return;
  }

  if (url.pathname === "/api/laboratory/raw-material-quality-journal") {
    if (laboratoryRawMaterialQualityJournal === undefined) {
      sendJson(res, 503, {
        error: {
          code: "server_error",
          message: "Хранилище журнала качества сырья не настроено.",
        },
      });
      return;
    }

    if (req.method === "GET") {
      const dateFrom = readOptionalQueryParam(url, "dateFrom");
      const dateTo = readOptionalQueryParam(url, "dateTo");
      const query = readOptionalQueryParam(url, "query");
      const nameQuery = readOptionalQueryParam(url, "name");

      if (
        (dateFrom !== undefined && !isCalendarDateQueryValue(dateFrom)) ||
        (dateTo !== undefined && !isCalendarDateQueryValue(dateTo)) ||
        (dateFrom !== undefined && dateTo !== undefined && dateFrom > dateTo) ||
        (query !== undefined && query.length > 120) ||
        (nameQuery !== undefined && nameQuery.length > 120)
      ) {
        sendJson(res, 400, {
          error: {
            code: "invalid_response",
            message: "Проверьте фильтры журнала качества сырья.",
          },
        });
        return;
      }

      sendJson(res, 200, {
        records: await laboratoryRawMaterialQualityJournal.list({
          ...(dateFrom === undefined ? {} : { dateFrom }),
          ...(dateTo === undefined ? {} : { dateTo }),
          ...(query === undefined ? {} : { query }),
          ...(nameQuery === undefined ? {} : { nameQuery }),
        }),
      });
      return;
    }

    if (req.method !== "POST") {
      sendJson(res, 405, {
        error: {
          code: "access_denied",
          message: "Для журнала используются GET и POST.",
        },
      });
      return;
    }

    const validation = validateLaboratoryRawMaterialQualitySubmission(
      await readJsonBody(req),
    );
    if (!validation.ok) {
      sendJson(res, 400, {
        error: {
          code: "invalid_response",
          message: validation.errors.join(" "),
        },
      });
      return;
    }

    const saved = await runAuditedMutation({
      transaction: databaseTransaction,
      audit,
      mutate: () => laboratoryRawMaterialQualityJournal.create({
        record: validation.value,
        submittedByUserId: access.profile.userId,
        submittedByAccountId: access.profile.activeAccess.accountId,
      }),
      buildEvent: (record) => ({
        actor: buildAuditActor(access.profile),
        category: "form_submission",
        action: "laboratory_raw_material_quality.submit",
        summary: "Добавлена запись журнала качества сырья",
        details: laboratoryRawMaterialQualityFields.map((field) => ({
          label: field.label,
          value: formatLaboratoryRawMaterialQualityAuditValue(record, field.id),
        })),
        targetType: "laboratory_raw_material_quality",
        targetId: record.id,
      }),
    });

    sendJson(res, 201, { record: saved });
    return;
  }

  if (url.pathname === "/api/laboratory/green-product-quality-draft") {
    if (!canManageLaboratory) {
      sendJson(res, 403, {
        error: {
          code: "access_denied",
          message: "Заготовка доступна только для заполнения журнала.",
        },
      });
      return;
    }
    if (req.method !== "GET") {
      sendJson(res, 405, {
        error: {
          code: "access_denied",
          message: "Для заготовки журнала используется GET.",
        },
      });
      return;
    }
    if (laboratoryGreenProductQualityJournal === undefined) {
      sendJson(res, 503, {
        error: {
          code: "server_error",
          message: "Хранилище журнала качества сырцовой продукции не настроено.",
        },
      });
      return;
    }

    sendJson(res, 200, { recordDate: formatMoscowCalendarDate(now()) });
    return;
  }

  if (url.pathname === "/api/laboratory/green-product-quality-options") {
    if (!canManageLaboratory) {
      sendJson(res, 403, {
        error: {
          code: "access_denied",
          message: "Списки доступны только для заполнения журнала.",
        },
      });
      return;
    }
    if (req.method !== "GET") {
      sendJson(res, 405, {
        error: {
          code: "access_denied",
          message: "Для списков журнала используется GET.",
        },
      });
      return;
    }
    if (laboratoryGreenProductQualityJournal === undefined) {
      sendJson(res, 503, {
        error: {
          code: "server_error",
          message: "Хранилище журнала качества сырцовой продукции не настроено.",
        },
      });
      return;
    }

    sendJson(res, 200, {
      options: await laboratoryGreenProductQualityJournal.listOptions(),
    });
    return;
  }

  const greenProductQualityRecordMatch =
    laboratoryGreenProductQualityRecordPathPattern.exec(url.pathname);
  if (greenProductQualityRecordMatch !== null) {
    if (!canManageLaboratory) {
      sendJson(res, 403, {
        error: {
          code: "access_denied",
          message: "Исправление записи журнала качества сырцовой продукции недоступно.",
        },
      });
      return;
    }
    if (req.method !== "PATCH") {
      sendJson(res, 405, {
        error: {
          code: "access_denied",
          message: "Для исправления записи используется PATCH.",
        },
      });
      return;
    }
    if (laboratoryGreenProductQualityJournal === undefined) {
      sendJson(res, 503, {
        error: {
          code: "server_error",
          message: "Хранилище журнала качества сырцовой продукции не настроено.",
        },
      });
      return;
    }

    const validation = validateLaboratoryGreenProductQualitySubmission(
      await readJsonBody(req),
    );
    if (!validation.ok) {
      sendJson(res, 400, {
        error: {
          code: "invalid_response",
          message: validation.errors.join(" "),
        },
      });
      return;
    }
    const canonicalRecord = await resolveLaboratoryGreenProductQualityBrand({
      res,
      productionBrands,
      record: validation.value,
    });
    if (canonicalRecord === undefined) return;

    try {
      const recordId = greenProductQualityRecordMatch[1];
      const correction = await runAuditedMutation({
        transaction: databaseTransaction,
        audit,
        mutate: () => laboratoryGreenProductQualityJournal.update({
          id: recordId,
          record: canonicalRecord,
          correctedByUserId: access.profile.userId,
          correctedByAccountId: access.profile.activeAccess.accountId,
          correctedByDisplayName: access.profile.displayName,
        }),
        buildEvent: (result) => result === undefined
          ? undefined
          : {
              actor: buildAuditActor(access.profile),
              category: "data_change",
              action: "laboratory_green_product_quality.correct",
              summary: "Исправлена запись журнала качества сырцовой продукции",
              details: laboratoryGreenProductQualityFields.map((field) => ({
                label: field.label,
                value:
                  `${formatLaboratoryGreenProductQualityAuditValue(result.before, field.id)} → ${formatLaboratoryGreenProductQualityAuditValue(result.record, field.id)}`,
              })),
              targetType: "laboratory_green_product_quality",
              targetId: result.record.id,
            },
      });
      if (correction === undefined) {
        sendJson(res, 404, {
          error: {
            code: "not_found",
            message: "Запись журнала качества сырцовой продукции не найдена.",
          },
        });
        return;
      }

      sendJson(res, 200, { record: correction.record });
    } catch (error) {
      if (sendLaboratoryGreenProductQualityWagonError(res, error)) return;
      throw error;
    }
    return;
  }

  if (url.pathname === "/api/laboratory/green-product-quality-journal") {
    if (laboratoryGreenProductQualityJournal === undefined) {
      sendJson(res, 503, {
        error: {
          code: "server_error",
          message: "Хранилище журнала качества сырцовой продукции не настроено.",
        },
      });
      return;
    }

    if (req.method === "GET") {
      const dateFrom = readOptionalQueryParam(url, "dateFrom");
      const dateTo = readOptionalQueryParam(url, "dateTo");
      const query = readOptionalQueryParam(url, "query");
      const nameQuery = readOptionalQueryParam(url, "name");
      if (
        (dateFrom !== undefined && !isCalendarDateQueryValue(dateFrom)) ||
        (dateTo !== undefined && !isCalendarDateQueryValue(dateTo)) ||
        (dateFrom !== undefined && dateTo !== undefined && dateFrom > dateTo) ||
        (query !== undefined && query.length > 120) ||
        (nameQuery !== undefined && nameQuery.length > 120)
      ) {
        sendJson(res, 400, {
          error: {
            code: "invalid_response",
            message: "Проверьте фильтры журнала качества сырцовой продукции.",
          },
        });
        return;
      }

      sendJson(res, 200, {
        records: await laboratoryGreenProductQualityJournal.list({
          ...(dateFrom === undefined ? {} : { dateFrom }),
          ...(dateTo === undefined ? {} : { dateTo }),
          ...(query === undefined ? {} : { query }),
          ...(nameQuery === undefined ? {} : { nameQuery }),
        }),
      });
      return;
    }

    if (req.method !== "POST") {
      sendJson(res, 405, {
        error: {
          code: "access_denied",
          message: "Для журнала используются GET и POST.",
        },
      });
      return;
    }

    const validation = validateLaboratoryGreenProductQualitySubmission(
      await readJsonBody(req),
    );
    if (!validation.ok) {
      sendJson(res, 400, {
        error: {
          code: "invalid_response",
          message: validation.errors.join(" "),
        },
      });
      return;
    }
    const canonicalRecord = await resolveLaboratoryGreenProductQualityBrand({
      res,
      productionBrands,
      record: validation.value,
    });
    if (canonicalRecord === undefined) return;

    try {
      const saved = await runAuditedMutation({
        transaction: databaseTransaction,
        audit,
        mutate: () => laboratoryGreenProductQualityJournal.create({
          record: canonicalRecord,
          submittedByUserId: access.profile.userId,
          submittedByAccountId: access.profile.activeAccess.accountId,
        }),
        buildEvent: (record) => ({
          actor: buildAuditActor(access.profile),
          category: "form_submission",
          action: "laboratory_green_product_quality.submit",
          summary: "Добавлена запись журнала качества сырцовой продукции",
          details: laboratoryGreenProductQualityFields.map((field) => ({
            label: field.label,
            value: formatLaboratoryGreenProductQualityAuditValue(record, field.id),
          })),
          targetType: "laboratory_green_product_quality",
          targetId: record.id,
        }),
      });

      sendJson(res, 201, { record: saved });
    } catch (error) {
      if (sendLaboratoryGreenProductQualityWagonError(res, error)) return;
      throw error;
    }
    return;
  }

  if (url.pathname === "/api/laboratory/unshaped-product-sample-draft") {
    if (!canManageLaboratory) {
      sendJson(res, 403, {
        error: {
          code: "access_denied",
          message: "Заготовка доступна только для заполнения журнала.",
        },
      });
      return;
    }
    if (req.method !== "GET") {
      sendJson(res, 405, {
        error: {
          code: "access_denied",
          message: "Для заготовки журнала используется GET.",
        },
      });
      return;
    }
    if (laboratoryUnshapedProductSampleJournal === undefined) {
      sendJson(res, 503, {
        error: {
          code: "server_error",
          message: "Хранилище журнала проб неформованной продукции не настроено.",
        },
      });
      return;
    }

    const [sampleNumber, sampledBy] = await Promise.all([
      laboratoryUnshapedProductSampleJournal.getNextSampleNumber(),
      laboratoryUnshapedProductSampleJournal.getLastSampledBy(),
    ]);
    sendJson(res, 200, {
      sampleNumber,
      sampleCode: buildLaboratoryUnshapedProductSampleCodeDraft(sampleNumber),
      sampleDate: formatMoscowCalendarDate(now()),
      sampledBy,
    });
    return;
  }

  const unshapedProductSampleRecordMatch =
    laboratoryUnshapedProductSampleRecordPathPattern.exec(url.pathname);
  if (unshapedProductSampleRecordMatch !== null) {
    if (!canManageLaboratory) {
      sendJson(res, 403, {
        error: {
          code: "access_denied",
          message: "Исправление пробы неформованной продукции недоступно.",
        },
      });
      return;
    }
    if (req.method !== "PATCH") {
      sendJson(res, 405, {
        error: {
          code: "access_denied",
          message: "Для исправления пробы используется PATCH.",
        },
      });
      return;
    }
    if (laboratoryUnshapedProductSampleJournal === undefined) {
      sendJson(res, 503, {
        error: {
          code: "server_error",
          message: "Хранилище журнала проб неформованной продукции не настроено.",
        },
      });
      return;
    }

    const validation = validateLaboratoryUnshapedProductSampleCorrection(
      await readJsonBody(req),
    );
    if (!validation.ok) {
      sendJson(res, 400, {
        error: {
          code: "invalid_response",
          message: validation.errors.join(" "),
        },
      });
      return;
    }

    const productReferences = await resolveProductionBrandReferencesForRequest({
      res,
      productionBrands,
      references: [{
        fieldName: "productName",
        label: validation.value.productName,
      }],
      logEvent: "unshaped_product_sample_correction_brands.google_sheets_fetch_failed",
    });
    if (productReferences === undefined) return;
    validation.value.productName = productReferences[0]?.label ??
      validation.value.productName;

    const recordId = unshapedProductSampleRecordMatch[1];
    const correction = await runAuditedMutation({
      transaction: databaseTransaction,
      audit,
      mutate: () => laboratoryUnshapedProductSampleJournal.update({
        id: recordId,
        record: validation.value,
        correctedByUserId: access.profile.userId,
        correctedByAccountId: access.profile.activeAccess.accountId,
        correctedByDisplayName: access.profile.displayName,
      }),
      buildEvent: (result) => result === undefined
        ? undefined
        : {
            actor: buildAuditActor(access.profile),
            category: "data_change",
            action: "laboratory_unshaped_product_sample.correct",
            summary: "Исправлена проба неформованной продукции",
            details: [
              {
                label: "Номер пробы",
                value: `${result.before.sampleNumber} → ${result.record.sampleNumber}`,
              },
              {
                label: "Код пробы",
                value: `${result.before.sampleCode} → ${result.record.sampleCode}`,
              },
              {
                label: "Наименование продукции",
                value: `${result.before.productName} → ${result.record.productName}`,
              },
              {
                label: "Пригодность",
                value:
                  `${laboratoryUnshapedProductSampleSuitabilityLabels[result.before.suitability]} → ${laboratoryUnshapedProductSampleSuitabilityLabels[result.record.suitability]}`,
              },
            ],
            targetType: "laboratory_unshaped_product_sample",
            targetId: result.record.id,
          },
    });
    if (correction === undefined) {
      sendJson(res, 404, {
        error: {
          code: "not_found",
          message: "Проба неформованной продукции не найдена.",
        },
      });
      return;
    }

    sendJson(res, 200, { record: correction.record });
    return;
  }

  if (url.pathname === "/api/laboratory/unshaped-product-sample-journal") {
    if (laboratoryUnshapedProductSampleJournal === undefined) {
      sendJson(res, 503, {
        error: {
          code: "server_error",
          message: "Хранилище журнала проб неформованной продукции не настроено.",
        },
      });
      return;
    }

    if (req.method === "GET") {
      const dateFrom = readOptionalQueryParam(url, "dateFrom");
      const dateTo = readOptionalQueryParam(url, "dateTo");
      const query = readOptionalQueryParam(url, "query");
      const nameQuery = readOptionalQueryParam(url, "name");

      if (
        (dateFrom !== undefined && !isCalendarDateQueryValue(dateFrom)) ||
        (dateTo !== undefined && !isCalendarDateQueryValue(dateTo)) ||
        (dateFrom !== undefined && dateTo !== undefined && dateFrom > dateTo) ||
        (query !== undefined && query.length > 120) ||
        (nameQuery !== undefined && nameQuery.length > 120)
      ) {
        sendJson(res, 400, {
          error: {
            code: "invalid_response",
            message: "Проверьте фильтры журнала проб неформованной продукции.",
          },
        });
        return;
      }

      sendJson(res, 200, {
        records: await laboratoryUnshapedProductSampleJournal.list({
          ...(dateFrom === undefined ? {} : { dateFrom }),
          ...(dateTo === undefined ? {} : { dateTo }),
          ...(query === undefined ? {} : { query }),
          ...(nameQuery === undefined ? {} : { nameQuery }),
        }),
      });
      return;
    }

    if (req.method !== "POST") {
      sendJson(res, 405, {
        error: {
          code: "access_denied",
          message: "Для журнала используются GET и POST.",
        },
      });
      return;
    }

    const validation = validateLaboratoryUnshapedProductSampleSubmission(
      await readJsonBody(req),
    );
    if (!validation.ok) {
      sendJson(res, 400, {
        error: {
          code: "invalid_response",
          message: validation.errors.join(" "),
        },
      });
      return;
    }

    const productReferences = await resolveProductionBrandReferencesForRequest({
      res,
      productionBrands,
      references: [{
        fieldName: "productName",
        label: validation.value.productName,
      }],
      logEvent: "unshaped_product_sample_brands.google_sheets_fetch_failed",
    });
    if (productReferences === undefined) return;
    validation.value.productName = productReferences[0]?.label ??
      validation.value.productName;

    const saved = await runAuditedMutation({
      transaction: databaseTransaction,
      audit,
      mutate: () => laboratoryUnshapedProductSampleJournal.create({
        record: validation.value,
        submittedByUserId: access.profile.userId,
        submittedByAccountId: access.profile.activeAccess.accountId,
      }),
      buildEvent: (record) => ({
        actor: buildAuditActor(access.profile),
        category: "form_submission",
        action: "laboratory_unshaped_product_sample.submit",
        summary: "Добавлена проба неформованной продукции",
        details: [
          { label: "Номер пробы", value: record.sampleNumber },
          { label: "Дата", value: record.sampleDate },
          { label: "Кто брал пробы", value: record.sampledBy },
          { label: "№ партии", value: record.batchNumber },
          { label: "Код пробы", value: record.sampleCode },
          { label: "Наименование продукции", value: record.productName },
          { label: "Масса партии", value: record.batchMass },
          { label: "Влажность", value: record.moisture },
          { label: "Зерновой состав", value: record.grainComposition },
          { label: "Огнеупорность", value: record.fireResistance },
          {
            label: "Пригодность",
            value:
              laboratoryUnshapedProductSampleSuitabilityLabels[record.suitability],
          },
          { label: "Примечание", value: record.notes ?? "—" },
        ],
        targetType: "laboratory_unshaped_product_sample",
        targetId: record.id,
      }),
    });

    sendJson(res, 201, { record: saved });
    return;
  }

  if (url.pathname === "/api/laboratory/chemical-analysis-draft") {
    if (!canManageLaboratory) {
      sendJson(res, 403, {
        error: {
          code: "access_denied",
          message:
            "Заготовка номера доступна только для заполнения журнала.",
        },
      });
      return;
    }
    if (req.method !== "GET") {
      sendJson(res, 405, {
        error: {
          code: "access_denied",
          message: "Для заготовки номера используется GET.",
        },
      });
      return;
    }
    if (laboratoryChemicalAnalysisJournal === undefined) {
      sendJson(res, 503, {
        error: {
          code: "server_error",
          message: "Хранилище журнала химических анализов не настроено.",
        },
      });
      return;
    }

    sendJson(res, 200, {
      laboratoryAnalysisNumber:
        await laboratoryChemicalAnalysisJournal
          .getNextLaboratoryAnalysisNumber(),
    });
    return;
  }

  const chemicalAnalysisRecordMatch =
    laboratoryChemicalAnalysisRecordPathPattern.exec(url.pathname);
  if (chemicalAnalysisRecordMatch !== null) {
    if (!canManageLaboratory) {
      sendJson(res, 403, {
        error: {
          code: "access_denied",
          message: "Исправление химического анализа недоступно.",
        },
      });
      return;
    }
    if (req.method !== "PATCH") {
      sendJson(res, 405, {
        error: {
          code: "access_denied",
          message: "Для исправления химического анализа используется PATCH.",
        },
      });
      return;
    }
    if (laboratoryChemicalAnalysisJournal === undefined) {
      sendJson(res, 503, {
        error: {
          code: "server_error",
          message: "Хранилище журнала химических анализов не настроено.",
        },
      });
      return;
    }

    const validation = validateLaboratoryChemicalAnalysisJournalSubmission(
      await readJsonBody(req),
    );
    if (!validation.ok) {
      sendJson(res, 400, {
        error: {
          code: "invalid_response",
          message: validation.errors.join(" "),
        },
      });
      return;
    }

    const analysisId = chemicalAnalysisRecordMatch[1];
    let correction;
    try {
      correction = await runAuditedMutation({
        transaction: databaseTransaction,
        audit,
        mutate: () => laboratoryChemicalAnalysisJournal.update({
          id: analysisId,
          analysis: validation.value,
          correctedByUserId: access.profile.userId,
          correctedByAccountId: access.profile.activeAccess.accountId,
          correctedByDisplayName: access.profile.displayName,
        }),
        buildEvent: (result) => result === undefined
          ? undefined
          : {
            actor: buildAuditActor(access.profile),
            category: "data_change",
            action: "laboratory_chemical_analysis.correct",
            summary: "Исправлена запись журнала химических анализов",
            details: [
              {
                label: "Код лабораторной пробы",
                value:
                  `${result.before.laboratorySampleCode} → ${result.record.laboratorySampleCode}`,
              },
              {
                label: "Номер лабораторного анализа",
                value:
                  `${result.before.laboratoryAnalysisNumber ?? "—"} → ${result.record.laboratoryAnalysisNumber ?? "—"}`,
              },
              {
                label: "Дата хим. анализа",
                value:
                  `${result.before.chemicalAnalysisDate ?? "—"} → ${result.record.chemicalAnalysisDate ?? "—"}`,
              },
              {
                label: "Номер партии",
                value:
                  `${result.before.batchNumber ?? "—"} → ${result.record.batchNumber ?? "—"}`,
              },
            ],
            targetType: "laboratory_chemical_analysis",
            targetId: result.record.id,
          },
      });
    } catch (error) {
      if (error instanceof LaboratoryChemicalAnalysisSampleUnavailableError) {
        sendJson(res, 409, {
          error: {
            code: "invalid_response",
            message: "Для выбранной пробы уже сохранён химический анализ.",
          },
        });
        return;
      }
      throw error;
    }
    if (correction === undefined) {
      sendJson(res, 404, {
        error: {
          code: "not_found",
          message: "Химический анализ не найден.",
        },
      });
      return;
    }

    sendJson(res, 200, { record: correction.record });
    return;
  }

  if (url.pathname === laboratoryChemicalAnalysisProtocolPath) {
    if (req.method !== "GET") {
      sendJson(res, 405, {
        error: {
          code: "access_denied",
          message: "Для протокола отбора проб используется GET.",
        },
      });
      return;
    }
    if (laboratoryChemicalAnalysisJournal === undefined) {
      sendJson(res, 503, {
        error: {
          code: "server_error",
          message: "Хранилище журнала химических анализов не настроено.",
        },
      });
      return;
    }

    const filters = readLaboratoryChemicalAnalysisFilters(url);
    if (!filters.ok) {
      sendJson(res, 400, {
        error: {
          code: "invalid_response",
          message: "Проверьте фильтры журнала химических анализов.",
        },
      });
      return;
    }

    const records = await laboratoryChemicalAnalysisJournal.list(filters.value);
    if (records.length === 0) {
      sendJson(res, 404, {
        error: {
          code: "not_found",
          message: "По выбранным фильтрам нет химических анализов для протокола.",
        },
      });
      return;
    }

    const pdf = await renderLaboratoryChemicalAnalysisProtocolPdf({
      records,
      filters: filters.value,
      generatedAt: now(),
    });
    sendPdf(res, pdf, "Протокол отбора проб.pdf");
    return;
  }

  if (url.pathname === "/api/laboratory/chemical-analysis-journal") {
    if (laboratoryChemicalAnalysisJournal === undefined) {
      sendJson(res, 503, {
        error: {
          code: "server_error",
          message: "Хранилище журнала химических анализов не настроено.",
        },
      });
      return;
    }

    if (req.method === "GET") {
      const filters = readLaboratoryChemicalAnalysisFilters(url);
      const sampleQuery = readOptionalQueryParam(url, "sampleQuery");
      const nameQuery = readOptionalQueryParam(url, "name");

      if (
        !filters.ok ||
        (sampleQuery !== undefined && sampleQuery.length > 120) ||
        (nameQuery !== undefined && nameQuery.length > 120)
      ) {
        sendJson(res, 400, {
          error: {
            code: "invalid_response",
            message: "Проверьте фильтры журнала химических анализов.",
          },
        });
        return;
      }

      const [records, sampleOptions] = await Promise.all([
        laboratoryChemicalAnalysisJournal.list({
          ...filters.value,
          ...(nameQuery === undefined ? {} : { nameQuery }),
        }),
        canManageLaboratory
          ? laboratoryChemicalAnalysisJournal.listAvailableSampleOptions({
              ...(sampleQuery === undefined ? {} : { query: sampleQuery }),
            })
          : Promise.resolve([]),
      ]);
      sendJson(res, 200, { records, sampleOptions });
      return;
    }

    if (req.method !== "POST") {
      sendJson(res, 405, {
        error: {
          code: "access_denied",
          message: "Для журнала используются GET и POST.",
        },
      });
      return;
    }

    const validation = validateLaboratoryChemicalAnalysisJournalSubmission(
      await readJsonBody(req),
    );
    if (!validation.ok) {
      sendJson(res, 400, {
        error: {
          code: "invalid_response",
          message: validation.errors.join(" "),
        },
      });
      return;
    }

    const sample = await laboratoryChemicalAnalysisJournal.findSampleOption(
      validation.value,
      { availableOnly: true },
    );
    if (sample === undefined) {
      sendJson(res, 400, {
        error: {
          code: "invalid_response",
          message:
            "Выберите пробу без химического анализа из доступных журналов.",
        },
      });
      return;
    }

    let saved;
    try {
      saved = await runAuditedMutation({
        transaction: databaseTransaction,
        audit,
        mutate: () => laboratoryChemicalAnalysisJournal.create({
          analysis: validation.value,
          submittedByUserId: access.profile.userId,
          submittedByAccountId: access.profile.activeAccess.accountId,
        }),
        buildEvent: (record) => ({
          actor: buildAuditActor(access.profile),
          category: "form_submission",
          action: "laboratory_chemical_analysis.submit",
          summary: "Добавлена запись журнала химических анализов",
          details: [
            {
              label: "Код лабораторной пробы",
              value: record.laboratorySampleCode,
            },
            ...(record.laboratoryAnalysisNumber === undefined
              ? []
              : [{
                  label: "Номер лабораторного анализа",
                  value: record.laboratoryAnalysisNumber,
                }]),
            ...(record.chemicalAnalysisDate === undefined
              ? []
              : [{
                  label: "Дата хим. анализа",
                  value: record.chemicalAnalysisDate,
                }]),
            ...(record.chemicalAnalysisLaboratoryAssistant === undefined
              ? []
              : [{
                  label: "Лаборант",
                  value: record.chemicalAnalysisLaboratoryAssistant,
                }]),
            ...(record.batchNumber === undefined
              ? []
              : [{ label: "Номер партии", value: record.batchNumber }]),
          ],
          targetType: "laboratory_chemical_analysis",
          targetId: record.id,
        }),
      });
    } catch (error) {
      if (error instanceof LaboratoryChemicalAnalysisSampleUnavailableError) {
        sendJson(res, 409, {
          error: {
            code: "invalid_response",
            message: "Для выбранной пробы уже сохранён химический анализ.",
          },
        });
        return;
      }
      throw error;
    }

    sendJson(res, 201, { record: saved });
    return;
  }

  if (url.pathname === "/api/laboratory/banks") {
    if (
      laboratoryBankAssignments === undefined ||
      rotaryKiln2FiringJournal === undefined
    ) {
      sendJson(res, 503, {
        error: { code: "server_error", message: "Хранилище назначений банок не настроено." },
      });
      return;
    }

    if (req.method === "GET") {
      sendJson(res, 200, {
        currentAssignments: await laboratoryBankAssignments.listCurrent(),
        history: await laboratoryBankAssignments.listHistory(),
        availableMaterials: await rotaryKiln2FiringJournal
          .listMaterialBulkDensities(),
      });
      return;
    }

    if (req.method !== "POST") {
      sendJson(res, 405, {
        error: { code: "access_denied", message: "Для банок используются GET и POST." },
      });
      return;
    }

    const validation = validateLaboratoryBankAssignmentRequest(
      await readJsonBody(req),
    );
    if (!validation.ok) {
      sendJson(res, 400, {
        error: { code: "invalid_response", message: validation.error },
      });
      return;
    }
    const [materialBulkDensity] = await rotaryKiln2FiringJournal
      .listMaterialBulkDensities({ material: validation.value.material });
    const resolution = resolveLaboratoryBankAssignment(
      validation.value,
      materialBulkDensity,
    );
    if (!resolution.ok) {
      sendJson(res, 400, {
        error: { code: "invalid_response", message: resolution.error },
      });
      return;
    }

    const assignment = await runAuditedMutation({
      transaction: databaseTransaction,
      audit,
      mutate: () => laboratoryBankAssignments.assign({
        ...resolution.value,
        assignedByUserId: access.profile.userId,
        assignedByAccountId: access.profile.activeAccess.accountId,
        assignedByDisplayName: access.profile.displayName,
      }),
      buildEvent: (saved) => ({
        actor: buildAuditActor(access.profile),
        category: "data_change",
        action: "laboratory_bank.assign",
        summary: `Назначено содержимое банки ${["I", "II", "III"][saved.bankNumber - 1]}`,
        details: [
          { label: "Марка", value: saved.materialLabel },
          { label: "Насыпной вес", value: String(saved.bulkDensityTonsPerCubicMeter) },
          {
            label: "Записей журнала печи 2",
            value: String(saved.bulkDensitySampleCount ?? 0),
          },
        ],
        targetType: "laboratory_bank_assignment",
        targetId: saved.assignmentId,
      }),
    });
    sendJson(res, 201, { assignment });
    return;
  }

  if (laboratoryResults === undefined) {
    sendJson(res, 503, {
      error: {
        code: "server_error",
        message: "Хранилище результатов испытаний не настроено.",
      },
    });
    return;
  }

  const protocolMatch = laboratoryProtocolPathPattern.exec(url.pathname);
  if (protocolMatch !== null) {
    if (req.method !== "GET") {
      sendJson(res, 405, {
        error: {
          code: "access_denied",
          message: "Для протокола испытаний используется GET.",
        },
      });
      return;
    }
    const resultId = protocolMatch[1];
    const storedResult = resultId === undefined
      ? undefined
      : await laboratoryResults.findById(resultId);
    if (storedResult === undefined) {
      sendJson(res, 404, {
        error: {
          code: "not_found",
          message: "Результат испытаний не найден.",
        },
      });
      return;
    }
    const reference = storedResult.protocolReference ??
      await readLaboratoryReferenceForRequest(
        res,
        laboratoryReferenceDataSource,
      );
    if (reference === undefined) return;
    const pdf = await renderLaboratoryProtocolPdf(
      buildLaboratoryProtocol(storedResult, reference),
    );
    sendPdf(
      res,
      pdf,
      `Протокол испытаний ${storedResult.analysisDate}.pdf`,
    );
    return;
  }

  if (req.method === "GET") {
    const sectionValue = url.searchParams.get("section") ?? undefined;
    const dateFrom = url.searchParams.get("dateFrom") ?? undefined;
    const dateTo = url.searchParams.get("dateTo") ?? undefined;
    const materialValue = url.searchParams.get("material") ?? undefined;
    const brandValue = url.searchParams.get("brand") ?? undefined;
    const nameValue = url.searchParams.get("name") ?? undefined;
    const section = sectionValue === undefined
      ? undefined
      : laboratorySections.includes(sectionValue as LaboratorySection)
        ? sectionValue as LaboratorySection
        : undefined;
    const materialLabel = materialValue?.trim().replace(/\s+/gu, " ");
    const productBrand = brandValue?.trim().replace(/\s+/gu, " ");
    const nameQuery = nameValue?.trim().replace(/\s+/gu, " ");

    if (
      (sectionValue !== undefined && section === undefined) ||
      (dateFrom !== undefined && !isCalendarDateQueryValue(dateFrom)) ||
      (dateTo !== undefined && !isCalendarDateQueryValue(dateTo)) ||
      (materialLabel !== undefined &&
        (materialLabel.length === 0 || materialLabel.length > 120)) ||
      (productBrand !== undefined &&
        (productBrand.length === 0 || productBrand.length > 120)) ||
      (nameQuery !== undefined &&
        (nameQuery.length === 0 || nameQuery.length > 120))
    ) {
      sendJson(res, 400, {
        error: {
          code: "invalid_response",
          message: "Проверьте фильтры результатов испытаний.",
        },
      });
      return;
    }

    sendJson(res, 200, {
      results: await laboratoryResults.list({
        ...(section === undefined ? {} : { section }),
        ...(dateFrom === undefined ? {} : { dateFrom }),
        ...(dateTo === undefined ? {} : { dateTo }),
        ...(materialLabel === undefined ? {} : { materialLabel }),
        ...(productBrand === undefined ? {} : { productBrand }),
        ...(nameQuery === undefined ? {} : { nameQuery }),
      }),
    });
    return;
  }

  if (req.method !== "POST") {
    sendJson(res, 405, {
      error: {
        code: "access_denied",
        message: "Поддерживаются только GET и POST.",
      },
    });
    return;
  }

  const reference = await readLaboratoryReferenceForRequest(
    res,
    laboratoryReferenceDataSource,
  );
  if (reference === undefined) return;

  const validation = validateLaboratoryResultSubmission(
    await readJsonBody(req),
    reference,
  );

  if (!validation.ok) {
    sendJson(res, 400, {
      error: {
        code: "invalid_response",
        message: validation.errors.join(" "),
      },
    });
    return;
  }

  if (validation.value.section === "finished_product") {
    const references = await resolveProductionBrandReferencesForRequest({
      res,
      productionBrands,
      references: [{
        fieldName: "productBrand",
        label: validation.value.productBrand,
      }],
      logEvent: "laboratory_brands.google_sheets_fetch_failed",
    });
    if (references === undefined) return;
    validation.value.productBrand = references[0]?.label ??
      validation.value.productBrand;
  }

  const saved = await runAuditedMutation({
    transaction: databaseTransaction,
    audit,
    mutate: () => laboratoryResults.create({
      result: validation.value,
      submittedByUserId: access.profile.userId,
      submittedByAccountId: access.profile.activeAccess.accountId,
      laboratoryAssistantDisplayName: access.profile.displayName,
      protocolReference: reference,
    }),
    buildEvent: (result) => ({
      actor: buildAuditActor(access.profile),
      category: "form_submission",
      action: "laboratory_result.submit",
      summary: result.section === "incoming"
        ? `Добавлен входящий лабораторный контроль «${result.materialLabel}»`
        : `Добавлен контроль готовой продукции «${result.productBrand}»`,
      details: [
        { label: "Дата анализа", value: result.analysisDate },
        { label: "Объект испытаний", value: result.materialLabel },
        ...(result.section === "finished_product"
          ? [{ label: "Марка", value: result.productBrand }]
          : [{ label: "Количество проб", value: String(result.samples.length) }]),
      ],
      targetType: "laboratory_result",
      targetId: result.id,
    }),
  });

  sendJson(res, 201, { result: saved });
}

async function readLaboratoryReferenceForRequest(
  res: ServerResponse,
  source: LaboratoryReferenceDataSource,
) {
  try {
    return await source.read();
  } catch (error) {
    console.warn("laboratory_reference.google_sheets_fetch_failed", error);
    sendJson(res, 502, {
      error: {
        code: "server_error",
        message: "Не удалось загрузить справочник лаборатории из Google Sheets.",
      },
    });
    return undefined;
  }
}

async function handleRefractoryWagonsRequest({
  req,
  res,
  url,
  config,
  devSessions,
  authService,
  refractoryWagons,
  productionBrands,
  audit,
  databaseTransaction,
}: {
  req: IncomingMessage;
  res: ServerResponse;
  url: URL;
  config: ServerConfig;
  devSessions: Map<string, DevAccessSession>;
  authService: AuthSessionService | undefined;
  refractoryWagons: RefractoryWagonsRepository | undefined;
  productionBrands: ProductionBrandsDataSource;
  audit: AuditRepository;
  databaseTransaction: DatabaseTransactionRunner;
}) {
  const access = await requireAuthentication(req, res, {
    config,
    devSessions,
    authService,
  });
  if (access === undefined) return;

  if (
    !hasProfileCapability(
      access.profile,
      "business.submit_refractory_reports",
    )
  ) {
    sendJson(res, 403, {
      error: {
        code: "access_denied",
        message: "Журнал вагонов доступен сотруднику огнеупорного цеха.",
      },
    });
    return;
  }
  if (refractoryWagons === undefined) {
    sendJson(res, 503, {
      error: {
        code: "server_error",
        message: "Хранилище журнала вагонов не настроено.",
      },
    });
    return;
  }

  const wagonMatch = url.pathname.match(
    /^\/api\/refractory-wagons\/([^/]+)$/u,
  );
  if (wagonMatch !== null) {
    if (req.method !== "PATCH") {
      sendJson(res, 405, {
        error: {
          code: "access_denied",
          message: "Для исправления вагона используется PATCH.",
        },
      });
      return;
    }

    const validation = validateRefractoryWagonSubmission(await readJsonBody(req));
    if (!validation.ok) {
      sendJson(res, 400, {
        error: {
          code: "invalid_response",
          message: validation.errors.join(" "),
        },
      });
      return;
    }
    const wagon = await resolveRefractoryWagonBrand({
      res,
      productionBrands,
      wagon: validation.value,
    });
    if (wagon === undefined) return;

    try {
      const correction = await runAuditedMutation({
        transaction: databaseTransaction,
        audit,
        mutate: () => refractoryWagons.update({
          id: wagonMatch[1],
          wagon,
          correctedByUserId: access.profile.userId,
          correctedByAccountId: access.profile.activeAccess.accountId,
          correctedByDisplayName: access.profile.displayName,
        }),
        buildEvent: (result) => result === undefined
          ? undefined
          : {
              actor: buildAuditActor(access.profile),
              category: "data_change",
              action: "refractory_wagon.correct",
              summary: `Исправлен вагон ${result.record.number}`,
              details: [
                {
                  label: "№ вагона",
                  value: `${result.before.number} → ${result.record.number}`,
                },
                {
                  label: "Дата садки",
                  value: `${result.before.loadingDate ?? "—"} → ${result.record.loadingDate ?? "—"}`,
                },
                {
                  label: "Марка",
                  value: `${result.before.productBrand ?? "—"} → ${result.record.productBrand ?? "—"}`,
                },
              ],
              targetType: "refractory_wagon",
              targetId: result.record.id,
            },
      });
      if (correction === undefined) {
        sendJson(res, 404, {
          error: {
            code: "not_found",
            message: "Вагон не найден.",
          },
        });
        return;
      }
      sendJson(res, 200, { wagon: correction.record });
    } catch (error) {
      if (error instanceof RefractoryWagonNumberAlreadyExistsError) {
        sendJson(res, 409, {
          error: {
            code: "invalid_response",
            message: "Вагон с таким номером уже есть в журнале.",
          },
        });
        return;
      }
      throw error;
    }
    return;
  }

  if (req.method === "GET") {
    sendJson(res, 200, { wagons: await refractoryWagons.list() });
    return;
  }
  if (req.method !== "POST") {
    sendJson(res, 405, {
      error: {
        code: "access_denied",
        message: "Для журнала вагонов используются GET и POST.",
      },
    });
    return;
  }

  const validation = validateRefractoryWagonSubmission(await readJsonBody(req));
  if (!validation.ok) {
    sendJson(res, 400, {
      error: {
        code: "invalid_response",
        message: validation.errors.join(" "),
      },
    });
    return;
  }

  const wagon = await resolveRefractoryWagonBrand({
    res,
    productionBrands,
    wagon: validation.value,
  });
  if (wagon === undefined) return;

  try {
    const saved = await runAuditedMutation({
      transaction: databaseTransaction,
      audit,
      mutate: () => refractoryWagons.create({
        wagon,
        submittedByUserId: access.profile.userId,
        submittedByAccountId: access.profile.activeAccess.accountId,
      }),
      buildEvent: (record) => ({
        actor: buildAuditActor(access.profile),
        category: "form_submission",
        action: "refractory_wagon.create",
        summary: `Добавлен вагон ${record.number}`,
        details: [
          { label: "№ вагона", value: record.number },
          { label: "Дата садки", value: record.loadingDate ?? "—" },
          { label: "Марка", value: record.productBrand ?? "—" },
        ],
        targetType: "refractory_wagon",
        targetId: record.id,
      }),
    });
    sendJson(res, 201, { wagon: saved });
  } catch (error) {
    if (error instanceof RefractoryWagonNumberAlreadyExistsError) {
      sendJson(res, 409, {
        error: {
          code: "invalid_response",
          message: "Вагон с таким номером уже есть в журнале.",
        },
      });
      return;
    }
    throw error;
  }
}

async function resolveRefractoryWagonBrand({
  res,
  productionBrands,
  wagon,
}: {
  res: ServerResponse;
  productionBrands: ProductionBrandsDataSource;
  wagon: RefractoryWagonSubmission;
}) {
  const references = await resolveProductionBrandReferencesForRequest({
    res,
    productionBrands,
    references: [{
      fieldName: "productBrand",
      label: wagon.productBrand,
    }],
    logEvent: "refractory_wagon_brand_lookup_failed",
  });
  if (references === undefined) return undefined;
  return {
    ...wagon,
    productBrand: references[0]?.label ?? wagon.productBrand,
  };
}

async function handleRefractoryReportsRequest({
  req,
  res,
  url,
  config,
  devSessions,
  authService,
  refractoryReports,
  laboratoryBankAssignments,
  bankVolumeReferenceDataSource,
  productionBrands,
  referenceDataSource,
  emailNotificationService,
  maxNotificationService,
  audit,
  databaseTransaction,
}: {
  req: IncomingMessage;
  res: ServerResponse;
  url: URL;
  config: ServerConfig;
  devSessions: Map<string, DevAccessSession>;
  authService: AuthSessionService | undefined;
  refractoryReports: RefractoryReportsRepository | undefined;
  laboratoryBankAssignments: LaboratoryBankAssignmentsRepository | undefined;
  bankVolumeReferenceDataSource: BankVolumeReferenceDataSource;
  productionBrands: ProductionBrandsDataSource;
  referenceDataSource: DispatcherReferenceDataSource;
  emailNotificationService: EmailNotificationService;
  maxNotificationService: MaxNotificationService;
  audit: AuditRepository;
  databaseTransaction: DatabaseTransactionRunner;
}) {
  const access = await requireAuthentication(req, res, {
    config,
    devSessions,
    authService,
  });
  if (access === undefined) return;

  const canSubmit = hasProfileCapability(
    access.profile,
    "business.submit_refractory_reports",
  );
  const canReview = hasProfileCapability(
    access.profile,
    "business.review_refractory_reports",
  );
  if (!canSubmit && !canReview) {
    sendJson(res, 403, {
      error: {
        code: "access_denied",
        message: "Таблицы огнеупорного цеха недоступны.",
      },
    });
    return;
  }
  if (refractoryReports === undefined) {
    sendJson(res, 503, {
      error: {
        code: "server_error",
        message: "Хранилище таблиц огнеупорного цеха не настроено.",
      },
    });
    return;
  }

  if (url.pathname === "/api/refractory-reports/banks") {
    if (req.method !== "GET") {
      sendJson(res, 405, {
        error: { code: "access_denied", message: "Для данных банок используется GET." },
      });
      return;
    }
    if (laboratoryBankAssignments === undefined) {
      sendJson(res, 503, {
        error: { code: "server_error", message: "Хранилище назначений банок не настроено." },
      });
      return;
    }
    try {
      const [currentAssignments, volumeReference] = await Promise.all([
        laboratoryBankAssignments.listCurrent(),
        bankVolumeReferenceDataSource.read(),
      ]);
      sendJson(res, 200, { currentAssignments, volumeReference });
    } catch (error) {
      console.warn("bank_reference.google_sheets_fetch_failed", error);
      sendJson(res, 502, {
        error: { code: "server_error", message: "Не удалось загрузить справочник банок." },
      });
    }
    return;
  }

  if (url.pathname === "/api/refractory-reports/pending") {
    if (req.method !== "GET" || !canReview) {
      sendJson(res, req.method === "GET" ? 403 : 405, {
        error: {
          code: "access_denied",
          message: req.method === "GET"
            ? "Подтверждение таблиц доступно диспетчеру."
            : "Для очереди подтверждения используется GET.",
        },
      });
      return;
    }
    sendJson(res, 200, {
      reports: (await refractoryReports.listPending()).map(
        toPublicRefractoryReportRevision,
      ),
    });
    return;
  }

  if (url.pathname === "/api/refractory-reports/own") {
    if (req.method !== "GET" || !canSubmit) {
      sendJson(res, req.method === "GET" ? 403 : 405, {
        error: {
          code: "access_denied",
          message:
            req.method === "GET"
              ? "Решения по таблицам доступны сотруднику огнеупорного цеха."
              : "Для проверки решений используется GET.",
        },
      });
      return;
    }
    sendJson(res, 200, {
      reports: (
        await refractoryReports.listRecentForSubmitter({
          submittedByAccountId: access.profile.activeAccess.accountId,
        })
      ).map(toPublicRefractoryReportRevision),
    });
    return;
  }

  const decisionMatch = /^\/api\/refractory-reports\/([^/]+)\/decision$/u.exec(
    url.pathname,
  );
  if (decisionMatch !== null) {
    if (req.method !== "POST" || !canReview) {
      sendJson(res, req.method === "POST" ? 403 : 405, {
        error: {
          code: "access_denied",
          message: req.method === "POST"
            ? "Подтверждение таблиц доступно диспетчеру."
            : "Для решения по таблице используется POST.",
        },
      });
      return;
    }
    const reportId = decisionMatch[1];
    if (!/^[a-zA-Z0-9-]{1,120}$/u.test(reportId)) {
      sendJson(res, 400, {
        error: { code: "invalid_response", message: "Неверный номер таблицы." },
      });
      return;
    }
    const validation = validateRefractoryReportDecision(await readJsonBody(req));
    if (!validation.ok) {
      sendJson(res, 400, {
        error: {
          code: "invalid_response",
          message: validation.errors.join(" "),
        },
      });
      return;
    }

    try {
      const report = await runAuditedMutation({
        transaction: databaseTransaction,
        audit,
        mutate: () => refractoryReports.review({
          reportId,
          decision: validation.value,
          reviewerUserId: access.profile.userId,
          reviewerAccountId: access.profile.activeAccess.accountId,
          reviewerDisplayName: access.profile.displayName,
        }),
        buildEvent: (saved) => ({
          actor: buildAuditActor(access.profile),
          category: "data_change",
          action: validation.value.decision === "approve"
            ? "refractory_report.approve"
            : "refractory_report.reject",
          summary: validation.value.decision === "approve"
            ? `Подтверждена таблица ОЦ «${refractoryReportLabels[saved.reportType]}»`
            : `Возвращена на доработку таблица ОЦ «${refractoryReportLabels[saved.reportType]}»`,
          details: [
            { label: "Дата отчёта", value: saved.reportDate },
            { label: "Смена", value: String(saved.shiftNumber) },
            { label: "Ревизия", value: String(saved.revisionNumber) },
            ...(validation.value.decision === "reject"
              ? [{ label: "Причина", value: validation.value.comment }]
              : []),
          ],
          targetType: "refractory_report",
          targetId: saved.id,
        }),
      });
      if (validation.value.decision === "approve") {
        await notifyRefractoryReport(
          report,
          referenceDataSource,
          emailNotificationService,
          maxNotificationService,
          "approved",
        );
      }
      sendJson(res, 200, {
        report: toPublicRefractoryReportRevision(report),
      });
    } catch (error) {
      if (error instanceof RefractoryReportNotFoundError) {
        sendJson(res, 404, {
          error: { code: "not_found", message: "Таблица не найдена." },
        });
        return;
      }
      if (error instanceof RefractoryReportAlreadyReviewedError) {
        sendJson(res, 409, {
          error: {
            code: "invalid_response",
            message: "По этой таблице уже принято решение.",
          },
        });
        return;
      }
      if (error instanceof RefractoryReportSelfReviewError) {
        sendJson(res, 409, {
          error: {
            code: "access_denied",
            message: "Нельзя подтвердить собственную таблицу.",
          },
        });
        return;
      }
      throw error;
    }
    return;
  }

  if (req.method === "GET") {
    const reportDate = url.searchParams.get("date") ?? "";
    const shiftNumber = Number(url.searchParams.get("shift"));
    if (
      !isCalendarDateQueryValue(reportDate) ||
      (shiftNumber !== 1 && shiftNumber !== 2)
    ) {
      sendJson(res, 400, {
        error: {
          code: "invalid_response",
          message: "Укажите дату и смену таблиц ОЦ.",
        },
      });
      return;
    }
    sendJson(res, 200, {
      reports: (await refractoryReports.listLatestForShift({
        reportDate,
        shiftNumber: shiftNumber as RefractoryShiftNumber,
      })).map(toPublicRefractoryReportRevision),
    });
    return;
  }

  if (req.method !== "POST" || !canSubmit) {
    sendJson(res, req.method === "POST" ? 403 : 405, {
      error: {
        code: "access_denied",
        message: req.method === "POST"
          ? "Отправка таблиц ОЦ недоступна."
          : "Поддерживаются только GET и POST.",
      },
    });
    return;
  }
  const validation = validateRefractoryReportSubmission(await readJsonBody(req));
  if (!validation.ok) {
    sendJson(res, 400, {
      error: {
        code: "invalid_response",
        message: validation.errors.join(" "),
        details: validation.fieldErrors ?? [],
      },
    });
    return;
  }

  const brandReferences = readRefractoryReportBrandReferences(validation.value);

  if (brandReferences.length > 0) {
    const references = await resolveProductionBrandReferencesForRequest({
      res,
      productionBrands,
      references: brandReferences,
      logEvent: "refractory_brands.google_sheets_fetch_failed",
      describeMissingReference: (reference) =>
        describeMissingRefractoryBrand(validation.value, reference),
    });

    if (references === undefined) return;
    applyRefractoryReportBrandResolution(validation.value, references);
  }

  if (validation.value.reportType === "cosh") {
    if (laboratoryBankAssignments === undefined) {
      sendJson(res, 503, {
        error: { code: "server_error", message: "Хранилище назначений банок не настроено." },
      });
      return;
    }
    try {
      const [assignments, volumeReference] = await Promise.all([
        laboratoryBankAssignments.listCurrent(),
        bankVolumeReferenceDataSource.read(),
      ]);
      const calculated = calculateCoshBankMeasurements({
        assignments,
        measurements: (validation.value.payload.jarMeasurements ?? []).map(
          (row) => ({ bankNumber: row.jarNumber, values: row.values }),
        ),
        volumeReference,
      });
      if (!calculated.ok) {
        sendJson(res, 400, {
          error: { code: "invalid_response", message: calculated.error },
        });
        return;
      }
      validation.value.payload.jarMeasurements = calculated.value.map(
        ({ bankNumber, measurements, ...snapshot }) => ({
          jarNumber: bankNumber,
          values: measurements,
          ...snapshot,
        }),
      );
      const totalBankMass = calculated.value.reduce(
        (total, row) => total + row.materialMassTons,
        0,
      );
      validation.value.totals.jarMaterialMassTons = Math.round(
        (totalBankMass + Number.EPSILON) * 1_000,
      ) / 1_000;
    } catch (error) {
      console.warn("bank_reference.google_sheets_fetch_failed", error);
      sendJson(res, 502, {
        error: { code: "server_error", message: "Не удалось рассчитать массу в банках." },
      });
      return;
    }
  }

  try {
    const report = await runAuditedMutation({
      transaction: databaseTransaction,
      audit,
      mutate: () => refractoryReports.submit({
        report: validation.value,
        submittedByUserId: access.profile.userId,
        submittedByAccountId: access.profile.activeAccess.accountId,
        masterDisplayName: access.profile.displayName,
      }),
      buildEvent: (saved) => ({
        actor: buildAuditActor(access.profile),
        category: "form_submission",
        action: "refractory_report.submit",
        summary: `Отправлена таблица ОЦ «${refractoryReportLabels[saved.reportType]}»`,
        details: [
          { label: "Дата отчёта", value: saved.reportDate },
          { label: "Смена", value: String(saved.shiftNumber) },
          { label: "Ревизия", value: String(saved.revisionNumber) },
        ],
        targetType: "refractory_report",
        targetId: saved.id,
      }),
    });
    await notifyRefractoryReport(
      report,
      referenceDataSource,
      emailNotificationService,
      maxNotificationService,
      "review_requested",
    );
    sendJson(res, 201, {
      report: toPublicRefractoryReportRevision(report),
    });
  } catch (error) {
    if (error instanceof RefractoryReportPendingError) {
      sendJson(res, 409, {
        error: {
          code: "invalid_response",
          message: "Эта таблица уже ожидает подтверждения диспетчера.",
        },
      });
      return;
    }
    throw error;
  }
}

function readRefractoryReportBrandReferences(
  report: ValidatedRefractoryReportSubmission,
): ProductionBrandReference[] {
  if (report.reportType === "cosh") {
    return (report.payload.chamotteOutputRows ?? []).map((row, index) => ({
      fieldName: `chamotteOutputRows.${index}.productBrand`,
      label: row.productBrand,
    }));
  }

  if (report.reportType === "firing") {
    return report.payload.rows.map((row, index) => ({
      fieldName: `rows.${index}.productBrand`,
      label: row.productBrand,
    }));
  }

  return [
    ...report.payload.formedRows.flatMap((row, index) =>
      row.productBrand === undefined
        ? []
        : [{
            fieldName: `formedRows.${index}.productBrand`,
            label: row.productBrand,
          }],
    ),
    ...report.payload.unformedRows.map((row, index) => ({
      fieldName: `unformedRows.${index}.productBrand`,
      label: row.productBrand,
    })),
  ];
}

function applyRefractoryReportBrandResolution(
  report: ValidatedRefractoryReportSubmission,
  references: ProductionBrandReference[],
) {
  const labelByField = new Map(
    references.map((reference) => [reference.fieldName, reference.label]),
  );

  if (report.reportType === "cosh") {
    for (const [index, row] of (
      report.payload.chamotteOutputRows ?? []
    ).entries()) {
      row.productBrand = labelByField.get(
        `chamotteOutputRows.${index}.productBrand`,
      ) ?? row.productBrand;
    }
    return;
  }

  if (report.reportType === "firing") {
    for (const [index, row] of report.payload.rows.entries()) {
      row.productBrand = labelByField.get(`rows.${index}.productBrand`) ??
        row.productBrand;
    }
    return;
  }

  if (report.reportType === "equipment") {
    for (const [index, row] of report.payload.formedRows.entries()) {
      if (row.productBrand !== undefined) {
        row.productBrand = labelByField.get(
          `formedRows.${index}.productBrand`,
        ) ?? row.productBrand;
      }
    }
    for (const [index, row] of report.payload.unformedRows.entries()) {
      row.productBrand = labelByField.get(
        `unformedRows.${index}.productBrand`,
      ) ?? row.productBrand;
    }
  }
}

type ProductionBrandReferenceErrorDetail = {
  fieldPath: string;
  message: string;
};

function describeMissingRefractoryBrand(
  report: ValidatedRefractoryReportSubmission,
  reference: ProductionBrandReference,
): ProductionBrandReferenceErrorDetail | undefined {
  const missingValue = `значение «${reference.label}» отсутствует в номенклатуре. Выберите марку из списка.`;

  if (report.reportType === "cosh") {
    const match = /^chamotteOutputRows\.(\d+)\.productBrand$/u.exec(
      reference.fieldName,
    );
    if (match === null) return undefined;
    const rowNumber = Number(match[1]) + 1;
    return {
      fieldPath: reference.fieldName,
      message:
        `Выпуск шамота, строка ${rowNumber}, поле «Марка изделия»: ${missingValue}`,
    };
  }

  return undefined;
}

async function resolveProductionBrandReferencesForRequest({
  res,
  productionBrands,
  references,
  logEvent,
  describeMissingReference,
}: {
  res: ServerResponse;
  productionBrands: ProductionBrandsDataSource;
  references: ProductionBrandReference[];
  logEvent: string;
  describeMissingReference?: (
    reference: ProductionBrandReference,
  ) => ProductionBrandReferenceErrorDetail | undefined;
}): Promise<ProductionBrandReference[] | undefined> {
  try {
    const resolution = await productionBrands.resolveReferences(references);

    if (resolution.ok) return resolution.references;

    const detail = describeMissingReference?.(resolution.missing);
    sendJson(res, 400, {
      error: {
        code: "invalid_response",
        message: detail?.message ??
          `Сначала добавьте марку «${resolution.missing.label}» в номенклатуру.`,
        ...(detail === undefined ? {} : { details: [detail] }),
      },
    });
  } catch (error) {
    console.warn(logEvent, error);
    sendJson(res, 502, {
      error: {
        code: "server_error",
        message: "Не удалось проверить марки по Google Sheets.",
      },
    });
  }

  return undefined;
}

function readAdminDispatcherBrandReferences(
  tableName: string,
  values: Record<string, AdminDatabaseCellValue>,
): ProductionBrandReference[] {
  if (tableName !== "dispatcher_submissions") return [];

  const payload = Object.fromEntries(
    Object.entries(values).flatMap(([fieldName, value]) =>
      fieldName.startsWith("payload.") && typeof value === "string"
        ? [[fieldName.slice("payload.".length), value]]
        : [],
    ),
  ) as Parameters<typeof readProductionSubmissionBrandReferences>[0];

  return readProductionSubmissionBrandReferences(payload).map((reference) => ({
    fieldName: `payload.${reference.fieldName}`,
    label: reference.label,
  }));
}

function addProductionBrandsToAdminDispatcherRows(
  rows: AdminDatabaseTableRows,
  labels: string[],
): AdminDatabaseTableRows {
  const options = labels.map((label) => ({ value: label, label }));

  return {
    ...rows,
    rows: rows.rows.map((row) => ({
      ...row,
      editorFields: row.editorFields.map((field) =>
        !isAdminDispatcherBrandFieldName(field.name)
          ? field
          : {
              ...field,
              inputType: "production_brand",
              options,
            },
      ),
    })),
  };
}

function isAdminDispatcherBrandFieldName(fieldName: string) {
  return readAdminDispatcherBrandReferences(
    "dispatcher_submissions",
    { [fieldName]: "brand" },
  ).length > 0;
}

async function handleAdminAuditReportRequest({
  req,
  res,
  url,
  config,
  devSessions,
  authService,
  audit,
}: {
  req: IncomingMessage;
  res: ServerResponse;
  url: URL;
  config: ServerConfig;
  devSessions: Map<string, DevAccessSession>;
  authService: AuthSessionService | undefined;
  audit: AuditRepository;
}) {
  if (req.method !== "GET") {
    sendJson(res, 405, {
      error: {
        code: "access_denied",
        message: "Only GET is supported for user activity reports.",
      },
    });
    return;
  }

  const access = await requireAuthentication(req, res, {
    config,
    devSessions,
    authService,
  });

  if (access === undefined) {
    return;
  }

  const canViewPlatformAudit = hasProfileCapability(
    access.profile,
    "platform.view_audit",
  );
  const canViewOrganizationAudit = hasProfileCapability(
    access.profile,
    "business.view_user_actions",
  );

  if (!canViewPlatformAudit && !canViewOrganizationAudit) {
    sendJson(res, 403, {
      error: {
        code: "access_denied",
        message: "Просмотр действий пользователей недоступен.",
      },
    });
    return;
  }

  const filters = readAuditReportFilters(url);

  if (!filters.ok) {
    sendJson(res, 400, {
      error: {
        code: "invalid_response",
        message: filters.errors.join(" "),
      },
    });
    return;
  }

  sendJson(
    res,
    200,
    await audit.listReport({
      ...filters.value,
      ...(canViewPlatformAudit ? {} : { organizationOnly: true }),
    }),
  );
}

async function handleAuditEventRequest({
  req,
  res,
  config,
  devSessions,
  authService,
  audit,
}: {
  req: IncomingMessage;
  res: ServerResponse;
  config: ServerConfig;
  devSessions: Map<string, DevAccessSession>;
  authService: AuthSessionService | undefined;
  audit: AuditRepository;
}) {
  if (req.method !== "POST") {
    sendJson(res, 405, {
      error: {
        code: "access_denied",
        message: "Only POST is supported for audit events.",
      },
    });
    return;
  }

  const access = await requireAuthentication(req, res, {
    config,
    devSessions,
    authService,
  });

  if (access === undefined) {
    return;
  }

  const payload = await readJsonBody(req);
  const screen = isRecord(payload) ? readAuditScreen(payload.screenId) : undefined;

  if (screen === undefined) {
    sendJson(res, 400, {
      error: {
        code: "invalid_response",
        message: "screenId is not supported.",
      },
    });
    return;
  }

  if (!canProfileViewAuditScreen(access.profile, screen)) {
    sendJson(res, 403, {
      error: {
        code: "access_denied",
        message: "Просмотр этого экрана недоступен.",
      },
    });
    return;
  }

  await audit.record({
    actor: buildAuditActor(access.profile),
    category: "navigation",
    action: "view.screen",
    summary: `Открыт экран «${screen.title}»`,
    targetType: "screen",
    targetId: screen.id,
  });

  sendJson(res, 201, { ok: true });
}

type EquipmentReportValidationResult =
  | {
      ok: true;
      value: {
        items: ValidatedDispatcherSubmissionDraft[];
      };
    }
  | {
      ok: false;
      errors: string[];
    };

async function recordAuditEvent(
  audit: AuditRepository,
  event: Parameters<AuditRepository["record"]>[0],
) {
  await audit.record(event);
}

async function runAuditedMutation<T>({
  transaction,
  audit,
  mutate,
  buildEvent,
}: {
  transaction: DatabaseTransactionRunner;
  audit: AuditRepository;
  mutate: () => Promise<T>;
  buildEvent: (result: T) => AuditEventDraft | undefined;
}) {
  return transaction.run(async () => {
    const result = await mutate();
    const event = buildEvent(result);

    if (event !== undefined) {
      await audit.record(event);
    }

    return result;
  });
}

async function handleProductionBrandsRequest({
  req,
  res,
  config,
  devSessions,
  authService,
  productionBrands,
  audit,
  databaseTransaction,
}: {
  req: IncomingMessage;
  res: ServerResponse;
  config: ServerConfig;
  devSessions: Map<string, DevAccessSession>;
  authService: AuthSessionService | undefined;
  productionBrands: ProductionBrandsDataSource;
  audit: AuditRepository;
  databaseTransaction: DatabaseTransactionRunner;
}) {
  const access = await requireAuthentication(req, res, {
    config,
    devSessions,
    authService,
  });

  if (access === undefined) {
    return;
  }

  const canRead = hasAccountPreviewReadAccess(req, access.profile) || ([
    "business.submit_dispatcher_forms",
    "business.submit_refractory_reports",
    "business.view_dispatcher_feed",
    "business.manage_production_plan",
    "business.manage_laboratory_results",
  ] as const satisfies readonly AccountCapability[]).some((capability) =>
    hasProfileCapability(access.profile, capability),
  );

  if (!canRead) {
    sendJson(res, 403, {
      error: {
        code: "access_denied",
        message: "Справочник марок недоступен.",
      },
    });
    return;
  }

  if (req.method === "GET") {
    try {
      sendJson(res, 200, { labels: await productionBrands.list() });
    } catch (error) {
      console.warn("production_brands.google_sheets_fetch_failed", error);
      sendJson(res, 502, {
        error: {
          code: "server_error",
          message: "Не удалось загрузить марки из Google Sheets.",
        },
      });
    }
    return;
  }

  if (req.method !== "POST") {
    sendJson(res, 405, {
      error: {
        code: "access_denied",
        message: "Поддерживаются только GET и POST.",
      },
    });
    return;
  }

  if (config.appEnv === "test") {
    sendJson(res, 403, {
      error: {
        code: "access_denied",
        message: "На тестовом сайте добавление марок отключено.",
      },
    });
    return;
  }

  if (
    !hasProfileCapability(access.profile, "business.submit_dispatcher_forms") &&
    !hasProfileCapability(access.profile, "business.submit_refractory_reports")
  ) {
    sendJson(res, 403, {
      error: {
        code: "access_denied",
        message: "Добавление марок недоступно.",
      },
    });
    return;
  }

  const payload = await readJsonBody(req);
  const validation = readProductionBrandCreateInput(payload);

  if (!validation.ok) {
    sendJson(res, 400, {
      error: {
        code: "invalid_response",
        message: validation.errors.join(" "),
      },
    });
    return;
  }

  let result;

  try {
    result = await productionBrands.create(
      validation.value.label,
      (createdLabel) => databaseTransaction.run(() =>
        audit.record({
          actor: buildAuditActor(access.profile),
          category: "data_change",
          action: "production_brand.create",
          summary: `Добавлена марка «${createdLabel}»`,
          details: [{ label: "Марка", value: createdLabel }],
          targetType: "production_brand",
          targetId: createdLabel,
        }),
      ),
    );
  } catch (error) {
    console.warn("production_brands.google_sheets_write_failed", error);
    sendJson(res, 502, {
      error: {
        code: "server_error",
        message: "Не удалось добавить марку в Google Sheets.",
      },
    });
    return;
  }

  sendJson(res, result.created ? 201 : 200, { label: result.label });
}

async function handleDispatcherProductionBankContentsRequest({
  req,
  res,
  url,
  config,
  devSessions,
  authService,
  laboratoryBankAssignments,
  refractoryReports,
}: {
  req: IncomingMessage;
  res: ServerResponse;
  url: URL;
  config: ServerConfig;
  devSessions: Map<string, DevAccessSession>;
  authService: AuthSessionService | undefined;
  laboratoryBankAssignments: LaboratoryBankAssignmentsRepository | undefined;
  refractoryReports: RefractoryReportsRepository | undefined;
}) {
  const access = await requireCapability(req, res, {
    config,
    devSessions,
    authService,
    capability: "business.submit_dispatcher_forms",
    message: "Содержимое банок доступно диспетчеру.",
    alternativeNavigationItem:
      req.method === "GET" ? "admin.account_preview" : undefined,
  });

  if (access === undefined) {
    return;
  }

  if (req.method !== "GET") {
    sendJson(res, 405, {
      error: {
        code: "access_denied",
        message: "Для просмотра содержимого банок используется GET.",
      },
    });
    return;
  }

  const reportDate = url.searchParams.get("date") ?? "";

  if (!isCalendarDateQueryValue(reportDate)) {
    sendJson(res, 400, {
      error: {
        code: "invalid_response",
        message: "Укажите дату отчёта для замеров банок.",
      },
    });
    return;
  }

  if (
    laboratoryBankAssignments === undefined ||
    refractoryReports === undefined
  ) {
    sendJson(res, 503, {
      error: {
        code: "server_error",
        message: "Хранилище данных банок не настроено.",
      },
    });
    return;
  }

  const [currentAssignments, measurementSnapshot] = await Promise.all([
    laboratoryBankAssignments.listCurrent(),
    readDispatcherProductionBankMeasurements(refractoryReports, reportDate),
  ]);

  sendJson(res, 200, {
    reportDate,
    previousReportDate: measurementSnapshot.previousReportDate,
    bankContents: toDispatcherBankContents(currentAssignments),
    bankMeasurements: measurementSnapshot.bankMeasurements,
  });
}

/**
 * Наружу отдаётся только номер банки и назначенный Лабораторией материал:
 * насыпной вес и автор назначения остаются внутри лабораторного контура.
 */
function toDispatcherBankContents(
  assignments: readonly LaboratoryBankAssignment[],
) {
  return assignments.map((assignment) => ({
    bankNumber: assignment.bankNumber,
    materialLabel: assignment.materialLabel,
  }));
}

async function readDispatcherProductionBankMeasurements(
  refractoryReports: RefractoryReportsRepository,
  reportDate: string,
) {
  const previousReportDate = shiftCalendarDate(reportDate, -1);
  const reports = await refractoryReports.listLatestApprovedCoshForDates({
    reportDates: [previousReportDate, reportDate],
  });
  const reportsByDate = new Map(
    reports
      .filter((report) => report.reportType === "cosh")
      .map((report) => [report.reportDate, report]),
  );
  const startReport = reportsByDate.get(previousReportDate);
  const endReport = reportsByDate.get(reportDate);

  return {
    previousReportDate,
    bankMeasurements: bankNumbers.map((bankNumber) => ({
      bankNumber,
      ...readProductionBankMeasurementSide(startReport, bankNumber, "start"),
      ...readProductionBankMeasurementSide(endReport, bankNumber, "end"),
    })),
  };
}

function readProductionBankMeasurementSide(
  report: RefractoryReportRevision | undefined,
  bankNumber: BankNumber,
  side: "start" | "end",
) {
  if (report?.reportType !== "cosh") {
    return {};
  }

  const measurement = (report.payload as RefractoryCoshPayload)
    .jarMeasurements
    ?.find((item) => item.jarNumber === bankNumber);
  const candidate = measurement?.averageHeightMeters ??
    readAverageMeasurement(measurement?.values);
  const averageHeightMeters =
    candidate !== undefined &&
      Number.isFinite(candidate) &&
      candidate >= 0
      ? candidate
      : undefined;

  return averageHeightMeters === undefined
    ? {}
    : { [side]: averageHeightMeters };
}

function readAverageMeasurement(values: readonly number[] | undefined) {
  if (
    values === undefined ||
    values.length === 0 ||
    values.some((value) => !Number.isFinite(value) || value < 0)
  ) {
    return undefined;
  }

  const average = values.reduce((total, value) => total + value, 0) /
    values.length;
  return Math.round((average + Number.EPSILON) * 1_000) / 1_000;
}

function shiftCalendarDate(value: string, dayOffset: number) {
  const [year, month, day] = value.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + dayOffset));
  return shifted.toISOString().slice(0, 10);
}

function readIsoDispatcherReportDate(value: string | undefined) {
  const trimmed = value?.trim();

  if (trimmed === undefined) {
    return undefined;
  }

  if (isCalendarDateQueryValue(trimmed)) {
    return trimmed;
  }

  const russian = /^(\d{2})\.(\d{2})\.(\d{4})$/u.exec(trimmed);
  const iso = russian === null
    ? undefined
    : `${russian[3]}-${russian[2]}-${russian[1]}`;

  return iso !== undefined && isCalendarDateQueryValue(iso) ? iso : undefined;
}

function buildProductionPayloadWithBankMeasurements({
  payload,
  reportDate,
  bankMeasurements,
}: {
  payload: DispatcherSubmission["payload"];
  reportDate: string;
  bankMeasurements: ReadonlyArray<{
    bankNumber: BankNumber;
    start?: number;
    end?: number;
  }>;
}) {
  const nextPayload: DispatcherSubmission["payload"] = {
    ...payload,
    reportDate,
  };

  delete nextPayload.reportMonth;

  for (const bankNumber of bankNumbers) {
    delete nextPayload[`jarStart${bankNumber}`];
    delete nextPayload[`jarEnd${bankNumber}`];
  }

  for (const measurement of bankMeasurements) {
    if (measurement.start !== undefined) {
      nextPayload[`jarStart${measurement.bankNumber}`] =
        String(measurement.start);
    }

    if (measurement.end !== undefined) {
      nextPayload[`jarEnd${measurement.bankNumber}`] = String(measurement.end);
    }
  }

  return nextPayload;
}

async function handleProductionSnapshotRequest({
  req,
  res,
  config,
  productionSnapshot,
}: {
  req: IncomingMessage;
  res: ServerResponse;
  config: ServerConfig;
  productionSnapshot: ProductionDatabaseSnapshotService | undefined;
}) {
  if (config.appEnv !== "test") {
    sendJson(res, 404, {
      error: {
        code: "not_found",
        message: "Endpoint not found.",
      },
    });
    return;
  }

  if (req.method === "GET") {
    sendJson(res, 200, {
      available: productionSnapshot !== undefined,
      inProgress: productionSnapshot?.isRunning() ?? false,
      confirmationPhrase: productionSnapshotConfirmation,
    });
    return;
  }

  if (req.method !== "POST") {
    sendJson(res, 405, {
      error: {
        code: "access_denied",
        message: "Only GET and POST are supported for production snapshots.",
      },
    });
    return;
  }

  if (productionSnapshot === undefined) {
    sendJson(res, 503, {
      error: {
        code: "server_not_configured",
        message: "Синхронизация с production не настроена на сервере.",
      },
    });
    return;
  }

  const payload = await readJsonBody(req);
  const confirmation = isRecord(payload) && typeof payload.confirmation === "string"
    ? payload.confirmation
    : "";

  if (confirmation !== productionSnapshotConfirmation) {
    sendJson(res, 400, {
      error: {
        code: "validation_error",
        message: "Введите указанную фразу подтверждения без изменений.",
      },
    });
    return;
  }

  try {
    const result = await productionSnapshot.replaceTestDatabase();
    console.info("production_snapshot.completed", {
      tableCount: result.tableCount,
      rowCount: result.rowCount,
      authSessionsCleared: result.authSessionsCleared,
    });

    sendJson(res, 200, {
      ok: true,
      ...result,
    });
  } catch (error) {
    if (error instanceof ProductionSnapshotAlreadyRunningError) {
      sendJson(res, 409, {
        error: {
          code: "conflict",
          message: "Синхронизация уже выполняется.",
        },
      });
      return;
    }

    if (error instanceof ProductionSnapshotSchemaMismatchError) {
      sendJson(res, 409, {
        error: {
          code: "conflict",
          message: "Структуры test и production различаются. Сначала обновите обе среды до одной версии.",
        },
      });
      return;
    }

    if (error instanceof ProductionSnapshotRestoreError) {
      console.error("production_snapshot.restore_error", error);
      sendJson(res, 500, {
        error: {
          code: "server_error",
          message: "Не удалось заменить тестовую БД. Проверьте серверный журнал.",
        },
      });
      return;
    }

    throw error;
  }
}

function readProductionBrandCreateInput(payload: unknown) {
  if (!isRecord(payload) || Array.isArray(payload)) {
    return {
      ok: false as const,
      errors: ["Передайте название марки."],
    };
  }

  const allowedFields = new Set(["label"]);
  const unexpectedFields = Object.keys(payload).filter(
    (fieldName) => !allowedFields.has(fieldName),
  );

  if (unexpectedFields.length > 0) {
    return {
      ok: false as const,
      errors: ["Запрос содержит неизвестные поля."],
    };
  }

  return normalizeProductionBrandLabelInput(payload.label);
}

async function handleProductionPlansRequest({
  req,
  res,
  url,
  config,
  devSessions,
  authService,
  dispatcherSubmissions,
  productionPlans,
  audit,
  databaseTransaction,
}: {
  req: IncomingMessage;
  res: ServerResponse;
  url: URL;
  config: ServerConfig;
  devSessions: Map<string, DevAccessSession>;
  authService: AuthSessionService | undefined;
  dispatcherSubmissions: DispatcherSubmissionsRepository;
  productionPlans: ProductionPlansRepository | undefined;
  audit: AuditRepository;
  databaseTransaction: DatabaseTransactionRunner;
}) {
  if (url.pathname === "/api/production-plans/daily") {
    const access = await requireAuthentication(req, res, {
      config,
      devSessions,
      authService,
    });

    if (access === undefined) {
      return;
    }

    const canReadDailyPlan = hasAccountPreviewReadAccess(req, access.profile) || ([
      "business.manage_production_plan",
      "business.submit_dispatcher_forms",
      "business.view_dispatcher_feed",
    ] as const satisfies readonly AccountCapability[]).some((capability) =>
      hasProfileCapability(access.profile, capability),
    );

    if (!canReadDailyPlan) {
      sendJson(res, 403, {
        error: {
          code: "access_denied",
          message: "План выработки недоступен.",
        },
      });
      return;
    }

    if (req.method !== "GET") {
      sendJson(res, 405, {
        error: {
          code: "access_denied",
          message: "Для просмотра дневного плана используется GET.",
        },
      });
      return;
    }

    if (productionPlans === undefined) {
      sendJson(res, 503, {
        error: {
          code: "server_error",
          message: "Хранилище планов выработки не настроено.",
        },
      });
      return;
    }

    const date = url.searchParams.get("date") ?? "";

    if (!isCalendarDateQueryValue(date)) {
      sendJson(res, 400, {
        error: {
          code: "invalid_response",
          message: "Укажите дату в формате ГГГГ-ММ-ДД.",
        },
      });
      return;
    }

    const month = date.slice(0, 7);
    const [revision, productionSubmissions] = await Promise.all([
      productionPlans.readLatest(month),
      listAllProductionSubmissions(dispatcherSubmissions, month),
    ]);
    const values = revision === undefined
      ? []
      : productionCategories.flatMap((category) => {
          const schedule = revision.schedules[category];

          if (schedule === undefined) {
            return [];
          }

          const dailyPlan = schedule.dailyPlans.find(
            (item) => item.date === date,
          );

          return dailyPlan === undefined
            ? []
            : [[category, dailyPlan.value] as const];
        });

    const monthToDate = buildProductionMonthToDate(
      productionSubmissions,
      revision,
      date,
    );

    sendJson(res, 200, {
      plan:
        values.length === 0 && Object.keys(monthToDate).length === 0
          ? null
          : { date, values: Object.fromEntries(values), monthToDate },
    });
    return;
  }

  const access = await requireCapability(req, res, {
    config,
    devSessions,
    authService,
    capability: "business.manage_production_plan",
    message: "План выработки доступен только экономисту.",
  });

  if (access === undefined) {
    return;
  }

  if (url.pathname === "/api/production-plans/preview") {
    if (req.method !== "POST") {
      sendJson(res, 405, {
        error: {
          code: "access_denied",
          message: "Для расчёта рабочих дней используется POST.",
        },
      });
      return;
    }

    const validation = readProductionPlanPreviewInput(await readJsonBody(req));

    if (!validation.ok) {
      sendJson(res, 400, {
        error: {
          code: "invalid_response",
          message: validation.errors.join(" "),
        },
      });
      return;
    }

    const presets = buildProductionPlanDatePresets(validation.value.month);

    if (presets.allDates.length === 0) {
      sendJson(res, 400, {
        error: {
          code: "invalid_response",
          message: "Укажите месяц в формате ГГГГ-ММ.",
        },
      });
      return;
    }

    sendJson(res, 200, {
      month: validation.value.month,
      allDates: presets.allDates,
      weekdayDates: presets.weekdayDates,
    });
    return;
  }

  if (productionPlans === undefined) {
    sendJson(res, 503, {
      error: {
        code: "server_error",
        message: "Хранилище планов выработки не настроено.",
      },
    });
    return;
  }

  if (req.method === "GET") {
    const month = url.searchParams.get("month") ?? "";

    if (buildProductionPlanDatePresets(month).allDates.length === 0) {
      sendJson(res, 400, {
        error: {
          code: "invalid_response",
          message: "Укажите месяц в формате ГГГГ-ММ.",
        },
      });
      return;
    }

    sendJson(res, 200, {
      plan: (await productionPlans.readLatest(month)) ?? null,
    });
    return;
  }

  if (req.method !== "POST") {
    sendJson(res, 405, {
      error: {
        code: "access_denied",
        message: "Поддерживаются только GET и POST.",
      },
    });
    return;
  }

  const validation = readProductionPlanSaveInput(await readJsonBody(req));

  if (!validation.ok) {
    sendJson(res, 400, {
      error: {
        code: "invalid_response",
        message: validation.errors.join(" "),
      },
    });
    return;
  }

  const planValidation = buildProductionCategoryPlan(validation.value);

  if (!planValidation.ok) {
    sendJson(res, 400, {
      error: {
        code: "invalid_response",
        message: planValidation.errors.join(" "),
      },
    });
    return;
  }

  const revision = await runAuditedMutation({
    transaction: databaseTransaction,
    audit,
    mutate: async () => {
      const current = await productionPlans.readLatestForUpdate(
        validation.value.month,
      );

      return productionPlans.saveRevision({
        plan: {
          month: validation.value.month,
          schedules: {
            ...current?.schedules,
            [planValidation.category]: planValidation.schedule,
          },
        },
        createdByUserId: access.profile.userId,
      });
    },
    buildEvent: (saved) => ({
      actor: buildAuditActor(access.profile),
      category: "data_change",
      action: "production_plan.save",
      summary: `Сохранён план «${productionCategoryLabels[planValidation.category]}» за ${saved.month}`,
      details: [
        { label: "Месяц", value: saved.month },
        {
          label: "Категория",
          value: productionCategoryLabels[planValidation.category],
        },
        {
          label: "Месячный план",
          value: String(planValidation.schedule.monthlyPlan),
        },
        {
          label: "Рабочих дней",
          value: String(planValidation.schedule.workingDayCount),
        },
        {
          label: "Ежедневный план",
          value: planValidation.schedule.dailyPlans
            .map((item) => `${item.date}: ${item.value}`)
            .join(", "),
        },
      ],
      targetType: "production_plan",
      targetId: saved.revisionId,
    }),
  });

  sendJson(res, 201, { plan: revision });
}

type ProductionPlanPreviewInputResult =
  | {
      ok: true;
      value: { month: string };
    }
  | { ok: false; errors: string[] };

function readProductionPlanPreviewInput(
  value: unknown,
): ProductionPlanPreviewInputResult {
  if (!isRecord(value)) {
    return { ok: false, errors: ["Передайте месяц."] };
  }

  const unknownFields = Object.keys(value).filter(
    (key) => key !== "month",
  );

  if (unknownFields.length > 0) {
    return { ok: false, errors: ["Запрос содержит неизвестные поля."] };
  }

  if (typeof value.month !== "string") {
    return { ok: false, errors: ["Передайте месяц."] };
  }

  return {
    ok: true,
    value: { month: value.month },
  };
}

type ProductionPlanSaveInputResult =
  | {
      ok: true;
      value: {
        month: string;
        category: ProductionCategory;
        schedule: ProductionCategoryScheduleInput;
      };
    }
  | { ok: false; errors: string[] };

function readProductionPlanSaveInput(
  value: unknown,
): ProductionPlanSaveInputResult {
  if (!isRecord(value)) {
    return { ok: false, errors: ["Передайте параметры плана выработки."] };
  }

  const unknownFields = Object.keys(value).filter(
    (key) => key !== "month" && key !== "category" && key !== "schedule",
  );

  if (unknownFields.length > 0) {
    return { ok: false, errors: ["Запрос содержит неизвестные поля."] };
  }

  const category = typeof value.category === "string" &&
    productionCategories.includes(value.category as ProductionCategory)
    ? value.category as ProductionCategory
    : undefined;
  const schedule = readProductionCategoryScheduleInput(value.schedule);

  if (
    typeof value.month !== "string" ||
    category === undefined ||
    schedule === undefined
  ) {
    return { ok: false, errors: ["Проверьте месяц, планы и рабочие дни."] };
  }

  return {
    ok: true,
    value: {
      month: value.month,
      category,
      schedule,
    },
  };
}

function readProductionCategoryScheduleInput(
  value: unknown,
): ProductionCategoryScheduleInput | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  if (
    Object.keys(value).length !== 2 ||
    typeof value.monthlyPlan !== "number" ||
    !Number.isFinite(value.monthlyPlan) ||
    !Array.isArray(value.workingDates) ||
    !value.workingDates.every((date) => typeof date === "string")
  ) {
    return undefined;
  }

  return {
    monthlyPlan: value.monthlyPlan,
    workingDates: value.workingDates,
  };
}

function buildSafeAuditDetails(values: Record<string, AdminDatabaseCellValue>) {
  return Object.entries(values).flatMap(([label, rawValue]) => {
    if (
      /password|secret|token|session|hash/iu.test(label) ||
      /^(?:id|.*_id|.*Id)$/u.test(label)
    ) {
      return [];
    }

    return [{
      label: readAdminDatabaseFieldLabel(label),
      value: rawValue === null
        ? "Пусто"
        : typeof rawValue === "string"
          ? rawValue
          : String(rawValue),
    }];
  });
}

function readAdminDatabaseFieldLabel(fieldName: string) {
  const labels: Record<string, string> = {
    display_name: "Название",
    login: "Логин",
    status: "Статус",
    access_status: "Доступ",
    fio: "ФИО посетителя",
    position: "Должность",
    organization: "Организация",
    purpose: "Цель визита",
    whom: "Кого посещает",
    note: "Примечание",
    reportDate: "Дата отчёта",
    equipment: "Оборудование",
    productionTons: "Выработка",
    downtimeReason: "Причина простоя",
    downtimeHours: "Время простоя",
    datetime: "Дата и время инцидента",
    location: "Место",
    incidentType: "Тип инцидента",
    description: "Описание",
    criticality: "Критичность",
    responsible: "Ответственный",
    immediateActions: "Оперативные меры",
    incidentNumber: "Номер инцидента",
    rootCauses: "Корневые причины",
    preventiveMeasures: "Предотвращающие меры",
    closureDateTime: "Дата и время закрытия",
    costs: "Затраты",
    approvedBy: "Кто утвердил",
    closureNote: "Примечание",
  };

  const publicFieldName = fieldName.startsWith("payload.")
    ? fieldName.slice("payload.".length)
    : fieldName;

  return labels[publicFieldName] ?? publicFieldName;
}

function buildAccountAuditDetails(account: AdminAccountSummary | undefined) {
  if (account === undefined) {
    return [];
  }

  return [
    { label: "Пользователь", value: account.userDisplayName },
    { label: "Логин", value: account.login },
    { label: "Должность", value: account.positionDisplayName },
  ];
}

function buildAccountPositionChangeAuditDetails(
  previous: AdminAccountSummary,
  updated: AdminAccountSummary,
) {
  return [
    { label: "Пользователь", value: updated.userDisplayName },
    { label: "Логин", value: updated.login },
    {
      label: "Прежняя должность",
      value: `${previous.positionDisplayName} (${previous.position})`,
    },
    {
      label: "Новая должность",
      value: `${updated.positionDisplayName} (${updated.position})`,
    },
  ];
}

function buildPositionAuditDetails(position: AdminPositionSummary) {
  return [
    { label: "Должность", value: position.displayName },
    {
      label: "Вкладки",
      value: position.navigationItems.length === 0
        ? "Нет"
        : position.navigationItems.map(readNavigationItemLabel).join(", "),
    },
  ];
}

function readNavigationItemLabel(item: AccountNavigationItem) {
  const labels: Record<AccountNavigationItem, string> = {
    "admin.account_preview": "Просмотр аккаунта",
    "admin.accounts": "Учётные записи",
    "admin.database": "БД",
    "admin.user_actions": "Действия пользователей",
    "business.overview": "Обзор",
    "business.dispatcher": "Диспетчерская",
    "business.work": "Работа",
    "business.user_actions": "Действия пользователей",
    "business.production_plan": "План выработки",
    "business.refractory_shop": "Огнеупорный цех",
    "business.laboratory_results": "Результаты испытаний",
    "business.laboratory_review": "Лаборатория",
    "business.board_assignments": "Поручения Совета директоров",
    "business.dispatcher_form": "Форма",
  };

  return labels[item];
}

function readAdminDatabaseSectionLabel(tableName: string) {
  const labels: Record<string, string> = {
    app_users: "Пользователи",
    dispatcher_submissions: "Диспетчерские записи",
  };

  return labels[tableName] ?? tableName;
}

async function handleAdminDatabaseRequest({
  req,
  res,
  url,
  config,
  devSessions,
  authService,
  adminDatabase,
  accounts,
  dispatcherSpreadsheetImport,
  productionBrands,
  audit,
  databaseTransaction,
  productionSnapshot,
}: {
  req: IncomingMessage;
  res: ServerResponse;
  url: URL;
  config: ServerConfig;
  devSessions: Map<string, DevAccessSession>;
  authService: AuthSessionService | undefined;
  adminDatabase: AdminDatabaseRepository | undefined;
  accounts: AccountsRepository | undefined;
  dispatcherSpreadsheetImport: DispatcherSpreadsheetImportService | undefined;
  productionBrands: ProductionBrandsDataSource;
  audit: AuditRepository;
  databaseTransaction: DatabaseTransactionRunner;
  productionSnapshot: ProductionDatabaseSnapshotService | undefined;
}) {
  const access = await requireCapability(req, res, {
    config,
    devSessions,
    authService,
    capability: "platform.manage_analytics_database",
    message: "Admin database access is required.",
  });

  if (access === undefined) {
    return;
  }

  if (url.pathname === "/api/admin/database/production-snapshot") {
    await handleProductionSnapshotRequest({
      req,
      res,
      config,
      productionSnapshot,
    });
    return;
  }

  if (url.pathname.startsWith("/api/admin/database/imports/dispatcher")) {
    await handleAdminDispatcherImportRequest({
      req,
      res,
      url,
      access,
      dispatcherSpreadsheetImport,
      audit,
      databaseTransaction,
    });
    return;
  }

  if (adminDatabase === undefined) {
    sendJson(res, 503, {
      error: {
        code: "server_error",
        message: "Admin database repository is not configured.",
      },
    });
    return;
  }

  if (url.pathname === "/api/admin/database") {
    if (req.method !== "GET") {
      sendJson(res, 405, {
        error: {
          code: "access_denied",
          message: "Only GET is supported for admin database tables.",
        },
      });
      return;
    }

    try {
      sendJson(res, 200, {
        tables: await adminDatabase.listTables(),
      });
    } catch (error) {
      sendAdminDatabaseError(res, error);
    }

    return;
  }

  const route = readAdminDatabaseRowsRoute(url);

  if (route === undefined) {
    sendJson(res, 404, {
      error: {
        code: "not_found",
        message: "Admin database endpoint not found.",
      },
    });
    return;
  }

  try {
    if (route.merge) {
      if (req.method !== "POST") {
        sendJson(res, 405, {
          error: {
            code: "access_denied",
            message: "Only POST is supported for merging admin database rows.",
          },
        });
        return;
      }

      const validation = readAdminDatabaseMergePayload(await readJsonBody(req));

      if (!validation.ok) {
        sendJson(res, 400, {
          error: {
            code: "invalid_response",
            message: validation.errors.join(" "),
          },
        });
        return;
      }

      await runAuditedMutation({
        transaction: databaseTransaction,
        audit,
        mutate: () => adminDatabase.mergeRows({
          tableName: route.tableName,
          ...validation.value,
        }),
        buildEvent: (result) => ({
          actor: buildAuditActor(access.profile),
          category: "data_change",
          action: "data.update",
          summary: `Марка «${result.sourceLabel}» слита в «${result.targetLabel}»`,
          details: [
            { label: "Исходная марка", value: result.sourceLabel },
            { label: "Целевая марка", value: result.targetLabel },
            { label: "Обновлено отчётов", value: String(result.updatedSubmissions) },
            { label: "Объединено фактов", value: String(result.combinedFacts) },
          ],
          targetType: "production_brand",
          targetId: route.tableName,
        }),
      });
      sendJson(res, 200, { ok: true });
      return;
    }

    if (route.clearAll) {
      if (req.method !== "DELETE") {
        sendJson(res, 405, {
          error: {
            code: "access_denied",
            message: "Only DELETE is supported for clearing an admin database table.",
          },
        });
        return;
      }

      const validation = readAdminDatabaseClearPayload(
        await readJsonBody(req),
        route.tableName,
      );

      if (!validation.ok) {
        sendJson(res, 400, {
          error: {
            code: "invalid_response",
            message: validation.errors.join(" "),
          },
        });
        return;
      }

      const deleted = await runAuditedMutation({
        transaction: databaseTransaction,
        audit,
        mutate: () => adminDatabase.clearTable(route.tableName),
        buildEvent: (result) => ({
          actor: buildAuditActor(access.profile),
          category: "data_change",
          action: "data.clear",
          summary: `Очищен раздел «${readAdminDatabaseSectionLabel(route.tableName)}»`,
          details: [{ label: "Удалено записей", value: String(result) }],
          targetType: "database_section",
          targetId: route.tableName,
        }),
      });
      sendJson(res, 200, { ok: true, deleted });
      return;
    }

    if (req.method === "GET") {
      const query = readAdminDatabaseRowsQuery(url);

      if (!query.ok) {
        sendJson(res, 400, {
          error: {
            code: "invalid_response",
            message: query.errors.join(" "),
          },
        });
        return;
      }

      const rows = await adminDatabase.listRows(
        route.tableName,
        query.value,
      );
      sendJson(
        res,
        200,
        route.tableName === "dispatcher_submissions"
          ? addProductionBrandsToAdminDispatcherRows(
              rows,
              await productionBrands.list(),
            )
          : rows,
      );
      return;
    }

    if (req.method === "PATCH") {
      const payload = await readJsonBody(req);
      const validation = readAdminDatabaseMutationPayload(payload);

      if (!validation.ok) {
        sendJson(res, 400, {
          error: {
            code: "invalid_response",
            message: validation.errors.join(" "),
          },
        });
        return;
      }

      if (
        isUnsafeCurrentAccountDatabaseMutation(
          route.tableName,
          validation.value,
          access.profile,
        )
      ) {
        sendJson(res, 400, {
          error: {
            code: "access_denied",
            message: "Нельзя отключить текущую учётную запись через БД.",
          },
        });
        return;
      }

      if (
        route.tableName === "app_users" &&
        accounts !== undefined &&
        typeof validation.value.primaryKey.id === "string"
      ) {
        const accountList = await accounts.listAccounts();
        const targetAccount = accountList.find(
          (account) => account.userId === validation.value.primaryKey.id,
        );
        if (
          targetAccount?.isProtected === true &&
          !(await readCanAssignAdminNavigation({
            profile: access.profile,
            accounts,
            devAccessEnabled: config.devAccessEnabled,
          }))
        ) {
          sendProtectedAccountMutationDenied(res);
          return;
        }
      }

      const missingCapability = readMissingAdminDatabaseMutationCapability(
        route.tableName,
        validation.value.values,
        access.profile,
      );

      if (missingCapability !== undefined) {
        sendJson(res, 403, {
          error: {
            code: "access_denied",
            message: "Недостаточно прав для изменения выбранных данных.",
          },
        });
        return;
      }

      const brandReferences = readAdminDispatcherBrandReferences(
        route.tableName,
        validation.value.values,
      );

      if (brandReferences.length > 0) {
        const references = await resolveProductionBrandReferencesForRequest({
          res,
          productionBrands,
          references: brandReferences,
          logEvent: "admin_dispatcher_brands.google_sheets_fetch_failed",
        });

        if (references === undefined) return;
        for (const reference of references) {
          validation.value.values[reference.fieldName] = reference.label;
        }
      }

      await runAuditedMutation({
        transaction: databaseTransaction,
        audit,
        mutate: async () => adminDatabase.updateRow({
          tableName: route.tableName,
          primaryKey: validation.value.primaryKey,
          values: validation.value.values,
          changedByAccountId: access.profile.activeAccess.accountId,
          allowProtectedAccounts:
            accounts !== undefined &&
            await readCanAssignAdminNavigation({
              profile: access.profile,
              accounts,
              devAccessEnabled: config.devAccessEnabled,
            }),
        }),
        buildEvent: () => ({
          actor: buildAuditActor(access.profile),
          category: "data_change",
          action: "data.update",
          summary: `Изменена запись в разделе «${readAdminDatabaseSectionLabel(route.tableName)}»`,
          details: buildSafeAuditDetails(validation.value.values),
          targetType: "database_row",
          targetId: route.tableName,
        }),
      });
      sendJson(res, 200, { ok: true });
      return;
    }

    if (req.method === "DELETE") {
      const payload = await readJsonBody(req);
      const validation = readAdminDatabaseMutationPayload(payload);

      if (!validation.ok) {
        sendJson(res, 400, {
          error: {
            code: "invalid_response",
            message: validation.errors.join(" "),
          },
        });
        return;
      }

      await runAuditedMutation({
        transaction: databaseTransaction,
        audit,
        mutate: () => adminDatabase.deleteRow({
          tableName: route.tableName,
          primaryKey: validation.value.primaryKey,
        }),
        buildEvent: () => ({
          actor: buildAuditActor(access.profile),
          category: "data_change",
          action: "data.delete",
          summary: `Удалена запись из раздела «${readAdminDatabaseSectionLabel(route.tableName)}»`,
          details: buildSafeAuditDetails(validation.value.primaryKey),
          targetType: "database_row",
          targetId: route.tableName,
        }),
      });
      sendJson(res, 200, { ok: true });
      return;
    }

    sendJson(res, 405, {
      error: {
        code: "access_denied",
        message: "Only GET, PATCH and DELETE are supported for admin database rows.",
      },
    });
  } catch (error) {
    sendAdminDatabaseError(res, error);
  }
}

function isUnsafeCurrentAccountDatabaseMutation(
  tableName: string,
  mutation: {
    primaryKey: Record<string, AdminDatabaseCellValue>;
    values: Record<string, AdminDatabaseCellValue>;
  },
  profile: ServerUserProfile,
) {
  if (
    tableName === "app_users" &&
    mutation.primaryKey.id === profile.userId
  ) {
    const status = mutation.values.status;
    return typeof status === "string" && status !== "active";
  }

  return false;
}

function readMissingAdminDatabaseMutationCapability(
  tableName: string,
  values: Record<string, AdminDatabaseCellValue>,
  profile: ServerUserProfile,
): AccountCapability | undefined {
  const required: AccountCapability[] = [];

  if (tableName === "app_users") {
    required.push("platform.manage_users");
    if (values.status !== undefined) required.push("platform.manage_access");
  }

  return required.find((capability) => !hasProfileCapability(profile, capability));
}

async function handleAdminDispatcherImportRequest({
  req,
  res,
  url,
  access,
  dispatcherSpreadsheetImport,
  audit,
  databaseTransaction,
}: {
  req: IncomingMessage;
  res: ServerResponse;
  url: URL;
  access: { profile: ServerUserProfile; source: "auth" | "dev" };
  dispatcherSpreadsheetImport: DispatcherSpreadsheetImportService | undefined;
  audit: AuditRepository;
  databaseTransaction: DatabaseTransactionRunner;
}) {
  if (dispatcherSpreadsheetImport === undefined) {
    sendJson(res, 503, {
      error: {
        code: "server_error",
        message: "Импорт Google Sheets не настроен.",
      },
    });
    return;
  }

  try {
    if (
      url.pathname === "/api/admin/database/imports/dispatcher/preview" &&
      req.method === "POST"
    ) {
      const validation = readAdminDispatcherImportPayload(await readJsonBody(req));

      if (!validation.ok) {
        sendJson(res, 400, {
          error: {
            code: "invalid_response",
            message: validation.errors.join(" "),
          },
        });
        return;
      }

      const preview = await dispatcherSpreadsheetImport.preview(validation.value);
      await recordAuditEvent(audit, {
        actor: buildAuditActor(access.profile),
        category: "administration",
        action: "data.import_preview",
        summary: "Проверен импорт диспетчерских данных",
        details: [
          { label: "Всего записей", value: String(preview.totalRecords) },
          { label: "Новых записей", value: String(preview.newRecords) },
        ],
        targetType: "dispatcher_import",
      });
      sendJson(res, 200, preview);
      return;
    }

    if (
      url.pathname === "/api/admin/database/imports/dispatcher/execute" &&
      req.method === "POST"
    ) {
      const validation = readAdminDispatcherImportPayload(
        await readJsonBody(req),
        true,
      );

      if (!validation.ok || validation.value.previewToken === undefined) {
        sendJson(res, 400, {
          error: {
            code: "invalid_response",
            message: validation.ok
              ? "previewToken is required."
              : validation.errors.join(" "),
          },
        });
        return;
      }

      const previewToken = validation.value.previewToken;
      const result = await runAuditedMutation({
        transaction: databaseTransaction,
        audit,
        mutate: () => dispatcherSpreadsheetImport.execute({
          ...validation.value,
          previewToken,
          submittedByAccountId: access.profile.activeAccess.accountId,
        }),
        buildEvent: (importResult) => ({
          actor: buildAuditActor(access.profile),
          category: "data_change",
          action: "data.import",
          summary: "Импортированы диспетчерские данные",
          details: [
            { label: "Добавлено записей", value: String(importResult.inserted) },
            { label: "Пропущено записей", value: String(importResult.skipped) },
          ],
          targetType: "dispatcher_import",
        }),
      });
      sendJson(res, 200, result);
      return;
    }

    sendJson(res, 405, {
      error: {
        code: "access_denied",
        message: "Unsupported dispatcher import request.",
      },
    });
  } catch (error) {
    sendJson(res, error instanceof DispatcherSpreadsheetImportChangedError ? 409 : 400, {
      error: {
        code: "invalid_response",
        message:
          error instanceof Error ? error.message : "Не удалось выполнить импорт.",
      },
    });
  }
}

async function handleAdminAccountsRequest({
  req,
  res,
  url,
  config,
  devSessions,
  authService,
  accounts,
  audit,
  databaseTransaction,
}: {
  req: IncomingMessage;
  res: ServerResponse;
  url: URL;
  config: ServerConfig;
  devSessions: Map<string, DevAccessSession>;
  authService: AuthSessionService | undefined;
  accounts: AccountsRepository | undefined;
  audit: AuditRepository;
  databaseTransaction: DatabaseTransactionRunner;
}) {
  const accountPositionPathMatch =
    /^\/api\/admin\/accounts\/([^/]+)\/position$/u.exec(url.pathname);
  const accountPositionAccessId =
    accountPositionPathMatch === null
      ? undefined
      : decodeURIComponent(accountPositionPathMatch[1] ?? "");
  const accountProtectionPathMatch =
    /^\/api\/admin\/accounts\/([^/]+)\/protection$/u.exec(url.pathname);
  const accountProtectionUserId =
    accountProtectionPathMatch === null
      ? undefined
      : decodeURIComponent(accountProtectionPathMatch[1] ?? "");
  const isLoginStatusUpdate =
    url.pathname === "/api/admin/accounts" && req.method === "PATCH";
  const isAccountPositionUpdate =
    accountPositionAccessId !== undefined && req.method === "PATCH";
  const isAccountProtectionUpdate =
    accountProtectionUserId !== undefined && req.method === "PATCH";
  const isPositionRequest = url.pathname.startsWith("/api/admin/positions");
  const isAccountDelete =
    url.pathname.startsWith("/api/admin/accounts/") &&
    url.pathname !== "/api/admin/accounts/reset-password" &&
    req.method === "DELETE";
  const requiresManageAccess =
    isLoginStatusUpdate || isAccountPositionUpdate || isAccountProtectionUpdate ||
    isPositionRequest || isAccountDelete ||
    (url.pathname === "/api/admin/accounts" && req.method === "POST");
  const readOnlyNavigationItem =
    req.method === "GET" &&
    (url.pathname === "/api/admin/accounts" ||
      url.pathname === "/api/admin/positions")
      ? "admin.account_preview"
      : undefined;
  const access = await requireCapability(req, res, {
    config,
    devSessions,
    authService,
    capability: requiresManageAccess
      ? "platform.manage_access"
      : "platform.manage_users",
    message: isLoginStatusUpdate || isAccountPositionUpdate
      ? "Управление доступом к учётным записям недоступно."
      : "Управление учётными записями недоступно.",
    alternativeNavigationItem: readOnlyNavigationItem,
  });

  if (access === undefined) {
    return;
  }

  if (accounts === undefined) {
    sendJson(res, 503, {
      error: {
        code: "server_error",
        message: "Хранилище учётных записей не настроено.",
      },
    });
    return;
  }

  let canAssignAdminNavigationPromise: Promise<boolean> | undefined;
  const canAssignAdminNavigation = () => {
    canAssignAdminNavigationPromise ??= readCanAssignAdminNavigation({
      profile: access.profile,
      accounts,
      devAccessEnabled: config.devAccessEnabled,
    });
    return canAssignAdminNavigationPromise;
  };

  if (accountProtectionUserId !== undefined) {
    if (req.method !== "PATCH") {
      sendJson(res, 405, {
        error: { code: "access_denied", message: "Метод не поддерживается." },
      });
      return;
    }
    if (!(await canAssignAdminNavigation())) {
      sendJson(res, 403, {
        error: {
          code: "access_denied",
          message:
            "Защиту учётных записей может изменять только исходный аккаунт admin.",
        },
      });
      return;
    }

    const validation = validateSetAccountProtectionRequest(
      await readJsonBody(req),
      accountProtectionUserId,
    );
    if (!validation.ok) {
      sendJson(res, 400, {
        error: {
          code: "invalid_response",
          message: validation.errors.join(" "),
        },
      });
      return;
    }

    const targetAccount = (await accounts.listAccounts()).find(
      (account) => account.userId === accountProtectionUserId,
    );
    if (
      targetAccount !== undefined &&
      isCanonicalAdminLogin(targetAccount.login) &&
      !validation.value.isProtected
    ) {
      sendJson(res, 409, {
        error: {
          code: "invalid_response",
          message: "Защиту исходного аккаунта admin нельзя отключить.",
        },
      });
      return;
    }
    const protection = await runAuditedMutation({
      transaction: databaseTransaction,
      audit,
      mutate: () => accounts.setAccountProtected(validation.value),
      buildEvent: (updatedProtection) =>
        updatedProtection === undefined ||
          targetAccount?.isProtected === updatedProtection.isProtected
          ? undefined
          : {
              actor: buildAuditActor(access.profile),
              category: "administration",
              action: updatedProtection.isProtected
                ? "admin.account_protection_enable"
                : "admin.account_protection_disable",
              summary: `${updatedProtection.isProtected ? "Включена" : "Отключена"} защита учётной записи «${targetAccount?.userDisplayName ?? "Пользователь"}»`,
              details: buildAccountAuditDetails(targetAccount),
              targetType: "user_account",
              targetId: accountProtectionUserId,
            },
    });
    if (protection === undefined) {
      sendJson(res, 404, {
        error: { code: "not_found", message: "Учётная запись не найдена." },
      });
      return;
    }
    sendJson(res, 200, protection);
    return;
  }

  if (accountPositionAccessId !== undefined) {
    if (req.method !== "PATCH") {
      sendJson(res, 405, {
        error: { code: "access_denied", message: "Метод не поддерживается." },
      });
      return;
    }

    if (accountPositionAccessId === access.profile.activeAccess.accountId) {
      sendJson(res, 409, {
        error: {
          code: "invalid_response",
          message: "Нельзя менять должность текущей учётной записи.",
        },
      });
      return;
    }

    const targetAccount = (await accounts.listAccounts()).find(
      (account) => account.accessId === accountPositionAccessId,
    );

    if (targetAccount === undefined) {
      sendJson(res, 404, {
        error: { code: "not_found", message: "Учётная запись не найдена." },
      });
      return;
    }

    if (targetAccount.userId === access.profile.userId) {
      sendJson(res, 409, {
        error: {
          code: "invalid_response",
          message: "Нельзя менять должность текущей учётной записи.",
        },
      });
      return;
    }

    if (
      targetAccount.isProtected &&
      !(await canAssignAdminNavigation())
    ) {
      sendProtectedAccountMutationDenied(res);
      return;
    }

    const validation = validateSetAccountPositionRequest(await readJsonBody(req));

    if (!validation.ok) {
      sendJson(res, 400, {
        error: {
          code: "invalid_response",
          message: validation.errors.join(" "),
        },
      });
      return;
    }

    const targetPosition = (await accounts.listPositions()).find(
      (position) => position.id === validation.value.position,
    );

    if (targetPosition === undefined) {
      sendJson(res, 400, {
        error: { code: "invalid_response", message: "Должность не найдена." },
      });
      return;
    }
    if (
      hasAdminNavigationItems(targetPosition.navigationItems) &&
      !(await canAssignAdminNavigation())
    ) {
      sendAdminNavigationAssignmentDenied(res);
      return;
    }

    let positionChange:
      | Awaited<ReturnType<AccountsRepository["setAccountPosition"]>>
      | undefined;
    try {
      positionChange = await runAuditedMutation({
        transaction: databaseTransaction,
        audit,
        mutate: async () => accounts.setAccountPosition({
          accessId: accountPositionAccessId,
          position: targetPosition.id,
        }, await canAssignAdminNavigation()),
        buildEvent: (change) =>
          change === undefined ||
          change.previous.position === change.updated.position
          ? undefined
          : {
              actor: buildAuditActor(access.profile),
              category: "administration",
              action: "admin.account_position_update",
              summary: `Изменена должность учётной записи «${change.updated.userDisplayName}»`,
              details: buildAccountPositionChangeAuditDetails(
                change.previous,
                change.updated,
              ),
              targetType: "user_account",
              targetId: change.updated.userId,
            },
      });
    } catch (error) {
      if (error instanceof ProtectedAccountMutationError) {
        sendProtectedAccountMutationDenied(res);
        return;
      }
      throw error;
    }

    if (positionChange === undefined) {
      sendJson(res, 404, {
        error: { code: "not_found", message: "Учётная запись не найдена." },
      });
      return;
    }

    sendJson(res, 200, { account: positionChange.updated });
    return;
  }

  if (
    url.pathname.startsWith("/api/admin/accounts/") &&
    url.pathname !== "/api/admin/accounts/reset-password"
  ) {
    if (req.method !== "DELETE") {
      sendJson(res, 405, { error: { code: "access_denied", message: "Метод не поддерживается." } });
      return;
    }
    const userId = decodeURIComponent(url.pathname.slice("/api/admin/accounts/".length));
    if (userId === access.profile.userId) {
      sendJson(res, 409, { error: { code: "invalid_response", message: "Нельзя удалить текущую учётную запись." } });
      return;
    }
    const targetAccount = (await accounts.listAccounts()).find(
      (account) => account.userId === userId,
    );
    if (
      targetAccount?.isProtected === true &&
      !(await canAssignAdminNavigation())
    ) {
      sendProtectedAccountMutationDenied(res);
      return;
    }
    let wasDeleted = false;
    try {
      wasDeleted = await runAuditedMutation({
        transaction: databaseTransaction,
        audit,
        mutate: async () => accounts.deleteAccount(
          userId,
          await canAssignAdminNavigation(),
        ),
        buildEvent: (deleted) => deleted
          ? {
              actor: buildAuditActor(access.profile),
              category: "administration",
              action: "admin.account_archive",
              summary: `Архивирована учётная запись «${targetAccount?.userDisplayName ?? "Пользователь"}»`,
              details: buildAccountAuditDetails(targetAccount),
              targetType: "user_account",
              targetId: userId,
            }
          : undefined,
      });
    } catch (error) {
      if (error instanceof ProtectedAccountMutationError) {
        sendProtectedAccountMutationDenied(res);
        return;
      }
      throw error;
    }
    if (!wasDeleted) {
      sendJson(res, 404, { error: { code: "not_found", message: "Учётная запись не найдена." } });
      return;
    }
    sendJson(res, 200, { ok: true });
    return;
  }

  if (url.pathname === "/api/admin/positions") {
    if (req.method === "GET") {
      sendJson(res, 200, {
        positions: await accounts.listPositions(),
        canAssignAdminNavigation: await canAssignAdminNavigation(),
      });
      return;
    }

    if (req.method === "POST") {
      const validation = validateCreatePositionRequest(await readJsonBody(req));
      if (!validation.ok) {
        sendJson(res, 400, { error: { code: "invalid_response", message: validation.errors.join(" ") } });
        return;
      }
      if (
        hasAdminNavigationItems(validation.value.navigationItems) &&
        !(await canAssignAdminNavigation())
      ) {
        sendAdminNavigationAssignmentDenied(res);
        return;
      }
      const position = await runAuditedMutation({
        transaction: databaseTransaction,
        audit,
        mutate: () => accounts.createPosition(validation.value),
        buildEvent: (createdPosition) => ({
          actor: buildAuditActor(access.profile),
          category: "administration",
          action: "admin.position_create",
          summary: `Создана должность «${createdPosition.displayName}»`,
          details: buildPositionAuditDetails(createdPosition),
          targetType: "account_position",
          targetId: createdPosition.id,
        }),
      });
      sendJson(res, 201, { position });
      return;
    }

    sendJson(res, 405, { error: { code: "access_denied", message: "Метод не поддерживается." } });
    return;
  }

  if (url.pathname === "/api/admin/positions/order") {
    if (req.method !== "PUT") {
      sendJson(res, 405, {
        error: {
          code: "access_denied",
          message: "Метод не поддерживается.",
        },
      });
      return;
    }
    const validation = validatePositionOrderRequest(await readJsonBody(req));
    if (!validation.ok) {
      sendJson(res, 400, {
        error: {
          code: "invalid_response",
          message: validation.errors.join(" "),
        },
      });
      return;
    }
    const currentPositions = await accounts.listPositions();
    const positionNameById = new Map(
      currentPositions.map((position) => [position.id, position.displayName]),
    );
    const didUpdate = await runAuditedMutation({
      transaction: databaseTransaction,
      audit,
      mutate: () => accounts.setPositionOrder(validation.value.positionIds),
      buildEvent: (saved) => saved
        ? {
            actor: buildAuditActor(access.profile),
            category: "administration",
            action: "admin.position_order_update",
            summary: "Изменён порядок должностей",
            details: [{
              label: "Новый порядок",
              value: validation.value.positionIds
                .map((id) => positionNameById.get(id) ?? id)
                .join(" → "),
            }],
            targetType: "account_position",
          }
        : undefined,
    });
    if (!didUpdate) {
      sendJson(res, 409, {
        error: {
          code: "invalid_response",
          message:
            "Список должностей изменился. Обновите страницу и повторите попытку.",
        },
      });
      return;
    }
    sendJson(res, 200, {
      positions: await accounts.listPositions(),
      canAssignAdminNavigation: await canAssignAdminNavigation(),
    });
    return;
  }

  if (url.pathname.startsWith("/api/admin/positions/")) {
    if (req.method !== "PATCH" && req.method !== "DELETE") {
      sendJson(res, 405, { error: { code: "access_denied", message: "Метод не поддерживается." } });
      return;
    }
    const id = decodeURIComponent(url.pathname.slice("/api/admin/positions/".length));
    const existing = (await accounts.listPositions()).find((position) => position.id === id);
    if (existing === undefined) {
      sendJson(res, 404, { error: { code: "not_found", message: "Должность не найдена." } });
      return;
    }
    if (existing.accountType === "admin") {
      sendJson(res, 409, { error: { code: "invalid_response", message: "Должность администратора нельзя изменить или удалить." } });
      return;
    }
    if (req.method === "DELETE") {
      const result = await runAuditedMutation({
        transaction: databaseTransaction,
        audit,
        mutate: () => accounts.deletePosition(id),
        buildEvent: (deleteResult) => deleteResult === "deleted"
          ? {
              actor: buildAuditActor(access.profile),
              category: "administration",
              action: "admin.position_delete",
              summary: `Удалена должность «${existing.displayName}»`,
              details: buildPositionAuditDetails(existing),
              targetType: "account_position",
              targetId: id,
            }
          : undefined,
      });
      if (result === "in_use") {
        sendJson(res, 409, { error: { code: "invalid_response", message: "Должность используется учётными записями." } });
        return;
      }
      if (result === "not_found") {
        sendJson(res, 404, { error: { code: "not_found", message: "Должность не найдена." } });
        return;
      }
      if (result === "protected") {
        sendJson(res, 409, { error: { code: "invalid_response", message: "Должность администратора нельзя удалить." } });
        return;
      }
      sendJson(res, 200, { ok: true });
      return;
    }
    const validation = validateUpdatePositionRequest(await readJsonBody(req));
    if (!validation.ok) {
      sendJson(res, 400, { error: { code: "invalid_response", message: validation.errors.join(" ") } });
      return;
    }
    if (
      !(await canAssignAdminNavigation()) &&
      !hasSameAdminNavigationItems(
        existing.navigationItems,
        validation.value.navigationItems,
      )
    ) {
      sendAdminNavigationAssignmentDenied(res);
      return;
    }
    const position = await runAuditedMutation({
      transaction: databaseTransaction,
      audit,
      mutate: () => accounts.updatePosition({ id, ...validation.value }),
      buildEvent: (updatedPosition) => updatedPosition === undefined
        ? undefined
        : {
            actor: buildAuditActor(access.profile),
            category: "administration",
            action: "admin.position_update",
            summary: `Изменена должность «${updatedPosition.displayName}»`,
            details: buildPositionAuditDetails(updatedPosition),
            targetType: "account_position",
            targetId: id,
          },
    });
    sendJson(res, 200, { position });
    return;
  }

  if (
    url.pathname === "/api/admin/accounts" &&
    req.method === "POST" &&
    !hasProfileCapability(access.profile, "platform.manage_users")
  ) {
    sendJson(res, 403, {
      error: { code: "access_denied", message: "Управление учётными записями недоступно." },
    });
    return;
  }

  if (url.pathname === "/api/admin/accounts") {
    if (req.method === "GET") {
      sendJson(res, 200, {
        accounts: await accounts.listAccounts(),
        canManageProtectedAccounts: await canAssignAdminNavigation(),
      });
      return;
    }

    if (req.method === "POST") {
      const payload = await readJsonBody(req);
      const requestedPosition = isRecord(payload) && typeof payload.position === "string"
        ? (await accounts.listPositions()).find((position) => position.id === payload.position)
        : undefined;
      if (
        requestedPosition !== undefined &&
        hasAdminNavigationItems(requestedPosition.navigationItems) &&
        !(await canAssignAdminNavigation())
      ) {
        sendAdminNavigationAssignmentDenied(res);
        return;
      }
      const validation = validateCreateAccountRequest(payload, requestedPosition);

      if (!validation.ok) {
        sendJson(res, 400, {
          error: {
            code: "invalid_response",
            message: validation.errors.join(" "),
          },
        });
        return;
      }

      try {
        const account = await runAuditedMutation({
          transaction: databaseTransaction,
          audit,
          mutate: () => accounts.createAccount(validation.value),
          buildEvent: (createdAccount) => ({
            actor: buildAuditActor(access.profile),
            category: "administration",
            action: "admin.account_create",
            summary: `Создана учётная запись «${createdAccount.userDisplayName}»`,
            details: buildAccountAuditDetails(createdAccount),
            targetType: "user_account",
            targetId: createdAccount.userId,
          }),
        });

        sendJson(res, 201, { account });
      } catch (error) {
        sendAdminAccountsError(res, error);
      }

      return;
    }

    if (req.method === "PATCH") {
      const payload = await readJsonBody(req);

      const validation = validateSetAccountLoginEnabledRequest(payload);

      if (!validation.ok) {
        sendJson(res, 400, {
          error: {
            code: "invalid_response",
            message: validation.errors.join(" "),
          },
        });
        return;
      }

      if (
        !validation.value.isEnabled &&
        validation.value.userId === access.profile.userId
      ) {
        sendJson(res, 409, {
          error: {
            code: "invalid_response",
            message: "Нельзя отключить вход для текущей учётной записи.",
          },
        });
        return;
      }

      try {
        const targetAccount = (await accounts.listAccounts()).find(
          (account) => account.userId === validation.value.userId,
        );
        if (
          targetAccount?.isProtected === true &&
          !(await canAssignAdminNavigation())
        ) {
          sendProtectedAccountMutationDenied(res);
          return;
        }
        const loginStatus = await runAuditedMutation({
          transaction: databaseTransaction,
          audit,
          mutate: async () => accounts.setAccountLoginEnabled(
            validation.value,
            await canAssignAdminNavigation(),
          ),
          buildEvent: (status) => status === undefined
            ? undefined
            : {
                actor: buildAuditActor(access.profile),
                category: "administration",
                action: validation.value.isEnabled
                  ? "admin.account_login_enable"
                  : "admin.account_login_disable",
                summary: `${validation.value.isEnabled ? "Включён" : "Отключён"} вход для «${targetAccount?.userDisplayName ?? "Пользователь"}»`,
                details: buildAccountAuditDetails(targetAccount),
                targetType: "user_account",
                targetId: validation.value.userId,
              },
        });

        if (loginStatus === undefined) {
          sendJson(res, 404, {
            error: {
              code: "not_found",
              message: "Учётная запись не найдена.",
            },
          });
          return;
        }

        sendJson(res, 200, loginStatus);
      } catch (error) {
        sendAdminAccountsError(res, error);
      }

      return;
    }

    sendJson(res, 405, {
      error: {
        code: "access_denied",
        message: "Only GET, POST and PATCH are supported for admin accounts.",
      },
    });
    return;
  }

  if (req.method !== "POST") {
    sendJson(res, 405, {
      error: {
        code: "access_denied",
        message: "Only POST is supported for admin account password reset.",
      },
    });
    return;
  }

  const payload = await readJsonBody(req);
  const validation = validateResetPasswordRequest(payload);

  if (!validation.ok) {
    sendJson(res, 400, {
      error: {
        code: "invalid_response",
        message: validation.errors.join(" "),
      },
    });
    return;
  }

  const passwordTarget = (await accounts.listAccounts()).find(
    (account) =>
      account.login.trim().toLocaleLowerCase("en-US") ===
      validation.value.login.toLocaleLowerCase("en-US"),
  );
  if (
    passwordTarget?.isProtected === true &&
    !(await canAssignAdminNavigation())
  ) {
    sendProtectedAccountMutationDenied(res);
    return;
  }

  try {
    const wasReset = await runAuditedMutation({
      transaction: databaseTransaction,
      audit,
      mutate: async () => accounts.resetPassword(
        validation.value,
        await canAssignAdminNavigation(),
      ),
      buildEvent: (reset) => reset
        ? {
            actor: buildAuditActor(access.profile),
            category: "administration",
            action: "admin.account_password_reset",
            summary: `Сброшен пароль учётной записи «${validation.value.login}»`,
            details: [{ label: "Логин", value: validation.value.login }],
            targetType: "user_account",
            targetId: validation.value.login,
          }
        : undefined,
    });

    if (!wasReset) {
      sendJson(res, 404, {
        error: {
          code: "not_found",
          message: "Учётная запись с таким логином не найдена.",
        },
      });
      return;
    }

    sendJson(res, 200, { ok: true });
  } catch (error) {
    sendAdminAccountsError(res, error);
  }
}

function validateCreateAccountRequest(input: unknown, positionDefinition?: AdminPositionSummary):
  | {
      ok: true;
      value: CreateAccountInput;
    }
  | {
      ok: false;
      errors: string[];
    } {
  if (!isRecord(input) || Array.isArray(input)) {
    return {
      ok: false,
      errors: ["Payload must be a JSON object."],
    };
  }

  const errors: string[] = [];
  const login = typeof input.login === "string" ? input.login.trim() : "";
  const password = typeof input.password === "string" ? input.password : "";
  const displayName =
    typeof input.displayName === "string" ? input.displayName.trim() : "";
  const position = input.position;

  if (login.length === 0) {
    errors.push("login is required.");
  }

  if (password.length < 8) {
    errors.push("password must be at least 8 characters long.");
  }

  if (displayName.length === 0) {
    errors.push("displayName is required.");
  }

  const allowedFields = new Set(["login", "password", "displayName", "position"]);

  for (const field of Object.keys(input)) {
    if (!allowedFields.has(field)) {
      errors.push(`${field} is not supported.`);
    }
  }

  if (!isAccountPosition(position) || positionDefinition === undefined) {
    errors.push("position is not supported.");
    return { ok: false, errors };
  }

  const accountType = positionDefinition.accountType;
  const navigationItems = positionDefinition.navigationItems;

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    value: {
      login,
      password,
      displayName,
      accountType,
      position,
      navigationItems,
      capabilities: positionDefinition.capabilities,
    },
  };
}

function validateCreatePositionRequest(input: unknown):
  | { ok: true; value: {
      displayName: string;
      navigationItems: AccountNavigationItem[];
      capabilities: AccountCapability[];
    } }
  | { ok: false; errors: string[] } {
  if (!isRecord(input) || Array.isArray(input)) {
    return { ok: false, errors: ["Payload must be a JSON object."] };
  }

  const unknownFields = Object.keys(input).filter(
    (key) =>
      key !== "displayName" &&
      key !== "navigationItems" &&
      key !== "boardAssignmentAccess",
  );
  const displayName = typeof input.displayName === "string" ? input.displayName.trim() : "";
  const navigationItems = Array.isArray(input.navigationItems) ? input.navigationItems : [];
  const hasBoardAssignments = navigationItems.includes(
    "business.board_assignments",
  );
  const boardAssignmentAccess = input.boardAssignmentAccess === undefined
    ? hasBoardAssignments
      ? "view"
      : "none"
    : input.boardAssignmentAccess;
  const errors: string[] = [];

  if (unknownFields.length > 0) {
    errors.push("Запрос содержит неизвестные поля.");
  }
  if (displayName.length === 0 || displayName.length > 160) {
    errors.push("Укажите название должности.");
  }
  if (
    navigationItems.length === 0 ||
    !navigationItems.every(isAccountNavigationItem) ||
    !validatePositionNavigationItems(navigationItems)
  ) {
    errors.push("Выберите хотя бы одну доступную вкладку.");
  }
  if (!isBoardAssignmentAccess(boardAssignmentAccess)) {
    errors.push("Выберите поддерживаемый вариант доступа к поручениям.");
  } else if (
    (boardAssignmentAccess === "none") === hasBoardAssignments
  ) {
    errors.push(
      "Вариант доступа к поручениям не соответствует выбранным вкладкам.",
    );
  }
  if (errors.length > 0) {
    return { ok: false, errors };
  }

  const validatedBoardAssignmentAccess = isBoardAssignmentAccess(
    boardAssignmentAccess,
  )
    ? boardAssignmentAccess
    : "none";

  return {
    ok: true,
    value: {
      displayName,
      navigationItems,
      capabilities: resolveCapabilitiesForPosition(
        "position-custom",
        navigationItems,
        validatedBoardAssignmentAccess,
      ),
    },
  };
}

async function readCanAssignAdminNavigation({
  profile,
  accounts,
  devAccessEnabled,
}: {
  profile: ServerUserProfile;
  accounts: AccountsRepository;
  devAccessEnabled: boolean;
}) {
  if (
    devAccessEnabled &&
    profile.userId === "dev-user-admin" &&
    profile.activeAccess.accountId === "dev-access-admin"
  ) {
    return true;
  }

  const actorAccounts = await accounts.listAccounts();
  return actorAccounts.some(
    (account) =>
      account.userId === profile.userId &&
      isCanonicalAdminLogin(account.login),
  );
}

function sendAdminNavigationAssignmentDenied(res: ServerResponse) {
  sendJson(res, 403, {
    error: {
      code: "access_denied",
      message: "Административные вкладки может назначать только аккаунт admin.",
    },
  });
}

function sendProtectedAccountMutationDenied(res: ServerResponse) {
  sendJson(res, 403, {
    error: {
      code: "access_denied",
      message:
        "Защищённую учётную запись может изменить только исходный аккаунт admin.",
    },
  });
}

function validateUpdatePositionRequest(input: unknown):
  | { ok: true; value: { displayName: string; navigationItems: AccountNavigationItem[]; capabilities: AccountCapability[] } }
  | { ok: false; errors: string[] } {
  const validation = validateCreatePositionRequest(input);
  if (!validation.ok) {
    return validation;
  }

  return {
    ok: true,
    value: {
      displayName: validation.value.displayName,
      navigationItems: validation.value.navigationItems,
      capabilities: validation.value.capabilities,
    },
  };
}

function validatePositionOrderRequest(input: unknown):
  | { ok: true; value: { positionIds: string[] } }
  | { ok: false; errors: string[] } {
  if (!isRecord(input) || Array.isArray(input)) {
    return { ok: false, errors: ["Payload must be a JSON object."] };
  }

  const unknownFields = Object.keys(input).filter(
    (key) => key !== "positionIds",
  );
  const positionIds = Array.isArray(input.positionIds)
    ? input.positionIds
    : [];
  const errors: string[] = [];

  if (unknownFields.length > 0) {
    errors.push("Запрос содержит неизвестные поля.");
  }
  if (
    positionIds.length === 0 ||
    !positionIds.every(
      (id) => typeof id === "string" && id.trim().length > 0,
    )
  ) {
    errors.push("Передайте полный список должностей.");
  } else if (new Set(positionIds).size !== positionIds.length) {
    errors.push("Каждая должность должна встречаться в списке один раз.");
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    value: { positionIds: positionIds as string[] },
  };
}

function validateResetPasswordRequest(input: unknown):
  | {
      ok: true;
      value: {
        login: string;
        password: string;
      };
    }
  | {
      ok: false;
      errors: string[];
    } {
  if (!isRecord(input) || Array.isArray(input)) {
    return {
      ok: false,
      errors: ["Payload must be a JSON object."],
    };
  }

  const errors: string[] = [];
  const login = typeof input.login === "string" ? input.login.trim() : "";
  const password = typeof input.password === "string" ? input.password : "";

  if (login.length === 0) {
    errors.push("login is required.");
  }

  if (password.length < 8) {
    errors.push("password must be at least 8 characters long.");
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    value: { login, password },
  };
}

function validateSetAccountLoginEnabledRequest(input: unknown):
  | {
      ok: true;
      value: SetAccountLoginEnabledInput;
    }
  | {
      ok: false;
      errors: string[];
    } {
  if (!isRecord(input) || Array.isArray(input)) {
    return {
      ok: false,
      errors: ["Payload must be a JSON object."],
    };
  }

  const errors: string[] = [];
  const userId = typeof input.userId === "string" ? input.userId.trim() : "";
  const isEnabled = input.isEnabled;

  if (userId.length === 0) {
    errors.push("userId is required.");
  }

  if (typeof isEnabled !== "boolean") {
    errors.push("isEnabled must be a boolean.");
  }

  if (errors.length > 0 || typeof isEnabled !== "boolean") {
    return { ok: false, errors };
  }

  return {
    ok: true,
    value: {
      userId,
      isEnabled,
    },
  };
}

function validateSetAccountProtectionRequest(
  input: unknown,
  userId: string,
):
  | { ok: true; value: { userId: string; isProtected: boolean } }
  | { ok: false; errors: string[] } {
  if (!isRecord(input) || Array.isArray(input)) {
    return { ok: false, errors: ["Payload must be a JSON object."] };
  }
  if (typeof input.isProtected !== "boolean") {
    return { ok: false, errors: ["isProtected must be a boolean."] };
  }
  return {
    ok: true,
    value: { userId, isProtected: input.isProtected },
  };
}

function validateSetAccountPositionRequest(input: unknown):
  | {
      ok: true;
      value: Pick<SetAccountPositionInput, "position">;
    }
  | {
      ok: false;
      errors: string[];
    } {
  if (!isRecord(input) || Array.isArray(input)) {
    return {
      ok: false,
      errors: ["Payload must be a JSON object."],
    };
  }

  if (!isAccountPosition(input.position)) {
    return {
      ok: false,
      errors: ["position is not supported."],
    };
  }

  return {
    ok: true,
    value: { position: input.position },
  };
}

function sendAdminAccountsError(res: ServerResponse, error: unknown) {
  if (error instanceof ProtectedAccountMutationError) {
    sendProtectedAccountMutationDenied(res);
    return;
  }

  if (error instanceof AccountLoginAlreadyExistsError) {
    sendJson(res, 409, {
      error: {
        code: "invalid_response",
        message: error.message,
      },
    });
    return;
  }

  if (error instanceof ArchivedAccountLoginStatusError) {
    sendJson(res, 409, {
      error: {
        code: "invalid_response",
        message: error.message,
      },
    });
    return;
  }

  sendJson(res, 400, {
    error: {
      code: "invalid_response",
      message:
        error instanceof Error ? error.message : "Admin accounts request failed.",
    },
  });
}

function readAdminDatabaseRowsRoute(url: URL) {
  const match = /^\/api\/admin\/database\/tables\/([^/]+)\/rows(?:\/(all|merge))?$/.exec(
    url.pathname,
  );

  if (match === null) {
    return undefined;
  }

  return {
    tableName: decodeURIComponent(match[1]),
    clearAll: match[2] === "all",
    merge: match[2] === "merge",
  };
}

function readAdminDispatcherImportPayload(
  input: unknown,
  requirePreviewToken = false,
):
  | {
      ok: true;
      value: {
        spreadsheetUrl: string;
        previewToken?: string;
      };
    }
  | {
      ok: false;
      errors: string[];
    } {
  if (!isRecord(input) || Array.isArray(input)) {
    return {
      ok: false,
      errors: ["Payload must be a JSON object."],
    };
  }

  const spreadsheetUrl =
    typeof input.spreadsheetUrl === "string" ? input.spreadsheetUrl.trim() : "";
  const previewToken =
    typeof input.previewToken === "string" ? input.previewToken.trim() : undefined;
  const errors: string[] = [];

  const allowedFields = new Set(
    requirePreviewToken
      ? ["spreadsheetUrl", "previewToken"]
      : ["spreadsheetUrl"],
  );

  for (const field of Object.keys(input)) {
    if (!allowedFields.has(field)) {
      errors.push(`${field} is not supported.`);
    }
  }

  if (spreadsheetUrl.length === 0 || spreadsheetUrl.length > 2_000) {
    errors.push("spreadsheetUrl is required and must be 2000 characters or less.");
  }

  if (
    requirePreviewToken &&
    (previewToken === undefined || !/^[a-f0-9]{64}$/.test(previewToken))
  ) {
    errors.push("previewToken must be a SHA-256 digest.");
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    value: {
      spreadsheetUrl,
      previewToken,
    },
  };
}

function readAdminDatabaseRowsQuery(url: URL):
  | {
      ok: true;
      value: {
        limit?: number;
        offset?: number;
        search?: string;
      };
    }
  | {
      ok: false;
      errors: string[];
    } {
  const pagination = readAdminDatabasePagination(url);
  const errors = pagination.ok ? [] : [...pagination.errors];
  const search = readOptionalQueryParam(url, "search")?.trim();

  if (search !== undefined && search.length > 120) {
    errors.push("search must contain at most 120 characters.");
  }

  if (errors.length > 0 || !pagination.ok) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    value:
      search === undefined || search.length === 0
        ? pagination.value
        : { ...pagination.value, search },
  };
}

function readAdminDatabasePagination(url: URL):
  | {
      ok: true;
      value: {
        limit?: number;
        offset?: number;
      };
    }
  | {
      ok: false;
      errors: string[];
    } {
  const errors: string[] = [];
  const limit = readOptionalQueryParam(url, "limit");
  const offset = readOptionalQueryParam(url, "offset");
  const value: {
    limit?: number;
    offset?: number;
  } = {};

  if (limit !== undefined) {
    const parsedLimit = Number(limit);

    if (Number.isInteger(parsedLimit) && parsedLimit > 0) {
      value.limit = parsedLimit;
    } else {
      errors.push("limit must be a positive integer.");
    }
  }

  if (offset !== undefined) {
    const parsedOffset = Number(offset);

    if (Number.isInteger(parsedOffset) && parsedOffset >= 0) {
      value.offset = parsedOffset;
    } else {
      errors.push("offset must be a non-negative integer.");
    }
  }

  return errors.length === 0 ? { ok: true, value } : { ok: false, errors };
}

function readAuditReportFilters(url: URL):
  | {
      ok: true;
      value: {
        actorAccountId?: string;
        category?: AuditEventCategory;
        limit?: number;
        offset?: number;
      };
    }
  | {
      ok: false;
      errors: string[];
    } {
  const errors: string[] = [];
  const pagination = readAdminDatabasePagination(url);
  const actorAccountId = readOptionalQueryParam(url, "actorAccountId")?.trim();
  const category = readOptionalQueryParam(url, "category")?.trim();

  if (!pagination.ok) {
    errors.push(...pagination.errors);
  }

  if (actorAccountId !== undefined && (
    actorAccountId.length === 0 || actorAccountId.length > 120
  )) {
    errors.push("actorAccountId must contain from 1 to 120 characters.");
  }

  if (category !== undefined && !isAuditEventCategory(category)) {
    errors.push("category is not supported.");
  }

  if (errors.length > 0 || !pagination.ok) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    value: {
      ...(actorAccountId === undefined ? {} : { actorAccountId }),
      ...(category === undefined || !isAuditEventCategory(category)
        ? {}
        : { category }),
      ...pagination.value,
    },
  };
}

function readAdminDatabaseMutationPayload(input: unknown):
  | {
      ok: true;
      value: {
        primaryKey: Record<string, AdminDatabaseCellValue>;
        values: Record<string, AdminDatabaseCellValue>;
      };
    }
  | {
      ok: false;
      errors: string[];
    } {
  const errors: string[] = [];

  if (!isRecord(input) || Array.isArray(input)) {
    return {
      ok: false,
      errors: ["Payload must be a JSON object."],
    };
  }

  const primaryKey = readAdminDatabaseValueMap(input.primaryKey, "primaryKey", errors);
  const values = readAdminDatabaseValueMap(input.values, "values", errors);

  if (errors.length > 0) {
    return {
      ok: false,
      errors,
    };
  }

  return {
    ok: true,
    value: {
      primaryKey,
      values,
    },
  };
}

function readAdminDatabaseMergePayload(input: unknown):
  | {
      ok: true;
      value: {
        sourcePrimaryKey: Record<string, AdminDatabaseCellValue>;
        targetPrimaryKey: Record<string, AdminDatabaseCellValue>;
      };
    }
  | {
      ok: false;
      errors: string[];
    } {
  const errors: string[] = [];

  if (!isRecord(input) || Array.isArray(input)) {
    return {
      ok: false,
      errors: ["Payload must be a JSON object."],
    };
  }

  const unexpectedFields = Object.keys(input).filter(
    (fieldName) =>
      fieldName !== "sourcePrimaryKey" && fieldName !== "targetPrimaryKey",
  );

  if (unexpectedFields.length > 0) {
    errors.push("Payload contains unsupported fields.");
  }

  const sourcePrimaryKey = readAdminDatabaseValueMap(
    input.sourcePrimaryKey,
    "sourcePrimaryKey",
    errors,
  );
  const targetPrimaryKey = readAdminDatabaseValueMap(
    input.targetPrimaryKey,
    "targetPrimaryKey",
    errors,
  );

  return errors.length === 0
    ? { ok: true, value: { sourcePrimaryKey, targetPrimaryKey } }
    : { ok: false, errors };
}

function readAdminDatabaseClearPayload(
  input: unknown,
  tableName: string,
): { ok: true } | { ok: false; errors: string[] } {
  if (!isRecord(input) || Array.isArray(input)) {
    return {
      ok: false,
      errors: ["Payload must be a JSON object."],
    };
  }

  const errors: string[] = [];
  const unexpectedFields = Object.keys(input).filter(
    (fieldName) => fieldName !== "confirmation",
  );

  if (unexpectedFields.length > 0) {
    errors.push("Payload contains unsupported fields.");
  }

  if (input.confirmation !== tableName) {
    errors.push("Table confirmation does not match the selected table.");
  }

  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}

function readAdminDatabaseValueMap(
  value: unknown,
  fieldName: string,
  errors: string[],
) {
  if (!isRecord(value) || Array.isArray(value)) {
    errors.push(`${fieldName} must be an object.`);
    return {};
  }

  const entries: [string, AdminDatabaseCellValue][] = [];

  for (const [key, rawValue] of Object.entries(value)) {
    if (rawValue === null || typeof rawValue === "string") {
      entries.push([key, rawValue]);
      continue;
    }

    errors.push(`${fieldName}.${key} must be a string or null.`);
  }

  return Object.fromEntries(entries);
}

function sendAdminDatabaseError(res: ServerResponse, error: unknown) {
  sendJson(res, error instanceof ProtectedAccountMutationError ? 403 : 400, {
    error: {
      code: error instanceof ProtectedAccountMutationError
        ? "access_denied"
        : "invalid_response",
      message: error instanceof Error ? error.message : "Admin database request failed.",
    },
  });
}

function validateDispatcherEquipmentReportRequest(
  input: unknown,
): EquipmentReportValidationResult {
  if (!isRecord(input) || Array.isArray(input)) {
    return {
      ok: false,
      errors: ["Payload must be a JSON object."],
    };
  }

  const errors: string[] = [];

  if (!Array.isArray(input.items) || input.items.length === 0) {
    errors.push("items must contain at least one equipment report.");
  }

  if (Array.isArray(input.items) && input.items.length > 50) {
    errors.push("items must contain 50 equipment reports or less.");
  }

  const items: ValidatedDispatcherSubmissionDraft[] = [];

  if (Array.isArray(input.items)) {
    input.items.forEach((payload, index) => {
      const validation = validateDispatcherSubmissionDraft({
        formId: "equipment",
        payload,
      });

      if (!validation.ok) {
        errors.push(
          `items[${index}] is invalid: ${validation.errors.join(" ")}`,
        );
        return;
      }

      items.push(validation.value);
    });
  }

  validateCompleteEquipmentReportItems(items, errors);

  if (errors.length > 0) {
    return {
      ok: false,
      errors,
    };
  }

  return {
    ok: true,
    value: {
      items,
    },
  };
}

function validateCompleteEquipmentReportItems(
  items: readonly ValidatedDispatcherSubmissionDraft[],
  errors: string[],
) {
  if (items.length === 0) {
    return;
  }

  const requiredEquipment = readEquipmentOptions();
  const submittedEquipment = new Set<string>();
  const duplicates = new Set<string>();

  for (const item of items) {
    const equipment = item.draft.payload.equipment?.trim() ?? "";

    if (submittedEquipment.has(equipment)) {
      duplicates.add(equipment);
    }

    submittedEquipment.add(equipment);
  }

  const missingEquipment = requiredEquipment.filter(
    (equipment) => !submittedEquipment.has(equipment),
  );

  if (duplicates.size > 0) {
    errors.push(`equipment report contains duplicates: ${[...duplicates].join(", ")}.`);
  }

  if (missingEquipment.length > 0) {
    errors.push(
      `equipment report must include all equipment. Missing: ${missingEquipment.join(", ")}.`,
    );
  }
}

function readEquipmentOptions() {
  return (
    getDispatcherFormDefinition("equipment")?.fields.find(
      (field) => field.name === "equipment",
    )?.options ?? []
  );
}

function readEquipmentReportStatus(
  report: {
    items: ValidatedDispatcherSubmissionDraft[];
  },
  history: readonly DispatcherSubmission[],
): "created" | "updated" {
  const existingKeys = new Set(
    history
      .map((submission) =>
        buildDispatcherSubmissionDedupeKey({
          formId: "equipment",
          payload: submission.payload,
        }),
      )
      .filter((value): value is string => value !== undefined),
  );

  return report.items.some((item) =>
    existingKeys.has(buildDispatcherSubmissionDedupeKey(item.draft) ?? ""),
  )
    ? "updated"
    : "created";
}

function readEquipmentReportDate(submissions: readonly DispatcherSubmission[]) {
  return submissions[0]?.payload.reportDate?.trim() ?? "";
}

async function notifyDispatcherSubmission(
  submission: Awaited<ReturnType<DispatcherSubmissionsRepository["create"]>>,
  referenceDataSource: DispatcherReferenceDataSource,
  emailNotificationService: EmailNotificationService,
  maxNotificationService: MaxNotificationService,
) {
  if (submission.formId === "equipment") {
    return;
  }

  try {
    const referenceData = await referenceDataSource.read();

    await notifyByEmail(
      emailNotificationService,
      submission,
      referenceData.notificationRecipients,
    );
    await notifyByMax(
      maxNotificationService,
      submission,
      referenceData.maxNotificationRecipients,
    );
  } catch (error) {
    console.warn("dispatcher_notifications.reference_data_failed", error);
  }
}

async function notifyRefractoryReport(
  report: RefractoryReportRevision,
  referenceDataSource: DispatcherReferenceDataSource,
  emailNotificationService: EmailNotificationService,
  maxNotificationService: MaxNotificationService,
  notificationKind: RefractoryNotificationKind,
) {
  let referenceData: Awaited<ReturnType<DispatcherReferenceDataSource["read"]>>;
  const logPrefix = notificationKind === "approved"
    ? "refractory_notifications"
    : "refractory_review_notifications";

  try {
    referenceData = await referenceDataSource.read();
  } catch (error) {
    console.warn(`${logPrefix}.reference_data_failed`, error);
    return;
  }

  const emailRecipients = notificationKind === "approved"
    ? referenceData.refractoryNotificationRecipients
    : referenceData.refractoryReviewNotificationRecipients;
  const maxRecipients = notificationKind === "approved"
    ? referenceData.refractoryMaxNotificationRecipients
    : referenceData.refractoryReviewMaxNotificationRecipients;
  const notification = toRefractoryReportNotification(report);

  try {
    await emailNotificationService.sendRefractoryReportNotification(
      notification,
      emailRecipients,
      notificationKind,
    );
  } catch (error) {
    console.warn(`${logPrefix}.email_send_failed`, error);
  }

  try {
    await maxNotificationService.sendRefractoryReportNotification(
      notification,
      maxRecipients,
      notificationKind,
    );
  } catch (error) {
    console.warn(`${logPrefix}.max_send_failed`, error);
  }
}

function toRefractoryReportNotification(
  report: RefractoryReportRevision,
): RefractoryReportNotification {
  const base = {
    reportId: report.id,
    reportDate: report.reportDate,
    shiftNumber: report.shiftNumber,
    revisionNumber: report.revisionNumber,
    masterDisplayName: report.masterDisplayName,
    ...(report.reviewerDisplayName === undefined
      ? {}
      : { reviewerDisplayName: report.reviewerDisplayName }),
  };

  if (report.reportType === "cosh") {
    return {
      ...base,
      reportType: "cosh",
      payload: report.payload as RefractoryCoshPayload,
      totals: report.totals as RefractoryCoshTotals,
    };
  }

  if (report.reportType === "equipment") {
    return {
      ...base,
      reportType: "equipment",
      payload: report.payload as RefractoryEquipmentPayload,
      totals: report.totals as RefractoryEquipmentTotals,
    };
  }

  return {
    ...base,
    reportType: "firing",
    payload: report.payload as RefractoryFiringPayload,
    totals: report.totals as RefractoryFiringTotals,
  };
}

async function notifyDispatcherEquipmentReport(
  submissions: readonly DispatcherSubmission[],
  reportStatus: "created" | "updated",
  referenceDataSource: DispatcherReferenceDataSource,
  emailNotificationService: EmailNotificationService,
  maxNotificationService: MaxNotificationService,
) {
  try {
    const referenceData = await referenceDataSource.read();

    await notifyEquipmentReportByEmail(
      emailNotificationService,
      submissions,
      referenceData.notificationRecipients,
      reportStatus,
    );
    await notifyEquipmentReportByMax(
      maxNotificationService,
      submissions,
      referenceData.maxNotificationRecipients,
      reportStatus,
    );
  } catch (error) {
    console.warn("dispatcher_notifications.reference_data_failed", error);
  }
}

async function notifyByEmail(
  emailNotificationService: EmailNotificationService,
  submission: Awaited<ReturnType<DispatcherSubmissionsRepository["create"]>>,
  recipients: Parameters<
    EmailNotificationService["sendDispatcherSubmissionNotification"]
  >[1],
) {
  try {
    await emailNotificationService.sendDispatcherSubmissionNotification(
      submission,
      recipients,
    );
  } catch (error) {
    console.warn("dispatcher_notifications.email_send_failed", error);
  }
}

async function notifyEquipmentReportByEmail(
  emailNotificationService: EmailNotificationService,
  submissions: readonly DispatcherSubmission[],
  recipients: Parameters<
    EmailNotificationService["sendEquipmentReportNotification"]
  >[1],
  reportStatus: "created" | "updated",
) {
  try {
    await emailNotificationService.sendEquipmentReportNotification(
      submissions,
      recipients,
      reportStatus,
    );
  } catch (error) {
    console.warn("dispatcher_notifications.email_send_failed", error);
  }
}

async function notifyByMax(
  maxNotificationService: MaxNotificationService,
  submission: Awaited<ReturnType<DispatcherSubmissionsRepository["create"]>>,
  recipients: Parameters<
    MaxNotificationService["sendDispatcherSubmissionNotification"]
  >[1],
) {
  try {
    await maxNotificationService.sendDispatcherSubmissionNotification(
      submission,
      recipients,
    );
  } catch (error) {
    console.warn("dispatcher_notifications.max_send_failed", error);
  }
}

async function notifyEquipmentReportByMax(
  maxNotificationService: MaxNotificationService,
  submissions: readonly DispatcherSubmission[],
  recipients: Parameters<
    MaxNotificationService["sendEquipmentReportNotification"]
  >[1],
  reportStatus: "created" | "updated",
) {
  try {
    await maxNotificationService.sendEquipmentReportNotification(
      submissions,
      recipients,
      reportStatus,
    );
  } catch (error) {
    console.warn("dispatcher_notifications.max_send_failed", error);
  }
}

function applyCors(
  req: IncomingMessage,
  res: ServerResponse,
  config: ServerConfig,
) {
  const origin = req.headers.origin;

  if (origin !== undefined && isCorsOriginAllowed(origin, config.corsOrigins)) {
    res.setHeader("access-control-allow-origin", origin);
    res.setHeader("access-control-allow-credentials", "true");
    res.setHeader("vary", "Origin");
  }

  res.setHeader("access-control-allow-methods", "GET,POST,PATCH,DELETE,OPTIONS");
  res.setHeader(
    "access-control-allow-headers",
    "Accept,Content-Type,X-SMB-Account-Id,X-SMB-Dev-Session",
  );
}

function isCorsOriginAllowed(origin: string, allowedOrigins: string[]) {
  return allowedOrigins.some((allowedOrigin) =>
    isCorsOriginMatch(origin, allowedOrigin),
  );
}

function isCorsOriginMatch(origin: string, allowedOrigin: string) {
  if (!allowedOrigin.includes("*")) {
    return origin === allowedOrigin;
  }

  try {
    const originUrl = new URL(origin);
    const allowedUrl = new URL(allowedOrigin);

    return (
      originUrl.protocol === allowedUrl.protocol &&
      originUrl.port === allowedUrl.port &&
      originUrl.pathname === "/" &&
      allowedUrl.pathname === "/" &&
      originUrl.search.length === 0 &&
      allowedUrl.search.length === 0 &&
      originUrl.hash.length === 0 &&
      allowedUrl.hash.length === 0 &&
      isWildcardHostnameMatch(originUrl.hostname, allowedUrl.hostname)
    );
  } catch {
    return false;
  }
}

function isWildcardHostnameMatch(hostname: string, allowedHostname: string) {
  const pattern = allowedHostname
    .toLowerCase()
    .split("*")
    .map(escapeRegExp)
    .join("[a-z0-9-]+");
  const matcher = new RegExp(`^${pattern}$`);

  return matcher.test(hostname.toLowerCase());
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function handleAuthLogin(
  req: IncomingMessage,
  res: ServerResponse,
  config: ServerConfig,
  authService: AuthSessionService | undefined,
  audit: AuditRepository,
  databaseTransaction: DatabaseTransactionRunner,
) {
  if (req.method !== "POST") {
    sendJson(res, 405, {
      error: {
        code: "access_denied",
        message: "Only POST is supported for auth login.",
      },
    });
    return;
  }

  if (authService === undefined) {
    sendJson(res, 503, {
      error: {
        code: "server_error",
        message: "Auth service is not configured.",
      },
    });
    return;
  }

  const payload = await readJsonBody(req);
  const credentials = readLoginCredentials(payload);

  if (credentials === undefined) {
    sendJson(res, 400, {
      error: {
        code: "invalid_response",
        message: "Login and password are required.",
      },
    });
    return;
  }

  const login = await runAuditedMutation({
    transaction: databaseTransaction,
    audit,
    mutate: () => authService.login(credentials),
    buildEvent: (result) => !result.ok
      ? undefined
      : {
          actor: buildAuditActor(result.session.profile, credentials.login),
          category: "authentication",
          action: "auth.login",
          summary: "Выполнен вход в систему",
          targetType: "auth_session",
        },
  });

  if (!login.ok) {
    sendJson(res, 401, {
      error: {
        code: "unauthenticated",
        message: "Invalid login or password.",
      },
    });
    return;
  }

  res.setHeader("set-cookie", buildAuthCookie(config, login.session));
  sendJson(res, 200, {
    ok: true,
    profile: login.session.profile,
  });
}

async function handleAuthLogout(
  req: IncomingMessage,
  res: ServerResponse,
  config: ServerConfig,
  authService: AuthSessionService | undefined,
  audit: AuditRepository,
  databaseTransaction: DatabaseTransactionRunner,
) {
  if (req.method !== "POST") {
    sendJson(res, 405, {
      error: {
        code: "access_denied",
        message: "Only POST is supported for auth logout.",
      },
    });
    return;
  }

  const sessionId = readAuthSessionId(req, config);
  await runAuditedMutation({
    transaction: databaseTransaction,
    audit,
    mutate: async () => {
      const session = sessionId === undefined
        ? undefined
        : await authService?.readSession(sessionId);

      if (sessionId !== undefined) {
        await authService?.deleteSession(sessionId);
      }

      return session;
    },
    buildEvent: (session) => session === undefined
      ? undefined
      : {
          actor: buildAuditActor(session.profile),
          category: "authentication",
          action: "auth.logout",
          summary: "Выполнен выход из системы",
          targetType: "auth_session",
        },
  });

  res.setHeader("set-cookie", buildExpiredAuthCookie(config));
  sendJson(res, 200, { ok: true });
}

async function handleAccessProfile(
  req: IncomingMessage,
  res: ServerResponse,
  dependencies: {
    config: ServerConfig;
    devSessions: Map<string, DevAccessSession>;
    authService: AuthSessionService | undefined;
  },
) {
  if (req.method !== "GET") {
    sendJson(res, 405, {
      error: {
        code: "access_denied",
        message: "Only GET is supported for access/profile.",
      },
    });
    return;
  }

  const access = await readRequestAccess(req, dependencies);

  sendJson(res, 200, {
    profile: access?.profile ?? null,
  });
}

async function handleDevAccessSession(
  req: IncomingMessage,
  res: ServerResponse,
  devSessions: Map<string, DevAccessSession>,
  accounts: AccountsRepository | undefined,
  audit: AuditRepository,
) {
  if (req.method === "GET") {
    sendJson(res, 200, {
      options: await readDevAccessOptions(accounts),
    });
    return;
  }

  if (req.method === "DELETE") {
    const sessionId = readDevSessionId(req);
    const session = sessionId === undefined ? undefined : devSessions.get(sessionId);

    if (session !== undefined) {
      const profile = buildDevProfile(session.option, session.createdAt) as ServerUserProfile;
      await recordAuditEvent(audit, {
        actor: buildAuditActor(profile),
        category: "authentication",
        action: "auth.logout",
        summary: "Выполнен выход из системы",
        targetType: "auth_session",
      });
    }

    if (sessionId !== undefined) {
      devSessions.delete(sessionId);
    }

    res.setHeader(
      "set-cookie",
      `${devSessionCookie}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`,
    );
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method !== "POST") {
    sendJson(res, 405, {
      error: {
        code: "access_denied",
        message: "Only GET, POST and DELETE are supported for dev access session.",
      },
    });
    return;
  }

  const payload = await readJsonBody(req);

  if (!isRecord(payload)) {
    sendJson(res, 400, {
      error: {
        code: "access_denied",
        message: "Unsupported dev account type.",
      },
    });
    return;
  }

  const option = typeof payload.position === "string"
    ? (await readDevAccessOptions(accounts)).find(
        (item) => item.position === payload.position,
      )
    : isAccountType(payload.accountType)
      ? buildDefaultDevAccessOptions().find(
          (item) => item.accountType === payload.accountType,
        )
      : undefined;

  if (option === undefined) {
    sendJson(res, 400, {
      error: {
        code: "access_denied",
        message: "Unsupported dev account position.",
      },
    });
    return;
  }

  const sessionId = createDevSessionId(option.accountType);

  const createdAt = new Date().toISOString();
  const session = {
    option,
    createdAt,
  };
  const profile = buildDevProfile(option, createdAt) as ServerUserProfile;
  await recordAuditEvent(audit, {
    actor: buildAuditActor(profile),
    category: "authentication",
    action: "auth.login",
    summary: "Выполнен вход в систему",
    targetType: "auth_session",
  });
  devSessions.set(sessionId, session);

  res.setHeader(
    "set-cookie",
    `${devSessionCookie}=${sessionId}; Path=/; HttpOnly; SameSite=Lax`,
  );
  sendJson(res, 200, { ok: true, sessionId });
}

async function requireCapability(
  req: IncomingMessage,
  res: ServerResponse,
  {
    config,
    devSessions,
    authService,
    capability,
    message = "Required access is missing.",
    alternativeNavigationItem,
  }: {
    config: ServerConfig;
    devSessions: Map<string, DevAccessSession>;
    authService: AuthSessionService | undefined;
    capability: AccountCapability;
    message?: string;
    alternativeNavigationItem?: AccountNavigationItem;
  },
) {
  const access = await readRequestAccess(req, {
    config,
    devSessions,
    authService,
  });

  if (access === undefined) {
    sendJson(res, 401, {
      error: {
        code: "unauthenticated",
        message: "Authentication is required.",
      },
    });
    return undefined;
  }

  const hasAlternativeNavigationItem =
    alternativeNavigationItem !== undefined &&
    access.profile.activeAccess.navigationItems.includes(
      alternativeNavigationItem,
    );
  if (
    !hasProfileCapability(access.profile, capability) &&
    !hasAlternativeNavigationItem
  ) {
    sendJson(res, 403, {
      error: {
        code: "access_denied",
        message,
      },
    });
    return undefined;
  }

  return access;
}

function hasAccountPreviewReadAccess(
  req: IncomingMessage,
  profile: ServerUserProfile,
) {
  return (
    req.method === "GET" &&
    profile.activeAccess.navigationItems.includes("admin.account_preview")
  );
}

async function requireAuthentication(
  req: IncomingMessage,
  res: ServerResponse,
  dependencies: {
    config: ServerConfig;
    devSessions: Map<string, DevAccessSession>;
    authService: AuthSessionService | undefined;
  },
) {
  const access = await readRequestAccess(req, dependencies);

  if (access === undefined) {
    sendJson(res, 401, {
      error: {
        code: "unauthenticated",
        message: "Authentication is required.",
      },
    });
    return undefined;
  }

  return access;
}

async function readRequestAccess(
  req: IncomingMessage,
  {
    config,
    devSessions,
    authService,
  }: {
    config: ServerConfig;
    devSessions: Map<string, DevAccessSession>;
    authService: AuthSessionService | undefined;
  },
): Promise<
  | {
      profile: ServerUserProfile;
      source: "auth" | "dev";
    }
  | undefined
> {
  const authSessionId = readAuthSessionId(req, config);

  if (authSessionId !== undefined) {
    const session = await authService?.readSession(authSessionId);

    if (session !== undefined) {
      return {
        profile: session.profile,
        source: "auth",
      };
    }
  }

  if (!config.devAccessEnabled) {
    return undefined;
  }

  const devSessionId = readDevSessionId(req);
  const devSession =
    devSessionId === undefined ? undefined : devSessions.get(devSessionId);

  if (devSession === undefined) {
    return undefined;
  }

  if (isDevAccessSessionExpired(devSession)) {
    if (devSessionId !== undefined) {
      devSessions.delete(devSessionId);
    }
    return undefined;
  }

  return {
    profile: buildDevProfile(
      devSession.option,
      devSession.createdAt,
    ) as ServerUserProfile,
    source: "dev",
  };
}

async function readDevAccessOptions(
  accounts: AccountsRepository | undefined,
): Promise<DevAccessOption[]> {
  if (accounts === undefined) {
    return buildDefaultDevAccessOptions();
  }

  return (await accounts.listPositions()).map((position) => ({
    position: position.id,
    positionDisplayName: position.displayName,
    accountType: position.accountType,
    navigationItems: [...position.navigationItems],
    capabilities: [...position.capabilities],
  }));
}

function readLoginCredentials(payload: unknown) {
  if (!isRecord(payload)) {
    return undefined;
  }

  const login = typeof payload.login === "string" ? payload.login.trim() : "";
  const password =
    typeof payload.password === "string" ? payload.password : "";

  if (login.length === 0 || password.length === 0) {
    return undefined;
  }

  return {
    login,
    password,
  };
}

function buildAuthCookie(
  config: ServerConfig,
  session: AuthenticatedSession,
) {
  const maxAgeSeconds = Math.max(
    1,
    Math.floor((Date.parse(session.expiresAt) - Date.now()) / 1000),
  );

  return [
    `${config.session.cookieName}=${session.sessionId}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAgeSeconds}`,
    config.appEnv === "production" ? "Secure" : undefined,
  ]
    .filter((value): value is string => value !== undefined)
    .join("; ");
}

function buildExpiredAuthCookie(config: ServerConfig) {
  return [
    `${config.session.cookieName}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0",
    config.appEnv === "production" ? "Secure" : undefined,
  ]
    .filter((value): value is string => value !== undefined)
    .join("; ");
}

function readAuthSessionId(req: IncomingMessage, config: ServerConfig) {
  return readCookie(req.headers.cookie, config.session.cookieName);
}

function sendJson(res: ServerResponse, statusCode: number, payload: JsonPayload) {
  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(JSON.stringify(payload));
}

function sendPdf(res: ServerResponse, pdf: Buffer, filename: string) {
  const asciiFilename = filename
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9._ -]/gu, "")
    .trim()
    .replace(/\s+/gu, "-") || "laboratory-protocol.pdf";
  res.writeHead(200, {
    "content-type": "application/pdf",
    "content-length": String(pdf.length),
    "content-disposition":
      `inline; filename="${asciiFilename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    "cache-control": "no-store",
  });
  res.end(pdf);
}

function readJsonBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let body = "";

    req.setEncoding("utf8");
    req.on("data", (chunk: string) => {
      body += chunk;

      if (Buffer.byteLength(body, "utf8") > maxBodyBytes) {
        reject(new Error("Request body is too large."));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (body.trim().length === 0) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(body));
      } catch {
        resolve(null);
      }
    });
    req.on("error", reject);
  });
}

function readBinaryBody(
  req: IncomingMessage,
  maxBytes: number,
): Promise<Buffer> {
  const contentLength = Number(req.headers["content-length"]);
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    req.resume();
    return Promise.reject(new RequestBodyTooLargeError());
  }

  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let byteLength = 0;
    let isTooLarge = false;

    req.on("data", (chunk: Buffer | string) => {
      if (isTooLarge) {
        return;
      }

      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      byteLength += buffer.length;
      if (byteLength > maxBytes) {
        isTooLarge = true;
        chunks.length = 0;
        return;
      }

      chunks.push(buffer);
    });
    req.on("end", () => {
      if (isTooLarge) {
        reject(new RequestBodyTooLargeError());
        return;
      }

      resolve(Buffer.concat(chunks, byteLength));
    });
    req.on("error", reject);
  });
}

function readBoardAssignmentDocumentFileName(value: string | null) {
  if (value === null) {
    return undefined;
  }

  const normalized = value.normalize("NFKC").trim().replace(/\s+/gu, " ");
  if (
    normalized.length === 0 ||
    normalized.length > 255 ||
    !/\.pdf$/iu.test(normalized) ||
    /[\\/\u0000-\u001f\u007f]/u.test(normalized)
  ) {
    return undefined;
  }

  return normalized;
}

function readSubmittedByAccountId(
  req: IncomingMessage,
  profile: ServerUserProfile | undefined,
  config: ServerConfig,
) {
  if (config.appEnv === "production" && profile !== undefined) {
    return profile.activeAccess.accountId;
  }

  const trimmed = readHeader(req, accountHeader);

  return trimmed && trimmed.length > 0
    ? trimmed
    : (profile?.activeAccess.accountId ?? "dev-dispatcher-account");
}

function readDispatcherFeedFilters(url: URL):
  | {
      ok: true;
      value: DispatcherFeedFilters;
    }
  | {
      ok: false;
      errors: string[];
    } {
  const errors: string[] = [];
  const filters: DispatcherFeedFilters = {};
  const formId = readOptionalQueryParam(url, "formId");
  const dateFrom = readOptionalQueryParam(url, "dateFrom");
  const dateTo = readOptionalQueryParam(url, "dateTo");
  const reportDate = readOptionalQueryParam(url, "reportDate");
  const limit = readOptionalQueryParam(url, "limit");
  const offset = readOptionalQueryParam(url, "offset");

  if (formId !== undefined) {
    if (isDispatcherFormId(formId)) {
      filters.formId = formId;
    } else {
      errors.push("formId must be a supported dispatcher form id.");
    }
  }

  if (dateFrom !== undefined) {
    if (isDateQueryValue(dateFrom)) {
      filters.dateFrom = dateFrom;
    } else {
      errors.push("dateFrom must use YYYY-MM-DD format.");
    }
  }

  if (dateTo !== undefined) {
    if (isDateQueryValue(dateTo)) {
      filters.dateTo = dateTo;
    } else {
      errors.push("dateTo must use YYYY-MM-DD format.");
    }
  }

  if (reportDate !== undefined) {
    if (isDateQueryValue(reportDate)) {
      filters.reportDate = reportDate;
    } else {
      errors.push("reportDate must use YYYY-MM-DD format.");
    }
  }

  if (limit !== undefined) {
    const parsedLimit = Number(limit);

    if (Number.isInteger(parsedLimit) && parsedLimit > 0) {
      filters.limit = parsedLimit;
    } else {
      errors.push("limit must be a positive integer.");
    }
  }

  if (offset !== undefined) {
    const parsedOffset = Number(offset);

    if (Number.isInteger(parsedOffset) && parsedOffset >= 0) {
      filters.offset = parsedOffset;
    } else {
      errors.push("offset must be a non-negative integer.");
    }
  }

  if (errors.length > 0) {
    return {
      ok: false,
      errors,
    };
  }

  return {
    ok: true,
    value: filters,
  };
}

function readProductionReportTotalsRange(url: URL):
  | {
      ok: true;
      value: ProductionReportDateRange;
    }
  | {
      ok: false;
      errors: string[];
    } {
  const errors: string[] = [];
  const value: ProductionReportDateRange = {};
  const dateFrom = readOptionalQueryParam(url, "productionDateFrom");
  const dateTo = readOptionalQueryParam(url, "productionDateTo");

  if (dateFrom !== undefined) {
    if (isDateQueryValue(dateFrom)) {
      value.dateFrom = dateFrom;
    } else {
      errors.push("productionDateFrom must use YYYY-MM-DD format.");
    }
  }

  if (dateTo !== undefined) {
    if (isDateQueryValue(dateTo)) {
      value.dateTo = dateTo;
    } else {
      errors.push("productionDateTo must use YYYY-MM-DD format.");
    }
  }

  return errors.length === 0 ? { ok: true, value } : { ok: false, errors };
}

async function listAllProductionSubmissions(
  repository: DispatcherSubmissionsRepository,
  reportMonth?: string,
) {
  const pageLimit = 2_000;
  const submissions: DispatcherSubmission[] = [];
  const seenIds = new Set<string>();
  let offset = 0;

  while (true) {
    const page = await repository.listLatest({
      formId: "production",
      ...(reportMonth === undefined ? {} : { reportMonth }),
      limit: pageLimit,
      offset,
    });
    let appendedCount = 0;

    for (const submission of page) {
      if (seenIds.has(submission.id)) {
        continue;
      }

      seenIds.add(submission.id);
      submissions.push(submission);
      appendedCount += 1;
    }

    if (page.length < pageLimit || appendedCount === 0) {
      return submissions;
    }

    offset += page.length;
  }
}

async function listAllIncidentSubmissions(
  repository: DispatcherSubmissionsRepository,
) {
  const pageLimit = 2_000;
  const submissions: DispatcherSubmission[] = [];
  const seenIds = new Set<string>();

  for (const formId of ["incident", "incident_close"] as const) {
    let offset = 0;

    while (true) {
      const page = await repository.listLatest({
        formId,
        limit: pageLimit,
        offset,
      });
      let appendedCount = 0;

      for (const submission of page) {
        if (seenIds.has(submission.id)) continue;

        seenIds.add(submission.id);
        submissions.push(submission);
        appendedCount += 1;
      }

      if (page.length < pageLimit || appendedCount === 0) break;
      offset += page.length;
    }
  }

  return submissions;
}

function readOptionalQueryParam(url: URL, name: string) {
  const value = url.searchParams.get(name)?.trim();

  return value === undefined || value.length === 0 ? undefined : value;
}

function readLaboratoryChemicalAnalysisFilters(url: URL):
  | {
      ok: true;
      value: Pick<
        LaboratoryChemicalAnalysisJournalFilters,
        "dateFrom" | "dateTo" | "query"
      >;
    }
  | { ok: false } {
  const dateFrom = readOptionalQueryParam(url, "dateFrom");
  const dateTo = readOptionalQueryParam(url, "dateTo");
  const query = readOptionalQueryParam(url, "query");

  if (
    (dateFrom !== undefined && !isCalendarDateQueryValue(dateFrom)) ||
    (dateTo !== undefined && !isCalendarDateQueryValue(dateTo)) ||
    (dateFrom !== undefined && dateTo !== undefined && dateFrom > dateTo) ||
    (query !== undefined && query.length > 120)
  ) {
    return { ok: false };
  }

  return {
    ok: true,
    value: {
      ...(dateFrom === undefined ? {} : { dateFrom }),
      ...(dateTo === undefined ? {} : { dateTo }),
      ...(query === undefined ? {} : { query }),
    },
  };
}

function isDateQueryValue(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function formatMoscowCalendarDate(value: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Moscow",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const partByType = new Map(parts.map((part) => [part.type, part.value]));

  return `${partByType.get("year")}-${partByType.get("month")}-${partByType.get("day")}`;
}

function formatLaboratoryRawMaterialQualityAuditValue(
  record: LaboratoryRawMaterialQualitySubmission,
  field: keyof LaboratoryRawMaterialQualitySubmission,
) {
  if (field === "shift") {
    return laboratoryRawMaterialQualityShiftLabels[record.shift];
  }
  if (field === "recommendationRecipient") {
    return laboratoryRawMaterialQualityRecommendationRecipientLabels[
      record.recommendationRecipient
    ];
  }
  return record[field];
}

async function resolveLaboratoryGreenProductQualityBrand({
  res,
  productionBrands,
  record,
}: {
  res: ServerResponse;
  productionBrands: ProductionBrandsDataSource;
  record: LaboratoryGreenProductQualitySubmission;
}): Promise<LaboratoryGreenProductQualitySubmission | undefined> {
  const references = await resolveProductionBrandReferencesForRequest({
    res,
    productionBrands,
    references: [{ fieldName: "productBrand", label: record.productBrand }],
    logEvent: "laboratory_green_product_quality_brand_lookup_failed",
  });
  if (references === undefined) return undefined;
  return {
    ...record,
    productBrand: references[0]?.label ?? record.productBrand,
  };
}

function formatLaboratoryGreenProductQualityAuditValue(
  record:
    | LaboratoryGreenProductQualityRecord
    | LaboratoryGreenProductQualitySnapshot,
  field: keyof LaboratoryGreenProductQualitySubmission,
) {
  if (field === "wagonIds") {
    return record.wagons.map((wagon) => wagon.number).join("; ");
  }
  return record[field];
}

function sendLaboratoryGreenProductQualityWagonError(
  res: ServerResponse,
  error: unknown,
) {
  if (!(error instanceof LaboratoryGreenProductQualityWagonUnavailableError)) {
    return false;
  }
  sendJson(res, 400, {
    error: {
      code: "invalid_response",
      message: "Один или несколько выбранных вагонов отсутствуют в журнале вагонов.",
    },
  });
  return true;
}

function isCalendarDateQueryValue(value: string) {
  if (!isDateQueryValue(value)) {
    return false;
  }

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function readProductionSubmissionMonth(
  payload: DispatcherSubmission["payload"],
) {
  const reportMonth = payload.reportMonth?.trim();

  if (reportMonth !== undefined && /^\d{4}-\d{2}$/u.test(reportMonth)) {
    return reportMonth;
  }

  const reportDate = payload.reportDate?.trim();

  if (reportDate === undefined) {
    return undefined;
  }

  const iso = /^(\d{4})-(\d{2})-\d{2}$/u.exec(reportDate);

  if (iso !== null) {
    return `${iso[1]}-${iso[2]}`;
  }

  const russian = /^\d{2}\.(\d{2})\.(\d{4})$/u.exec(reportDate);
  return russian === null ? undefined : `${russian[2]}-${russian[1]}`;
}

function readDevSessionId(req: IncomingMessage) {
  return readHeader(req, devSessionHeader) ?? readCookie(req.headers.cookie, devSessionCookie);
}

function readHeader(req: IncomingMessage, name: string) {
  const header = req.headers[name];
  const value = Array.isArray(header) ? header[0] : header;
  const trimmed = value?.trim();

  return trimmed && trimmed.length > 0 ? trimmed : undefined;
}

function readCookie(header: string | undefined, name: string) {
  if (header === undefined) {
    return undefined;
  }

  return header
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
