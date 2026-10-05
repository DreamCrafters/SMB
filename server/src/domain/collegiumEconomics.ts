import {
  collegiumPassportFieldLabels,
  collegiumPassportScenarioFields,
  type CollegiumPassportScheduleRow,
  type CollegiumPassportTextField,
} from "../contracts/collegiumInitiatives.js";
import type {
  CollegiumEconomics,
  CollegiumInitiative,
  CollegiumInitiativeCard,
  CollegiumPassportReason,
  CollegiumReference,
  CollegiumSettingsInput,
} from "../contracts/collegiumInitiatives.js";

/** Настройки «не задано»: условия порогов не срабатывают. */
export const unsetCollegiumSettings: CollegiumSettingsInput = {
  oneTimeCostThreshold: "",
  capexThreshold: "",
  paybackNormMonths: "",
  discountRatePercent: "",
  criticalImportance: [],
};

/** Canonical rubles (`-12.50`) to kopecks without floating point. */
export function toKopecks(value: string) {
  if (value === "") return 0n;
  const sign = value.startsWith("-") ? -1n : 1n;
  const [rubles, kopecks = "0"] = value.replace(/^-/u, "").split(".");
  return sign * (BigInt(rubles) * 100n + BigInt(kopecks.padEnd(2, "0").slice(0, 2)));
}

export function fromKopecks(value: bigint) {
  const absolute = value < 0n ? -value : value;
  return `${value < 0n ? "-" : ""}${absolute / 100n}.${(absolute % 100n).toString().padStart(2, "0")}`;
}

/** numerator / denominator to one decimal, half away from zero; denominator > 0. */
function tenths(numerator: bigint, denominator: bigint) {
  const negative = numerator < 0n;
  const absolute = negative ? -numerator : numerator;
  const scaled = (absolute * 20n + denominator) / (2n * denominator);
  return `${negative && scaled !== 0n ? "-" : ""}${scaled / 10n}.${scaled % 10n}`;
}

const effectPeriodsPerYear: Record<string, bigint> = { month: 12n, quarter: 4n, year: 1n, one_time: 1n };
const recurringPeriodsPerYear: Record<string, bigint> = { month: 12n, year: 1n };

type Calculation = {
  economics: CollegiumEconomics;
  /** Точное сравнение с нормативом в десятых долях месяца. */
  exceedsPaybackNorm: (normMonths: string) => boolean;
};

function monthIndex(month: string) {
  const [year, value] = month.split("-").map(Number);
  return year * 12 + value - 1;
}

/** Срок реализации или график длиннее 12 месяцев (ТЗ 6.3: NPV обязателен). */
function isLongerThanYear(card: CollegiumInitiativeCard) {
  const schedule = card.passport?.schedule ?? [];
  if (schedule.length > 0) {
    const months = schedule.map(({ month }) => monthIndex(month));
    if (Math.max(...months) - Math.min(...months) + 1 > 12) return true;
  }
  if (!card.plannedStart || !card.plannedResult) return false;
  const start = new Date(`${card.plannedStart}T00:00:00Z`);
  start.setUTCFullYear(start.getUTCFullYear() + 1);
  return card.plannedResult > start.toISOString().slice(0, 10);
}

/**
 * NPV по помесячному графику: месячная ставка (1 + r)^(1/12) − 1, t = 0 —
 * первый месяц графика, пропущенные месяцы — нули. Суммы строк ограничены так,
 * что сумма в копейках точна в `Number`; округление одно, в конце.
 */
export function calculateCollegiumNpv(
  schedule: readonly CollegiumPassportScheduleRow[],
  discountRatePercent: string,
) {
  if (schedule.length === 0 || discountRatePercent === "") return "";
  const monthly = (1 + Number(discountRatePercent) / 100) ** (1 / 12) - 1;
  const first = Math.min(...schedule.map(({ month }) => monthIndex(month)));
  const total = schedule.reduce((sum, row) => {
    const flow = Number(toKopecks(row.effect) - toKopecks(row.cost));
    return sum + flow / (1 + monthly) ** (monthIndex(row.month) - first);
  }, 0);
  return fromKopecks(BigInt(Math.round(total)));
}

/**
 * ТЗ 11.3. При прогнозе в паспорте: чистый годовой эффект = маржинальный доход +
 * экономия + предотвращённые потери − постоянные OPEX, разовые = CAPEX + разовые
 * OPEX. Иначе по экспресс-карте: годовой эффект из суммы и периода (разовый эффект
 * считается эффектом первого года) − постоянные затраты в год, разовые = разовые
 * + CAPEX. Окупаемость = разовые / (чистый / 12), ROI = чистый / разовые × 100.
 */
export function calculateCollegiumEconomics(card: CollegiumInitiativeCard, discountRatePercent = ""): Calculation {
  const passport = card.passport;
  const forecast = passport === undefined
    ? []
    : [passport.marginalIncomeForecast, passport.costSavingForecast, passport.preventedLossForecast];
  const fromPassport = forecast.some((value) => value !== "");
  const npvRequired = isLongerThanYear(card);
  const base = {
    source: fromPassport ? "passport" as const : "express" as const,
    npv: npvRequired && passport !== undefined ? calculateCollegiumNpv(passport.schedule, discountRatePercent) : "",
    npvRequired,
    overrides: passport?.overrides ?? {},
  };
  let annual: bigint | undefined;
  let recurring: bigint | undefined;
  let oneTime: bigint;
  if (fromPassport) {
    annual = forecast.reduce((sum, value) => sum + toKopecks(value), 0n);
    recurring = toKopecks(passport!.recurringOpex);
    oneTime = toKopecks(passport!.capex) + toKopecks(passport!.oneTimeOpex);
  } else {
    const effectFactor = effectPeriodsPerYear[card.expectedEffectPeriod];
    const recurringAmount = toKopecks(card.recurringCostAmount);
    const recurringFactor = recurringAmount === 0n ? 1n : recurringPeriodsPerYear[card.recurringCostPeriod];
    oneTime = toKopecks(card.oneTimeCostAmount) + toKopecks(card.capexAmount);
    if (card.expectedEffectAmount !== "" && effectFactor !== undefined && recurringFactor !== undefined) {
      annual = toKopecks(card.expectedEffectAmount) * effectFactor;
      recurring = recurringAmount * recurringFactor;
    }
  }
  const economics: CollegiumEconomics = {
    annualEffect: "",
    annualRecurringCost: "",
    netAnnualEffect: "",
    oneTimeCosts: fromKopecks(oneTime),
    paybackStatus: "none",
    paybackMonths: "",
    roiPercent: "",
    ...base,
  };
  if (annual === undefined || recurring === undefined) return { economics, exceedsPaybackNorm: () => false };
  const net = annual - recurring;
  economics.annualEffect = fromKopecks(annual);
  economics.annualRecurringCost = fromKopecks(recurring);
  economics.netAnnualEffect = fromKopecks(net);
  if (oneTime === 0n) return { economics, exceedsPaybackNorm: () => false };
  economics.roiPercent = tenths(net * 100n, oneTime);
  if (net <= 0n) {
    economics.paybackStatus = "not_paying";
    return { economics, exceedsPaybackNorm: () => true };
  }
  economics.paybackStatus = "payback";
  economics.paybackMonths = tenths(oneTime * 12n, net);
  return {
    economics,
    exceedsPaybackNorm: (normMonths) => {
      if (normMonths === "") return false;
      const [whole, fraction = "0"] = normMonths.split(".");
      const normTenths = BigInt(whole) * 10n + BigInt(fraction.slice(0, 1));
      // oneTime * 12 / net > norm  ⇔  oneTime * 120 > normTenths * net
      return oneTime * 120n > normTenths * net;
    },
  };
}

/** Причины полного паспорта (ТЗ 7.2) по расчётным значениям. */
export function listCollegiumPassportReasons(
  initiative: CollegiumInitiative,
  settings: CollegiumSettingsInput,
  reference: CollegiumReference,
): CollegiumPassportReason[] {
  const { card } = initiative;
  const reasons: CollegiumPassportReason[] = [];
  const oneTimeCost = toKopecks(card.oneTimeCostAmount);
  if (settings.oneTimeCostThreshold !== "" && oneTimeCost > toKopecks(settings.oneTimeCostThreshold)) {
    reasons.push({ code: "one_time_cost", label: "Разовые затраты выше порога" });
  }
  const capex = toKopecks(card.capexAmount);
  if (settings.capexThreshold === "" ? capex > 0n : capex > toKopecks(settings.capexThreshold)) {
    reasons.push({ code: "capex", label: settings.capexThreshold === "" ? "Требуется CAPEX" : "CAPEX выше порога" });
  }
  if (card.changesTechnology === "yes") {
    reasons.push({ code: "technology", label: "Меняется технология, рецептура, спецификация или контроль качества" });
  }
  if (card.newProductOrMarket === "yes") {
    reasons.push({ code: "new_product", label: "Новый продукт, рынок или ключевой клиент" });
  }
  const significant = card.risks.some((risk) =>
    reference.risk_level.some((level) => level.code === risk.levelCode && level.significant === true));
  if (significant) reasons.push({ code: "significant_risk", label: "Существенный риск" });
  const { economics, exceedsPaybackNorm } = calculateCollegiumEconomics(card, settings.discountRatePercent);
  if (economics.paybackStatus === "not_paying") {
    reasons.push({ code: "payback", label: "Инициатива не окупается" });
  } else if (exceedsPaybackNorm(settings.paybackNormMonths)) {
    reasons.push({ code: "payback", label: "Окупаемость дольше норматива" });
  }
  if (card.boardDecisionRequired === "yes" || card.requestedDecision === "board_materials") {
    reasons.push({ code: "board_decision", label: "Требуется решение Совета директоров" });
  }
  if (initiative.status === "approved_pilot" || initiative.status === "board_referral") {
    reasons.push({
      code: "status",
      label: initiative.status === "approved_pilot" ? "Одобрена к пилоту" : "Подлежит вынесению на СД",
    });
  }
  return reasons;
}

const moneyReasons = new Set(["one_time_cost", "capex", "payback"]);
const riskReasons = new Set(["technology", "new_product", "significant_risk"]);

/**
 * Незаполненное в паспорте по причинам ТЗ 7.2: затраты и окупаемость требуют
 * прогноза, затрат, графика и NPV; изменения и риски — альтернатив, влияния,
 * зависимостей, требований и сценариев; решение СД — сценариев, альтернатив,
 * позиции ГД и проекта решения; пилот — плана и стоп-условий.
 */
export function listCollegiumPassportGaps(
  initiative: CollegiumInitiative,
  reasons: readonly CollegiumPassportReason[],
  economics: CollegiumEconomics,
): string[] {
  if (reasons.length === 0) return [];
  const passport = initiative.card.passport;
  const gaps = new Set<string>();
  const text = (field: CollegiumPassportTextField) => {
    if ((passport?.[field] ?? "") === "") gaps.add(collegiumPassportFieldLabels[field]);
  };
  const scenarios = () => {
    if (collegiumPassportScenarioFields.some((field) => (passport?.[field] ?? "") === "")) {
      gaps.add("Сценарии: консервативный, базовый и оптимистичный");
    }
  };
  const codes = new Set(reasons.map(({ code }) => code));
  const isBoard = codes.has("board_decision") || initiative.status === "board_referral";
  if ([...codes].some((code) => moneyReasons.has(code))) {
    if (passport === undefined || ![passport.marginalIncomeForecast, passport.costSavingForecast, passport.preventedLossForecast].some((value) => value !== "")) {
      gaps.add("Прогноз эффекта: маржинальный доход, экономия или предотвращённые потери");
    }
    if (passport === undefined || [passport.capex, passport.oneTimeOpex, passport.recurringOpex].some((value) => value === "")) {
      gaps.add("Затраты: CAPEX, разовые и постоянные OPEX");
    }
    if ((passport?.schedule.length ?? 0) === 0) gaps.add(collegiumPassportFieldLabels.schedule);
    if (economics.npvRequired && economics.npv === "" && passport?.overrides.npv === undefined) {
      gaps.add("NPV: задайте ставку дисконтирования в настройках или введите значение вручную");
    }
  }
  if ([...codes].some((code) => riskReasons.has(code))) {
    text("alternatives");
    text("impacts");
    text("dependencies");
    text("requirements");
    scenarios();
  }
  if (isBoard) {
    scenarios();
    text("alternatives");
    text("ceoPosition");
    text("draftDecision");
  }
  if (initiative.status === "approved_pilot") {
    text("pilotPlan");
    text("pilotStopConditions");
  }
  return [...gaps];
}
