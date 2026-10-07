import {
  collegiumActionsRequiringComment,
  collegiumEffectPeriods,
  collegiumResultConclusions,
  collegiumInitiativeActions,
  collegiumInitiativeFieldLabels,
  collegiumInitiativeRoleFields,
  type CollegiumInitiative,
  type CollegiumInitiativeAction,
  type CollegiumInitiativeActionRequest,
  type CollegiumInitiativeCard,
  type CollegiumInitiativeResultInput,
  type CollegiumLinkedAssignment,
  type CollegiumSummaryStatus,
  type CollegiumInitiativePermissions,
  type CollegiumInitiativeStatus,
  type CollegiumPerson,
  type CollegiumReworkRequest,
} from "../contracts/collegiumInitiatives.js";
import {
  collegiumAccountId,
  CollegiumInitiativeError,
  isOwnCollegiumInitiative,
  readCollegiumOptionalText,
} from "./collegiumInitiative.js";
import { readCollegiumSignerRole } from "./collegiumEffectControl.js";

const maxActionCommentLength = 2000;
const maxRemarks = 20;
const maxRemarkLength = 1000;

/** Пары «заполненность → подпись» фильтра допуска к Коллегии (ТЗ 7.1). */
const admissionTextRequirements: ReadonlyArray<{
  label: string;
  isFilled: (card: CollegiumInitiativeCard) => boolean;
}> = [
  { label: collegiumInitiativeFieldLabels.problem, isFilled: (card) => card.problem !== "" },
  {
    label: "Базовая линия и её период",
    isFilled: (card) => card.baselineValue !== "" && card.baselinePeriod !== "",
  },
  { label: collegiumInitiativeFieldLabels.baselineSource, isFilled: (card) => card.baselineSource !== "" },
  { label: collegiumInitiativeFieldLabels.solution, isFilled: (card) => card.solution !== "" },
  {
    label: "Ожидаемый эффект: сумма, период и вид",
    isFilled: (card) =>
      card.expectedEffectAmount !== "" &&
      (collegiumEffectPeriods as readonly string[]).includes(card.expectedEffectPeriod) &&
      card.expectedEffectKind !== "",
  },
  { label: collegiumInitiativeFieldLabels.effectMethod, isFilled: (card) => card.effectMethod !== "" },
  // An explicit zero is a filled resource plan.
  { label: collegiumInitiativeFieldLabels.oneTimeCostAmount, isFilled: (card) => card.oneTimeCostAmount !== "" },
  { label: collegiumInitiativeFieldLabels.recurringCostAmount, isFilled: (card) => card.recurringCostAmount !== "" },
  { label: collegiumInitiativeFieldLabels.capexAmount, isFilled: (card) => card.capexAmount !== "" },
  { label: collegiumInitiativeFieldLabels.internalResources, isFilled: (card) => card.internalResources !== "" },
  {
    label: "Срок реализации: плановые даты начала и результата",
    isFilled: (card) => card.plannedStart !== "" && card.plannedResult !== "",
  },
  { label: collegiumInitiativeFieldLabels.kpiCriterion, isFilled: (card) => card.kpiCriterion !== "" },
  { label: collegiumInitiativeFieldLabels.kpiSource, isFilled: (card) => card.kpiSource !== "" },
  {
    label: "Ключевые риски с уровнем",
    isFilled: (card) => card.risks.length > 0 && card.risks.every((risk) => risk.levelCode !== ""),
  },
  { label: collegiumInitiativeFieldLabels.requestedDecision, isFilled: (card) => card.requestedDecision !== "" },
  { label: collegiumInitiativeFieldLabels.changesTechnology, isFilled: (card) => card.changesTechnology !== "" },
  { label: collegiumInitiativeFieldLabels.newProductOrMarket, isFilled: (card) => card.newProductOrMarket !== "" },
  { label: collegiumInitiativeFieldLabels.boardDecisionRequired, isFilled: (card) => card.boardDecisionRequired !== "" },
];

/**
 * Подписи незаполненного для допуска. Роли — действующие аккаунты с вкладкой
 * инициатив; контролёр эффекта не совпадает с исполнителем и владельцем.
 */
export function listCollegiumAdmissionGaps(
  card: CollegiumInitiativeCard,
  people: ReadonlyMap<string, CollegiumPerson | undefined>,
): string[] {
  const gaps = admissionTextRequirements
    .filter(({ isFilled }) => !isFilled(card))
    .map(({ label }) => label);
  for (const field of collegiumInitiativeRoleFields) {
    const accountId = card[field];
    const label = collegiumInitiativeFieldLabels[field];
    if (accountId === "") {
      gaps.push(label);
      continue;
    }
    // Роль — временная и даётся любому действующему сотруднику, вкладка не нужна.
    if (people.get(accountId) === undefined) {
      gaps.push(`${label}: учётная запись недоступна`);
    }
  }
  if (
    card.effectControllerId !== "" &&
    (card.effectControllerId === card.executorId || card.effectControllerId === card.ownerId)
  ) {
    gaps.push("Контролёр эффекта не может быть исполнителем или владельцем результата");
  }
  return gaps;
}

// A draft is the author's own: it is withdrawn, not suspended.
const activeStatuses: readonly CollegiumInitiativeStatus[] = [
  "preliminary_review",
  "rework",
  "ready",
  "needs_elaboration",
  "approved_pilot",
  "approved_implementation",
  "board_referral",
  "in_progress",
  "result_confirmation",
];

type ActionRule = {
  from: readonly CollegiumInitiativeStatus[];
  isAllowed: (
    initiative: CollegiumInitiative,
    userId: string,
    permissions: CollegiumInitiativePermissions,
  ) => boolean;
  to: (initiative: CollegiumInitiative) => CollegiumInitiativeStatus;
};

/** Таблица переходов среза 2 — единственный источник правил маршрута. */
const actionRules: Record<CollegiumInitiativeAction, ActionRule> = {
  submit_for_review: {
    from: ["draft", "rework", "needs_elaboration"],
    isAllowed: (initiative, userId, permissions) =>
      permissions.canManage ||
      (permissions.canParticipate && isOwnCollegiumInitiative(initiative, userId)),
    to: () => "preliminary_review",
  },
  admit: {
    from: ["preliminary_review"],
    isAllowed: (_initiative, _userId, permissions) => permissions.canApprove,
    to: () => "ready",
  },
  return_for_rework: {
    from: ["preliminary_review", "ready"],
    isAllowed: (_initiative, _userId, permissions) => permissions.canManage,
    to: () => "rework",
  },
  // Agenda statuses leave only through the agenda, so the outcome reaches the protocol.
  suspend: {
    from: activeStatuses,
    isAllowed: (_initiative, _userId, permissions) => permissions.canManage,
    to: () => "suspended",
  },
  resume: {
    from: ["suspended"],
    isAllowed: (_initiative, _userId, permissions) => permissions.canManage,
    to: (initiative) => initiative.workflow.suspendedFrom ?? "preliminary_review",
  },
  withdraw: {
    from: ["draft"],
    isAllowed: (initiative, userId) =>
      initiative.createdByUserId === userId ||
      initiative.card.initiatorId === collegiumAccountId(userId),
    to: () => "closed",
  },
  // The board's decision comes back through the chair.
  board_approve: {
    from: ["board_referral"],
    isAllowed: (_initiative, _userId, permissions) => permissions.canApprove,
    to: () => "approved_implementation",
  },
  board_suspend: {
    from: ["board_referral"],
    isAllowed: (_initiative, _userId, permissions) => permissions.canApprove,
    to: () => "suspended",
  },
  board_reject: {
    from: ["board_referral"],
    isAllowed: (_initiative, _userId, permissions) => permissions.canApprove,
    to: () => "rejected",
  },
  complete_work: {
    from: ["in_progress"],
    isAllowed: (initiative, userId, permissions) =>
      permissions.canManage || (permissions.canParticipate && isResultReporter(initiative, userId)),
    to: () => "result_confirmation",
  },
  // Only the two signers decide; independence and signatures are re-checked by the service.
  confirm_effect: {
    from: ["result_confirmation"],
    isAllowed: (initiative, userId, permissions) =>
      permissions.canView && readCollegiumSignerRole(initiative, collegiumAccountId(userId)) !== undefined,
    to: () => "done_confirmed",
  },
  reject_effect: {
    from: ["result_confirmation"],
    isAllowed: (initiative, userId, permissions) =>
      permissions.canView && readCollegiumSignerRole(initiative, collegiumAccountId(userId)) !== undefined,
    to: () => "done_unconfirmed",
  },
  close: {
    from: ["done_confirmed", "done_unconfirmed", "rejected"],
    isAllowed: (_initiative, _userId, permissions) => permissions.canManage,
    to: () => "closed",
  },
  // ТЗ 16: a checked effect changes only through a correction with a reason.
  reopen_effect: {
    from: ["done_confirmed", "done_unconfirmed", "closed"],
    isAllowed: (initiative, _userId, permissions) =>
      permissions.canApprove && initiative.workflow.effectOutcome !== undefined,
    to: () => "result_confirmation",
  },
};

/** Владелец и исполнитель отчитываются о результате инициативы. */
export function isResultReporter(initiative: CollegiumInitiative, userId: string) {
  const accountId = collegiumAccountId(userId);
  return initiative.card.ownerId === accountId || initiative.card.executorId === accountId;
}

export function listAvailableCollegiumActions(
  initiative: CollegiumInitiative,
  userId: string,
  permissions: CollegiumInitiativePermissions,
): CollegiumInitiativeAction[] {
  return collegiumInitiativeActions.filter((action) => {
    const rule = actionRules[action];
    return rule.from.includes(initiative.status) &&
      rule.isAllowed(initiative, userId, permissions);
  });
}

/** Следующий статус или ошибка: проверяется исходный статус и право действия. */
export function planCollegiumAction(
  initiative: CollegiumInitiative,
  action: CollegiumInitiativeAction,
  userId: string,
  permissions: CollegiumInitiativePermissions,
): CollegiumInitiativeStatus {
  const rule = actionRules[action];
  if (!rule.from.includes(initiative.status)) {
    throw new CollegiumInitiativeError("Действие недоступно в текущем статусе инициативы.", 409);
  }
  if (!rule.isAllowed(initiative, userId, permissions)) {
    throw new CollegiumInitiativeError("Недостаточно прав для этого действия.", 403);
  }
  return rule.to(initiative);
}

export function readCollegiumActionRequest(
  body: unknown,
  today: string,
): CollegiumInitiativeActionRequest & { comment: string } {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new CollegiumInitiativeError("Передайте действие.");
  }
  const record = body as Record<string, unknown>;
  if (Object.keys(record).some((key) => !["action", "revision", "comment", "rework"].includes(key))) {
    throw new CollegiumInitiativeError("Запрос содержит неизвестные поля.");
  }
  const action = record.action;
  if (!(collegiumInitiativeActions as readonly unknown[]).includes(action)) {
    throw new CollegiumInitiativeError("Неизвестное действие.");
  }
  const revision = record.revision;
  if (typeof revision !== "number" || !Number.isInteger(revision) || revision < 1) {
    throw new CollegiumInitiativeError("Передайте ревизию карточки.");
  }
  const typedAction = action as CollegiumInitiativeAction;
  const comment = readCollegiumOptionalText(record.comment, maxActionCommentLength, "Комментарий");
  if (collegiumActionsRequiringComment.includes(typedAction) && comment === "") {
    throw new CollegiumInitiativeError("Укажите комментарий к решению.");
  }
  if (typedAction !== "return_for_rework") {
    if (record.rework !== undefined) {
      throw new CollegiumInitiativeError("Запрос доработки передаётся только при возврате.");
    }
    return { action: typedAction, revision, comment };
  }
  return { action: typedAction, revision, comment, rework: readReworkRequest(record.rework, today) };
}

export function readReworkRequest(value: unknown, today: string): CollegiumReworkRequest {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new CollegiumInitiativeError("Заполните запрос на доработку.");
  }
  const record = value as Record<string, unknown>;
  if (Object.keys(record).some((key) =>
    !["remarks", "responsibleId", "dueDate", "readinessCriterion"].includes(key))) {
    throw new CollegiumInitiativeError("Запрос доработки содержит неизвестные поля.");
  }
  if (!Array.isArray(record.remarks) || !record.remarks.every((remark) => typeof remark === "string")) {
    throw new CollegiumInitiativeError("Укажите замечания.");
  }
  const remarks = (record.remarks as string[]).map((remark) => remark.trim()).filter(Boolean);
  if (remarks.length === 0) {
    throw new CollegiumInitiativeError("Укажите хотя бы одно обязательное замечание.");
  }
  if (remarks.length > maxRemarks || remarks.some((remark) => remark.length > maxRemarkLength)) {
    throw new CollegiumInitiativeError(
      `Не больше ${maxRemarks} замечаний по ${maxRemarkLength} символов.`,
    );
  }
  const responsibleId = readCollegiumOptionalText(record.responsibleId, 120, "Ответственный за доработку");
  if (!/^account:[A-Za-z0-9_-]{1,100}$/u.test(responsibleId)) {
    throw new CollegiumInitiativeError("Выберите ответственного за доработку.");
  }
  const dueDate = readCollegiumOptionalText(record.dueDate, 10, "Срок доработки");
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(dueDate) || Number.isNaN(Date.parse(`${dueDate}T00:00:00Z`))) {
    throw new CollegiumInitiativeError("Укажите срок доработки.");
  }
  if (dueDate < today) {
    throw new CollegiumInitiativeError("Срок доработки не может быть в прошлом.");
  }
  const readinessCriterion = readCollegiumOptionalText(
    record.readinessCriterion,
    1000,
    "Критерий готовности",
  );
  if (readinessCriterion === "") {
    throw new CollegiumInitiativeError("Укажите критерий готовности к повторному рассмотрению.");
  }
  return { remarks, responsibleId, dueDate, readinessCriterion };
}

/** Сводный статус исполнения для карточки (ТЗ 10.4). */
export function readCollegiumSummaryStatus(
  initiative: CollegiumInitiative,
  assignments: readonly CollegiumLinkedAssignment[],
): CollegiumSummaryStatus {
  switch (initiative.status) {
    case "draft":
      return "not_started";
    case "suspended":
      return "suspended";
    case "rejected":
    case "closed":
      return "closed";
    case "result_confirmation":
      return "awaiting_confirmation";
    case "done_confirmed":
      return "effect_confirmed";
    case "done_unconfirmed":
      return "effect_unconfirmed";
    case "approved_pilot":
    case "approved_implementation":
    case "in_progress":
      if (assignments.some((assignment) => assignment.isOverdue)) return "overdue";
      if (initiative.status !== "in_progress") return "in_preparation";
      return initiative.workflow.lastDecision?.decision === "pilot" ? "in_pilot" : "in_implementation";
    default:
      return "in_preparation";
  }
}

/** Фактический результат; подтверждение эффекта требует его полностью. */
export function readCollegiumResultInput(input: unknown, readAmount: (value: string) => string): CollegiumInitiativeResultInput {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new CollegiumInitiativeError("Передайте фактический результат.");
  }
  const record = input as Record<string, unknown>;
  if (Object.keys(record).some((key) =>
    !["revision", "description", "actualEffectAmount", "source", "conclusion"].includes(key))) {
    throw new CollegiumInitiativeError("Запрос содержит неизвестные поля.");
  }
  const conclusion = readCollegiumOptionalText(record.conclusion, 20, "Вывод");
  if (conclusion !== "" && !(collegiumResultConclusions as readonly string[]).includes(conclusion)) {
    throw new CollegiumInitiativeError("Выберите вывод о достижении результата.");
  }
  return {
    description: readCollegiumOptionalText(record.description, 4000, "Фактический результат"),
    actualEffectAmount: readAmount(readCollegiumOptionalText(record.actualEffectAmount, 40, "Фактический эффект")),
    source: readCollegiumOptionalText(record.source, 1000, "Источник подтверждения"),
    conclusion: conclusion as CollegiumInitiativeResultInput["conclusion"],
  };
}

export function listCollegiumResultGaps(result: CollegiumInitiativeResultInput | undefined) {
  return [
    // The amount now comes from the effect facts.
    ["Фактический результат", result?.description],
    ["Источник подтверждения", result?.source],
    ["Вывод: достигнут / частично / не достигнут", result?.conclusion],
  ].filter(([, value]) => value === undefined || value === "").map(([label]) => label as string);
}
