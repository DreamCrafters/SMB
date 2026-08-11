import type { NotificationTone } from "./notifications.js";

export const notificationTypes = [
  "incidents",
  "visitors",
  "equipment_reports",
  "production_reports",
  "sales",
  "shipments",
  "laboratory_samples",
  "laboratory_analyses",
  "board_assignments",
  "general_director_assignments",
] as const;

export type NotificationType = (typeof notificationTypes)[number];

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
  position: string;
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
  position: string;
  positionDisplayName: string;
  hasAdminRights: boolean;
  permissions: PositionNotificationPermission[];
  accounts: PositionNotificationAccount[];
};

export type LoginNotification = {
  title: string;
  message: string;
  tone: NotificationTone;
};
