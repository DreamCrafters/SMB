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
  board_member: "business_owner",
  general_director: "business_owner",
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
  "business.dispatcher_form",
];

const allowedNavigationItemsByAccountType: Record<
  AccountType,
  AccountNavigationItem[]
> = {
  ...navigationItemsByAccountType,
  business_owner: [
    ...navigationItemsByAccountType.business_owner,
    "business.user_actions",
  ],
};

const capabilitiesByNavigationItem: Record<
  AccountNavigationItem,
  AccountCapability[]
> = {
  "admin.account_preview": [
    "platform.manage_business_accounts",
    "business.view_all_statistics",
    "business.view_department_statistics",
    "business.view_notifications",
    "business.submit_forms",
    "business.submit_dispatcher_forms",
    "business.view_dispatcher_feed",
    "business.view_own_submissions",
  ],
  "admin.accounts": ["platform.manage_users", "platform.manage_access"],
  "admin.database": ["platform.manage_analytics_database"],
  "admin.user_actions": ["platform.view_audit"],
  "business.overview": [
    "business.view_all_statistics",
    "business.view_department_statistics",
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
  "business.dispatcher_form": [
    "business.submit_dispatcher_forms",
    "business.view_dispatcher_feed",
  ],
};

export function resolveCapabilitiesForNavigation(
  navigationItems: AccountNavigationItem[],
) {
  return Array.from(
    new Set(navigationItems.flatMap((item) => capabilitiesByNavigationItem[item])),
  );
}

export function validateNavigationItemsForAccountType(
  accountType: AccountType,
  navigationItems: AccountNavigationItem[],
) {
  const allowedItems = allowedNavigationItemsByAccountType[accountType];
  const allowed = new Set(allowedItems);

  return accountType === "worker"
    ? navigationItems.length === 0
    : navigationItems.length > 0 && navigationItems.every((item) => allowed.has(item));
}
