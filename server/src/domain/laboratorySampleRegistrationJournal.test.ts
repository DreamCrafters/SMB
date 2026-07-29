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
    samplingLocation: " Склад сырья ",
    al2o3: " 31,4 ",
    fe2o3: " 2,1 ",
    sio2: " 58,7 ",
    cao2: " < 0,1 ",
    p2o5: " 0,03 ",
    lossOnIgnition: " 4,2 ",
    moisture: " 0,8 ",
    chemicalAnalysisDate: "2026-07-30",
    chemicalAnalysisLaboratoryAssistant: " Петрова П.П. ",
    batchNumber: " П-42 ",
    notes: " Без отклонений. ",
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
      samplingLocation: "Склад сырья",
      al2o3: "31,4",
      fe2o3: "2,1",
      sio2: "58,7",
      cao2: "< 0,1",
      p2o5: "0,03",
      lossOnIgnition: "4,2",
      moisture: "0,8",
      chemicalAnalysisDate: "2026-07-30",
      chemicalAnalysisLaboratoryAssistant: "Петрова П.П.",
      batchNumber: "П-42",
      notes: "Без отклонений.",
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
    al2o3: "",
    fe2o3: {},
    sio2: null,
    cao2: undefined,
    p2o5: "",
    lossOnIgnition: 4.2,
    moisture: " ",
    chemicalAnalysisDate: "2026-13-01",
    chemicalAnalysisLaboratoryAssistant: "",
    batchNumber: null,
    notes: "x".repeat(2_001),
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
    "Проверьте поле «Al2O3».",
    "Проверьте поле «Fe2O3».",
    "Проверьте поле «SiO2».",
    "Проверьте поле «CaO2».",
    "Проверьте поле «P2O5».",
    "Проверьте поле «ппп».",
    "Проверьте поле «Влажность».",
    "Проверьте поле «Дата хим. анализа».",
    "Проверьте поле «Лаборант (химический анализ)».",
    "Проверьте поле «Номер партии».",
    "Примечания должны содержать не больше 2000 символов.",
  ]);
});
