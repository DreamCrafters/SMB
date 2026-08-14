import assert from "node:assert/strict";
import test from "node:test";
import {
  mergeDispatcherProductionBrandReferences,
  normalizeProductionBrandLabelInput,
  normalizeProductionBrandLookupLabel,
  mergeRefractoryReportBrandReferences,
} from "./productionBrand.js";

test("production brand labels normalize whitespace while preserving display text", () => {
  assert.deepEqual(
    normalizeProductionBrandLabelInput("  ПБ-5   огнеупорный  "),
    {
      ok: true,
      value: {
        label: "ПБ-5 огнеупорный",
        normalizedLabel: "пб-5 огнеупорный",
      },
    },
  );
  assert.equal(normalizeProductionBrandLookupLabel(" ПБ-5  "), "пб-5");
});

test("production brand labels reject empty and overlong values", () => {
  assert.deepEqual(
    normalizeProductionBrandLabelInput("   "),
    { ok: false, errors: ["Введите название марки."] },
  );
  assert.equal(normalizeProductionBrandLabelInput("А".repeat(121)).ok, false);
});

test("merging a product brand combines duplicate dispatcher facts without losing precision", () => {
  const result = mergeDispatcherProductionBrandReferences({
    reportDate: "2026-08-08",
    formingProductBrand: "Дубликат",
    formingDay: "4.5",
    unformedBrand1: "Основная марка",
    unformedFact1: "0.25",
    unformedBrand2: " ДУБЛИКАТ ",
    unformedFact2: "1.75",
    sortingBrand1: "Дубликат",
    sortingFact1: "3",
  }, "Дубликат", "Основная марка");

  assert.equal(result.changed, true);
  assert.deepEqual(result.payload, {
    reportDate: "2026-08-08",
    formingProductBrand: "Основная марка",
    formingDay: "4.5",
    unformedBrand1: "Основная марка",
    unformedFact1: "2",
    sortingBrand1: "Основная марка",
    sortingFact1: "3",
  });
});

test("merging a product brand combines duplicate COSH output rows", () => {
  const result = mergeRefractoryReportBrandReferences("cosh", {
    kilnNumber: "2",
    chamotteOutputRows: [
      { productBrand: "Основная марка", quantityTons: 0.25 },
      { productBrand: "Дубликат", quantityTons: 1.75 },
    ],
  }, "Дубликат", "Основная марка");

  assert.equal(result.changed, true);
  assert.deepEqual(result.payload, {
    kilnNumber: "2",
    chamotteOutputRows: [
      { productBrand: "Основная марка", quantityTons: 2 },
    ],
  });
});

test("merging a product brand rewrites every firing report wagon reference without combining distinct wagons", () => {
  // Марка теперь живёт внутри каждой ссылки на вагон (задача 88), а не в
  // самой строке; общий рекурсивный обход должен найти её и там.
  const result = mergeRefractoryReportBrandReferences("firing", {
    rows: [
      { sortingWagons: [{ id: "wagon-1", productBrand: "Дубликат" }] },
      { sortingWagons: [{ id: "wagon-2", productBrand: "Основная марка" }] },
    ],
  }, "Дубликат", "Основная марка");

  assert.equal(result.changed, true);
  assert.deepEqual(result.payload, {
    rows: [
      { sortingWagons: [{ id: "wagon-1", productBrand: "Основная марка" }] },
      { sortingWagons: [{ id: "wagon-2", productBrand: "Основная марка" }] },
    ],
  });
});
