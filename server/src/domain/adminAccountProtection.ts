import { hasProfileCapability, type ServerUserProfile } from "./auth.js";

export class ProtectedAccountMutationError extends Error {
  constructor() {
    super(
      "Защищённую учётную запись может изменить только корневой администратор.",
    );
    this.name = "ProtectedAccountMutationError";
  }
}

export class RootAdminMutationRequiredError extends Error {
  constructor() {
    super("Действие доступно только корневому администратору.");
    this.name = "RootAdminMutationRequiredError";
  }
}

export function canUseRootDevAccess(profile: ServerUserProfile, source: "auth" | "dev", enabled: boolean) {
  return enabled && source === "dev" && profile.activeAccess.accountType === "admin"
    && hasProfileCapability(profile, "platform.manage_access")
    && hasProfileCapability(profile, "platform.manage_navigation_order");
}

export function assertProtectedAccountMutationAllowed({
  isProtected,
  allowProtected,
}: {
  isProtected: boolean;
  allowProtected: boolean;
}) {
  if (isProtected && !allowProtected) {
    throw new ProtectedAccountMutationError();
  }
}
