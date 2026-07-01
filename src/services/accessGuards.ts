import type { AccountCapability, ServerUserProfile } from "../contracts";

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
