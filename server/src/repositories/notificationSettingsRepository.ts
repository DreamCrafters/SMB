import type {
  PoolConnection,
  ResultSetHeader,
  RowDataPacket,
} from "mysql2/promise";
import type { DatabasePool } from "../db/pool.js";
import { assertProtectedAccountMutationAllowed } from "../domain/adminAccountProtection.js";
import { assertProtectedPositionMutationAllowed } from "../domain/adminPositionProtection.js";
import {
  notificationTypes,
  type LoginNotificationDeliveryKey,
  type NotificationType,
} from "../domain/notificationSettings.js";
import type { AccountPosition } from "../domain/auth.js";

export type NotificationSetting = {
  type: NotificationType;
  label: string;
  adminEnabled: boolean;
  emailEnabled: boolean;
  maxEnabled: boolean;
};

export type UserNotificationSettings = {
  userId: string;
  displayName: string;
  position: AccountPosition;
  positionDisplayName: string;
  isProtected: boolean;
  email?: string;
  maxUserId?: string;
  settings: NotificationSetting[];
};

export type PositionNotificationPermission = {
  type: NotificationType;
  label: string;
  adminEnabled: boolean;
};

export type PositionNotificationAccount = {
  userId: string;
  displayName: string;
  login: string;
  isProtected: boolean;
  email?: string;
  maxUserId?: string;
};

export type PositionNotificationSettings = {
  position: AccountPosition;
  positionDisplayName: string;
  hasAdminRights: boolean;
  permissions: PositionNotificationPermission[];
  accounts: PositionNotificationAccount[];
};

export type NotificationDeliveryRecipient = {
  userId: string;
  position: AccountPosition;
  email?: string;
  maxUserId?: string;
};

export type NotificationSettingsRepository = {
  listPositions: () => Promise<PositionNotificationSettings[]>;
  readUserSettings: (
    userId: string,
  ) => Promise<UserNotificationSettings | undefined>;
  setPositionPermission: (input: {
    position: AccountPosition;
    type: NotificationType;
    adminEnabled: boolean;
    allowProtectedPositionMutation: boolean;
  }) => Promise<PositionNotificationSettings | undefined>;
  setOwnChannels: (input: {
    userId: string;
    type: NotificationType;
    emailEnabled: boolean;
    maxEnabled: boolean;
  }) => Promise<void>;
  updateContacts: (input: {
    userId: string;
    email?: string;
    maxUserId?: string;
    allowProtectedAccountMutation: boolean;
  }) => Promise<boolean>;
  listDeliveryRecipients: (
    type: NotificationType,
  ) => Promise<NotificationDeliveryRecipient[]>;
  claimLoginDelivery: (input: {
    sessionId: string;
    deliveryKey: LoginNotificationDeliveryKey;
  }) => Promise<boolean>;
};

export class NotificationPermissionDisabledError extends Error {
  constructor() {
    super("Администратор не разрешил эту рассылку.");
    this.name = "NotificationPermissionDisabledError";
  }
}

export class NotificationChannelUnavailableError extends Error {
  constructor(channel: "email" | "max") {
    super(
      channel === "email"
        ? "Для учётной записи не указан Email."
        : "Для учётной записи не указан MAX.",
    );
    this.name = "NotificationChannelUnavailableError";
  }
}

type UserRow = RowDataPacket & {
  user_id: string;
  display_name: string;
  email: string | null;
  max_user_id: string | null;
  is_admin_protected: number | boolean;
  position_code: string;
  position_display_name: string;
};

type SettingRow = RowDataPacket & {
  notification_type: string;
  email_enabled: number | boolean;
  max_enabled: number | boolean;
};

type PositionRow = RowDataPacket & {
  id: string;
  display_name: string;
  is_admin_protected: number | boolean;
};

type PositionAccountRow = RowDataPacket & {
  position_code: string;
  user_id: string;
  display_name: string;
  login: string;
  email: string | null;
  max_user_id: string | null;
  is_admin_protected: number | boolean;
};

type PositionPermissionRow = RowDataPacket & {
  position_code: string;
  notification_type: string;
  admin_enabled: number | boolean;
};

type UserPositionRow = RowDataPacket & {
  position_code: string;
};

type ContactRow = RowDataPacket & {
  email: string | null;
  max_user_id: string | null;
  is_admin_protected: number | boolean;
};

type AdminRightsAccessRow = RowDataPacket & {
  is_admin_protected: number | boolean;
};

type AdminPermissionRow = RowDataPacket & {
  admin_enabled: number | boolean;
};

const positionSelect = `
  select positions.id, positions.display_name, positions.is_admin_protected
  from account_positions positions
`;

const positionAccountSelect = `
  select accesses.position_code, users.id as user_id, users.display_name,
    users.login, users.email, users.max_user_id,
    greatest(
      users.is_admin_protected,
      positions.is_admin_protected
    ) as is_admin_protected
  from app_users users
  join account_accesses accesses
    on accesses.user_id = users.id and accesses.is_active = 1
  join account_positions positions on positions.id = accesses.position_code
  where users.status <> 'archived'
`;

type DeliveryRecipientRow = RowDataPacket & {
  user_id: string;
  position_code: string;
  email: string | null;
  max_user_id: string | null;
  email_enabled: number | boolean;
  max_enabled: number | boolean;
};

const userSelect = `
  select users.id as user_id, users.display_name, users.email,
    users.max_user_id,
    greatest(
      users.is_admin_protected,
      exists (
        select 1
        from account_accesses protected_accesses
        join account_positions protected_positions
          on protected_positions.id = protected_accesses.position_code
        where protected_accesses.user_id = users.id
          and protected_accesses.is_active = 1
          and protected_positions.is_admin_protected = 1
      )
    ) as is_admin_protected,
    accesses.position_code,
    positions.display_name as position_display_name
  from app_users users
  join account_accesses accesses
    on accesses.user_id = users.id and accesses.is_active = 1
  join account_positions positions on positions.id = accesses.position_code
  where users.status <> 'archived'
`;

export function createNotificationSettingsRepository(
  pool: DatabasePool,
): NotificationSettingsRepository {
  async function listPositions() {
    const [positionRows] = await pool.query<PositionRow[]>(`
      ${positionSelect}
      order by positions.sort_order asc, positions.display_name asc
    `);
    const accountsByPosition = await readAccountsByPosition();
    const permissionsByPosition = await readPermissionsByPosition();

    return positionRows.map((position) => buildPositionSettings(
      position,
      accountsByPosition.get(position.id) ?? [],
      permissionsByPosition.get(position.id) ?? new Set<string>(),
    ));
  }

  async function readPositionSettings(position: AccountPosition) {
    const [positionRows] = await pool.query<PositionRow[]>(
      `${positionSelect} where positions.id = ? limit 1`,
      [position],
    );
    const stored = positionRows[0];
    if (stored === undefined) {
      return undefined;
    }
    const accountsByPosition = await readAccountsByPosition(position);
    const permissionsByPosition = await readPermissionsByPosition(position);

    return buildPositionSettings(
      stored,
      accountsByPosition.get(position) ?? [],
      permissionsByPosition.get(position) ?? new Set<string>(),
    );
  }

  async function readAccountsByPosition(position?: AccountPosition) {
    const [rows] = await pool.query<PositionAccountRow[]>(`
      ${positionAccountSelect}
      ${position === undefined ? "" : "and accesses.position_code = ?"}
      order by users.display_name asc, accesses.created_at desc, accesses.id desc
    `, position === undefined ? [] : [position]);
    const accountsByPosition = new Map<string, PositionNotificationAccount[]>();
    const seenUsers = new Set<string>();

    for (const row of rows) {
      if (seenUsers.has(row.user_id)) continue;
      seenUsers.add(row.user_id);
      const accounts = accountsByPosition.get(row.position_code) ?? [];
      accounts.push({
        userId: row.user_id,
        displayName: row.display_name,
        login: row.login,
        isProtected: readBoolean(row.is_admin_protected),
        ...optionalContact("email", row.email),
        ...optionalContact("maxUserId", row.max_user_id),
      });
      accountsByPosition.set(row.position_code, accounts);
    }

    return accountsByPosition;
  }

  async function readPermissionsByPosition(position?: AccountPosition) {
    const [rows] = await pool.query<PositionPermissionRow[]>(`
      select position_code, notification_type, admin_enabled
      from position_notification_permissions
      where admin_enabled = 1
      ${position === undefined ? "" : "and position_code = ?"}
    `, position === undefined ? [] : [position]);
    const permissionsByPosition = new Map<string, Set<string>>();

    for (const row of rows) {
      const types = permissionsByPosition.get(row.position_code) ?? new Set<string>();
      types.add(row.notification_type);
      permissionsByPosition.set(row.position_code, types);
    }

    return permissionsByPosition;
  }

  function buildPositionSettings(
    position: PositionRow,
    accounts: PositionNotificationAccount[],
    enabledTypes: ReadonlySet<string>,
  ) {
    return {
      position: position.id,
      positionDisplayName: position.display_name,
      hasAdminRights: readBoolean(position.is_admin_protected),
      permissions: notificationTypes.map(({ id, label }) => ({
        type: id,
        label,
        adminEnabled: enabledTypes.has(id),
      })),
      accounts,
    } satisfies PositionNotificationSettings;
  }

  async function readUserSettings(userId: string) {
    const [rows] = await pool.query<UserRow[]>(`
      ${userSelect} and users.id = ?
      order by accesses.created_at desc, accesses.id desc
      limit 1
    `, [userId]);
    const user = rows[0];

    return user === undefined ? undefined : readSettingsForUser(user);
  }

  async function readSettingsForUser(user: UserRow) {
    const [rows] = await pool.query<SettingRow[]>(`
      select notification_type, email_enabled, max_enabled
      from user_notification_settings
      where user_id = ?
    `, [user.user_id]);
    const settingByType = new Map(
      rows.map((row) => [row.notification_type, row]),
    );
    const permissionsByPosition = await readPermissionsByPosition(
      user.position_code,
    );
    const enabledTypes = permissionsByPosition.get(user.position_code) ??
      new Set<string>();

    return {
      userId: user.user_id,
      displayName: user.display_name,
      position: user.position_code,
      positionDisplayName: user.position_display_name,
      isProtected: readBoolean(user.is_admin_protected),
      ...optionalContact("email", user.email),
      ...optionalContact("maxUserId", user.max_user_id),
      settings: notificationTypes.map(({ id, label }) => {
        const stored = settingByType.get(id);

        return {
          type: id,
          label,
          adminEnabled: enabledTypes.has(id),
          emailEnabled: readBoolean(stored?.email_enabled),
          maxEnabled: readBoolean(stored?.max_enabled),
        };
      }),
    } satisfies UserNotificationSettings;
  }

  async function setPositionPermission({
    position,
    type,
    adminEnabled,
    allowProtectedPositionMutation,
  }: {
    position: AccountPosition;
    type: NotificationType;
    adminEnabled: boolean;
    allowProtectedPositionMutation: boolean;
  }) {
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();
      const [rows] = await connection.query<PositionRow[]>(
        `${positionSelect} where positions.id = ? limit 1 for update`,
        [position],
      );
      const stored = rows[0];
      if (stored === undefined) {
        await connection.rollback();
        return undefined;
      }
      assertProtectedPositionMutationAllowed({
        isProtected: readBoolean(stored.is_admin_protected),
        allowProtected: allowProtectedPositionMutation,
      });
      await connection.query(
        `insert into position_notification_permissions (
          position_code, notification_type, admin_enabled
        ) values (?, ?, ?)
        on duplicate key update admin_enabled = values(admin_enabled)`,
        [position, type, adminEnabled ? 1 : 0],
      );
      await connection.query(
        `update user_notification_settings settings
         join account_accesses accesses
           on accesses.user_id = settings.user_id and accesses.is_active = 1
         set settings.email_enabled = 0, settings.max_enabled = 0
         where accesses.position_code = ? and settings.notification_type = ?`,
        [position, type],
      );
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }

    return readPositionSettings(position);
  }

  async function setOwnChannels({
    userId,
    type,
    emailEnabled,
    maxEnabled,
  }: {
    userId: string;
    type: NotificationType;
    emailEnabled: boolean;
    maxEnabled: boolean;
  }) {
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();
      const contact = await readContactForUpdate(connection, userId);
      const permission = await readPositionPermissionForUpdate(
        connection,
        userId,
        type,
      );

      if (!readBoolean(permission?.admin_enabled)) {
        throw new NotificationPermissionDisabledError();
      }
      if (emailEnabled && normalizeOptional(contact?.email) === undefined) {
        throw new NotificationChannelUnavailableError("email");
      }
      if (maxEnabled && normalizeOptional(contact?.max_user_id) === undefined) {
        throw new NotificationChannelUnavailableError("max");
      }

      await connection.query(
        `insert into user_notification_settings (
          user_id, notification_type, email_enabled, max_enabled
        ) values (?, ?, ?, ?)
        on duplicate key update
          email_enabled = values(email_enabled),
          max_enabled = values(max_enabled)`,
        [userId, type, emailEnabled ? 1 : 0, maxEnabled ? 1 : 0],
      );
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async function updateContacts({
    userId,
    email,
    maxUserId,
    allowProtectedAccountMutation,
  }: {
    userId: string;
    email?: string;
    maxUserId?: string;
    allowProtectedAccountMutation: boolean;
  }) {
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();
      const contact = await readContactForUpdate(connection, userId);
      if (contact === undefined) {
        await connection.rollback();
        return false;
      }
      assertProtectedAccountMutationAllowed({
        isProtected: readBoolean(contact.is_admin_protected),
        allowProtected: allowProtectedAccountMutation,
      });

      const normalizedEmail = normalizeOptional(email);
      const normalizedMaxUserId = normalizeOptional(maxUserId);
      await connection.query(
        "update app_users set email = ?, max_user_id = ? where id = ?",
        [normalizedEmail ?? null, normalizedMaxUserId ?? null, userId],
      );
      if (normalizedEmail === undefined || normalizedMaxUserId === undefined) {
        await connection.query(
          `update user_notification_settings
           set email_enabled = case when ? is null then 0 else email_enabled end,
             max_enabled = case when ? is null then 0 else max_enabled end
           where user_id = ?`,
          [
            normalizedEmail ?? null,
            normalizedMaxUserId ?? null,
            userId,
          ],
        );
      }
      await connection.commit();
      return true;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async function listDeliveryRecipients(type: NotificationType) {
    const [rows] = await pool.query<DeliveryRecipientRow[]>(
      `select distinct users.id as user_id, accesses.position_code,
        users.email, users.max_user_id,
        settings.email_enabled, settings.max_enabled
      from user_notification_settings settings
      join app_users users on users.id = settings.user_id
      join account_accesses accesses
        on accesses.user_id = users.id and accesses.is_active = 1
      join position_notification_permissions permissions
        on permissions.position_code = accesses.position_code
        and permissions.notification_type = settings.notification_type
      where settings.notification_type = ?
        and permissions.admin_enabled = 1
        and users.status = 'active'
        and (settings.email_enabled = 1 or settings.max_enabled = 1)`,
      [type],
    );

    return rows.map((row) => ({
      userId: row.user_id,
      position: row.position_code,
      ...(readBoolean(row.email_enabled)
        ? optionalContact("email", row.email)
        : {}),
      ...(readBoolean(row.max_enabled)
        ? optionalContact("maxUserId", row.max_user_id)
        : {}),
    }));
  }

  async function claimLoginDelivery({
    sessionId,
    deliveryKey,
  }: {
    sessionId: string;
    deliveryKey: LoginNotificationDeliveryKey;
  }) {
    const [result] = await pool.query<ResultSetHeader>(
      `insert ignore into auth_session_notification_deliveries (
        session_id, delivery_key
      )
      select id, ? from auth_sessions where id = ?`,
      [deliveryKey, sessionId],
    );

    return result.affectedRows === 1;
  }

  return {
    listPositions,
    readUserSettings,
    setPositionPermission,
    setOwnChannels,
    updateContacts,
    listDeliveryRecipients,
    claimLoginDelivery,
  };
}

async function readContactForUpdate(
  connection: PoolConnection,
  userId: string,
) {
  const [rows] = await connection.query<ContactRow[]>(
    `select users.email, users.max_user_id, users.is_admin_protected
     from app_users users
     where users.id = ? and users.status <> 'archived'
     limit 1 for update`,
    [userId],
  );
  const contact = rows[0];
  if (contact === undefined) {
    return undefined;
  }
  const [adminRightsRows] = await connection.query<AdminRightsAccessRow[]>(
    `select positions.is_admin_protected
     from account_accesses protected_accesses
     join account_positions positions
       on positions.id = protected_accesses.position_code
     where protected_accesses.user_id = ?
       and protected_accesses.is_active = 1
     order by protected_accesses.id, positions.id
     for update`,
    [userId],
  );

  return {
    ...contact,
    is_admin_protected:
      readBoolean(contact.is_admin_protected) ||
      adminRightsRows.some((row) => readBoolean(row.is_admin_protected)),
  };
}

async function readPositionPermissionForUpdate(
  connection: PoolConnection,
  userId: string,
  type: NotificationType,
) {
  const [positionRows] = await connection.query<UserPositionRow[]>(
    `select position_code from account_accesses
     where user_id = ? and is_active = 1
     order by created_at desc, id desc
     limit 1`,
    [userId],
  );
  const position = positionRows[0]?.position_code;
  if (position === undefined) {
    return undefined;
  }
  const [rows] = await connection.query<AdminPermissionRow[]>(
    `select admin_enabled from position_notification_permissions
     where position_code = ? and notification_type = ?
     limit 1 for update`,
    [position, type],
  );

  return rows[0];
}

function dedupeUsers(rows: readonly UserRow[]) {
  const seen = new Set<string>();

  return rows.filter((row) => {
    if (seen.has(row.user_id)) {
      return false;
    }
    seen.add(row.user_id);
    return true;
  });
}

function optionalContact<Key extends "email" | "maxUserId">(
  key: Key,
  value: string | null,
): Partial<Record<Key, string>> {
  const normalized = normalizeOptional(value);

  return normalized === undefined ? {} : { [key]: normalized } as Record<Key, string>;
}

function normalizeOptional(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized === undefined || normalized.length === 0
    ? undefined
    : normalized;
}

function readBoolean(value: number | boolean | undefined) {
  return value === true || value === 1;
}
