import type { CollegiumNotification } from "../domain/collegiumNotifications.js";
import { formatCollegiumNotificationText } from "../domain/collegiumNotifications.js";
import type { NotificationSettingsRepository } from "../repositories/notificationSettingsRepository.js";
import type { EmailNotificationService } from "./emailNotifications.js";
import type { MaxNotificationService } from "./maxNotifications.js";

type CapabilityReader = {
  listUserIdsWithCapability: (capability: string) => Promise<string[]>;
};

/**
 * Отправка уведомлений «Инициатив Коллегии» после ответа клиенту. Адресат
 * получает сообщение, только если сейчас видит инициативы и включил канал для
 * типа `collegium_initiatives`; автор действия исключается. Каждое письмо —
 * одному адресату, в лог уходит только стабильный код без адресов.
 */
export async function deliverCollegiumNotifications({
  notifications,
  people,
  notificationSettings,
  emailService,
  maxService,
  onError = () => console.warn("collegium_notifications.delivery_failed"),
}: {
  notifications: readonly CollegiumNotification[];
  people: CapabilityReader;
  notificationSettings: Pick<NotificationSettingsRepository, "listDeliveryRecipients">;
  emailService: Pick<EmailNotificationService, "sendTextNotification">;
  maxService: Pick<MaxNotificationService, "sendTextNotification">;
  onError?: () => void;
}) {
  if (notifications.length === 0) return;
  let viewers: Set<string>;
  let contacts: Map<string, { email?: string; maxUserId?: string }>;
  try {
    viewers = new Set(await people.listUserIdsWithCapability("business.view_collegium_initiatives"));
    contacts = new Map();
    // One user may be listed once per position; merge enabled channels.
    for (const recipient of await notificationSettings.listDeliveryRecipients("collegium_initiatives")) {
      const current = contacts.get(recipient.userId) ?? {};
      contacts.set(recipient.userId, {
        email: current.email ?? recipient.email,
        maxUserId: current.maxUserId ?? recipient.maxUserId,
      });
    }
  } catch {
    onError();
    return;
  }
  const audiences = new Map<string, string[]>();
  const sent = new Set<string>();
  for (const notification of notifications) {
    const userIds = new Set(notification.userIds);
    if (notification.audienceCapability !== undefined) {
      try {
        const audience = audiences.get(notification.audienceCapability) ??
          await people.listUserIdsWithCapability(notification.audienceCapability);
        audiences.set(notification.audienceCapability, audience);
        for (const userId of audience) userIds.add(userId);
      } catch {
        onError();
      }
    }
    userIds.delete(notification.actorUserId);
    const text = formatCollegiumNotificationText(notification);
    for (const userId of userIds) {
      const contact = contacts.get(userId);
      const dedupeKey = `${userId}\u0000${notification.subject}\u0000${text}`;
      if (!viewers.has(userId) || contact === undefined || sent.has(dedupeKey)) continue;
      sent.add(dedupeKey);
      if (contact.email !== undefined && emailService.sendTextNotification !== undefined) {
        try {
          await emailService.sendTextNotification([contact.email], notification.subject, text);
        } catch {
          onError();
        }
      }
      if (contact.maxUserId !== undefined && maxService.sendTextNotification !== undefined) {
        try {
          await maxService.sendTextNotification([contact.maxUserId], `${notification.subject}\n${text}`);
        } catch {
          onError();
        }
      }
    }
  }
}
