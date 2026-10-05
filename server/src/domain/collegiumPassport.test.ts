import assert from "node:assert/strict";
import test from "node:test";
import {
  resolveCollegiumInitiativeCapabilities,
  type CollegiumInitiative,
  type CollegiumInitiativeAccess,
  type CollegiumInitiativeCard,
  type CollegiumPassport,
} from "../contracts/collegiumInitiatives.js";
import type { ServerUserProfile } from "./auth.js";
import { collegiumInitiativePermissions } from "./collegiumInitiative.js";
import {
  calculateCollegiumEconomics,
  calculateCollegiumNpv,
  listCollegiumPassportGaps,
  listCollegiumPassportReasons,
  unsetCollegiumSettings,
} from "./collegiumEconomics.js";
import {
  canEditCollegiumPassport,
  findCollegiumEffectDuplicates,
  listCollegiumPlannedEffects,
  readCollegiumPassportInput,
} from "./collegiumPassport.js";

function emptyPassport(overrides: Partial<CollegiumPassport> = {}): CollegiumPassport {
  return readCollegiumPassportInput({ ...overrides });
}

test("passport input is validated, canonical and sorted", () => {
  const passport = readCollegiumPassportInput({
    alternatives: "  Ничего не делать ",
    marginalIncomeForecast: "1 200 000",
    scenarioConservative: "−50 000,5",
    schedule: [
      { month: "2027-02", cost: "", effect: "100" },
      { month: "2027-01", cost: "500", effect: "0" },
    ],
    milestones: [{ date: "2027-03-01", text: "Запуск" }, { date: "2027-01-15", text: "Закупка" }],
    overrides: { paybackMonths: { value: "18,5", explanation: "С учётом сезонности" }, npv: { value: "", explanation: "" } },
  });
  assert.equal(passport.alternatives, "Ничего не делать");
  assert.equal(passport.marginalIncomeForecast, "1200000.00");
  assert.equal(passport.scenarioConservative, "-50000.50");
  assert.deepEqual(passport.schedule.map(({ month, cost }) => [month, cost]), [["2027-01", "500.00"], ["2027-02", "0.00"]]);
  assert.deepEqual(passport.milestones.map(({ text }) => text), ["Закупка", "Запуск"]);
  // An empty manual value is no override at all.
  assert.deepEqual(passport.overrides, { paybackMonths: { value: "18.5", explanation: "С учётом сезонности" } });

  const rejects = (input: Record<string, unknown>, pattern: RegExp) =>
    assert.throws(() => readCollegiumPassportInput(input), pattern);
  rejects({ secret: "x" }, /неизвестные/u);
  rejects({ capex: "-1" }, /CAPEX/u);
  rejects({ alternatives: "x".repeat(4001) }, /4000/u);
  rejects({ schedule: [{ month: "2027-01" }, { month: "2027-01" }] }, /один раз/u);
  rejects({ schedule: [{ month: "2027-13" }] }, /ГГГГ-ММ/u);
  rejects({ schedule: [{ month: "2027-01", cost: "100000000000" }] }, /100 млрд/u);
  rejects({ schedule: Array.from({ length: 61 }, (_, index) => ({ month: `20${30 + Math.floor(index / 12)}-${String(index % 12 + 1).padStart(2, "0")}` })) }, /60/u);
  rejects({ milestones: [{ date: "2027-02-30", text: "Х" }] }, /дата и описание/u);
  rejects({ overrides: { roiPercent: { value: "25" } } }, /Поясните/u);
  rejects({ overrides: { margin: { value: "1", explanation: "x" } } }, /ручные значения/u);
});

function profile(userId: string, level: CollegiumInitiativeAccess): ServerUserProfile {
  return {
    userId, displayName: userId, accountType: "business_owner",
    activeAccess: {
      accountId: `access-${userId}`, accountType: "business_owner", position: "collegium",
      positionDisplayName: "Коллегия", displayName: userId, scope: { kind: "organization" },
      capabilities: resolveCollegiumInitiativeCapabilities(level),
      navigationItems: ["business.collegium_initiatives"], issuedAt: "2026-10-05T00:00:00.000Z",
    },
    receivedAt: "2026-10-05T00:00:00.000Z",
  };
}

function initiative(status: CollegiumInitiative["status"], card: Partial<CollegiumInitiativeCard> = {}) {
  return {
    id: "i", number: "И-2026-0001", status, revision: 3, createdByUserId: "author", createdAt: "", updatedAt: "",
    workflow: { submittedAt: "2026-10-01T00:00:00.000Z" },
    card: {
      ownerId: "account:owner", executorId: "account:executor", initiatorId: "account:author", risks: [],
      expectedEffectAmount: "", expectedEffectPeriod: "", oneTimeCostAmount: "", recurringCostAmount: "",
      recurringCostPeriod: "", capexAmount: "", changesTechnology: "", newProductOrMarket: "",
      boardDecisionRequired: "", requestedDecision: "", plannedStart: "", plannedResult: "",
      ...card,
    } as CollegiumInitiativeCard,
  } as CollegiumInitiative;
}

test("after the Collegium decision only the owner and the secretary edit the passport", () => {
  const can = (status: CollegiumInitiative["status"], who: ServerUserProfile) =>
    canEditCollegiumPassport(initiative(status), who, collegiumInitiativePermissions(who));
  const owner = profile("owner", "participant");
  assert.equal(can("approved_pilot", owner), true);
  assert.equal(can("board_referral", profile("secretary", "secretary")), true);
  assert.equal(can("in_progress", profile("executor", "participant")), false);
  assert.equal(can("closed", profile("secretary", "secretary")), false);
  assert.equal(can("on_agenda", owner), false);
  // Before the meeting the express card rules apply.
  assert.equal(can("rework", owner), true);
});

test("a passport forecast drives the economics and NPV discounts the monthly schedule", () => {
  const card = initiative("approved_implementation", {
    expectedEffectAmount: "1.00", expectedEffectPeriod: "year", oneTimeCostAmount: "1.00",
    passport: emptyPassport({
      marginalIncomeForecast: "600000", costSavingForecast: "400000", recurringOpex: "100000",
      capex: "800000", oneTimeOpex: "100000",
      schedule: [
        { month: "2026-01", cost: "1000", effect: "0" },
        { month: "2027-01", cost: "0", effect: "1120" },
      ],
    }),
  }).card;
  const { economics } = calculateCollegiumEconomics(card, "12");
  assert.equal(economics.source, "passport");
  assert.deepEqual(
    [economics.netAnnualEffect, economics.oneTimeCosts, economics.paybackMonths, economics.roiPercent],
    ["900000.00", "900000.00", "12.0", "100.0"],
  );
  // 13 months of schedule need NPV; 1 120 a year later at 12 % is worth 1 000 today.
  assert.equal(economics.npvRequired, true);
  assert.equal(economics.npv, "0.00");
  assert.equal(calculateCollegiumEconomics(card, "").economics.npv, "");
  assert.equal(calculateCollegiumNpv([], "12"), "");
  // A planned term over a year also requires NPV.
  assert.equal(calculateCollegiumEconomics(initiative("draft", {
    plannedStart: "2026-11-01", plannedResult: "2027-11-02",
  }).card).economics.npvRequired, true);
  assert.equal(calculateCollegiumEconomics(initiative("draft", {
    plannedStart: "2026-11-01", plannedResult: "2027-11-01",
  }).card).economics.npvRequired, false);
});

test("passport gaps follow the reasons", () => {
  const reference = { direction: [], effect_type: [], risk_level: [], site: [], kpi: [] };
  const gaps = (subject: CollegiumInitiative, rate = "") => {
    const settings = { ...unsetCollegiumSettings, discountRatePercent: rate };
    const reasons = listCollegiumPassportReasons(subject, settings, reference);
    return listCollegiumPassportGaps(subject, reasons, calculateCollegiumEconomics(subject.card, rate).economics);
  };
  assert.deepEqual(gaps(initiative("ready")), []);
  assert.deepEqual(gaps(initiative("ready", { capexAmount: "1000.00", plannedStart: "2026-01-01", plannedResult: "2027-06-01" })), [
    "Прогноз эффекта: маржинальный доход, экономия или предотвращённые потери",
    "Затраты: CAPEX, разовые и постоянные OPEX",
    "График затрат и эффекта по месяцам",
    "NPV: задайте ставку дисконтирования в настройках или введите значение вручную",
  ]);
  const filled = initiative("ready", {
    capexAmount: "1000.00", plannedStart: "2026-01-01", plannedResult: "2027-06-01",
    passport: emptyPassport({
      costSavingForecast: "5000", capex: "1000", oneTimeOpex: "0", recurringOpex: "0",
      schedule: [{ month: "2026-01", cost: "1000", effect: "0" }],
      overrides: { npv: { value: "3000", explanation: "Расчёт финансовой службы" } },
    }),
  });
  assert.deepEqual(gaps(filled), []);
  assert.deepEqual(gaps(initiative("ready", { changesTechnology: "yes" })), [
    "Альтернативы, включая «ничего не делать»",
    "Влияние на ТБ, промышленную безопасность, экологию и качество",
    "Зависимости от поставщиков, клиентов, оборудования, персонала, финансирования",
    "Договоры, закупки, согласования, разрешения, сертификация, испытания",
    "Сценарии: консервативный, базовый и оптимистичный",
  ]);
});

const effectReference = {
  direction: [{ code: "production", label: "Производство" }],
  effect_type: [{ code: "cost_saving", label: "Экономия затрат" }, { code: "old", label: "Старый вид", archived: true }],
  risk_level: [],
  site: [{ code: "kiln2", label: "Печь 2" }],
  kpi: [{ code: "loss", label: "Потери при выпуске", unit: "%" }],
};

function effect(overrides: Record<string, unknown> = {}) {
  return {
    id: "", effectTypeCode: "cost_saving", directionCode: "production", kpiCode: "loss", siteCode: "kiln2",
    baselineValue: "3 %", baselinePeriod: "2026, январь–август", targetValue: "1,5 %", annualAmount: "1 200 000",
    method: "", measurementStart: "2026-11-01", measurementEnd: "", confirmationPeriod: "quarter",
    confirmationPeriodNote: "", notDuplicateExplanation: "",
    ...overrides,
  };
}

test("planned effects get server ids, labels and keep their identity", () => {
  let counter = 0;
  const newId = () => `effect-${(counter += 1)}`;
  const first = readCollegiumPassportInput({ effects: [effect(), effect({ siteCode: "" })] }, { reference: effectReference, newId });
  assert.deepEqual(first.effects.map(({ id }) => id), ["effect-1", "effect-2"]);
  assert.deepEqual(
    [first.effects[0].kpiLabel, first.effects[0].kpiUnit, first.effects[0].siteLabel, first.effects[0].annualAmount],
    ["Потери при выпуске", "%", "Печь 2", "1200000.00"],
  );
  // A saved id is kept; an unknown one is a stale form.
  const second = readCollegiumPassportInput({ effects: [effect({ id: "effect-2", annualAmount: "5" })] }, { reference: effectReference, previous: first, newId });
  assert.deepEqual(second.effects.map(({ id, annualAmount }) => [id, annualAmount]), [["effect-2", "5.00"]]);
  assert.throws(
    () => readCollegiumPassportInput({ effects: [effect({ id: "forged" })] }, { reference: effectReference, previous: first }),
    /не найден/u,
  );
  const rejects = (row: Record<string, unknown>, pattern: RegExp) =>
    assert.throws(() => readCollegiumPassportInput({ effects: [effect(row)] }, { reference: effectReference }), pattern);
  rejects({ baselinePeriod: "" }, /базовую линию/u);
  rejects({ kpiCode: "space" }, /KPI/u);
  rejects({ effectTypeCode: "old" }, /вид эффекта/u);
  rejects({ measurementEnd: "2026-10-01" }, /период измерения/u);
  rejects({ confirmationPeriod: "year" }, /период подтверждения/u);
  rejects({ extra: "x" }, /плановый эффект 1/u);
  assert.throws(() => readCollegiumPassportInput({ effects: Array.from({ length: 11 }, () => effect()) }, { reference: effectReference }), /10/u);
});

test("effects without a description fall back to the express card effect", () => {
  assert.deepEqual(listCollegiumPlannedEffects(initiative("in_progress")), [{ id: "main", label: "Эффект экспресс-карты" }]);
  const passport = readCollegiumPassportInput({ effects: [effect()] }, { reference: effectReference, newId: () => "e-1" });
  assert.deepEqual(listCollegiumPlannedEffects(initiative("in_progress", { passport })), [
    { id: "e-1", label: "Экономия затрат, Потери при выпуске, Печь 2" },
  ]);
});

test("a duplicate is the same type, direction, KPI and site over an overlapping period", () => {
  const withEffects = (id: string, status: CollegiumInitiative["status"], rows: Array<Record<string, unknown>>) => ({
    ...initiative(status, {
      title: `Инициатива ${id}`,
      passport: readCollegiumPassportInput({ effects: rows }, { reference: effectReference, newId: () => `${id}-effect` }),
    }),
    id,
    number: `И-2026-${id}`,
  });
  const mine = withEffects("1", "ready", [effect({ measurementStart: "2026-11-01", measurementEnd: "2027-10-31" })]);
  const overlapping = withEffects("2", "in_progress", [effect({ measurementStart: "2027-10-31" })]);
  const later = withEffects("3", "in_progress", [effect({ measurementStart: "2027-11-01" })]);
  const otherSite = withEffects("4", "done_confirmed", [effect({ siteCode: "" })]);
  const rejected = withEffects("5", "rejected", [effect()]);
  assert.deepEqual(
    findCollegiumEffectDuplicates(mine, [mine, overlapping, later, otherSite, rejected])
      .map(({ initiativeNumber, effectId, otherEffectId }) => [initiativeNumber, effectId, otherEffectId]),
    [["И-2026-2", "1-effect", "2-effect"]],
  );
});
