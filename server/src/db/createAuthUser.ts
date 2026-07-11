import { readServerConfig } from "../config/env.js";
import { createDatabasePool } from "./pool.js";
import { createAccountsRepository } from "../repositories/accountsRepository.js";
import {
  defaultCapabilitiesByAccountType,
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

const config = readServerConfig();
const pool = createDatabasePool(config.databaseUrl);
const accounts = createAccountsRepository(pool);

try {
  const input = readAuthUserInput(process.env);

  await accounts.createAccount(input);
  console.log(
    `auth_user.ready login=${input.login} accountType=${input.accountType}`,
  );
} finally {
  await pool.end();
}

function readAuthUserInput(env: NodeJS.ProcessEnv): AuthUserInput {
  const login = readRequired(env, "SMB_AUTH_LOGIN");
  const password = readRequired(env, "SMB_AUTH_PASSWORD");
  const displayName = readOptional(env.SMB_AUTH_DISPLAY_NAME) ?? login;
  const accountType = readAccountType(env.SMB_AUTH_ACCOUNT_TYPE);
  const businessAccountId = readOptional(env.SMB_AUTH_BUSINESS_ACCOUNT_ID);
  const departmentId = readOptional(env.SMB_AUTH_DEPARTMENT_ID);

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
