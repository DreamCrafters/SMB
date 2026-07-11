import type { AccountCapability, AccountScope, AccountType } from "./accounts";

export type AdminAccountSummary = {
  accessId: string;
  userId: string;
  login: string;
  userDisplayName: string;
  userStatus: string;
  accessDisplayName: string;
  accountType: AccountType;
  scope: AccountScope;
  businessDisplayName: string | null;
  departmentDisplayName: string | null;
  capabilities: AccountCapability[];
  createdAt: string;
};

export type AdminAccountsListResponse = {
  accounts: AdminAccountSummary[];
};

export type CreateAdminAccountRequest = {
  login: string;
  password: string;
  displayName: string;
  accountType: AccountType;
  businessDisplayName?: string;
  departmentDisplayName?: string;
};

export type CreateAdminAccountResponse = {
  account: AdminAccountSummary;
};

export type ResetAdminAccountPasswordRequest = {
  login: string;
  password: string;
};
