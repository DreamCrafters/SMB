import assert from "node:assert/strict";
import test from "node:test";
import type { CollegiumInitiative } from "../contracts/collegiumInitiatives.js";
import { filterCollegiumInitiatives, readCollegiumInitiativeFilters } from "./collegiumRegistry.js";

function initiative(id: string, overrides: Partial<CollegiumInitiative> = {}, card: Partial<CollegiumInitiative["card"]> = {}): CollegiumInitiative {
  return {
    id,
    number: `И-2026-${id}`,
    status: "preliminary_review",
    revision: 1,
    createdByUserId: "author",
    createdAt: "2026-10-05T09:00:00.000Z",
    updatedAt: "2026-10-05T09:00:00.000Z",
    workflow: { submittedAt: "2026-10-05T09:00:00.000Z" },
    ...overrides,
    card: {
      title: `Идея ${id}`, initiatorId: "account:author", directionCode: "production", directionLabel: "Производство",
      effectTypeCodes: ["cost_saving"], effectTypeLabels: ["Экономия затрат"], problem: "", baselineValue: "",
      baselinePeriod: "", baselineSource: "", solution: "", changeScope: "", expectedEffectAmount: "",
      expectedEffectPeriod: "", expectedEffectKind: "", effectMethod: "", oneTimeCostAmount: "", oneTimeCostVat: "",
      oneTimeCostSource: "", recurringCostAmount: "", recurringCostPeriod: "", internalResources: "", ownerId: "",
      executorId: "", executionControllerId: "", effectControllerId: "", plannedStart: "", plannedResult: "",
      kpiCriterion: "", kpiSource: "", risks: [], requestedDecision: "",
      ...card,
    },
  };
}

const context = {
  overdueIds: new Set(["2"]),
  meetingInitiativeIds: new Map([["meeting-1", new Set(["3"])]]),
  commentMatchIds: new Set<string>(),
  name: (id: string) => (id === "account:author" ? "Иванова Анна" : ""),
  userId: "exec",
};

function ids(params: Record<string, string>, list: CollegiumInitiative[], commentMatchIds = new Set<string>()) {
  return filterCollegiumInitiatives(
    list,
    readCollegiumInitiativeFilters(new URLSearchParams(params)),
    { ...context, commentMatchIds },
  ).map(({ id }) => id);
}

test("registry filters cover period, people, money, stage, meeting, overdue and search", () => {
  const list = [
    initiative("1", { createdAt: "2026-09-01T09:00:00.000Z" }, { ownerId: "account:owner", expectedEffectAmount: "500000.00", oneTimeCostAmount: "0.00" }),
    initiative("2", { status: "in_progress" }, { executorId: "account:exec", expectedEffectAmount: "2000000.00", risks: ["Срыв поставок сырья"] }),
    initiative("3", { status: "board_referral" }, { effectControllerId: "account:ctrl", directionCode: "quality" }),
    initiative("4", { status: "closed", workflow: { result: { description: "", actualEffectAmount: "900.00", source: "", conclusion: "", recordedAt: "", recordedByDisplayName: "" } } }, { solution: "Новая печь" }),
  ];
  assert.deepEqual(ids({ createdFrom: "2026-10-01" }, list), ["2", "3", "4"]);
  assert.deepEqual(ids({ createdTo: "2026-09-30" }, list), ["1"]);
  assert.deepEqual(ids({ ownerId: "account:owner" }, list), ["1"]);
  assert.deepEqual(ids({ controllerId: "account:ctrl" }, list), ["3"]);
  assert.deepEqual(ids({ plannedEffectMin: "1 000 000" }, list), ["2"]);
  // An explicit zero cost is a value, an empty cost is not.
  assert.deepEqual(ids({ costMax: "0" }, list), ["1"]);
  assert.deepEqual(ids({ actualEffectMin: "100" }, list), ["4"]);
  assert.deepEqual(ids({ stage: "implementation" }, list), ["2"]);
  assert.deepEqual(ids({ stage: "collegium" }, list), ["3"]);
  assert.deepEqual(ids({ directionCode: "quality" }, list), ["3"]);
  assert.deepEqual(ids({ meetingId: "meeting-1" }, list), ["3"]);
  assert.deepEqual(ids({ boardDecision: "yes" }, list), ["3"]);
  assert.deepEqual(ids({ overdue: "yes" }, list), ["2"]);
  assert.deepEqual(ids({ risk: "поставок" }, list), ["2"]);
  assert.deepEqual(ids({ mine: "yes" }, list), ["2"]);
  // Search covers the number, texts, the initiator name and comments.
  assert.deepEqual(ids({ query: "печь" }, list), ["4"]);
  assert.deepEqual(ids({ query: "иванова" }, list), ["1", "2", "3", "4"]);
  assert.deepEqual(ids({ query: "2026-1" }, list), ["1"]);
  // Comment matches come from the server search for the same query.
  assert.deepEqual(ids({ query: "кислород" }, list, new Set(["3"])), ["3"]);
});

test("registry filters reject unknown keys and malformed values", () => {
  for (const params of [
    { unknown: "1" } as Record<string, string>,
    { createdFrom: "05.10.2026" },
    { createdFrom: "2026-10-05", createdTo: "2026-10-01" },
    { ownerId: "Иванов" },
    { costMin: "-1" },
    { status: "lost" },
    { stage: "everything" },
    { overdue: "true" },
    { meetingId: "../x" },
    { query: "x".repeat(121) },
  ]) {
    assert.throws(() => readCollegiumInitiativeFilters(new URLSearchParams(params)), JSON.stringify(params));
  }
});
