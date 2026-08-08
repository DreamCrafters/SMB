import assert from "node:assert/strict";
import test from "node:test";
import type { DatabasePool } from "../db/pool.js";
import { ProtectedAccountMutationError } from "../domain/adminAccountProtection.js";
import { boardAssignmentOverdueLoginDeliveryKey } from "../domain/notificationSettings.js";
import {
  NotificationChannelUnavailableError,
  NotificationPermissionDisabledError,
  createNotificationSettingsRepository,
} from "./notificationSettingsRepository.js";

const accountRow = {
  user_id: "general-director-user",
  display_name: "Фридман Е.М.",
  email: "director@example.com",
  max_user_id: null,
  is_admin_protected: 0,
  position_code: "general_director",
  position_display_name: "Генеральный директор",
};

test("notification settings repository expands missing rows from the server catalog", async () => {
  const pool = {
    async query(sql: string) {
      if (sql.includes("from app_users users")) {
        return [[accountRow], []];
      }
      if (sql.includes("from user_notification_settings")) {
        return [[{
          notification_type: "board_assignments",
          admin_enabled: 1,
          email_enabled: 1,
          max_enabled: 0,
        }], []];
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  } as unknown as DatabasePool;

  const result = await createNotificationSettingsRepository(pool)
    .readUserSettings("general-director-user");

  assert.equal(result?.settings.length, 10);
  assert.equal(result?.isProtected, false);
  assert.deepEqual(result?.settings.find(
    ({ type }) => type === "board_assignments",
  ), {
    type: "board_assignments",
    label: "Поручения Совета директоров",
    adminEnabled: true,
    emailEnabled: true,
    maxEnabled: false,
  });
  assert.deepEqual(result?.settings.find(({ type }) => type === "incidents"), {
    type: "incidents",
    label: "Инциденты",
    adminEnabled: false,
    emailEnabled: false,
    maxEnabled: false,
  });
});

test("own notification channels require administrator permission and stored contacts", async () => {
  const settingRows = [
    { admin_enabled: 0 },
    { admin_enabled: 1 },
  ];
  let currentSetting = 0;
  const connection = {
    async beginTransaction() {},
    async commit() {},
    async rollback() {},
    release() {},
    async query(sql: string) {
      if (sql.includes("from app_users")) {
        return [[{ email: "director@example.com", max_user_id: null }], []];
      }
      if (sql.includes("from user_notification_settings")) {
        return [[settingRows[currentSetting]], []];
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  };
  const pool = {
    async getConnection() {
      return connection;
    },
  } as unknown as DatabasePool;
  const repository = createNotificationSettingsRepository(pool);

  await assert.rejects(
    repository.setOwnChannels({
      userId: "general-director-user",
      type: "board_assignments",
      emailEnabled: true,
      maxEnabled: false,
    }),
    NotificationPermissionDisabledError,
  );

  currentSetting = 1;
  await assert.rejects(
    repository.setOwnChannels({
      userId: "general-director-user",
      type: "board_assignments",
      emailEnabled: true,
      maxEnabled: true,
    }),
    NotificationChannelUnavailableError,
  );
});

test("delivery recipients are server-filtered by account status, permission and selected channel", async () => {
  const pool = {
    async query(sql: string, parameters: unknown[]) {
      assert.match(sql, /users\.status = 'active'/u);
      assert.match(sql, /settings\.admin_enabled = 1/u);
      assert.deepEqual(parameters, ["board_assignments"]);
      return [[
        {
          user_id: "general-director-user",
          position_code: "general_director",
          email: "director@example.com",
          max_user_id: "max-director",
          email_enabled: 1,
          max_enabled: 0,
        },
        {
          user_id: "board-user",
          position_code: "board_member",
          email: "board@example.com",
          max_user_id: "max-board",
          email_enabled: 0,
          max_enabled: 1,
        },
      ], []];
    },
  } as unknown as DatabasePool;

  assert.deepEqual(
    await createNotificationSettingsRepository(pool).listDeliveryRecipients(
      "board_assignments",
    ),
    [
      {
        userId: "general-director-user",
        position: "general_director",
        email: "director@example.com",
      },
      {
        userId: "board-user",
        position: "board_member",
        maxUserId: "max-board",
      },
    ],
  );
});

test("administrative notification changes recheck protected accounts under lock", async () => {
  let writeCount = 0;
  const connection = {
    async beginTransaction() {},
    async commit() {},
    async rollback() {},
    release() {},
    async query(sql: string) {
      if (sql.includes("from app_users")) {
        return [[{
          email: "protected@example.com",
          max_user_id: "101",
          is_admin_protected: 1,
        }], []];
      }
      writeCount += 1;
      return [{ affectedRows: 1 }, []];
    },
  };
  const pool = {
    async getConnection() {
      return connection;
    },
  } as unknown as DatabasePool;
  const repository = createNotificationSettingsRepository(pool);

  await assert.rejects(
    repository.updateContacts({
      userId: "protected-user",
      email: "changed@example.com",
      maxUserId: "102",
      allowProtectedAccountMutation: false,
    }),
    ProtectedAccountMutationError,
  );
  await assert.rejects(
    repository.setAdminEnabled({
      userId: "protected-user",
      type: "incidents",
      adminEnabled: true,
      allowProtectedAccountMutation: false,
    }),
    ProtectedAccountMutationError,
  );
  assert.equal(writeCount, 0);
});

test("login delivery claim is atomic and persistent for one auth session", async () => {
  const parameters: unknown[][] = [];
  let affectedRows = 1;
  const pool = {
    async query(sql: string, values: unknown[]) {
      assert.match(sql, /insert ignore into auth_session_notification_deliveries/u);
      assert.match(sql, /select id, \? from auth_sessions where id = \?/u);
      parameters.push(values);
      const result = { affectedRows };
      affectedRows = 0;
      return [result, []];
    },
  } as unknown as DatabasePool;
  const repository = createNotificationSettingsRepository(pool);
  const input = {
    sessionId: "auth-session",
    deliveryKey: boardAssignmentOverdueLoginDeliveryKey,
  };

  assert.equal(await repository.claimLoginDelivery(input), true);
  assert.equal(await repository.claimLoginDelivery(input), false);
  assert.deepEqual(parameters, [
    [boardAssignmentOverdueLoginDeliveryKey, "auth-session"],
    [boardAssignmentOverdueLoginDeliveryKey, "auth-session"],
  ]);
});
