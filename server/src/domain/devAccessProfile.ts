export type AccountType =
  | "admin"
  | "business_owner"
  | "worker"
  | "dispatcher";

type AccountCapability =
  | "platform.manage_business_accounts"
  | "platform.manage_users"
  | "platform.manage_access"
  | "platform.manage_analytics_database"
  | "platform.manage_integrations"
  | "platform.view_audit"
  | "platform.view_logs"
  | "platform.use_debug_tools"
  | "business.view_all_statistics"
  | "business.view_department_statistics"
  | "business.view_notifications"
  | "business.submit_forms"
  | "business.submit_dispatcher_forms"
  | "business.view_dispatcher_feed"
  | "business.view_own_submissions";

export type DevAccessSession = {
  accountType: AccountType;
  createdAt: string;
};

const DEV_BUSINESS_ID = "dev-business-boundary";
const DEV_DEPARTMENT_ID = "dev-department-boundary";

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

export function buildDevProfile(accountType: AccountType, issuedAt: string) {
  const receivedAt = new Date().toISOString();
  const capabilities = accountCapabilitiesByType[accountType];

  if (accountType === "admin") {
    return {
      userId: "dev-user-admin",
      displayName: "Dev administrator",
      accountType,
      activeAccess: {
        accountId: "dev-access-admin",
        accountType,
        displayName: "Dev admin access",
        scope: {
          kind: "platform",
        },
        capabilities,
        issuedAt,
      },
      businessAccounts: [buildDevBusiness()],
      departments: [buildDevDepartment()],
      organizationStructureMode: "current",
      receivedAt,
    };
  }

  if (accountType === "business_owner") {
    return {
      userId: "dev-user-owner",
      displayName: "Dev business owner",
      accountType,
      activeAccess: {
        accountId: "dev-access-owner",
        accountType,
        displayName: "Dev business owner access",
        scope: {
          kind: "business",
          businessAccountId: DEV_BUSINESS_ID,
        },
        capabilities,
        issuedAt,
      },
      businessAccounts: [buildDevBusiness()],
      departments: [],
      organizationStructureMode: "current",
      receivedAt,
    };
  }

  if (accountType === "dispatcher") {
    return {
      userId: "dev-user-dispatcher",
      displayName: "Dev dispatcher",
      accountType,
      activeAccess: {
        accountId: "dev-access-dispatcher",
        accountType,
        displayName: "Dev dispatcher access",
        scope: {
          kind: "department",
          businessAccountId: DEV_BUSINESS_ID,
          departmentId: DEV_DEPARTMENT_ID,
        },
        capabilities,
        issuedAt,
      },
      businessAccounts: [buildDevBusiness()],
      departments: [buildDevDepartment()],
      organizationStructureMode: "current",
      receivedAt,
    };
  }

  return {
    userId: "dev-user-worker",
    displayName: "Dev worker",
    accountType,
    activeAccess: {
      accountId: "dev-access-worker",
      accountType,
      displayName: "Dev worker access",
      scope: {
        kind: "department",
        businessAccountId: DEV_BUSINESS_ID,
        departmentId: DEV_DEPARTMENT_ID,
      },
      capabilities,
      issuedAt,
    },
    businessAccounts: [buildDevBusiness()],
    departments: [buildDevDepartment()],
    organizationStructureMode: "current",
    receivedAt,
  };
}

export function createDevSessionId(accountType: AccountType) {
  return [
    accountType,
    Date.now().toString(36),
    Math.random().toString(36).slice(2),
  ].join(".");
}

export function isAccountType(value: unknown): value is AccountType {
  return (
    value === "admin" ||
    value === "business_owner" ||
    value === "worker" ||
    value === "dispatcher"
  );
}

function buildDevBusiness() {
  return {
    id: DEV_BUSINESS_ID,
    displayName: "Server business boundary",
    status: "active",
  };
}

function buildDevDepartment() {
  return {
    id: DEV_DEPARTMENT_ID,
    businessAccountId: DEV_BUSINESS_ID,
    displayName: "Server department boundary",
    structureMode: "current",
  };
}
