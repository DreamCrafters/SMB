import assert from "node:assert/strict";
import test from "node:test";
import { shellCopy } from "../.test-build/src/content.js";
import { resolveClientSiteTitle } from "../.test-build/src/services/appEnvironment.js";

test("visible product branding uses the NMOU Vector name", () => {
  assert.equal(shellCopy.productName, "НМОУ Вектор");
});

test("site title is environment-specific", () => {
  assert.equal(resolveClientSiteTitle("production"), "Вектор");
  assert.equal(resolveClientSiteTitle("test"), "Вектор Тест");
});
