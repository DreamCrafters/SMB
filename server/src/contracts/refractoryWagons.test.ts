import assert from "node:assert/strict";
import test from "node:test";
import {
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
