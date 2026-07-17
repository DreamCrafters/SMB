import assert from "node:assert/strict";
import test from "node:test";
import { normalizeProductionBrandLabelInput } from "./productionBrand.js";

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
