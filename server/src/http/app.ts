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
  resolveCapabilitiesForNavigation,
  validateNonAdminNavigationItems,
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
import { applyIncidentStateRules } from "../domain/dispatcherIncidentState.js";
import { applyVisitorStateRules } from "../domain/dispatcherVisitorState.js";
import {
  buildProductionMonthOverview,
  buildProductionReportTables,
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
} from "../domain/refractoryReport.js";
import {
  getDispatcherFormDefinition,
  getPublicDispatcherForms,
  isDispatcherFormId,
} from "../domain/dispatcherForms.js";
import type {
  DispatcherFeedFilters,
  DispatcherSubmissionsRepository,
} from "../repositories/dispatcherSubmissionsRepository.js";
import type {
  AdminDatabaseRepository,
  AdminDatabaseCellValue,
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
  createGoogleSheetsReferenceDataSource,
  type DispatcherReferenceDataSource,
} from "../integrations/googleSheetsReference.js";
import {
  createEmailNotificationService,
  type EmailNotificationService,
} from "../integrations/emailNotifications.js";
import {
  createMaxNotificationService,
  type MaxNotificationService,
} from "../integrations/maxNotifications.js";
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
import type { ProductionBrandsRepository } from "../repositories/productionBrandsRepository.js";
import {
  RefractoryReportAlreadyReviewedError,
  RefractoryReportNotFoundError,
  RefractoryReportPendingError,
  RefractoryReportSelfReviewError,
  toPublicRefractoryReportRevision,
  type RefractoryReportRevision,
  type RefractoryReportsRepository,
} from "../repositories/refractoryReportsRepository.js";

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
  productionBrands?: ProductionBrandsRepository;
  refractoryReports?: RefractoryReportsRepository;
  audit: AuditRepository;
  databaseTransaction: DatabaseTransactionRunner;
  productionSnapshot?: ProductionDatabaseSnapshotService;
};

type JsonPayload = Record<string, unknown> | unknown[];

const maxBodyBytes = 100_000;
const devSessionCookie = "smb_dev_access_session";
const devSessionHeader = "x-smb-dev-session";
const accountHeader = "x-smb-account-id";

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
  productionBrands,
  refractoryReports,
  audit,
  databaseTransaction,
  productionSnapshot,
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
          dispatcherSpreadsheetImport,
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

      if (
        url.pathname === "/api/refractory-reports" ||
        url.pathname === "/api/refractory-reports/pending" ||
        url.pathname === "/api/refractory-reports/own" ||
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
          referenceDataSource,
          emailNotificationService,
          maxNotificationService,
          audit,
          databaseTransaction,
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
          const productionMonthOverview = buildProductionMonthOverview(
            productionReportTables,
          );
          const submissions = await dispatcherSubmissions.listLatest(filters.value);
          const summary = await dispatcherSubmissions.readSummary(filters.value);

          sendJson(res, 200, {
            submissions,
            productionReportTables,
            productionMonthOverview: productionMonthOverview ?? null,
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
          const validation = validateDispatcherSubmissionDraft(payload);

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
            if (productionBrands === undefined) {
              sendJson(res, 503, {
                error: {
                  code: "server_error",
                  message: "Справочник марок не настроен.",
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

          let submission: DispatcherSubmission;

          try {
            submission = await runAuditedMutation({
              transaction: databaseTransaction,
              audit,
              mutate: async () => {
                if (visitorStateValidation.value.draft.formId === "production") {
                  if (productionBrands === undefined) {
                    throw new Error("Production brands repository is not configured.");
                  }

                  const references = readProductionSubmissionBrandReferences(
                    visitorStateValidation.value.draft.payload,
                  );
                  const resolution = await productionBrands.resolveReferences(references);

                  if (!resolution.ok) {
                    throw new MissingProductionBrandError(resolution.missing.label);
                  }

                  for (const reference of resolution.references) {
                    visitorStateValidation.value.draft.payload[reference.fieldName] =
                      reference.label;
                  }
                }

                return dispatcherSubmissions.create(
                  visitorStateValidation.value,
                  readSubmittedByAccountId(req, access.profile, config),
                );
              },
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
          } catch (error) {
            if (error instanceof MissingProductionBrandError) {
              sendJson(res, 400, {
                error: {
                  code: "invalid_response",
                  message: `Сначала сохраните марку «${error.label}» в справочник.`,
                },
              });
              return;
            }

            throw error;
          }

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

async function handleRefractoryReportsRequest({
  req,
  res,
  url,
  config,
  devSessions,
  authService,
  refractoryReports,
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

class MissingProductionBrandError extends Error {
  constructor(readonly label: string) {
    super(`Production brand is missing: ${label}`);
    this.name = "MissingProductionBrandError";
  }
}

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
  productionBrands: ProductionBrandsRepository | undefined;
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

  const canRead = ([
    "business.submit_dispatcher_forms",
    "business.view_dispatcher_feed",
    "business.manage_production_plan",
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

  if (productionBrands === undefined) {
    sendJson(res, 503, {
      error: {
        code: "server_error",
        message: "Справочник марок не настроен.",
      },
    });
    return;
  }

  if (req.method === "GET") {
    sendJson(res, 200, { labels: await productionBrands.list() });
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

  if (
    !hasProfileCapability(
      access.profile,
      "business.submit_dispatcher_forms",
    )
  ) {
    sendJson(res, 403, {
      error: {
        code: "access_denied",
        message: "Добавлять марки может только диспетчер.",
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

  const result = await runAuditedMutation({
    transaction: databaseTransaction,
    audit,
    mutate: () => productionBrands.create({
      ...validation.value,
      createdByUserId: access.profile.userId,
    }),
    buildEvent: (created) => created.created ? ({
      actor: buildAuditActor(access.profile),
      category: "data_change",
      action: "production_brand.create",
      summary: `Добавлена марка «${created.label.label}»`,
      details: [
        { label: "Справочник", value: created.label.category },
        { label: "Марка", value: created.label.label },
      ],
      targetType: "production_brand",
      targetId: created.label.id,
    }) : undefined,
  });

  sendJson(res, result.created ? 201 : 200, { label: result.label });
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
      errors: ["Передайте справочник и название марки."],
    };
  }

  const allowedFields = new Set(["category", "label"]);
  const unexpectedFields = Object.keys(payload).filter(
    (fieldName) => !allowedFields.has(fieldName),
  );

  if (unexpectedFields.length > 0) {
    return {
      ok: false as const,
      errors: ["Запрос содержит неизвестные поля."],
    };
  }

  return normalizeProductionBrandLabelInput(payload.category, payload.label);
}

async function handleProductionPlansRequest({
  req,
  res,
  url,
  config,
  devSessions,
  authService,
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

    const canReadDailyPlan = ([
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

    const revision = await productionPlans.readLatest(date.slice(0, 7));
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

    sendJson(res, 200, {
      plan: values.length === 0
        ? null
        : { date, values: Object.fromEntries(values) },
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
    "business.dispatcher_form": "Форма",
  };

  return labels[item];
}

function readAdminDatabaseSectionLabel(tableName: string) {
  const labels: Record<string, string> = {
    app_users: "Пользователи",
    dispatcher_submissions: "Диспетчерские записи",
    production_product_brands: "Марки изделий",
    production_unformed_brands: "Марки неформованной продукции",
    production_chamotte_brands: "Марки шамота",
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
  dispatcherSpreadsheetImport,
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
  dispatcherSpreadsheetImport: DispatcherSpreadsheetImportService | undefined;
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
      const pagination = readAdminDatabasePagination(url);

      if (!pagination.ok) {
        sendJson(res, 400, {
          error: {
            code: "invalid_response",
            message: pagination.errors.join(" "),
          },
        });
        return;
      }

      sendJson(
        res,
        200,
        await adminDatabase.listRows(route.tableName, pagination.value),
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

      await runAuditedMutation({
        transaction: databaseTransaction,
        audit,
        mutate: () => adminDatabase.updateRow({
          tableName: route.tableName,
          primaryKey: validation.value.primaryKey,
          values: validation.value.values,
          changedByAccountId: access.profile.activeAccess.accountId,
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
  const isLoginStatusUpdate =
    url.pathname === "/api/admin/accounts" && req.method === "PATCH";
  const isAccountPositionUpdate =
    accountPositionAccessId !== undefined && req.method === "PATCH";
  const isPositionRequest = url.pathname.startsWith("/api/admin/positions");
  const isAccountDelete =
    url.pathname.startsWith("/api/admin/accounts/") &&
    url.pathname !== "/api/admin/accounts/reset-password" &&
    req.method === "DELETE";
  const requiresManageAccess =
    isLoginStatusUpdate || isAccountPositionUpdate || isPositionRequest || isAccountDelete ||
    (url.pathname === "/api/admin/accounts" && req.method === "POST");
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

    const positionChange = await runAuditedMutation({
      transaction: databaseTransaction,
      audit,
      mutate: () => accounts.setAccountPosition({
        accessId: accountPositionAccessId,
        position: targetPosition.id,
      }),
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
    const wasDeleted = await runAuditedMutation({
      transaction: databaseTransaction,
      audit,
      mutate: () => accounts.deleteAccount(userId),
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
    if (!wasDeleted) {
      sendJson(res, 404, { error: { code: "not_found", message: "Учётная запись не найдена." } });
      return;
    }
    sendJson(res, 200, { ok: true });
    return;
  }

  if (url.pathname === "/api/admin/positions") {
    if (req.method === "GET") {
      sendJson(res, 200, { positions: await accounts.listPositions() });
      return;
    }

    if (req.method === "POST") {
      const validation = validateCreatePositionRequest(await readJsonBody(req));
      if (!validation.ok) {
        sendJson(res, 400, { error: { code: "invalid_response", message: validation.errors.join(" ") } });
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
    if (existing.accountType === "admin" || (req.method === "DELETE" && existing.isProtected)) {
      sendJson(res, 409, { error: { code: "invalid_response", message: "Эту системную должность нельзя изменить или удалить." } });
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
        sendJson(res, 409, { error: { code: "invalid_response", message: "Системную должность нельзя удалить." } });
        return;
      }
      sendJson(res, 200, { ok: true });
      return;
    }
    const validation = validateUpdatePositionRequest(await readJsonBody(req), existing);
    if (!validation.ok) {
      sendJson(res, 400, { error: { code: "invalid_response", message: validation.errors.join(" ") } });
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
      });
      return;
    }

    if (req.method === "POST") {
      const payload = await readJsonBody(req);
      const requestedPosition = isRecord(payload) && typeof payload.position === "string"
        ? (await accounts.listPositions()).find((position) => position.id === payload.position)
        : undefined;
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
        const loginStatus = await runAuditedMutation({
          transaction: databaseTransaction,
          audit,
          mutate: () => accounts.setAccountLoginEnabled(validation.value),
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

  try {
    const wasReset = await runAuditedMutation({
      transaction: databaseTransaction,
      audit,
      mutate: () => accounts.resetPassword(validation.value),
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
    (key) => key !== "displayName" && key !== "navigationItems",
  );
  const displayName = typeof input.displayName === "string" ? input.displayName.trim() : "";
  const navigationItems = Array.isArray(input.navigationItems) ? input.navigationItems : [];
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
    !validateNonAdminNavigationItems(navigationItems)
  ) {
    errors.push("Выберите хотя бы одну доступную вкладку.");
  }
  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    value: {
      displayName,
      navigationItems,
      capabilities: resolveCapabilitiesForNavigation(navigationItems),
    },
  };
}

function validateUpdatePositionRequest(input: unknown, _existing: AdminPositionSummary):
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
  sendJson(res, 400, {
    error: {
      code: "invalid_response",
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
  }: {
    config: ServerConfig;
    devSessions: Map<string, DevAccessSession>;
    authService: AuthSessionService | undefined;
    capability: AccountCapability;
    message?: string;
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

  if (!hasProfileCapability(access.profile, capability)) {
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

async function listAllProductionSubmissions(
  repository: DispatcherSubmissionsRepository,
) {
  const pageLimit = 2_000;
  const submissions: DispatcherSubmission[] = [];
  const seenIds = new Set<string>();
  let offset = 0;

  while (true) {
    const page = await repository.listLatest({
      formId: "production",
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

function readOptionalQueryParam(url: URL, name: string) {
  const value = url.searchParams.get(name)?.trim();

  return value === undefined || value.length === 0 ? undefined : value;
}

function isDateQueryValue(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
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
