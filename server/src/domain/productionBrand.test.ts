import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeProductionBrandLabelInput,
  normalizeProductionBrandLookupLabel,
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
