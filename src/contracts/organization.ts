import type { AccountType, ServerIssuedAccountAccess } from "./accounts";

export type OrganizationStructureMode = "classic" | "current";

export type BusinessAccountStatus = "active" | "suspended" | "archived";

export type BusinessAccountRef = {
  id: string;
  displayName: string;
  status: BusinessAccountStatus;
};

export type DepartmentRef = {
  id: string;
  businessAccountId: string;
  displayName: string;
  structureMode: OrganizationStructureMode;
  parentDepartmentId?: string;
};

export type ServerUserProfile = {
  userId: string;
  displayName: string;
  accountType: AccountType;
  activeAccess: ServerIssuedAccountAccess;
  businessAccounts: BusinessAccountRef[];
  departments: DepartmentRef[];
  organizationStructureMode: OrganizationStructureMode;
  receivedAt: string;
};
