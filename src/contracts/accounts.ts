export type AccountType = "admin" | "business_owner" | "worker" | "dispatcher";

export const accountPositions = [
  "administrator",
  "business_owner",
  "board_chair",
  "board_deputy_chair",
  "board_assignment_reviewer",
  "board_member",
  "general_director",
  "economist",
  "laboratory_assistant",
  "worker",
  "dispatcher",
] as const;

export type AccountPosition = string;

export const accountNavigationItems = [
  "admin.account_preview",
  "admin.accounts",
  "admin.database",
  "admin.user_actions",
  "business.overview",
  "business.dispatcher",
  "business.work",
  "business.user_actions",
  "business.production_plan",
  "business.refractory_shop",
  "business.laboratory_results",
  "business.laboratory_review",
  "business.board_assignments",
  "business.settings",
  "business.dispatcher_form",
] as const;

export type AccountNavigationItem = (typeof accountNavigationItems)[number];

export const accountCapabilities = [
  "platform.manage_users",
  "platform.manage_access",
  "platform.manage_analytics_database",
  "platform.manage_integrations",
  "platform.view_audit",
  "platform.view_logs",
  "platform.use_debug_tools",
  "business.view_all_statistics",
  "business.view_notifications",
  "business.submit_forms",
  "business.submit_dispatcher_forms",
  "business.view_dispatcher_feed",
  "business.view_own_submissions",
  "business.view_user_actions",
  "business.manage_production_plan",
  "business.submit_refractory_reports",
  "business.review_refractory_reports",
  "business.manage_laboratory_results",
  "business.view_laboratory_results",
  "business.view_board_assignments",
  "business.create_board_assignments",
  "business.execute_board_assignments",
  "business.review_board_assignments",
  "business.manage_notification_settings",
] as const;

export type AccountCapability = (typeof accountCapabilities)[number];

export const boardAssignmentAccessLevels = [
  "none",
  "view",
  "create",
  "execute",
  "review",
] as const;

export type BoardAssignmentAccess =
  (typeof boardAssignmentAccessLevels)[number];

export type AccountScope =
  | {
      kind: "platform";
    }
  | {
      kind: "organization";
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
  | "access_denied";

export type AccountAccessErrorResponse = {
  error: {
    code: AccountAccessErrorCode;
    message: string;
  };
};
