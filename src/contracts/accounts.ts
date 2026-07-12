export type AccountType = "admin" | "business_owner" | "worker" | "dispatcher";

export const accountPositions = [
  "administrator",
  "business_owner",
  "board_chair",
  "board_member",
  "general_director",
  "worker",
  "dispatcher",
] as const;

export type AccountPosition = string;

export const accountNavigationItems = [
  "admin.account_preview",
  "admin.accounts",
  "admin.database",
  "business.overview",
  "business.dispatcher",
  "business.work",
  "business.dispatcher_form",
] as const;

export type AccountNavigationItem = (typeof accountNavigationItems)[number];

export const accountCapabilities = [
  "platform.manage_business_accounts",
  "platform.manage_users",
  "platform.manage_access",
  "platform.manage_analytics_database",
  "platform.manage_integrations",
  "platform.view_audit",
  "platform.view_logs",
  "platform.use_debug_tools",
  "business.view_all_statistics",
  "business.view_department_statistics",
  "business.view_notifications",
  "business.submit_forms",
  "business.submit_dispatcher_forms",
  "business.view_dispatcher_feed",
  "business.view_own_submissions",
] as const;

export type AccountCapability = (typeof accountCapabilities)[number];

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
  position: AccountPosition;
  positionDisplayName: string;
  displayName: string;
  scope: AccountScope;
  capabilities: AccountCapability[];
  navigationItems: AccountNavigationItem[];
  issuedAt: string;
  expiresAt?: string;
};

export type DevAccessOption = {
  position: AccountPosition;
  positionDisplayName: string;
  accountType: AccountType;
  navigationItems: AccountNavigationItem[];
  capabilities: AccountCapability[];
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
