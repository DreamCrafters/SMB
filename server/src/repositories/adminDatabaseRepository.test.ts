import assert from "node:assert/strict";
import test from "node:test";
import type { DatabasePool } from "../db/pool.js";
import { ProtectedAccountMutationError } from "../domain/adminAccountProtection.js";
import {
  AdminDatabaseRowMutationError,
  createAdminDatabaseRepository,
} from "./adminDatabaseRepository.js";

test("admin database catalog contains only safe editable user-facing sections", async () => {
  const queries: string[] = [];
  const pool = {
    async query(sql: string) {
      queries.push(sql.replace(/\s+/g, " ").trim());
      return [[{ row_count: 1 }], []];
    },
  } as unknown as DatabasePool;

  const tables = await createAdminDatabaseRepository(pool).listTables();

  assert.deepEqual(tables.map((table) => table.name), [
    "app_users",
    "dispatcher_submissions",
  ]);
  assert.ok(tables.every((table) => table.primaryKey.length > 0));
  assert.equal(queries.length, 2);
  assert.doesNotMatch(
    JSON.stringify(tables),
    /departments|account_accesses|account_positions|auth_sessions|auth_password_credentials|schema_migrations/u,
  );
  assert.ok(tables.every((table) => !table.canDelete && !table.canClear));
  assert.ok(tables.every((table) => !table.canMerge));
});

test("dispatcher row editor exposes real form fields without raw payload or ids", async () => {
  const queries: string[] = [];
  const pool = {
    async query(sql: string) {
      const normalized = sql.replace(/\s+/g, " ").trim();
      queries.push(normalized);

      if (normalized.startsWith("select count(*)")) {
        return [[{ row_count: 1 }], []];
      }

      return [[{
        __admin_primary_key_id: "submission-secret-id",
        form: "Вход посетителя",
        event_date: "16.07.2026",
        summary: "Иванов Иван · Завод",
        status: "received",
        source: "Форма",
        submitted_by: "Диспетчер",
        position: "Диспетчер",
        submitted_at: "2026-07-16T08:00:00.000Z",
        received_at: "2026-07-16T08:00:00.000Z",
        __admin_context_form_id: "visitor",
        __admin_context_payload: JSON.stringify({
          fio: "Иванов Иван",
          position: "Инженер",
          organization: "Завод",
          purpose: "Переговоры",
          whom: "Директор",
          note: "Пропуск",
          entryAt: "16.07.2026 11:00",
          visitorEntryId: "must-not-leak",
        }),
        __admin_context_status: "received",
        password_hash: "must-not-leak-either",
      }], []];
    },
  } as unknown as DatabasePool;

  const result = await createAdminDatabaseRepository(pool).listRows("dispatcher_submissions");
  const row = result.rows[0];

  assert.deepEqual(row?.editorFields.map((field) => field.label), [
    "ФИО посетителя",
    "Должность",
    "Организация",
    "Цель визита",
    "Кого посещает",
    "Примечание",
    "Статус записи",
  ]);
  assert.deepEqual(row?.editorFields.at(-1)?.options, [
    { value: "received", label: "Получено" },
    { value: "queued", label: "В очереди" },
    { value: "accepted", label: "Принято" },
    { value: "rejected", label: "Отклонено" },
  ]);
  assert.doesNotMatch(JSON.stringify(row), /must-not-leak|password_hash|entryAt/u);
  assert.doesNotMatch(queries.at(-1) ?? "", /select \*/u);
});

test("dispatcher row update validates form values and preserves server fields", async () => {
  const queries: Array<{ sql: string; values?: unknown[] }> = [];
  const pool = {
    async query(sql: string, values?: unknown[]) {
      const normalized = sql.replace(/\s+/g, " ").trim();
      queries.push({ sql: normalized, values });

      if (normalized.startsWith("select form_id")) {
        return [[{
          form_id: "visitor",
          payload: JSON.stringify({
            fio: "Старое имя",
            organization: "Завод",
            entryAt: "01.07.2026 08:30",
            serverOwnedMarker: "preserve-me",
          }),
          summary: "Старое имя · Завод",
          status: "received",
          period: "2026-07",
        }], []];
      }

      return [{ affectedRows: 1 }, []];
    },
  } as unknown as DatabasePool;
  const repository = createAdminDatabaseRepository(pool);

  await repository.updateRow({
    tableName: "dispatcher_submissions",
    primaryKey: { id: "submission-id" },
    values: {
      "payload.fio": "Новое имя",
      "payload.organization": "Новый завод",
      status: "accepted",
    },
  });

  const update = queries.find((query) => query.sql.startsWith("update dispatcher_submissions"));
  const payload = JSON.parse(String(update?.values?.[4])) as Record<string, string>;

  assert.equal(payload.fio, "Новое имя");
  assert.equal(payload.organization, "Новый завод");
  assert.equal(payload.entryAt, "01.07.2026 08:30");
  assert.equal(payload.serverOwnedMarker, "preserve-me");
  assert.equal(update?.values?.[7], "accepted");
  await assert.rejects(
    repository.updateRow({
      tableName: "dispatcher_submissions",
      primaryKey: { id: "submission-id" },
      values: { dedupe_key: "system-value" },
    }),
    /not editable/u,
  );
});

test("dispatcher rows can be searched across every displayed column", async () => {
  const queries: Array<{ sql: string; values?: unknown[] }> = [];
  const pool = {
    async query(sql: string, values?: unknown[]) {
      const normalized = sql.replace(/\s+/g, " ").trim();
      queries.push({ sql: normalized, values });

      if (normalized.startsWith("select count(*)")) {
        return [[{ row_count: 1 }], []];
      }

      return [[], []];
    },
  } as unknown as DatabasePool;

  const result = await createAdminDatabaseRepository(pool).listRows(
    "dispatcher_submissions",
    { limit: 100, offset: 0, search: "INC-2026-51" },
  );

  const [count, page] = queries;
  const patternCount = count?.values?.length ?? 0;

  assert.equal(result.table.rowCount, 1);
  assert.deepEqual(count?.values, page?.values?.slice(0, patternCount));
  assert.deepEqual(page?.values?.slice(-2), [100, 0]);
  assert.ok(
    (count?.values ?? []).every((value) => value === "%INC-2026-51%"),
    "every column is compared with the same pattern",
  );
  // Every displayed column takes part, and dates are matched by printed day too.
  assert.ok(patternCount > result.table.columns.length);
  assert.ok(count?.sql.includes("'$.incidentNumber')) like ?"));
  assert.ok(count?.sql.includes("when 'accepted' then 'Принято'"));
  assert.ok(count?.sql.includes("date_format(submissions.received_at, '%d.%m.%Y') like ?"));
});

test("dispatcher rows filter by section and event date period", async () => {
  const queries: Array<{ sql: string; values?: unknown[] }> = [];
  const pool = {
    async query(sql: string, values?: unknown[]) {
      const normalized = sql.replace(/\s+/g, " ").trim();
      queries.push({ sql: normalized, values });

      if (normalized.startsWith("select count(*)")) {
        return [[{ row_count: 3 }], []];
      }

      return [[], []];
    },
  } as unknown as DatabasePool;

  const result = await createAdminDatabaseRepository(pool).listRows(
    "dispatcher_submissions",
    {
      limit: 50,
      offset: 0,
      section: "equipment",
      dateFrom: "2026-07-01",
      dateTo: "2026-07-31",
      sort: "event_date_asc",
    },
  );

  const [count, page] = queries;

  assert.equal(result.table.rowCount, 3);
  assert.ok(count?.sql.includes("submissions.form_id = ?"));
  assert.ok(count?.sql.includes(">= cast(? as date)"));
  assert.ok(count?.sql.includes("< date_add(cast(? as date), interval 1 day)"));
  assert.deepEqual(count?.values, ["equipment", "2026-07-01", "2026-07-31"]);
  assert.deepEqual(page?.values, ["equipment", "2026-07-01", "2026-07-31", 50, 0]);
  // Сортировка выбирается из объявленных вариантов, а не из строки запроса.
  assert.ok(page?.sql.includes("order by case when"));
  assert.ok(page?.sql.includes("asc, submissions.received_at asc"));
});

test("dispatcher section declares filters and sorts by event date", async () => {
  const pool = {
    async query(sql: string) {
      return sql.replace(/\s+/g, " ").trim().startsWith("select count(*)")
        ? [[{ row_count: 0 }], []]
        : [[], []];
    },
  } as unknown as DatabasePool;

  const tables = await createAdminDatabaseRepository(pool).listTables();
  const dispatcher = tables.find(
    (table) => table.name === "dispatcher_submissions",
  );
  const users = tables.find((table) => table.name === "app_users");

  assert.deepEqual(
    dispatcher?.controls.section?.options.map((option) => option.value),
    [
      "equipment",
      "production",
      "incident",
      "incident_close",
      "visitor",
      "visitor_exit",
    ],
  );
  assert.equal(dispatcher?.controls.eventDate?.label, "Дата события");
  assert.deepEqual(
    dispatcher?.controls.sort?.options.map((option) => option.value),
    ["event_date_desc", "event_date_asc"],
  );
  // Разделы без объявленных фильтров остаются с одним общим поиском.
  assert.deepEqual(users?.controls, {});
});

test("equipment rows of one report are returned as a single group", async () => {
  const pool = {
    async query(sql: string) {
      const normalized = sql.replace(/\s+/g, " ").trim();

      if (normalized.startsWith("select count(*)")) {
        return [[{ row_count: 2 }], []];
      }

      return [[
        {
          __admin_primary_key_id: "equipment-1",
          form: "Оборудование",
          event_date: "22.07.2026",
          __admin_group_key: "equipment:22.07.2026",
          __admin_group_label: "Оборудование · отправка за 22.07.2026",
          __admin_context_form_id: "equipment",
          __admin_context_payload: JSON.stringify({
            reportDate: "22.07.2026",
            equipment: "Пресс №1",
          }),
          __admin_context_status: "received",
        },
        {
          __admin_primary_key_id: "production-1",
          form: "Выработка",
          event_date: "22.07.2026",
          __admin_group_key: null,
          __admin_group_label: null,
          __admin_context_form_id: "production",
          __admin_context_payload: JSON.stringify({ reportDate: "22.07.2026" }),
          __admin_context_status: "received",
        },
      ], []];
    },
  } as unknown as DatabasePool;

  const result = await createAdminDatabaseRepository(pool).listRows(
    "dispatcher_submissions",
  );

  assert.deepEqual(result.rows[0]?.group, {
    key: "equipment:22.07.2026",
    label: "Оборудование · отправка за 22.07.2026",
  });
  // Формы, которые отправляются по одной, группы не получают.
  assert.equal(result.rows[1]?.group, undefined);
});

test("database search escapes like wildcards and keeps view filters", async () => {
  const queries: Array<{ sql: string; values?: unknown[] }> = [];
  const pool = {
    async query(sql: string, values?: unknown[]) {
      const normalized = sql.replace(/\s+/g, " ").trim();
      queries.push({ sql: normalized, values });

      if (normalized.startsWith("select count(*)")) {
        return [[{ row_count: 0 }], []];
      }

      return [[], []];
    },
  } as unknown as DatabasePool;

  await createAdminDatabaseRepository(pool).listRows("app_users", {
    search: "100%_наладка",
  });

  assert.ok(
    queries.every((query) => query.sql.includes("status <> 'archived' and (")),
    "the archived filter stays combined with the search",
  );
  assert.ok(
    (queries[0]?.values ?? []).every((value) => value === "%100\\%\\_наладка%"),
  );
  assert.ok(queries[0]?.sql.includes("when 'active' then 'Активен'"));
});

test("incident text corrections reach the stored closure of the same incident", async () => {
  const queries: Array<{ sql: string; values?: unknown[] }> = [];
  const pool = {
    async query(sql: string, values?: unknown[]) {
      const normalized = sql.replace(/\s+/g, " ").trim();
      queries.push({ sql: normalized, values });

      if (normalized.startsWith("select form_id")) {
        return [[{
          form_id: "incident",
          payload: JSON.stringify({
            incidentNumber: "INC-2026-51",
            datetime: "28.07.2026 09:33",
            location: "ОЦ (Огнеупорный цех)",
            incidentType: "Травма",
            description: "тихонова г а получила травму руки",
            criticality: "Средний",
            responsible: "Шубник В.С.",
            immediateActions: "Вызван мастер смены",
            incidentStatus: "Новый",
          }),
          summary: "INC-2026-51 · ОЦ (Огнеупорный цех) · Травма · Средний",
          status: "received",
          period: "2026-07",
        }], []];
      }

      if (normalized.startsWith("select id, payload, summary, period")) {
        return [[{
          id: "closure-id",
          payload: JSON.stringify({
            incidentNumber: "INC-2026-51",
            rootCauses: "Не соблюдён регламент уборки",
            preventiveMeasures: "Проверка графика уборки",
            closureDateTime: "28.07.2026 10:36",
            approvedBy: "Фридман",
            datetime: "28.07.2026 09:33",
            location: "ОЦ (Огнеупорный цех)",
            incidentType: "Травма",
            criticality: "Средний",
            description: "тихонова г а получила травму руки",
          }),
          summary: "INC-2026-51 · 28.07.2026 10:36 · Фридман",
          period: "2026-07",
        }], []];
      }

      return [{ affectedRows: 1 }, []];
    },
  } as unknown as DatabasePool;

  await createAdminDatabaseRepository(pool).updateRow({
    tableName: "dispatcher_submissions",
    primaryKey: { id: "opening-id" },
    values: {
      "payload.incidentType": "Нарушение регламента",
      "payload.description": "Отсутствие уборки в цехе",
    },
  });

  const closureLookup = queries.find((query) =>
    query.sql.startsWith("select id, payload, summary, period"),
  );
  const closureUpdate = queries.find((query) =>
    query.sql.startsWith("update dispatcher_submissions set period = ?, raw_value"),
  );
  const closurePayload = JSON.parse(String(closureUpdate?.values?.[3])) as Record<string, string>;

  assert.deepEqual(closureLookup?.values, ["INC-2026-51"]);
  assert.equal(closureUpdate?.values?.at(-1), "closure-id");
  assert.equal(closurePayload.incidentType, "Нарушение регламента");
  assert.equal(closurePayload.description, "Отсутствие уборки в цехе");
  assert.equal(closurePayload.datetime, "28.07.2026 09:33");
  assert.equal(closurePayload.rootCauses, "Не соблюдён регламент уборки");
  assert.equal(closurePayload.approvedBy, "Фридман");
});

test("equipment edits keep report identity and append a full report revision", async () => {
  const queries: Array<{ sql: string; values?: unknown[] }> = [];
  const pool = {
    async query(sql: string, values?: unknown[]) {
      const normalized = sql.replace(/\s+/g, " ").trim();
      queries.push({ sql: normalized, values });

      if (normalized.startsWith("select form_id")) {
        return [[{
          form_id: "equipment",
          payload: JSON.stringify({
            reportDate: "16.07.2026",
            reportMonth: "2026-07",
            equipment: "Пресс №1",
            productionTons: "10",
          }),
          summary: "Пресс №1 · 10 т",
          status: "received",
          period: "2026-07",
        }], []];
      }

      if (normalized.startsWith("select id, form_id")) {
        return [[{
          id: "submission-id",
          form_id: "equipment",
          payload: JSON.stringify({
            reportDate: "16.07.2026",
            equipment: "Пресс №1",
            productionTons: "20",
          }),
          summary: "Пресс №1 · 20 т",
          status: "received",
          submitted_by_account_id: "dispatcher-access",
          submitted_at: "2026-07-16T08:00:00.000Z",
          received_at: "2026-07-16T08:00:00.000Z",
        }], []];
      }

      return [{ affectedRows: 1 }, []];
    },
  } as unknown as DatabasePool;
  const repository = createAdminDatabaseRepository(pool);

  await repository.updateRow({
    tableName: "dispatcher_submissions",
    primaryKey: { id: "submission-id" },
    values: { "payload.productionTons": "20" },
    changedByAccountId: "admin-access",
  });

  const revision = queries.find((query) =>
    query.sql.startsWith("insert into dispatcher_equipment_report_revisions"),
  );
  assert.equal(revision?.values?.[1], "16.07.2026");
  assert.equal(revision?.values?.[2], "updated");
  assert.equal(revision?.values?.[4], "admin-access");
  assert.match(String(revision?.values?.[3]), /Пресс №1/u);

  await assert.rejects(
    repository.updateRow({
      tableName: "dispatcher_submissions",
      primaryKey: { id: "submission-id" },
      values: { "payload.reportDate": "2026-07-17" },
      changedByAccountId: "admin-access",
    }),
    /not editable/u,
  );
});

test("database edits drop the required fields and form obligations", async () => {
  const queries: Array<{ sql: string; values?: unknown[] }> = [];
  const buildPool = () => ({
    async query(sql: string, values?: unknown[]) {
      const normalized = sql.replace(/\s+/g, " ").trim();
      queries.push({ sql: normalized, values });

      if (normalized.startsWith("select form_id")) {
        return [[{
          form_id: "equipment",
          payload: JSON.stringify({
            reportDate: "16.07.2026",
            reportMonth: "2026-07",
            equipment: "Пресс №1",
            productionTons: "10",
          }),
          summary: "Пресс №1 · 10 т",
          status: "received",
          period: "2026-07",
        }], []];
      }

      if (normalized.startsWith("select id, form_id")) {
        return [[{
          id: "submission-id",
          form_id: "equipment",
          payload: JSON.stringify({
            reportDate: "16.07.2026",
            equipment: "Пресс №1",
          }),
          summary: "Пресс №1",
          status: "received",
          submitted_by_account_id: "dispatcher-access",
          submitted_at: "2026-07-16T08:00:00.000Z",
          received_at: "2026-07-16T08:00:00.000Z",
        }], []];
      }

      return [{ affectedRows: 1 }, []];
    },
  } as unknown as DatabasePool);

  // Комбинация, которую форма отклоняет при обычной отправке, через БД
  // сохраняется: это ремонт записи, а не новая отправка.
  await createAdminDatabaseRepository(buildPool()).updateRow({
    tableName: "dispatcher_submissions",
    primaryKey: { id: "submission-id" },
    values: {
      "payload.productionTons": "0",
      "payload.downtimeReason": "Резерв",
      "payload.downtimeHours": "2",
      status: "received",
    },
    changedByAccountId: "admin-access",
  });

  // Пустые значения тоже принимаются и просто исчезают из payload.
  await createAdminDatabaseRepository(buildPool()).updateRow({
    tableName: "dispatcher_submissions",
    primaryKey: { id: "submission-id" },
    values: {
      "payload.productionTons": null,
      "payload.downtimeReason": null,
      "payload.downtimeHours": null,
      "payload.note": null,
      status: "received",
    },
    changedByAccountId: "admin-access",
  });

  const updates = queries.filter((query) =>
    query.sql.startsWith("update dispatcher_submissions"),
  );

  assert.match(String(updates[0]?.values?.[4]), /"productionTons":"0"/u);
  assert.match(String(updates[0]?.values?.[4]), /"downtimeHours":"2"/u);
  // Идентичность записи не теряется даже при пустых показателях.
  assert.match(String(updates[1]?.values?.[4]), /"equipment":"Пресс №1"/u);
  assert.doesNotMatch(String(updates[1]?.values?.[4]), /productionTons/u);
});

test("rejected database edit reports the reason as a row mutation error", async () => {
  const pool = {
    async query(sql: string) {
      const normalized = sql.replace(/\s+/g, " ").trim();

      if (normalized.startsWith("select form_id")) {
        return [[{
          form_id: "equipment",
          payload: JSON.stringify({
            reportDate: "16.07.2026",
            equipment: "Пресс №1",
          }),
          summary: "Пресс №1",
          status: "received",
          period: "2026-07",
        }], []];
      }

      return [{ affectedRows: 1 }, []];
    },
  } as unknown as DatabasePool;

  // Идентичность записи по-прежнему защищена, и причина отказа доходит до
  // администратора, а не превращается в «Internal server error».
  await assert.rejects(
    createAdminDatabaseRepository(pool).updateRow({
      tableName: "dispatcher_submissions",
      primaryKey: { id: "submission-id" },
      values: { "payload.equipment": "Пресс №2" },
      changedByAccountId: "admin-access",
    }),
    (error: unknown) =>
      error instanceof AdminDatabaseRowMutationError &&
      /not editable/u.test(error.message),
  );
});

test("user editor exposes no archive option and revokes active sessions", async () => {
  const queries: Array<{ sql: string; values?: unknown[] }> = [];
  const pool = {
    async query(sql: string, values?: unknown[]) {
      const normalized = sql.replace(/\s+/g, " ").trim();
      queries.push({ sql: normalized, values });
      if (normalized.startsWith("select status, is_admin_protected from app_users")) {
        return [[{ status: "active", is_admin_protected: 0 }], []];
      }
      return [{ affectedRows: 1 }, []];
    },
  } as unknown as DatabasePool;
  const repository = createAdminDatabaseRepository(pool);

  await repository.updateRow({
    tableName: "app_users",
    primaryKey: { id: "user-id" },
    values: { status: "suspended" },
  });

  assert.deepEqual(queries[1]?.values, ["suspended", "user-id"]);
  assert.equal(queries[2]?.sql, "delete from auth_sessions where user_id = ?");
  await assert.rejects(
    repository.updateRow({
      tableName: "app_users",
      primaryKey: { id: "user-id" },
      values: { status: "archived" },
    }),
    /unsupported value/u,
  );
});

test("archived user cannot be changed through a forged database mutation", async () => {
  let didUpdate = false;
  const pool = {
    async query(sql: string) {
      const normalized = sql.replace(/\s+/g, " ").trim();
      if (normalized.startsWith("select status, is_admin_protected from app_users")) {
        return [[{ status: "archived", is_admin_protected: 0 }], []];
      }
      if (normalized.startsWith("update app_users")) didUpdate = true;
      return [{ affectedRows: 1 }, []];
    },
  } as unknown as DatabasePool;

  await assert.rejects(
    createAdminDatabaseRepository(pool).updateRow({
      tableName: "app_users",
      primaryKey: { id: "archived-user" },
      values: { display_name: "Новое имя" },
    }),
    /cannot be changed/u,
  );
  assert.equal(didUpdate, false);
});

test("protected user cannot be changed through a forged database mutation", async () => {
  let didUpdate = false;
  const pool = {
    async query(sql: string) {
      const normalized = sql.replace(/\s+/g, " ").trim();
      if (normalized.startsWith("select status, is_admin_protected from app_users")) {
        return [[{ status: "active", is_admin_protected: 1 }], []];
      }
      if (normalized.startsWith("update app_users")) didUpdate = true;
      return [{ affectedRows: 1 }, []];
    },
  } as unknown as DatabasePool;

  await assert.rejects(
    createAdminDatabaseRepository(pool).updateRow({
      tableName: "app_users",
      primaryKey: { id: "protected-user" },
      values: { display_name: "Новое имя" },
    }),
    ProtectedAccountMutationError,
  );
  assert.equal(didUpdate, false);
});

test("archived users stay stored but are filtered out of the database view", async () => {
  const queries: string[] = [];
  const pool = {
    async query(sql: string) {
      const normalized = sql.replace(/\s+/g, " ").trim();
      queries.push(normalized);

      if (normalized.startsWith("select count(*)")) {
        return [[{ row_count: 0 }], []];
      }

      return [[], []];
    },
  } as unknown as DatabasePool;

  await createAdminDatabaseRepository(pool).listRows("app_users");

  assert.equal(queries.length, 2);
  assert.ok(queries.every((sql) => sql.includes("status <> 'archived'")));
});

test("admin database never deletes displayed historical data", async () => {
  const queries: string[] = [];
  const pool = {
    async query(sql: string) {
      queries.push(sql.replace(/\s+/g, " ").trim());
      return [{ affectedRows: 582 }, []];
    },
  } as unknown as DatabasePool;
  const repository = createAdminDatabaseRepository(pool);

  await assert.rejects(
    repository.clearTable("dispatcher_submissions"),
    /does not allow clearing/u,
  );
  await assert.rejects(
    repository.deleteRow({
      tableName: "dispatcher_submissions",
      primaryKey: { id: "submission-id" },
    }),
    /does not allow deletion/u,
  );
  assert.equal(queries.length, 0);
});
