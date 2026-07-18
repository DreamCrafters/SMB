import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeProductionBrandLabelInput,
  rewriteProductionBrandReferences,
} from "./productionBrand.js";

test("production brand labels normalize whitespace while preserving display text", () => {
  assert.deepEqual(
    normalizeProductionBrandLabelInput("unformed", "  ПБ-5   огнеупорный  "),
    {
      ok: true,
      value: {
        category: "unformed",
        label: "ПБ-5 огнеупорный",
        normalizedLabel: "пб-5 огнеупорный",
      },
    },
  );
});

test("production brand labels reject unknown catalogs and empty labels", () => {
  assert.deepEqual(
    normalizeProductionBrandLabelInput("other", "ПБ-5"),
    { ok: false, errors: ["Выберите справочник марок."] },
  );
  assert.deepEqual(
    normalizeProductionBrandLabelInput("chamotte", "   "),
    { ok: false, errors: ["Введите название марки."] },
  );
});

test("renaming a production brand updates only references from its catalog", () => {
  const result = rewriteProductionBrandReferences({
    payload: {
      formingProductBrand: " МКР-1 ",
      formingDay: "4",
      sortingProductBrands: "МКР-1",
      unformedBrand1: "МКР-1",
      unformedFact1: "7",
      serverOwnedNumber: 42,
    },
    category: "product",
    sourceLabel: "МКР-1",
    targetLabel: "МКР-2",
    merge: false,
  });

  assert.equal(result.changed, true);
  assert.equal(result.combinedFacts, 0);
  assert.deepEqual(result.payload, {
    formingProductBrand: "МКР-2",
    formingDay: "4",
    sortingProductBrands: "МКР-2",
    unformedBrand1: "МКР-1",
    unformedFact1: "7",
    serverOwnedNumber: 42,
  });
});

test("merging dynamic production brands adds facts and removes duplicate columns", () => {
  const result = rewriteProductionBrandReferences({
    payload: {
      reportDate: "2026-07-17",
      unformedBrand1: "Целевая",
      unformedFact1: "0.25",
      unformedBrand2: " исходная ",
      unformedFact2: "1.75",
      unformedBrand3: "Другая",
      unformedFact3: "3",
      chamotteBrand1: "Исходная",
      chamotteFact1: "9",
    },
    category: "unformed",
    sourceLabel: "Исходная",
    targetLabel: "Целевая",
    merge: true,
  });

  assert.equal(result.changed, true);
  assert.equal(result.combinedFacts, 1);
  assert.deepEqual(result.payload, {
    reportDate: "2026-07-17",
    unformedBrand1: "Целевая",
    unformedFact1: "2",
    unformedBrand3: "Другая",
    unformedFact3: "3",
    chamotteBrand1: "Исходная",
    chamotteFact1: "9",
  });
});

test("merging a dynamic brand without an existing target preserves its fact", () => {
  const result = rewriteProductionBrandReferences({
    payload: {
      chamotteBrand7: "ША-1",
      chamotteFact7: "8.500",
    },
    category: "chamotte",
    sourceLabel: "ША-1",
    targetLabel: "ША-2",
    merge: true,
  });

  assert.deepEqual(result.payload, {
    chamotteBrand7: "ША-2",
    chamotteFact7: "8.500",
  });
  assert.equal(result.combinedFacts, 0);
});
