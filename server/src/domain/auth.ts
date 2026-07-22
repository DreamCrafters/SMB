import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

export type AccountType = "admin" | "business_owner" | "worker" | "dispatcher";

export const accountPositions = [
  "administrator",
  "business_owner",
  "board_chair",
  "board_member",
  "general_director",
  "economist",
  "laboratory_assistant",
  "worker",
  "dispatcher",
] as const;

export type AccountPosition = string;

export const accountNavigationItems = [
  "admin.account_preview",
  "admin.accounts",
  "admin.database",
  "admin.user_actions",
  "business.overview",
  "business.dispatcher",
  "business.work",
  "business.user_actions",
  "business.production_plan",
  "business.refractory_shop",
  "business.laboratory_results",
  "business.dispatcher_form",
] as const;

export type AccountNavigationItem = (typeof accountNavigationItems)[number];

export const accountCapabilities = [
  "platform.manage_users",
  "platform.manage_access",
  "platform.manage_analytics_database",
  "platform.manage_integrations",
  "platform.view_audit",
  "platform.view_logs",
  "platform.use_debug_tools",
  "business.view_all_statistics",
  "business.view_notifications",
  "business.submit_forms",
  "business.submit_dispatcher_forms",
  "business.view_dispatcher_feed",
  "business.view_own_submissions",
  "business.view_user_actions",
  "business.manage_production_plan",
  "business.submit_refractory_reports",
  "business.review_refractory_reports",
  "business.manage_laboratory_results",
] as const;

export type AccountCapability = (typeof accountCapabilities)[number];

export type AccountScope =
  | {
      kind: "platform";
    }
  | {
      kind: "organization";
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

export type ServerUserProfile = {
  userId: string;
  displayName: string;
  accountType: AccountType;
  activeAccess: ServerIssuedAccountAccess;
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
    "platform.manage_users",
    "platform.manage_access",
    "platform.manage_analytics_database",
    "platform.manage_integrations",
    "platform.view_audit",
    "platform.view_logs",
    "platform.use_debug_tools",
    "business.view_all_statistics",
    "business.view_notifications",
    "business.submit_forms",
    "business.submit_dispatcher_forms",
    "business.view_dispatcher_feed",
    "business.view_own_submissions",
    "business.manage_production_plan",
    "business.submit_refractory_reports",
    "business.review_refractory_reports",
    "business.manage_laboratory_results",
  ],
  business_owner: [
    "business.view_all_statistics",
    "business.view_notifications",
    "business.view_dispatcher_feed",
    "business.submit_forms",
    "business.view_own_submissions",
  ],
  worker: [],
  dispatcher: [
    "business.submit_dispatcher_forms",
    "business.view_dispatcher_feed",
    "business.review_refractory_reports",
  ],
};

const scryptAsync = promisify(scrypt);
const passwordHashAlgorithm = "scrypt";
const passwordKeyLength = 64;
const moscowUtcOffsetHours = 3;
const dispatcherLogoutHour = 7;
const dispatcherLogoutMinute = 45;

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

export function resolveAccountSessionExpiresAt(
  accountType: AccountType,
  sessionTtlHours: number,
  now = new Date(),
) {
  const ttlExpiresAt = new Date(
    now.getTime() + sessionTtlHours * 60 * 60 * 1000,
  );

  if (accountType !== "dispatcher") {
    return ttlExpiresAt;
  }

  const dispatcherLogoutAt = getNextMoscowDispatcherLogoutAt(now);

  return dispatcherLogoutAt.getTime() < ttlExpiresAt.getTime()
    ? dispatcherLogoutAt
    : ttlExpiresAt;
}

export function getNextMoscowDispatcherLogoutAt(now = new Date()) {
  const moscowNow = new Date(
    now.getTime() + moscowUtcOffsetHours * 60 * 60 * 1000,
  );
  const logoutAt = new Date(
    Date.UTC(
      moscowNow.getUTCFullYear(),
      moscowNow.getUTCMonth(),
      moscowNow.getUTCDate(),
      dispatcherLogoutHour - moscowUtcOffsetHours,
      dispatcherLogoutMinute,
    ),
  );

  if (logoutAt.getTime() <= now.getTime()) {
    logoutAt.setUTCDate(logoutAt.getUTCDate() + 1);
  }

  return logoutAt;
}

export function hasDispatcherSessionPassedDailyLogout(
  accountType: AccountType,
  sessionCreatedAt: Date,
  now = new Date(),
) {
  return (
    accountType === "dispatcher" &&
    getNextMoscowDispatcherLogoutAt(sessionCreatedAt).getTime() <= now.getTime()
  );
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

function createPasswordSalt() {
  return randomBytes(16).toString("base64");
}
