import assert from "node:assert/strict";
import test from "node:test";
import {
  validateLaboratoryVerificationCorrection,
  validateLaboratoryVerificationSubmission,
} from "./laboratoryVerificationJournal.js";

test("verification journal accepts and normalizes a complete record", () => {
  const validation = validateLaboratoryVerificationSubmission({
    verificationDate: "2026-08-05",
    productName: " Шамот молотый ",
    samplingLocation: " Склад сырья ",
    sampleCode: " 26.19 ",
    sourceSampleRegistrationId: " sample-registration-1 ",
  });

  assert.deepEqual(validation, {
    ok: true,
    value: {
      verificationDate: "2026-08-05",
      productName: "Шамот молотый",
      samplingLocation: "Склад сырья",
      sampleCode: "26.19",
      sourceSampleRegistrationId: "sample-registration-1",
    },
  });
});

test("verification journal accepts a record without a linked sample", () => {
  const validation = validateLaboratoryVerificationSubmission({
    verificationDate: "2026-08-05",
    productName: "Шамот молотый",
    samplingLocation: "Склад сырья",
    sampleCode: "26.19",
  });

  assert.equal(validation.ok, true);
  if (!validation.ok) return;
  assert.equal(validation.value.sourceSampleRegistrationId, undefined);
});

test("verification journal reports invalid and missing fields", () => {
  const validation = validateLaboratoryVerificationCorrection({
    verificationDate: "29.07.2026",
    productName: "",
    samplingLocation: [],
    sampleCode: 26,
  });

  assert.equal(validation.ok, false);
  if (validation.ok) return;
  assert.deepEqual(validation.errors, [
    "Проверьте поле «Дата».",
    "Проверьте поле «Наименование продукции».",
    "Проверьте поле «Место отбора пробы».",
    "Проверьте поле «Код пробы».",
  ]);
});
