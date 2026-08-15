import assert from "node:assert/strict";
import test from "node:test";
import type { DatabasePool } from "./pool.js";
import { initialProductBrandNames, runMigrations } from "./migrations.js";

const migrationsAfterRefractoryWagonLifecycle = [
  "048_refractory_wagon_production_crew",
  "049_optional_rotary_kiln_2_measurements",
  "050_product_brand_journal",
  "051_protected_account_positions",
  "052_remove_stale_test_visitor_entry",
  "053_product_brand_merge_deletion",
  "054_user_notification_settings",
  "055_optional_notification_settings_navigation",
  "056_position_admin_rights",
  "057_notification_permission_user_channels",
  "058_navigation_order",
  "059_position_notification_permissions",
  "060_refractory_wagon_turnover",
  "061_refractory_wagon_inspections",
  "062_sample_registration_transmission",
  "063_formed_product_sample_journal",
  "064_verification_journal",
  "065_laboratory_raw_material_quality_measurement_tables",
  "066_refractory_wagon_turnover_cycles",
  "067_laboratory_green_product_quality_measurement_table",
  "068_overview_visitors_capability",
  "069_formed_product_sample_wagon_fields",
  "070_formed_product_sample_registration_link",
] as const;

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
    "045_laboratory_green_product_quality_journal",
    "046_refractory_wagon_journal",
    "047_refractory_wagon_lifecycle_dates",
    ...migrationsAfterRefractoryWagonLifecycle,
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
    "045_laboratory_green_product_quality_journal",
    "046_refractory_wagon_journal",
    "047_refractory_wagon_lifecycle_dates",
    ...migrationsAfterRefractoryWagonLifecycle,
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
    "045_laboratory_green_product_quality_journal",
    "046_refractory_wagon_journal",
    "047_refractory_wagon_lifecycle_dates",
    ...migrationsAfterRefractoryWagonLifecycle,
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
    "045_laboratory_green_product_quality_journal",
    "046_refractory_wagon_journal",
    "047_refractory_wagon_lifecycle_dates",
    ...migrationsAfterRefractoryWagonLifecycle,
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
    "045_laboratory_green_product_quality_journal",
    "046_refractory_wagon_journal",
    "047_refractory_wagon_lifecycle_dates",
    ...migrationsAfterRefractoryWagonLifecycle,
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
  assert.doesNotMatch(
    statements.slice(0, 14).join(" "),
    /delete from dispatcher_submissions/u,
  );
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

test("green product quality migration creates the wagon-linked editable journal", async () => {
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
          id === "045_laboratory_green_product_quality_journal" ? [] : [{ id }],
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

  assert.equal(statements.length, 5);
  assert.match(statements[0] ?? "", /create table if not exists refractory_wagons/u);
  assert.match(statements[0] ?? "", /unique key uq_refractory_wagons_number/u);
  assert.match(
    statements[1] ?? "",
    /create table if not exists laboratory_green_product_quality_journal/u,
  );
  assert.match(statements[1] ?? "", /check \(press_number in \('1', '2', '3', '4', '5', '6', '7', '8'\)\)/u);
  assert.match(
    statements[2] ?? "",
    /create table if not exists laboratory_green_product_quality_wagons/u,
  );
  assert.match(
    statements[2] ?? "",
    /foreign key \(wagon_id\)[\s\S]+references refractory_wagons \(id\)/u,
  );
  assert.match(
    statements[3] ?? "",
    /create table if not exists laboratory_green_product_quality_revisions/u,
  );
  assert.match(statements[3] ?? "", /before_snapshot json not null/u);
  assert.match(statements[3] ?? "", /after_snapshot json not null/u);
  assert.equal(
    statements[4],
    "insert into schema_migrations (id) values (?)",
  );
});

test("refractory wagon journal migration adds production fields to the shared registry", async () => {
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
          id === "046_refractory_wagon_journal" ? [] : [{ id }],
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
  assert.match(statements[0] ?? "", /alter table refractory_wagons/u);
  assert.match(statements[0] ?? "", /loading_date date null/u);
  assert.match(statements[0] ?? "", /product_brand varchar\(160\) null/u);
  assert.match(statements[0] ?? "", /raw_control_date date null/u);
  assert.match(statements[0] ?? "", /submitted_by_user_id varchar\(120\) null/u);
  assert.match(statements[0] ?? "", /idx_refractory_wagons_loading_date/u);
  assert.match(
    statements[1] ?? "",
    /create table if not exists refractory_wagon_revisions/u,
  );
  assert.match(statements[1] ?? "", /before_snapshot json not null/u);
  assert.match(
    statements[1] ?? "",
    /corrected_by_user_id varchar\(120\) not null/u,
  );
  assert.equal(
    statements[2],
    "insert into schema_migrations (id) values (?)",
  );
});

test("refractory wagon lifecycle migration derives firing and sorting from reports", async () => {
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
          id === "047_refractory_wagon_lifecycle_dates" ? [] : [{ id }],
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
    /create table if not exists refractory_wagon_lifecycle_events/u,
  );
  assert.match(statements[0] ?? "", /event_type varchar\(16\) not null/u);
  assert.match(statements[0] ?? "", /position int unsigned not null/u);
  assert.match(statements[0] ?? "", /event_date date not null/u);
  assert.match(statements[0] ?? "", /check \(event_type in \('firing', 'sorting'\)\)/u);
  assert.match(
    statements[0] ?? "",
    /foreign key \(wagon_id\)[\s\S]+references refractory_wagons \(id\)/u,
  );
  assert.match(
    statements[0] ?? "",
    /foreign key \(source_report_id\)[\s\S]+references refractory_report_revisions \(id\)/u,
  );
  assert.equal(
    statements[1],
    "insert into schema_migrations (id) values (?)",
  );
});

test("refractory wagon production crew migration preserves legacy rows", async () => {
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
          id === "048_refractory_wagon_production_crew" ? [] : [{ id }],
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
  assert.match(statements[0] ?? "", /alter table refractory_wagons/u);
  assert.match(statements[0] ?? "", /setter_name varchar\(120\) null/u);
  assert.match(statements[0] ?? "", /press_operator varchar\(120\) null/u);
  assert.equal(
    statements[1],
    "insert into schema_migrations (id) values (?)",
  );
});

test("task 58 migration makes selected kiln measurements nullable", async () => {
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
          id === "049_optional_rotary_kiln_2_measurements" ? [] : [{ id }],
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
    /alter table rotary_kiln_2_firing_journal/u,
  );
  assert.match(
    statements[0] ?? "",
    /modify temperature_in_field_chamber decimal\(14,4\) null/u,
  );
  assert.match(
    statements[0] ?? "",
    /modify sieve_pass_05 decimal\(14,4\) null/u,
  );
  assert.match(
    statements[0] ?? "",
    /modify kiln_load_buckets_per_hour decimal\(14,4\) null/u,
  );
  assert.equal(
    statements[1],
    "insert into schema_migrations (id) values (?)",
  );
});

test("task 65 migration creates the product brand journal and imports the sheet snapshot", async () => {
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
        return [id === "050_product_brand_journal" ? [] : [{ id }], []];
      }
      return [[], []];
    },
    async getConnection() {
      return connection;
    },
  } as unknown as DatabasePool;

  await runMigrations(pool);

  assert.equal(initialProductBrandNames.length, 119);
  assert.equal(
    new Set(initialProductBrandNames.map((name) => name.toLocaleLowerCase("ru-RU"))).size,
    119,
  );
  assert.equal(initialProductBrandNames[0], "Пропант");
  assert.equal(initialProductBrandNames.at(-1), "ШТ-1.3 √5");
  assert.equal(statements.length, 5);
  assert.match(statements[0] ?? "", /create table if not exists product_brands/u);
  assert.match(statements[0] ?? "", /unique key uq_product_brands_normalized_name/u);
  assert.match(statements[1] ?? "", /create table if not exists product_brand_revisions/u);
  assert.match(statements[2] ?? "", /insert into product_brands/u);
  assert.match(statements[2] ?? "", /system-google-sheets-brand-import/u);
  assert.match(statements[3] ?? "", /insert into user_audit_events/u);
  assert.match(statements[3] ?? "", /production_brand\.import/u);
  assert.equal(statements[4], "insert into schema_migrations (id) values (?)");
});

test("protected positions migration adds independent admin protection and protects administrator", async () => {
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
        return [id === "051_protected_account_positions" ? [] : [{ id }], []];
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
    /alter table account_positions add column is_admin_protected tinyint\(1\) not null default 0/u,
  );
  assert.match(
    statements[1] ?? "",
    /update account_positions set is_admin_protected = 1 where id = 'administrator'/u,
  );
  assert.equal(statements[2], "insert into schema_migrations (id) values (?)");
});

test("stale visitor test entry migration audits and removes only the exact unique record", async () => {
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
        return [id === "052_remove_stale_test_visitor_entry" ? [] : [{ id }], []];
      }
      return [[], []];
    },
    async getConnection() {
      return connection;
    },
  } as unknown as DatabasePool;

  await runMigrations(pool);

  assert.equal(statements.length, 3);
  assert.match(statements[0] ?? "", /insert into user_audit_events/u);
  assert.match(statements[0] ?? "", /'data\.delete'/u);
  assert.match(statements[0] ?? "", /04\.08\.2026 09:26/u);
  assert.match(statements[0] ?? "", /exits\.form_id = 'visitor_exit'/u);
  assert.match(statements[0] ?? "", /\$\.visitorEntryId/u);
  assert.match(statements[0] ?? "", /\$\.fio/u);
  assert.match(statements[0] ?? "", /\$\.organization/u);
  assert.match(statements[0] ?? "", /having count\(\*\) = 1/u);
  assert.match(
    statements[1] ?? "",
    /delete submissions from dispatcher_submissions submissions join user_audit_events events/u,
  );
  assert.match(statements[1] ?? "", /events\.action = 'data\.delete'/u);
  assert.match(statements[1] ?? "", /system-task-62-cleanup/u);
  assert.match(statements[1] ?? "", /04\.08\.2026 09:26/u);
  assert.equal(statements[2], "insert into schema_migrations (id) values (?)");
});

test("product brand merge migration keeps deleted records for immutable revisions", async () => {
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
        return [id === "053_product_brand_merge_deletion" ? [] : [{ id }], []];
      }
      return [[], []];
    },
    async getConnection() {
      return connection;
    },
  } as unknown as DatabasePool;

  await runMigrations(pool);

  assert.equal(statements.length, 2);
  assert.match(statements[0] ?? "", /add column deleted_at timestamp\(3\) null/u);
  assert.match(statements[0] ?? "", /add column merged_into_id char\(36\) null/u);
  assert.match(statements[0] ?? "", /idx_product_brands_active/u);
  assert.equal(statements[1], "insert into schema_migrations (id) values (?)");
});

test("notification settings migration adds contacts, per-user permissions and manager navigation", async () => {
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
        return [id === "054_user_notification_settings" ? [] : [{ id }], []];
      }
      return [[], []];
    },
    async getConnection() {
      return connection;
    },
  } as unknown as DatabasePool;

  await runMigrations(pool);

  assert.equal(statements.length, 8);
  assert.match(
    statements[0] ?? "",
    /alter table app_users add column email varchar\(320\) null/u,
  );
  assert.match(statements[0] ?? "", /add column max_user_id varchar\(120\) null/u);
  assert.match(
    statements[1] ?? "",
    /create table if not exists user_notification_settings/u,
  );
  assert.match(statements[1] ?? "", /user_id char\(36\) not null/u);
  assert.match(statements[1] ?? "", /primary key \(user_id, notification_type\)/u);
  assert.match(statements[1] ?? "", /foreign key \(user_id\) references app_users\(id\)/u);
  assert.match(
    statements[2] ?? "",
    /create table if not exists auth_session_notification_deliveries/u,
  );
  assert.match(statements[2] ?? "", /primary key \(session_id, delivery_key\)/u);
  assert.match(statements[2] ?? "", /references auth_sessions\(id\)/u);
  assert.match(statements[2] ?? "", /on delete cascade/u);
  assert.match(statements[3] ?? "", /business\.settings/u);
  assert.match(statements[3] ?? "", /business\.manage_notification_settings/u);
  assert.match(statements[3] ?? "", /account_type = 'business_owner'/u);
  assert.match(statements[4] ?? "", /where id = 'board_chair'/u);
  assert.match(statements[4] ?? "", /admin\.accounts/u);
  assert.match(statements[4] ?? "", /platform\.manage_users/u);
  assert.match(statements[5] ?? "", /update account_accesses accesses/u);
  assert.match(statements[6] ?? "", /delete sessions from auth_sessions/u);
  assert.equal(statements[7], "insert into schema_migrations (id) values (?)");
});

test("optional notification settings migration removes the forced manager navigation", async () => {
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
          id === "055_optional_notification_settings_navigation" ? [] : [{ id }],
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
  assert.match(statements[0] ?? "", /update account_positions/u);
  assert.match(statements[0] ?? "", /json_remove/u);
  assert.match(statements[0] ?? "", /business\.settings/u);
  assert.match(statements[0] ?? "", /business\.manage_notification_settings/u);
  assert.match(statements[1] ?? "", /update account_accesses accesses/u);
  assert.match(statements[2] ?? "", /delete sessions from auth_sessions/u);
  assert.equal(statements[3], "insert into schema_migrations (id) values (?)");
});

test("position admin rights migration grants only account management and refreshes sessions", async () => {
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
        return [id === "056_position_admin_rights" ? [] : [{ id }], []];
      }
      return [[], []];
    },
    async getConnection() {
      return connection;
    },
  } as unknown as DatabasePool;

  await runMigrations(pool);

  const migrationSql = statements.join(" ");
  assert.match(migrationSql, /delegated_administrator/u);
  assert.match(
    migrationSql,
    /accesses\.position_code = 'administrator'.*lower\(trim\(users\.login\)\) <> 'admin'/u,
  );
  assert.match(migrationSql, /account_type <> 'admin'/u);
  assert.match(migrationSql, /admin\.account_preview/u);
  assert.match(migrationSql, /admin\.database/u);
  assert.match(migrationSql, /admin\.user_actions/u);
  assert.match(migrationSql, /admin\.accounts/u);
  assert.match(migrationSql, /platform\.manage_users/u);
  assert.match(migrationSql, /platform\.manage_access/u);
  assert.match(migrationSql, /platform\.manage_analytics_database/u);
  assert.match(migrationSql, /update account_accesses accesses/u);
  assert.match(migrationSql, /delete sessions from auth_sessions/u);
  assert.equal(
    statements.at(-1),
    "insert into schema_migrations (id) values (?)",
  );
});

test("notification permission migration keeps visible rows and resets personal channels", async () => {
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
          id === "057_notification_permission_user_channels" ? [] : [{ id }],
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
  assert.match(statements[0] ?? "", /update user_notification_settings/u);
  assert.match(
    statements[0] ?? "",
    /admin_enabled = case when admin_enabled = 1 or email_enabled = 1 or max_enabled = 1 then 1 else 0 end/u,
  );
  assert.match(statements[0] ?? "", /email_enabled = 0/u);
  assert.match(statements[0] ?? "", /max_enabled = 0/u);
  assert.equal(
    statements[1],
    "insert into schema_migrations (id) values (?)",
  );
});

test("navigation order migration creates global storage and grants only the system administrator", async () => {
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
        return [id === "058_navigation_order" ? [] : [{ id }], []];
      }
      return [[], []];
    },
    async getConnection() {
      return connection;
    },
  } as unknown as DatabasePool;

  await runMigrations(pool);

  assert.equal(statements.length, 7);
  assert.match(statements[0] ?? "", /create table if not exists app_navigation_settings/u);
  assert.match(statements[1] ?? "", /insert into app_navigation_settings/u);
  assert.match(statements[1] ?? "", /admin\.navigation/u);
  assert.match(statements[2] ?? "", /admin\.navigation/u);
  assert.match(statements[2] ?? "", /id = 'administrator'/u);
  assert.match(statements[3] ?? "", /platform\.manage_navigation_order/u);
  assert.match(statements[4] ?? "", /update account_accesses accesses/u);
  assert.match(statements[5] ?? "", /delete sessions from auth_sessions/u);
  assert.equal(statements[6], "insert into schema_migrations (id) values (?)");
});

test("position notification migration moves permissions from users to positions", async () => {
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
          id === "059_position_notification_permissions" ? [] : [{ id }],
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

  assert.equal(statements.length, 7);
  assert.match(
    statements[0] ?? "",
    /create table if not exists position_notification_permissions/u,
  );
  assert.match(
    statements[0] ?? "",
    /primary key \(position_code, notification_type\)/u,
  );
  assert.match(
    statements[0] ?? "",
    /foreign key \(position_code\) references account_positions\(id\) on delete cascade/u,
  );
  assert.match(
    statements[1] ?? "",
    /insert into position_notification_permissions/u,
  );
  assert.match(statements[1] ?? "", /where settings\.admin_enabled = 1/u);
  assert.match(
    statements[1] ?? "",
    /group by accesses\.position_code, settings\.notification_type/u,
  );
  assert.match(
    statements[2] ?? "",
    /drop index idx_user_notification_delivery/u,
  );
  assert.match(
    statements[3] ?? "",
    /alter table user_notification_settings drop column admin_enabled/u,
  );
  assert.match(
    statements[4] ?? "",
    /add key idx_user_notification_delivery \( notification_type, email_enabled, max_enabled \)/u,
  );
  assert.match(statements[5] ?? "", /update user_notification_settings settings/u);
  assert.match(statements[5] ?? "", /where permissions\.position_code is null/u);
  assert.equal(statements[6], "insert into schema_migrations (id) values (?)");
});

test("wagon turnover migration adds the new columns to legacy wagon rows", async () => {
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
        return [id === "060_refractory_wagon_turnover" ? [] : [{ id }], []];
      }
      return [[], []];
    },
    async getConnection() {
      return connection;
    },
  } as unknown as DatabasePool;

  await runMigrations(pool);

  assert.equal(statements.length, 2);
  assert.match(statements[0] ?? "", /alter table refractory_wagons/u);
  assert.match(statements[0] ?? "", /press_date date null after product_brand/u);
  assert.match(statements[0] ?? "", /piece_count int unsigned null/u);
  assert.match(statements[0] ?? "", /firing_operator varchar\(120\) null/u);
  assert.match(statements[0] ?? "", /sorter_name varchar\(120\) null/u);
  assert.match(
    statements[0] ?? "",
    /post_firing_condition varchar\(255\) null/u,
  );
  assert.match(statements[0] ?? "", /service_approval_date date null/u);
  assert.equal(statements[1], "insert into schema_migrations (id) values (?)");
});

test("wagon inspection migration stores verdicts and wagon fields of the lab journal", async () => {
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
        return [id === "061_refractory_wagon_inspections" ? [] : [{ id }], []];
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
    /create table if not exists refractory_wagon_inspections/u,
  );
  assert.match(
    statements[0] ?? "",
    /check \(condition_value in \('Можно эксплуатировать', 'В ремонт'\)\)/u,
  );
  assert.match(
    statements[0] ?? "",
    /foreign key \(wagon_id\) references refractory_wagons \(id\) on delete restrict/u,
  );
  assert.match(
    statements[1] ?? "",
    /alter table laboratory_green_product_quality_journal/u,
  );
  assert.match(statements[1] ?? "", /press_date date null/u);
  assert.match(statements[1] ?? "", /loading_date date null/u);
  assert.match(statements[1] ?? "", /piece_count int unsigned null/u);
  assert.equal(statements[2], "insert into schema_migrations (id) values (?)");
});

test("sample registration transmission migrations add the transmission columns and the two new journals", async () => {
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
  const targetIds = new Set([
    "062_sample_registration_transmission",
    "063_formed_product_sample_journal",
    "064_verification_journal",
  ]);
  const pool = {
    async query(sql: string, parameters?: unknown[]) {
      if (sql.includes("select id from schema_migrations")) {
        const id = String(parameters?.[0]);
        return [targetIds.has(id) ? [] : [{ id }], []];
      }
      return [[], []];
    },
    async getConnection() {
      return connection;
    },
  } as unknown as DatabasePool;

  await runMigrations(pool);

  assert.equal(statements.length, 9);
  assert.match(
    statements[0] ?? "",
    /alter table laboratory_sample_registration_journal/u,
  );
  assert.match(statements[0] ?? "", /add column transmit_to_journal/u);
  assert.match(statements[0] ?? "", /add column transmitted_record_id/u);
  assert.match(
    statements[0] ?? "",
    /transmit_to_journal in \(\s*'unshaped_product_sample',\s*'formed_product_sample',\s*'verification'\s*\)/u,
  );
  assert.match(
    statements[1] ?? "",
    /alter table laboratory_unshaped_product_sample_journal/u,
  );
  assert.match(
    statements[1] ?? "",
    /add column source_sample_registration_id char\(36\) null/u,
  );
  assert.equal(statements[2], "insert into schema_migrations (id) values (?)");
  assert.match(
    statements[3] ?? "",
    /create table if not exists laboratory_formed_product_sample_journal/u,
  );
  assert.match(
    statements[3] ?? "",
    /foreign key \(source_sample_registration_id\)\s+references laboratory_sample_registration_journal \(id\)\s+on delete set null/u,
  );
  assert.match(
    statements[4] ?? "",
    /create table if not exists laboratory_formed_product_sample_revisions/u,
  );
  assert.equal(statements[5], "insert into schema_migrations (id) values (?)");
  assert.match(
    statements[6] ?? "",
    /create table if not exists laboratory_verification_journal/u,
  );
  assert.match(
    statements[7] ?? "",
    /create table if not exists laboratory_verification_revisions/u,
  );
  assert.equal(statements[8], "insert into schema_migrations (id) values (?)");
});

test("raw material quality measurement tables migration adds json rows and backfills them", async () => {
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
          id === "065_laboratory_raw_material_quality_measurement_tables"
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

  assert.equal(statements.length, 9);
  assert.match(statements[0] ?? "", /add column clay_measurements json null/u);
  assert.match(statements[0] ?? "", /add column temper_measurements json null/u);
  assert.match(statements[0] ?? "", /add column slip_measurements json null/u);
  assert.match(statements[0] ?? "", /add column runner_measurements json null/u);
  assert.match(statements[1] ?? "", /set clay_measurements = json_array/u);
  assert.match(statements[1] ?? "", /'clayBrand', clay_brand/u);
  assert.match(statements[2] ?? "", /set temper_measurements = json_array/u);
  assert.match(statements[2] ?? "", /'sieveResidue1', temper_sieve_residue_1/u);
  assert.match(statements[3] ?? "", /set slip_measurements = json_array/u);
  assert.match(statements[3] ?? "", /'mixerNumber', slip_mixer_number/u);
  assert.match(statements[4] ?? "", /set runner_measurements = json_array/u);
  assert.match(statements[4] ?? "", /'isReserve', false/u);
  assert.match(statements[5] ?? "", /modify column clay_brand varchar\(120\) null/u);
  assert.match(
    statements[5] ?? "",
    /modify column recommendation_text text null/u,
  );
  assert.match(
    statements[6] ?? "",
    /drop constraint chk_laboratory_raw_material_quality_shift/u,
  );
  assert.match(
    statements[7] ?? "",
    /add constraint chk_laboratory_raw_material_quality_shift/u,
  );
  assert.match(
    statements[7] ?? "",
    /check \(shift_code in \('day', 'night', 'day_short'\)\)/u,
  );
  assert.equal(statements[8], "insert into schema_migrations (id) values (?)");
});

test("wagon turnover cycles migration splits the catalog from per-cycle rows", async () => {
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
          id === "066_refractory_wagon_turnover_cycles" ? [] : [{ id }],
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

  assert.equal(statements.length, 6);
  assert.match(
    statements[0] ?? "",
    /create table if not exists refractory_wagon_catalog/u,
  );
  assert.match(
    statements[0] ?? "",
    /unique key uq_refractory_wagon_catalog_number \(wagon_number\)/u,
  );
  assert.match(
    statements[1] ?? "",
    /insert into refractory_wagon_catalog/u,
  );
  assert.match(statements[1] ?? "", /from refractory_wagons/u);
  assert.match(
    statements[2] ?? "",
    /add column catalog_wagon_id char\(36\) null after id/u,
  );
  assert.match(
    statements[3] ?? "",
    /update refractory_wagons set catalog_wagon_id = id/u,
  );
  assert.match(
    statements[4] ?? "",
    /drop index uq_refractory_wagons_number/u,
  );
  assert.match(
    statements[4] ?? "",
    /add key idx_refractory_wagons_number \(wagon_number, sequence_id\)/u,
  );
  assert.match(
    statements[4] ?? "",
    /foreign key \(catalog_wagon_id\) references refractory_wagon_catalog \(id\)/u,
  );
  assert.equal(statements[5], "insert into schema_migrations (id) values (?)");
});

test("green product quality measurement table migration adds json rows and backfills them", async () => {
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
          id === "067_laboratory_green_product_quality_measurement_table"
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

  assert.equal(statements.length, 4);
  assert.match(statements[0] ?? "", /add column measurements json null/u);
  assert.match(statements[1] ?? "", /set measurements = json_array/u);
  assert.match(statements[1] ?? "", /'lengthFirst', length_first/u);
  assert.match(statements[1] ?? "", /'density', density_value/u);
  assert.match(statements[2] ?? "", /modify column length_first varchar\(40\) null/u);
  assert.match(statements[2] ?? "", /modify column density_value varchar\(40\) null/u);
  assert.equal(statements[3], "insert into schema_migrations (id) values (?)");
});

test("overview visitors capability migration grants it alongside dispatcher feed and syncs accesses", async () => {
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
        return [id === "068_overview_visitors_capability" ? [] : [{ id }], []];
      }
      return [[], []];
    },
    async getConnection() {
      return connection;
    },
  } as unknown as DatabasePool;

  await runMigrations(pool);

  assert.equal(statements.length, 4);
  assert.match(statements[0] ?? "", /update account_positions/u);
  assert.match(
    statements[0] ?? "",
    /json_array_append\( capabilities, '\$', 'business\.view_overview_visitors' \)/u,
  );
  assert.match(
    statements[0] ?? "",
    /where json_contains\(capabilities, json_quote\('business\.view_dispatcher_feed'\)\)/u,
  );
  assert.match(
    statements[0] ?? "",
    /and not json_contains\( capabilities, json_quote\('business\.view_overview_visitors'\) \)/u,
  );
  assert.match(statements[1] ?? "", /update account_accesses accesses/u);
  assert.match(
    statements[1] ?? "",
    /set accesses\.capabilities = positions\.capabilities/u,
  );
  assert.match(statements[2] ?? "", /delete sessions/u);
  assert.match(statements[2] ?? "", /from auth_sessions sessions/u);
  assert.equal(statements[3], "insert into schema_migrations (id) values (?)");
});

test("formed product sample wagon fields migration drops the sample code and transmission target", async () => {
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
          id === "069_formed_product_sample_wagon_fields" ? [] : [{ id }],
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

  assert.equal(statements.length, 5);
  assert.match(
    statements[0] ?? "",
    /drop foreign key if exists fk_laboratory_formed_product_sample_source/u,
  );
  assert.match(
    statements[0] ?? "",
    /drop key if exists idx_laboratory_formed_product_sample_code/u,
  );
  assert.match(statements[0] ?? "", /drop column if exists sample_code/u);
  assert.match(
    statements[0] ?? "",
    /drop column if exists source_sample_registration_id/u,
  );
  assert.match(
    statements[0] ?? "",
    /add column if not exists wagon_number varchar\(120\) null after sorting_date/u,
  );
  assert.match(
    statements[0] ?? "",
    /add column if not exists molding_date date null after product_brand/u,
  );
  assert.match(
    statements[0] ?? "",
    /add key if not exists idx_laboratory_formed_product_sample_wagon \( wagon_number \)/u,
  );
  assert.match(
    statements[1] ?? "",
    /update laboratory_sample_registration_journal/u,
  );
  assert.match(statements[1] ?? "", /set transmit_to_journal = null/u);
  assert.match(
    statements[1] ?? "",
    /where transmit_to_journal = 'formed_product_sample'/u,
  );
  assert.match(
    statements[2] ?? "",
    /drop constraint if exists chk_laboratory_sample_registration_transmit_target/u,
  );
  assert.match(
    statements[3] ?? "",
    /add constraint chk_laboratory_sample_registration_transmit_target/u,
  );
  assert.match(
    statements[3] ?? "",
    /transmit_to_journal in \( 'unshaped_product_sample', 'verification' \)/u,
  );
  assert.equal(statements[4], "insert into schema_migrations (id) values (?)");
});

test("formed product sample registration link migration restores the sample code and transmission target", async () => {
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
          id === "070_formed_product_sample_registration_link" ? [] : [{ id }],
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

  assert.equal(statements.length, 6);
  assert.match(
    statements[0] ?? "",
    /add column if not exists sample_code varchar\(120\) null after wagon_number/u,
  );
  assert.match(
    statements[0] ?? "",
    /add column if not exists source_sample_registration_id char\(36\) null after molding_date/u,
  );
  assert.match(
    statements[1] ?? "",
    /drop foreign key if exists fk_laboratory_formed_product_sample_source/u,
  );
  assert.match(
    statements[2] ?? "",
    /add constraint fk_laboratory_formed_product_sample_source/u,
  );
  assert.match(
    statements[2] ?? "",
    /foreign key \(source_sample_registration_id\) references laboratory_sample_registration_journal \(id\) on delete set null/u,
  );
  assert.match(
    statements[3] ?? "",
    /drop constraint if exists chk_laboratory_sample_registration_transmit_target/u,
  );
  assert.match(
    statements[4] ?? "",
    /add constraint chk_laboratory_sample_registration_transmit_target/u,
  );
  assert.match(
    statements[4] ?? "",
    /transmit_to_journal in \( 'unshaped_product_sample', 'formed_product_sample', 'verification' \)/u,
  );
  assert.equal(statements[5], "insert into schema_migrations (id) values (?)");
});

function normalizeSql(sql: string) {
  return sql.replace(/\s+/g, " ").trim();
}
