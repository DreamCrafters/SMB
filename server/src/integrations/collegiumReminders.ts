import { randomUUID } from "node:crypto";
import type { DirectorAssignment } from "../contracts/directorAssignments.js";
import { collegiumReminderPollMs, listCollegiumReminders } from "../domain/collegiumReminders.js";
import type { CollegiumInitiativesRepository } from "../repositories/collegiumInitiativesRepository.js";
import type { NotificationSettingsRepository } from "../repositories/notificationSettingsRepository.js";

type SendReminder = (recipient: string, subject: string, text: string, signal: AbortSignal) => Promise<void>;

/**
 * Фоновые напоминания и эскалации «Инициатив Коллегии». Каждый проход заново
 * читает инициативы, заседания, поручения, адресатов и каналы; доставка
 * захватывается в БД до отправки, поэтому перезапуск и несколько процессов не
 * дублируют сообщения. Включается флагом окружения (по умолчанию в production).
 */
export function createCollegiumReminderRunner({
  repository,
  assignments,
  notificationSettings,
  sendEmail,
  sendMax,
  now = () => new Date(),
  onError = () => console.warn("collegium_reminders.delivery_failed"),
}: {
  repository: Pick<
    CollegiumInitiativesRepository,
    "list" | "listMeetings" | "listUserIdsWithCapability" | "claimReminder" | "completeReminder"
  >;
  assignments: { listWithInitiativeLink: () => Promise<DirectorAssignment[]> };
  notificationSettings: Pick<NotificationSettingsRepository, "listDeliveryRecipients">;
  sendEmail?: SendReminder;
  sendMax?: SendReminder;
  now?: () => Date;
  onError?: () => void;
}) {
  let running: Promise<void> | undefined;
  const controller = new AbortController();

  async function deliver() {
    if (!sendEmail && !sendMax) return;
    const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Moscow" }).format(now());
    const [initiatives, meetings, linked] = await Promise.all([
      repository.list(),
      repository.listMeetings(),
      assignments.listWithInitiativeLink(),
    ]);
    const reminders = listCollegiumReminders({ today, initiatives, meetings, assignments: linked });
    if (reminders.length === 0) return;
    const viewers = new Set(await repository.listUserIdsWithCapability("business.view_collegium_initiatives"));
    const contacts = new Map<string, { email?: string; maxUserId?: string }>();
    for (const recipient of await notificationSettings.listDeliveryRecipients("collegium_initiatives")) {
      const current = contacts.get(recipient.userId) ?? {};
      contacts.set(recipient.userId, {
        email: current.email ?? recipient.email,
        maxUserId: current.maxUserId ?? recipient.maxUserId,
      });
    }
    const chairs = new Set<string>();
    if (reminders.some((reminder) => reminder.audienceCapability !== undefined)) {
      for (const userId of await repository.listUserIdsWithCapability("business.approve_collegium_initiatives")) {
        chairs.add(userId);
      }
    }
    for (const reminder of reminders) {
      const userIds = new Set(reminder.userIds);
      if (reminder.audienceCapability !== undefined) for (const userId of chairs) userIds.add(userId);
      for (const userId of userIds) {
        const contact = contacts.get(userId);
        if (!viewers.has(userId) || contact === undefined) continue;
        for (const channel of ["email", "max"] as const) {
          const send = channel === "email" ? sendEmail : sendMax;
          const address = channel === "email" ? contact.email : contact.maxUserId;
          if (send === undefined || address === undefined) continue;
          const delivery = {
            kind: reminder.kind,
            subjectId: reminder.subjectId,
            cycle: reminder.cycle,
            targetDate: reminder.targetDate,
            offset: reminder.offset,
            userId,
            channel,
          };
          const token = randomUUID();
          try {
            if (controller.signal.aborted) return;
            if (!await repository.claimReminder(delivery, token)) continue;
            await send(address, reminder.subject, reminder.text, controller.signal);
            await repository.completeReminder(delivery, token);
          } catch {
            onError();
          }
        }
      }
    }
  }

  return {
    async stop() {
      controller.abort();
      await running;
    },
    run() {
      if (controller.signal.aborted) return Promise.resolve();
      running ??= deliver().catch(() => onError()).finally(() => { running = undefined; });
      return running;
    },
  };
}

export function startCollegiumReminders(runner: ReturnType<typeof createCollegiumReminderRunner>) {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending: Promise<void> | undefined;
  function tick() {
    pending = runner.run().finally(() => {
      if (!stopped) {
        timer = setTimeout(tick, collegiumReminderPollMs);
        timer.unref();
      }
    });
  }
  tick();
  return async () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    await runner.stop();
    await pending;
  };
}
