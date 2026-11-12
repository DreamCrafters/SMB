import assert from "node:assert/strict";
import test from "node:test";
import { shellCopy } from "../.test-build/src/content.js";
import { resolveClientProductName, resolveClientSiteTitle } from "../.test-build/src/services/appEnvironment.js";

test("visible product branding uses the NMOU Vector name", () => {
  assert.equal(shellCopy.productName, "НМОУ Вектор");
});

test("another organization's deployment names the product from its build env (задача 147)", () => {
  assert.equal(resolveClientProductName("Вектор Деметра"), "Вектор Деметра");
  assert.equal(resolveClientProductName("  Вектор Деметра  "), "Вектор Деметра");
  for (const value of [undefined, "", "   ", "В".repeat(61)]) {
    assert.equal(resolveClientProductName(value), "НМОУ Вектор", JSON.stringify(value));
  }
});

test("site title is environment-specific", () => {
  assert.equal(resolveClientSiteTitle("production"), "Вектор");
  assert.equal(resolveClientSiteTitle("test"), "Вектор Тест");
});
