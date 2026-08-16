import assert from "node:assert/strict";
import test from "node:test";
import {
  isRefractoryWagonAvailableForFiring,
  isRefractoryWagonAvailableForLoading,
  isRefractoryWagonAvailableForRawControl,
  isRefractoryWagonAwaitingInspection,
  selectLatestWagonCycles,
  type RefractoryWagonRecord,
} from "./refractoryWagons.js";

function buildCycle(
  overrides: Partial<RefractoryWagonRecord> & { id: string; number: string },
): RefractoryWagonRecord {
  return {
    loadingDate: null,
    productBrand: null,
    pressDate: null,
    pieceCount: null,
    setter: null,
    pressOperator: null,
    rawControlDate: null,
    firingOperator: null,
    firingDates: [],
    sorter: null,
    sortingDate: null,
    postFiringCondition: null,
    serviceApprovalDate: null,
    createdAt: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
}

test("selectLatestWagonCycles keeps the first cycle seen per wagon number", () => {
  // Список от сервера уже отсортирован по убыванию sequence_id: новый цикл
  // вагона В-17 идёт раньше своего завершённого предшественника.
  const wagons = [
    buildCycle({ id: "cycle-2", number: "В-17" }),
    buildCycle({ id: "cycle-1", number: "В-17", postFiringCondition: "Можно эксплуатировать" }),
    buildCycle({ id: "cycle-3", number: "В-18" }),
  ];

  assert.deepEqual(
    selectLatestWagonCycles(wagons).map((wagon) => wagon.id),
    ["cycle-2", "cycle-3"],
  );
});

test("selectLatestWagonCycles returns an empty list unchanged", () => {
  assert.deepEqual(selectLatestWagonCycles([]), []);
});

// Задача 91: этапы вагона идут строго по порядку, и вагон в каждый момент
// стоит ровно на одном из них.
const loadedStage = {
  loadingDate: "2026-08-05",
  setter: "Иванов И.И.",
  pressDate: "2026-08-04",
  pressOperator: "Петров П.П.",
};

const firedStage = {
  firingOperator: "Зайцев З.З.",
  firingDates: ["2026-08-06"],
  sorter: "Орлова О.О.",
  sortingDate: "2026-08-08",
};

test("a registered wagon stands on the loading stage alone", () => {
  const wagon = buildCycle({ id: "cycle-1", number: "В-17" });

  assert.equal(isRefractoryWagonAvailableForLoading(wagon), true);
  assert.equal(isRefractoryWagonAvailableForRawControl(wagon), false);
  assert.equal(isRefractoryWagonAvailableForFiring(wagon), false);
  assert.equal(isRefractoryWagonAwaitingInspection(wagon), false);
});

test("a partly filled loading stage does not open the raw control stage", () => {
  const wagon = buildCycle({
    id: "cycle-1",
    number: "В-17",
    ...loadedStage,
    pressOperator: null,
  });

  assert.equal(isRefractoryWagonAvailableForLoading(wagon), true);
  assert.equal(isRefractoryWagonAvailableForRawControl(wagon), false);
});

test("a fully loaded wagon moves on to the raw control stage", () => {
  const wagon = buildCycle({ id: "cycle-1", number: "В-17", ...loadedStage });

  assert.equal(isRefractoryWagonAvailableForLoading(wagon), false);
  assert.equal(isRefractoryWagonAvailableForRawControl(wagon), true);
  assert.equal(isRefractoryWagonAvailableForFiring(wagon), false);
});

test("a controlled wagon moves on to the firing stage", () => {
  const wagon = buildCycle({
    id: "cycle-1",
    number: "В-17",
    ...loadedStage,
    rawControlDate: "2026-08-06",
  });

  assert.equal(isRefractoryWagonAvailableForRawControl(wagon), false);
  assert.equal(isRefractoryWagonAvailableForFiring(wagon), true);
  assert.equal(isRefractoryWagonAwaitingInspection(wagon), false);
});

test("a sorted wagon without a named crew stays on the firing stage", () => {
  const wagon = buildCycle({
    id: "cycle-1",
    number: "В-17",
    ...loadedStage,
    rawControlDate: "2026-08-06",
    ...firedStage,
    sorter: null,
  });

  assert.equal(isRefractoryWagonAvailableForFiring(wagon), true);
  assert.equal(isRefractoryWagonAwaitingInspection(wagon), false);
});

test("a fully fired wagon waits for the inspection alone", () => {
  const wagon = buildCycle({
    id: "cycle-1",
    number: "В-17",
    ...loadedStage,
    rawControlDate: "2026-08-06",
    ...firedStage,
  });

  assert.equal(isRefractoryWagonAvailableForLoading(wagon), false);
  assert.equal(isRefractoryWagonAvailableForRawControl(wagon), false);
  assert.equal(isRefractoryWagonAvailableForFiring(wagon), false);
  assert.equal(isRefractoryWagonAwaitingInspection(wagon), true);
});

test("a wagon under repair leaves every stage but the inspection", () => {
  const wagon = buildCycle({
    id: "cycle-1",
    number: "В-17",
    postFiringCondition: "В ремонт",
    serviceApprovalDate: "2026-08-09",
  });

  assert.equal(isRefractoryWagonAvailableForLoading(wagon), false);
  assert.equal(isRefractoryWagonAvailableForRawControl(wagon), false);
  assert.equal(isRefractoryWagonAvailableForFiring(wagon), false);
  assert.equal(isRefractoryWagonAwaitingInspection(wagon), true);
});

test("an approved wagon leaves the inspection queue", () => {
  const wagon = buildCycle({
    id: "cycle-1",
    number: "В-17",
    ...loadedStage,
    rawControlDate: "2026-08-06",
    ...firedStage,
    postFiringCondition: "Можно эксплуатировать",
    serviceApprovalDate: "2026-08-09",
  });

  assert.equal(isRefractoryWagonAwaitingInspection(wagon), false);
});
