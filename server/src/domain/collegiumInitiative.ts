import {
  collegiumCostVatOptions,
  collegiumInitiativeRoleFields,
  collegiumRecurringPeriods,
  collegiumRequestedDecisions,
  maxCollegiumInitiativeRisks,
  type CollegiumInitiative,
  type CollegiumInitiativeCard,
  type CollegiumInitiativeCardInput,
  type CollegiumInitiativePermissions,
  type CollegiumInitiativeStatus,
  type CollegiumReference,
} from "../contracts/collegiumInitiatives.js";
import { hasProfileCapability, type ServerUserProfile } from "./auth.js";

export class CollegiumInitiativeError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
    this.name = "CollegiumInitiativeError";
  }
}

const maxTitleLength = 250;
const maxShortTextLength = 250;
const maxLongTextLength = 4000;
const maxAmountIntegerDigits = 13;

const shortTextFields = [
  "baselineValue",
  "baselinePeriod",
  "baselineSource",
  "expectedEffectPeriod",
  "expectedEffectKind",
  "oneTimeCostSource",
  "kpiSource",
] as const satisfies readonly (keyof CollegiumInitiativeCardInput)[];

const longTextFields = [
  "problem",
  "solution",
  "changeScope",
  "effectMethod",
  "internalResources",
  "kpiCriterion",
] as const satisfies readonly (keyof CollegiumInitiativeCardInput)[];

const amountFields = [
  "expectedEffectAmount",
  "oneTimeCostAmount",
  "recurringCostAmount",
] as const satisfies readonly (keyof CollegiumInitiativeCardInput)[];

const dateFields = [
  "plannedStart",
  "plannedResult",
] as const satisfies readonly (keyof CollegiumInitiativeCardInput)[];

const cardInputFields = [
  "title",
  "initiatorId",
  "directionCode",
  "effectTypeCodes",
  ...shortTextFields,
  ...longTextFields,
  ...amountFields,
  "oneTimeCostVat",
  "recurringCostPeriod",
  ...collegiumInitiativeRoleFields,
  ...dateFields,
  "risks",
  "requestedDecision",
] as const satisfies readonly (keyof CollegiumInitiativeCardInput)[];

/** Статусы, в которых участник правит свою или назначенную инициативу. */
const participantEditableStatuses: readonly CollegiumInitiativeStatus[] = [
  "draft",
  "rework",
  "needs_elaboration",
];

/** Секретарь правит карточку до вынесения её в повестку. */
const managerEditableStatuses: readonly CollegiumInitiativeStatus[] = [
  "draft",
  "preliminary_review",
  "rework",
  "ready",
  "needs_elaboration",
];

export function collegiumInitiativePermissions(
  profile: ServerUserProfile,
): CollegiumInitiativePermissions {
  return {
    canView: hasProfileCapability(profile, "business.view_collegium_initiatives"),
    canParticipate: hasProfileCapability(
      profile,
      "business.participate_collegium_initiatives",
    ),
    canManage: hasProfileCapability(profile, "business.manage_collegium_initiatives"),
    canApprove: hasProfileCapability(profile, "business.approve_collegium_initiatives"),
  };
}

export function collegiumAccountId(userId: string) {
  return `account:${userId}`;
}

/** Автор, инициатор и владелец считаются своими для инициативы. */
export function isOwnCollegiumInitiative(
  initiative: CollegiumInitiative,
  userId: string,
) {
  const accountId = collegiumAccountId(userId);
  return initiative.createdByUserId === userId ||
    initiative.card.initiatorId === accountId ||
    initiative.card.ownerId === accountId;
}

/** Черновики видят только автор, инициатор, владелец и секретарь. */
export function canViewCollegiumInitiative(
  initiative: CollegiumInitiative,
  profile: ServerUserProfile,
  permissions = collegiumInitiativePermissions(profile),
) {
  if (!permissions.canView) return false;
  if (initiative.status !== "draft" || permissions.canManage) return true;
  return isOwnCollegiumInitiative(initiative, profile.userId);
}

export function canEditCollegiumInitiative(
  initiative: CollegiumInitiative,
  profile: ServerUserProfile,
  permissions = collegiumInitiativePermissions(profile),
) {
  if (permissions.canManage) {
    return managerEditableStatuses.includes(initiative.status);
  }
  return permissions.canParticipate &&
    participantEditableStatuses.includes(initiative.status) &&
    isOwnCollegiumInitiative(initiative, profile.userId);
}

/**
 * Проверяет форму и приводит её к каноническому виду. Обязательность полей
 * для допуска к Коллегии проверяет отдельный фильтр; черновик требует только
 * наименование.
 */
export function readCollegiumInitiativeCardInput(
  input: unknown,
  reference: CollegiumReference,
): CollegiumInitiativeCard {
  if (!isRecord(input)) {
    throw new CollegiumInitiativeError("Передайте карточку инициативы.");
  }
  const unknownField = Object.keys(input).find(
    (key) => !(cardInputFields as readonly string[]).includes(key),
  );
  if (unknownField !== undefined) {
    throw new CollegiumInitiativeError("Карточка содержит неизвестные поля.");
  }

  const text = (field: keyof CollegiumInitiativeCardInput, maxLength: number) => {
    const value = input[field] ?? "";
    if (typeof value !== "string") {
      throw new CollegiumInitiativeError("Проверьте текстовые поля карточки.");
    }
    const trimmed = value.trim();
    if (trimmed.length > maxLength) {
      throw new CollegiumInitiativeError(
        `Поле слишком длинное: не больше ${maxLength} символов.`,
      );
    }
    return trimmed;
  };

  const title = text("title", maxTitleLength);
  if (title === "") {
    throw new CollegiumInitiativeError("Укажите наименование идеи.");
  }

  const directionCode = text("directionCode", maxShortTextLength);
  const direction = reference.direction.find(({ code }) => code === directionCode);
  if (directionCode !== "" && direction === undefined) {
    throw new CollegiumInitiativeError("Выберите направление из справочника.");
  }

  const rawEffectTypes = input.effectTypeCodes ?? [];
  if (
    !Array.isArray(rawEffectTypes) ||
    !rawEffectTypes.every((code) => typeof code === "string") ||
    new Set(rawEffectTypes).size !== rawEffectTypes.length
  ) {
    throw new CollegiumInitiativeError("Проверьте типы эффекта.");
  }
  const effectTypes = (rawEffectTypes as string[]).map((code) => {
    const option = reference.effect_type.find((item) => item.code === code);
    if (option === undefined) {
      throw new CollegiumInitiativeError("Выберите типы эффекта из справочника.");
    }
    return option;
  });

  const rawRisks = input.risks ?? [];
  if (
    !Array.isArray(rawRisks) ||
    !rawRisks.every((risk) => typeof risk === "string")
  ) {
    throw new CollegiumInitiativeError("Проверьте риски.");
  }
  const risks = (rawRisks as string[])
    .map((risk) => risk.trim())
    .filter((risk) => risk !== "");
  if (risks.length > maxCollegiumInitiativeRisks) {
    throw new CollegiumInitiativeError("Укажите не больше трёх рисков.");
  }
  if (risks.some((risk) => risk.length > maxShortTextLength)) {
    throw new CollegiumInitiativeError(
      `Риск не должен быть длиннее ${maxShortTextLength} символов.`,
    );
  }

  const oneTimeCostVat = text("oneTimeCostVat", maxShortTextLength);
  if (
    oneTimeCostVat !== "" &&
    !(collegiumCostVatOptions as readonly string[]).includes(oneTimeCostVat)
  ) {
    throw new CollegiumInitiativeError("Укажите НДС разовых затрат.");
  }
  const recurringCostPeriod = text("recurringCostPeriod", maxShortTextLength);
  if (
    recurringCostPeriod !== "" &&
    !(collegiumRecurringPeriods as readonly string[]).includes(recurringCostPeriod)
  ) {
    throw new CollegiumInitiativeError("Укажите период постоянных затрат.");
  }
  const requestedDecision = text("requestedDecision", maxShortTextLength);
  if (
    requestedDecision !== "" &&
    !(collegiumRequestedDecisions as readonly string[]).includes(requestedDecision)
  ) {
    throw new CollegiumInitiativeError("Выберите решение, которое требуется от Коллегии.");
  }

  const people = Object.fromEntries(
    [...collegiumInitiativeRoleFields, "initiatorId" as const].map((field) => {
      const value = text(field, maxShortTextLength);
      if (value !== "" && !/^account:[A-Za-z0-9_-]{1,100}$/u.test(value)) {
        throw new CollegiumInitiativeError("Выберите действующую учётную запись.");
      }
      return [field, value];
    }),
  ) as Record<(typeof collegiumInitiativeRoleFields)[number] | "initiatorId", string>;

  const dates = Object.fromEntries(dateFields.map((field) => {
    const value = text(field, 10);
    if (value !== "" && !isCalendarDate(value)) {
      throw new CollegiumInitiativeError("Проверьте плановые даты.");
    }
    return [field, value];
  })) as Record<(typeof dateFields)[number], string>;
  if (
    dates.plannedStart !== "" &&
    dates.plannedResult !== "" &&
    dates.plannedResult < dates.plannedStart
  ) {
    throw new CollegiumInitiativeError(
      "Плановая дата результата не может быть раньше даты начала.",
    );
  }

  const amounts = Object.fromEntries(amountFields.map((field) => [
    field,
    readCollegiumAmount(text(field, 40)),
  ])) as Record<(typeof amountFields)[number], string>;

  return {
    title,
    initiatorId: people.initiatorId,
    directionCode,
    directionLabel: direction?.label ?? "",
    effectTypeCodes: effectTypes.map(({ code }) => code),
    effectTypeLabels: effectTypes.map(({ label }) => label),
    ...Object.fromEntries(
      shortTextFields.map((field) => [field, text(field, maxShortTextLength)]),
    ) as Record<(typeof shortTextFields)[number], string>,
    ...Object.fromEntries(
      longTextFields.map((field) => [field, text(field, maxLongTextLength)]),
    ) as Record<(typeof longTextFields)[number], string>,
    ...amounts,
    oneTimeCostVat: oneTimeCostVat as CollegiumInitiativeCard["oneTimeCostVat"],
    recurringCostPeriod:
      recurringCostPeriod as CollegiumInitiativeCard["recurringCostPeriod"],
    ownerId: people.ownerId,
    executorId: people.executorId,
    executionControllerId: people.executionControllerId,
    effectControllerId: people.effectControllerId,
    ...dates,
    risks,
    requestedDecision:
      requestedDecision as CollegiumInitiativeCard["requestedDecision"],
  };
}

/**
 * Сумма вводится с пробелами и запятой, хранится канонически `1234.50`.
 * Явный ноль — заполненное значение, пустая строка — незаполненное.
 */
export function readCollegiumAmount(value: string) {
  const normalized = value.replace(/[\s ]/gu, "").replace(",", ".");
  if (normalized === "") return "";
  const match = new RegExp(
    `^(\\d{1,${maxAmountIntegerDigits}})(?:\\.(\\d{1,2}))?$`,
    "u",
  ).exec(normalized);
  if (match === null) {
    throw new CollegiumInitiativeError(
      "Сумма должна быть неотрицательным числом с не более чем двумя знаками после запятой.",
    );
  }
  const integer = match[1].replace(/^0+(?=\d)/u, "");
  return `${integer}.${(match[2] ?? "").padEnd(2, "0")}`;
}

export function listChangedCollegiumFields(
  before: CollegiumInitiativeCard,
  after: CollegiumInitiativeCard,
): Array<keyof CollegiumInitiativeCardInput> {
  return cardInputFields.filter(
    (field) => JSON.stringify(before[field]) !== JSON.stringify(after[field]),
  );
}

export function readCollegiumOptionalText(
  value: unknown,
  maxLength: number,
  label: string,
) {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string") {
    throw new CollegiumInitiativeError(`Проверьте поле «${label}».`);
  }
  const trimmed = value.trim();
  if (trimmed.length > maxLength) {
    throw new CollegiumInitiativeError(
      `Поле «${label}» не должно быть длиннее ${maxLength} символов.`,
    );
  }
  return trimmed;
}

function isCalendarDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
