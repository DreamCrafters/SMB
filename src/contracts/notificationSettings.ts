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

export type LoginNotification = {
  title: string;
  message: string;
};
