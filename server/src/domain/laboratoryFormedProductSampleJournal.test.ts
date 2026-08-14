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

test("formed product sample journal reports invalid and missing fields", () => {
  const validation = validateLaboratoryFormedProductSampleCorrection({
    sortingDate: "2026-02-30",
    wagonNumber: "",
  });

  assert.equal(validation.ok, false);
  if (validation.ok) return;
  assert.deepEqual(validation.errors, [
    "Проверьте поле «Дата сортировки».",
    "Проверьте поле «№ вагона».",
  ]);
});
