import assert from "node:assert/strict";
import test from "node:test";
import type { DatabasePool } from "../db/pool.js";
import { createAdminDatabaseRepository } from "./adminDatabaseRepository.js";

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
    "production_product_brands",
    "production_unformed_brands",
    "production_chamotte_brands",
  ]);
  assert.ok(tables.every((table) => table.primaryKey.length > 0));
  assert.equal(queries.length, 5);
  assert.doesNotMatch(
    JSON.stringify(tables),
    /departments|account_accesses|account_positions|auth_sessions|auth_password_credentials|schema_migrations/u,
  );
  assert.ok(tables.every((table) => !table.canDelete && !table.canClear));
  assert.deepEqual(
    tables.filter((table) => table.canMerge).map((table) => table.name),
    [
      "production_product_brands",
      "production_unformed_brands",
      "production_chamotte_brands",
    ],
  );
});

test("brand catalog rows expose labels and all same-catalog merge targets", async () => {
  const pool = {
    async query(sql: string) {
      const normalized = sql.replace(/\s+/g, " ").trim();

      if (normalized.startsWith("select count(*)")) {
        return [[{ row_count: 2 }], []];
      }

      if (normalized.includes("as `__admin_primary_key_id`")) {
        return [[
          {
            __admin_primary_key_id: "brand-1",
            label: "МКР-1",
            created_at: "2026-07-17T08:00:00.000Z",
          },
          {
            __admin_primary_key_id: "brand-2",
            label: "МКР-2",
            created_at: "2026-07-18T08:00:00.000Z",
          },
        ], []];
      }

      if (normalized.startsWith("select id, label from production_brand_labels")) {
        return [[
          { id: "brand-1", label: "МКР-1" },
          { id: "brand-2", label: "МКР-2" },
        ], []];
      }

      throw new Error(`Unexpected query: ${normalized}`);
    },
  } as unknown as DatabasePool;

  const result = await createAdminDatabaseRepository(pool).listRows(
    "production_product_brands",
  );

  assert.deepEqual(result.table.columns.map((column) => column.label), [
    "Название марки",
    "Создана",
  ]);
  assert.deepEqual(result.rows[0]?.editorFields, [{
    name: "label",
    label: "Название марки",
    inputType: "text",
    required: true,
    options: [],
    value: "МКР-1",
  }]);
  assert.deepEqual(result.mergeTargets, [
    { primaryKey: { id: "brand-1" }, label: "МКР-1" },
    { primaryKey: { id: "brand-2" }, label: "МКР-2" },
  ]);
});

test("renaming a brand updates the catalog and every production reference", async () => {
  const queries: Array<{ sql: string; values?: unknown[] }> = [];
  const pool = {
    async query(sql: string, values?: unknown[]) {
      const normalized = sql.replace(/\s+/g, " ").trim();
      queries.push({ sql: normalized, values });

      if (normalized.startsWith("select id, category, label, normalized_label")) {
        return [[{
          id: "brand-source",
          category: "unformed",
          label: "Старая",
          normalized_label: "старая",
        }], []];
      }

      if (normalized.startsWith("select id from production_brand_labels")) {
        return [[], []];
      }

      if (normalized.startsWith("select id, payload, period")) {
        return [[{
          id: "submission-1",
          payload: JSON.stringify({
            reportDate: "2026-07-17",
            unformedBrand1: " старая ",
            unformedFact1: "12",
            serverOwnedNumber: 42,
          }),
          period: "2026-07",
          status: "received",
        }], []];
      }

      return [{ affectedRows: 1 }, []];
    },
  } as unknown as DatabasePool;

  await createAdminDatabaseRepository(pool).updateRow({
    tableName: "production_unformed_brands",
    primaryKey: { id: "brand-source" },
    values: { label: "Новая" },
  });

  const catalogUpdate = queries.find((query) =>
    query.sql.startsWith("update production_brand_labels"),
  );
  const submissionUpdate = queries.find((query) =>
    query.sql.startsWith("update dispatcher_submissions"),
  );
  const rewrittenPayload = JSON.parse(String(submissionUpdate?.values?.[0])) as Record<string, unknown>;

  assert.deepEqual(catalogUpdate?.values, ["Новая", "новая", "brand-source"]);
  assert.equal(rewrittenPayload.unformedBrand1, "Новая");
  assert.equal(rewrittenPayload.unformedFact1, "12");
  assert.equal(rewrittenPayload.serverOwnedNumber, 42);
});

test("merging brands folds facts into the existing target and removes the source label", async () => {
  const queries: Array<{ sql: string; values?: unknown[] }> = [];
  const pool = {
    async query(sql: string, values?: unknown[]) {
      const normalized = sql.replace(/\s+/g, " ").trim();
      queries.push({ sql: normalized, values });

      if (normalized.startsWith("select id, category, label, normalized_label")) {
        return [[
          {
            id: "brand-source",
            category: "chamotte",
            label: "ША-1",
            normalized_label: "ша-1",
          },
          {
            id: "brand-target",
            category: "chamotte",
            label: "ША-2",
            normalized_label: "ша-2",
          },
        ], []];
      }

      if (normalized.startsWith("select id, payload, period")) {
        return [[{
          id: "submission-1",
          payload: JSON.stringify({
            reportDate: "2026-07-17",
            chamotteBrand1: "ША-2",
            chamotteFact1: "2.5",
            chamotteBrand2: "ША-1",
            chamotteFact2: "3.5",
          }),
          period: "2026-07",
          status: "received",
        }], []];
      }

      return [{ affectedRows: 1 }, []];
    },
  } as unknown as DatabasePool;

  const result = await createAdminDatabaseRepository(pool).mergeRows({
    tableName: "production_chamotte_brands",
    sourcePrimaryKey: { id: "brand-source" },
    targetPrimaryKey: { id: "brand-target" },
  });
  const submissionUpdate = queries.find((query) =>
    query.sql.startsWith("update dispatcher_submissions"),
  );
  const rewrittenPayload = JSON.parse(String(submissionUpdate?.values?.[0])) as Record<string, string>;
  const sourceDelete = queries.find((query) =>
    query.sql.startsWith("delete from production_brand_labels"),
  );

  assert.equal(rewrittenPayload.chamotteBrand1, "ША-2");
  assert.equal(rewrittenPayload.chamotteFact1, "6");
  assert.equal(rewrittenPayload.chamotteBrand2, undefined);
  assert.equal(rewrittenPayload.chamotteFact2, undefined);
  assert.deepEqual(sourceDelete?.values, ["brand-source"]);
  assert.deepEqual(result, {
    sourceLabel: "ША-1",
    targetLabel: "ША-2",
    updatedSubmissions: 1,
    combinedFacts: 1,
  });
});

test("brand rename rejects an existing normalized label and preserves stored data", async () => {
  const queries: string[] = [];
  const pool = {
    async query(sql: string) {
      const normalized = sql.replace(/\s+/g, " ").trim();
      queries.push(normalized);

      if (normalized.startsWith("select id, category, label, normalized_label")) {
        return [[{
          id: "brand-source",
          category: "product",
          label: "МКР-1",
          normalized_label: "мкр-1",
        }], []];
      }

      if (normalized.startsWith("select id from production_brand_labels")) {
        return [[{ id: "brand-existing" }], []];
      }

      throw new Error(`Unexpected query: ${normalized}`);
    },
  } as unknown as DatabasePool;

  await assert.rejects(
    createAdminDatabaseRepository(pool).updateRow({
      tableName: "production_product_brands",
      primaryKey: { id: "brand-source" },
      values: { label: "  мкр-2  " },
    }),
    /уже существует/u,
  );
  assert.ok(!queries.some((sql) => sql.startsWith("update ")));
});

test("brand merge rejects targets from another catalog before changing facts", async () => {
  const queries: string[] = [];
  const pool = {
    async query(sql: string) {
      const normalized = sql.replace(/\s+/g, " ").trim();
      queries.push(normalized);

      if (normalized.startsWith("select id, category, label, normalized_label")) {
        return [[
          {
            id: "brand-source",
            category: "unformed",
            label: "ПБ-1",
            normalized_label: "пб-1",
          },
          {
            id: "brand-target",
            category: "chamotte",
            label: "ША-1",
            normalized_label: "ша-1",
          },
        ], []];
      }

      throw new Error(`Unexpected query: ${normalized}`);
    },
  } as unknown as DatabasePool;

  await assert.rejects(
    createAdminDatabaseRepository(pool).mergeRows({
      tableName: "production_unformed_brands",
      sourcePrimaryKey: { id: "brand-source" },
      targetPrimaryKey: { id: "brand-target" },
    }),
    /другому справочнику/u,
  );
  assert.equal(queries.length, 1);
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

test("user editor exposes no archive option and revokes active sessions", async () => {
  const queries: Array<{ sql: string; values?: unknown[] }> = [];
  const pool = {
    async query(sql: string, values?: unknown[]) {
      const normalized = sql.replace(/\s+/g, " ").trim();
      queries.push({ sql: normalized, values });
      if (normalized.startsWith("select status from app_users")) {
        return [[{ status: "active" }], []];
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
      if (normalized.startsWith("select status from app_users")) {
        return [[{ status: "archived" }], []];
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
