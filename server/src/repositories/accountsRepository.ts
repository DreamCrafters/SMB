import { randomUUID } from "node:crypto";
import type { PoolConnection, RowDataPacket } from "mysql2/promise";
import type { DatabasePool } from "../db/pool.js";
import { resolveAccountProvisioningScope } from "../domain/accountProvisioning.js";
import {
  hashPassword,
  type AccountCapability,
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
  scope: AccountScope;
  businessDisplayName: string | null;
  departmentDisplayName: string | null;
  capabilities: AccountCapability[];
  createdAt: string;
};

export type CreateAccountInput = {
  login: string;
  password: string;
  displayName: string;
  accountType: AccountType;
  capabilities: AccountCapability[];
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
  scope_kind: string;
  business_account_id: string | null;
  business_display_name: string | null;
  department_id: string | null;
  department_display_name: string | null;
  capabilities: unknown;
  created_at: Date | string;
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
    accesses.account_type,
    accesses.scope_kind,
    accesses.business_account_id,
    business.display_name as business_display_name,
    accesses.department_id,
    departments.display_name as department_display_name,
    accesses.capabilities,
    accesses.created_at
  from account_accesses as accesses
  join app_users as users on users.id = accesses.user_id
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
            display_name,
            scope_kind,
            business_account_id,
            department_id,
            capabilities,
            is_active
          )
          values (?, ?, ?, ?, ?, ?, ?, ?, 1)
        `,
        [
          accessId,
          userId,
          input.accountType,
          input.accessDisplayName ?? `${input.displayName} access`,
          scope.scopeKind,
          scope.businessAccount?.id ?? null,
          scope.department?.id ?? null,
          JSON.stringify(input.capabilities),
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
    scope: buildScope(row),
    businessDisplayName: row.business_display_name,
    departmentDisplayName: row.department_display_name,
    capabilities: readCapabilities(row.capabilities),
    createdAt: toDate(row.created_at).toISOString(),
  };
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
