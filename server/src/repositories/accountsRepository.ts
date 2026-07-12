import { randomUUID } from "node:crypto";
import type { PoolConnection, RowDataPacket } from "mysql2/promise";
import type { DatabasePool } from "../db/pool.js";
import { resolveAccountProvisioningScope } from "../domain/accountProvisioning.js";
import {
  defaultPositionByAccountType,
  navigationItemsByAccountType,
} from "../domain/accountAccessConfiguration.js";
import {
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
  positionDisplayName: string;
  scope: AccountScope;
  businessDisplayName: string | null;
  departmentDisplayName: string | null;
  capabilities: AccountCapability[];
  navigationItems: AccountNavigationItem[];
  createdAt: string;
};

export type AdminPositionSummary = {
  id: string;
  displayName: string;
  accountType: AccountType;
  navigationItems: AccountNavigationItem[];
  capabilities: AccountCapability[];
  isProtected: boolean;
  usageCount: number;
  createdAt: string;
};

export type CreatePositionInput = Omit<
  AdminPositionSummary,
  "id" | "isProtected" | "usageCount" | "createdAt"
>;

export type UpdatePositionInput = {
  id: string;
  displayName: string;
  navigationItems: AccountNavigationItem[];
  capabilities: AccountCapability[];
};

export type CreateAccountInput = {
  login: string;
  password: string;
  displayName: string;
  accountType: AccountType;
  position?: AccountPosition;
  capabilities: AccountCapability[];
  navigationItems?: AccountNavigationItem[];
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
  listPositions: () => Promise<AdminPositionSummary[]>;
  createPosition: (input: CreatePositionInput) => Promise<AdminPositionSummary>;
  updatePosition: (input: UpdatePositionInput) => Promise<AdminPositionSummary | undefined>;
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
  position_display_name: string;
  scope_kind: string;
  business_account_id: string | null;
  business_display_name: string | null;
  department_id: string | null;
  department_display_name: string | null;
  capabilities: unknown;
  navigation_items: unknown;
  created_at: Date | string;
};

type PositionRow = RowDataPacket & {
  id: string;
  display_name: string;
  account_type: string;
  navigation_items: unknown;
  capabilities: unknown;
  is_protected: number | boolean;
  created_at: Date | string;
  usage_count: number | string;
};

type IdRow = RowDataPacket & {
  id: string;
};

type UserStatusRow = RowDataPacket & {
  status: string;
};

const accountRowSelect = `
  select
    accesses.id as access_id,
    users.id as user_id,
    users.login,
    users.display_name as user_display_name,
    users.status as user_status,
    accesses.display_name as access_display_name,
    positions.account_type,
    accesses.position_code,
    positions.display_name as position_display_name,
    accesses.scope_kind,
    accesses.business_account_id,
    business.display_name as business_display_name,
    accesses.department_id,
    departments.display_name as department_display_name,
    positions.capabilities,
    positions.navigation_items,
    accesses.created_at
  from account_accesses as accesses
  join app_users as users on users.id = accesses.user_id
  join account_positions as positions on positions.id = accesses.position_code
  left join business_accounts as business
    on business.id = accesses.business_account_id
  left join departments on departments.id = accesses.department_id
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

  async function listPositions() {
    const [rows] = await pool.query<PositionRow[]>(`
      select positions.id, positions.display_name, positions.account_type,
        positions.navigation_items, positions.capabilities, positions.is_protected,
        positions.created_at,
        (select count(*) from account_accesses accesses
          where accesses.position_code = positions.id) as usage_count
      from account_positions positions
      order by positions.is_protected desc, positions.display_name asc
    `);
    return rows.map(mapPositionRow);
  }

  async function createPosition(input: CreatePositionInput) {
    const id = `position-${createId()}`;
    await pool.query(
      `insert into account_positions (
        id, display_name, account_type, navigation_items, capabilities, is_protected
      ) values (?, ?, ?, ?, ?, 0)`,
      [id, input.displayName, input.accountType,
        JSON.stringify(input.navigationItems), JSON.stringify(input.capabilities)],
    );
    return { id, ...input, isProtected: false, usageCount: 0, createdAt: new Date().toISOString() };
  }

  async function updatePosition(input: UpdatePositionInput) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const [rows] = await connection.query<PositionRow[]>(`
        select positions.id, positions.display_name, positions.account_type,
          positions.navigation_items, positions.capabilities, positions.is_protected,
          positions.created_at,
          (select count(*) from account_accesses accesses
            where accesses.position_code = positions.id) as usage_count
        from account_positions positions where positions.id = ? limit 1 for update
      `, [input.id]);
      const current = rows[0];
      if (current === undefined) {
        await connection.rollback();
        return undefined;
      }
      await connection.query(
        `update account_positions set display_name = ?, navigation_items = ?, capabilities = ? where id = ?`,
        [input.displayName, JSON.stringify(input.navigationItems), JSON.stringify(input.capabilities), input.id],
      );
      await connection.query(
        `delete sessions from auth_sessions sessions
         join account_accesses accesses on accesses.user_id = sessions.user_id
         where accesses.position_code = ?`,
        [input.id],
      );
      await connection.commit();
      return { ...mapPositionRow(current), displayName: input.displayName,
        navigationItems: input.navigationItems, capabilities: input.capabilities };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
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

      const resolvedNavigationItems =
        input.navigationItems ?? navigationItemsByAccountType[input.accountType];
      const resolvedCapabilities = input.capabilities;

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
            is_active
          )
          values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
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
          JSON.stringify(resolvedCapabilities),
          JSON.stringify(resolvedNavigationItems),
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
         set capabilities = ?, navigation_items = ?
         where id = ? and is_active = 1`,
        [
          JSON.stringify(capabilities),
          JSON.stringify(navigationItems),
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
    listPositions,
    createPosition,
    updatePosition,
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
    positionDisplayName: row.position_display_name,
    scope: buildScope(row),
    businessDisplayName: row.business_display_name,
    departmentDisplayName: row.department_display_name,
    capabilities: readCapabilities(row.capabilities),
    navigationItems: readNavigationItems(row.navigation_items, row.account_type as AccountType),
    createdAt: toDate(row.created_at).toISOString(),
  };
}

function mapPositionRow(row: PositionRow): AdminPositionSummary {
  const accountType = row.account_type as AccountType;
  return {
    id: row.id,
    displayName: row.display_name,
    accountType,
    navigationItems: readNavigationItems(row.navigation_items, accountType),
    capabilities: readCapabilities(row.capabilities),
    isProtected: row.is_protected === true || row.is_protected === 1,
    usageCount: Number(row.usage_count ?? 0),
    createdAt: toDate(row.created_at).toISOString(),
  };
}

function readPosition(value: unknown, accountType: AccountType): AccountPosition {
  if (typeof value === "string" && value.trim().length > 0) {
    return value;
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
