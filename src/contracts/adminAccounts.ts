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
  accessLevelId: string | null;
  accessLevelDisplayName: string | null;
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
  accessLevelId?: string;
  businessDisplayName?: string;
  departmentDisplayName?: string;
};

export type SetAdminAccountNavigationRequest = {
  accessId: string;
  navigationItems: AccountNavigationItem[];
  accessLevelId?: string | null;
};

export type SetAdminAccountNavigationResponse = {
  account: AdminAccountSummary;
};

export type AdminAccessLevelSummary = {
  id: string;
  displayName: string;
  position: AccountPosition;
  accountType: AccountType;
  navigationItems: AccountNavigationItem[];
  capabilities: AccountCapability[];
  isSystem: boolean;
  createdAt: string;
};

export type AdminAccessLevelsListResponse = {
  accessLevels: AdminAccessLevelSummary[];
};

export type CreateAdminAccessLevelRequest = {
  displayName: string;
  position: AccountPosition;
  navigationItems: AccountNavigationItem[];
};

export type CreateAdminAccessLevelResponse = {
  accessLevel: AdminAccessLevelSummary;
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
