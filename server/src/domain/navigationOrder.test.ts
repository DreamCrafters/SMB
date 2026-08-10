import assert from "node:assert/strict";
import test from "node:test";
import {
  defaultNavigationOrder,
  reconcileNavigationOrder,
  validateNavigationOrder,
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
