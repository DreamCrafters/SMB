import type { AccountNavigationItem, AccountPosition } from "./auth.js";
import { hasInstanceNavigationItem, isInstanceRestricted, type InstanceNavigation } from "./instanceAccess.js";

export const notificationTypes = [
  { id: "incidents", label: "Инциденты" },
  { id: "visitors", label: "Посетители" },
  { id: "equipment_reports", label: "Отчет по Оборудованию" },
  { id: "production_reports", label: "Отчет по Выработке" },
  { id: "sales", label: "Продажи" },
  { id: "shipments", label: "Отгрузки" },
  { id: "laboratory_samples", label: "Лабораторные пробы" },
  { id: "laboratory_analyses", label: "Лабораторные анализы" },
  { id: "board_assignments", label: "Поручения Совета директоров" },
  { id: "general_director_assignments", label: "Поручения Гендиректора" },
  { id: "collegium_assignments", label: "Поручения Коллегии" },
  { id: "collegium_initiatives", label: "Инициативы Коллегии" },
] as const;

export type NotificationType = (typeof notificationTypes)[number]["id"];

/**
 * Sections that send each message type. An instance of another organization (задача 147)
 * offers a type only when one of its sections is present; `sales` and `shipments` have no
 * section yet and stay with the unrestricted NMOU instance.
 */
const notificationTypeSections: Record<NotificationType, readonly AccountNavigationItem[]> = {
  incidents: ["business.dispatcher_form", "business.dispatcher", "business.overview"],
  visitors: ["business.dispatcher_form", "business.dispatcher", "business.overview"],
  equipment_reports: ["business.dispatcher_form", "business.dispatcher", "business.overview"],
  production_reports: ["business.dispatcher_form", "business.dispatcher", "business.overview"],
  sales: [],
  shipments: [],
  laboratory_samples: ["business.laboratory_results", "business.laboratory_review"],
  laboratory_analyses: ["business.laboratory_results", "business.laboratory_review"],
  board_assignments: ["business.board_assignments", "business.assignments"],
  general_director_assignments: ["business.director_assignments", "business.assignments"],
  collegium_assignments: ["business.collegium_assignments", "business.assignments"],
  collegium_initiatives: ["business.collegium_initiatives"],
};

export function isInstanceNotificationType(instance: InstanceNavigation, type: NotificationType) {
  return !isInstanceRestricted(instance) || hasInstanceNavigationItem(instance, notificationTypeSections[type]);
}

export function readInstanceNotificationTypes(instance: InstanceNavigation) {
  return notificationTypes.filter(({ id }) => isInstanceNotificationType(instance, id));
}

export const boardAssignmentNotificationType: NotificationType =
  "board_assignments";

export const boardAssignmentOverdueLoginDeliveryKey =
  "board_assignment_overdue" as const;
export type LoginNotificationDeliveryKey =
  typeof boardAssignmentOverdueLoginDeliveryKey;

export const loginNotificationTones = [
  "warning",
  "suggestion",
  "success",
] as const;
export type LoginNotificationTone = (typeof loginNotificationTones)[number];

export type LoginNotification = {
  title: string;
  message: string;
  tone: LoginNotificationTone;
};

type OverdueBoardAssignment = {
  id: string;
  meetingDate: string;
  protocolNumber: string;
  decisionNumber: string;
  summary: string;
  currentOccurrenceDate: string;
};

type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; errors: string[] };

export function isNotificationType(value: unknown): value is NotificationType {
  return notificationTypes.some(({ id }) => id === value);
}

export function validateAdminNotificationSettingRequest(
  input: unknown,
): ValidationResult<{ adminEnabled: boolean }> {
  if (!isRecord(input) || Array.isArray(input)) {
    return { ok: false, errors: ["Передайте разрешение типа уведомления."] };
  }
  const fields = Object.keys(input);
  if (
    fields.length !== 1 ||
    !fields.includes("adminEnabled") ||
    typeof input.adminEnabled !== "boolean"
  ) {
    return { ok: false, errors: ["Укажите только флажок Вкл."] };
  }

  return {
    ok: true,
    value: { adminEnabled: input.adminEnabled },
  };
}

export function validateOwnNotificationSettingRequest(
  input: unknown,
): ValidationResult<{ emailEnabled: boolean; maxEnabled: boolean }> {
  if (!isRecord(input) || Array.isArray(input)) {
    return { ok: false, errors: ["Передайте способы получения сообщения."] };
  }
  const fields = Object.keys(input);
  if (
    fields.length !== 2 ||
    !fields.includes("emailEnabled") ||
    !fields.includes("maxEnabled") ||
    typeof input.emailEnabled !== "boolean" ||
    typeof input.maxEnabled !== "boolean"
  ) {
    return {
      ok: false,
      errors: ["Укажите только флажки Email и MAX."],
    };
  }

  return {
    ok: true,
    value: {
      emailEnabled: input.emailEnabled,
      maxEnabled: input.maxEnabled,
    },
  };
}

export function validateNotificationContactsRequest(
  input: unknown,
): ValidationResult<{ email?: string; maxUserId?: string }> {
  if (!isRecord(input) || Array.isArray(input)) {
    return { ok: false, errors: ["Передайте контактные данные."] };
  }
  const fields = Object.keys(input);
  if (
    fields.length !== 2 ||
    !fields.includes("email") ||
    !fields.includes("maxUserId") ||
    typeof input.email !== "string" ||
    typeof input.maxUserId !== "string"
  ) {
    return { ok: false, errors: ["Укажите только Email и MAX."] };
  }

  const email = input.email.trim();
  const maxUserId = input.maxUserId.trim();
  const errors: string[] = [];
  if (email.length > 0 && !isNotificationEmail(email)) {
    errors.push("Укажите корректный Email.");
  }
  if (maxUserId.length > 120) {
    errors.push("Идентификатор MAX не должен быть длиннее 120 символов.");
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    value: {
      ...(email.length > 0 ? { email } : {}),
      ...(maxUserId.length > 0 ? { maxUserId } : {}),
    },
  };
}

/**
 * Задача 130: любой пользователь сам указывает или исправляет свой Email для
 * рассылок. Адрес обязателен — очистка контакта остаётся действием
 * администратора, потому что снимает включённые Email-каналы.
 */
export function validateOwnNotificationEmailRequest(
  input: unknown,
): ValidationResult<{ email: string }> {
  if (
    !isRecord(input) ||
    Array.isArray(input) ||
    Object.keys(input).length !== 1 ||
    typeof input.email !== "string"
  ) {
    return { ok: false, errors: ["Укажите только Email."] };
  }

  const email = input.email.trim();
  if (!isNotificationEmail(email)) {
    return { ok: false, errors: ["Укажите корректный Email."] };
  }

  return { ok: true, value: { email } };
}

function isNotificationEmail(email: string) {
  return email.length <= 320 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email);
}

export function buildGeneralDirectorLoginNotifications({
  position,
  today,
  overdueAssignments,
  boardMeetingReminderEnabled = true,
}: {
  position: AccountPosition;
  today: string;
  overdueAssignments: readonly OverdueBoardAssignment[];
  boardMeetingReminderEnabled?: boolean;
}): LoginNotification[] {
  if (position !== "general_director") {
    return [];
  }

  const notifications: LoginNotification[] = [];
  const boardMeetingReminder = buildGeneralDirectorBoardMeetingReminder({
    position,
    today,
    enabled: boardMeetingReminderEnabled,
  });

  if (boardMeetingReminder !== undefined) {
    notifications.push({
      title: "Совет директоров",
      message: boardMeetingReminder,
      tone: "suggestion",
    });
  }

  if (overdueAssignments.length > 0) {
    notifications.push({
      title: "Просрочено поручение",
      message: `Просрочено поручений: ${overdueAssignments.length}`,
      tone: "warning",
    });
  }

  return notifications;
}

export function buildGeneralDirectorBoardMeetingReminder({
  position,
  today,
  enabled = true,
}: {
  position: AccountPosition;
  today: string;
  /** The board meeting on the 15th is NMOU's own schedule; another organization's instance switches it off. */
  enabled?: boolean;
}) {
  if (!enabled || position !== "general_director") {
    return undefined;
  }

  const day = Number(today.slice(8, 10));
  return Number.isInteger(day) && day >= 1 && day <= 14
    ? "Необходимо подготовиться к Совету директоров на 15 число"
    : undefined;
}

export function buildBoardAssignmentReviewNotification({
  summary,
  meetingDate,
  protocolNumber,
  decisionNumber,
  submittedByDisplayName,
}: {
  summary: string;
  meetingDate: string;
  protocolNumber: string;
  decisionNumber: string;
  submittedByDisplayName: string;
}) {
  return {
    subject: "Поручение Совета директоров передано на проверку",
    text: [
      "Поручение Совета директоров передано на проверку.",
      `Краткое содержание: ${summary}`,
      `Дата заседания: ${formatCalendarDate(meetingDate)}`,
      `Протокол: ${protocolNumber}`,
      `Пункт решения: ${decisionNumber}`,
      `Передал: ${submittedByDisplayName}`,
    ].join("\n"),
  };
}

export function buildEmployeeAssignmentReviewNotification({
  registryOwnerGenitive,
  number,
  summary,
  deadline,
  responsibleDisplayName,
  protocolNumber,
  decisionNumber,
  submittedByDisplayName,
}: {
  registryOwnerGenitive: string;
  number: string;
  summary: string;
  deadline: string;
  responsibleDisplayName: string;
  protocolNumber?: string;
  decisionNumber?: string;
  submittedByDisplayName: string;
}) {
  return {
    subject: `Поручение ${registryOwnerGenitive} №${number} передано на проверку`,
    text: [
      `Поручение ${registryOwnerGenitive} №${number} передано на проверку.`,
      "Проверьте результат и примите исполнение или верните поручение на доработку.",
      `Краткое содержание: ${summary}`,
      ...(protocolNumber ? [`Протокол: ${protocolNumber}`] : []),
      ...(decisionNumber ? [`Пункт решения: ${decisionNumber}`] : []),
      `Срок: ${formatCalendarDate(deadline)}`,
      `Ответственный: ${responsibleDisplayName || "—"}`,
      `Передал: ${submittedByDisplayName}`,
    ].join("\n"),
  };
}

function formatCalendarDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(value);

  return match === null
    ? value
    : `${match[3]}.${match[2]}.${match[1]}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
