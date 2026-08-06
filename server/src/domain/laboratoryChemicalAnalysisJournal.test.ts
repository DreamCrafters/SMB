import assert from "node:assert/strict";
import test from "node:test";
import { validateLaboratoryChemicalAnalysisJournalSubmission } from "./laboratoryChemicalAnalysisJournal.js";

test("chemical analysis journal accepts and normalizes a complete record", () => {
  const validation = validateLaboratoryChemicalAnalysisJournalSubmission({
    sampleSource: "sample_registration",
    sampleId: " sample-registration-17 ",
    laboratoryAnalysisNumber: " 43 ",
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
      sampleSource: "sample_registration",
      sampleId: "sample-registration-17",
      laboratoryAnalysisNumber: "43",
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
    sampleSource: "sample_registration",
    sampleId: " sample-registration-17 ",
    laboratoryAnalysisNumber: " ",
    batchNumber: " ",
    chemicalAnalysisDate: "",
    chemicalAnalysisLaboratoryAssistant: " ",
    al2o3: null,
  });

  assert.deepEqual(validation, {
    ok: true,
    value: {
      sampleSource: "sample_registration",
      sampleId: "sample-registration-17",
    },
  });
});

test("chemical analysis journal accepts an unshaped product sample", () => {
  const validation = validateLaboratoryChemicalAnalysisJournalSubmission({
    sampleSource: "unshaped_product",
    sampleId: " unshaped-product-sample-17 ",
    laboratoryAnalysisNumber: " 44 ",
  });

  assert.deepEqual(validation, {
    ok: true,
    value: {
      sampleSource: "unshaped_product",
      sampleId: "unshaped-product-sample-17",
      laboratoryAnalysisNumber: "44",
    },
  });
});

test("chemical analysis journal rejects indicator totals above 100", () => {
  const validation = validateLaboratoryChemicalAnalysisJournalSubmission({
    sampleSource: "sample_registration",
    sampleId: "sample-registration-17",
    al2o3: "40,01",
    fe2o3: "10",
    sio2: "30",
    cao2: "5",
    p2o5: "5",
    lossOnIgnition: "10",
  });

  assert.deepEqual(validation, {
    ok: false,
    errors: [
      "Сумма полей «Al2O3», «Fe2O3», «SiO2», «CaO2», «P2O5» и «ппп» не может быть больше 100.",
    ],
  });
});

test("chemical analysis journal rejects non-numeric total indicators", () => {
  const validation = validateLaboratoryChemicalAnalysisJournalSubmission({
    sampleSource: "sample_registration",
    sampleId: "sample-registration-17",
    al2o3: "60",
    sio2: "больше 40",
  });

  assert.deepEqual(validation, {
    ok: false,
    errors: ["Проверьте поле «SiO2»."],
  });
});

test("chemical analysis journal accepts an indicator total of exactly 100", () => {
  const validation = validateLaboratoryChemicalAnalysisJournalSubmission({
    sampleSource: "sample_registration",
    sampleId: "sample-registration-17",
    al2o3: "40",
    fe2o3: "10",
    sio2: "39,9",
    cao2: "< 0,1",
    p2o5: "0",
    lossOnIgnition: "10",
  });

  assert.equal(validation.ok, true);
});

test("chemical analysis journal compares decimal totals exactly", () => {
  const validation = validateLaboratoryChemicalAnalysisJournalSubmission({
    sampleSource: "sample_registration",
    sampleId: "sample-registration-17",
    al2o3: "0,01",
    fe2o3: "65,68",
    sio2: "34,31",
  });
  const aboveLimit = validateLaboratoryChemicalAnalysisJournalSubmission({
    sampleSource: "sample_registration",
    sampleId: "sample-registration-18",
    al2o3: "100,00000000000000001",
  });

  assert.equal(validation.ok, true);
  assert.deepEqual(aboveLimit, {
    ok: false,
    errors: [
      "Сумма полей «Al2O3», «Fe2O3», «SiO2», «CaO2», «P2O5» и «ппп» не может быть больше 100.",
    ],
  });
});

test("chemical analysis journal rejects lower-bound qualifiers", () => {
  const validation = validateLaboratoryChemicalAnalysisJournalSubmission({
    sampleSource: "sample_registration",
    sampleId: "sample-registration-17",
    al2o3: "> 60",
    sio2: "40",
  });

  assert.deepEqual(validation, {
    ok: false,
    errors: ["Проверьте поле «Al2O3»."],
  });
});

test("chemical analysis journal rejects invalid provided optional values", () => {
  const validation = validateLaboratoryChemicalAnalysisJournalSubmission({
    sampleSource: "unknown",
    sampleId: "",
    laboratoryAnalysisNumber: 43,
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
    "Проверьте поле «Номер лабораторного анализа».",
    "Проверьте поле «Дата хим. анализа».",
    "Проверьте поле «Лаборант».",
    "Проверьте поле «Номер партии».",
    "Проверьте поле «Fe2O3».",
    "Проверьте поле «SiO2».",
    "Проверьте поле «ппп».",
    "Поле «Примечания» должно содержать не больше 2000 символов.",
  ]);
});
