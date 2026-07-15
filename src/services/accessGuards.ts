import type {
  AccountCapability,
  AccountNavigationItem,
  ServerUserProfile,
} from "../contracts";

export function hasCapability(
  profile: ServerUserProfile,
  capability: AccountCapability,
) {
  return profile.activeAccess.capabilities.includes(capability);
}

export function canRequestDispatcherForms(profile: ServerUserProfile) {
  return (
    hasCapability(profile, "business.submit_dispatcher_forms") ||
    hasCapability(profile, "business.view_dispatcher_feed")
  );
}

export function canSubmitDispatcherForms(profile: ServerUserProfile) {
  return hasCapability(profile, "business.submit_dispatcher_forms");
}

export function canManageAnalyticsDatabase(profile: ServerUserProfile) {
  return hasCapability(profile, "platform.manage_analytics_database");
}

export function canManageUsers(profile: ServerUserProfile) {
  return hasCapability(profile, "platform.manage_users");
}

export function resolveAllowedNavigationTab<Tab extends string>(
  requestedTab: Tab,
  navigationByTab: Readonly<Record<Tab, AccountNavigationItem>>,
  allowedNavigationItems: readonly AccountNavigationItem[],
): Tab | undefined {
  if (allowedNavigationItems.includes(navigationByTab[requestedTab])) {
    return requestedTab;
  }

  return (Object.keys(navigationByTab) as Tab[]).find((tab) =>
    allowedNavigationItems.includes(navigationByTab[tab]),
  );
}
