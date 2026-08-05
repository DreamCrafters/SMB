import assert from "node:assert/strict";
import test from "node:test";
import type { DatabasePool } from "./pool.js";
import { runMigrations } from "./migrations.js";

test("laboratory migration creates results storage and the system position", async () => {
  const appliedIds = new Set([
    "001_dispatcher_submissions_mysql", "002_equipment_submission_dedupe_key",
    "003_equipment_report_revisions", "004_auth_users_sessions_accesses",
    "005_account_positions_and_navigation", "006_account_access_levels",
    "007_expand_non_admin_access_catalog", "008_remove_system_full_access_levels",
    "009_remove_account_access_levels", "010_dynamic_account_positions",
    "011_empty_worker_workspace", "012_split_manager_dispatcher_access",
    "013_protect_used_account_positions", "014_dispatcher_spreadsheet_import_source",
    "015_user_audit_events", "016_remove_departments", "017_single_organization_scope",
    "018_production_plan_revisions", "019_production_category_plans_and_brands",
    "020_production_plan_month_locks", "021_refractory_report_revisions",
    "022_google_sheets_production_brands",
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

  assert.match(statements[0] ?? "", /create table if not exists laboratory_results/u);
  assert.match(statements[1] ?? "", /'laboratory_assistant'.*'Лаборант'/u);
  assert.match(statements[1] ?? "", /business\.laboratory_results/u);
  assert.match(statements[1] ?? "", /business\.manage_laboratory_results/u);
});

test("bank assignment migration creates append-only laboratory history", async () => {
  const appliedIds = new Set([
    "001_dispatcher_submissions_mysql", "002_equipment_submission_dedupe_key",
    "003_equipment_report_revisions", "004_auth_users_sessions_accesses",
    "005_account_positions_and_navigation", "006_account_access_levels",
    "007_expand_non_admin_access_catalog", "008_remove_system_full_access_levels",
    "009_remove_account_access_levels", "010_dynamic_account_positions",
    "011_empty_worker_workspace", "012_split_manager_dispatcher_access",
    "013_protect_used_account_positions", "014_dispatcher_spreadsheet_import_source",
    "015_user_audit_events", "016_remove_departments", "017_single_organization_scope",
    "018_production_plan_revisions", "019_production_category_plans_and_brands",
    "020_production_plan_month_locks", "021_refractory_report_revisions",
    "022_google_sheets_production_brands", "023_laboratory_results",
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

  assert.match(statements[0] ?? "", /create table if not exists laboratory_bank_assignments/u);
  assert.match(statements[0] ?? "", /auto_increment primary key/u);
  assert.match(statements[0] ?? "", /foreign key \(laboratory_result_id\).*on delete restrict/su);
});

test("rotary kiln 2 firing journal migration creates append-only parameter storage", async () => {
  const appliedIds = new Set([
    "001_dispatcher_submissions_mysql", "002_equipment_submission_dedupe_key",
    "003_equipment_report_revisions", "004_auth_users_sessions_accesses",
    "005_account_positions_and_navigation", "006_account_access_levels",
    "007_expand_non_admin_access_catalog", "008_remove_system_full_access_levels",
    "009_remove_account_access_levels", "010_dynamic_account_positions",
    "011_empty_worker_workspace", "012_split_manager_dispatcher_access",
    "013_protect_used_account_positions", "014_dispatcher_spreadsheet_import_source",
    "015_user_audit_events", "016_remove_departments", "017_single_organization_scope",
    "018_production_plan_revisions", "019_production_category_plans_and_brands",
    "020_production_plan_month_locks", "021_refractory_report_revisions",
    "022_google_sheets_production_brands", "023_laboratory_results",
    "024_laboratory_bank_assignments", "025_board_assignments",
    "026_board_assignment_schedules",
    "027_board_assignment_editing_and_completion_history",
    "028_account_position_order", "029_board_assignment_documents",
    "031_laboratory_sample_registration_journal",
    "032_laboratory_chemical_analysis_journal",
    "033_optional_laboratory_chemical_analysis_values",
    "034_rotary_kiln_2_produced_material_bank_density",
    "035_protected_admin_accounts",
    "036_sample_registration_sampling_location_index",
    "037_sample_registration_water_absorption",
    "038_laboratory_sample_registration_revisions",
    "039_laboratory_journal_corrections",
    "040_optional_chemical_analysis_batch_number",
    "041_laboratory_chemical_analysis_number",
    "042_unshaped_product_sample_journal",
    "043_chemical_analysis_sample_sources",
    "044_laboratory_raw_material_quality_journal",
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

  assert.equal(statements.length, 2);
  assert.match(
    statements[0] ?? "",
    /create table if not exists rotary_kiln_2_firing_journal/u,
  );
  assert.match(statements[0] ?? "", /bulk_density decimal\(14,4\) not null/u);
  assert.match(
    statements[0] ?? "",
    /submitted_by_user_id varchar\(120\) not null/u,
  );
  assert.equal(
    statements[1],
    "insert into schema_migrations (id) values (?)",
  );
});

test("sample registration journal migration creates append-only laboratory storage", async () => {
  const appliedIds = new Set([
    "001_dispatcher_submissions_mysql", "002_equipment_submission_dedupe_key",
    "003_equipment_report_revisions", "004_auth_users_sessions_accesses",
    "005_account_positions_and_navigation", "006_account_access_levels",
    "007_expand_non_admin_access_catalog", "008_remove_system_full_access_levels",
    "009_remove_account_access_levels", "010_dynamic_account_positions",
    "011_empty_worker_workspace", "012_split_manager_dispatcher_access",
    "013_protect_used_account_positions", "014_dispatcher_spreadsheet_import_source",
    "015_user_audit_events", "016_remove_departments", "017_single_organization_scope",
    "018_production_plan_revisions", "019_production_category_plans_and_brands",
    "020_production_plan_month_locks", "021_refractory_report_revisions",
    "022_google_sheets_production_brands", "023_laboratory_results",
    "024_laboratory_bank_assignments", "025_board_assignments",
    "026_board_assignment_schedules",
    "027_board_assignment_editing_and_completion_history",
    "028_account_position_order", "029_board_assignment_documents",
    "030_rotary_kiln_2_firing_journal",
    "032_laboratory_chemical_analysis_journal",
    "033_optional_laboratory_chemical_analysis_values",
    "034_rotary_kiln_2_produced_material_bank_density",
    "035_protected_admin_accounts",
    "036_sample_registration_sampling_location_index",
    "037_sample_registration_water_absorption",
    "038_laboratory_sample_registration_revisions",
    "039_laboratory_journal_corrections",
    "040_optional_chemical_analysis_batch_number",
    "041_laboratory_chemical_analysis_number",
    "042_unshaped_product_sample_journal",
    "043_chemical_analysis_sample_sources",
    "044_laboratory_raw_material_quality_journal",
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

  assert.equal(statements.length, 2);
  assert.match(
    statements[0] ?? "",
    /create table if not exists laboratory_sample_registration_journal/u,
  );
  assert.match(
    statements[0] ?? "",
    /laboratory_sample_code varchar\(120\) not null/u,
  );
  assert.match(
    statements[0] ?? "",
    /submitted_by_user_id varchar\(120\) not null/u,
  );
  assert.equal(
    statements[1],
    "insert into schema_migrations (id) values (?)",
  );
});

test("chemical analysis migration links analyses to registered samples", async () => {
  const appliedIds = new Set([
    "001_dispatcher_submissions_mysql", "002_equipment_submission_dedupe_key",
    "003_equipment_report_revisions", "004_auth_users_sessions_accesses",
    "005_account_positions_and_navigation", "006_account_access_levels",
    "007_expand_non_admin_access_catalog", "008_remove_system_full_access_levels",
    "009_remove_account_access_levels", "010_dynamic_account_positions",
    "011_empty_worker_workspace", "012_split_manager_dispatcher_access",
    "013_protect_used_account_positions", "014_dispatcher_spreadsheet_import_source",
    "015_user_audit_events", "016_remove_departments", "017_single_organization_scope",
    "018_production_plan_revisions", "019_production_category_plans_and_brands",
    "020_production_plan_month_locks", "021_refractory_report_revisions",
    "022_google_sheets_production_brands", "023_laboratory_results",
    "024_laboratory_bank_assignments", "025_board_assignments",
    "026_board_assignment_schedules",
    "027_board_assignment_editing_and_completion_history",
    "028_account_position_order", "029_board_assignment_documents",
    "030_rotary_kiln_2_firing_journal",
    "031_laboratory_sample_registration_journal",
    "033_optional_laboratory_chemical_analysis_values",
    "034_rotary_kiln_2_produced_material_bank_density",
    "035_protected_admin_accounts",
    "036_sample_registration_sampling_location_index",
    "037_sample_registration_water_absorption",
    "038_laboratory_sample_registration_revisions",
    "039_laboratory_journal_corrections",
    "040_optional_chemical_analysis_batch_number",
    "041_laboratory_chemical_analysis_number",
    "042_unshaped_product_sample_journal",
    "043_chemical_analysis_sample_sources",
    "044_laboratory_raw_material_quality_journal",
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

  assert.equal(statements.length, 3);
  assert.match(
    statements[0] ?? "",
    /alter table laboratory_sample_registration_journal/u,
  );
  assert.match(statements[0] ?? "", /modify al2o3 varchar\(120\) null/u);
  assert.match(
    statements[1] ?? "",
    /create table if not exists laboratory_chemical_analysis_journal/u,
  );
  assert.match(statements[1] ?? "", /auto_increment primary key/u);
  assert.match(
    statements[1] ?? "",
    /foreign key \(sample_registration_id\).*on delete restrict/su,
  );
  assert.equal(
    statements[2],
    "insert into schema_migrations (id) values (?)",
  );
});

test("chemical analysis optional-values migration keeps the original batch requirement", async () => {
  const appliedIds = new Set([
    "001_dispatcher_submissions_mysql", "002_equipment_submission_dedupe_key",
    "003_equipment_report_revisions", "004_auth_users_sessions_accesses",
    "005_account_positions_and_navigation", "006_account_access_levels",
    "007_expand_non_admin_access_catalog", "008_remove_system_full_access_levels",
    "009_remove_account_access_levels", "010_dynamic_account_positions",
    "011_empty_worker_workspace", "012_split_manager_dispatcher_access",
    "013_protect_used_account_positions", "014_dispatcher_spreadsheet_import_source",
    "015_user_audit_events", "016_remove_departments", "017_single_organization_scope",
    "018_production_plan_revisions", "019_production_category_plans_and_brands",
    "020_production_plan_month_locks", "021_refractory_report_revisions",
    "022_google_sheets_production_brands", "023_laboratory_results",
    "024_laboratory_bank_assignments", "025_board_assignments",
    "026_board_assignment_schedules",
    "027_board_assignment_editing_and_completion_history",
    "028_account_position_order", "029_board_assignment_documents",
    "030_rotary_kiln_2_firing_journal",
    "031_laboratory_sample_registration_journal",
    "032_laboratory_chemical_analysis_journal",
    "034_rotary_kiln_2_produced_material_bank_density",
    "035_protected_admin_accounts",
    "036_sample_registration_sampling_location_index",
    "037_sample_registration_water_absorption",
    "038_laboratory_sample_registration_revisions",
    "039_laboratory_journal_corrections",
    "040_optional_chemical_analysis_batch_number",
    "041_laboratory_chemical_analysis_number",
    "042_unshaped_product_sample_journal",
    "043_chemical_analysis_sample_sources",
    "044_laboratory_raw_material_quality_journal",
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

  assert.equal(statements.length, 2);
  assert.match(
    statements[0] ?? "",
    /alter table laboratory_chemical_analysis_journal/u,
  );
  assert.match(
    statements[0] ?? "",
    /modify chemical_analysis_date date null/u,
  );
  assert.match(statements[0] ?? "", /modify moisture varchar\(120\) null/u);
  assert.doesNotMatch(statements[0] ?? "", /modify batch_number/u);
  assert.equal(
    statements[1],
    "insert into schema_migrations (id) values (?)",
  );
});

test("kiln material migration adds the produced material and the journal density source", async () => {
  const appliedIds = new Set([
    "001_dispatcher_submissions_mysql", "002_equipment_submission_dedupe_key",
    "003_equipment_report_revisions", "004_auth_users_sessions_accesses",
    "005_account_positions_and_navigation", "006_account_access_levels",
    "007_expand_non_admin_access_catalog", "008_remove_system_full_access_levels",
    "009_remove_account_access_levels", "010_dynamic_account_positions",
    "011_empty_worker_workspace", "012_split_manager_dispatcher_access",
    "013_protect_used_account_positions", "014_dispatcher_spreadsheet_import_source",
    "015_user_audit_events", "016_remove_departments", "017_single_organization_scope",
    "018_production_plan_revisions", "019_production_category_plans_and_brands",
    "020_production_plan_month_locks", "021_refractory_report_revisions",
    "022_google_sheets_production_brands", "023_laboratory_results",
    "024_laboratory_bank_assignments", "025_board_assignments",
    "026_board_assignment_schedules",
    "027_board_assignment_editing_and_completion_history",
    "028_account_position_order", "029_board_assignment_documents",
    "030_rotary_kiln_2_firing_journal",
    "031_laboratory_sample_registration_journal",
    "032_laboratory_chemical_analysis_journal",
    "033_optional_laboratory_chemical_analysis_values",
    "035_protected_admin_accounts",
    "036_sample_registration_sampling_location_index",
    "037_sample_registration_water_absorption",
    "038_laboratory_sample_registration_revisions",
    "039_laboratory_journal_corrections",
    "040_optional_chemical_analysis_batch_number",
    "041_laboratory_chemical_analysis_number",
    "042_unshaped_product_sample_journal",
    "043_chemical_analysis_sample_sources",
    "044_laboratory_raw_material_quality_journal",
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

  assert.equal(statements.length, 4);
  assert.match(
    statements[0] ?? "",
    /alter table rotary_kiln_2_firing_journal add column produced_material varchar\(120\) null after record_time/u,
  );
  assert.match(
    statements[1] ?? "",
    /alter table laboratory_bank_assignments drop foreign key fk_laboratory_bank_assignment_result/u,
  );
  assert.match(
    statements[2] ?? "",
    /add column bulk_density_source varchar\(40\) not null default 'laboratory_result'/u,
  );
  assert.match(
    statements[2] ?? "",
    /modify laboratory_result_id char\(36\) null/u,
  );
  assert.equal(
    statements[3],
    "insert into schema_migrations (id) values (?)",
  );
});

test("board assignment migration creates the audited protocol register and reviewer positions", async () => {
  const appliedIds = new Set([
    "001_dispatcher_submissions_mysql", "002_equipment_submission_dedupe_key",
    "003_equipment_report_revisions", "004_auth_users_sessions_accesses",
    "005_account_positions_and_navigation", "006_account_access_levels",
    "007_expand_non_admin_access_catalog", "008_remove_system_full_access_levels",
    "009_remove_account_access_levels", "010_dynamic_account_positions",
    "011_empty_worker_workspace", "012_split_manager_dispatcher_access",
    "013_protect_used_account_positions", "014_dispatcher_spreadsheet_import_source",
    "015_user_audit_events", "016_remove_departments", "017_single_organization_scope",
    "018_production_plan_revisions", "019_production_category_plans_and_brands",
    "020_production_plan_month_locks", "021_refractory_report_revisions",
    "022_google_sheets_production_brands", "023_laboratory_results",
    "024_laboratory_bank_assignments",
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

  assert.match(statements[0] ?? "", /create table if not exists board_assignments/u);
  assert.match(
    statements[0] ?? "",
    /status in \( \s*'in_progress', 'under_review', 'revision_requested', 'completed'\s* \)/u,
  );
  assert.match(statements[1] ?? "", /create table if not exists board_assignment_comments/u);
  assert.match(
    statements[1] ?? "",
    /foreign key \(assignment_id\) references board_assignments\(id\).*on delete restrict/su,
  );
  assert.ok(
    statements.some((statement) =>
      /'board_deputy_chair'.*'Заместитель председателя Совета директоров'/u
        .test(statement)
    ),
  );
  assert.ok(
    statements.some((statement) =>
      /'board_assignment_reviewer'.*'Член Совета директоров с правом приёмки поручений'/u
        .test(statement)
    ),
  );
  assert.ok(
    statements.some((statement) =>
      /business\.review_board_assignments/u.test(statement)
    ),
  );
  assert.doesNotMatch(statements.join(" "), /protocol-369-assignment-1-1/u);
  assert.match(statements.join(" "), /protocol-369-assignment-1-2/u);
  assert.match(statements.join(" "), /protocol-369-2026-07-10/u);
  assert.match(statements.join(" "), /business\.board_assignments/u);
  assert.ok(
    statements.some((statement) =>
      /insert into user_audit_events.*board_assignment\.create/su.test(statement)
    ),
  );
  assert.doesNotMatch(
    statements.join(" "),
    /join app_users users.*(?:лариков|самсонов|глушков)/su,
  );
  const administratorGrant = statements.find((statement) =>
    /where id = 'administrator'/u.test(statement) &&
    /business\.view_board_assignments/u.test(statement)
  );
  assert.ok(administratorGrant);
  assert.doesNotMatch(
    administratorGrant,
    /business\.(?:create|execute|review)_board_assignments/u,
  );
});

test("board assignment schedule migration adds recurrence and active occurrence dates", async () => {
  const appliedIds = new Set([
    "001_dispatcher_submissions_mysql", "002_equipment_submission_dedupe_key",
    "003_equipment_report_revisions", "004_auth_users_sessions_accesses",
    "005_account_positions_and_navigation", "006_account_access_levels",
    "007_expand_non_admin_access_catalog", "008_remove_system_full_access_levels",
    "009_remove_account_access_levels", "010_dynamic_account_positions",
    "011_empty_worker_workspace", "012_split_manager_dispatcher_access",
    "013_protect_used_account_positions", "014_dispatcher_spreadsheet_import_source",
    "015_user_audit_events", "016_remove_departments", "017_single_organization_scope",
    "018_production_plan_revisions", "019_production_category_plans_and_brands",
    "020_production_plan_month_locks", "021_refractory_report_revisions",
    "022_google_sheets_production_brands", "023_laboratory_results",
    "024_laboratory_bank_assignments", "025_board_assignments",
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

  assert.match(statements[0] ?? "", /add column recurrence varchar\(16\)/u);
  assert.match(statements[0] ?? "", /add column current_occurrence_date date/u);
  assert.match(statements.join(" "), /then 'monthly'/u);
  assert.match(
    statements.join(" "),
    /protocol-369-assignment-2-3' then '2026-07-24'/u,
  );
  assert.match(
    statements.join(" "),
    /protocol-369-assignment-4-2' then '2026-07-20'/u,
  );
  assert.match(
    statements.join(" "),
    /protocol-369-assignment-5-2' then '2026-08-05'/u,
  );
  assert.match(
    statements.join(" "),
    /protocol-369-assignment-5-2' then '2027-01-05'/u,
  );
  assert.match(
    statements.join(" "),
    /current_occurrence_date = active_from/u,
  );
  assert.match(
    statements.join(" "),
    /check \(recurrence in \('daily', 'weekly', 'monthly', 'yearly', 'once'\)\)/u,
  );
  assert.match(
    statements.join(" "),
    /current_occurrence_date between active_from and active_to/u,
  );
});

test("board assignment history migration preserves edit revisions and completed snapshots", async () => {
  const appliedIds = new Set([
    "001_dispatcher_submissions_mysql", "002_equipment_submission_dedupe_key",
    "003_equipment_report_revisions", "004_auth_users_sessions_accesses",
    "005_account_positions_and_navigation", "006_account_access_levels",
    "007_expand_non_admin_access_catalog", "008_remove_system_full_access_levels",
    "009_remove_account_access_levels", "010_dynamic_account_positions",
    "011_empty_worker_workspace", "012_split_manager_dispatcher_access",
    "013_protect_used_account_positions", "014_dispatcher_spreadsheet_import_source",
    "015_user_audit_events", "016_remove_departments", "017_single_organization_scope",
    "018_production_plan_revisions", "019_production_category_plans_and_brands",
    "020_production_plan_month_locks", "021_refractory_report_revisions",
    "022_google_sheets_production_brands", "023_laboratory_results",
    "024_laboratory_bank_assignments", "025_board_assignments",
    "026_board_assignment_schedules",
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
    /create table if not exists board_assignment_edit_revisions/u,
  );
  assert.match(statements[0] ?? "", /before_snapshot json not null/u);
  assert.match(statements[0] ?? "", /after_snapshot json not null/u);
  assert.match(
    statements[0] ?? "",
    /foreign key \(assignment_id\) references board_assignments\(id\).*on delete restrict/su,
  );
  assert.match(
    statements[1] ?? "",
    /create table if not exists board_assignment_completion_snapshots/u,
  );
  assert.match(statements[1] ?? "", /snapshot json not null/u);
  assert.match(
    statements[1] ?? "",
    /unique key uq_board_assignment_completion_occurrence \(\s*assignment_id, occurrence_date\s*\)/u,
  );
});

test("position order migration preserves the current catalog order and indexes it", async () => {
  const appliedIds = new Set([
    "001_dispatcher_submissions_mysql", "002_equipment_submission_dedupe_key",
    "003_equipment_report_revisions", "004_auth_users_sessions_accesses",
    "005_account_positions_and_navigation", "006_account_access_levels",
    "007_expand_non_admin_access_catalog", "008_remove_system_full_access_levels",
    "009_remove_account_access_levels", "010_dynamic_account_positions",
    "011_empty_worker_workspace", "012_split_manager_dispatcher_access",
    "013_protect_used_account_positions", "014_dispatcher_spreadsheet_import_source",
    "015_user_audit_events", "016_remove_departments", "017_single_organization_scope",
    "018_production_plan_revisions", "019_production_category_plans_and_brands",
    "020_production_plan_month_locks", "021_refractory_report_revisions",
    "022_google_sheets_production_brands", "023_laboratory_results",
    "024_laboratory_bank_assignments", "025_board_assignments",
    "026_board_assignment_schedules",
    "027_board_assignment_editing_and_completion_history",
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
    /add column sort_order int null after is_protected/u,
  );
  assert.match(
    statements[1] ?? "",
    /row_number\(\) over \(\s*order by is_protected desc, display_name asc, id asc\s*\)/u,
  );
  assert.match(
    statements[2] ?? "",
    /modify sort_order int unsigned not null.*add key idx_account_positions_sort_order \(sort_order\)/u,
  );
});

test("board assignment documents migration stores five protected PDF attachments", async () => {
  const appliedIds = new Set([
    "001_dispatcher_submissions_mysql", "002_equipment_submission_dedupe_key",
    "003_equipment_report_revisions", "004_auth_users_sessions_accesses",
    "005_account_positions_and_navigation", "006_account_access_levels",
    "007_expand_non_admin_access_catalog", "008_remove_system_full_access_levels",
    "009_remove_account_access_levels", "010_dynamic_account_positions",
    "011_empty_worker_workspace", "012_split_manager_dispatcher_access",
    "013_protect_used_account_positions", "014_dispatcher_spreadsheet_import_source",
    "015_user_audit_events", "016_remove_departments", "017_single_organization_scope",
    "018_production_plan_revisions", "019_production_category_plans_and_brands",
    "020_production_plan_month_locks", "021_refractory_report_revisions",
    "022_google_sheets_production_brands", "023_laboratory_results",
    "024_laboratory_bank_assignments", "025_board_assignments",
    "026_board_assignment_schedules",
    "027_board_assignment_editing_and_completion_history",
    "028_account_position_order",
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
    /create table if not exists board_assignment_documents/u,
  );
  assert.match(statements[0] ?? "", /pdf_data mediumblob null/u);
  assert.match(
    statements[0] ?? "",
    /foreign key \(assignment_id\) references board_assignments\(id\)\s+on delete restrict/u,
  );
  assert.match(
    statements[1] ?? "",
    /insert into board_assignment_documents/u,
  );
  assert.match(
    statements[1] ?? "",
    /where assignments\.source_material_key is not null/u,
  );
});

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
  assert.doesNotMatch(statements[0] ?? "", /delete from user_audit_events|foreign key/u);
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

test("production planning migration adds revisions and enables the economist position", async () => {
  const appliedIds = new Set([
    "001_dispatcher_submissions_mysql", "002_equipment_submission_dedupe_key",
    "003_equipment_report_revisions", "004_auth_users_sessions_accesses",
    "005_account_positions_and_navigation", "006_account_access_levels",
    "007_expand_non_admin_access_catalog", "008_remove_system_full_access_levels",
    "009_remove_account_access_levels", "010_dynamic_account_positions",
    "011_empty_worker_workspace", "012_split_manager_dispatcher_access",
    "013_protect_used_account_positions", "014_dispatcher_spreadsheet_import_source",
    "015_user_audit_events", "016_remove_departments", "017_single_organization_scope",
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

  assert.match(statements[0] ?? "", /create table if not exists production_plan_revisions/);
  assert.match(statements[1] ?? "", /'economist'.*'Экономист'.*'business\.production_plan'/);
  assert.match(statements[2] ?? "", /where lower\(trim\(display_name\)\) = 'экономист'/);
  assert.match(statements[2] ?? "", /business\.manage_production_plan/);
  assert.match(statements[3] ?? "", /where id = 'administrator'/);
  assert.match(statements[4] ?? "", /update account_accesses.*account_type = 'business_owner'/);
  assert.match(statements[5] ?? "", /delete sessions from auth_sessions sessions/);
});

test("category planning migration adds four-category storage and permanent brand catalogs", async () => {
  const appliedIds = new Set([
    "001_dispatcher_submissions_mysql", "002_equipment_submission_dedupe_key",
    "003_equipment_report_revisions", "004_auth_users_sessions_accesses",
    "005_account_positions_and_navigation", "006_account_access_levels",
    "007_expand_non_admin_access_catalog", "008_remove_system_full_access_levels",
    "009_remove_account_access_levels", "010_dynamic_account_positions",
    "011_empty_worker_workspace", "012_split_manager_dispatcher_access",
    "013_protect_used_account_positions", "014_dispatcher_spreadsheet_import_source",
    "015_user_audit_events", "016_remove_departments", "017_single_organization_scope",
    "018_production_plan_revisions",
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

  assert.match(statements[0] ?? "", /add column monthly_plans json null/);
  assert.match(statements[0] ?? "", /add column category_daily_plans json null/);
  assert.match(statements[0] ?? "", /modify column monthly_plan bigint unsigned null/);
  assert.match(statements[1] ?? "", /create table production_brand_labels/);
  assert.match(statements[1] ?? "", /unique key uq_production_brand_labels_category_normalized/);
  assert.match(statements[1] ?? "", /'product', 'unformed', 'chamotte'/);
});

test("production plan month lock migration serializes independent category saves", async () => {
  const appliedIds = new Set([
    "001_dispatcher_submissions_mysql", "002_equipment_submission_dedupe_key",
    "003_equipment_report_revisions", "004_auth_users_sessions_accesses",
    "005_account_positions_and_navigation", "006_account_access_levels",
    "007_expand_non_admin_access_catalog", "008_remove_system_full_access_levels",
    "009_remove_account_access_levels", "010_dynamic_account_positions",
    "011_empty_worker_workspace", "012_split_manager_dispatcher_access",
    "013_protect_used_account_positions", "014_dispatcher_spreadsheet_import_source",
    "015_user_audit_events", "016_remove_departments", "017_single_organization_scope",
    "018_production_plan_revisions", "019_production_category_plans_and_brands",
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
    /alter table production_plan_revisions add column revision_sequence bigint unsigned not null auto_increment/,
  );
  assert.match(
    statements[0] ?? "",
    /unique key uq_production_plan_revisions_sequence \( revision_sequence \)/,
  );
  assert.match(
    statements[1] ?? "",
    /create table if not exists production_plan_month_locks/,
  );
  assert.match(statements[1] ?? "", /plan_month char\(7\) not null primary key/);
});

test("refractory report migration stores independent shift revisions and grants tab capabilities", async () => {
  const appliedIds = new Set([
    "001_dispatcher_submissions_mysql", "002_equipment_submission_dedupe_key",
    "003_equipment_report_revisions", "004_auth_users_sessions_accesses",
    "005_account_positions_and_navigation", "006_account_access_levels",
    "007_expand_non_admin_access_catalog", "008_remove_system_full_access_levels",
    "009_remove_account_access_levels", "010_dynamic_account_positions",
    "011_empty_worker_workspace", "012_split_manager_dispatcher_access",
    "013_protect_used_account_positions", "014_dispatcher_spreadsheet_import_source",
    "015_user_audit_events", "016_remove_departments", "017_single_organization_scope",
    "018_production_plan_revisions", "019_production_category_plans_and_brands",
    "020_production_plan_month_locks",
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

  assert.match(statements[0] ?? "", /create table if not exists refractory_report_keys/);
  assert.match(statements[1] ?? "", /create table if not exists refractory_report_revisions/);
  assert.match(statements[1] ?? "", /unique key uq_refractory_report_revision/);
  assert.match(statements.join(" "), /business\.review_refractory_reports/);
  assert.match(statements.join(" "), /business\.submit_refractory_reports/);
});

test("shared Google Sheets nomenclature migration removes the database brand catalog", async () => {
  const appliedIds = new Set([
    "001_dispatcher_submissions_mysql", "002_equipment_submission_dedupe_key",
    "003_equipment_report_revisions", "004_auth_users_sessions_accesses",
    "005_account_positions_and_navigation", "006_account_access_levels",
    "007_expand_non_admin_access_catalog", "008_remove_system_full_access_levels",
    "009_remove_account_access_levels", "010_dynamic_account_positions",
    "011_empty_worker_workspace", "012_split_manager_dispatcher_access",
    "013_protect_used_account_positions", "014_dispatcher_spreadsheet_import_source",
    "015_user_audit_events", "016_remove_departments", "017_single_organization_scope",
    "018_production_plan_revisions", "019_production_category_plans_and_brands",
    "020_production_plan_month_locks", "021_refractory_report_revisions",
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

  assert.equal(statements[0], "drop table if exists production_brand_labels");
  assert.match(statements[1] ?? "", /insert into schema_migrations/u);
});

test("protected admin accounts migration adds the flag and protects original admin", async () => {
  const statements: string[] = [];
  const connection = {
    async beginTransaction() {},
    async commit() {},
    async rollback() {},
    release() {},
    async query(sql: string) {
      statements.push(normalizeSql(sql));
      return [[], []];
    },
  };
  const pool = {
    async query(sql: string, parameters?: unknown[]) {
      if (sql.includes("select id from schema_migrations")) {
        const id = String(parameters?.[0]);
        return [
          id === "035_protected_admin_accounts" ? [] : [{ id }],
          [],
        ];
      }
      return [[], []];
    },
    async getConnection() {
      return connection;
    },
  } as unknown as DatabasePool;

  await runMigrations(pool);

  assert.match(
    statements[0] ?? "",
    /alter table app_users add column is_admin_protected tinyint\(1\) not null default 0/u,
  );
  assert.match(
    statements[1] ?? "",
    /update app_users set is_admin_protected = 1 where lower\(trim\(login\)\) = 'admin'/u,
  );
});

test("sample registration location migration indexes the persistent options", async () => {
  const statements: string[] = [];
  const connection = {
    async beginTransaction() {},
    async commit() {},
    async rollback() {},
    release() {},
    async query(sql: string) {
      statements.push(normalizeSql(sql));
      return [[], []];
    },
  };
  const pool = {
    async query(sql: string, parameters?: unknown[]) {
      if (sql.includes("select id from schema_migrations")) {
        const id = String(parameters?.[0]);
        return [
          id === "036_sample_registration_sampling_location_index"
            ? []
            : [{ id }],
          [],
        ];
      }
      return [[], []];
    },
    async getConnection() {
      return connection;
    },
  } as unknown as DatabasePool;

  await runMigrations(pool);

  assert.match(
    statements[0] ?? "",
    /alter table laboratory_sample_registration_journal add key idx_laboratory_sample_registration_location \( sampling_location, created_at \)/u,
  );
});

test("sample registration water absorption migration preserves legacy records", async () => {
  const statements: string[] = [];
  const connection = {
    async beginTransaction() {},
    async commit() {},
    async rollback() {},
    release() {},
    async query(sql: string) {
      statements.push(normalizeSql(sql));
      return [[], []];
    },
  };
  const pool = {
    async query(sql: string, parameters?: unknown[]) {
      if (sql.includes("select id from schema_migrations")) {
        const id = String(parameters?.[0]);
        return [
          id === "037_sample_registration_water_absorption"
            ? []
            : [{ id }],
          [],
        ];
      }
      return [[], []];
    },
    async getConnection() {
      return connection;
    },
  } as unknown as DatabasePool;

  await runMigrations(pool);

  assert.match(
    statements[0] ?? "",
    /alter table laboratory_sample_registration_journal add column water_absorption varchar\(120\) null after sampling_location/u,
  );
});

test("sample registration correction migration stores immutable before and after snapshots", async () => {
  const statements: string[] = [];
  const connection = {
    async beginTransaction() {},
    async commit() {},
    async rollback() {},
    release() {},
    async query(sql: string) {
      statements.push(normalizeSql(sql));
      return [[], []];
    },
  };
  const pool = {
    async query(sql: string, parameters?: unknown[]) {
      if (sql.includes("select id from schema_migrations")) {
        const id = String(parameters?.[0]);
        return [
          id === "038_laboratory_sample_registration_revisions"
            ? []
            : [{ id }],
          [],
        ];
      }
      return [[], []];
    },
    async getConnection() {
      return connection;
    },
  } as unknown as DatabasePool;

  await runMigrations(pool);

  assert.match(
    statements[0] ?? "",
    /create table if not exists laboratory_sample_registration_revisions/u,
  );
  assert.match(statements[0] ?? "", /before_snapshot json not null/u);
  assert.match(statements[0] ?? "", /after_snapshot json not null/u);
  assert.match(
    statements[0] ?? "",
    /foreign key \(sample_registration_id\)[\s\S]+on delete restrict/u,
  );
});

test("laboratory journal correction migration stores kiln and chemical snapshots", async () => {
  const statements: string[] = [];
  const connection = {
    async beginTransaction() {},
    async commit() {},
    async rollback() {},
    release() {},
    async query(sql: string) {
      statements.push(normalizeSql(sql));
      return [[], []];
    },
  };
  const pool = {
    async query(sql: string, parameters?: unknown[]) {
      if (sql.includes("select id from schema_migrations")) {
        const id = String(parameters?.[0]);
        return [
          id === "039_laboratory_journal_corrections" ? [] : [{ id }],
          [],
        ];
      }
      return [[], []];
    },
    async getConnection() {
      return connection;
    },
  } as unknown as DatabasePool;

  await runMigrations(pool);

  assert.match(
    statements[0] ?? "",
    /create table if not exists rotary_kiln_2_firing_revisions/u,
  );
  assert.match(statements[0] ?? "", /before_snapshot json not null/u);
  assert.match(statements[0] ?? "", /after_snapshot json not null/u);
  assert.match(
    statements[0] ?? "",
    /foreign key \(firing_record_id\)[\s\S]+on delete restrict/u,
  );
  assert.match(
    statements[1] ?? "",
    /create table if not exists laboratory_chemical_analysis_revisions/u,
  );
  assert.match(
    statements[1] ?? "",
    /foreign key \(chemical_analysis_id\)[\s\S]+on delete restrict/u,
  );
});

test("chemical analysis batch-number migration makes the field optional", async () => {
  const statements: string[] = [];
  const connection = {
    async beginTransaction() {},
    async commit() {},
    async rollback() {},
    release() {},
    async query(sql: string) {
      statements.push(normalizeSql(sql));
      return [[], []];
    },
  };
  const pool = {
    async query(sql: string, parameters?: unknown[]) {
      if (sql.includes("select id from schema_migrations")) {
        const id = String(parameters?.[0]);
        return [
          id === "040_optional_chemical_analysis_batch_number" ? [] : [{ id }],
          [],
        ];
      }
      return [[], []];
    },
    async getConnection() {
      return connection;
    },
  } as unknown as DatabasePool;

  await runMigrations(pool);

  assert.equal(statements.length, 2);
  assert.match(
    statements[0] ?? "",
    /alter table laboratory_chemical_analysis_journal/u,
  );
  assert.match(
    statements[0] ?? "",
    /modify batch_number varchar\(120\) null/u,
  );
  assert.equal(
    statements[1],
    "insert into schema_migrations (id) values (?)",
  );
});

test("chemical analysis number migration adds an optional editable value", async () => {
  const statements: string[] = [];
  const connection = {
    async beginTransaction() {},
    async commit() {},
    async rollback() {},
    release() {},
    async query(sql: string) {
      statements.push(normalizeSql(sql));
      return [[], []];
    },
  };
  const pool = {
    async query(sql: string, parameters?: unknown[]) {
      if (sql.includes("select id from schema_migrations")) {
        const id = String(parameters?.[0]);
        return [
          id === "041_laboratory_chemical_analysis_number" ? [] : [{ id }],
          [],
        ];
      }
      return [[], []];
    },
    async getConnection() {
      return connection;
    },
  } as unknown as DatabasePool;

  await runMigrations(pool);

  assert.equal(statements.length, 2);
  assert.match(
    statements[0] ?? "",
    /add column laboratory_analysis_number varchar\(120\) null after sample_registration_id/u,
  );
  assert.equal(
    statements[1],
    "insert into schema_migrations (id) values (?)",
  );
});

test("unshaped product sample migration creates editable journal history", async () => {
  const statements: string[] = [];
  const connection = {
    async beginTransaction() {},
    async commit() {},
    async rollback() {},
    release() {},
    async query(sql: string) {
      statements.push(normalizeSql(sql));
      return [[], []];
    },
  };
  const pool = {
    async query(sql: string, parameters?: unknown[]) {
      if (sql.includes("select id from schema_migrations")) {
        const id = String(parameters?.[0]);
        return [
          id === "042_unshaped_product_sample_journal" ? [] : [{ id }],
          [],
        ];
      }
      return [[], []];
    },
    async getConnection() {
      return connection;
    },
  } as unknown as DatabasePool;

  await runMigrations(pool);

  assert.equal(statements.length, 3);
  assert.match(
    statements[0] ?? "",
    /create table if not exists laboratory_unshaped_product_sample_journal/u,
  );
  assert.match(statements[0] ?? "", /chemical_analysis_number varchar\(120\) null/u);
  assert.match(statements[0] ?? "", /suitability varchar\(20\) not null/u);
  assert.match(
    statements[1] ?? "",
    /create table if not exists laboratory_unshaped_product_sample_revisions/u,
  );
  assert.match(statements[1] ?? "", /before_snapshot json not null/u);
  assert.match(statements[1] ?? "", /after_snapshot json not null/u);
  assert.match(
    statements[1] ?? "",
    /foreign key \(unshaped_product_sample_id\)[\s\S]+on delete restrict/u,
  );
  assert.equal(
    statements[2],
    "insert into schema_migrations (id) values (?)",
  );
});

test("chemical analysis sample-link migration supports both source journals", async () => {
  const statements: string[] = [];
  const connection = {
    async beginTransaction() {},
    async commit() {},
    async rollback() {},
    release() {},
    async query(sql: string) {
      statements.push(normalizeSql(sql));
      return [[], []];
    },
  };
  const pool = {
    async query(sql: string, parameters?: unknown[]) {
      if (sql.includes("select id from schema_migrations")) {
        const id = String(parameters?.[0]);
        return [
          id === "043_chemical_analysis_sample_sources" ? [] : [{ id }],
          [],
        ];
      }
      return [[], []];
    },
    async getConnection() {
      return connection;
    },
  } as unknown as DatabasePool;

  await runMigrations(pool);

  assert.equal(statements.length, 4);
  assert.match(
    statements[0] ?? "",
    /modify sample_registration_id char\(36\) null/u,
  );
  assert.match(
    statements[0] ?? "",
    /add column unshaped_product_sample_id char\(36\) null/u,
  );
  assert.match(
    statements[0] ?? "",
    /foreign key \(unshaped_product_sample_id\)[\s\S]+laboratory_unshaped_product_sample_journal/u,
  );
  assert.match(
    statements[0] ?? "",
    /check \(\s*\(sample_registration_id is null\) <>\s*\(unshaped_product_sample_id is null\)\s*\)/u,
  );
  assert.match(
    statements[1] ?? "",
    /create table if not exists laboratory_chemical_analysis_sample_claims/u,
  );
  assert.match(
    statements[1] ?? "",
    /primary key \(sample_source, sample_id\)/u,
  );
  assert.match(
    statements[1] ?? "",
    /unique key uq_laboratory_chemical_analysis_claim_analysis \( chemical_analysis_id \)/u,
  );
  assert.match(
    statements[2] ?? "",
    /max\(sequence_id\) as sequence_id[\s\S]+group by sample_registration_id/u,
  );
  assert.match(statements[2] ?? "", /union all/u);
  assert.match(
    statements[2] ?? "",
    /on duplicate key update chemical_analysis_id = values\(chemical_analysis_id\)/u,
  );
  assert.equal(
    statements[3],
    "insert into schema_migrations (id) values (?)",
  );
});

test("raw material quality migration creates the editable refractory journal", async () => {
  const statements: string[] = [];
  const connection = {
    async beginTransaction() {},
    async commit() {},
    async rollback() {},
    release() {},
    async query(sql: string) {
      statements.push(normalizeSql(sql));
      return [[], []];
    },
  };
  const pool = {
    async query(sql: string, parameters?: unknown[]) {
      if (sql.includes("select id from schema_migrations")) {
        const id = String(parameters?.[0]);
        return [
          id === "044_laboratory_raw_material_quality_journal" ? [] : [{ id }],
          [],
        ];
      }
      return [[], []];
    },
    async getConnection() {
      return connection;
    },
  } as unknown as DatabasePool;

  await runMigrations(pool);

  assert.equal(statements.length, 3);
  assert.match(
    statements[0] ?? "",
    /create table if not exists laboratory_raw_material_quality_journal/u,
  );
  assert.match(statements[0] ?? "", /record_date date not null/u);
  assert.match(statements[0] ?? "", /recommendation_text text not null/u);
  assert.match(
    statements[0] ?? "",
    /check \(shift_code in \('day', 'night'\)\)/u,
  );
  assert.match(
    statements[0] ?? "",
    /check \(recommendation_recipient in \([\s\S]+'batch_operator'[\s\S]+\)\)/u,
  );
  assert.match(
    statements[1] ?? "",
    /create table if not exists laboratory_raw_material_quality_revisions/u,
  );
  assert.match(statements[1] ?? "", /before_snapshot json not null/u);
  assert.match(statements[1] ?? "", /after_snapshot json not null/u);
  assert.match(
    statements[1] ?? "",
    /foreign key \(raw_material_quality_id\)[\s\S]+on delete restrict/u,
  );
  assert.equal(
    statements[2],
    "insert into schema_migrations (id) values (?)",
  );
});

function normalizeSql(sql: string) {
  return sql.replace(/\s+/g, " ").trim();
}
