import type {
  AccountCapability,
  AccountNavigationItem,
  AccountPosition,
  AccountType,
} from "./auth.js";

export const accountTypeByPosition: Record<AccountPosition, AccountType> = {
  administrator: "admin",
  business_owner: "business_owner",
  board_chair: "business_owner",
  board_deputy_chair: "business_owner",
  board_assignment_reviewer: "business_owner",
  board_member: "business_owner",
  general_director: "business_owner",
  economist: "business_owner",
  laboratory_assistant: "business_owner",
  worker: "worker",
  dispatcher: "dispatcher",
};

export const defaultPositionByAccountType: Record<AccountType, AccountPosition> = {
  admin: "administrator",
  business_owner: "business_owner",
  worker: "worker",
  dispatcher: "dispatcher",
};

export const navigationItemsByAccountType: Record<
  AccountType,
  AccountNavigationItem[]
> = {
  admin: [
    "admin.account_preview",
    "admin.accounts",
    "admin.database",
    "admin.user_actions",
  ],
  business_owner: ["business.overview", "business.dispatcher", "business.work"],
  worker: [],
  dispatcher: ["business.dispatcher_form"],
};

export const nonAdminNavigationItems: AccountNavigationItem[] = [
  "business.overview",
  "business.dispatcher",
  "business.work",
  "business.user_actions",
  "business.production_plan",
  "business.refractory_shop",
  "business.laboratory_results",
  "business.board_assignments",
  "business.dispatcher_form",
];

const capabilitiesByNavigationItem: Record<
  AccountNavigationItem,
  AccountCapability[]
> = {
  "admin.account_preview": [
    "business.view_all_statistics",
    "business.view_notifications",
    "business.submit_forms",
    "business.submit_dispatcher_forms",
    "business.view_dispatcher_feed",
    "business.view_own_submissions",
    "business.manage_production_plan",
    "business.submit_refractory_reports",
    "business.review_refractory_reports",
    "business.manage_laboratory_results",
    "business.view_board_assignments",
  ],
  "admin.accounts": ["platform.manage_users", "platform.manage_access"],
  "admin.database": ["platform.manage_analytics_database"],
  "admin.user_actions": ["platform.view_audit"],
  "business.overview": [
    "business.view_all_statistics",
    "business.view_notifications",
    "business.view_dispatcher_feed",
  ],
  "business.dispatcher": ["business.view_dispatcher_feed"],
  "business.work": [
    "business.submit_forms",
    "business.view_notifications",
    "business.view_own_submissions",
  ],
  "business.user_actions": ["business.view_user_actions"],
  "business.production_plan": ["business.manage_production_plan"],
  "business.refractory_shop": ["business.submit_refractory_reports"],
  "business.laboratory_results": ["business.manage_laboratory_results"],
  "business.board_assignments": ["business.view_board_assignments"],
  "business.dispatcher_form": [
    "business.submit_dispatcher_forms",
    "business.view_dispatcher_feed",
    "business.review_refractory_reports",
  ],
};

export function resolveCapabilitiesForNavigation(
  navigationItems: AccountNavigationItem[],
) {
  return Array.from(
    new Set(navigationItems.flatMap((item) => capabilitiesByNavigationItem[item])),
  );
}

export function resolveCapabilitiesForPosition(
  position: AccountPosition,
  navigationItems: AccountNavigationItem[],
) {
  const capabilities = resolveCapabilitiesForNavigation(navigationItems);

  if (!navigationItems.includes("business.board_assignments")) {
    return capabilities;
  }

  const boardCapabilities: AccountCapability[] =
    position === "general_director"
      ? ["business.execute_board_assignments"]
      : position === "board_chair" ||
          position === "board_deputy_chair" ||
          position === "board_assignment_reviewer"
        ? [
            "business.create_board_assignments",
            "business.review_board_assignments",
          ]
        : position === "board_member"
          ? ["business.create_board_assignments"]
          : [];

  return Array.from(new Set([...capabilities, ...boardCapabilities]));
}

export function validateNavigationItemsForAccountType(
  accountType: AccountType,
  navigationItems: AccountNavigationItem[],
) {
  if (accountType !== "admin") {
    return validateNonAdminNavigationItems(navigationItems);
  }

  const allowed = new Set(navigationItemsByAccountType.admin);

  return navigationItems.length > 0 && navigationItems.every((item) => allowed.has(item));
}

export function validateNonAdminNavigationItems(
  navigationItems: AccountNavigationItem[],
) {
  const allowed = new Set(nonAdminNavigationItems);

  return navigationItems.length > 0 && navigationItems.every((item) => allowed.has(item));
}
