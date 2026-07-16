import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { ServerConfig } from "../config/env.js";
import {
  hasProfileCapability,
  isAccountNavigationItem,
  isAccountPosition,
  readScopedBusinessAccountId,
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
  validateNavigationItemsForAccountType,
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
  validateDispatcherSubmissionDraft,
  type DispatcherSubmission,
  type ValidatedDispatcherSubmissionDraft,
} from "../domain/dispatcherSubmission.js";
import { applyIncidentStateRules } from "../domain/dispatcherIncidentState.js";
import { applyVisitorStateRules } from "../domain/dispatcherVisitorState.js";
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
  audit: AuditRepository;
  databaseTransaction: DatabaseTransactionRunner;
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
  ),
  maxNotificationService = createMaxNotificationService(config.maxNotifications),
  dispatcherSpreadsheetImport,
  audit,
  databaseTransaction,
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

        const payload = applyAuthenticatedBusinessScope(
          await readJsonBody(req),
          access.profile,
          config,
        );
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
                businessAccountId: validation.value.businessAccountId,
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
            businessAccountId: validation.value.businessAccountId,
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

          const scopedFilters = applyAuthenticatedFeedScope(
            filters.value,
            access.profile,
            config,
          );
          const submissions = await dispatcherSubmissions.listLatest(scopedFilters);
          const summary = await dispatcherSubmissions.readSummary(scopedFilters);

          sendJson(res, 200, {
            submissions,
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

          const payload = applyAuthenticatedBusinessScope(
            await readJsonBody(req),
            access.profile,
            config,
          );
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

          const submission = await runAuditedMutation({
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
              businessAccountId: result.businessAccountId,
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
  const businessAccountId = canViewPlatformAudit
    ? undefined
    : hasProfileCapability(access.profile, "business.view_user_actions")
      ? readScopedBusinessAccountId(access.profile)
      : undefined;

  if (!canViewPlatformAudit && businessAccountId === undefined) {
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
      ...(businessAccountId === undefined ? {} : { businessAccountId }),
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
    businessAccountId: readScopedBusinessAccountId(access.profile),
  });

  sendJson(res, 201, { ok: true });
}

type EquipmentReportValidationResult =
  | {
      ok: true;
      value: {
        businessAccountId: string;
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

function buildSafeAuditDetails(values: Record<string, AdminDatabaseCellValue>) {
  return Object.entries(values).flatMap(([label, rawValue]) => {
    if (/password|secret|token|session|hash/iu.test(label)) {
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
    id: "ID записи",
    display_name: "Название",
    status: "Статус",
    structure_mode: "Структура",
    summary: "Краткое описание",
    comment: "Комментарий",
  };

  return labels[fieldName] ?? fieldName;
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

function buildPositionAuditDetails(position: AdminPositionSummary) {
  return [
    { label: "Должность", value: position.displayName },
    { label: "Базовый кабинет", value: readAccountTypeLabel(position.accountType) },
    {
      label: "Вкладки",
      value: position.navigationItems.length === 0
        ? "Нет"
        : position.navigationItems.map(readNavigationItemLabel).join(", "),
    },
  ];
}

function readAccountTypeLabel(accountType: AccountType) {
  switch (accountType) {
    case "admin":
      return "Администратор";
    case "business_owner":
      return "Руководитель";
    case "dispatcher":
      return "Диспетчер";
    case "worker":
      return "Работник";
  }
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
    "business.dispatcher_form": "Форма",
  };

  return labels[item];
}

function readAdminDatabaseSectionLabel(tableName: string) {
  const labels: Record<string, string> = {
    business_accounts: "Бизнес-аккаунты",
    departments: "Подразделения",
    app_users: "Пользователи",
    account_positions: "Должности",
    account_accesses: "Доступы аккаунтов",
    auth_password_credentials: "Пароли пользователей",
    auth_sessions: "Активные сессии",
    dispatcher_submissions: "Диспетчерские записи",
    dispatcher_equipment_report_revisions: "Изменения отчётов оборудования",
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

      await runAuditedMutation({
        transaction: databaseTransaction,
        audit,
        mutate: () => adminDatabase.updateRow({
          tableName: route.tableName,
          primaryKey: validation.value.primaryKey,
          values: validation.value.values,
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
  const isLoginStatusUpdate =
    url.pathname === "/api/admin/accounts" && req.method === "PATCH";
  const isPositionRequest = url.pathname.startsWith("/api/admin/positions");
  const isAccountDelete =
    url.pathname.startsWith("/api/admin/accounts/") &&
    url.pathname !== "/api/admin/accounts/reset-password" &&
    req.method === "DELETE";
  const requiresManageAccess =
    isLoginStatusUpdate || isPositionRequest || isAccountDelete ||
    (url.pathname === "/api/admin/accounts" && req.method === "POST");
  const access = await requireCapability(req, res, {
    config,
    devSessions,
    authService,
    capability: requiresManageAccess
      ? "platform.manage_access"
      : "platform.manage_users",
    message: isLoginStatusUpdate
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
    if (existing.isProtected) {
      sendJson(res, 409, { error: { code: "invalid_response", message: "Системную должность нельзя изменить или удалить." } });
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

  for (const field of [
    "userId",
    "accessId",
    "businessAccountId",
    "departmentId",
    "accessDisplayName",
    "capabilities",
    "accountType",
    "accessLevelId",
    "businessDisplayName",
    "departmentDisplayName",
  ]) {
    if (Object.prototype.hasOwnProperty.call(input, field)) {
      errors.push(`${field} is managed by the server.`);
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
      accountType: "business_owner" | "worker" | "dispatcher";
      navigationItems: AccountNavigationItem[];
      capabilities: AccountCapability[];
    } }
  | { ok: false; errors: string[] } {
  if (!isRecord(input) || Array.isArray(input)) {
    return { ok: false, errors: ["Payload must be a JSON object."] };
  }

  const displayName = typeof input.displayName === "string" ? input.displayName.trim() : "";
  const accountType = input.accountType;
  const navigationItems = Array.isArray(input.navigationItems) ? input.navigationItems : [];
  const errors: string[] = [];
  const isAllowedBase =
    accountType === "business_owner" || accountType === "worker" || accountType === "dispatcher";

  if (displayName.length === 0 || displayName.length > 160) {
    errors.push("Укажите название должности.");
  }
  if (!isAllowedBase) {
    errors.push("Выберите базовый кабинет.");
  }
  if (isAllowedBase && accountType === "worker" && navigationItems.length > 0) {
    errors.push("Кабинет работника пока не поддерживает вкладки.");
  } else if (
    isAllowedBase &&
    accountType !== "worker" &&
    (navigationItems.length === 0 ||
      !navigationItems.every(isAccountNavigationItem) ||
      !validateNavigationItemsForAccountType(accountType, navigationItems))
  ) {
    errors.push("Выберите хотя бы одну доступную вкладку.");
  }
  if (errors.length > 0 || !isAllowedBase) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    value: {
      displayName,
      accountType,
      navigationItems,
      capabilities: resolveCapabilitiesForNavigation(navigationItems),
    },
  };
}

function validateUpdatePositionRequest(input: unknown, _existing: AdminPositionSummary):
  | { ok: true; value: { displayName: string; accountType: "business_owner" | "worker" | "dispatcher"; navigationItems: AccountNavigationItem[]; capabilities: AccountCapability[] } }
  | { ok: false; errors: string[] } {
  const validation = validateCreatePositionRequest(input);
  if (!validation.ok) {
    return validation;
  }

  return {
    ok: true,
    value: {
      displayName: validation.value.displayName,
      accountType: validation.value.accountType,
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
  const match = /^\/api\/admin\/database\/tables\/([^/]+)\/rows(?:\/(all))?$/.exec(
    url.pathname,
  );

  if (match === null) {
    return undefined;
  }

  return {
    tableName: decodeURIComponent(match[1]),
    clearAll: match[2] === "all",
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

  if (spreadsheetUrl.length === 0 || spreadsheetUrl.length > 2_000) {
    errors.push("spreadsheetUrl is required and must be 2000 characters or less.");
  }

  if (input.businessAccountId !== undefined) {
    errors.push("businessAccountId is managed by the server.");
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

  const businessAccountId =
    typeof input.businessAccountId === "string"
      ? input.businessAccountId.trim()
      : "";
  const errors: string[] = [];

  if (businessAccountId.length === 0) {
    errors.push("businessAccountId is required.");
  }

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
        businessAccountId,
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
      businessAccountId,
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
        buildEquipmentSubmissionKey(
          submission.businessAccountId,
          submission.payload.reportDate,
          submission.payload.equipment,
        ),
      )
      .filter((value): value is string => value !== undefined),
  );

  return report.items.some((item) =>
    existingKeys.has(buildDispatcherSubmissionDedupeKey(item.draft) ?? ""),
  )
    ? "updated"
    : "created";
}

function buildEquipmentSubmissionKey(
  businessAccountId: string,
  reportDate: string | undefined,
  equipment: string | undefined,
) {
  const trimmedReportDate = reportDate?.trim();
  const trimmedEquipment = equipment?.trim();

  if (
    trimmedReportDate === undefined ||
    trimmedReportDate.length === 0 ||
    trimmedEquipment === undefined ||
    trimmedEquipment.length === 0
  ) {
    return undefined;
  }

  return `equipment:${businessAccountId}:${trimmedReportDate}:${trimmedEquipment}`;
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
          businessAccountId: readScopedBusinessAccountId(result.session.profile),
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
          businessAccountId: readScopedBusinessAccountId(session.profile),
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
        businessAccountId: readScopedBusinessAccountId(profile),
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
    businessAccountId: readScopedBusinessAccountId(profile),
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

function applyAuthenticatedBusinessScope(
  payload: unknown,
  profile: ServerUserProfile,
  config: ServerConfig,
) {
  if (config.appEnv !== "production") {
    return payload;
  }

  const businessAccountId = readScopedBusinessAccountId(profile);

  if (businessAccountId === undefined || !isRecord(payload)) {
    return payload;
  }

  return {
    ...payload,
    businessAccountId,
  };
}

function applyAuthenticatedFeedScope(
  filters: DispatcherFeedFilters,
  profile: ServerUserProfile,
  config: ServerConfig,
): DispatcherFeedFilters {
  if (config.appEnv !== "production") {
    return filters;
  }

  const businessAccountId = readScopedBusinessAccountId(profile);

  if (businessAccountId === undefined) {
    return filters;
  }

  return {
    ...filters,
    businessAccountId,
  };
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

function readOptionalQueryParam(url: URL, name: string) {
  const value = url.searchParams.get(name)?.trim();

  return value === undefined || value.length === 0 ? undefined : value;
}

function isDateQueryValue(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
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
