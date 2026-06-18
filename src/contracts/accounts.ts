export type AccountType = "admin" | "business_owner" | "worker";

export type AccountCapability =
  | "platform.manage_business_accounts"
  | "platform.manage_users"
  | "platform.manage_access"
  | "platform.manage_analytics_database"
  | "platform.manage_integrations"
  | "platform.view_audit"
  | "business.view_all_statistics"
  | "business.view_department_statistics"
  | "business.view_notifications"
  | "business.submit_forms"
  | "business.view_own_submissions";

export type AccountScope =
  | {
      kind: "platform";
    }
  | {
      kind: "business";
      businessAccountId: string;
    }
  | {
      kind: "department";
      businessAccountId: string;
      departmentId: string;
    };

export type ServerIssuedAccountAccess = {
  accountId: string;
  accountType: AccountType;
  displayName: string;
  scope: AccountScope;
  capabilities: AccountCapability[];
  issuedAt: string;
  expiresAt?: string;
};

export type AccountAccessResponse = {
  access: ServerIssuedAccountAccess;
};

export type AccountAccessErrorCode =
  | "unauthenticated"
  | "account_disabled"
  | "business_unavailable"
  | "access_denied";

export type AccountAccessErrorResponse = {
  error: {
    code: AccountAccessErrorCode;
    message: string;
  };
};
