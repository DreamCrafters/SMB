import type { AccountPosition } from "../domain/auth.js";
import { boardAssignmentNotificationType } from "../domain/notificationSettings.js";
import type { EmailNotificationService } from "../integrations/emailNotifications.js";
import type { MaxNotificationService } from "../integrations/maxNotifications.js";
import type {
  NotificationDeliveryRecipient,
  NotificationSettingsRepository,
} from "../repositories/notificationSettingsRepository.js";

const boardPositions = new Set<AccountPosition>([
  "board_chair",
  "board_deputy_chair",
  "board_assignment_reviewer",
  "board_member",
]);
type DeliveryDependencies = {
  repository: Pick<NotificationSettingsRepository, "listDeliveryRecipients">;
  emailService: EmailNotificationService;
  maxService: MaxNotificationService;
};

export async function sendBoardAssignmentReviewNotification({
  repository,
  emailService,
  maxService,
  notification,
}: DeliveryDependencies & {
  notification: { subject: string; text: string };
}) {
  const recipients = await repository.listDeliveryRecipients(
    boardAssignmentNotificationType,
  );

  await deliverTextNotification({
    emailService,
    maxService,
    recipients,
    subject: notification.subject,
    text: notification.text,
  });
}

export async function sendOverdueBoardAssignmentNotification({
  repository,
  emailService,
  maxService,
  message,
}: DeliveryDependencies & { message: string }) {
  const recipients = await repository.listDeliveryRecipients(
    boardAssignmentNotificationType,
  );
  const positions = new Set<AccountPosition>([
    ...boardPositions,
    "general_director",
  ]);

  await deliverTextNotification({
    emailService,
    maxService,
    recipients,
    subject: "Просрочено поручение Совета директоров",
    text: message,
    emailPositions: new Set<AccountPosition>(),
    maxPositions: positions,
  });
}

async function deliverTextNotification({
  emailService,
  maxService,
  recipients,
  subject,
  text,
  emailPositions,
  maxPositions,
}: {
  emailService: EmailNotificationService;
  maxService: MaxNotificationService;
  recipients: readonly NotificationDeliveryRecipient[];
  subject: string;
  text: string;
  emailPositions?: ReadonlySet<AccountPosition>;
  maxPositions?: ReadonlySet<AccountPosition>;
}) {
  const emailRecipients = dedupe(
    recipients
      .filter(({ position }) => emailPositions?.has(position) ?? true)
      .flatMap(({ email }) => email === undefined ? [] : [email]),
  );
  const maxRecipients = dedupe(
    recipients
      .filter(({ position }) => maxPositions?.has(position) ?? true)
      .flatMap(({ maxUserId }) => maxUserId === undefined ? [] : [maxUserId]),
  );

  await Promise.all([
    emailService.sendTextNotification?.(emailRecipients, subject, text),
    maxService.sendTextNotification?.(maxRecipients, text),
  ]);
}

function dedupe(values: readonly string[]) {
  return Array.from(new Set(values));
}
