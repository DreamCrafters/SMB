import type {
  AccountCapability,
  AccountNavigationItem,
  AccountPosition,
  AccountScope,
  AccountType,
} from "./accounts";

export type AdminAccountSummary = {
  accessId: string;
  userId: string;
  login: string;
  userDisplayName: string;
  userStatus: string;
  accessDisplayName: string;
  accountType: AccountType;
  position: AccountPosition;
  scope: AccountScope;
  businessDisplayName: string | null;
  departmentDisplayName: string | null;
  capabilities: AccountCapability[];
  navigationItems: AccountNavigationItem[];
  createdAt: string;
};

export type AdminAccountsListResponse = {
  accounts: AdminAccountSummary[];
};

export type CreateAdminAccountRequest = {
  login: string;
  password: string;
  displayName: string;
  position: AccountPosition;
  navigationItems: AccountNavigationItem[];
  businessDisplayName?: string;
  departmentDisplayName?: string;
};

export type SetAdminAccountNavigationRequest = {
  accessId: string;
  navigationItems: AccountNavigationItem[];
};

export type SetAdminAccountNavigationResponse = {
  account: AdminAccountSummary;
};

export type CreateAdminAccountResponse = {
  account: AdminAccountSummary;
};

export type ResetAdminAccountPasswordRequest = {
  login: string;
  password: string;
};

export type SetAdminAccountLoginEnabledRequest = {
  userId: string;
  isEnabled: boolean;
};

export type SetAdminAccountLoginEnabledResponse = {
  userId: string;
  userStatus: "active" | "suspended";
};
