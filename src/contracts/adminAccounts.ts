import type {
  AccountCapability,
  BoardAssignmentAccess,
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
  email?: string;
  maxUserId?: string;
  userStatus: string;
  isProtected: boolean;
  isProtectedByAdminRights: boolean;
  accessDisplayName: string;
  accountType: AccountType;
  position: AccountPosition;
  positionDisplayName: string;
  scope: AccountScope;
  capabilities: AccountCapability[];
  navigationItems: AccountNavigationItem[];
  createdAt: string;
};

export type AdminAccountsListResponse = {
  accounts: AdminAccountSummary[];
  canManageProtectedAccounts: boolean;
};

export type CreateAdminAccountRequest = {
  login: string;
  password: string;
  displayName: string;
  email?: string;
  maxUserId?: string;
  position: AccountPosition;
};

export type UpdateAdminAccountContactsRequest = {
  userId: string;
  email: string;
  maxUserId: string;
};

export type UpdateAdminAccountContactsResponse = {
  account: AdminAccountSummary;
};

export type AdminPositionSummary = {
  id: AccountPosition;
  displayName: string;
  accountType: AccountType;
  navigationItems: AccountNavigationItem[];
  capabilities: AccountCapability[];
  boardAssignmentAccess: BoardAssignmentAccess;
  showOverviewVisitors: boolean;
  isProtected: boolean;
  hasAdminRights: boolean;
  usageCount: number;
  createdAt: string;
};

export type AdminPositionsListResponse = {
  positions: AdminPositionSummary[];
  canAssignAdminNavigation: boolean;
  canManageProtectedPositions: boolean;
};
export type SaveAdminPositionOrderRequest = { positionIds: AccountPosition[] };
export type SaveAdminPositionRequest = {
  displayName: string;
  navigationItems: AccountNavigationItem[];
  boardAssignmentAccess: BoardAssignmentAccess;
  showOverviewVisitors: boolean;
};
export type SaveAdminPositionResponse = { position: AdminPositionSummary };

export type SetAdminPositionNavigationAccessRequest = {
  navigationItem: AccountNavigationItem;
  positionIds: AccountPosition[];
  enabled: boolean;
};

export type SetAdminPositionProtectedRequest = {
  id: AccountPosition;
  isProtected: boolean;
};

export type SetAdminPositionProtectedResponse =
  SetAdminPositionProtectedRequest;

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

export type SetAdminAccountProtectedRequest = {
  userId: string;
  isProtected: boolean;
};

export type SetAdminAccountProtectedResponse = SetAdminAccountProtectedRequest;

export type SetAdminAccountPositionRequest = {
  accessId: string;
  position: AccountPosition;
};

export type SetAdminAccountPositionResponse = {
  account: AdminAccountSummary;
};
