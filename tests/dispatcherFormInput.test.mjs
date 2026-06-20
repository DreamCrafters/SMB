import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeDecimalNumberForPayload,
  normalizeDecimalNumberInput,
} from "../.test-build/src/services/dispatcherFormInput.js";

test("normalizeDecimalNumberInput keeps digits and one dot separator", () => {
  assert.equal(normalizeDecimalNumberInput("123"), "123");
  assert.equal(normalizeDecimalNumberInput(" 12,5 кг "), "12.5");
  assert.equal(normalizeDecimalNumberInput("-42.7"), "42.7");
  assert.equal(normalizeDecimalNumberInput("12.3.4"), "12.34");
  assert.equal(normalizeDecimalNumberInput(",5"), "0.5");
  assert.equal(normalizeDecimalNumberInput("abc"), "");
});

test("normalizeDecimalNumberForPayload finalizes decimal input for submit", () => {
  assert.equal(normalizeDecimalNumberForPayload("12,"), "12");
  assert.equal(normalizeDecimalNumberForPayload("12.50"), "12.50");
  assert.equal(normalizeDecimalNumberForPayload(" 12,5 кг "), "12.5");
  assert.equal(normalizeDecimalNumberForPayload(","), undefined);
});
