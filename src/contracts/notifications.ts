export const notificationTones = [
  "warning",
  "suggestion",
  "success",
] as const;

export type NotificationTone = (typeof notificationTones)[number];
