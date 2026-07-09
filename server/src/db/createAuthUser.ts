import { randomUUID } from "node:crypto";
import type { RowDataPacket } from "mysql2/promise";
import { readServerConfig } from "../config/env.js";
import { createDatabasePool } from "./pool.js";
import {
  defaultCapabilitiesByAccountType,
  hashPassword,
  isAccountCapability,
  isAccountType,
  type AccountCapability,
  type AccountType,
} from "../domain/auth.js";

type AuthUserInput = {
  login: string;
  password: string;
  displayName: string;
  accountType: AccountType;
  businessAccountId?: string;
  businessDisplayName?: string;
  departmentId?: string;
  departmentDisplayName?: string;
  accessDisplayName: string;
  capabilities: AccountCapability[];
};

type IdRow = RowDataPacket & {
  id: string;
};

const config = readServerConfig();
const pool = createDatabasePool(config.databaseUrl);

try {
  const input = readAuthUserInput(process.env);

  await upsertAuthUser(input);
  console.log(
    `auth_user.ready login=${input.login} accountType=${input.accountType}`,
  );
} finally {
  await pool.end();
}

async function upsertAuthUser(input: AuthUserInput) {
  if (input.businessAccountId !== undefined) {
    await pool.query(
      `
        insert into business_accounts (id, display_name, status)
        values (?, ?, 'active')
        on duplicate key update
          display_name = values(display_name),
          status = 'active'
      `,
      [input.businessAccountId, input.businessDisplayName ?? input.businessAccountId],
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

  const userId = await readUserId(input.login);

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
      input.accessDisplayName,
      readScopeKind(input.accountType),
      input.businessAccountId ?? null,
      input.departmentId ?? null,
      JSON.stringify(input.capabilities),
    ],
  );
}

async function readUserId(login: string) {
  const [rows] = await pool.query<IdRow[]>(
    "select id from app_users where login = ? limit 1",
    [login],
  );
  const row = rows[0];

  if (row === undefined) {
    throw new Error("Created user was not returned by database.");
  }

  return row.id;
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
        and (
          business_account_id <=> ?
        )
        and (
          department_id <=> ?
        )
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

function readAuthUserInput(env: NodeJS.ProcessEnv): AuthUserInput {
  const login = readRequired(env, "SMB_AUTH_LOGIN");
  const password = readRequired(env, "SMB_AUTH_PASSWORD");
  const displayName = readOptional(env.SMB_AUTH_DISPLAY_NAME) ?? login;
  const accountType = readAccountType(env.SMB_AUTH_ACCOUNT_TYPE);
  const businessAccountId = readOptional(env.SMB_AUTH_BUSINESS_ACCOUNT_ID);
  const departmentId = readOptional(env.SMB_AUTH_DEPARTMENT_ID);

  if (
    (accountType === "business_owner" || accountType === "worker" ||
      accountType === "dispatcher") &&
    businessAccountId === undefined
  ) {
    throw new Error("SMB_AUTH_BUSINESS_ACCOUNT_ID is required for business roles.");
  }

  if (
    (accountType === "worker" || accountType === "dispatcher") &&
    departmentId === undefined
  ) {
    throw new Error("SMB_AUTH_DEPARTMENT_ID is required for department roles.");
  }

  return {
    login,
    password,
    displayName,
    accountType,
    businessAccountId,
    businessDisplayName: readOptional(env.SMB_AUTH_BUSINESS_DISPLAY_NAME),
    departmentId,
    departmentDisplayName: readOptional(env.SMB_AUTH_DEPARTMENT_DISPLAY_NAME),
    accessDisplayName:
      readOptional(env.SMB_AUTH_ACCESS_DISPLAY_NAME) ?? `${displayName} access`,
    capabilities: readCapabilities(env.SMB_AUTH_CAPABILITIES, accountType),
  };
}

function readRequired(env: NodeJS.ProcessEnv, key: string) {
  const value = readOptional(env[key]);

  if (value === undefined) {
    throw new Error(`Missing required env variable: ${key}`);
  }

  return value;
}

function readOptional(value: string | undefined) {
  const normalized = value?.trim();

  return normalized === undefined || normalized.length === 0
    ? undefined
    : normalized;
}

function readAccountType(value: string | undefined) {
  const normalized = readOptional(value);

  if (!isAccountType(normalized)) {
    throw new Error(
      "SMB_AUTH_ACCOUNT_TYPE must be admin, business_owner, worker or dispatcher.",
    );
  }

  return normalized;
}

function readCapabilities(value: string | undefined, accountType: AccountType) {
  const normalized = readOptional(value);

  if (normalized === undefined) {
    return defaultCapabilitiesByAccountType[accountType];
  }

  const capabilities = normalized
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
  const result: AccountCapability[] = [];

  for (const capability of capabilities) {
    if (!isAccountCapability(capability)) {
      throw new Error(`Unsupported capability: ${capability}`);
    }

    result.push(capability);
  }

  return result;
}

function readScopeKind(accountType: AccountType) {
  if (accountType === "admin") {
    return "platform";
  }

  return accountType === "business_owner" ? "business" : "department";
}
