import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { ServerConfig } from "../config/env.js";
import {
  defaultCapabilitiesByAccountType,
  hasProfileCapability,
  readScopedBusinessAccountId,
  type AccountCapability,
  type AccountType,
  type AuthSessionService,
  type AuthenticatedSession,
  type ServerUserProfile,
} from "../domain/auth.js";
import {
  buildDevProfile,
  createDevSessionId,
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

type AppDependencies = {
  config: ServerConfig;
  dispatcherSubmissions: DispatcherSubmissionsRepository;
  adminDatabase?: AdminDatabaseRepository;
  accounts?: AccountsRepository;
  authService?: AuthSessionService;
  referenceDataSource?: DispatcherReferenceDataSource;
  emailNotificationService?: EmailNotificationService;
  maxNotificationService?: MaxNotificationService;
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
        await handleAuthLogin(req, res, config, authService);
        return;
      }

      if (url.pathname === "/api/auth/logout") {
        await handleAuthLogout(req, res, config, authService);
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

        await handleDevAccessSession(req, res, devSessions);
        return;
      }

      if (
        url.pathname === "/api/admin/database" ||
        url.pathname.startsWith("/api/admin/database/tables/")
      ) {
        await handleAdminDatabaseRequest({
          req,
          res,
          url,
          config,
          devSessions,
          authService,
          adminDatabase,
        });
        return;
      }

      if (
        url.pathname === "/api/admin/accounts" ||
        url.pathname === "/api/admin/accounts/reset-password"
      ) {
        await handleAdminAccountsRequest({
          req,
          res,
          url,
          config,
          devSessions,
          authService,
          accounts,
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
          limit: 500,
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
        const submissions: DispatcherSubmission[] = [];

        for (const item of validation.value.items) {
          submissions.push(
            await dispatcherSubmissions.create(
              item,
              submittedByAccountId,
            ),
          );
        }

        if (reportStatus === "updated") {
          await dispatcherSubmissions.recordEquipmentReportRevision({
            businessAccountId: validation.value.businessAccountId,
            reportDate: readEquipmentReportDate(submissions),
            status: reportStatus,
            submissions,
            submittedByAccountId,
          });
        }

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

          const history = await dispatcherSubmissions.listLatest({ limit: 500 });
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

          const submission = await dispatcherSubmissions.create(
            visitorStateValidation.value,
            readSubmittedByAccountId(req, access.profile, config),
          );

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

async function handleAdminDatabaseRequest({
  req,
  res,
  url,
  config,
  devSessions,
  authService,
  adminDatabase,
}: {
  req: IncomingMessage;
  res: ServerResponse;
  url: URL;
  config: ServerConfig;
  devSessions: Map<string, DevAccessSession>;
  authService: AuthSessionService | undefined;
  adminDatabase: AdminDatabaseRepository | undefined;
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

      await adminDatabase.updateRow({
        tableName: route.tableName,
        primaryKey: validation.value.primaryKey,
        values: validation.value.values,
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

      await adminDatabase.deleteRow({
        tableName: route.tableName,
        primaryKey: validation.value.primaryKey,
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

async function handleAdminAccountsRequest({
  req,
  res,
  url,
  config,
  devSessions,
  authService,
  accounts,
}: {
  req: IncomingMessage;
  res: ServerResponse;
  url: URL;
  config: ServerConfig;
  devSessions: Map<string, DevAccessSession>;
  authService: AuthSessionService | undefined;
  accounts: AccountsRepository | undefined;
}) {
  const isLoginStatusUpdate =
    url.pathname === "/api/admin/accounts" && req.method === "PATCH";
  const access = await requireCapability(req, res, {
    config,
    devSessions,
    authService,
    capability: isLoginStatusUpdate
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

  if (url.pathname === "/api/admin/accounts") {
    if (req.method === "GET") {
      sendJson(res, 200, {
        accounts: await accounts.listAccounts(),
      });
      return;
    }

    if (req.method === "POST") {
      const payload = await readJsonBody(req);
      const validation = validateCreateAccountRequest(payload);

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
        const account = await accounts.createAccount(validation.value);

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
        const loginStatus = await accounts.setAccountLoginEnabled(
          validation.value,
        );

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
    const wasReset = await accounts.resetPassword(validation.value);

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

function validateCreateAccountRequest(input: unknown):
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
  const accountType = input.accountType;

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
  ]) {
    if (Object.prototype.hasOwnProperty.call(input, field)) {
      errors.push(`${field} is managed by the server.`);
    }
  }

  if (!isAccountType(accountType)) {
    errors.push(
      "accountType must be admin, business_owner, worker or dispatcher.",
    );
    return { ok: false, errors };
  }

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
      capabilities: defaultCapabilitiesByAccountType[accountType],
      businessDisplayName: readOptionalTrimmedString(input.businessDisplayName),
      departmentDisplayName: readOptionalTrimmedString(
        input.departmentDisplayName,
      ),
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

function readOptionalTrimmedString(value: unknown) {
  const trimmed = typeof value === "string" ? value.trim() : "";

  return trimmed.length === 0 ? undefined : trimmed;
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
  const match = /^\/api\/admin\/database\/tables\/([^/]+)\/rows$/.exec(
    url.pathname,
  );

  if (match === null) {
    return undefined;
  }

  return {
    tableName: decodeURIComponent(match[1]),
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

  const login = await authService.login(credentials);

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

  if (sessionId !== undefined) {
    await authService?.deleteSession(sessionId);
  }

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
) {
  if (req.method === "DELETE") {
    const sessionId = readDevSessionId(req);

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
        message: "Only POST and DELETE are supported for dev access session.",
      },
    });
    return;
  }

  const payload = await readJsonBody(req);

  if (!isRecord(payload) || !isAccountType(payload.accountType)) {
    sendJson(res, 400, {
      error: {
        code: "access_denied",
        message: "Unsupported dev account type.",
      },
    });
    return;
  }

  const sessionId = createDevSessionId(payload.accountType);

  devSessions.set(sessionId, {
    accountType: payload.accountType,
    createdAt: new Date().toISOString(),
  });

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

  return {
    profile: buildDevProfile(
      devSession.accountType,
      devSession.createdAt,
    ) as ServerUserProfile,
    source: "dev",
  };
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
