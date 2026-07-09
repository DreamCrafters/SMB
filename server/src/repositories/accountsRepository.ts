import { randomUUID } from "node:crypto";
import type { RowDataPacket } from "mysql2/promise";
import type { DatabasePool } from "../db/pool.js";
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
  userStatus: string;
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

export type AccountsRepository = {
  listAccounts: () => Promise<AdminAccountSummary[]>;
  createAccount: (input: CreateAccountInput) => Promise<AdminAccountSummary>;
  resetPassword: (input: ResetPasswordInput) => Promise<boolean>;
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

export function createAccountsRepository(pool: DatabasePool): AccountsRepository {
  async function listAccounts() {
    const [rows] = await pool.query<AccountRow[]>(`
      ${accountRowSelect}
      where accesses.is_active = 1
      order by accesses.created_at desc, accesses.id desc
    `);

    return rows.map(mapAccountRow);
  }

  async function createAccount(input: CreateAccountInput) {
    if (input.businessAccountId !== undefined) {
      await pool.query(
        `
          insert into business_accounts (id, display_name, status)
          values (?, ?, 'active')
          on duplicate key update
            display_name = values(display_name),
            status = 'active'
        `,
        [
          input.businessAccountId,
          input.businessDisplayName ?? input.businessAccountId,
        ],
      );
    }

    if (input.departmentId !== undefined && input.businessAccountId !== undefined) {
      await pool.query(
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
          input.departmentId,
          input.businessAccountId,
          input.departmentDisplayName ?? input.departmentId,
        ],
      );
    }

    await pool.query(
      `
        insert into app_users (id, login, display_name, status)
        values (?, ?, ?, 'active')
        on duplicate key update
          display_name = values(display_name),
          status = 'active'
      `,
      [randomUUID(), input.login, input.displayName],
    );

    const userId = await readUserIdByLogin(input.login);

    if (userId === undefined) {
      throw new Error("Created user was not returned by database.");
    }

    await pool.query(
      `
        insert into auth_password_credentials (user_id, password_hash)
        values (?, ?)
        on duplicate key update
          password_hash = values(password_hash)
      `,
      [userId, await hashPassword(input.password)],
    );

    const existingAccessId = await readAccessId({
      userId,
      accountType: input.accountType,
      businessAccountId: input.businessAccountId,
      departmentId: input.departmentId,
    });
    const accessId = existingAccessId ?? randomUUID();

    await pool.query(
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
        on duplicate key update
          display_name = values(display_name),
          scope_kind = values(scope_kind),
          business_account_id = values(business_account_id),
          department_id = values(department_id),
          capabilities = values(capabilities),
          is_active = 1
      `,
      [
        accessId,
        userId,
        input.accountType,
        input.accessDisplayName ?? `${input.displayName} access`,
        readScopeKind(input.accountType),
        input.businessAccountId ?? null,
        input.departmentId ?? null,
        JSON.stringify(input.capabilities),
      ],
    );

    const created = await readAccountByAccessId(accessId);

    if (created === undefined) {
      throw new Error("Created account access was not returned by database.");
    }

    return created;
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

  async function readUserIdByLogin(login: string) {
    const [rows] = await pool.query<IdRow[]>(
      "select id from app_users where login = ? limit 1",
      [login],
    );

    return rows[0]?.id;
  }

  async function readAccessId({
    userId,
    accountType,
    businessAccountId,
    departmentId,
  }: {
    userId: string;
    accountType: AccountType;
    businessAccountId?: string;
    departmentId?: string;
  }) {
    const [rows] = await pool.query<IdRow[]>(
      `
        select id
        from account_accesses
        where user_id = ?
          and account_type = ?
          and scope_kind = ?
          and (business_account_id <=> ?)
          and (department_id <=> ?)
        limit 1
      `,
      [
        userId,
        accountType,
        readScopeKind(accountType),
        businessAccountId ?? null,
        departmentId ?? null,
      ],
    );

    return rows[0]?.id;
  }

  async function readAccountByAccessId(accessId: string) {
    const [rows] = await pool.query<AccountRow[]>(
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
  };
}

function mapAccountRow(row: AccountRow): AdminAccountSummary {
  return {
    accessId: row.access_id,
    userId: row.user_id,
    login: row.login,
    userDisplayName: row.user_display_name,
    userStatus: row.user_status,
    accessDisplayName: row.access_display_name,
    accountType: row.account_type as AccountType,
    scope: buildScope(row),
    businessDisplayName: row.business_display_name,
    departmentDisplayName: row.department_display_name,
    capabilities: readCapabilities(row.capabilities),
    createdAt: toDate(row.created_at).toISOString(),
  };
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

function readScopeKind(accountType: AccountType) {
  if (accountType === "admin") {
    return "platform";
  }

  return accountType === "business_owner" ? "business" : "department";
}

function toDate(value: Date | string) {
  return value instanceof Date ? value : new Date(value);
}
