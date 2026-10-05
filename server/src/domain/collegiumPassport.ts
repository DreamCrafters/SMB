import { randomUUID } from "node:crypto";
import {
  collegiumConfirmationPeriods,
  collegiumEconomicsOverrideFields,
  collegiumPassportAmountFields,
  collegiumPassportFieldLabels,
  collegiumPassportScenarioFields,
  collegiumPassportTextFields,
  maxCollegiumMilestones,
  maxCollegiumPlannedEffects,
  maxCollegiumScheduleRows,
  type CollegiumEconomicsOverrideField,
  type CollegiumInitiative,
  type CollegiumInitiativePermissions,
  type CollegiumInitiativeStatus,
  type CollegiumEffectDuplicate,
  type CollegiumPassport,
  type CollegiumPlannedEffect,
  type CollegiumReference,
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
  "effects",
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

const effectFields = [
  "id", "effectTypeCode", "directionCode", "kpiCode", "siteCode", "baselineValue", "baselinePeriod",
  "targetValue", "annualAmount", "method", "measurementStart", "measurementEnd", "confirmationPeriod",
  "confirmationPeriodNote", "notDuplicateExplanation",
] as const;

type PassportContext = {
  reference?: CollegiumReference;
  previous?: CollegiumPassport;
  newId?: () => string;
};

function readEffects(raw: unknown, context: PassportContext): CollegiumPlannedEffect[] {
  const rows = raw ?? [];
  if (!Array.isArray(rows) || rows.length > maxCollegiumPlannedEffects) {
    throw new CollegiumInitiativeError(`Плановых эффектов — не больше ${maxCollegiumPlannedEffects}.`);
  }
  if (rows.length === 0) return [];
  const reference = context.reference;
  if (reference === undefined) throw new CollegiumInitiativeError("Справочники недоступны.");
  const previous = new Map((context.previous?.effects ?? []).map((effect) => [effect.id, effect]));
  const ids = new Set<string>();
  return rows.map((row: unknown, index): CollegiumPlannedEffect => {
    const number = index + 1;
    if (!isRecord(row) || Object.keys(row).some((key) => !(effectFields as readonly string[]).includes(key))) {
      throw new CollegiumInitiativeError(`Проверьте плановый эффект ${number}.`);
    }
    const text = (field: (typeof effectFields)[number], label: string, maxLength = 250) =>
      readText(row[field], `Эффект ${number}: ${label}`, maxLength);
    // Ids are the server's: a known id keeps its identity, a new row gets one.
    const requestedId = text("id", "ID", 100);
    if (requestedId !== "" && !previous.has(requestedId)) {
      throw new CollegiumInitiativeError("Плановый эффект не найден. Обновите карточку.", 409);
    }
    const id = requestedId === "" ? (context.newId ?? randomUUID)() : requestedId;
    if (ids.has(id)) throw new CollegiumInitiativeError("Плановый эффект указан дважды.");
    ids.add(id);
    const before = previous.get(id);
    const option = (kind: "effect_type" | "direction" | "kpi" | "site", field: "effectTypeCode" | "directionCode" | "kpiCode" | "siteCode", label: string) => {
      const code = text(field, label, 60);
      if (code === "") return { code, label: "", unit: "" };
      const found = reference[kind].find((item) => item.code === code);
      if (found === undefined || (found.archived === true && before?.[field] !== code)) {
        throw new CollegiumInitiativeError(`Эффект ${number}: выберите «${label}» из справочника.`);
      }
      return { code, label: found.label, unit: found.unit ?? "" };
    };
    const effectType = option("effect_type", "effectTypeCode", "вид эффекта");
    const direction = option("direction", "directionCode", "направление");
    const kpi = option("kpi", "kpiCode", "KPI");
    const site = option("site", "siteCode", "участок");
    const baselineValue = text("baselineValue", "базовое значение");
    const baselinePeriod = text("baselinePeriod", "период базовой линии");
    const annualAmount = readAmount(row.annualAmount, `Эффект ${number}: сумма в год`);
    const measurementStart = text("measurementStart", "начало измерения", 10);
    const measurementEnd = text("measurementEnd", "конец измерения", 10);
    if (effectType.code === "" || baselineValue === "" || baselinePeriod === "" || annualAmount === "" || measurementStart === "") {
      throw new CollegiumInitiativeError(
        `Эффект ${number}: укажите вид, базовую линию и её период, сумму в год и начало измерения.`,
      );
    }
    if (!isCalendarDate(measurementStart) || (measurementEnd !== "" && (!isCalendarDate(measurementEnd) || measurementEnd < measurementStart))) {
      throw new CollegiumInitiativeError(`Эффект ${number}: проверьте период измерения.`);
    }
    const confirmationPeriod = text("confirmationPeriod", "период подтверждения", 20);
    if (confirmationPeriod !== "" && !(collegiumConfirmationPeriods as readonly string[]).includes(confirmationPeriod)) {
      throw new CollegiumInitiativeError(`Эффект ${number}: выберите период подтверждения.`);
    }
    return {
      id,
      effectTypeCode: effectType.code,
      effectTypeLabel: effectType.label,
      directionCode: direction.code,
      directionLabel: direction.label,
      kpiCode: kpi.code,
      kpiLabel: kpi.label,
      kpiUnit: kpi.unit,
      siteCode: site.code,
      siteLabel: site.label,
      baselineValue,
      baselinePeriod,
      targetValue: text("targetValue", "целевое значение"),
      annualAmount,
      method: text("method", "методика", maxPassportTextLength),
      measurementStart,
      measurementEnd,
      confirmationPeriod: confirmationPeriod as CollegiumPlannedEffect["confirmationPeriod"],
      confirmationPeriodNote: text("confirmationPeriodNote", "уточнение периода"),
      notDuplicateExplanation: text("notDuplicateExplanation", "пояснение «не дубль»", maxExplanationLength),
    };
  });
}

/** ID неявного эффекта: эффект экспресс-карты, пока плановые эффекты не описаны. */
export const collegiumMainEffectId = "main";

/**
 * Плановые эффекты инициативы для учёта фактов (ТЗ 11.2: у каждого эффекта
 * есть ID). Без описанных эффектов — один неявный эффект экспресс-карты.
 */
export function listCollegiumPlannedEffects(initiative: CollegiumInitiative): Array<{ id: string; label: string }> {
  const effects = initiative.card.passport?.effects ?? [];
  if (effects.length > 0) {
    return effects.map((effect) => ({
      id: effect.id,
      label: [effect.effectTypeLabel, effect.kpiLabel, effect.siteLabel].filter(Boolean).join(", "),
    }));
  }
  return [{ id: collegiumMainEffectId, label: "Эффект экспресс-карты" }];
}

/** Сравнимые эффекты: дубль ищется только среди явно описанных. */
const duplicateExcludedStatuses: readonly CollegiumInitiativeStatus[] = ["rejected", "done_unconfirmed"];

/**
 * Возможные дубли (ТЗ 11.2): тот же вид, направление, KPI и участок при
 * пересекающемся периоде измерения у другой инициативы из `others` (вызывающий
 * передаёт только видимые пользователю).
 */
export function findCollegiumEffectDuplicates(
  initiative: CollegiumInitiative,
  others: readonly CollegiumInitiative[],
): CollegiumEffectDuplicate[] {
  const effects = initiative.card.passport?.effects ?? [];
  const duplicates: CollegiumEffectDuplicate[] = [];
  for (const other of others) {
    if (other.id === initiative.id || duplicateExcludedStatuses.includes(other.status)) continue;
    for (const theirs of other.card.passport?.effects ?? []) {
      for (const ours of effects) {
        const same = (["effectTypeCode", "directionCode", "kpiCode", "siteCode"] as const)
          .every((field) => ours[field] === theirs[field]);
        const overlaps = (theirs.measurementEnd === "" || ours.measurementStart <= theirs.measurementEnd) &&
          (ours.measurementEnd === "" || theirs.measurementStart <= ours.measurementEnd);
        if (same && overlaps) {
          duplicates.push({
            effectId: ours.id,
            initiativeId: other.id,
            initiativeNumber: other.number,
            initiativeTitle: other.card.title,
            otherEffectId: theirs.id,
          });
        }
      }
    }
  }
  return duplicates;
}

/** Полный паспорт (ТЗ 6.3); неизвестные поля и неверные значения — ошибка. */
export function readCollegiumPassportInput(input: unknown, context: PassportContext = {}): CollegiumPassport {
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
    effects: readEffects(input.effects, context),
  } as CollegiumPassport;
}
