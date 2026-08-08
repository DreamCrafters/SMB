import type {
  PoolConnection,
  ResultSetHeader,
  RowDataPacket,
} from "mysql2/promise";
import type { DatabasePool } from "../db/pool.js";
import { assertProtectedAccountMutationAllowed } from "../domain/adminAccountProtection.js";
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

export type NotificationDeliveryRecipient = {
  userId: string;
  position: AccountPosition;
  email?: string;
  maxUserId?: string;
};

export type NotificationSettingsRepository = {
  listUsers: () => Promise<UserNotificationSettings[]>;
  readUserSettings: (
    userId: string,
  ) => Promise<UserNotificationSettings | undefined>;
  setAdminEnabled: (input: {
    userId: string;
    type: NotificationType;
    adminEnabled: boolean;
    allowProtectedAccountMutation: boolean;
  }) => Promise<boolean>;
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
  admin_enabled: number | boolean;
  email_enabled: number | boolean;
  max_enabled: number | boolean;
};

type ContactRow = RowDataPacket & {
  email: string | null;
  max_user_id: string | null;
  is_admin_protected: number | boolean;
};

type AdminPermissionRow = RowDataPacket & {
  admin_enabled: number | boolean;
};

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
    users.max_user_id, users.is_admin_protected, accesses.position_code,
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
  async function listUsers() {
    const [rows] = await pool.query<UserRow[]>(`
      ${userSelect}
      order by positions.sort_order asc, users.display_name asc,
        accesses.created_at desc, accesses.id desc
    `);
    const users = dedupeUsers(rows);

    return Promise.all(users.map((user) => readSettingsForUser(user)));
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
      select notification_type, admin_enabled, email_enabled, max_enabled
      from user_notification_settings
      where user_id = ?
    `, [user.user_id]);
    const settingByType = new Map(
      rows.map((row) => [row.notification_type, row]),
    );

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
          adminEnabled: readBoolean(stored?.admin_enabled),
          emailEnabled: readBoolean(stored?.email_enabled),
          maxEnabled: readBoolean(stored?.max_enabled),
        };
      }),
    } satisfies UserNotificationSettings;
  }

  async function setAdminEnabled({
    userId,
    type,
    adminEnabled,
    allowProtectedAccountMutation,
  }: {
    userId: string;
    type: NotificationType;
    adminEnabled: boolean;
    allowProtectedAccountMutation: boolean;
  }) {
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();
      const account = await readContactForUpdate(connection, userId);
      if (account === undefined) {
        await connection.rollback();
        return false;
      }
      assertProtectedAccountMutationAllowed({
        isProtected: readBoolean(account.is_admin_protected),
        allowProtected: allowProtectedAccountMutation,
      });
      await connection.query(
        `insert into user_notification_settings (
          user_id, notification_type, admin_enabled
        ) values (?, ?, ?)
        on duplicate key update admin_enabled = values(admin_enabled)`,
        [userId, type, adminEnabled ? 1 : 0],
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
      const permission = await readPermissionForUpdate(connection, userId, type);

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
          user_id, notification_type, admin_enabled, email_enabled, max_enabled
        ) values (?, ?, 1, ?, ?)
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
          [normalizedEmail ?? null, normalizedMaxUserId ?? null, userId],
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
      where settings.notification_type = ?
        and settings.admin_enabled = 1
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
    listUsers,
    readUserSettings,
    setAdminEnabled,
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
    `select email, max_user_id, is_admin_protected from app_users
     where id = ? and status <> 'archived'
     limit 1 for update`,
    [userId],
  );

  return rows[0];
}

async function readPermissionForUpdate(
  connection: PoolConnection,
  userId: string,
  type: NotificationType,
) {
  const [rows] = await connection.query<AdminPermissionRow[]>(
    `select admin_enabled from user_notification_settings
     where user_id = ? and notification_type = ?
     limit 1 for update`,
    [userId, type],
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
