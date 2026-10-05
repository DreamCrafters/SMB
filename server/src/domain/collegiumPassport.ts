import {
  collegiumEconomicsOverrideFields,
  collegiumPassportAmountFields,
  collegiumPassportFieldLabels,
  collegiumPassportScenarioFields,
  collegiumPassportTextFields,
  maxCollegiumMilestones,
  maxCollegiumScheduleRows,
  type CollegiumEconomicsOverrideField,
  type CollegiumInitiative,
  type CollegiumInitiativePermissions,
  type CollegiumInitiativeStatus,
  type CollegiumPassport,
} from "../contracts/collegiumInitiatives.js";
import type { ServerUserProfile } from "./auth.js";
import {
  canEditCollegiumInitiative,
  collegiumAccountId,
  CollegiumInitiativeError,
  readCollegiumAmount,
} from "./collegiumInitiative.js";

const maxPassportTextLength = 4000;
const maxMilestoneTextLength = 500;
const maxExplanationLength = 1000;
/** Keeps 60 schedule rows exact in kopecks inside a JavaScript number. */
const maxScheduleRubles = 100_000_000_000n;

const passportFields = [
  ...collegiumPassportTextFields,
  ...collegiumPassportAmountFields,
  ...collegiumPassportScenarioFields,
  "schedule",
  "milestones",
  "overrides",
] as const;

/** После решения Коллегии паспорт дополняют владелец и секретарь. */
const passportAfterDecisionStatuses: readonly CollegiumInitiativeStatus[] = [
  "approved_pilot",
  "approved_implementation",
  "board_referral",
  "in_progress",
];

export function canEditCollegiumPassport(
  initiative: CollegiumInitiative,
  profile: ServerUserProfile,
  permissions: CollegiumInitiativePermissions,
) {
  if (canEditCollegiumInitiative(initiative, profile, permissions)) return true;
  if (!passportAfterDecisionStatuses.includes(initiative.status)) return false;
  return permissions.canManage ||
    (permissions.canParticipate && initiative.card.ownerId === collegiumAccountId(profile.userId));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readText(value: unknown, label: string, maxLength: number) {
  if (value !== undefined && typeof value !== "string") {
    throw new CollegiumInitiativeError(`Проверьте поле «${label}».`);
  }
  const trimmed = (value ?? "").trim();
  if (trimmed.length > maxLength) {
    throw new CollegiumInitiativeError(`«${label}» — не больше ${maxLength} символов.`);
  }
  return trimmed;
}

function readAmount(value: unknown, label: string) {
  const text = readText(value, label, 40);
  try {
    return readCollegiumAmount(text);
  } catch {
    throw new CollegiumInitiativeError(`«${label}» — неотрицательная сумма в рублях.`);
  }
}

/** Сумма со знаком: чистый эффект, сценарии и NPV могут быть отрицательными. */
export function readCollegiumSignedAmount(value: unknown, label: string) {
  const text = readText(value, label, 40).replace(/^[−–]/u, "-");
  const negative = text.startsWith("-");
  const amount = readAmount(negative ? text.slice(1) : text, label);
  return negative && amount !== "" && !/^0\.00$/u.test(amount) ? `-${amount}` : amount;
}

/** Число с одним знаком после запятой (месяцы, проценты), при `signed` — со знаком. */
function readTenths(value: unknown, label: string, signed: boolean) {
  const text = readText(value, label, 20).replace(/\s/gu, "").replace(",", ".").replace(/^[−–]/u, "-");
  if (text === "") return "";
  const match = new RegExp(`^(${signed ? "-?" : ""})(\\d{1,6})(?:\\.(\\d))?$`, "u").exec(text);
  if (match === null) {
    throw new CollegiumInitiativeError(`«${label}» — число с одним знаком после запятой.`);
  }
  const integer = match[2].replace(/^0+(?=\d)/u, "");
  const result = `${integer}.${match[3] ?? "0"}`;
  return match[1] === "-" && result !== "0.0" ? `-${result}` : result;
}

function isMonth(value: string) {
  const match = /^(\d{4})-(\d{2})$/u.exec(value);
  return match !== null && Number(match[2]) >= 1 && Number(match[2]) <= 12 && Number(match[1]) >= 2000;
}

function isCalendarDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

const overrideReaders: Record<CollegiumEconomicsOverrideField, (value: unknown, label: string) => string> = {
  netAnnualEffect: readCollegiumSignedAmount,
  npv: readCollegiumSignedAmount,
  paybackMonths: (value, label) => readTenths(value, label, false),
  roiPercent: (value, label) => readTenths(value, label, true),
};

const overrideLabels: Record<CollegiumEconomicsOverrideField, string> = {
  netAnnualEffect: "Чистый годовой эффект",
  paybackMonths: "Срок окупаемости",
  roiPercent: "ROI",
  npv: "NPV",
};

/** Полный паспорт (ТЗ 6.3); неизвестные поля и неверные значения — ошибка. */
export function readCollegiumPassportInput(input: unknown): CollegiumPassport {
  if (!isRecord(input)) throw new CollegiumInitiativeError("Передайте полный паспорт.");
  if (Object.keys(input).some((key) => !(passportFields as readonly string[]).includes(key))) {
    throw new CollegiumInitiativeError("Паспорт содержит неизвестные поля.");
  }
  const texts = Object.fromEntries(collegiumPassportTextFields.map((field) =>
    [field, readText(input[field], collegiumPassportFieldLabels[field], maxPassportTextLength)]));
  const amounts = Object.fromEntries(collegiumPassportAmountFields.map((field) =>
    [field, readAmount(input[field], collegiumPassportFieldLabels[field])]));
  const scenarios = Object.fromEntries(collegiumPassportScenarioFields.map((field) =>
    [field, readCollegiumSignedAmount(input[field], collegiumPassportFieldLabels[field])]));

  const rawSchedule = input.schedule ?? [];
  if (!Array.isArray(rawSchedule) || rawSchedule.length > maxCollegiumScheduleRows) {
    throw new CollegiumInitiativeError(`График — не больше ${maxCollegiumScheduleRows} месяцев.`);
  }
  const months = new Set<string>();
  const schedule = rawSchedule.map((row: unknown) => {
    if (!isRecord(row)) throw new CollegiumInitiativeError("Проверьте график по месяцам.");
    const month = readText(row.month, "Месяц", 7);
    if (!isMonth(month) || months.has(month)) {
      throw new CollegiumInitiativeError("В графике каждый месяц указывается один раз в виде ГГГГ-ММ.");
    }
    months.add(month);
    const cost = readAmount(row.cost, "Затраты месяца");
    const effect = readAmount(row.effect, "Эффект месяца");
    for (const value of [cost, effect]) {
      if (value !== "" && BigInt(value.split(".")[0]) >= maxScheduleRubles) {
        throw new CollegiumInitiativeError("Сумма месяца в графике — меньше 100 млрд ₽.");
      }
    }
    return { month, cost: cost === "" ? "0.00" : cost, effect: effect === "" ? "0.00" : effect };
  }).sort((left, right) => left.month.localeCompare(right.month));

  const rawMilestones = input.milestones ?? [];
  if (!Array.isArray(rawMilestones) || rawMilestones.length > maxCollegiumMilestones) {
    throw new CollegiumInitiativeError(`Контрольных точек — не больше ${maxCollegiumMilestones}.`);
  }
  const milestones = rawMilestones.map((row: unknown) => {
    if (!isRecord(row)) throw new CollegiumInitiativeError("Проверьте контрольные точки.");
    const date = readText(row.date, "Дата контрольной точки", 10);
    const text = readText(row.text, "Контрольная точка", maxMilestoneTextLength);
    if (!isCalendarDate(date) || text === "") {
      throw new CollegiumInitiativeError("У контрольной точки нужны дата и описание.");
    }
    return { date, text };
  }).sort((left, right) => left.date.localeCompare(right.date));

  const rawOverrides = input.overrides ?? {};
  if (!isRecord(rawOverrides) || Object.keys(rawOverrides).some((key) =>
    !(collegiumEconomicsOverrideFields as readonly string[]).includes(key))) {
    throw new CollegiumInitiativeError("Проверьте ручные значения расчёта.");
  }
  const overrides: CollegiumPassport["overrides"] = {};
  for (const field of collegiumEconomicsOverrideFields) {
    const raw = rawOverrides[field];
    if (raw === undefined) continue;
    if (!isRecord(raw)) throw new CollegiumInitiativeError("Проверьте ручные значения расчёта.");
    const value = overrideReaders[field](raw.value, overrideLabels[field]);
    const explanation = readText(raw.explanation, `Пояснение: ${overrideLabels[field]}`, maxExplanationLength);
    if (value === "") continue;
    if (explanation === "") {
      throw new CollegiumInitiativeError(`Поясните ручное значение «${overrideLabels[field]}».`);
    }
    overrides[field] = { value, explanation };
  }

  return {
    ...texts,
    ...amounts,
    ...scenarios,
    schedule,
    milestones,
    overrides,
  } as CollegiumPassport;
}
