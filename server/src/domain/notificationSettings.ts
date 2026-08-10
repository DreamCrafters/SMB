import type { AccountPosition } from "./auth.js";

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
] as const;

export type NotificationType = (typeof notificationTypes)[number]["id"];

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
  if (
    email.length > 0 &&
    (email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email))
  ) {
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

export function buildGeneralDirectorLoginNotifications({
  position,
  today,
  overdueAssignments,
}: {
  position: AccountPosition;
  today: string;
  overdueAssignments: readonly OverdueBoardAssignment[];
}): LoginNotification[] {
  if (position !== "general_director") {
    return [];
  }

  const notifications: LoginNotification[] = [];
  const boardMeetingReminder = buildGeneralDirectorBoardMeetingReminder({
    position,
    today,
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
}: {
  position: AccountPosition;
  today: string;
}) {
  if (position !== "general_director") {
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

function formatCalendarDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(value);

  return match === null
    ? value
    : `${match[3]}.${match[2]}.${match[1]}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
