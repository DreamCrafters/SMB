import type { CollegiumInitiative, CollegiumMeeting } from "../contracts/collegiumInitiatives.js";
import type { DirectorAssignment } from "../contracts/directorAssignments.js";
import { listCollegiumRoleHolderIds } from "./collegiumInitiative.js";

/**
 * Напоминания и эскалации «Инициатив Коллегии» (ТЗ 12.1–12.2). Рабочие дни —
 * будни без праздничного календаря, как у поручений; даты — календарные даты
 * Москвы `YYYY-MM-DD`.
 */
export const collegiumReminderWorkdaysBefore = [2, 1] as const;
export const collegiumReminderPollMs = 60_000;
export const collegiumReminderLeaseSeconds = 900;
export const collegiumReminderMaxAttempts = 3;

const dayMs = 86_400_000;

function shift(date: string, days: number) {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * dayMs).toISOString().slice(0, 10);
}

export function isWorkday(date: string) {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return day !== 0 && day !== 6;
}

/** Срок в выходной переносится на предыдущий рабочий день. */
export function effectiveDueDate(date: string) {
  let current = date;
  while (!isWorkday(current)) current = shift(current, -1);
  return current;
}

/** Рабочий день за `count` рабочих дней до рабочего дня `due`. */
export function workdaysBefore(due: string, count: number) {
  let current = due;
  for (let left = count; left > 0;) {
    current = shift(current, -1);
    if (isWorkday(current)) left -= 1;
  }
  return current;
}

/** Первый рабочий день строго после даты — «день просрочки». */
export function firstWorkdayAfter(date: string) {
  let current = shift(date, 1);
  while (!isWorkday(current)) current = shift(current, 1);
  return current;
}

export type CollegiumReminder = {
  kind: "rework" | "materials" | "escalation";
  subjectId: string;
  /** Цикл объекта: запрос доработки, заседание или срок поручения. */
  cycle: string;
  targetDate: string;
  /** Рабочих дней до срока; −1 — день просрочки. */
  offset: number;
  userIds: string[];
  /** Держатели временных ролей инициативы: явному адресату из их числа вкладка не нужна. */
  roleHolderUserIds: string[];
  /** Пользователи с этой capability тоже адресаты (эскалация председателю). */
  audienceCapability?: "business.approve_collegium_initiatives";
  subject: string;
  text: string;
};

function userIdOf(accountId: string) {
  return accountId.startsWith("account:") ? accountId.slice("account:".length) : "";
}

function userIds(...accountIds: string[]) {
  return [...new Set(accountIds.map(userIdOf).filter((id) => id !== ""))];
}

function roleHolderUserIds(initiative: CollegiumInitiative | undefined) {
  return initiative === undefined ? [] : userIds(...listCollegiumRoleHolderIds(initiative));
}

function formatDate(value: string) {
  return value.split("-").reverse().join(".");
}

function workdayWord(count: number) {
  return count === 1 ? "рабочий день" : "рабочих дня";
}

/** Все напоминания и эскалации, которые приходятся на `today`. */
export function listCollegiumReminders({
  today,
  initiatives,
  meetings,
  assignments,
}: {
  today: string;
  initiatives: readonly CollegiumInitiative[];
  meetings: readonly CollegiumMeeting[];
  assignments: readonly DirectorAssignment[];
}): CollegiumReminder[] {
  if (!isWorkday(today)) return [];
  const reminders: CollegiumReminder[] = [];
  const byInitiative = new Map(initiatives.map((initiative) => [initiative.id, initiative]));

  for (const initiative of initiatives) {
    const rework = initiative.workflow.rework;
    if (initiative.status !== "rework" || rework === undefined) continue;
    const due = effectiveDueDate(rework.dueDate);
    const base = {
      kind: "rework" as const,
      subjectId: initiative.id,
      cycle: rework.requestedAt,
      targetDate: today,
      userIds: userIds(rework.responsibleId),
      roleHolderUserIds: roleHolderUserIds(initiative),
    };
    for (const count of collegiumReminderWorkdaysBefore) {
      if (workdaysBefore(due, count) !== today) continue;
      reminders.push({
        ...base,
        offset: count,
        subject: `${initiative.number}: срок доработки ${formatDate(rework.dueDate)}`,
        text: `Инициатива ${initiative.number} «${initiative.card.title}».\nДо срока доработки ${count} ${workdayWord(count)}: ${formatDate(rework.dueDate)}.`,
      });
    }
    if (firstWorkdayAfter(due) === today) {
      reminders.push({
        ...base,
        offset: -1,
        subject: `${initiative.number}: срок доработки истёк`,
        text: `Инициатива ${initiative.number} «${initiative.card.title}».\nСрок доработки ${formatDate(rework.dueDate)} истёк.`,
      });
    }
  }

  for (const meeting of meetings) {
    if (meeting.status !== "planned") continue;
    const items = meeting.items.filter((item) => item.removedAt === undefined);
    if (items.length === 0) continue;
    const due = effectiveDueDate(meeting.meetingDate);
    for (const count of collegiumReminderWorkdaysBefore) {
      if (workdaysBefore(due, count) !== today) continue;
      for (const item of items) {
        reminders.push({
          kind: "materials",
          subjectId: item.id,
          cycle: `${meeting.id}:${meeting.meetingDate}`,
          targetDate: today,
          offset: count,
          userIds: userIds(item.snapshot.card.initiatorId, item.snapshot.card.ownerId, item.speakerId),
          roleHolderUserIds: roleHolderUserIds(byInitiative.get(item.initiativeId)),
          subject: `${item.initiativeNumber}: заседание ${meeting.number} ${formatDate(meeting.meetingDate)}`,
          text: `Инициатива ${item.initiativeNumber} «${item.snapshot.card.title}» в повестке заседания ${meeting.number}.\nДо заседания ${count} ${workdayWord(count)}: подготовьте материалы.`,
        });
      }
    }
  }

  const overdueCount = new Map<string, number>();
  for (const assignment of assignments) {
    if (assignment.status === "completed" || assignment.currentOccurrenceDate >= today) continue;
    const id = assignment.sourceInitiativeId ?? "";
    overdueCount.set(id, (overdueCount.get(id) ?? 0) + 1);
  }
  for (const assignment of assignments) {
    const initiative = byInitiative.get(assignment.sourceInitiativeId ?? "");
    if (initiative === undefined || assignment.status === "completed") continue;
    // Escalate once, on the first workday after the deadline: no backlog flood.
    if (firstWorkdayAfter(assignment.currentOccurrenceDate) !== today) continue;
    const repeated = (overdueCount.get(initiative.id) ?? 0) >= 2;
    reminders.push({
      kind: "escalation",
      subjectId: assignment.id,
      cycle: assignment.currentOccurrenceDate,
      targetDate: today,
      offset: -1,
      userIds: userIds(initiative.card.ownerId),
      roleHolderUserIds: roleHolderUserIds(initiative),
      audienceCapability: "business.approve_collegium_initiatives",
      subject: `${initiative.number}: просрочено поручение ${assignment.number}${repeated ? " (повторная просрочка)" : ""}`,
      text: `Инициатива ${initiative.number} «${initiative.card.title}».\nПоручение ${assignment.number} не выполнено в срок ${formatDate(assignment.currentOccurrenceDate)}.${repeated ? "\nПо инициативе просрочено несколько поручений." : ""}`,
    });
  }
  return reminders;
}
