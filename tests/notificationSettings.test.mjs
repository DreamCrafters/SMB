import assert from "node:assert/strict";
import test from "node:test";
import {
  requestAdminNotificationSettings,
  requestLoginNotifications,
  requestOwnNotificationSettings,
  updateAdminNotificationContacts,
  updateAdminNotificationPermission,
  updateOwnNotificationSetting,
} from "../.test-build/src/services/notificationSettings.js";

const originalFetch = globalThis.fetch;
test.after(() => {
  globalThis.fetch = originalFetch;
});

const userSettings = {
  userId: "user-1",
  displayName: "Фридман Е.М.",
  position: "general_director",
  positionDisplayName: "Генеральный директор",
  isProtected: false,
  email: "director@example.com",
  maxUserId: "101",
  settings: [{
    type: "board_assignments",
    label: "Поручения Совета директоров",
    adminEnabled: true,
    emailEnabled: true,
    maxEnabled: false,
  }],
};

const positionSettings = {
  position: "general_director",
  positionDisplayName: "Генеральный директор",
  permissions: [{
    type: "board_assignments",
    label: "Поручения Совета директоров",
    adminEnabled: true,
  }],
  accounts: [{
    userId: "user-1",
    displayName: "Фридман Е.М.",
    login: "director",
    email: "director@example.com",
    maxUserId: "101",
  }],
};

test("notification service reads own settings and administrator position permissions", async () => {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return jsonResponse(calls.length === 1
      ? { settings: userSettings }
      : { positions: [positionSettings] });
  };

  const own = await requestOwnNotificationSettings({ baseUrl: "http://api.test" });
  const admin = await requestAdminNotificationSettings({ baseUrl: "http://api.test" });

  assert.equal(own.status, "ready");
  assert.equal(admin.status, "ready");
  assert.deepEqual(admin.positions, [positionSettings]);
  assert.deepEqual(calls.map(({ url }) => url), [
    "http://api.test/api/notification-settings",
    "http://api.test/api/admin/notification-settings",
  ]);
});

test("notification service rejects an administrator payload keyed by users", async () => {
  globalThis.fetch = async () => jsonResponse({ users: [userSettings] });

  const admin = await requestAdminNotificationSettings();

  assert.equal(admin.status, "error");
});

test("notification service writes only server-owned setting fields", async () => {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return jsonResponse(calls.length === 1
      ? { settings: userSettings }
      : { positions: [positionSettings] });
  };

  await updateOwnNotificationSetting("board_assignments", {
    emailEnabled: true,
    maxEnabled: false,
  });
  await updateAdminNotificationPermission(
    "general_director",
    "board_assignments",
    { adminEnabled: true },
  );
  await updateAdminNotificationContacts(
    "user-1",
    "director@example.com",
    "101",
  );

  assert.deepEqual(calls.map(({ init }) => JSON.parse(init.body)), [
    { emailEnabled: true, maxEnabled: false },
    { adminEnabled: true },
    { email: "director@example.com", maxUserId: "101" },
  ]);
  assert.deepEqual(calls.slice(1).map(({ url }) => url), [
    "/api/admin/notification-settings/positions/general_director/board_assignments",
    "/api/admin/notification-settings/user-1/contacts",
  ]);
});

test("login notification service accepts the board reminder payload", async () => {
  globalThis.fetch = async () => jsonResponse({
    notifications: [{
      title: "Совет директоров",
      message: "Необходимо подготовиться к Совету директоров на 15 число",
      tone: "suggestion",
    }],
  });

  const result = await requestLoginNotifications();

  assert.equal(result.status, "ready");
  assert.deepEqual(result.notifications[0], {
    title: "Совет директоров",
    message: "Необходимо подготовиться к Совету директоров на 15 число",
    tone: "suggestion",
  });
});

test("login notification service rejects messages without a semantic tone", async () => {
  globalThis.fetch = async () => jsonResponse({
    notifications: [{
      title: "Совет директоров",
      message: "Необходимо подготовиться к Совету директоров на 15 число",
    }],
  });

  const result = await requestLoginNotifications();

  assert.equal(result.status, "error");
});

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}
