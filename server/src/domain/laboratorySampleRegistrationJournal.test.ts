import assert from "node:assert/strict";
import test from "node:test";
import { validateLaboratorySampleRegistrationJournalSubmission } from "./laboratorySampleRegistrationJournal.js";

test("sample registration journal accepts and normalizes a complete record", () => {
  const validation = validateLaboratorySampleRegistrationJournalSubmission({
    sampleNumber: "  17-А ",
    laboratorySampleCode: " ЛП-2026-017 ",
    samplingDate: "2026-07-29",
    samplingLaboratoryAssistant: " Иванова А.А. ",
    sampleName: " Шамот молотый ",
    registrationDate: "2026-07-29",
    samplingLocation: " Пункт контроля № 2 ",
  });

  assert.deepEqual(validation, {
    ok: true,
    value: {
      sampleNumber: "17-А",
      laboratorySampleCode: "ЛП-2026-017",
      samplingDate: "2026-07-29",
      samplingLaboratoryAssistant: "Иванова А.А.",
      sampleName: "Шамот молотый",
      registrationDate: "2026-07-29",
      samplingLocation: "Пункт контроля № 2",
    },
  });
});

test("sample registration journal reports invalid and missing fields", () => {
  const validation = validateLaboratorySampleRegistrationJournalSubmission({
    sampleNumber: "",
    laboratorySampleCode: 17,
    samplingDate: "2026-02-30",
    samplingLaboratoryAssistant: " ",
    sampleName: null,
    registrationDate: "29.07.2026",
    samplingLocation: [],
  });

  assert.equal(validation.ok, false);
  if (validation.ok) return;

  assert.deepEqual(validation.errors, [
    "Проверьте поле «№ пробы».",
    "Проверьте поле «Код лабораторной пробы».",
    "Проверьте поле «Дата отбора».",
    "Проверьте поле «Лаборант (отбор проб)».",
    "Проверьте поле «Наименование пробы».",
    "Проверьте поле «Дата регистрации».",
    "Проверьте поле «Место отбора пробы».",
  ]);
});
