import {
  auditEventActions,
  auditEventCategories,
  auditTargetTypes,
  type AuditEventAction,
  type AuditEventCategory,
  type AuditTargetType,
  type UserActivityActor,
  type UserActivityEvent,
  type UserActivityReportResponse,
} from "../contracts/audit.js";
import { buildDevAccessHeaders } from "./devAccessSessionStorage.js";
import {
  describeRemoteNetworkFailure,
  resolveApiEndpoint,
} from "./remoteServer.js";

const ADMIN_AUDIT_PATH = "/api/admin/audit-events";
const AUDIT_EVENTS_PATH = "/api/audit/events";

type RequestOptions = {
  baseUrl?: string;
  signal?: AbortSignal;
};

export type AdminAuditReportResult =
  | ({ status: "ready" } & UserActivityReportResponse)
  | { status: "error"; message: string };

export async function requestAdminAuditReport({
  baseUrl,
  signal,
  actorAccountId,
  category,
  limit = 50,
  offset = 0,
  showTechnicalDetails = true,
}: RequestOptions & {
  actorAccountId?: string;
  category?: AuditEventCategory;
  limit?: number;
  offset?: number;
  showTechnicalDetails?: boolean;
} = {}): Promise<AdminAuditReportResult> {
  const endpoint = new URL(
    resolveApiEndpoint(ADMIN_AUDIT_PATH, ADMIN_AUDIT_PATH, { baseUrl }),
    "http://local.test",
  );

  if (actorAccountId !== undefined && actorAccountId.length > 0) {
    endpoint.searchParams.set("actorAccountId", actorAccountId);
  }
  if (category !== undefined) {
    endpoint.searchParams.set("category", category);
  }
  endpoint.searchParams.set("limit", String(limit));
  endpoint.searchParams.set("offset", String(offset));

  try {
    const response = await fetch(toRequestUrl(endpoint), {
      method: "GET",
      headers: buildDevAccessHeaders({ Accept: "application/json" }),
      credentials: "include",
      signal,
    });
    const payload = await readJson(response);

    if (!response.ok) {
      return {
        status: "error",
        message: showTechnicalDetails
          ? readErrorMessage(payload) ?? "Не удалось загрузить действия пользователей."
          : "Не удалось загрузить действия пользователей.",
      };
    }

    const report = readUserActivityReport(payload);

    if (report === undefined) {
      return {
        status: "error",
        message: showTechnicalDetails
          ? "Сервер вернул журнал действий в неподдерживаемом формате."
          : "Не удалось загрузить действия пользователей.",
      };
    }

    const windowFrom = new Date(report.window.from).getTime();
    const windowTo = new Date(report.window.to).getTime();

    return {
      status: "ready",
      ...report,
      events: report.events.filter((event) => {
        const occurredAt = new Date(event.occurredAt).getTime();
        return occurredAt >= windowFrom && occurredAt < windowTo;
      }),
    };
  } catch (error) {
    return {
      status: "error",
      message: isAbortError(error)
        ? "Запрос действий пользователей отменён."
        : showTechnicalDetails
          ? describeRemoteNetworkFailure("Не удалось загрузить действия пользователей.", {
              baseUrl,
            })
          : "Не удалось загрузить действия пользователей.",
    };
  }
}

export async function recordAuditScreenView(
  screenId: string,
  { baseUrl, signal }: RequestOptions = {},
): Promise<{ status: "ready" } | { status: "error" }> {
  const endpoint = resolveApiEndpoint(AUDIT_EVENTS_PATH, AUDIT_EVENTS_PATH, {
    baseUrl,
  });

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: buildDevAccessHeaders({
        Accept: "application/json",
        "Content-Type": "application/json",
      }),
      credentials: "include",
      signal,
      body: JSON.stringify({ screenId }),
    });

    return response.ok ? { status: "ready" } : { status: "error" };
  } catch {
    return { status: "error" };
  }
}

function readUserActivityReport(value: unknown): UserActivityReportResponse | undefined {
  if (
    !isRecord(value) ||
    !Array.isArray(value.events) ||
    !Array.isArray(value.actors) ||
    !isRecord(value.summary) ||
    !Array.isArray(value.summary.byCategory) ||
    typeof value.summary.total !== "number" ||
    !isRecord(value.window) ||
    !isIsoDate(value.window.from) ||
    !isIsoDate(value.window.to) ||
    typeof value.limit !== "number" ||
    typeof value.offset !== "number"
  ) {
    return undefined;
  }

  const events = value.events.flatMap((event) => {
    const parsed = readUserActivityEvent(event);
    return parsed === undefined ? [] : [parsed];
  });
  const actors = value.actors.flatMap((actor) => {
    const parsed = readUserActivityActor(actor);
    return parsed === undefined ? [] : [parsed];
  });
  const byCategory = value.summary.byCategory.flatMap((item) =>
    isRecord(item) &&
    isAuditCategory(item.category) &&
    typeof item.count === "number"
      ? [{ category: item.category, count: item.count }]
      : [],
  );

  if (
    events.length !== value.events.length ||
    actors.length !== value.actors.length ||
    byCategory.length !== value.summary.byCategory.length
  ) {
    return undefined;
  }

  return {
    events,
    actors,
    summary: { total: value.summary.total, byCategory },
    window: { from: value.window.from, to: value.window.to },
    limit: value.limit,
    offset: value.offset,
  };
}

function readUserActivityEvent(value: unknown): UserActivityEvent | undefined {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    !isAuditActor(value.actor) ||
    !isAuditCategory(value.category) ||
    !auditEventActions.includes(value.action as AuditEventAction) ||
    (value.outcome !== "success" && value.outcome !== "failure") ||
    typeof value.summary !== "string" ||
    !Array.isArray(value.details) ||
    !isIsoDate(value.occurredAt)
  ) {
    return undefined;
  }

  const details = value.details.flatMap((detail) =>
    isRecord(detail) &&
    typeof detail.label === "string" &&
    typeof detail.value === "string"
      ? [{ label: detail.label, value: detail.value }]
      : [],
  );

  if (details.length !== value.details.length) {
    return undefined;
  }

  return {
    id: value.id,
    actor: value.actor,
    category: value.category,
    action: value.action as AuditEventAction,
    outcome: value.outcome,
    summary: value.summary,
    details,
    ...(isAuditTargetType(value.targetType) ? { targetType: value.targetType } : {}),
    ...(typeof value.targetId === "string" ? { targetId: value.targetId } : {}),
    occurredAt: value.occurredAt,
  };
}

function readUserActivityActor(value: unknown): UserActivityActor | undefined {
  const record = isRecord(value) ? value : undefined;

  if (
    record === undefined ||
    !isAuditActor(value) ||
    typeof record.login !== "string" ||
    (record.status !== "active" &&
      record.status !== "suspended" &&
      record.status !== "archived") ||
    (record.lastEventAt !== undefined && !isIsoDate(record.lastEventAt))
  ) {
    return undefined;
  }

  return {
    ...value,
    login: record.login,
    status: record.status,
    ...(typeof record.lastEventAt === "string"
      ? { lastEventAt: record.lastEventAt }
      : {}),
  } as UserActivityActor;
}

function isAuditActor(value: unknown): value is UserActivityEvent["actor"] {
  return (
    isRecord(value) &&
    typeof value.userId === "string" &&
    typeof value.accountId === "string" &&
    typeof value.displayName === "string" &&
    typeof value.positionDisplayName === "string" &&
    (value.login === undefined || typeof value.login === "string")
  );
}

function isAuditCategory(value: unknown): value is AuditEventCategory {
  return auditEventCategories.includes(value as AuditEventCategory);
}

function isAuditTargetType(value: unknown): value is AuditTargetType {
  return auditTargetTypes.includes(value as AuditTargetType);
}

function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(new Date(value).getTime());
}

function toRequestUrl(url: URL) {
  return url.origin === "http://local.test" ? `${url.pathname}${url.search}` : url.toString();
}

async function readJson(response: Response) {
  try {
    return await response.json() as unknown;
  } catch {
    return undefined;
  }
}

function readErrorMessage(value: unknown) {
  return isRecord(value) && isRecord(value.error) && typeof value.error.message === "string"
    ? value.error.message
    : undefined;
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
