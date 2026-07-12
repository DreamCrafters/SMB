import { randomUUID } from "node:crypto";
import type { PoolConnection, RowDataPacket } from "mysql2/promise";
import type { DatabasePool } from "../db/pool.js";
import { resolveAccountProvisioningScope } from "../domain/accountProvisioning.js";
import {
  defaultPositionByAccountType,
  navigationItemsByAccountType,
} from "../domain/accountAccessConfiguration.js";
import {
  accountPositions,
  hashPassword,
  isAccountNavigationItem,
  type AccountCapability,
  type AccountNavigationItem,
  type AccountPosition,
  type AccountScope,
  type AccountType,
} from "../domain/auth.js";

export type AdminAccountSummary = {
  accessId: string;
  userId: string;
  login: string;
  userDisplayName: string;
  userStatus: AdminUserStatus;
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

export type CreateAccessLevelInput = Omit<
  AdminAccessLevelSummary,
  "id" | "isSystem" | "createdAt"
>;

export type CreateAccountInput = {
  login: string;
  password: string;
  displayName: string;
  accountType: AccountType;
  position?: AccountPosition;
  capabilities: AccountCapability[];
  navigationItems?: AccountNavigationItem[];
  accessLevelId?: string | null;
  businessAccountId?: string;
  businessDisplayName?: string;
  departmentId?: string;
  departmentDisplayName?: string;
  accessDisplayName?: string;
};

export type ResetPasswordInput = {
  login: string;
  password: string;
};

export type AdminUserStatus = "active" | "suspended" | "archived";

export type SetAccountLoginEnabledInput = {
  userId: string;
  isEnabled: boolean;
};

export type SetAccountNavigationInput = {
  accessId: string;
  navigationItems: AccountNavigationItem[];
  capabilities: AccountCapability[];
  accessLevelId?: string | null;
};

export type AccountLoginStatus = {
  userId: string;
  userStatus: "active" | "suspended";
};

export type AccountsRepository = {
  listAccounts: () => Promise<AdminAccountSummary[]>;
  createAccount: (input: CreateAccountInput) => Promise<AdminAccountSummary>;
  resetPassword: (input: ResetPasswordInput) => Promise<boolean>;
  setAccountLoginEnabled: (
    input: SetAccountLoginEnabledInput,
  ) => Promise<AccountLoginStatus | undefined>;
  setAccountNavigation: (
    input: SetAccountNavigationInput,
  ) => Promise<AdminAccountSummary | undefined>;
  listAccessLevels: () => Promise<AdminAccessLevelSummary[]>;
  createAccessLevel: (
    input: CreateAccessLevelInput,
  ) => Promise<AdminAccessLevelSummary>;
};

export class AccountLoginAlreadyExistsError extends Error {
  constructor() {
    super("Учётная запись с таким логином уже существует.");
    this.name = "AccountLoginAlreadyExistsError";
  }
}

export class ArchivedAccountLoginStatusError extends Error {
  constructor() {
    super("Архивную учётную запись нельзя включить или отключить.");
    this.name = "ArchivedAccountLoginStatusError";
  }
}

export class AccessLevelAlreadyExistsError extends Error {
  constructor() {
    super("Уровень доступа с таким названием уже существует для этой должности.");
    this.name = "AccessLevelAlreadyExistsError";
  }
}

type AccountsRepositoryOptions = {
  createId?: () => string;
};

type AccountRow = RowDataPacket & {
  access_id: string;
  user_id: string;
  login: string;
  user_display_name: string;
  user_status: string;
  access_display_name: string;
  account_type: string;
  position_code: string;
  scope_kind: string;
  business_account_id: string | null;
  business_display_name: string | null;
  department_id: string | null;
  department_display_name: string | null;
  capabilities: unknown;
  navigation_items: unknown;
  access_level_id: string | null;
  access_level_display_name: string | null;
  created_at: Date | string;
};

type IdRow = RowDataPacket & {
  id: string;
};

type UserStatusRow = RowDataPacket & {
  status: string;
};

type AccessLevelRow = RowDataPacket & {
  id: string;
  display_name: string;
  position_code: string;
  account_type: string;
  navigation_items: unknown;
  capabilities: unknown;
  is_system: number | boolean;
  created_at: Date | string;
};

const accountRowSelect = `
  select
    accesses.id as access_id,
    users.id as user_id,
    users.login,
    users.display_name as user_display_name,
    users.status as user_status,
    accesses.display_name as access_display_name,
    accesses.account_type,
    accesses.position_code,
    accesses.scope_kind,
    accesses.business_account_id,
    business.display_name as business_display_name,
    accesses.department_id,
    departments.display_name as department_display_name,
    accesses.capabilities,
    accesses.navigation_items,
    accesses.access_level_id,
    access_levels.display_name as access_level_display_name,
    accesses.created_at
  from account_accesses as accesses
  join app_users as users on users.id = accesses.user_id
  left join business_accounts as business
    on business.id = accesses.business_account_id
  left join departments on departments.id = accesses.department_id
  left join account_access_levels as access_levels
    on access_levels.id = accesses.access_level_id
`;

export function createAccountsRepository(
  pool: DatabasePool,
  { createId = randomUUID }: AccountsRepositoryOptions = {},
): AccountsRepository {
  async function listAccounts() {
    const [rows] = await pool.query<AccountRow[]>(`
      ${accountRowSelect}
      where accesses.is_active = 1
      order by accesses.created_at desc, accesses.id desc
    `);

    return rows.map(mapAccountRow);
  }

  async function listAccessLevels() {
    const [rows] = await pool.query<AccessLevelRow[]>(`
      select id, display_name, position_code, account_type,
        navigation_items, capabilities, is_system, created_at
      from account_access_levels
      order by position_code asc, is_system desc, display_name asc
    `);

    return rows.map(mapAccessLevelRow);
  }

  async function createAccessLevel(input: CreateAccessLevelInput) {
    const id = createId();

    try {
      await pool.query(
        `insert into account_access_levels (
          id, display_name, position_code, account_type,
          navigation_items, capabilities, is_system
        ) values (?, ?, ?, ?, ?, ?, 0)`,
        [
          id,
          input.displayName,
          input.position,
          input.accountType,
          JSON.stringify(input.navigationItems),
          JSON.stringify(input.capabilities),
        ],
      );
    } catch (error) {
      if (isDuplicateEntryError(error)) {
        throw new AccessLevelAlreadyExistsError();
      }
      throw error;
    }

    return {
      id,
      ...input,
      isSystem: false,
      createdAt: new Date().toISOString(),
    };
  }

  async function createAccount(input: CreateAccountInput) {
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      if (
        (await readUserIdByLoginInTransaction(connection, input.login)) !==
        undefined
      ) {
        throw new AccountLoginAlreadyExistsError();
      }

      const scope = resolveAccountProvisioningScope(input, createId);

      if (scope.businessAccount !== undefined) {
        await connection.query(
          `
            insert into business_accounts (id, display_name, status)
            values (?, ?, 'active')
            on duplicate key update
              display_name = values(display_name),
              status = 'active'
          `,
          [scope.businessAccount.id, scope.businessAccount.displayName],
        );
      }

      if (
        scope.department !== undefined &&
        scope.businessAccount !== undefined
      ) {
        await connection.query(
          `
            insert into departments (
              id,
              business_account_id,
              display_name,
              structure_mode
            )
            values (?, ?, ?, 'current')
            on duplicate key update
              business_account_id = values(business_account_id),
              display_name = values(display_name),
              structure_mode = values(structure_mode)
          `,
          [
            scope.department.id,
            scope.businessAccount.id,
            scope.department.displayName,
          ],
        );
      }

      const userId = createId();

      try {
        await connection.query(
          `
            insert into app_users (id, login, display_name, status)
            values (?, ?, ?, 'active')
          `,
          [userId, input.login, input.displayName],
        );
      } catch (error) {
        if (isDuplicateEntryError(error)) {
          throw new AccountLoginAlreadyExistsError();
        }

        throw error;
      }

      await connection.query(
        `
          insert into auth_password_credentials (user_id, password_hash)
          values (?, ?)
        `,
        [userId, await hashPassword(input.password)],
      );

      const accessId = createId();

      await connection.query(
        `
          insert into account_accesses (
            id,
            user_id,
            account_type,
            position_code,
            display_name,
            scope_kind,
            business_account_id,
            department_id,
            capabilities,
            navigation_items,
            access_level_id,
            is_active
          )
          values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
        `,
        [
          accessId,
          userId,
          input.accountType,
          input.position ?? defaultPositionByAccountType[input.accountType],
          input.accessDisplayName ?? `${input.displayName} access`,
          scope.scopeKind,
          scope.businessAccount?.id ?? null,
          scope.department?.id ?? null,
          JSON.stringify(input.capabilities),
          JSON.stringify(
            input.navigationItems ?? navigationItemsByAccountType[input.accountType],
          ),
          input.accessLevelId ?? null,
        ],
      );

      const created = await readAccountByAccessId(connection, accessId);

      if (created === undefined) {
        throw new Error("Created account access was not returned by database.");
      }

      await connection.commit();

      return created;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async function resetPassword({ login, password }: ResetPasswordInput) {
    const userId = await readUserIdByLogin(login);

    if (userId === undefined) {
      return false;
    }

    await pool.query(
      `
        insert into auth_password_credentials (user_id, password_hash)
        values (?, ?)
        on duplicate key update
          password_hash = values(password_hash)
      `,
      [userId, await hashPassword(password)],
    );

    return true;
  }

  async function setAccountLoginEnabled({
    userId,
    isEnabled,
  }: SetAccountLoginEnabledInput) {
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      const [rows] = await connection.query<UserStatusRow[]>(
        `
          select status
          from app_users
          where id = ?
          limit 1
          for update
        `,
        [userId],
      );
      const currentStatus = rows[0]?.status;

      if (currentStatus === undefined) {
        await connection.rollback();
        return undefined;
      }

      if (currentStatus === "archived") {
        throw new ArchivedAccountLoginStatusError();
      }

      if (currentStatus !== "active" && currentStatus !== "suspended") {
        throw new Error("Stored user status is not supported.");
      }

      const userStatus = isEnabled ? "active" : "suspended";

      await connection.query(
        "update app_users set status = ? where id = ?",
        [userStatus, userId],
      );

      if (!isEnabled) {
        await connection.query(
          "delete from auth_sessions where user_id = ?",
          [userId],
        );
      }

      await connection.commit();

      return {
        userId,
        userStatus,
      } satisfies AccountLoginStatus;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async function setAccountNavigation({
    accessId,
    navigationItems,
    capabilities,
    accessLevelId,
  }: SetAccountNavigationInput) {
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();
      const existing = await readAccountByAccessId(connection, accessId);

      if (existing === undefined) {
        await connection.rollback();
        return undefined;
      }

      await connection.query(
        `update account_accesses
         set capabilities = ?, navigation_items = ?, access_level_id = ?
         where id = ? and is_active = 1`,
        [
          JSON.stringify(capabilities),
          JSON.stringify(navigationItems),
          accessLevelId ?? null,
          accessId,
        ],
      );
      await connection.query("delete from auth_sessions where user_id = ?", [
        existing.userId,
      ]);

      const updated = await readAccountByAccessId(connection, accessId);
      await connection.commit();
      return updated;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async function readUserIdByLogin(login: string) {
    const [rows] = await pool.query<IdRow[]>(
      "select id from app_users where login = ? limit 1",
      [login],
    );

    return rows[0]?.id;
  }

  async function readAccountByAccessId(
    connection: PoolConnection,
    accessId: string,
  ) {
    const [rows] = await connection.query<AccountRow[]>(
      `
        ${accountRowSelect}
        where accesses.id = ?
        limit 1
      `,
      [accessId],
    );
    const row = rows[0];

    return row === undefined ? undefined : mapAccountRow(row);
  }

  return {
    listAccounts,
    createAccount,
    resetPassword,
    setAccountLoginEnabled,
    setAccountNavigation,
    listAccessLevels,
    createAccessLevel,
  };
}

function mapAccessLevelRow(row: AccessLevelRow): AdminAccessLevelSummary {
  const accountType = row.account_type as AccountType;

  return {
    id: row.id,
    displayName: row.display_name,
    position: readPosition(row.position_code, accountType),
    accountType,
    navigationItems: readNavigationItems(row.navigation_items, accountType),
    capabilities: readCapabilities(row.capabilities),
    isSystem: row.is_system === true || row.is_system === 1,
    createdAt: toDate(row.created_at).toISOString(),
  };
}

async function readUserIdByLoginInTransaction(
  connection: PoolConnection,
  login: string,
) {
  const [rows] = await connection.query<IdRow[]>(
    "select id from app_users where login = ? limit 1",
    [login],
  );

  return rows[0]?.id;
}

function mapAccountRow(row: AccountRow): AdminAccountSummary {
  return {
    accessId: row.access_id,
    userId: row.user_id,
    login: row.login,
    userDisplayName: row.user_display_name,
    userStatus: readAdminUserStatus(row.user_status),
    accessDisplayName: row.access_display_name,
    accountType: row.account_type as AccountType,
    position: readPosition(row.position_code, row.account_type as AccountType),
    scope: buildScope(row),
    businessDisplayName: row.business_display_name,
    departmentDisplayName: row.department_display_name,
    capabilities: readCapabilities(row.capabilities),
    navigationItems: readNavigationItems(row.navigation_items, row.account_type as AccountType),
    accessLevelId: row.access_level_id,
    accessLevelDisplayName: row.access_level_display_name,
    createdAt: toDate(row.created_at).toISOString(),
  };
}

function readPosition(value: unknown, accountType: AccountType): AccountPosition {
  if (typeof value === "string" && accountPositions.includes(value as AccountPosition)) {
    return value as AccountPosition;
  }

  return defaultPositionByAccountType[accountType];
}

function readNavigationItems(
  value: unknown,
  accountType: AccountType,
): AccountNavigationItem[] {
  if (value === undefined || value === null) {
    return navigationItemsByAccountType[accountType];
  }
  const parsed = typeof value === "string" ? JSON.parse(value) : value;

  if (!Array.isArray(parsed) || !parsed.every(isAccountNavigationItem)) {
    throw new Error("Stored navigation items are not supported.");
  }

  return parsed;
}

function readAdminUserStatus(value: string): AdminUserStatus {
  if (value === "active" || value === "suspended" || value === "archived") {
    return value;
  }

  throw new Error("Stored user status is not supported.");
}

function buildScope(row: AccountRow): AccountScope {
  if (row.scope_kind === "business" && row.business_account_id !== null) {
    return {
      kind: "business",
      businessAccountId: row.business_account_id,
    };
  }

  if (
    row.scope_kind === "department" &&
    row.business_account_id !== null &&
    row.department_id !== null
  ) {
    return {
      kind: "department",
      businessAccountId: row.business_account_id,
      departmentId: row.department_id,
    };
  }

  return { kind: "platform" };
}

function readCapabilities(value: unknown): AccountCapability[] {
  const parsed = typeof value === "string" ? safelyParseJson(value) : value;

  return Array.isArray(parsed) ? (parsed as AccountCapability[]) : [];
}

function safelyParseJson(value: string) {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

function toDate(value: Date | string) {
  return value instanceof Date ? value : new Date(value);
}

function isDuplicateEntryError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ER_DUP_ENTRY"
  );
}
