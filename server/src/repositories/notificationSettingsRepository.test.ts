import assert from "node:assert/strict";
import test from "node:test";
import type { DatabasePool } from "../db/pool.js";
import { boardAssignmentOverdueLoginDeliveryKey } from "../domain/notificationSettings.js";
import {
  NotificationChannelUnavailableError,
  NotificationPermissionDisabledError,
  createNotificationSettingsRepository,
} from "./notificationSettingsRepository.js";

const accountRow = {
  user_id: "general-director-user",
  display_name: "Фридман Е.М.",
  login: "director",
  email: "director@example.com",
  max_user_id: null,
  is_admin_protected: 0,
  position_code: "general_director",
  position_display_name: "Генеральный директор",
};

test("notification settings repository expands missing rows from the server catalog", async () => {
  let userSql = "";
  const pool = {
    async query(sql: string) {
      if (sql.includes("from app_users users")) {
        userSql = sql.replace(/\s+/g, " ").trim();
        return [[accountRow], []];
      }
      if (sql.includes("from user_notification_settings")) {
        return [[{
          notification_type: "board_assignments",
          email_enabled: 1,
          max_enabled: 0,
        }], []];
      }
      if (sql.includes("from position_notification_permissions")) {
        return [[{
          position_code: "general_director",
          notification_type: "board_assignments",
          admin_enabled: 1,
        }], []];
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  } as unknown as DatabasePool;

  const result = await createNotificationSettingsRepository(pool)
    .readUserSettings("general-director-user");

  assert.equal(result?.settings.length, 10);
  assert.equal(result?.isProtected, false);
  assert.match(
    userSql,
    /protected_accesses\.user_id = users\.id.*protected_accesses\.is_active = 1.*protected_positions\.is_admin_protected = 1.*as is_admin_protected/u,
  );
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

test("account channels follow the permission of the account position", async () => {
  const permissionRows = [
    [] as unknown[],
    [{ admin_enabled: 1 }],
  ];
  let currentPermission = 0;
  const permissionQueries: unknown[][] = [];
  const connection = {
    async beginTransaction() {},
    async commit() {},
    async rollback() {},
    release() {},
    async query(sql: string, parameters: unknown[] = []) {
      if (sql.includes("from app_users")) {
        return [[{ email: "director@example.com", max_user_id: null }], []];
      }
      if (sql.includes("from account_accesses protected_accesses")) {
        return [[], []];
      }
      if (sql.includes("from account_accesses")) {
        return [[{ position_code: "general_director" }], []];
      }
      if (sql.includes("from position_notification_permissions")) {
        permissionQueries.push(parameters);
        return [permissionRows[currentPermission], []];
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
    repository.setUserChannels({
      userId: "general-director-user",
      type: "board_assignments",
      emailEnabled: true,
      maxEnabled: false,
    }),
    NotificationPermissionDisabledError,
  );

  currentPermission = 1;
  await assert.rejects(
    repository.setUserChannels({
      userId: "general-director-user",
      type: "board_assignments",
      emailEnabled: true,
      maxEnabled: true,
    }),
    NotificationChannelUnavailableError,
  );

  assert.deepEqual(permissionQueries, [
    ["general_director", "board_assignments"],
    ["general_director", "board_assignments"],
  ]);
});

test("delivery recipients are server-filtered by account status, position permission and selected channel", async () => {
  const pool = {
    async query(sql: string, parameters: unknown[]) {
      assert.match(sql, /users\.status = 'active'/u);
      assert.match(sql, /permissions\.admin_enabled = 1/u);
      assert.match(
        sql,
        /join position_notification_permissions permissions\s+on permissions\.position_code = accesses\.position_code/u,
      );
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

test("position permission is stored once and resets personal channels of its accounts", async () => {
  const writes: Array<{ sql: string; parameters: unknown[] }> = [];
  const connection = {
    async beginTransaction() {},
    async commit() {},
    async rollback() {},
    release() {},
    async query(sql: string, parameters: unknown[] = []) {
      if (sql.includes("from account_positions positions")) {
        return [[{
          id: "chief-accountant",
          display_name: "Главный бухгалтер",
          is_admin_protected: 0,
        }], []];
      }
      writes.push({ sql: sql.replace(/\s+/g, " ").trim(), parameters });
      return [{ affectedRows: 1 }, []];
    },
  };
  const pool = {
    async getConnection() {
      return connection;
    },
    async query(sql: string) {
      if (sql.includes("from account_positions positions")) {
        return [[{
          id: "chief-accountant",
          display_name: "Главный бухгалтер",
          is_admin_protected: 0,
        }], []];
      }
      if (sql.includes("from app_users users")) {
        return [[], []];
      }
      if (sql.includes("from position_notification_permissions")) {
        return [[{
          position_code: "chief-accountant",
          notification_type: "incidents",
          admin_enabled: 1,
        }], []];
      }
      if (sql.includes("from user_notification_settings")) {
        return [[], []];
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  } as unknown as DatabasePool;

  const updated = await createNotificationSettingsRepository(pool)
    .setPositionPermission({
      position: "chief-accountant",
      type: "incidents",
      adminEnabled: true,
    });

  assert.equal(updated?.positionDisplayName, "Главный бухгалтер");
  assert.equal(
    updated?.permissions.find(({ type }) => type === "incidents")?.adminEnabled,
    true,
  );
  assert.equal(writes.length, 2);
  assert.match(
    writes[0]?.sql ?? "",
    /insert into position_notification_permissions/u,
  );
  assert.deepEqual(writes[0]?.parameters, ["chief-accountant", "incidents", 1]);
  assert.match(writes[1]?.sql ?? "", /update user_notification_settings/u);
  assert.match(writes[1]?.sql ?? "", /email_enabled = 0, settings\.max_enabled = 0/u);
  assert.deepEqual(writes[1]?.parameters, ["chief-accountant", "incidents"]);
});

test("position notification list groups accounts and enabled types by position", async () => {
  const pool = {
    async query(sql: string) {
      if (sql.includes("from account_positions positions")) {
        return [[
          { id: "chief-accountant", display_name: "Главный бухгалтер" },
          { id: "delegated_administrator", display_name: "Делегированный администратор сайта" },
        ], []];
      }
      if (sql.includes("from app_users users")) {
        return [[
          {
            position_code: "chief-accountant",
            user_id: "accountant-user",
            display_name: "Бухгалтер Один",
            login: "accountant",
            email: "accountant@example.com",
            max_user_id: null,
          },
          {
            position_code: "chief-accountant",
            user_id: "accountant-user",
            display_name: "Бухгалтер Один",
            login: "accountant",
            email: "accountant@example.com",
            max_user_id: null,
          },
        ], []];
      }
      if (sql.includes("from position_notification_permissions")) {
        return [[{
          position_code: "chief-accountant",
          notification_type: "incidents",
          admin_enabled: 1,
        }], []];
      }
      if (sql.includes("from user_notification_settings")) {
        return [[{
          user_id: "accountant-user",
          notification_type: "incidents",
          email_enabled: 1,
          max_enabled: 0,
        }], []];
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  } as unknown as DatabasePool;

  const positions = await createNotificationSettingsRepository(pool)
    .listPositions();

  assert.deepEqual(positions.map(({ position }) => position), [
    "chief-accountant",
    "delegated_administrator",
  ]);
  assert.equal(positions[0]?.accounts.length, 1);
  assert.equal(positions[0]?.accounts[0]?.userId, "accountant-user");
  assert.equal(positions[0]?.accounts[0]?.email, "accountant@example.com");
  assert.equal(positions[0]?.accounts[0]?.channels.length, 10);
  assert.deepEqual(
    positions[0]?.accounts[0]?.channels.find(
      ({ type }) => type === "incidents",
    ),
    { type: "incidents", emailEnabled: true, maxEnabled: false },
  );
  assert.deepEqual(
    positions[0]?.accounts[0]?.channels.find(
      ({ type }) => type === "visitors",
    ),
    { type: "visitors", emailEnabled: false, maxEnabled: false },
  );
  assert.equal(positions[0]?.permissions.length, 10);
  assert.equal(
    positions[0]?.permissions.find(({ type }) => type === "incidents")
      ?.adminEnabled,
    true,
  );
  assert.equal(
    positions[0]?.permissions.find(({ type }) => type === "visitors")
      ?.adminEnabled,
    false,
  );
  assert.deepEqual(positions[1]?.accounts, []);
});

test("removing a contact keeps administrator permission and disables only the missing channel", async () => {
  const writes: Array<{ sql: string; parameters: unknown[] }> = [];
  const connection = {
    async beginTransaction() {},
    async commit() {},
    async rollback() {},
    release() {},
    async query(sql: string, parameters: unknown[] = []) {
      if (sql.includes("from app_users")) {
        return [[{
          email: "director@example.com",
          max_user_id: "101",
          is_admin_protected: 0,
        }], []];
      }
      if (sql.includes("from account_accesses protected_accesses")) {
        return [[], []];
      }
      writes.push({ sql, parameters });
      return [{ affectedRows: 1 }, []];
    },
  };
  const pool = {
    async getConnection() {
      return connection;
    },
  } as unknown as DatabasePool;

  await createNotificationSettingsRepository(pool).updateContacts({
    userId: "general-director-user",
    email: undefined,
    maxUserId: "101",
  });

  assert.equal(writes.length, 2);
  assert.doesNotMatch(writes[1]?.sql ?? "", /admin_enabled/u);
  assert.match(writes[1]?.sql ?? "", /email_enabled\s*=\s*case/u);
  assert.deepEqual(writes[1]?.parameters, [
    null,
    "101",
    "general-director-user",
  ]);
});

test("notification changes ignore account and position protection", async () => {
  const writes: Array<{ sql: string; parameters: unknown[] }> = [];
  const connection = {
    async beginTransaction() {},
    async commit() {},
    async rollback() {},
    release() {},
    async query(sql: string, parameters: unknown[] = []) {
      if (sql.includes("from account_positions positions")) {
        return [[{
          id: "delegated_administrator",
          display_name: "Делегированный администратор сайта",
        }], []];
      }
      if (sql.includes("from app_users")) {
        return [[{
          email: "protected@example.com",
          max_user_id: "101",
        }], []];
      }
      writes.push({ sql: sql.replace(/\s+/g, " ").trim(), parameters });
      return [{ affectedRows: 1 }, []];
    },
  };
  const pool = {
    async getConnection() {
      return connection;
    },
    async query(sql: string) {
      if (sql.includes("from account_positions positions")) {
        return [[{
          id: "delegated_administrator",
          display_name: "Делегированный администратор сайта",
        }], []];
      }
      if (sql.includes("from app_users users")) {
        return [[], []];
      }
      if (sql.includes("from position_notification_permissions")) {
        return [[], []];
      }
      if (sql.includes("from user_notification_settings")) {
        return [[], []];
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  } as unknown as DatabasePool;
  const repository = createNotificationSettingsRepository(pool);

  assert.equal(
    await repository.updateContacts({
      userId: "protected-user",
      email: "changed@example.com",
      maxUserId: "102",
    }),
    true,
  );
  const updated = await repository.setPositionPermission({
    position: "delegated_administrator",
    type: "incidents",
    adminEnabled: true,
  });

  assert.equal(updated?.positionDisplayName, "Делегированный администратор сайта");
  assert.deepEqual(
    writes.map(({ sql }) => sql.split(" ").slice(0, 3).join(" ")),
    [
      "update app_users set",
      "insert into position_notification_permissions",
      "update user_notification_settings settings",
    ],
  );
  assert.equal(
    writes.some(({ sql }) => sql.includes("protected_accesses")),
    false,
  );
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
