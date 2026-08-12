import assert from "node:assert/strict";
import test from "node:test";
import {
  validateLaboratoryFormedProductSampleCorrection,
  validateLaboratoryFormedProductSampleSubmission,
} from "./laboratoryFormedProductSampleJournal.js";

test("formed product sample journal accepts and normalizes a complete record", () => {
  const validation = validateLaboratoryFormedProductSampleSubmission({
    sortingDate: "2026-08-05",
    sampleCode: " 26.19 ",
    productBrand: " ША-1,3 ",
    sourceSampleRegistrationId: " sample-registration-1 ",
  });

  assert.deepEqual(validation, {
    ok: true,
    value: {
      sortingDate: "2026-08-05",
      sampleCode: "26.19",
      productBrand: "ША-1,3",
      sourceSampleRegistrationId: "sample-registration-1",
    },
  });
});

test("formed product sample journal accepts a record without a linked sample", () => {
  const validation = validateLaboratoryFormedProductSampleSubmission({
    sortingDate: "2026-08-05",
    sampleCode: "26.19",
    productBrand: "ША-1,3",
  });

  assert.equal(validation.ok, true);
  if (!validation.ok) return;
  assert.equal(validation.value.sourceSampleRegistrationId, undefined);
});

test("formed product sample journal reports invalid and missing fields", () => {
  const validation = validateLaboratoryFormedProductSampleCorrection({
    sortingDate: "2026-02-30",
    sampleCode: "",
    productBrand: null,
  });

  assert.equal(validation.ok, false);
  if (validation.ok) return;
  assert.deepEqual(validation.errors, [
    "Проверьте поле «Дата сортировки».",
    "Проверьте поле «Код пробы».",
    "Проверьте поле «Марка изделия».",
  ]);
});
