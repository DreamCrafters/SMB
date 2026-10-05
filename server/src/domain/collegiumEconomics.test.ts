import assert from "node:assert/strict";
import test from "node:test";
import type {
  CollegiumInitiative,
  CollegiumInitiativeCard,
  CollegiumReference,
} from "../contracts/collegiumInitiatives.js";
import {
  calculateCollegiumEconomics,
  listCollegiumPassportReasons,
  unsetCollegiumSettings,
} from "./collegiumEconomics.js";

function card(overrides: Partial<CollegiumInitiativeCard>): CollegiumInitiativeCard {
  return {
    expectedEffectAmount: "", expectedEffectPeriod: "", oneTimeCostAmount: "", recurringCostAmount: "",
    recurringCostPeriod: "", capexAmount: "", risks: [], changesTechnology: "", newProductOrMarket: "",
    boardDecisionRequired: "", requestedDecision: "",
    ...overrides,
  } as CollegiumInitiativeCard;
}

const economics = (overrides: Partial<CollegiumInitiativeCard>) => calculateCollegiumEconomics(card(overrides)).economics;

test("net effect, payback and ROI follow ТЗ 11.3 in exact kopecks", () => {
  // 100 000/month → 1 200 000/year; minus 10 000/month → 1 080 000 net; one-time 500 000 + CAPEX 400 000.
  assert.deepEqual(economics({
    expectedEffectAmount: "100000.00", expectedEffectPeriod: "month",
    recurringCostAmount: "10000.00", recurringCostPeriod: "month",
    oneTimeCostAmount: "500000.00", capexAmount: "400000.00",
  }), {
    annualEffect: "1200000.00", annualRecurringCost: "120000.00", netAnnualEffect: "1080000.00",
    oneTimeCosts: "900000.00", paybackStatus: "payback", paybackMonths: "10.0", roiPercent: "120.0",
  });
  // Quarterly effect; payback 1 000 000 × 12 / 300 000 = 40 months; ROI 30 %.
  assert.equal(economics({ expectedEffectAmount: "75000.00", expectedEffectPeriod: "quarter", oneTimeCostAmount: "1000000.00" }).paybackMonths, "40.0");
  // Half-up rounding to tenths: 100 × 12 / 700 = 1.714… → 1.7; ROI 700 %.
  const rounded = economics({ expectedEffectAmount: "700.00", expectedEffectPeriod: "year", oneTimeCostAmount: "100.00" });
  assert.deepEqual([rounded.paybackMonths, rounded.roiPercent], ["1.7", "700.0"]);
});

test("economics edge cases: not paying, no one-time costs, unknown periods", () => {
  const losing = economics({
    expectedEffectAmount: "1000.00", expectedEffectPeriod: "year",
    recurringCostAmount: "1500.00", recurringCostPeriod: "year", oneTimeCostAmount: "100.00",
  });
  assert.deepEqual([losing.netAnnualEffect, losing.paybackStatus, losing.paybackMonths, losing.roiPercent],
    ["-500.00", "not_paying", "", "-500.0"]);
  const free = economics({ expectedEffectAmount: "1000.00", expectedEffectPeriod: "one_time", oneTimeCostAmount: "0.00" });
  assert.deepEqual([free.paybackStatus, free.roiPercent, free.netAnnualEffect], ["none", "", "1000.00"]);
  // A legacy free-text period or a recurring amount without a period cannot be annualized.
  assert.equal(economics({ expectedEffectAmount: "1000.00", expectedEffectPeriod: "год" }).annualEffect, "");
  assert.equal(economics({
    expectedEffectAmount: "1000.00", expectedEffectPeriod: "year", recurringCostAmount: "5.00",
  }).netAnnualEffect, "");
});

test("payback is compared with the norm exactly, not after rounding", () => {
  // 1 000 × 12 / 499 = 24.048… months: rounds to 24.0, yet exceeds a 24-month norm.
  const calculation = calculateCollegiumEconomics(card({
    expectedEffectAmount: "499.00", expectedEffectPeriod: "year", oneTimeCostAmount: "1000.00",
  }));
  assert.equal(calculation.economics.paybackMonths, "24.0");
  assert.equal(calculation.exceedsPaybackNorm("24"), true);
  assert.equal(calculation.exceedsPaybackNorm("24.1"), false);
  assert.equal(calculation.exceedsPaybackNorm(""), false);
  const exact = calculateCollegiumEconomics(card({
    expectedEffectAmount: "500.00", expectedEffectPeriod: "year", oneTimeCostAmount: "1000.00",
  }));
  assert.equal(exact.exceedsPaybackNorm("24"), false);
});

const reference: CollegiumReference = {
  direction: [], effect_type: [], site: [], kpi: [],
  risk_level: [
    { code: "low", label: "Низкий", significant: false },
    { code: "old_high", label: "Высокий (архив)", significant: true, archived: true },
  ],
};

function initiative(overrides: Partial<CollegiumInitiativeCard>, status: CollegiumInitiative["status"] = "draft") {
  return { status, card: card(overrides) } as CollegiumInitiative;
}

const reasons = (
  overrides: Partial<CollegiumInitiativeCard>,
  settings = unsetCollegiumSettings,
  status: CollegiumInitiative["status"] = "draft",
) => listCollegiumPassportReasons(initiative(overrides, status), settings, reference).map(({ code }) => code);

test("each ТЗ 7.2 condition requires the full passport", () => {
  const settings = { ...unsetCollegiumSettings, oneTimeCostThreshold: "1000000.00", capexThreshold: "500000.00", paybackNormMonths: "24" };
  assert.deepEqual(reasons({ oneTimeCostAmount: "1000000.00" }, settings), []);
  assert.deepEqual(reasons({ oneTimeCostAmount: "1000000.01" }, settings), ["one_time_cost"]);
  // Without a threshold any CAPEX counts; with one, only above it.
  assert.deepEqual(reasons({ capexAmount: "1.00" }), ["capex"]);
  assert.deepEqual(reasons({ capexAmount: "500000.00" }, settings), []);
  assert.deepEqual(reasons({ changesTechnology: "yes", newProductOrMarket: "yes" }), ["technology", "new_product"]);
  // Significance is read even from an archived level.
  assert.deepEqual(reasons({ risks: [{ text: "Простой", levelCode: "old_high", levelLabel: "Высокий" }] }), ["significant_risk"]);
  assert.deepEqual(reasons({ risks: [{ text: "Простой", levelCode: "low", levelLabel: "Низкий" }] }), []);
  assert.deepEqual(reasons({
    expectedEffectAmount: "400.00", expectedEffectPeriod: "year", oneTimeCostAmount: "1000.00",
  }, settings), ["payback"]);
  // Not paying back counts even without a norm.
  assert.deepEqual(reasons({
    expectedEffectAmount: "10.00", expectedEffectPeriod: "year", recurringCostAmount: "20.00",
    recurringCostPeriod: "year", oneTimeCostAmount: "1.00",
  }), ["payback"]);
  assert.deepEqual(reasons({ boardDecisionRequired: "yes" }), ["board_decision"]);
  assert.deepEqual(reasons({ requestedDecision: "board_materials" }), ["board_decision"]);
  assert.deepEqual(reasons({}, unsetCollegiumSettings, "approved_pilot"), ["status"]);
  assert.deepEqual(reasons({}, unsetCollegiumSettings, "board_referral"), ["status"]);
  assert.deepEqual(reasons({}), []);
});
