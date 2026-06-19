export type AuditEventAction =
  | "view"
  | "create"
  | "update"
  | "submit"
  | "confirm"
  | "reject"
  | "correct"
  | "import"
  | "access_change";

export type AuditEventTargetType =
  | "business_account"
  | "user"
  | "department"
  | "data_entry"
  | "confirmation"
  | "integration"
  | "analytics";

export type AuditEventSummary = {
  id: string;
  action: AuditEventAction;
  targetType: AuditEventTargetType;
  actorAccountId: string;
  createdAt: string;
  businessAccountId?: string;
  targetId?: string;
  reason?: string;
};
