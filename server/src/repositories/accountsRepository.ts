import { randomUUID } from "node:crypto";
import type { PoolConnection, RowDataPacket } from "mysql2/promise";
import type { DatabasePool } from "../db/pool.js";
import { resolveAccountProvisioningScope } from "../domain/accountProvisioning.js";
import {
  CanonicalAdminMutationRequiredError,
  assertProtectedAccountMutationAllowed,
  isCanonicalAdminLogin,
} from "../domain/adminAccountProtection.js";
import {
  assertAdministratorPositionProtectionAllowed,
  assertProtectedPositionMutationAllowed,
} from "../domain/adminPositionProtection.js";
import {
  defaultPositionByAccountType,
  navigationItemsByAccountType,
  nonAdminNavigationItems,
  readBoardAssignmentAccess,
  resolveCapabilitiesForPosition,
  resolveNavigationForPosition,
  type BoardAssignmentAccess,
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
  email?: string;
  maxUserId?: string;
  userStatus: AdminUserStatus;
  isProtected: boolean;
  isProtectedByAdminRights: boolean;
  accessDisplayName: string;
  accountType: AccountType;
  position: AccountPosition;
  positionDisplayName: string;
  scope: AccountScope;
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
  boardAssignmentAccess: BoardAssignmentAccess;
  isProtected: boolean;
  hasAdminRights?: boolean;
  usageCount: number;
  createdAt: string;
};

export type CreatePositionInput = {
  displayName: string;
  navigationItems: AccountNavigationItem[];
  capabilities: AccountCapability[];
};

export type UpdatePositionInput = {
  id: string;
  displayName: string;
  navigationItems: AccountNavigationItem[];
  capabilities: AccountCapability[];
};

export type SetPositionProtectedInput = {
  id: string;
  isProtected: boolean;
};

export type SetPositionNavigationAccessInput = {
  navigationItem: AccountNavigationItem;
  positionIds: string[];
  enabled: boolean;
};

export type PositionNavigationAccessActor = {
  userId: string;
  accessId: string;
  devAccessEnabled: boolean;
};

export type PositionNavigationAccessChange = {
  navigationItem: AccountNavigationItem;
  enabled: boolean;
  positions: Array<{ id: string; displayName: string }>;
};

export type PositionProtection = SetPositionProtectedInput & {
  displayName: string;
  previousIsProtected: boolean;
};

export type CreateAccountInput = {
  login: string;
  password: string;
  displayName: string;
  email?: string;
  maxUserId?: string;
  accountType: AccountType;
  position?: AccountPosition;
  capabilities: AccountCapability[];
  navigationItems?: AccountNavigationItem[];
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

export type SetAccountProtectedInput = {
  userId: string;
  isProtected: boolean;
};

export type AccountProtection = SetAccountProtectedInput;

export type SetAccountNavigationInput = {
  accessId: string;
  navigationItems: AccountNavigationItem[];
  capabilities: AccountCapability[];
};

export type SetAccountPositionInput = {
  accessId: string;
  position: AccountPosition;
};

export type AccountPositionChange = {
  previous: AdminAccountSummary;
  updated: AdminAccountSummary;
};

export type AccountLoginStatus = {
  userId: string;
  userStatus: "active" | "suspended";
};

export type DeletePositionResult = "deleted" | "not_found" | "protected" | "in_use";

export type AccountsRepository = {
  listAccounts: () => Promise<AdminAccountSummary[]>;
  createAccount: (
    input: CreateAccountInput,
    allowProtected?: boolean,
  ) => Promise<AdminAccountSummary>;
  resetPassword: (
    input: ResetPasswordInput,
    allowProtected?: boolean,
  ) => Promise<boolean>;
  setAccountLoginEnabled: (
    input: SetAccountLoginEnabledInput,
    allowProtected?: boolean,
  ) => Promise<AccountLoginStatus | undefined>;
  setAccountProtected: (
    input: SetAccountProtectedInput,
  ) => Promise<AccountProtection | undefined>;
  deleteAccount: (userId: string, allowProtected?: boolean) => Promise<boolean>;
  setAccountNavigation: (
    input: SetAccountNavigationInput,
  ) => Promise<AdminAccountSummary | undefined>;
  setAccountPosition: (
    input: SetAccountPositionInput,
    allowProtected?: boolean,
  ) => Promise<AccountPositionChange | undefined>;
  listPositions: () => Promise<AdminPositionSummary[]>;
  createPosition: (input: CreatePositionInput) => Promise<AdminPositionSummary>;
  updatePosition: (
    input: UpdatePositionInput,
    allowProtected?: boolean,
  ) => Promise<AdminPositionSummary | undefined>;
  deletePosition: (
    id: string,
    allowProtected?: boolean,
  ) => Promise<DeletePositionResult>;
  setPositionOrder: (
    positionIds: string[],
    allowProtected?: boolean,
  ) => Promise<boolean>;
  setPositionProtected: (
    input: SetPositionProtectedInput,
  ) => Promise<PositionProtection | undefined>;
  setPositionNavigationAccess: (
    input: SetPositionNavigationAccessInput,
    actor: PositionNavigationAccessActor,
  ) => Promise<PositionNavigationAccessChange | undefined>;
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

export class SystemAdministratorPositionAssignmentError extends Error {
  constructor() {
    super("Системная должность администратора доступна только исходному аккаунту admin.");
    this.name = "SystemAdministratorPositionAssignmentError";
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
  email: string | null;
  max_user_id: string | null;
  user_status: string;
  is_protected: number | boolean;
  is_protected_by_admin_rights: number | boolean;
  access_display_name: string;
  account_type: string;
  position_code: string;
  position_display_name: string;
  scope_kind: string;
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
  is_admin_protected: number | boolean;
  created_at: Date | string;
  usage_count: number | string;
};

type AccountPositionAssignmentRow = RowDataPacket & {
  access_id: string;
  user_id: string;
  login: string;
};

type DeletePositionRow = RowDataPacket & {
  account_type: string;
  is_admin_protected: number | boolean;
  usage_count: number | string;
};

type PositionOrderRow = RowDataPacket & {
  id: string;
  is_admin_protected: number | boolean;
};

type AdminRightsAccessRow = RowDataPacket & {
  is_admin_protected: number | boolean;
};

type IdRow = RowDataPacket & {
  id: string;
};

type PositionProtectionRow = RowDataPacket & {
  id: string;
  display_name: string;
  account_type: string;
  navigation_items: unknown;
  capabilities: unknown;
  is_admin_protected: number | boolean;
};

type UserStatusRow = RowDataPacket & {
  status: string;
  is_admin_protected: number | boolean;
};

type CanonicalAdminMutationActorRow = RowDataPacket & {
  login: string;
  status: string;
};

type UserMutationRow = UserStatusRow & {
  id: string;
};

const adminRightsAccessProtectionExpression = `
  exists (
    select 1
    from account_accesses protected_accesses
    join account_positions protected_positions
      on protected_positions.id = protected_accesses.position_code
    where protected_accesses.user_id = users.id
      and protected_accesses.is_active = 1
      and protected_positions.is_admin_protected = 1
  )
`;

const effectiveAccountProtectionExpression = `
  greatest(users.is_admin_protected, ${adminRightsAccessProtectionExpression})
`;

const accountRowSelect = `
  select
    accesses.id as access_id,
    users.id as user_id,
    users.login,
    users.display_name as user_display_name,
    users.email,
    users.max_user_id,
    users.status as user_status,
    ${effectiveAccountProtectionExpression} as is_protected,
    ${adminRightsAccessProtectionExpression} as is_protected_by_admin_rights,
    accesses.display_name as access_display_name,
    positions.account_type,
    accesses.position_code,
    positions.display_name as position_display_name,
    accesses.scope_kind,
    positions.capabilities,
    positions.navigation_items,
    accesses.created_at
  from account_accesses as accesses
  join app_users as users on users.id = accesses.user_id
  join account_positions as positions on positions.id = accesses.position_code
`;

const effectiveAccountProtectionSelect = `
  ${effectiveAccountProtectionExpression} as is_admin_protected
`;

export function createAccountsRepository(
  pool: DatabasePool,
  { createId = randomUUID }: AccountsRepositoryOptions = {},
): AccountsRepository {
  async function listAccounts() {
    const [rows] = await pool.query<AccountRow[]>(`
      ${accountRowSelect}
      where accesses.is_active = 1
      order by positions.sort_order asc, users.display_name asc,
        accesses.created_at desc, accesses.id desc
    `);

    return rows.map(mapAccountRow);
  }

  async function listPositions() {
    const [rows] = await pool.query<PositionRow[]>(`
      select positions.id, positions.display_name, positions.account_type,
        positions.navigation_items, positions.capabilities, positions.is_protected,
        positions.is_admin_protected,
        positions.created_at,
        (select count(*) from account_accesses accesses
          where accesses.position_code = positions.id) as usage_count
      from account_positions positions
      order by positions.sort_order asc, positions.display_name asc
    `);
    return rows.map(mapPositionRow);
  }

  async function createPosition(input: CreatePositionInput) {
    const id = `position-${createId()}`;
    const accountType = "business_owner" as const;
    await pool.query(
      `insert into account_positions (
        id, display_name, account_type, navigation_items, capabilities,
        is_protected, sort_order
      )
      select ?, ?, ?, ?, ?, 0, coalesce(max(sort_order), -1) + 1
      from account_positions`,
      [id, input.displayName, accountType,
        JSON.stringify(input.navigationItems), JSON.stringify(input.capabilities)],
    );
    return {
      id,
      ...input,
      accountType,
      boardAssignmentAccess: readBoardAssignmentAccess(
        input.capabilities,
        input.navigationItems,
      ),
      isProtected: false,
      hasAdminRights: false,
      usageCount: 0,
      createdAt: new Date().toISOString(),
    };
  }

  async function updatePosition(
    input: UpdatePositionInput,
    allowProtected = false,
  ) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const [rows] = await connection.query<PositionRow[]>(`
        select positions.id, positions.display_name, positions.account_type,
          positions.navigation_items, positions.capabilities, positions.is_protected,
          positions.is_admin_protected,
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
      assertProtectedPositionMutationAllowed({
        isProtected:
          current.is_admin_protected === true ||
          current.is_admin_protected === 1,
        allowProtected,
      });
      const hasAdminRights =
        current.is_admin_protected === true ||
        current.is_admin_protected === 1;
      const boardAssignmentAccess = readBoardAssignmentAccess(
        input.capabilities,
        input.navigationItems,
      );
      const navigationItems = resolveNavigationForPosition(
        input.navigationItems,
        hasAdminRights,
      );
      const capabilities = resolveCapabilitiesForPosition(
        input.id,
        navigationItems,
        boardAssignmentAccess,
        hasAdminRights,
      );
      await connection.query(
        `update account_positions
         set display_name = ?, navigation_items = ?, capabilities = ?
         where id = ?`,
        [
          input.displayName,
          JSON.stringify(navigationItems),
          JSON.stringify(capabilities),
          input.id,
        ],
      );
      await connection.query(
        `update account_accesses accesses
         set accesses.navigation_items = ?, accesses.capabilities = ?
         where accesses.position_code = ?`,
        [JSON.stringify(navigationItems), JSON.stringify(capabilities), input.id],
      );
      await connection.query(
        `delete sessions from auth_sessions sessions
         join account_accesses accesses on accesses.user_id = sessions.user_id
         where accesses.position_code = ?`,
        [input.id],
      );
      await connection.commit();
      return {
        ...mapPositionRow(current),
        displayName: input.displayName,
        navigationItems,
        capabilities,
        boardAssignmentAccess: readBoardAssignmentAccess(
          capabilities,
          navigationItems,
        ),
      };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async function deletePosition(
    id: string,
    allowProtected = false,
  ): Promise<DeletePositionResult> {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const [rows] = await connection.query<DeletePositionRow[]>(
        `select positions.account_type, positions.is_admin_protected,
          (select count(*) from account_accesses accesses
            where accesses.position_code = positions.id) as usage_count
         from account_positions positions
         where positions.id = ?
         limit 1 for update`,
        [id],
      );
      const position = rows[0];
      if (position === undefined) {
        await connection.rollback();
        return "not_found";
      }
      assertProtectedPositionMutationAllowed({
        isProtected:
          position.is_admin_protected === true ||
          position.is_admin_protected === 1,
        allowProtected,
      });
      if (position.account_type === "admin") {
        await connection.rollback();
        return "protected";
      }
      if (Number(position.usage_count) > 0) {
        await connection.rollback();
        return "in_use";
      }

      await connection.query("delete from account_positions where id = ?", [id]);
      await connection.commit();
      return "deleted";
    } catch (error) {
      await connection.rollback();
      if (isForeignKeyReferenceError(error)) {
        return "in_use";
      }
      throw error;
    } finally {
      connection.release();
    }
  }

  async function setPositionOrder(
    positionIds: string[],
    allowProtected = false,
  ) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const [rows] = await connection.query<PositionOrderRow[]>(
        `select id, is_admin_protected
         from account_positions
         order by sort_order asc, display_name asc
         for update`,
      );
      const currentIds = rows.map((row) => row.id);
      const requestedIds = new Set(positionIds);
      if (
        positionIds.length !== currentIds.length ||
        requestedIds.size !== positionIds.length ||
        currentIds.some((id) => !requestedIds.has(id))
      ) {
        await connection.rollback();
        return false;
      }
      if (!allowProtected) {
        const requestedIndexById = new Map(
          positionIds.map((id, index) => [id, index]),
        );
        const movesProtectedPosition = rows.some(
          (row, currentIndex) =>
            (row.is_admin_protected === true ||
              row.is_admin_protected === 1) &&
            requestedIndexById.get(row.id) !== currentIndex,
        );
        assertProtectedPositionMutationAllowed({
          isProtected: movesProtectedPosition,
          allowProtected,
        });
      }

      const orderCases = positionIds.map(() => "when ? then ?").join(" ");
      const placeholders = positionIds.map(() => "?").join(", ");
      await connection.query(
        `update account_positions
         set sort_order = case id ${orderCases} else sort_order end
         where id in (${placeholders})`,
        [
          ...positionIds.flatMap((id, index) => [id, index]),
          ...positionIds,
        ],
      );
      await connection.commit();
      return true;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async function setPositionProtected(input: SetPositionProtectedInput) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const [rows] = await connection.query<PositionProtectionRow[]>(
        `select id, display_name, account_type, navigation_items,
          capabilities, is_admin_protected
         from account_positions
         where id = ?
         limit 1
         for update`,
        [input.id],
      );
      const position = rows[0];
      if (position === undefined) {
        await connection.rollback();
        return undefined;
      }
      assertAdministratorPositionProtectionAllowed({
        accountType: position.account_type,
        isProtected: input.isProtected,
      });
      const accountType = position.account_type as AccountType;
      const storedNavigationItems = readNavigationItems(
        position.navigation_items,
        accountType,
      );
      const storedCapabilities = readCapabilities(position.capabilities);
      const boardAssignmentAccess = readBoardAssignmentAccess(
        storedCapabilities,
        storedNavigationItems,
      );
      const navigationItems = accountType === "admin"
        ? storedNavigationItems
        : resolveNavigationForPosition(
            storedNavigationItems,
            input.isProtected,
          );
      const capabilities = accountType === "admin"
        ? storedCapabilities
        : resolveCapabilitiesForPosition(
            position.id,
            navigationItems,
            boardAssignmentAccess,
            input.isProtected,
          );
      await connection.query(
        `update account_positions
         set is_admin_protected = ?, navigation_items = ?, capabilities = ?
         where id = ?`,
        [
          input.isProtected ? 1 : 0,
          JSON.stringify(navigationItems),
          JSON.stringify(capabilities),
          input.id,
        ],
      );
      await connection.query(
        `update account_accesses accesses
         set accesses.navigation_items = ?, accesses.capabilities = ?
         where accesses.position_code = ?`,
        [JSON.stringify(navigationItems), JSON.stringify(capabilities), input.id],
      );
      await connection.query(
        `delete sessions from auth_sessions sessions
         join account_accesses accesses on accesses.user_id = sessions.user_id
         where accesses.position_code = ?`,
        [input.id],
      );
      await connection.commit();
      return {
        ...input,
        displayName: position.display_name,
        previousIsProtected:
          position.is_admin_protected === true ||
          position.is_admin_protected === 1,
      };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async function setPositionNavigationAccess({
    navigationItem,
    positionIds,
    enabled,
  }: SetPositionNavigationAccessInput, actor: PositionNavigationAccessActor) {
    if (
      positionIds.length === 0 ||
      new Set(positionIds).size !== positionIds.length ||
      !nonAdminNavigationItems.includes(navigationItem)
    ) {
      return undefined;
    }

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const isSyntheticDevAdmin =
        actor.devAccessEnabled &&
        actor.userId === "dev-user-admin" &&
        actor.accessId === "dev-access-admin";
      if (!isSyntheticDevAdmin) {
        const [actorRows] = await connection.query<
          CanonicalAdminMutationActorRow[]
        >(
          `select login, status
           from app_users
           where id = ?
           limit 1
           for update`,
          [actor.userId],
        );
        const storedActor = actorRows[0];
        if (
          storedActor === undefined ||
          storedActor.status !== "active" ||
          !isCanonicalAdminLogin(storedActor.login)
        ) {
          throw new CanonicalAdminMutationRequiredError();
        }
      }
      const placeholders = positionIds.map(() => "?").join(", ");
      const [rows] = await connection.query<PositionRow[]>(
        `select positions.id, positions.display_name, positions.account_type,
          positions.navigation_items, positions.capabilities,
          positions.is_protected, positions.is_admin_protected,
          positions.created_at,
          (select count(*) from account_accesses accesses
            where accesses.position_code = positions.id) as usage_count
         from account_positions positions
         where positions.id in (${placeholders})
         order by positions.id
         for update`,
        positionIds,
      );
      if (
        rows.length !== positionIds.length ||
        rows.some((row) => row.account_type === "admin")
      ) {
        await connection.rollback();
        return undefined;
      }

      const changedPositions: PositionNavigationAccessChange["positions"] = [];
      for (const row of rows) {
        const accountType = row.account_type as AccountType;
        const currentNavigationItems = readNavigationItems(
          row.navigation_items,
          accountType,
        );
        const hasAdminRights =
          row.is_admin_protected === true || row.is_admin_protected === 1;
        const workingNavigationItems = resolveNavigationForPosition(
          currentNavigationItems,
          false,
        );
        const nextWorkingNavigationItems = enabled
          ? Array.from(new Set([...workingNavigationItems, navigationItem]))
          : workingNavigationItems.filter((item) => item !== navigationItem);
        const navigationItems = resolveNavigationForPosition(
          nextWorkingNavigationItems,
          hasAdminRights,
        );
        if (
          navigationItems.length === currentNavigationItems.length &&
          navigationItems.every((item, index) => item === currentNavigationItems[index])
        ) {
          continue;
        }
        const capabilities = resolveCapabilitiesForPosition(
          row.id,
          navigationItems,
          readBoardAssignmentAccess(
            readCapabilities(row.capabilities),
            currentNavigationItems,
          ),
          hasAdminRights,
        );
        await connection.query(
          `update account_positions
           set navigation_items = ?, capabilities = ?
           where id = ?`,
          [
            JSON.stringify(navigationItems),
            JSON.stringify(capabilities),
            row.id,
          ],
        );
        await connection.query(
          `update account_accesses accesses
           set accesses.navigation_items = ?, accesses.capabilities = ?
           where accesses.position_code = ?`,
          [
            JSON.stringify(navigationItems),
            JSON.stringify(capabilities),
            row.id,
          ],
        );
        await connection.query(
          `delete sessions from auth_sessions sessions
           join account_accesses accesses on accesses.user_id = sessions.user_id
           where accesses.position_code = ?`,
          [row.id],
        );
        changedPositions.push({ id: row.id, displayName: row.display_name });
      }

      await connection.commit();
      return {
        navigationItem,
        enabled,
        positions: changedPositions,
      } satisfies PositionNavigationAccessChange;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }
  async function createAccount(
    input: CreateAccountInput,
    allowProtected = false,
  ) {
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      if (
        (await readUserIdByLoginInTransaction(connection, input.login)) !==
        undefined
      ) {
        throw new AccountLoginAlreadyExistsError();
      }

      const positionId =
        input.position ?? defaultPositionByAccountType[input.accountType];
      const [positionRows] = await connection.query<PositionRow[]>(
        `select positions.id, positions.display_name, positions.account_type,
          positions.navigation_items, positions.capabilities,
          positions.is_protected, positions.is_admin_protected,
          positions.created_at,
          (select count(*) from account_accesses accesses
            where accesses.position_code = positions.id) as usage_count
         from account_positions positions
         where positions.id = ?
         limit 1 for update`,
        [positionId],
      );
      const targetPositionRow = positionRows[0];
      if (targetPositionRow === undefined) {
        throw new Error("Выбранная должность не найдена.");
      }
      assertProtectedPositionMutationAllowed({
        isProtected:
          targetPositionRow.is_admin_protected === true ||
          targetPositionRow.is_admin_protected === 1,
        allowProtected: allowProtected || isCanonicalAdminLogin(input.login),
      });
      const targetPosition = mapPositionRow(targetPositionRow);
      if (
        targetPosition.accountType === "admin" &&
        !isCanonicalAdminLogin(input.login)
      ) {
        throw new SystemAdministratorPositionAssignmentError();
      }

      const scope = resolveAccountProvisioningScope({
        accountType: targetPosition.accountType,
      });

      const userId = createId();

      try {
        await connection.query(
          `
            insert into app_users (
              id, login, display_name, email, max_user_id, status
            )
            values (?, ?, ?, ?, ?, 'active')
          `,
          [
            userId,
            input.login,
            input.displayName,
            input.email ?? null,
            input.maxUserId ?? null,
          ],
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
            capabilities,
            navigation_items,
            is_active
          )
          values (?, ?, ?, ?, ?, ?, ?, ?, 1)
        `,
        [
          accessId,
          userId,
          targetPosition.accountType,
          targetPosition.id,
          input.accessDisplayName ?? `${input.displayName} access`,
          scope.scopeKind,
          JSON.stringify(targetPosition.capabilities),
          JSON.stringify(targetPosition.navigationItems),
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

  async function resetPassword(
    { login, password }: ResetPasswordInput,
    allowProtected = false,
  ) {
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();
      const [rows] = await connection.query<UserMutationRow[]>(
        `select users.id, users.status, ${effectiveAccountProtectionSelect}
         from app_users users
         where users.login = ?
         limit 1 for update`,
        [login],
      );
      const user = rows[0];

      if (user === undefined || user.status === "archived") {
        await connection.rollback();
        return false;
      }
      assertProtectedAccountMutationAllowed({
        isProtected: await readEffectiveAccountProtectionForUpdate(
          connection,
          user.id,
          user.is_admin_protected === true || user.is_admin_protected === 1,
        ),
        allowProtected,
      });

      await connection.query(
        `insert into auth_password_credentials (user_id, password_hash)
         values (?, ?)
         on duplicate key update password_hash = values(password_hash)`,
        [user.id, await hashPassword(password)],
      );
      await connection.commit();
      return true;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async function setAccountLoginEnabled({
    userId,
    isEnabled,
  }: SetAccountLoginEnabledInput, allowProtected = false) {
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      const [rows] = await connection.query<UserStatusRow[]>(
        `
          select users.status, ${effectiveAccountProtectionSelect}
          from app_users users
          where users.id = ?
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
      assertProtectedAccountMutationAllowed({
        isProtected: await readEffectiveAccountProtectionForUpdate(
          connection,
          userId,
          rows[0]?.is_admin_protected === true ||
            rows[0]?.is_admin_protected === 1,
        ),
        allowProtected,
      });

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

  async function setAccountProtected({
    userId,
    isProtected,
  }: SetAccountProtectedInput) {
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();
      const [rows] = await connection.query<UserStatusRow[]>(
        `select status from app_users where id = ? limit 1 for update`,
        [userId],
      );
      const currentStatus = rows[0]?.status;

      if (currentStatus === undefined || currentStatus === "archived") {
        await connection.rollback();
        return undefined;
      }

      await connection.query(
        "update app_users set is_admin_protected = ? where id = ?",
        [isProtected ? 1 : 0, userId],
      );
      await connection.commit();
      return { userId, isProtected };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async function deleteAccount(userId: string, allowProtected = false) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const [rows] = await connection.query<UserStatusRow[]>(
        `select users.status, ${effectiveAccountProtectionSelect}
         from app_users users
         where users.id = ?
         limit 1 for update`,
        [userId],
      );
      const currentStatus = rows[0]?.status;
      if (currentStatus === undefined || currentStatus === "archived") {
        await connection.rollback();
        return false;
      }
      assertProtectedAccountMutationAllowed({
        isProtected: await readEffectiveAccountProtectionForUpdate(
          connection,
          userId,
          rows[0]?.is_admin_protected === true ||
            rows[0]?.is_admin_protected === 1,
        ),
        allowProtected,
      });

      await connection.query("update app_users set status = 'archived' where id = ?", [userId]);
      await connection.query("update account_accesses set is_active = 0 where user_id = ?", [userId]);
      await connection.query("delete from auth_sessions where user_id = ?", [userId]);
      await connection.commit();
      return true;
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

  async function setAccountPosition({
    accessId,
    position,
  }: SetAccountPositionInput, allowProtected = false) {
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      const [accessRows] = await connection.query<
        AccountPositionAssignmentRow[]
      >(
        `select accesses.id as access_id, accesses.user_id, users.login
         from account_accesses accesses
         join app_users users on users.id = accesses.user_id
         where accesses.id = ? and accesses.is_active = 1
         limit 1 for update`,
        [accessId],
      );
      const existing = accessRows[0];

      if (existing === undefined) {
        await connection.rollback();
        return undefined;
      }

      const [userRows] = await connection.query<UserStatusRow[]>(
        `select users.status, ${effectiveAccountProtectionSelect}
         from app_users users
         where users.id = ?
         limit 1 for update`,
        [existing.user_id],
      );
      if (userRows[0] === undefined || userRows[0].status === "archived") {
        await connection.rollback();
        return undefined;
      }
      assertProtectedAccountMutationAllowed({
        isProtected: await readEffectiveAccountProtectionForUpdate(
          connection,
          existing.user_id,
          userRows[0].is_admin_protected === true ||
            userRows[0].is_admin_protected === 1,
        ),
        allowProtected,
      });

      const previous = await readAccountByAccessId(connection, accessId);

      if (previous === undefined) {
        throw new Error("Current account access was not returned by database.");
      }

      if (previous.position === position) {
        await connection.commit();
        return { previous, updated: previous };
      }

      const [positionRows] = await connection.query<PositionRow[]>(
        `select positions.id, positions.display_name, positions.account_type,
          positions.navigation_items, positions.capabilities,
          positions.is_protected, positions.is_admin_protected,
          positions.created_at,
          (select count(*) from account_accesses accesses
            where accesses.position_code = positions.id) as usage_count
         from account_positions positions
         where positions.id = ?
         limit 1 for update`,
        [position],
      );
      const targetPositionRow = positionRows[0];

      if (targetPositionRow === undefined) {
        await connection.rollback();
        return undefined;
      }
      assertProtectedPositionMutationAllowed({
        isProtected:
          targetPositionRow.is_admin_protected === true ||
          targetPositionRow.is_admin_protected === 1,
        allowProtected,
      });
      if (
        targetPositionRow.account_type === "admin" &&
        !isCanonicalAdminLogin(existing.login)
      ) {
        throw new SystemAdministratorPositionAssignmentError();
      }

      const targetPosition = mapPositionRow(targetPositionRow);
      const scope = resolveAccountProvisioningScope({
        accountType: targetPosition.accountType,
      });

      await connection.query(
        `update account_accesses
         set account_type = ?, position_code = ?, scope_kind = ?,
           capabilities = ?, navigation_items = ?
         where id = ? and is_active = 1`,
        [
          targetPosition.accountType,
          targetPosition.id,
          scope.scopeKind,
          JSON.stringify(targetPosition.capabilities),
          JSON.stringify(targetPosition.navigationItems),
          accessId,
        ],
      );
      await connection.query("delete from auth_sessions where user_id = ?", [
        existing.user_id,
      ]);

      const updated = await readAccountByAccessId(connection, accessId);

      if (updated === undefined) {
        throw new Error("Updated account access was not returned by database.");
      }

      await connection.commit();
      return { previous, updated };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
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
    setAccountProtected,
    deleteAccount,
    setAccountNavigation,
    setAccountPosition,
    listPositions,
    createPosition,
    updatePosition,
    deletePosition,
    setPositionOrder,
    setPositionProtected,
    setPositionNavigationAccess,
  };
}

async function readEffectiveAccountProtectionForUpdate(
  connection: PoolConnection,
  userId: string,
  isExplicitlyProtected: boolean,
) {
  const [rows] = await connection.query<AdminRightsAccessRow[]>(
    `select protected_positions.is_admin_protected
     from account_accesses protected_accesses
     join account_positions protected_positions
       on protected_positions.id = protected_accesses.position_code
     where protected_accesses.user_id = ?
       and protected_accesses.is_active = 1
     order by protected_accesses.id, protected_positions.id
     for update`,
    [userId],
  );

  return isExplicitlyProtected || rows.some(
    (row) =>
      row.is_admin_protected === true || row.is_admin_protected === 1,
  );
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
    ...optionalText("email", row.email),
    ...optionalText("maxUserId", row.max_user_id),
    userStatus: readAdminUserStatus(row.user_status),
    isProtected: row.is_protected === true || row.is_protected === 1,
    isProtectedByAdminRights:
      row.is_protected_by_admin_rights === true ||
      row.is_protected_by_admin_rights === 1,
    accessDisplayName: row.access_display_name,
    accountType: row.account_type as AccountType,
    position: readPosition(row.position_code, row.account_type as AccountType),
    positionDisplayName: row.position_display_name,
    scope: buildScope(row),
    capabilities: readCapabilities(row.capabilities),
    navigationItems: readNavigationItems(row.navigation_items, row.account_type as AccountType),
    createdAt: toDate(row.created_at).toISOString(),
  };
}

function mapPositionRow(row: PositionRow): AdminPositionSummary {
  const accountType = row.account_type as AccountType;
  const navigationItems = readNavigationItems(row.navigation_items, accountType);
  const capabilities = readCapabilities(row.capabilities);
  return {
    id: row.id,
    displayName: row.display_name,
    accountType,
    navigationItems,
    capabilities,
    boardAssignmentAccess: readBoardAssignmentAccess(
      capabilities,
      navigationItems,
    ),
    isProtected: row.is_protected === true || row.is_protected === 1,
    hasAdminRights:
      row.is_admin_protected === true || row.is_admin_protected === 1,
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
  if (row.scope_kind === "platform") {
    return { kind: "platform" };
  }

  if (row.scope_kind === "organization") {
    return { kind: "organization" };
  }

  throw new Error("Stored account scope is not supported.");
}

function readCapabilities(value: unknown): AccountCapability[] {
  const parsed = typeof value === "string" ? safelyParseJson(value) : value;

  return Array.isArray(parsed) ? (parsed as AccountCapability[]) : [];
}

function optionalText<Key extends "email" | "maxUserId">(
  key: Key,
  value: string | null,
): Partial<Record<Key, string>> {
  const normalized = value?.trim();

  return normalized === undefined || normalized.length === 0
    ? {}
    : { [key]: normalized } as Record<Key, string>;
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

function isForeignKeyReferenceError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error.code === "ER_ROW_IS_REFERENCED_2" || error.code === "ER_ROW_IS_REFERENCED")
  );
}
