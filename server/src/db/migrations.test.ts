import assert from "node:assert/strict";
import test from "node:test";
import type { DatabasePool } from "./pool.js";
import { runMigrations } from "./migrations.js";

test("access level presets are removed without changing account rights", async () => {
  const appliedIds = new Set([
    "001_dispatcher_submissions_mysql",
    "002_equipment_submission_dedupe_key",
    "003_equipment_report_revisions",
    "004_auth_users_sessions_accesses",
    "005_account_positions_and_navigation",
    "006_account_access_levels",
    "007_expand_non_admin_access_catalog",
    "008_remove_system_full_access_levels",
  ]);
  const transactionStatements: string[] = [];
  const connection = {
    async beginTransaction() {},
    async commit() {},
    async rollback() {},
    release() {},
    async query(sql: string) {
      transactionStatements.push(normalizeSql(sql));
      return [[], []];
    },
  };
  const pool = {
    async query(sql: string, parameters?: unknown[]) {
      if (sql.includes("select id from schema_migrations")) {
        const id = String(parameters?.[0]);
        return [appliedIds.has(id) ? [{ id }] : [], []];
      }

      return [[], []];
    },
    async getConnection() {
      return connection;
    },
  } as unknown as DatabasePool;

  await runMigrations(pool);

  assert.match(
    transactionStatements[0] ?? "",
    /update account_accesses set access_level_id = null where access_level_id is not null/,
  );
  assert.match(
    transactionStatements[1] ?? "",
    /alter table account_accesses drop index idx_account_accesses_access_level/,
  );
  assert.doesNotMatch(transactionStatements[0] ?? "", /navigation_items|capabilities/);
  assert.match(
    transactionStatements[2] ?? "",
    /alter table account_accesses drop column access_level_id/,
  );
  assert.match(
    transactionStatements[3] ?? "",
    /drop table if exists account_access_levels/,
  );
  assert.match(
    transactionStatements[4] ?? "",
    /insert into schema_migrations \(id\) values \(\?\)/,
  );
});

test("dynamic positions migration creates and seeds the server-owned catalog", async () => {
  const appliedIds = new Set([
    "001_dispatcher_submissions_mysql",
    "002_equipment_submission_dedupe_key",
    "003_equipment_report_revisions",
    "004_auth_users_sessions_accesses",
    "005_account_positions_and_navigation",
    "006_account_access_levels",
    "007_expand_non_admin_access_catalog",
    "008_remove_system_full_access_levels",
    "009_remove_account_access_levels",
  ]);
  const statements: string[] = [];
  const connection = {
    async beginTransaction() {}, async commit() {}, async rollback() {}, release() {},
    async query(sql: string) { statements.push(normalizeSql(sql)); return [[], []]; },
  };
  const pool = {
    async query(sql: string, parameters?: unknown[]) {
      if (sql.includes("select id from schema_migrations")) {
        const id = String(parameters?.[0]);
        return [appliedIds.has(id) ? [{ id }] : [], []];
      }
      return [[], []];
    },
    async getConnection() { return connection; },
  } as unknown as DatabasePool;

  await runMigrations(pool);

  assert.match(statements[0] ?? "", /modify position_code varchar\(120\) not null/);
  assert.match(statements[1] ?? "", /create table if not exists account_positions/);
  assert.match(statements[2] ?? "", /'board_chair'.*'Председатель совета директоров'/);
  assert.match(statements[2] ?? "", /'general_director'.*'Генеральный директор'/);
});

test("worker workspace migration removes inherited owner access", async () => {
  const appliedIds = new Set([
    "001_dispatcher_submissions_mysql", "002_equipment_submission_dedupe_key",
    "003_equipment_report_revisions", "004_auth_users_sessions_accesses",
    "005_account_positions_and_navigation", "006_account_access_levels",
    "007_expand_non_admin_access_catalog", "008_remove_system_full_access_levels",
    "009_remove_account_access_levels", "010_dynamic_account_positions",
  ]);
  const statements: string[] = [];
  const connection = {
    async beginTransaction() {}, async commit() {}, async rollback() {}, release() {},
    async query(sql: string) { statements.push(normalizeSql(sql)); return [[], []]; },
  };
  const pool = {
    async query(sql: string, parameters?: unknown[]) {
      if (sql.includes("select id from schema_migrations")) {
        const id = String(parameters?.[0]);
        return [appliedIds.has(id) ? [{ id }] : [], []];
      }
      return [[], []];
    },
    async getConnection() { return connection; },
  } as unknown as DatabasePool;

  await runMigrations(pool);

  assert.match(statements[0] ?? "", /set navigation_items = json_array\(\), capabilities = json_array\(\)/);
  assert.match(statements[0] ?? "", /where account_type = 'worker'/);
});

function normalizeSql(sql: string) {
  return sql.replace(/\s+/g, " ").trim();
}
