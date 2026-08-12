import assert from "node:assert/strict";
import test from "node:test";
import {
  validateLaboratorySampleRegistrationCorrection,
  validateLaboratorySampleRegistrationJournalSubmission,
} from "./laboratorySampleRegistrationJournal.js";

test("sample registration journal accepts and normalizes a complete record", () => {
  const validation = validateLaboratorySampleRegistrationJournalSubmission({
    sampleNumber: "  17-А ",
    laboratorySampleCode: " ЛП-2026-017 ",
    samplingDate: "2026-07-29",
    samplingLaboratoryAssistant: " Иванова А.А. ",
    sampleName: " Шамот молотый ",
    registrationDate: "2026-07-29",
    samplingLocation: " Пункт контроля № 2 ",
    waterAbsorption: " 4,6 ",
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
      waterAbsorption: "4,6",
    },
  });
});

test("sample registration journal accepts an empty water absorption", () => {
  const validation = validateLaboratorySampleRegistrationJournalSubmission({
    sampleNumber: "18",
    laboratorySampleCode: ".18",
    samplingDate: "2026-08-04",
    samplingLaboratoryAssistant: "Иванова А.А.",
    sampleName: "Шамот",
    registrationDate: "2026-08-04",
    samplingLocation: "Склад сырья",
    waterAbsorption: " ",
  });

  assert.deepEqual(validation, {
    ok: true,
    value: {
      sampleNumber: "18",
      laboratorySampleCode: ".18",
      samplingDate: "2026-08-04",
      samplingLaboratoryAssistant: "Иванова А.А.",
      sampleName: "Шамот",
      registrationDate: "2026-08-04",
      samplingLocation: "Склад сырья",
    },
  });
});

test("sample registration correction accepts a legacy record without water absorption", () => {
  const validation = validateLaboratorySampleRegistrationCorrection({
    sampleNumber: "17-А",
    laboratorySampleCode: "ЛП-2026-017",
    samplingDate: "2026-07-29",
    samplingLaboratoryAssistant: "Иванова А.А.",
    sampleName: "Шамот исправленный",
    registrationDate: "2026-07-29",
    samplingLocation: "Склад сырья",
  });

  assert.equal(validation.ok, true);
  if (!validation.ok) return;
  assert.equal(validation.value.waterAbsorption, undefined);
});

test("sample registration journal accepts a valid transmission target", () => {
  const validation = validateLaboratorySampleRegistrationJournalSubmission({
    sampleNumber: "19",
    laboratorySampleCode: ".19",
    samplingDate: "2026-08-05",
    samplingLaboratoryAssistant: "Иванова А.А.",
    sampleName: "Шамот",
    registrationDate: "2026-08-05",
    samplingLocation: "Склад сырья",
    transmitToJournal: "verification",
  });

  assert.equal(validation.ok, true);
  if (!validation.ok) return;
  assert.equal(validation.value.transmitToJournal, "verification");
});

test("sample registration journal accepts an empty transmission target", () => {
  const validation = validateLaboratorySampleRegistrationJournalSubmission({
    sampleNumber: "19",
    laboratorySampleCode: ".19",
    samplingDate: "2026-08-05",
    samplingLaboratoryAssistant: "Иванова А.А.",
    sampleName: "Шамот",
    registrationDate: "2026-08-05",
    samplingLocation: "Склад сырья",
    transmitToJournal: "",
  });

  assert.equal(validation.ok, true);
  if (!validation.ok) return;
  assert.equal(validation.value.transmitToJournal, undefined);
});

test("sample registration journal rejects an unknown transmission target", () => {
  const validation = validateLaboratorySampleRegistrationJournalSubmission({
    sampleNumber: "19",
    laboratorySampleCode: ".19",
    samplingDate: "2026-08-05",
    samplingLaboratoryAssistant: "Иванова А.А.",
    sampleName: "Шамот",
    registrationDate: "2026-08-05",
    samplingLocation: "Склад сырья",
    transmitToJournal: "unknown_journal",
  });

  assert.equal(validation.ok, false);
  if (validation.ok) return;
  assert.deepEqual(validation.errors, [
    "Проверьте поле «Трансляция в журнал».",
  ]);
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
    waterAbsorption: [],
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
    "Проверьте поле «Водопоглощение».",
  ]);
});
