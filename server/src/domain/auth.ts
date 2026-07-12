import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

export type AccountType = "admin" | "business_owner" | "worker" | "dispatcher";

export const accountPositions = [
  "administrator",
  "business_owner",
  "board_chair",
  "board_member",
  "general_director",
  "worker",
  "dispatcher",
] as const;

export type AccountPosition = string;

export const accountNavigationItems = [
  "admin.account_preview",
  "admin.accounts",
  "admin.database",
  "business.overview",
  "business.dispatcher",
  "business.work",
  "business.dispatcher_form",
] as const;

export type AccountNavigationItem = (typeof accountNavigationItems)[number];

export const accountCapabilities = [
  "platform.manage_business_accounts",
  "platform.manage_users",
  "platform.manage_access",
  "platform.manage_analytics_database",
  "platform.manage_integrations",
  "platform.view_audit",
  "platform.view_logs",
  "platform.use_debug_tools",
  "business.view_all_statistics",
  "business.view_department_statistics",
  "business.view_notifications",
  "business.submit_forms",
  "business.submit_dispatcher_forms",
  "business.view_dispatcher_feed",
  "business.view_own_submissions",
] as const;

export type AccountCapability = (typeof accountCapabilities)[number];

export type AccountScope =
  | {
      kind: "platform";
    }
  | {
      kind: "business";
      businessAccountId: string;
    }
  | {
      kind: "department";
      businessAccountId: string;
      departmentId: string;
    };

export type ServerIssuedAccountAccess = {
  accountId: string;
  accountType: AccountType;
  position: AccountPosition;
  positionDisplayName: string;
  displayName: string;
  scope: AccountScope;
  capabilities: AccountCapability[];
  navigationItems: AccountNavigationItem[];
  issuedAt: string;
  expiresAt?: string;
};

export type BusinessAccountRef = {
  id: string;
  displayName: string;
  status: "active" | "suspended" | "archived";
};

export type DepartmentRef = {
  id: string;
  businessAccountId: string;
  displayName: string;
  structureMode: "classic" | "current";
  parentDepartmentId?: string;
};

export type ServerUserProfile = {
  userId: string;
  displayName: string;
  accountType: AccountType;
  activeAccess: ServerIssuedAccountAccess;
  businessAccounts: BusinessAccountRef[];
  departments: DepartmentRef[];
  organizationStructureMode: "classic" | "current";
  receivedAt: string;
};

export type AuthenticatedSession = {
  sessionId: string;
  expiresAt: string;
  profile: ServerUserProfile;
};

export type AuthLoginResult =
  | {
      ok: true;
      session: AuthenticatedSession;
    }
  | {
      ok: false;
    };

export type AuthSessionService = {
  login: (credentials: {
    login: string;
    password: string;
  }) => Promise<AuthLoginResult>;
  readSession: (sessionId: string) => Promise<AuthenticatedSession | undefined>;
  deleteSession: (sessionId: string) => Promise<void>;
};

export const defaultCapabilitiesByAccountType: Record<
  AccountType,
  AccountCapability[]
> = {
  admin: [
    "platform.manage_business_accounts",
    "platform.manage_users",
    "platform.manage_access",
    "platform.manage_analytics_database",
    "platform.manage_integrations",
    "platform.view_audit",
    "platform.view_logs",
    "platform.use_debug_tools",
    "business.view_all_statistics",
    "business.view_department_statistics",
    "business.view_notifications",
    "business.submit_forms",
    "business.submit_dispatcher_forms",
    "business.view_dispatcher_feed",
    "business.view_own_submissions",
  ],
  business_owner: [
    "business.view_all_statistics",
    "business.view_department_statistics",
    "business.view_notifications",
    "business.view_dispatcher_feed",
  ],
  worker: [],
  dispatcher: [
    "business.submit_dispatcher_forms",
    "business.view_dispatcher_feed",
  ],
};

const scryptAsync = promisify(scrypt);
const passwordHashAlgorithm = "scrypt";
const passwordKeyLength = 64;

export async function hashPassword(password: string, salt = createPasswordSalt()) {
  const key = (await scryptAsync(
    password,
    salt,
    passwordKeyLength,
  )) as Buffer;

  return `${passwordHashAlgorithm}$${salt}$${key.toString("base64")}`;
}

export async function verifyPassword(password: string, hash: string) {
  const parts = hash.split("$");

  if (parts.length !== 3 || parts[0] !== passwordHashAlgorithm) {
    return false;
  }

  const [, salt, expectedKey] = parts;
  const expected = Buffer.from(expectedKey, "base64");
  const actual = (await scryptAsync(password, salt, expected.length)) as Buffer;

  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function createSessionId() {
  return randomBytes(32).toString("hex");
}

export function isAccountType(value: unknown): value is AccountType {
  return (
    value === "admin" ||
    value === "business_owner" ||
    value === "worker" ||
    value === "dispatcher"
  );
}

export function isAccountPosition(value: unknown): value is AccountPosition {
  return (
    typeof value === "string" &&
    /^[a-z0-9][a-z0-9_-]{0,119}$/.test(value)
  );
}

export function isAccountNavigationItem(
  value: unknown,
): value is AccountNavigationItem {
  return (
    typeof value === "string" &&
    accountNavigationItems.includes(value as AccountNavigationItem)
  );
}

export function isAccountCapability(value: unknown): value is AccountCapability {
  return (
    typeof value === "string" &&
    accountCapabilities.includes(value as AccountCapability)
  );
}

export function hasProfileCapability(
  profile: ServerUserProfile | undefined,
  capability: AccountCapability,
) {
  return profile?.activeAccess.capabilities.includes(capability) === true;
}

export function readScopedBusinessAccountId(
  profile: ServerUserProfile,
): string | undefined {
  const scope = profile.activeAccess.scope;

  if (scope.kind === "business" || scope.kind === "department") {
    return scope.businessAccountId;
  }

  return undefined;
}

function createPasswordSalt() {
  return randomBytes(16).toString("base64");
}
