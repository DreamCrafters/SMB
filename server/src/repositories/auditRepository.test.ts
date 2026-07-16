import assert from "node:assert/strict";
import test from "node:test";
import type { DatabasePool } from "../db/pool.js";
import { createAuditRepository } from "./auditRepository.js";

test("audit repository writes safe immutable event snapshots", async () => {
  const queries: Array<{ sql: string; values: unknown[] }> = [];
  const pool = {
    async query(sql: string, values: unknown[] = []) {
      queries.push({ sql: normalizeSql(sql), values });
      return [[], []];
    },
  } as unknown as DatabasePool;
  const repository = createAuditRepository(pool, {
    createId: () => "audit-event-id",
    now: () => new Date("2026-07-16T09:30:00.000Z"),
  });

  await repository.record({
    actor: {
      userId: "user-1",
      accountId: "access-1",
      login: "dispatcher",
      displayName: "Иванов Иван",
      positionDisplayName: "Диспетчер",
    },
    category: "form_submission",
    action: "form.submit",
    summary: "Отправлена форма «Вход посетителя»",
    details: [{ label: "ФИО посетителя", value: "Петров Пётр" }],
    businessAccountId: "business-1",
    targetType: "dispatcher_submission",
    targetId: "submission-1",
  });

  assert.match(queries[0]?.sql ?? "", /^insert into user_audit_events/u);
  assert.deepEqual(queries[0]?.values, [
    "audit-event-id",
    "user-1",
    "access-1",
    "dispatcher",
    "Иванов Иван",
    "Диспетчер",
    "form_submission",
    "form.submit",
    "success",
    "Отправлена форма «Вход посетителя»",
    JSON.stringify([{ label: "ФИО посетителя", value: "Петров Пётр" }]),
    "business-1",
    "dispatcher_submission",
    "submission-1",
    new Date("2026-07-16T09:30:00.000Z"),
  ]);
  assert.doesNotMatch(JSON.stringify(queries), /password|session/u);
});

test("audit repository lists one account only inside the server-owned three-month window", async () => {
  const queries: Array<{ sql: string; values: unknown[] }> = [];
  const pool = {
    async query(sql: string, values: unknown[] = []) {
      const normalized = normalizeSql(sql);
      queries.push({ sql: normalized, values });

      if (normalized.includes("group by category")) {
        return [[{ category: "navigation", count: 3 }], []];
      }

      if (normalized.includes("from account_accesses as accesses")) {
        return [[{
          actor_account_id: "access-1",
          actor_user_id: "user-1",
          actor_login: "ivanov",
          actor_display_name: "Иванов Иван",
          actor_position_display_name: "Диспетчер",
          actor_status: "active",
          last_event_at: new Date("2026-07-15T08:00:00.000Z"),
        }], []];
      }

      return [[{
        id: "event-1",
        actor_user_id: "user-1",
        actor_account_id: "access-1",
        actor_login: null,
        actor_display_name: "Иванов Иван",
        actor_position_display_name: "Диспетчер",
        category: "navigation",
        action: "view.screen",
        outcome: "success",
        summary: "Открыт экран «Форма»",
        details: JSON.stringify([]),
        business_account_id: "business-1",
        target_type: "screen",
        target_id: "business.dispatcher_form",
        occurred_at: new Date("2026-07-15T08:00:00.000Z"),
      }], []];
    },
  } as unknown as DatabasePool;
  const repository = createAuditRepository(pool, {
    now: () => new Date("2026-07-31T12:30:00.000Z"),
  });

  const report = await repository.listReport({
    actorAccountId: "access-1",
    category: "navigation",
    limit: 20,
    offset: 40,
  });

  assert.equal(report.window.from, "2026-04-30T12:30:00.000Z");
  assert.equal(report.window.to, "2026-07-31T12:30:00.000Z");
  assert.equal(report.summary.total, 3);
  assert.deepEqual(report.summary.byCategory, [
    { category: "authentication", count: 0 },
    { category: "navigation", count: 3 },
    { category: "form_submission", count: 0 },
    { category: "data_change", count: 0 },
    { category: "administration", count: 0 },
  ]);
  assert.equal(report.events[0]?.actor.displayName, "Иванов Иван");
  assert.equal(report.events[0]?.actor.login, "ivanov");
  assert.equal(report.actors[0]?.login, "ivanov");

  const eventQuery = queries.find((query) =>
    query.sql.includes("from user_audit_events") &&
    query.sql.includes("order by occurred_at desc"),
  );
  assert.match(eventQuery?.sql ?? "", /occurred_at >= \? and occurred_at < \?/u);
  assert.match(eventQuery?.sql ?? "", /actor_account_id = \?/u);
  assert.match(eventQuery?.sql ?? "", /category = \?/u);
  assert.deepEqual(eventQuery?.values, [
    new Date("2026-04-30T12:30:00.000Z"),
    new Date("2026-07-31T12:30:00.000Z"),
    "access-1",
    "navigation",
    20,
    40,
  ]);
  assert.doesNotMatch(queries.map((query) => query.sql).join(" "), /delete|truncate/u);
});

test("audit repository scopes both events and account filters to one business", async () => {
  const queries: Array<{ sql: string; values: unknown[] }> = [];
  const pool = {
    async query(sql: string, values: unknown[] = []) {
      const normalized = normalizeSql(sql);
      queries.push({ sql: normalized, values });
      return [[], []];
    },
  } as unknown as DatabasePool;
  const repository = createAuditRepository(pool, {
    now: () => new Date("2026-07-16T12:30:00.000Z"),
  });

  await repository.listReport({ businessAccountId: "business-1" });

  const eventQueries = queries.filter((query) =>
    query.sql.includes("from user_audit_events"),
  );
  const actorQuery = queries.find((query) =>
    query.sql.includes("from account_accesses as accesses"),
  );

  assert.equal(eventQueries.length, 2);
  for (const query of eventQueries) {
    assert.match(query.sql, /business_account_id = \?/u);
    assert.equal(query.values[2], "business-1");
  }
  assert.match(
    actorQuery?.sql ?? "",
    /where accesses\.business_account_id = \?/u,
  );
  assert.deepEqual(actorQuery?.values, [
    new Date("2026-04-16T12:30:00.000Z"),
    new Date("2026-07-16T12:30:00.000Z"),
    "business-1",
  ]);
});

function normalizeSql(sql: string) {
  return sql.replace(/\s+/g, " ").trim();
}
