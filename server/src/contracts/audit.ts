export const auditEventCategories = [
  "authentication",
  "navigation",
  "form_submission",
  "data_change",
  "administration",
] as const;

export type AuditEventCategory = (typeof auditEventCategories)[number];

export const auditEventActions = [
  "auth.login",
  "auth.logout",
  "view.screen",
  "form.submit",
  "data.update",
  "data.delete",
  "data.clear",
  "data.import_preview",
  "data.import",
  "production_plan.save",
  "production_brand.create",
  "refractory_report.submit",
  "refractory_report.approve",
  "refractory_report.reject",
  "laboratory_result.submit",
  "laboratory_bank.assign",
  "board_assignment.create",
  "board_assignment.update",
  "board_assignment.document_upload",
  "board_assignment.document_delete",
  "board_assignment.submit_for_review",
  "board_assignment.return_for_revision",
  "board_assignment.complete",
  "admin.account_create",
  "admin.account_archive",
  "admin.account_login_enable",
  "admin.account_login_disable",
  "admin.account_password_reset",
  "admin.account_position_update",
  "admin.position_create",
  "admin.position_update",
  "admin.position_order_update",
  "admin.position_delete",
] as const;

export type AuditEventAction = (typeof auditEventActions)[number];

export const auditTargetTypes = [
  "auth_session",
  "screen",
  "dispatcher_submission",
  "equipment_report",
  "database_section",
  "database_row",
  "dispatcher_import",
  "user_account",
  "account_position",
  "production_plan",
  "production_brand",
  "refractory_report",
  "laboratory_result",
  "laboratory_bank_assignment",
  "board_assignment",
] as const;

export type AuditTargetType = (typeof auditTargetTypes)[number];

export type AuditEventOutcome = "success" | "failure";
