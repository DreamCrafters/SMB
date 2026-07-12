import type { RowDataPacket } from "mysql2/promise";
import type { DatabasePool } from "../db/pool.js";
import {
  defaultPositionByAccountType,
  navigationItemsByAccountType,
} from "../domain/accountAccessConfiguration.js";
import {
  createSessionId,
  isAccountCapability,
  isAccountNavigationItem,
  isAccountPosition,
  isAccountType,
  verifyPassword,
  type AccountCapability,
  type AccountScope,
  type AccountType,
  type AuthSessionService,
  type AuthenticatedSession,
  type BusinessAccountRef,
  type DepartmentRef,
  type ServerIssuedAccountAccess,
  type ServerUserProfile,
} from "../domain/auth.js";

type AuthAccessRow = RowDataPacket & {
  user_id: string;
  login: string;
  user_display_name: string;
  user_status: string;
  password_hash: string;
  access_id: string;
  account_type: string;
  position_code: string;
  access_display_name: string;
  scope_kind: string;
  business_account_id: string | null;
  department_id: string | null;
  capabilities: unknown;
  navigation_items: unknown;
  access_created_at: Date | string;
  session_expires_at?: Date | string;
  business_display_name: string | null;
  business_status: string | null;
  department_display_name: string | null;
  department_structure_mode: string | null;
  parent_department_id: string | null;
};

export function createAuthSessionService(
  pool: DatabasePool,
  options: {
    sessionTtlHours: number;
  },
): AuthSessionService {
  return {
    async login(credentials) {
      const login = credentials.login.trim();

      if (login.length === 0 || credentials.password.length === 0) {
        return { ok: false };
      }

      const row = await readLoginAccessRow(pool, login);

      if (row === undefined || row.user_status !== "active") {
        return { ok: false };
      }

      const isPasswordValid = await verifyPassword(
        credentials.password,
        row.password_hash,
      );

      if (!isPasswordValid) {
        return { ok: false };
      }

      const sessionId = createSessionId();
      const expiresAt = new Date(
        Date.now() + options.sessionTtlHours * 60 * 60 * 1000,
      );

      await pool.query(
        `
          insert into auth_sessions (
            id,
            user_id,
            access_id,
            expires_at
          )
          values (?, ?, ?, ?)
        `,
        [sessionId, row.user_id, row.access_id, expiresAt],
      );

      return {
        ok: true,
        session: buildAuthenticatedSession(row, sessionId, expiresAt),
      };
    },

    async readSession(sessionId) {
      const [rows] = await pool.query<AuthAccessRow[]>(
        `
          select
            users.id as user_id,
            users.login,
            users.display_name as user_display_name,
            users.status as user_status,
            credentials.password_hash,
            accesses.id as access_id,
            accesses.account_type,
            accesses.position_code,
            accesses.display_name as access_display_name,
            accesses.scope_kind,
            accesses.business_account_id,
            accesses.department_id,
            accesses.capabilities,
            accesses.navigation_items,
            accesses.created_at as access_created_at,
            sessions.expires_at as session_expires_at,
            business.display_name as business_display_name,
            business.status as business_status,
            departments.display_name as department_display_name,
            departments.structure_mode as department_structure_mode,
            departments.parent_department_id
          from auth_sessions as sessions
          join app_users as users on users.id = sessions.user_id
          join auth_password_credentials as credentials
            on credentials.user_id = users.id
          join account_accesses as accesses on accesses.id = sessions.access_id
          left join business_accounts as business
            on business.id = accesses.business_account_id
          left join departments
            on departments.id = accesses.department_id
          where sessions.id = ?
            and sessions.expires_at > current_timestamp(3)
            and users.status = 'active'
            and accesses.is_active = 1
          limit 1
        `,
        [sessionId],
      );
      const row = rows[0];

      if (row === undefined || row.session_expires_at === undefined) {
        return undefined;
      }

      await pool.query(
        "update auth_sessions set last_seen_at = current_timestamp(3) where id = ?",
        [sessionId],
      );

      return buildAuthenticatedSession(
        row,
        sessionId,
        toDate(row.session_expires_at),
      );
    },

    async deleteSession(sessionId) {
      await pool.query("delete from auth_sessions where id = ?", [sessionId]);
    },
  };
}

async function readLoginAccessRow(
  pool: DatabasePool,
  login: string,
): Promise<AuthAccessRow | undefined> {
  const [rows] = await pool.query<AuthAccessRow[]>(
    `
      select
        users.id as user_id,
        users.login,
        users.display_name as user_display_name,
        users.status as user_status,
        credentials.password_hash,
        accesses.id as access_id,
        accesses.account_type,
        accesses.position_code,
        accesses.display_name as access_display_name,
        accesses.scope_kind,
        accesses.business_account_id,
        accesses.department_id,
        accesses.capabilities,
        accesses.navigation_items,
        accesses.created_at as access_created_at,
        business.display_name as business_display_name,
        business.status as business_status,
        departments.display_name as department_display_name,
        departments.structure_mode as department_structure_mode,
        departments.parent_department_id
      from app_users as users
      join auth_password_credentials as credentials
        on credentials.user_id = users.id
      join account_accesses as accesses on accesses.user_id = users.id
      left join business_accounts as business
        on business.id = accesses.business_account_id
      left join departments
        on departments.id = accesses.department_id
      where users.login = ?
        and accesses.is_active = 1
      order by accesses.created_at asc, accesses.id asc
      limit 1
    `,
    [login],
  );

  return rows[0];
}

function buildAuthenticatedSession(
  row: AuthAccessRow,
  sessionId: string,
  expiresAt: Date,
): AuthenticatedSession {
  return {
    sessionId,
    expiresAt: expiresAt.toISOString(),
    profile: buildProfile(row, expiresAt),
  };
}

function buildProfile(row: AuthAccessRow, expiresAt: Date): ServerUserProfile {
  const activeAccess = buildAccess(row, expiresAt);
  const businessAccounts = buildBusinessAccounts(row);
  const departments = buildDepartments(row);

  return {
    userId: row.user_id,
    displayName: row.user_display_name,
    accountType: activeAccess.accountType,
    activeAccess,
    businessAccounts,
    departments,
    organizationStructureMode: readStructureMode(row.department_structure_mode),
    receivedAt: new Date().toISOString(),
  };
}

function buildAccess(
  row: AuthAccessRow,
  expiresAt: Date,
): ServerIssuedAccountAccess {
  if (!isAccountType(row.account_type)) {
    throw new Error("Stored account type is not supported.");
  }

  return {
    accountId: row.access_id,
    accountType: row.account_type,
    position: readPosition(row.position_code, row.account_type),
    displayName: row.access_display_name,
    scope: buildScope(row),
    capabilities: readCapabilities(row.capabilities),
    navigationItems: readNavigationItems(row.navigation_items, row.account_type),
    issuedAt: toDate(row.access_created_at).toISOString(),
    expiresAt: expiresAt.toISOString(),
  };
}

function readPosition(value: unknown, accountType: AccountType) {
  if (value === undefined || value === null) {
    return defaultPositionByAccountType[accountType];
  }
  if (!isAccountPosition(value)) {
    throw new Error("Stored account position is not supported.");
  }

  return value;
}

function readNavigationItems(value: unknown, accountType: AccountType) {
  if (value === undefined || value === null) {
    return navigationItemsByAccountType[accountType];
  }
  const parsed = typeof value === "string" ? JSON.parse(value) : value;

  if (!Array.isArray(parsed) || !parsed.every(isAccountNavigationItem)) {
    throw new Error("Stored navigation items are not supported.");
  }

  return parsed;
}

function buildScope(row: AuthAccessRow): AccountScope {
  if (row.scope_kind === "platform") {
    return {
      kind: "platform",
    };
  }

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

  throw new Error("Stored account scope is not supported.");
}

function buildBusinessAccounts(row: AuthAccessRow): BusinessAccountRef[] {
  if (row.business_account_id === null) {
    return [];
  }

  return [
    {
      id: row.business_account_id,
      displayName: row.business_display_name ?? row.business_account_id,
      status: readBusinessStatus(row.business_status),
    },
  ];
}

function buildDepartments(row: AuthAccessRow): DepartmentRef[] {
  if (row.department_id === null || row.business_account_id === null) {
    return [];
  }

  return [
    {
      id: row.department_id,
      businessAccountId: row.business_account_id,
      displayName: row.department_display_name ?? row.department_id,
      structureMode: readStructureMode(row.department_structure_mode),
      parentDepartmentId: row.parent_department_id ?? undefined,
    },
  ];
}

function readCapabilities(value: unknown): AccountCapability[] {
  const parsed =
    typeof value === "string" ? safelyParseJson(value) : value;

  if (!Array.isArray(parsed)) {
    throw new Error("Stored capabilities must be a JSON array.");
  }

  const capabilities: AccountCapability[] = [];

  for (const item of parsed) {
    if (!isAccountCapability(item)) {
      throw new Error("Stored capability is not supported.");
    }

    capabilities.push(item);
  }

  return capabilities;
}

function safelyParseJson(value: string) {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

function readBusinessStatus(value: string | null): BusinessAccountRef["status"] {
  if (value === "suspended" || value === "archived") {
    return value;
  }

  return "active";
}

function readStructureMode(value: string | null): DepartmentRef["structureMode"] {
  return value === "classic" ? "classic" : "current";
}

function toDate(value: Date | string) {
  return value instanceof Date ? value : new Date(value);
}
