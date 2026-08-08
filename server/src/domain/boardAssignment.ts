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

export const boardAssignmentRecurrences = [
  "daily",
  "weekly",
  "monthly",
  "yearly",
  "once",
] as const;

export type BoardAssignmentRecurrence =
  (typeof boardAssignmentRecurrences)[number];

export const boardAssignmentRecurrenceLabels: Record<
  BoardAssignmentRecurrence,
  string
> = {
  daily: "Каждый день",
  weekly: "Каждую неделю",
  monthly: "Каждый месяц",
  yearly: "Каждый год",
  once: "Один раз",
};

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
  recurrence: BoardAssignmentRecurrence;
  activeFrom: string;
  activeTo: string;
  comment?: string;
};

export type ValidatedBoardAssignmentUpdateRequest =
  Omit<ValidatedBoardAssignmentCreateRequest, "comment"> & {
    comment: string;
    expectedUpdatedAt: string;
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
    "recurrence",
    "activeFrom",
    "activeTo",
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
  const recurrence = boardAssignmentRecurrences.includes(
    value.recurrence as BoardAssignmentRecurrence,
  )
    ? value.recurrence as BoardAssignmentRecurrence
    : undefined;
  const activeFrom = readRequiredText(
    value.activeFrom,
    "Дата начала исполнения обязательна.",
    errors,
    10,
  );
  const activeTo = readRequiredText(
    value.activeTo,
    "Дата окончания исполнения обязательна.",
    errors,
    10,
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
  if (recurrence === undefined) {
    errors.push("Укажите периодичность исполнения.");
  }
  if (meetingDate !== undefined && !isCalendarDate(meetingDate)) {
    errors.push("Дата заседания должна быть календарной датой.");
  }
  if (activeFrom !== undefined && !isCalendarDate(activeFrom)) {
    errors.push("Дата начала исполнения должна быть календарной датой.");
  }
  if (activeTo !== undefined && !isCalendarDate(activeTo)) {
    errors.push("Дата окончания исполнения должна быть календарной датой.");
  }
  if (
    activeFrom !== undefined &&
    activeTo !== undefined &&
    isCalendarDate(activeFrom) &&
    isCalendarDate(activeTo) &&
    activeFrom > activeTo
  ) {
    errors.push("Дата окончания исполнения не может быть раньше даты начала.");
  }
  if (
    errors.length > 0 ||
    meetingDate === undefined ||
    protocolNumber === undefined ||
    decisionNumber === undefined ||
    summary === undefined ||
    details === undefined ||
    coExecutors === undefined ||
    recurrence === undefined ||
    activeFrom === undefined ||
    activeTo === undefined
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
      recurrence,
      activeFrom,
      activeTo,
      ...(comment === undefined ? {} : { comment }),
    },
  };
}

export function validateBoardAssignmentUpdateRequest(
  value: unknown,
): ValidationResult<ValidatedBoardAssignmentUpdateRequest> {
  if (!isRecord(value)) {
    return {
      ok: false,
      errors: ["Передайте поля поручения."],
    };
  }

  const { expectedUpdatedAt: timestampValue, ...assignmentFields } = value;
  const validation = validateBoardAssignmentCreateRequest(assignmentFields);

  if (!validation.ok) {
    return validation;
  }
  const errors: string[] = [];
  const expectedUpdatedAt = readRequiredText(
    timestampValue,
    "Не удалось проверить актуальность поручения. Обновите карточку.",
    errors,
    40,
  );
  if (
    expectedUpdatedAt !== undefined &&
    Number.isNaN(Date.parse(expectedUpdatedAt))
  ) {
    errors.push("Дата версии поручения имеет неверный формат.");
  }
  if (validation.value.comment === undefined) {
    errors.push("Комментарий к изменению обязателен.");
  }
  if (
    errors.length > 0 ||
    validation.value.comment === undefined ||
    expectedUpdatedAt === undefined
  ) {
    return {
      ok: false,
      errors,
    };
  }

  return {
    ok: true,
    value: {
      ...validation.value,
      comment: validation.value.comment,
      expectedUpdatedAt,
    },
  };
}

export function getNextBoardAssignmentOccurrenceDate({
  recurrence,
  activeFrom,
  activeTo,
  completedOn,
}: {
  recurrence: BoardAssignmentRecurrence;
  activeFrom: string;
  activeTo: string;
  completedOn: string;
}) {
  if (
    recurrence === "once" ||
    !isCalendarDate(activeFrom) ||
    !isCalendarDate(activeTo) ||
    !isCalendarDate(completedOn)
  ) {
    return undefined;
  }

  const anchor = readCalendarDateParts(activeFrom);
  const completed = readCalendarDateParts(completedOn);
  let next: string;

  if (recurrence === "daily" || recurrence === "weekly") {
    const stepDays = recurrence === "daily" ? 1 : 7;
    const elapsedDays = Math.max(
      0,
      Math.floor(
        (
          Date.UTC(completed.year, completed.month - 1, completed.day) -
          Date.UTC(anchor.year, anchor.month - 1, anchor.day)
        ) / 86_400_000,
      ),
    );
    const occurrenceIndex = Math.floor(elapsedDays / stepDays) + 1;
    next = formatCalendarDateFromUtc(
      new Date(
        Date.UTC(
          anchor.year,
          anchor.month - 1,
          anchor.day + occurrenceIndex * stepDays,
        ),
      ),
    );
  } else if (recurrence === "monthly") {
    let monthOffset = Math.max(
      0,
      (completed.year - anchor.year) * 12 + completed.month - anchor.month,
    );
    next = buildAnchoredMonthDate(anchor, monthOffset);

    if (next <= completedOn) {
      monthOffset += 1;
      next = buildAnchoredMonthDate(anchor, monthOffset);
    }
  } else {
    let yearOffset = Math.max(0, completed.year - anchor.year);
    next = buildAnchoredYearDate(anchor, yearOffset);

    if (next <= completedOn) {
      yearOffset += 1;
      next = buildAnchoredYearDate(anchor, yearOffset);
    }
  }

  return next <= activeTo ? next : undefined;
}

export function getBoardAssignmentOccurrenceOnOrAfter({
  recurrence,
  activeFrom,
  activeTo,
  targetDate,
}: {
  recurrence: BoardAssignmentRecurrence;
  activeFrom: string;
  activeTo: string;
  targetDate: string;
}) {
  if (
    !isCalendarDate(activeFrom) ||
    !isCalendarDate(activeTo) ||
    !isCalendarDate(targetDate) ||
    activeFrom > activeTo
  ) {
    return undefined;
  }
  if (targetDate <= activeFrom) {
    return activeFrom;
  }

  const target = readCalendarDateParts(targetDate);
  const dayBeforeTarget = formatCalendarDateFromUtc(
    new Date(Date.UTC(target.year, target.month - 1, target.day - 1)),
  );

  return getNextBoardAssignmentOccurrenceDate({
    recurrence,
    activeFrom,
    activeTo,
    completedOn: dayBeforeTarget,
  });
}

export function isBoardAssignmentActiveOn({
  status,
  currentOccurrenceDate,
  activeFrom,
  activeTo,
}: {
  status: BoardAssignmentStatus;
  currentOccurrenceDate: string;
  activeFrom: string;
  activeTo: string;
}, calendarDate: string) {
  return (
    (status === "in_progress" || status === "revision_requested") &&
    currentOccurrenceDate >= activeFrom &&
    currentOccurrenceDate <= activeTo &&
    currentOccurrenceDate <= calendarDate
  );
}

export function isBoardAssignmentOverdueOn({
  status,
  currentOccurrenceDate,
}: {
  status: BoardAssignmentStatus;
  currentOccurrenceDate: string;
}, calendarDate: string) {
  return (
    (status === "in_progress" || status === "revision_requested") &&
    currentOccurrenceDate < calendarDate
  );
}

export function formatBoardAssignmentSchedule({
  recurrence,
  activeFrom,
  activeTo,
}: {
  recurrence: BoardAssignmentRecurrence;
  activeFrom: string;
  activeTo: string;
}) {
  return `${boardAssignmentRecurrenceLabels[recurrence]}, с ${
    formatCalendarDateForDisplay(activeFrom)
  } по ${formatCalendarDateForDisplay(activeTo)}`;
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

export function isBoardAssignmentRecurrence(
  value: unknown,
): value is BoardAssignmentRecurrence {
  return boardAssignmentRecurrences.includes(
    value as BoardAssignmentRecurrence,
  );
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

function readCalendarDateParts(value: string) {
  const [year = "0", month = "0", day = "0"] = value.split("-");

  return {
    year: Number(year),
    month: Number(month),
    day: Number(day),
  };
}

function buildAnchoredMonthDate(
  anchor: ReturnType<typeof readCalendarDateParts>,
  monthOffset: number,
) {
  const absoluteMonth = anchor.year * 12 + anchor.month - 1 + monthOffset;
  const year = Math.floor(absoluteMonth / 12);
  const monthIndex = absoluteMonth % 12;
  const day = Math.min(
    anchor.day,
    new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate(),
  );

  return formatCalendarDateFromUtc(new Date(Date.UTC(year, monthIndex, day)));
}

function buildAnchoredYearDate(
  anchor: ReturnType<typeof readCalendarDateParts>,
  yearOffset: number,
) {
  const year = anchor.year + yearOffset;
  const monthIndex = anchor.month - 1;
  const day = Math.min(
    anchor.day,
    new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate(),
  );

  return formatCalendarDateFromUtc(new Date(Date.UTC(year, monthIndex, day)));
}

function formatCalendarDateFromUtc(value: Date) {
  return [
    value.getUTCFullYear(),
    String(value.getUTCMonth() + 1).padStart(2, "0"),
    String(value.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

function formatCalendarDateForDisplay(value: string) {
  const [year, month, day] = value.split("-");

  return year === undefined || month === undefined || day === undefined
    ? value
    : `${day}.${month}.${year}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
