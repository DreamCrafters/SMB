import {
  accountCapabilities,
  accountNavigationItems,
  type AccountCapability,
  type AccountNavigationItem,
  type AccountType,
  type DevAccessOption,
} from "../contracts/accounts.js";
import type { ServerUserProfile } from "../contracts/organization.js";
import { navigationItemsByAccountType } from "../content.js";
import { getNextMoscowDispatcherLogoutAt } from "./dispatcherSessionExpiry.js";

const LOCAL_DEV_ACCESS_SESSION_STORAGE_KEY =
  "smb.localDevAccessSession.v1";
const DEV_BUSINESS_ID = "dev-business-boundary";
const DEV_DEPARTMENT_ID = "dev-department-boundary";

type LocalDevAccessSession = {
  sessionId: string;
  option: DevAccessOption;
  createdAt: string;
};

const accountCapabilitiesByType: Record<AccountType, AccountCapability[]> = {
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
    "business.submit_forms",
    "business.view_own_submissions",
  ],
  worker: [],
  dispatcher: ["business.submit_dispatcher_forms"],
};

const defaultPositionDefinitions: Array<{
  position: string;
  positionDisplayName: string;
  accountType: AccountType;
}> = [
  { position: "administrator", positionDisplayName: "Администратор", accountType: "admin" },
  { position: "business_owner", positionDisplayName: "Владелец бизнеса", accountType: "business_owner" },
  { position: "board_chair", positionDisplayName: "Председатель совета директоров", accountType: "business_owner" },
  { position: "board_member", positionDisplayName: "Член совета директоров", accountType: "business_owner" },
  { position: "general_director", positionDisplayName: "Генеральный директор", accountType: "business_owner" },
  { position: "worker", positionDisplayName: "Работник", accountType: "worker" },
  { position: "dispatcher", positionDisplayName: "Диспетчер", accountType: "dispatcher" },
];

export const localDevAccessOptions: DevAccessOption[] =
  defaultPositionDefinitions.map((definition) => ({
    ...definition,
    navigationItems: navigationItemsByAccountType[definition.accountType].map(
      ({ id }) => id,
    ),
    capabilities: [...accountCapabilitiesByType[definition.accountType]],
  }));

export function createLocalDevAccessSession(
  selection: AccountType | DevAccessOption,
): string | undefined {
  const storage = readSessionStorage();
  const option = typeof selection === "string"
    ? localDevAccessOptions.find((item) => item.accountType === selection)
    : selection;

  if (storage === undefined || option === undefined) {
    return undefined;
  }

  const session: LocalDevAccessSession = {
    sessionId: createSessionId(option.accountType),
    option,
    createdAt: new Date().toISOString(),
  };

  try {
    storage.setItem(
      LOCAL_DEV_ACCESS_SESSION_STORAGE_KEY,
      JSON.stringify(session),
    );

    return session.sessionId;
  } catch {
    return undefined;
  }
}

export function clearLocalDevAccessSession() {
  const storage = readSessionStorage();

  try {
    storage?.removeItem(LOCAL_DEV_ACCESS_SESSION_STORAGE_KEY);
  } catch {
    // Ignore unavailable storage; this fallback is only for local UI tests.
  }
}

export function readLocalDevAccessProfile(): ServerUserProfile | null {
  const session = readLocalDevAccessSession();

  if (session === null) {
    return null;
  }

  return buildLocalDevProfile(session.option, session.createdAt);
}

function readLocalDevAccessSession(): LocalDevAccessSession | null {
  const storage = readSessionStorage();

  try {
    const rawValue = storage?.getItem(LOCAL_DEV_ACCESS_SESSION_STORAGE_KEY);

    if (rawValue === undefined || rawValue === null) {
      return null;
    }

    const value: unknown = JSON.parse(rawValue);

    if (
      isRecord(value) &&
      typeof value.sessionId === "string" &&
      typeof value.createdAt === "string"
    ) {
      const option = readStoredDevAccessOption(value);

      if (option === undefined) {
        return null;
      }

      if (
        option.accountType === "dispatcher" &&
        getNextMoscowDispatcherLogoutAt(new Date(value.createdAt)).getTime() <=
          Date.now()
      ) {
        clearLocalDevAccessSession();
        return null;
      }

      return {
        sessionId: value.sessionId,
        option,
        createdAt: value.createdAt,
      };
    }

    return null;
  } catch {
    return null;
  }
}

function buildLocalDevProfile(
  option: DevAccessOption,
  issuedAt: string,
): ServerUserProfile {
  const { accountType } = option;
  const receivedAt = new Date().toISOString();
  const capabilities = option.capabilities;
  const businessAccounts = [
    {
      id: DEV_BUSINESS_ID,
      displayName: "Local test business boundary",
      status: "active" as const,
    },
  ];
  const departments = [
    {
      id: DEV_DEPARTMENT_ID,
      businessAccountId: DEV_BUSINESS_ID,
      displayName: "Local test department boundary",
      structureMode: "current" as const,
    },
  ];

  if (accountType === "admin") {
    return {
      userId: "local-dev-user-admin",
      displayName: "Local test administrator",
      accountType,
      activeAccess: {
        accountId: "local-dev-access-admin",
        accountType,
        position: option.position,
        positionDisplayName: option.positionDisplayName,
        displayName: "Local test admin access",
        scope: {
          kind: "platform",
        },
        capabilities,
        navigationItems: option.navigationItems,
        issuedAt,
      },
      businessAccounts,
      departments,
      organizationStructureMode: "current",
      receivedAt,
    };
  }

  if (accountType === "business_owner") {
    return {
      userId: "local-dev-user-owner",
      displayName: "Local test business owner",
      accountType,
      activeAccess: {
        accountId: "local-dev-access-owner",
        accountType,
        position: option.position,
        positionDisplayName: option.positionDisplayName,
        displayName: "Local test business owner access",
        scope: {
          kind: "business",
          businessAccountId: DEV_BUSINESS_ID,
        },
        capabilities,
        navigationItems: option.navigationItems,
        issuedAt,
      },
      businessAccounts,
      departments: [],
      organizationStructureMode: "current",
      receivedAt,
    };
  }

  if (accountType === "dispatcher") {
    const expiresAt = getNextMoscowDispatcherLogoutAt(
      new Date(issuedAt),
    ).toISOString();

    return {
      userId: "local-dev-user-dispatcher",
      displayName: "Local test dispatcher",
      accountType,
      activeAccess: {
        accountId: "local-dev-access-dispatcher",
        accountType,
        position: option.position,
        positionDisplayName: option.positionDisplayName,
        displayName: "Local test dispatcher access",
        scope: {
          kind: "department",
          businessAccountId: DEV_BUSINESS_ID,
          departmentId: DEV_DEPARTMENT_ID,
        },
        capabilities,
        navigationItems: option.navigationItems,
        issuedAt,
        expiresAt,
      },
      businessAccounts,
      departments,
      organizationStructureMode: "current",
      receivedAt,
    };
  }

  return {
    userId: "local-dev-user-worker",
    displayName: "Local test worker",
    accountType,
    activeAccess: {
      accountId: "local-dev-access-worker",
      accountType,
      position: option.position,
      positionDisplayName: option.positionDisplayName,
      displayName: "Local test worker access",
      scope: {
        kind: "department",
        businessAccountId: DEV_BUSINESS_ID,
        departmentId: DEV_DEPARTMENT_ID,
      },
      capabilities,
      navigationItems: option.navigationItems,
      issuedAt,
    },
    businessAccounts,
    departments,
    organizationStructureMode: "current",
    receivedAt,
  };
}

function createSessionId(accountType: AccountType) {
  const entropy = Math.random().toString(36).slice(2, 10);
  const timestamp = Date.now().toString(36);

  return `local-${accountType}-${timestamp}-${entropy}`;
}

function readSessionStorage() {
  return typeof window === "undefined" ? undefined : window.sessionStorage;
}

function readStoredDevAccessOption(
  value: Record<string, unknown>,
): DevAccessOption | undefined {
  if (isDevAccessOption(value.option)) {
    return value.option;
  }

  if (isAccountType(value.accountType)) {
    return localDevAccessOptions.find(
      (option) => option.accountType === value.accountType,
    );
  }

  return undefined;
}

function isDevAccessOption(value: unknown): value is DevAccessOption {
  return (
    isRecord(value) &&
    typeof value.position === "string" &&
    typeof value.positionDisplayName === "string" &&
    isAccountType(value.accountType) &&
    Array.isArray(value.navigationItems) &&
    value.navigationItems.every(isAccountNavigationItem) &&
    Array.isArray(value.capabilities) &&
    value.capabilities.every(isAccountCapability)
  );
}

function isAccountNavigationItem(value: unknown): value is AccountNavigationItem {
  return accountNavigationItems.some((item) => item === value);
}

function isAccountCapability(value: unknown): value is AccountCapability {
  return accountCapabilities.some((capability) => capability === value);
}

function isAccountType(value: unknown): value is AccountType {
  return (
    value === "admin" ||
    value === "business_owner" ||
    value === "worker" ||
    value === "dispatcher"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
