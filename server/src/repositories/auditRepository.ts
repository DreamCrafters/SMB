import { randomUUID } from "node:crypto";
import type { RowDataPacket } from "mysql2/promise";
import type { DatabasePool } from "../db/pool.js";
import {
  auditEventCategories,
  resolveAuditWindowStart,
  type AuditActorSnapshot,
  type AuditEventAction,
  type AuditEventCategory,
  type AuditEventDetail,
  type AuditEventDraft,
  type AuditEventOutcome,
  type AuditTargetType,
} from "../domain/audit.js";

export type AuditEvent = {
  id: string;
  actor: AuditActorSnapshot;
  category: AuditEventCategory;
  action: AuditEventAction;
  outcome: AuditEventOutcome;
  summary: string;
  details: AuditEventDetail[];
  businessAccountId?: string;
  targetType?: AuditTargetType;
  targetId?: string;
  occurredAt: string;
};

export type AuditActorOption = AuditActorSnapshot & {
  login: string;
  status: "active" | "suspended" | "archived";
  lastEventAt?: string;
};

export type AuditReportFilters = {
  actorAccountId?: string;
  businessAccountId?: string;
  category?: AuditEventCategory;
  limit?: number;
  offset?: number;
};

export type AuditReport = {
  events: AuditEvent[];
  actors: AuditActorOption[];
  summary: {
    total: number;
    byCategory: Array<{ category: AuditEventCategory; count: number }>;
  };
  window: {
    from: string;
    to: string;
  };
  limit: number;
  offset: number;
};

export type AuditRepository = {
  record: (event: AuditEventDraft) => Promise<void>;
  listReport: (filters?: AuditReportFilters) => Promise<AuditReport>;
};

type AuditEventRow = RowDataPacket & {
  id: string;
  actor_user_id: string;
  actor_account_id: string;
  actor_login: string | null;
  actor_display_name: string;
  actor_position_display_name: string;
  category: AuditEventCategory;
  action: AuditEventAction;
  outcome: AuditEventOutcome;
  summary: string;
  details: unknown;
  business_account_id: string | null;
  target_type: AuditTargetType | null;
  target_id: string | null;
  occurred_at: Date | string;
};

type AuditCategoryCountRow = RowDataPacket & {
  category: string;
  count: number | string;
};

type AuditActorRow = RowDataPacket & {
  actor_user_id: string;
  actor_account_id: string;
  actor_login: string;
  actor_display_name: string;
  actor_position_display_name: string;
  actor_status: string;
  last_event_at: Date | string | null;
};

type AuditRepositoryOptions = {
  createId?: () => string;
  now?: () => Date;
};

const defaultPageLimit = 50;
const maxPageLimit = 100;
const maxAuditDetails = 200;

export function createAuditRepository(
  pool: DatabasePool,
  {
    createId = randomUUID,
    now = () => new Date(),
  }: AuditRepositoryOptions = {},
): AuditRepository {
  return {
    async record(event) {
      const occurredAt = event.occurredAt ?? now();
      const details = sanitizeDetails(event.details ?? []);

      await pool.query(
        `
          insert into user_audit_events (
            id,
            actor_user_id,
            actor_account_id,
            actor_login,
            actor_display_name,
            actor_position_display_name,
            category,
            action,
            outcome,
            summary,
            details,
            business_account_id,
            target_type,
            target_id,
            occurred_at
          )
          values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          createId(),
          event.actor.userId,
          event.actor.accountId,
          event.actor.login ?? null,
          event.actor.displayName,
          event.actor.positionDisplayName,
          event.category,
          event.action,
          event.outcome ?? "success",
          event.summary.trim().slice(0, 500),
          JSON.stringify(details),
          event.businessAccountId ?? null,
          event.targetType ?? null,
          event.targetId ?? null,
          occurredAt,
        ],
      );
    },

    async listReport(filters = {}) {
      const windowEnd = now();
      const windowStart = resolveAuditWindowStart(windowEnd);
      const limit = Math.min(
        Math.max(Math.trunc(filters.limit ?? defaultPageLimit), 1),
        maxPageLimit,
      );
      const offset = Math.max(Math.trunc(filters.offset ?? 0), 0);
      const where = buildReportWhereClause(windowStart, windowEnd, filters);
      const actorScope = filters.businessAccountId === undefined
        ? { sql: "", values: [] }
        : {
            sql: "where accesses.business_account_id = ?",
            values: [filters.businessAccountId],
          };

      const [eventResult, countResult, actorResult] = await Promise.all([
        pool.query<AuditEventRow[]>(
          `
            select
              id,
              actor_user_id,
              actor_account_id,
              actor_login,
              actor_display_name,
              actor_position_display_name,
              category,
              action,
              outcome,
              summary,
              details,
              business_account_id,
              target_type,
              target_id,
              occurred_at
            from user_audit_events
            ${where.sql}
            order by occurred_at desc, id desc
            limit ? offset ?
          `,
          [...where.values, limit, offset],
        ),
        pool.query<AuditCategoryCountRow[]>(
          `
            select category, count(*) as count
            from user_audit_events
            ${where.sql}
            group by category
          `,
          where.values,
        ),
        pool.query<AuditActorRow[]>(
          `
            select
              users.id as actor_user_id,
              accesses.id as actor_account_id,
              users.login as actor_login,
              users.display_name as actor_display_name,
              positions.display_name as actor_position_display_name,
              users.status as actor_status,
              max(events.occurred_at) as last_event_at
            from account_accesses as accesses
            join app_users as users on users.id = accesses.user_id
            join account_positions as positions on positions.id = accesses.position_code
            left join user_audit_events as events
              on events.actor_account_id = accesses.id
              and events.occurred_at >= ?
              and events.occurred_at < ?
            ${actorScope.sql}
            group by
              users.id,
              accesses.id,
              users.login,
              users.display_name,
              positions.display_name,
              users.status
            order by users.display_name asc, positions.display_name asc
          `,
          [windowStart, windowEnd, ...actorScope.values],
        ),
      ]);

      const eventRows = eventResult[0];
      const events = eventRows.map(mapAuditEventRow);
      const countByCategory = new Map<AuditEventCategory, number>();

      for (const row of countResult[0]) {
        if (auditEventCategories.includes(row.category as AuditEventCategory)) {
          countByCategory.set(
            row.category as AuditEventCategory,
            Number(row.count),
          );
        }
      }

      const actors = mergeEventActors(
        actorResult[0].map(mapAuditActorRow),
        events,
      );
      const actorByAccountId = new Map(
        actors.map((actor) => [actor.accountId, actor]),
      );
      const eventsWithCurrentLogin = events.map((event) => {
        const actor = actorByAccountId.get(event.actor.accountId);

        return event.actor.login !== undefined || actor === undefined
          ? event
          : {
              ...event,
              actor: {
                ...event.actor,
                login: actor.login,
              },
            };
      });
      const byCategory = auditEventCategories.map((category) => ({
        category,
        count: countByCategory.get(category) ?? 0,
      }));

      return {
        events: eventsWithCurrentLogin,
        actors,
        summary: {
          total: byCategory.reduce((total, item) => total + item.count, 0),
          byCategory,
        },
        window: {
          from: windowStart.toISOString(),
          to: windowEnd.toISOString(),
        },
        limit,
        offset,
      };
    },
  };
}

function buildReportWhereClause(
  windowStart: Date,
  windowEnd: Date,
  filters: AuditReportFilters,
) {
  const conditions = ["occurred_at >= ?", "occurred_at < ?"];
  const values: unknown[] = [windowStart, windowEnd];

  if (filters.actorAccountId !== undefined) {
    conditions.push("actor_account_id = ?");
    values.push(filters.actorAccountId);
  }

  if (filters.businessAccountId !== undefined) {
    conditions.push("business_account_id = ?");
    values.push(filters.businessAccountId);
  }

  if (filters.category !== undefined) {
    conditions.push("category = ?");
    values.push(filters.category);
  }

  return {
    sql: `where ${conditions.join(" and ")}`,
    values,
  };
}

function mapAuditEventRow(row: AuditEventRow): AuditEvent {
  return {
    id: row.id,
    actor: {
      userId: row.actor_user_id,
      accountId: row.actor_account_id,
      displayName: row.actor_display_name,
      positionDisplayName: row.actor_position_display_name,
      ...(row.actor_login === null ? {} : { login: row.actor_login }),
    },
    category: row.category,
    action: row.action,
    outcome: row.outcome,
    summary: row.summary,
    details: readDetails(row.details),
    ...(row.business_account_id === null
      ? {}
      : { businessAccountId: row.business_account_id }),
    ...(row.target_type === null ? {} : { targetType: row.target_type }),
    ...(row.target_id === null ? {} : { targetId: row.target_id }),
    occurredAt: toIsoString(row.occurred_at),
  };
}

function mapAuditActorRow(row: AuditActorRow): AuditActorOption {
  const status =
    row.actor_status === "suspended" || row.actor_status === "archived"
      ? row.actor_status
      : "active";

  return {
    userId: row.actor_user_id,
    accountId: row.actor_account_id,
    login: row.actor_login,
    displayName: row.actor_display_name,
    positionDisplayName: row.actor_position_display_name,
    status,
    ...(row.last_event_at === null
      ? {}
      : { lastEventAt: toIsoString(row.last_event_at) }),
  };
}

function mergeEventActors(
  actors: AuditActorOption[],
  events: AuditEvent[],
): AuditActorOption[] {
  const result = [...actors];
  const knownAccountIds = new Set(actors.map((actor) => actor.accountId));

  for (const event of events) {
    if (knownAccountIds.has(event.actor.accountId)) {
      continue;
    }

    knownAccountIds.add(event.actor.accountId);
    result.push({
      ...event.actor,
      login: event.actor.login ?? "",
      status: "active",
      lastEventAt: event.occurredAt,
    });
  }

  return result.sort((left, right) =>
    left.displayName.localeCompare(right.displayName, "ru"),
  );
}

function sanitizeDetails(details: AuditEventDetail[]) {
  return details.slice(0, maxAuditDetails).flatMap((detail) => {
    const label = detail.label.trim().slice(0, 160);
    const value = detail.value.trim().slice(0, 2_000);

    return label.length > 0 && value.length > 0 ? [{ label, value }] : [];
  });
}

function readDetails(value: unknown): AuditEventDetail[] {
  let parsed = value;

  if (typeof parsed === "string") {
    try {
      parsed = JSON.parse(parsed) as unknown;
    } catch {
      return [];
    }
  }

  if (!Array.isArray(parsed)) {
    return [];
  }

  return sanitizeDetails(
    parsed.flatMap((item) =>
      isRecord(item) &&
      typeof item.label === "string" &&
      typeof item.value === "string"
        ? [{ label: item.label, value: item.value }]
        : [],
    ),
  );
}

function toIsoString(value: Date | string) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
