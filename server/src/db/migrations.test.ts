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

test("manager and dispatcher migration removes cross-workspace access", async () => {
  const appliedIds = new Set([
    "001_dispatcher_submissions_mysql", "002_equipment_submission_dedupe_key",
    "003_equipment_report_revisions", "004_auth_users_sessions_accesses",
    "005_account_positions_and_navigation", "006_account_access_levels",
    "007_expand_non_admin_access_catalog", "008_remove_system_full_access_levels",
    "009_remove_account_access_levels", "010_dynamic_account_positions",
    "011_empty_worker_workspace",
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

  assert.match(statements[0] ?? "", /where account_type = 'business_owner'/);
  assert.match(statements[0] ?? "", /business\.dispatcher_form/);
  assert.match(statements[1] ?? "", /json_array\('business\.dispatcher_form'\)/);
  assert.match(statements[1] ?? "", /where account_type = 'dispatcher'/);
});

test("used positions migration adds a restrictive foreign key", async () => {
  const appliedIds = new Set([
    "001_dispatcher_submissions_mysql", "002_equipment_submission_dedupe_key",
    "003_equipment_report_revisions", "004_auth_users_sessions_accesses",
    "005_account_positions_and_navigation", "006_account_access_levels",
    "007_expand_non_admin_access_catalog", "008_remove_system_full_access_levels",
    "009_remove_account_access_levels", "010_dynamic_account_positions",
    "011_empty_worker_workspace", "012_split_manager_dispatcher_access",
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

  assert.match(statements[0] ?? "", /foreign key \(position_code\) references account_positions\(id\)/);
  assert.match(statements[0] ?? "", /on update restrict on delete restrict/);
});

test("dispatcher spreadsheet import migration adds a unique source key", async () => {
  const appliedIds = new Set([
    "001_dispatcher_submissions_mysql", "002_equipment_submission_dedupe_key",
    "003_equipment_report_revisions", "004_auth_users_sessions_accesses",
    "005_account_positions_and_navigation", "006_account_access_levels",
    "007_expand_non_admin_access_catalog", "008_remove_system_full_access_levels",
    "009_remove_account_access_levels", "010_dynamic_account_positions",
    "011_empty_worker_workspace", "012_split_manager_dispatcher_access",
    "013_protect_used_account_positions",
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

  assert.match(
    statements[0] ?? "",
    /add column import_source_key varchar\(512\) null/,
  );
  assert.match(
    statements[0] ?? "",
    /add unique key uniq_dispatcher_submissions_import_source/,
  );
});

test("user audit migration creates append-only storage and grants the report tab", async () => {
  const appliedIds = new Set([
    "001_dispatcher_submissions_mysql", "002_equipment_submission_dedupe_key",
    "003_equipment_report_revisions", "004_auth_users_sessions_accesses",
    "005_account_positions_and_navigation", "006_account_access_levels",
    "007_expand_non_admin_access_catalog", "008_remove_system_full_access_levels",
    "009_remove_account_access_levels", "010_dynamic_account_positions",
    "011_empty_worker_workspace", "012_split_manager_dispatcher_access",
    "013_protect_used_account_positions", "014_dispatcher_spreadsheet_import_source",
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

  assert.match(statements[0] ?? "", /create table if not exists user_audit_events/);
  assert.match(statements[0] ?? "", /details json not null/);
  assert.match(statements[0] ?? "", /idx_user_audit_actor_occurred/);
  assert.doesNotMatch(statements.join(" "), /delete from user_audit_events|foreign key/u);
  assert.match(statements[1] ?? "", /admin\.user_actions/);
  assert.match(statements[1] ?? "", /platform\.view_audit/);
});

test("department removal migration preserves accounts in their business scope", async () => {
  const appliedIds = new Set([
    "001_dispatcher_submissions_mysql", "002_equipment_submission_dedupe_key",
    "003_equipment_report_revisions", "004_auth_users_sessions_accesses",
    "005_account_positions_and_navigation", "006_account_access_levels",
    "007_expand_non_admin_access_catalog", "008_remove_system_full_access_levels",
    "009_remove_account_access_levels", "010_dynamic_account_positions",
    "011_empty_worker_workspace", "012_split_manager_dispatcher_access",
    "013_protect_used_account_positions", "014_dispatcher_spreadsheet_import_source",
    "015_user_audit_events",
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

  assert.match(
    statements[0] ?? "",
    /update account_accesses set is_active = case when business_account_id is null then 0 else is_active end, scope_kind = 'business', department_id = null/,
  );
  assert.match(statements[1] ?? "", /json_search\(capabilities, 'one', 'business\.view_department_statistics'\)/);
  assert.match(statements[2] ?? "", /update account_accesses set capabilities = json_remove/);
  assert.match(statements[3] ?? "", /drop index idx_account_accesses_scope/);
  assert.match(
    statements[3] ?? "",
    /add key idx_account_accesses_scope \( scope_kind, business_account_id \)/,
  );
  assert.match(statements[4] ?? "", /alter table account_accesses drop column department_id/);
  assert.match(statements[5] ?? "", /drop table if exists departments/);
});

test("single organization migration preserves history and removes business storage", async () => {
  const appliedIds = new Set([
    "001_dispatcher_submissions_mysql", "002_equipment_submission_dedupe_key",
    "003_equipment_report_revisions", "004_auth_users_sessions_accesses",
    "005_account_positions_and_navigation", "006_account_access_levels",
    "007_expand_non_admin_access_catalog", "008_remove_system_full_access_levels",
    "009_remove_account_access_levels", "010_dynamic_account_positions",
    "011_empty_worker_workspace", "012_split_manager_dispatcher_access",
    "013_protect_used_account_positions", "014_dispatcher_spreadsheet_import_source",
    "015_user_audit_events", "016_remove_departments",
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

  assert.match(statements[1] ?? "", /row_number\(\) over/);
  assert.match(statements[1] ?? "", /equipment:/);
  assert.match(statements[4] ?? "", /next_import_source_key/);
  assert.match(statements[5] ?? "", /drop column business_account_id/);
  assert.match(statements[6] ?? "", /idx_equipment_report_revisions_date_created/);
  assert.match(statements[8] ?? "", /else 'organization'/);
  assert.match(statements[9] ?? "", /add key idx_account_accesses_scope \(scope_kind\)/);
  assert.match(statements[12] ?? "", /alter table user_audit_events drop column business_account_id/);
  assert.equal(statements[13], "drop table if exists business_accounts;");
  assert.doesNotMatch(statements.join(" "), /delete from dispatcher_submissions/u);
});

function normalizeSql(sql: string) {
  return sql.replace(/\s+/g, " ").trim();
}
