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
const reviewEmailPositions = new Set<AccountPosition>([
  "board_chair",
  "board_deputy_chair",
  "board_assignment_reviewer",
]);
const reviewMaxPositions = new Set<AccountPosition>([
  "board_deputy_chair",
  "board_assignment_reviewer",
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
    emailPositions: reviewEmailPositions,
    maxPositions: reviewMaxPositions,
  });
}

export async function sendOverdueBoardAssignmentNotifications({
  repository,
  emailService,
  maxService,
  messages,
}: DeliveryDependencies & { messages: readonly string[] }) {
  if (messages.length === 0) {
    return;
  }

  const recipients = await repository.listDeliveryRecipients(
    boardAssignmentNotificationType,
  );
  const positions = new Set<AccountPosition>([
    ...boardPositions,
    "general_director",
  ]);

  const results = await Promise.allSettled(messages.map((message) =>
    deliverTextNotification({
      emailService,
      maxService,
      recipients,
      subject: "Просрочено поручение Совета директоров",
      text: message,
      emailPositions: new Set<AccountPosition>(),
      maxPositions: positions,
    })
  ));
  const failures = results.filter(
    (result): result is PromiseRejectedResult => result.status === "rejected",
  );

  if (failures.length > 0) {
    throw new AggregateError(
      failures.map(({ reason }) => reason),
      "Не удалось отправить одно или несколько сообщений о просроченных поручениях.",
    );
  }
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
  emailPositions: ReadonlySet<AccountPosition>;
  maxPositions: ReadonlySet<AccountPosition>;
}) {
  const emailRecipients = dedupe(
    recipients
      .filter(({ position }) => emailPositions.has(position))
      .flatMap(({ email }) => email === undefined ? [] : [email]),
  );
  const maxRecipients = dedupe(
    recipients
      .filter(({ position }) => maxPositions.has(position))
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
