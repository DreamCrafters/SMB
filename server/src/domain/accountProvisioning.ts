import type { AccountType } from "./auth.js";

export const primaryBusinessAccount = {
  id: "prod-business",
  displayName: "Основной бизнес",
} as const;

export const defaultDispatcherDepartment = {
  id: "dispatch",
  displayName: "Диспетчерская",
} as const;

export type AccountProvisioningScope = {
  scopeKind: "platform" | "business" | "department";
  businessAccount?: {
    id: string;
    displayName: string;
  };
  department?: {
    id: string;
    displayName: string;
  };
};

export type AccountProvisioningScopeInput = {
  accountType: AccountType;
  displayName: string;
  businessAccountId?: string;
  businessDisplayName?: string;
  departmentId?: string;
  departmentDisplayName?: string;
};

export function resolveAccountProvisioningScope(
  input: AccountProvisioningScopeInput,
  createId: () => string,
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

  if (input.accountType === "business_owner") {
    return {
      scopeKind: "business",
      businessAccount,
    };
  }

  const usesDefaultDispatcherDepartment =
    input.accountType === "dispatcher" &&
    businessAccountId === primaryBusinessAccount.id;
  const departmentId =
    input.departmentId ??
    (usesDefaultDispatcherDepartment
      ? defaultDispatcherDepartment.id
      : createId());

  return {
    scopeKind: "department",
    businessAccount,
    department: {
      id: departmentId,
      displayName:
        input.departmentDisplayName ??
        (input.accountType === "dispatcher"
          ? defaultDispatcherDepartment.displayName
          : input.displayName),
    },
  };
}
