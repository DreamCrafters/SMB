import type {
  AccountCapability,
  AccountNavigationItem,
  AccountPosition,
  AccountType,
} from "./auth.js";
import { getNextMoscowDispatcherLogoutAt } from "./auth.js";

export type DevAccessOption = {
  position: AccountPosition;
  positionDisplayName: string;
  accountType: AccountType;
  navigationItems: AccountNavigationItem[];
  capabilities: AccountCapability[];
};

export type DevAccessSession = {
  option: DevAccessOption;
  createdAt: string;
};

const navigationItemsByAccountType = {
  admin: [
    "admin.account_preview",
    "admin.accounts",
    "admin.database",
    "admin.user_actions",
  ],
  business_owner: ["business.overview", "business.dispatcher", "business.work"],
  worker: [],
  dispatcher: ["business.dispatcher_form"],
} as const;

const accountCapabilitiesByType: Record<AccountType, AccountCapability[]> = {
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
  ],
};

const defaultPositionDefinitions: Array<{
  position: AccountPosition;
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

export function buildDefaultDevAccessOptions(): DevAccessOption[] {
  return defaultPositionDefinitions.map((definition) => ({
    ...definition,
    navigationItems: [...navigationItemsByAccountType[definition.accountType]],
    capabilities: [...accountCapabilitiesByType[definition.accountType]],
  }));
}

export function buildDevProfile(option: DevAccessOption, issuedAt: string) {
  const { accountType } = option;
  const receivedAt = new Date().toISOString();
  const capabilities = option.capabilities;

  if (accountType === "admin") {
    return {
      userId: "dev-user-admin",
      displayName: "Dev administrator",
      accountType,
      activeAccess: {
        accountId: "dev-access-admin",
        accountType,
        position: option.position,
        positionDisplayName: option.positionDisplayName,
        displayName: "Dev admin access",
        scope: {
          kind: "platform",
        },
        capabilities,
        navigationItems: [...option.navigationItems],
        issuedAt,
      },
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
        position: option.position,
        positionDisplayName: option.positionDisplayName,
        displayName: "Dev business owner access",
        scope: {
          kind: "organization",
        },
        capabilities,
        navigationItems: [...option.navigationItems],
        issuedAt,
      },
      receivedAt,
    };
  }

  if (accountType === "dispatcher") {
    const expiresAt = getNextMoscowDispatcherLogoutAt(
      new Date(issuedAt),
    ).toISOString();

    return {
      userId: "dev-user-dispatcher",
      displayName: "Dev dispatcher",
      accountType,
      activeAccess: {
        accountId: "dev-access-dispatcher",
        accountType,
        position: option.position,
        positionDisplayName: option.positionDisplayName,
        displayName: "Dev dispatcher access",
        scope: {
          kind: "organization",
        },
        capabilities,
        navigationItems: [...option.navigationItems],
        issuedAt,
        expiresAt,
      },
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
      position: option.position,
      positionDisplayName: option.positionDisplayName,
      displayName: "Dev worker access",
      scope: {
        kind: "organization",
      },
      capabilities,
      navigationItems: [...option.navigationItems],
      issuedAt,
    },
    receivedAt,
  };
}

export function isDevAccessSessionExpired(
  session: DevAccessSession,
  now = new Date(),
) {
  return (
    session.option.accountType === "dispatcher" &&
    getNextMoscowDispatcherLogoutAt(new Date(session.createdAt)).getTime() <=
      now.getTime()
  );
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
