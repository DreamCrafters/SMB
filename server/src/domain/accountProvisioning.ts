import type { AccountType } from "./auth.js";

export type AccountProvisioningScope = {
  scopeKind: "platform" | "organization";
};

export type AccountProvisioningScopeInput = {
  accountType: AccountType;
};

export function resolveAccountProvisioningScope(
  input: AccountProvisioningScopeInput,
): AccountProvisioningScope {
  if (input.accountType === "admin") {
    return {
      scopeKind: "platform",
    };
  }

  return {
    scopeKind: "organization",
  };
}
