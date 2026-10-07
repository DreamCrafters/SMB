import {
  collegiumDecisionLabels,
  collegiumInitiativeRoleFields,
  type CollegiumInitiative,
  type CollegiumInitiativeCard,
  type CollegiumMeeting,
} from "../contracts/collegiumInitiatives.js";
import { listCollegiumRoleHolderIds } from "./collegiumInitiative.js";

/**
 * Описание уведомления модуля «Инициативы Коллегии». Сервисы кладут описания в
 * исходящую очередь внутри транзакции, а отправляет их HTTP-слой после ответа:
 * письмо не должно уйти до commit и не должно держать блокировки.
 */
export type CollegiumNotification = {
  subject: string;
  lines: string[];
  /** Явные адресаты (userId). */
  userIds: string[];
  /** Дополнительно — все пользователи с этой capability. */
  audienceCapability?: "business.manage_collegium_initiatives" | "business.approve_collegium_initiatives";
  /** Автор действия не получает уведомление о собственном действии. */
  actorUserId: string;
  /**
   * Держатели временных ролей этой инициативы: явному адресату из их числа
   * вкладка не нужна (канал по-прежнему включает должность). Сводное письмо
   * по протоколу их не заполняет — в нём чужие вопросы.
   */
  roleHolderUserIds?: string[];
};

export type CollegiumOutbox = CollegiumNotification[];

const roleLabels: Record<(typeof collegiumInitiativeRoleFields)[number], string> = {
  ownerId: "владелец результата",
  executorId: "исполнитель",
  executionControllerId: "контролёр исполнения",
  effectControllerId: "контролёр эффекта",
};

function userIdOf(accountId: string) {
  return accountId.startsWith("account:") ? accountId.slice("account:".length) : "";
}

function roleHolderUserIds(initiative: CollegiumInitiative) {
  return userIds(...listCollegiumRoleHolderIds(initiative));
}

function userIds(...accountIds: string[]) {
  return [...new Set(accountIds.map(userIdOf).filter((id) => id !== ""))];
}

function head(initiative: CollegiumInitiative) {
  return `Инициатива ${initiative.number} «${initiative.card.title}»`;
}

/**
 * Новые назначения ролей. Пока инициатива не отправлялась на оценку, её видят
 * только автор, инициатор и владелец, поэтому остальным ролям писать рано.
 */
export function buildRoleAssignmentNotifications(
  initiative: CollegiumInitiative,
  previous: CollegiumInitiativeCard | undefined,
  actorUserId: string,
): CollegiumNotification[] {
  const isPrivate = initiative.workflow.submittedAt === undefined;
  const rolesByUser = new Map<string, string[]>();
  for (const field of collegiumInitiativeRoleFields) {
    const accountId = initiative.card[field];
    if (accountId === "" || previous?.[field] === accountId) continue;
    if (isPrivate && field !== "ownerId") continue;
    const userId = userIdOf(accountId);
    if (userId === "") continue;
    rolesByUser.set(userId, [...(rolesByUser.get(userId) ?? []), roleLabels[field]]);
  }
  return [...rolesByUser].map(([userId, roles]) => ({
    subject: `${initiative.number}: вы назначены в инициативе`,
    lines: [head(initiative), `Вам назначена роль: ${roles.join(", ")}.`],
    userIds: [userId],
    actorUserId,
    roleHolderUserIds: roleHolderUserIds(initiative),
  }));
}

/**
 * Роли, скрытые пока идея была личной (всё, кроме владельца), объявляются при
 * первой отправке на оценку.
 */
export function buildHiddenRoleNotifications(
  initiative: CollegiumInitiative,
  actorUserId: string,
): CollegiumNotification[] {
  const rolesByUser = new Map<string, string[]>();
  for (const field of collegiumInitiativeRoleFields) {
    if (field === "ownerId") continue;
    const userId = userIdOf(initiative.card[field]);
    if (userId === "") continue;
    rolesByUser.set(userId, [...(rolesByUser.get(userId) ?? []), roleLabels[field]]);
  }
  return [...rolesByUser].map(([userId, roles]) => ({
    subject: `${initiative.number}: вы назначены в инициативе`,
    lines: [head(initiative), `Вам назначена роль: ${roles.join(", ")}.`],
    userIds: [userId],
    actorUserId,
    roleHolderUserIds: roleHolderUserIds(initiative),
  }));
}

/** Отправленные на оценку идеи ждут секретаря и председателя. */
export function buildSubmittedNotification(initiative: CollegiumInitiative, actorUserId: string): CollegiumNotification {
  return {
    subject: `${initiative.number}: новая инициатива на оценке`,
    lines: [head(initiative), "Инициатива отправлена на предварительную оценку."],
    userIds: [],
    audienceCapability: "business.manage_collegium_initiatives",
    actorUserId,
  };
}

export function buildReworkNotification(initiative: CollegiumInitiative, actorUserId: string): CollegiumNotification {
  const rework = initiative.workflow.rework;
  return {
    subject: `${initiative.number}: возвращена на доработку`,
    lines: [
      head(initiative),
      "Инициатива возвращена на доработку.",
      ...(rework === undefined ? [] : [`Срок доработки: ${formatDate(rework.dueDate)}.`]),
    ],
    userIds: userIds(
      initiative.card.initiatorId,
      initiative.card.ownerId,
      initiative.card.executorId,
      rework?.responsibleId ?? "",
    ),
    actorUserId,
    roleHolderUserIds: roleHolderUserIds(initiative),
  };
}

export function buildAgendaNotification(
  initiative: CollegiumInitiative,
  meeting: CollegiumMeeting,
  speakerId: string,
  actorUserId: string,
): CollegiumNotification {
  return {
    subject: `${initiative.number}: включена в повестку ${meeting.number}`,
    lines: [
      head(initiative),
      `Включена в повестку заседания Коллегии ${meeting.number} ${formatDate(meeting.meetingDate)} в ${meeting.meetingTime}.`,
    ],
    userIds: userIds(initiative.card.initiatorId, initiative.card.ownerId, speakerId),
    actorUserId,
    roleHolderUserIds: roleHolderUserIds(initiative),
  };
}

/** Одно сводное сообщение на получателя по утверждённому протоколу. */
export function buildProtocolNotifications(meeting: CollegiumMeeting, actorUserId: string): CollegiumNotification[] {
  const items = meeting.items.filter((item) => item.removedAt === undefined && item.decision !== undefined);
  const lines = items.map((item) =>
    `${item.order}. ${item.initiativeNumber} «${item.snapshot.card.title}»: ${collegiumDecisionLabels[item.decision!.decision]}`);
  const recipients = userIds(
    ...meeting.participantIds,
    ...items.flatMap((item) => [
      item.snapshot.card.initiatorId,
      item.snapshot.card.ownerId,
      item.speakerId,
      ...item.decision!.responsibleIds,
      item.decision!.rework?.responsibleId ?? "",
    ]),
  );
  return recipients.map((userId) => ({
    subject: `Утверждён протокол заседания Коллегии ${meeting.number}`,
    lines: [`Протокол № ${meeting.number} от ${formatDate(meeting.meetingDate)} утверждён.`, "Решения:", ...lines],
    userIds: [userId],
    actorUserId,
  }));
}

export function buildAssignmentCreatedNotification(
  initiative: CollegiumInitiative,
  assignmentNumber: string,
  actorUserId: string,
): CollegiumNotification {
  return {
    subject: `${initiative.number}: создано поручение ${assignmentNumber}`,
    lines: [head(initiative), `По инициативе создано поручение Коллегии ${assignmentNumber}.`],
    userIds: userIds(initiative.card.initiatorId, initiative.card.ownerId, initiative.card.executorId),
    actorUserId,
    roleHolderUserIds: roleHolderUserIds(initiative),
  };
}

/** Подтверждают эффект две подписи: контролёр эффекта и финансовый верификатор. */
export function buildResultConfirmationNotification(initiative: CollegiumInitiative, actorUserId: string): CollegiumNotification {
  return {
    subject: `${initiative.number}: требуется подтвердить результат`,
    lines: [head(initiative), "Работы завершены, требуется проверить факты и подписать эффект."],
    userIds: userIds(initiative.card.effectControllerId, initiative.workflow.verifiers?.financialId ?? ""),
    actorUserId,
    roleHolderUserIds: roleHolderUserIds(initiative),
  };
}

/** Назначение контролёра эффекта и верификаторов (ТЗ 12.1). */
export function buildControlRoleNotifications(
  initiative: CollegiumInitiative,
  assigned: { controller: string; technical: string; financial: string },
  actorUserId: string,
): CollegiumNotification[] {
  const labels: Array<[string, string]> = [
    [assigned.controller, "контролёр эффекта"],
    [assigned.technical, "технический верификатор"],
    [assigned.financial, "финансовый верификатор"],
  ];
  const rolesByUser = new Map<string, string[]>();
  for (const [accountId, label] of labels) {
    const userId = userIdOf(accountId);
    if (userId !== "") rolesByUser.set(userId, [...(rolesByUser.get(userId) ?? []), label]);
  }
  return [...rolesByUser].map(([userId, roles]) => ({
    subject: `${initiative.number}: вы назначены проверять эффект`,
    lines: [head(initiative), `Вам назначена роль: ${roles.join(", ")}.`],
    userIds: [userId],
    actorUserId,
    roleHolderUserIds: roleHolderUserIds(initiative),
  }));
}

export function buildOutcomeNotification(
  initiative: CollegiumInitiative,
  outcome: string,
  actorUserId: string,
): CollegiumNotification {
  return {
    subject: `${initiative.number}: ${outcome.toLocaleLowerCase("ru-RU")}`,
    lines: [head(initiative), `${outcome}.`],
    userIds: userIds(initiative.card.initiatorId, initiative.card.ownerId),
    actorUserId,
    roleHolderUserIds: roleHolderUserIds(initiative),
  };
}

export function formatCollegiumNotificationText(notification: CollegiumNotification) {
  return notification.lines.join("\n");
}

function formatDate(value: string) {
  const [year, month, day] = value.slice(0, 10).split("-");
  return `${day}.${month}.${year}`;
}
