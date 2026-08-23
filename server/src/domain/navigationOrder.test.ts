import assert from "node:assert/strict";
import test from "node:test";
import {
  defaultNavigationOrder,
  navigationLabelMaxLength,
  reconcileNavigationLabels,
  reconcileNavigationOrder,
  validateNavigationOrder,
  validateNavigationSettings,
} from "./navigationOrder.js";

test("navigation order accepts only one complete catalog permutation", () => {
  const reordered = [...defaultNavigationOrder].reverse();

  assert.deepEqual(validateNavigationOrder({ navigationOrder: reordered }), {
    ok: true,
    value: reordered,
  });
  assert.equal(
    validateNavigationOrder({ navigationOrder: reordered.slice(1) }).ok,
    false,
  );
  assert.equal(
    validateNavigationOrder({
      navigationOrder: [...reordered.slice(1), reordered[1]],
    }).ok,
    false,
  );
});

test("stored navigation order keeps known positions and appends new catalog items", () => {
  assert.deepEqual(
    reconcileNavigationOrder([
      "admin.database",
      "unknown.item",
      "business.overview",
      "admin.database",
    ]),
    [
      "admin.database",
      "business.overview",
      ...defaultNavigationOrder.filter(
        (item) => item !== "admin.database" && item !== "business.overview",
      ),
    ],
  );
});

test("navigation settings normalize renamed sections and drop the empty ones", () => {
  const result = validateNavigationSettings({
    navigationOrder: [...defaultNavigationOrder],
    navigationLabels: {
      "business.work": "  Смена   мастера ",
      // Пустое название возвращает раздел к имени по умолчанию.
      "business.overview": "   ",
    },
  });

  assert.deepEqual(result, {
    ok: true,
    value: {
      navigationOrder: [...defaultNavigationOrder],
      navigationLabels: { "business.work": "Смена мастера" },
    },
  });
});

test("navigation settings reject unknown sections and overlong names", () => {
  const unknownItem = validateNavigationSettings({
    navigationOrder: [...defaultNavigationOrder],
    navigationLabels: { "business.unknown": "Раздел" },
  });
  const overlongName = validateNavigationSettings({
    navigationOrder: [...defaultNavigationOrder],
    navigationLabels: {
      "business.work": "я".repeat(navigationLabelMaxLength + 1),
    },
  });

  assert.equal(unknownItem.ok, false);
  assert.equal(overlongName.ok, false);
});

test("stored navigation labels keep only known and usable names", () => {
  assert.deepEqual(
    reconcileNavigationLabels({
      "business.work": " Смена ",
      "business.unknown": "Раздел",
      "business.overview": "",
      "business.settings": 42,
    }),
    { "business.work": "Смена" },
  );
  assert.deepEqual(reconcileNavigationLabels(undefined), {});
});
