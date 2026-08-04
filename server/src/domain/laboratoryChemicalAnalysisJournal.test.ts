import assert from "node:assert/strict";
import test from "node:test";
import { validateLaboratoryChemicalAnalysisJournalSubmission } from "./laboratoryChemicalAnalysisJournal.js";

test("chemical analysis journal accepts and normalizes a complete record", () => {
  const validation = validateLaboratoryChemicalAnalysisJournalSubmission({
    sampleRegistrationId: " sample-registration-17 ",
    chemicalAnalysisDate: "2026-07-31",
    chemicalAnalysisLaboratoryAssistant: " Петрова П.П. ",
    batchNumber: " П-42 ",
    al2o3: " 31,4 ",
    fe2o3: " 2,1 ",
    sio2: " 58,7 ",
    cao2: " < 0,1 ",
    p2o5: " 0,03 ",
    lossOnIgnition: " 4,2 ",
    moisture: " 0,8 ",
    notes: " Без отклонений. ",
  });

  assert.deepEqual(validation, {
    ok: true,
    value: {
      sampleRegistrationId: "sample-registration-17",
      chemicalAnalysisDate: "2026-07-31",
      chemicalAnalysisLaboratoryAssistant: "Петрова П.П.",
      batchNumber: "П-42",
      al2o3: "31,4",
      fe2o3: "2,1",
      sio2: "58,7",
      cao2: "< 0,1",
      p2o5: "0,03",
      lossOnIgnition: "4,2",
      moisture: "0,8",
      notes: "Без отклонений.",
    },
  });
});

test("chemical analysis journal accepts only a registered sample", () => {
  const validation = validateLaboratoryChemicalAnalysisJournalSubmission({
    sampleRegistrationId: " sample-registration-17 ",
    batchNumber: " ",
    chemicalAnalysisDate: "",
    chemicalAnalysisLaboratoryAssistant: " ",
    al2o3: null,
  });

  assert.deepEqual(validation, {
    ok: true,
    value: {
      sampleRegistrationId: "sample-registration-17",
    },
  });
});

test("chemical analysis journal rejects invalid provided optional values", () => {
  const validation = validateLaboratoryChemicalAnalysisJournalSubmission({
    sampleRegistrationId: "",
    chemicalAnalysisDate: "2026-02-30",
    chemicalAnalysisLaboratoryAssistant: 42,
    batchNumber: 42,
    al2o3: null,
    fe2o3: {},
    sio2: [],
    cao2: undefined,
    p2o5: "",
    lossOnIgnition: 4.2,
    moisture: " ",
    notes: "x".repeat(2_001),
  });

  assert.equal(validation.ok, false);
  if (validation.ok) return;

  assert.deepEqual(validation.errors, [
    "Выберите код лабораторной пробы.",
    "Проверьте поле «Дата хим. анализа».",
    "Проверьте поле «Лаборант».",
    "Проверьте поле «Номер партии».",
    "Проверьте поле «Fe2O3».",
    "Проверьте поле «SiO2».",
    "Проверьте поле «ппп».",
    "Поле «Примечания» должно содержать не больше 2000 символов.",
  ]);
});
