import type { AccountType, ServerIssuedAccountAccess } from "./accounts";

export type ServerUserProfile = {
  userId: string;
  displayName: string;
  accountType: AccountType;
  activeAccess: ServerIssuedAccountAccess;
  receivedAt: string;
};
