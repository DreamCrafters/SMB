import assert from "node:assert/strict";
import test from "node:test";
import type { CollegiumEffectFact, CollegiumInitiative } from "../contracts/collegiumInitiatives.js";
import {
  buildCollegiumEffectControlRows,
  listCollegiumVerdictGaps,
  readCollegiumConfirmedKopecks,
  readCollegiumPlannedKopecks,
  readCollegiumSignerRole,
} from "./collegiumEffectControl.js";

function fact(overrides: Partial<CollegiumEffectFact> = {}): CollegiumEffectFact {
  return {
    actualAmount: "900.00", period: "2026", sources: "ОТК", calculation: "", version: 2,
    recordedByUserId: "owner", recordedByDisplayName: "Владелец", recordedAt: "", verdicts: {},
    ...overrides,
  };
}

const signature = (account: string, factVersion = 2, verdict: "confirmed" | "not_confirmed" = "confirmed") =>
  ({ byAccountId: account, byDisplayName: account, at: "", verdict, comment: "", factVersion });

function initiative(workflow: CollegiumInitiative["workflow"] = {}, card: Partial<CollegiumInitiative["card"]> = {}) {
  return {
    id: "i", number: "И-2026-0001", status: "result_confirmation", revision: 5, createdByUserId: "a",
    createdAt: "", updatedAt: "",
    card: {
      expectedEffectAmount: "100.00", expectedEffectPeriod: "month", oneTimeCostAmount: "", recurringCostAmount: "",
      recurringCostPeriod: "", capexAmount: "", effectControllerId: "account:ctrl", plannedStart: "", plannedResult: "",
      ...card,
    },
    workflow: { verifiers: { technicalId: "", financialId: "account:fin", assignedAt: "", assignedByDisplayName: "" }, ...workflow },
  } as CollegiumInitiative;
}

test("a row compares the fact with the annual plan and derives the verification status", () => {
  const [row] = buildCollegiumEffectControlRows(initiative({
    effectFacts: { main: fact({ verdicts: { controller: signature("account:ctrl") } }) },
  }));
  // 100 a month is 1 200 a year: the fact is 300 below, −25 %.
  assert.deepEqual([row.effectId, row.plannedAnnual, row.deviationAmount, row.deviationPercent, row.status],
    ["main", "1200.00", "-300.00", "-25.0", "in_review"]);
  const confirmed = initiative({
    effectFacts: { main: fact({ verdicts: { controller: signature("account:ctrl"), financial: signature("account:fin") } }) },
  });
  assert.equal(buildCollegiumEffectControlRows(confirmed)[0].status, "confirmed");
  assert.deepEqual(listCollegiumVerdictGaps(confirmed), []);
});

test("stale signatures do not count: another fact version or a replaced role holder", () => {
  const verdicts = { controller: signature("account:ctrl", 1), financial: signature("account:fin") };
  const stale = initiative({ effectFacts: { main: fact({ verdicts }) } });
  assert.equal(buildCollegiumEffectControlRows(stale)[0].status, "in_review");
  const replaced = initiative(
    { effectFacts: { main: fact({ verdicts: { controller: signature("account:ctrl"), financial: signature("account:fin") } }) } },
    { effectControllerId: "account:new" },
  );
  assert.deepEqual(listCollegiumVerdictGaps(replaced), [
    "Эффект экспресс-карты: нужны подписи контролёра эффекта и финансового верификатора",
  ]);
  assert.deepEqual(listCollegiumVerdictGaps(initiative({ verifiers: undefined })), [
    "Не назначен финансовый верификатор",
    "Эффект экспресс-карты: не внесён факт",
  ]);
  assert.equal(readCollegiumSignerRole(replaced, "account:new"), "controller");
  assert.equal(readCollegiumSignerRole(replaced, "account:ctrl"), undefined);
});

test("planned and confirmed effects read one way everywhere, including legacy confirmations", () => {
  assert.equal(readCollegiumPlannedKopecks(initiative()), 120_000n);
  assert.equal(readCollegiumPlannedKopecks(initiative({}, { expectedEffectPeriod: "сезон" })), undefined);
  assert.equal(readCollegiumConfirmedKopecks(initiative()), undefined);
  const result = { description: "", actualEffectAmount: "500.00", source: "", conclusion: "" as const, recordedAt: "", recordedByDisplayName: "" };
  assert.equal(readCollegiumConfirmedKopecks(initiative({ effectConfirmation: { confirmedAt: "", confirmedByDisplayName: "", result } })), 50_000n);
  // A snapshot counts confirmed effects only, each by its share rounded down.
  assert.equal(readCollegiumConfirmedKopecks(initiative({
    effectConfirmation: {
      confirmedAt: "", confirmedByDisplayName: "", result,
      effects: [
        { effectId: "a", label: "", plannedAnnual: "", actualAmount: "0.03", status: "confirmed", shareBp: 5000, verdicts: {} },
        { effectId: "b", label: "", plannedAnnual: "", actualAmount: "999.00", status: "not_confirmed", shareBp: 10000, verdicts: {} },
      ],
    },
  })), 1n);
});
