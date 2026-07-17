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
  "admin.account_create",
  "admin.account_archive",
  "admin.account_login_enable",
  "admin.account_login_disable",
  "admin.account_password_reset",
  "admin.account_position_update",
  "admin.position_create",
  "admin.position_update",
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
] as const;

export type AuditTargetType = (typeof auditTargetTypes)[number];

export type AuditEventOutcome = "success" | "failure";
