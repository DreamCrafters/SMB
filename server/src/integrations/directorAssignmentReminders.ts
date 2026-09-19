import { randomUUID } from "node:crypto";
import { buildDirectorAssignmentReminder, directorAssignmentReminderDays, directorReminderPollMs, type DirectorReminderDelivery } from "../domain/directorAssignmentReminders.js";
import type { DirectorAssignmentsRepository } from "../repositories/directorAssignmentsRepository.js";
import type { NotificationSettingsRepository } from "../repositories/notificationSettingsRepository.js";

type ReminderRepository = Pick<DirectorAssignmentsRepository, "list" | "read" | "readAssignableEmployee" | "claimReminder" | "completeReminder">;
type SendReminder = (recipient: string, subject: string, text: string, signal: AbortSignal) => Promise<void>;

export function createDirectorAssignmentReminderRunner({ repository, notificationSettings, sendEmail, sendMax, now = () => new Date(), onError = () => console.warn("director_assignment_reminders.delivery_failed") }: {
  repository: ReminderRepository;
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
    for (const listed of await repository.list()) {
      if (controller.signal.aborted) return;
      if (directorAssignmentReminderDays(listed, today) === undefined) continue;
      try {
        // Re-read current participants and consent immediately before this assignment's delivery.
        const assignment = await repository.read(listed.id);
        if (!assignment) continue;
        const daysBefore = directorAssignmentReminderDays(assignment, today);
        if (daysBefore === undefined) continue;
        const userIds = new Set<string>();
        for (const id of new Set([assignment.responsibleId, ...assignment.coExecutorIds])) {
          const employee = await repository.readAssignableEmployee(id);
          if (employee?.active && employee.userId) userIds.add(employee.userId);
        }
        const recipients = await notificationSettings.listDeliveryRecipients("general_director_assignments");
        const message = buildDirectorAssignmentReminder(assignment, daysBefore);
        for (const recipient of recipients) {
          if (!userIds.has(recipient.userId)) continue;
          for (const channel of ["email", "max"] as const) {
            const send = channel === "email" ? sendEmail : sendMax;
            const address = channel === "email" ? recipient.email : recipient.maxUserId;
            if (!send || !address) continue;
            const delivery: DirectorReminderDelivery = { assignmentId: assignment.id, occurrenceDate: assignment.currentOccurrenceDate, daysBefore, userId: recipient.userId, channel };
            const token = randomUUID();
            try {
              if (controller.signal.aborted) return;
              if (!await repository.claimReminder(delivery, token)) continue;
              if (controller.signal.aborted) return;
              await send(address, message.subject, message.text, controller.signal);
              await repository.completeReminder(delivery, token);
            } catch { onError(); }
          }
        }
      } catch { onError(); }
    }
  }
  return {
    async stop() { controller.abort(); await running; },
    run() {
      if (controller.signal.aborted) return Promise.resolve();
      if (!running) running = deliver().catch(() => onError()).finally(() => { running = undefined; });
      return running;
    },
  };
}

export function startDirectorAssignmentReminders(runner: ReturnType<typeof createDirectorAssignmentReminderRunner>) {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending: Promise<void> | undefined;
  function tick() {
    pending = runner.run().finally(() => {
      if (!stopped) { timer = setTimeout(tick, directorReminderPollMs); timer.unref(); }
    });
  }
  tick();
  return async () => { stopped = true; if (timer) clearTimeout(timer); await runner.stop(); await pending; };
}
