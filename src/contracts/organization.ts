import type { AccountType, ServerIssuedAccountAccess } from "./accounts";

export type BusinessAccountStatus = "active" | "suspended" | "archived";

export type BusinessAccountRef = {
  id: string;
  displayName: string;
  status: BusinessAccountStatus;
};

export type ServerUserProfile = {
  userId: string;
  displayName: string;
  accountType: AccountType;
  activeAccess: ServerIssuedAccountAccess;
  businessAccounts: BusinessAccountRef[];
  receivedAt: string;
};
