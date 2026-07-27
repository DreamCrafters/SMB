import type { ServerUserProfile } from "./auth.js";
import { hasProfileCapability } from "./auth.js";

export const boardAssignmentStatuses = [
  "in_progress",
  "under_review",
  "revision_requested",
  "completed",
] as const;

export type BoardAssignmentStatus =
  (typeof boardAssignmentStatuses)[number];

export const boardAssignmentActions = [
  "submit_for_review",
  "return_for_revision",
  "complete",
] as const;

export type BoardAssignmentAction =
  (typeof boardAssignmentActions)[number];

export type BoardAssignmentPermissions = {
  canView: boolean;
  canCreate: boolean;
  canExecute: boolean;
  canReview: boolean;
};

export type ValidatedBoardAssignmentCreateRequest = {
  meetingDate: string;
  protocolNumber: string;
  decisionNumber: string;
  summary: string;
  details: string;
  coExecutors: string[];
  dueDate: string;
  comment?: string;
};

export type ValidatedBoardAssignmentAction = {
  action: BoardAssignmentAction;
  comment: string;
  status: BoardAssignmentStatus;
};

type ValidationResult<Value> =
  | {
      ok: true;
      value: Value;
    }
  | {
      ok: false;
      errors: string[];
    };

export function getBoardAssignmentPermissions(
  profile: ServerUserProfile,
): BoardAssignmentPermissions {
  const canView = hasProfileCapability(
    profile,
    "business.view_board_assignments",
  );

  return {
    canView,
    canCreate:
      canView &&
      hasProfileCapability(profile, "business.create_board_assignments"),
    canExecute:
      canView &&
      hasProfileCapability(profile, "business.execute_board_assignments"),
    canReview:
      canView &&
      hasProfileCapability(profile, "business.review_board_assignments"),
  };
}

export function validateBoardAssignmentCreateRequest(
  value: unknown,
): ValidationResult<ValidatedBoardAssignmentCreateRequest> {
  if (!isRecord(value)) {
    return {
      ok: false,
      errors: ["Передайте поля поручения."],
    };
  }

  const errors: string[] = [];
  const allowedFields = new Set([
    "meetingDate",
    "protocolNumber",
    "decisionNumber",
    "summary",
    "details",
    "coExecutors",
    "dueDate",
    "comment",
  ]);
  const unexpectedFields = Object.keys(value).filter(
    (field) => !allowedFields.has(field),
  );
  const meetingDate = readRequiredText(
    value.meetingDate,
    "Дата заседания обязательна.",
    errors,
    10,
  );
  const protocolNumber = readRequiredText(
    value.protocolNumber,
    "Номер протокола обязателен.",
    errors,
    80,
  );
  const decisionNumber = readRequiredText(
    value.decisionNumber,
    "Пункт решения обязателен.",
    errors,
    80,
  );
  const summary = readRequiredText(
    value.summary,
    "Краткое содержание поручения обязательно.",
    errors,
    500,
  );
  const details = readRequiredText(
    value.details,
    "Полное содержание поручения обязательно.",
    errors,
    20_000,
  );
  const dueDate = readRequiredText(
    value.dueDate,
    "Срок исполнения обязателен.",
    errors,
    255,
  );
  const comment = readOptionalText(
    value.comment,
    "Комментарий не должен превышать 4000 символов.",
    errors,
    4_000,
  );
  const coExecutors = readCoExecutors(value.coExecutors, errors);

  if (unexpectedFields.length > 0) {
    errors.push("Запрос содержит неизвестные поля.");
  }
  if (meetingDate !== undefined && !isCalendarDate(meetingDate)) {
    errors.push("Дата заседания должна быть календарной датой.");
  }
  if (
    errors.length > 0 ||
    meetingDate === undefined ||
    protocolNumber === undefined ||
    decisionNumber === undefined ||
    summary === undefined ||
    details === undefined ||
    coExecutors === undefined ||
    dueDate === undefined
  ) {
    return {
      ok: false,
      errors,
    };
  }

  return {
    ok: true,
    value: {
      meetingDate,
      protocolNumber,
      decisionNumber,
      summary,
      details,
      coExecutors,
      dueDate,
      ...(comment === undefined ? {} : { comment }),
    },
  };
}

export function validateBoardAssignmentAction(
  value: unknown,
  currentStatus: BoardAssignmentStatus,
  permissions: BoardAssignmentPermissions,
): ValidationResult<ValidatedBoardAssignmentAction> {
  if (!isRecord(value)) {
    return {
      ok: false,
      errors: ["Передайте решение по поручению."],
    };
  }

  const errors: string[] = [];
  const unexpectedFields = Object.keys(value).filter(
    (field) => field !== "action" && field !== "comment",
  );
  const action = boardAssignmentActions.includes(
    value.action as BoardAssignmentAction,
  )
    ? (value.action as BoardAssignmentAction)
    : undefined;
  const comment = readRequiredText(
    value.comment,
    "Комментарий обязателен.",
    errors,
    4_000,
  );

  if (unexpectedFields.length > 0) {
    errors.push("Запрос содержит неизвестные поля.");
  }
  if (action === undefined) {
    errors.push("Выберите допустимый статус.");
  }

  const status = action === undefined
    ? undefined
    : readActionStatus(action, currentStatus, permissions, errors);

  if (
    errors.length > 0 ||
    action === undefined ||
    comment === undefined ||
    status === undefined
  ) {
    return {
      ok: false,
      errors,
    };
  }

  return {
    ok: true,
    value: {
      action,
      comment,
      status,
    },
  };
}

export function isBoardAssignmentStatus(
  value: unknown,
): value is BoardAssignmentStatus {
  return boardAssignmentStatuses.includes(value as BoardAssignmentStatus);
}

function readActionStatus(
  action: BoardAssignmentAction,
  currentStatus: BoardAssignmentStatus,
  permissions: BoardAssignmentPermissions,
  errors: string[],
): BoardAssignmentStatus | undefined {
  if (action === "submit_for_review") {
    if (!permissions.canExecute) {
      errors.push("Передать поручение на проверку может Генеральный директор.");
      return undefined;
    }
    if (
      currentStatus !== "in_progress" &&
      currentStatus !== "revision_requested"
    ) {
      errors.push("Поручение сейчас нельзя передать на проверку.");
      return undefined;
    }

    return "under_review";
  }

  if (!permissions.canReview) {
    errors.push("Решение по проверке доступно только уполномоченному члену Совета директоров.");
    return undefined;
  }
  if (currentStatus !== "under_review") {
    errors.push("Решение можно принять только по поручению на проверке.");
    return undefined;
  }

  return action === "complete" ? "completed" : "revision_requested";
}

function readCoExecutors(
  value: unknown,
  errors: string[],
): string[] | undefined {
  if (!Array.isArray(value)) {
    errors.push("Соисполнители должны быть переданы списком.");
    return undefined;
  }

  if (
    value.length > 50 ||
    !value.every(
      (item) => typeof item === "string" && item.trim().length <= 255,
    )
  ) {
    errors.push("Соисполнители содержат недопустимые значения.");
    return undefined;
  }

  return Array.from(
    new Set(
      value
        .map((item) => item.trim())
        .filter((item) => item.length > 0),
    ),
  );
}

function readRequiredText(
  value: unknown,
  message: string,
  errors: string[],
  maxLength: number,
) {
  if (typeof value !== "string") {
    errors.push(message);
    return undefined;
  }

  const trimmed = value.trim();

  if (trimmed.length === 0 || trimmed.length > maxLength) {
    errors.push(message);
    return undefined;
  }

  return trimmed;
}

function readOptionalText(
  value: unknown,
  message: string,
  errors: string[],
  maxLength: number,
) {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  if (typeof value !== "string" || value.trim().length > maxLength) {
    errors.push(message);
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

function isCalendarDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(value);

  if (match === null) {
    return false;
  }

  const date = new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])),
  );

  return (
    date.getUTCFullYear() === Number(match[1]) &&
    date.getUTCMonth() === Number(match[2]) - 1 &&
    date.getUTCDate() === Number(match[3])
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
