import type { AccountType } from "./auth.js";

export const primaryBusinessAccount = {
  id: "prod-business",
  displayName: "Основной бизнес",
} as const;

export type AccountProvisioningScope = {
  scopeKind: "platform" | "business";
  businessAccount?: {
    id: string;
    displayName: string;
  };
};

export type AccountProvisioningScopeInput = {
  accountType: AccountType;
  displayName: string;
  businessAccountId?: string;
  businessDisplayName?: string;
};

export function resolveAccountProvisioningScope(
  input: AccountProvisioningScopeInput,
): AccountProvisioningScope {
  if (input.accountType === "admin") {
    return {
      scopeKind: "platform",
    };
  }

  const businessAccountId =
    input.businessAccountId ?? primaryBusinessAccount.id;
  const businessAccount = {
    id: businessAccountId,
    displayName:
      input.businessDisplayName ??
      (businessAccountId === primaryBusinessAccount.id
        ? primaryBusinessAccount.displayName
        : businessAccountId),
  };

  return {
    scopeKind: "business",
    businessAccount,
  };
}
