import assert from "node:assert/strict";
import test from "node:test";
import {
  validateLaboratoryFormedProductSampleCorrection,
  validateLaboratoryFormedProductSampleSubmission,
} from "./laboratoryFormedProductSampleJournal.js";

test("formed product sample journal accepts and normalizes a complete record", () => {
  const validation = validateLaboratoryFormedProductSampleSubmission({
    sortingDate: "2026-08-05",
    wagonNumber: " 214 ",
  });

  assert.deepEqual(validation, {
    ok: true,
    value: {
      sortingDate: "2026-08-05",
      wagonNumber: "214",
    },
  });
});

test("formed product sample journal falls back to the transmission path when the wagon number is absent", () => {
  const validation = validateLaboratoryFormedProductSampleCorrection({
    sortingDate: "2026-02-30",
    wagonNumber: "",
  });

  assert.equal(validation.ok, false);
  if (validation.ok) return;
  assert.deepEqual(validation.errors, [
    "Проверьте поле «Дата сортировки».",
    "Проверьте поле «Код пробы».",
    "Проверьте поле «Марка изделия».",
  ]);
});

test("formed product sample journal accepts a transmission from sample registration", () => {
  const validation = validateLaboratoryFormedProductSampleSubmission({
    sortingDate: "2026-08-05",
    sampleCode: " ЛО-214 ",
    productBrand: " ША-10 ",
    sourceSampleRegistrationId: "reg-42",
  });

  assert.deepEqual(validation, {
    ok: true,
    value: {
      sortingDate: "2026-08-05",
      sampleCode: "ЛО-214",
      productBrand: "ША-10",
      sourceSampleRegistrationId: "reg-42",
    },
  });
});

test("formed product sample journal accepts a manually completed transmission record without a source", () => {
  const validation = validateLaboratoryFormedProductSampleSubmission({
    sortingDate: "2026-08-05",
    sampleCode: "ЛО-214",
    productBrand: "ША-10",
  });

  assert.deepEqual(validation, {
    ok: true,
    value: {
      sortingDate: "2026-08-05",
      sampleCode: "ЛО-214",
      productBrand: "ША-10",
    },
  });
});

test("formed product sample journal reports missing transmission fields", () => {
  const validation = validateLaboratoryFormedProductSampleCorrection({
    sortingDate: "2026-08-05",
  });

  assert.equal(validation.ok, false);
  if (validation.ok) return;
  assert.deepEqual(validation.errors, [
    "Проверьте поле «Код пробы».",
    "Проверьте поле «Марка изделия».",
  ]);
});
