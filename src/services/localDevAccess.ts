import type {
  AccountCapability,
  AccountType,
  ServerUserProfile,
} from "../contracts";

const LOCAL_DEV_ACCESS_SESSION_STORAGE_KEY =
  "smb.localDevAccessSession.v1";
const DEV_BUSINESS_ID = "dev-business-boundary";
const DEV_DEPARTMENT_ID = "dev-department-boundary";

type LocalDevAccessSession = {
  sessionId: string;
  accountType: AccountType;
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
  ],
  worker: [
    "business.submit_forms",
    "business.view_notifications",
    "business.view_own_submissions",
  ],
  dispatcher: ["business.submit_dispatcher_forms"],
};

export function createLocalDevAccessSession(
  accountType: AccountType,
): string | undefined {
  const storage = readSessionStorage();

  if (storage === undefined) {
    return undefined;
  }

  const session: LocalDevAccessSession = {
    sessionId: createSessionId(accountType),
    accountType,
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

  return buildLocalDevProfile(session.accountType, session.createdAt);
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
      isAccountType(value.accountType) &&
      typeof value.createdAt === "string"
    ) {
      return {
        sessionId: value.sessionId,
        accountType: value.accountType,
        createdAt: value.createdAt,
      };
    }

    return null;
  } catch {
    return null;
  }
}

function buildLocalDevProfile(
  accountType: AccountType,
  issuedAt: string,
): ServerUserProfile {
  const receivedAt = new Date().toISOString();
  const capabilities = accountCapabilitiesByType[accountType];
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
        displayName: "Local test admin access",
        scope: {
          kind: "platform",
        },
        capabilities,
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
        displayName: "Local test business owner access",
        scope: {
          kind: "business",
          businessAccountId: DEV_BUSINESS_ID,
        },
        capabilities,
        issuedAt,
      },
      businessAccounts,
      departments: [],
      organizationStructureMode: "current",
      receivedAt,
    };
  }

  if (accountType === "dispatcher") {
    return {
      userId: "local-dev-user-dispatcher",
      displayName: "Local test dispatcher",
      accountType,
      activeAccess: {
        accountId: "local-dev-access-dispatcher",
        accountType,
        displayName: "Local test dispatcher access",
        scope: {
          kind: "department",
          businessAccountId: DEV_BUSINESS_ID,
          departmentId: DEV_DEPARTMENT_ID,
        },
        capabilities,
        issuedAt,
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
      displayName: "Local test worker access",
      scope: {
        kind: "department",
        businessAccountId: DEV_BUSINESS_ID,
        departmentId: DEV_DEPARTMENT_ID,
      },
      capabilities,
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
