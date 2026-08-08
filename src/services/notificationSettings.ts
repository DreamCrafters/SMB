import {
  notificationTypes,
  type LoginNotification,
  type NotificationSetting,
  type NotificationType,
  type UserNotificationSettings,
} from "../contracts/notificationSettings.js";
import { notificationTones } from "../contracts/notifications.js";
import { buildDevAccessHeaders } from "./devAccessSessionStorage.js";
import {
  describeRemoteNetworkFailure,
  resolveApiEndpoint,
} from "./remoteServer.js";

type RequestOptions = { baseUrl?: string; signal?: AbortSignal };
type ErrorResult = { status: "error"; message: string };
export type OwnNotificationSettingsResult =
  | { status: "ready"; settings: UserNotificationSettings }
  | ErrorResult;
export type AdminNotificationSettingsResult =
  | { status: "ready"; users: UserNotificationSettings[] }
  | ErrorResult;
export type LoginNotificationsResult =
  | { status: "ready"; notifications: LoginNotification[] }
  | ErrorResult;

export function requestOwnNotificationSettings(options: RequestOptions = {}) {
  return requestSettings("/api/notification-settings", "GET", undefined, options);
}

export function updateOwnNotificationSetting(
  type: NotificationType,
  value: { emailEnabled: boolean; maxEnabled: boolean },
  options: RequestOptions = {},
) {
  return requestSettings(
    `/api/notification-settings/${encodeURIComponent(type)}`,
    "PATCH",
    value,
    options,
  );
}

export async function requestAdminNotificationSettings(
  options: RequestOptions = {},
): Promise<AdminNotificationSettingsResult> {
  const result = await requestJson(
    "/api/admin/notification-settings",
    "GET",
    undefined,
    options,
  );

  return result.ok && isRecord(result.payload) &&
    Array.isArray(result.payload.users) &&
    result.payload.users.every(isUserNotificationSettings)
    ? { status: "ready", users: result.payload.users }
    : { status: "error", message: result.message ?? "Сервер вернул журнал рассылок в неподдерживаемом формате." };
}

export function updateAdminNotificationPermission(
  userId: string,
  type: NotificationType,
  adminEnabled: boolean,
  options: RequestOptions = {},
) {
  return requestSettings(
    `/api/admin/notification-settings/${encodeURIComponent(userId)}/${encodeURIComponent(type)}`,
    "PATCH",
    { adminEnabled },
    options,
  );
}

export function updateAdminNotificationContacts(
  userId: string,
  email: string,
  maxUserId: string,
  options: RequestOptions = {},
) {
  return requestSettings(
    `/api/admin/notification-settings/${encodeURIComponent(userId)}/contacts`,
    "PATCH",
    { email, maxUserId },
    options,
  );
}

export async function requestLoginNotifications(
  options: RequestOptions = {},
): Promise<LoginNotificationsResult> {
  const result = await requestJson(
    "/api/login-notifications",
    "POST",
    {},
    options,
  );

  return result.ok && isRecord(result.payload) &&
    Array.isArray(result.payload.notifications) &&
    result.payload.notifications.every(isLoginNotification)
    ? { status: "ready", notifications: result.payload.notifications }
    : { status: "error", message: result.message ?? "Сервер вернул уведомления в неподдерживаемом формате." };
}

async function requestSettings(
  path: string,
  method: "GET" | "PATCH",
  body: unknown,
  options: RequestOptions,
): Promise<OwnNotificationSettingsResult> {
  const result = await requestJson(path, method, body, options);

  return result.ok && isRecord(result.payload) &&
    isUserNotificationSettings(result.payload.settings)
    ? { status: "ready", settings: result.payload.settings }
    : { status: "error", message: result.message ?? "Сервер вернул настройки рассылок в неподдерживаемом формате." };
}

async function requestJson(
  path: string,
  method: "GET" | "POST" | "PATCH",
  body: unknown,
  { baseUrl, signal }: RequestOptions,
) {
  const endpoint = resolveApiEndpoint(path, path, { baseUrl });
  try {
    const response = await fetch(endpoint, {
      method,
      headers: buildDevAccessHeaders({
        Accept: "application/json",
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      }),
      credentials: "include",
      signal,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const payload: unknown = await response.json().catch(() => undefined);
    if (!response.ok) {
      return {
        ok: false as const,
        payload,
        message: readErrorMessage(payload) ?? "Не удалось выполнить запрос настроек рассылок.",
      };
    }
    return { ok: true as const, payload };
  } catch {
    return {
      ok: false as const,
      payload: undefined,
      message: describeRemoteNetworkFailure(
        "Не удалось связаться с сервером настроек рассылок.",
        { baseUrl },
      ),
    };
  }
}

function isUserNotificationSettings(value: unknown): value is UserNotificationSettings {
  return isRecord(value) &&
    typeof value.userId === "string" &&
    typeof value.displayName === "string" &&
    typeof value.position === "string" &&
    typeof value.positionDisplayName === "string" &&
    typeof value.isProtected === "boolean" &&
    (value.email === undefined || typeof value.email === "string") &&
    (value.maxUserId === undefined || typeof value.maxUserId === "string") &&
    Array.isArray(value.settings) &&
    value.settings.every(isNotificationSetting);
}

function isNotificationSetting(value: unknown): value is NotificationSetting {
  return isRecord(value) &&
    typeof value.type === "string" &&
    notificationTypes.includes(value.type as NotificationType) &&
    typeof value.label === "string" &&
    typeof value.adminEnabled === "boolean" &&
    typeof value.emailEnabled === "boolean" &&
    typeof value.maxEnabled === "boolean";
}

function isLoginNotification(value: unknown): value is LoginNotification {
  return isRecord(value) &&
    typeof value.title === "string" &&
    typeof value.message === "string" &&
    typeof value.tone === "string" &&
    notificationTones.includes(value.tone as LoginNotification["tone"]);
}

function readErrorMessage(value: unknown) {
  return isRecord(value) && isRecord(value.error) &&
    typeof value.error.message === "string"
    ? value.error.message
    : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
