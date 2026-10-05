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

/**
 * ТЗ 11.3 по экспресс-карте: годовой эффект из суммы и периода (разовый эффект
 * считается эффектом первого года), чистый годовой эффект = эффект − постоянные
 * затраты в год, разовые затраты = разовые + CAPEX, окупаемость = разовые /
 * (чистый / 12), ROI = чистый / разовые × 100.
 */
export function calculateCollegiumEconomics(card: CollegiumInitiativeCard): Calculation {
  const effectFactor = effectPeriodsPerYear[card.expectedEffectPeriod];
  const recurringAmount = toKopecks(card.recurringCostAmount);
  const recurringFactor = recurringAmount === 0n ? 1n : recurringPeriodsPerYear[card.recurringCostPeriod];
  const oneTime = toKopecks(card.oneTimeCostAmount) + toKopecks(card.capexAmount);
  const empty: Calculation = {
    economics: {
      annualEffect: "",
      annualRecurringCost: "",
      netAnnualEffect: "",
      oneTimeCosts: fromKopecks(oneTime),
      paybackStatus: "none",
      paybackMonths: "",
      roiPercent: "",
    },
    exceedsPaybackNorm: () => false,
  };
  if (card.expectedEffectAmount === "" || effectFactor === undefined || recurringFactor === undefined) {
    return empty;
  }
  const annual = toKopecks(card.expectedEffectAmount) * effectFactor;
  const recurring = recurringAmount * recurringFactor;
  const net = annual - recurring;
  const economics: CollegiumEconomics = {
    ...empty.economics,
    annualEffect: fromKopecks(annual),
    annualRecurringCost: fromKopecks(recurring),
    netAnnualEffect: fromKopecks(net),
  };
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
  const { economics, exceedsPaybackNorm } = calculateCollegiumEconomics(card);
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
