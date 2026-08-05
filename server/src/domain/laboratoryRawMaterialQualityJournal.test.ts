import assert from "node:assert/strict";
import test from "node:test";
import {
  validateLaboratoryRawMaterialQualitySubmission,
} from "./laboratoryRawMaterialQualityJournal.js";

const completeSubmission = {
  recordDate: "2026-08-05",
  laboratoryAssistant: " Иванова А.А. ",
  shiftSupervisor: " Петров П.П. ",
  shift: "day",
  clayBrand: " Глина ГИМ-2 ",
  clayMoisture: " 6,8 ",
  clayGrainComposition: " 0–3 мм ",
  disintegratorNumber: "2",
  temperMoisture: " 1,2 ",
  temperGrainComposition: " 0–5 мм ",
  temperSieveResidue1: " 4,1 ",
  temperSieveResidue2: " 2,3 ",
  temperSieveResidue3: " 0,8 ",
  temperSievePass05: " 91,2 ",
  temperBrand: " Шамот ШКИ-66 ",
  temperBulkDensity: " 1,16 ",
  slipMixerNumber: " 3 ",
  slipTemperature: " 42 °C ",
  slipDensity: " 1,52 ",
  runnerNumber: " 4 ",
  chargeChamottePercentage: " 72 ",
  chargeClayPercentage: " 28 ",
  chargeResidue0063: " 3,4 ",
  chargeMoisture: " 5,9 ",
  elutriationCoefficient: " 0,84 ",
  recommendationRecipient: "runner_operator",
  recommendationText: " Скорректировать влажность шихты. ",
};

test("raw material quality journal normalizes every required section", () => {
  const validation = validateLaboratoryRawMaterialQualitySubmission(
    completeSubmission,
  );

  assert.deepEqual(validation, {
    ok: true,
    value: {
      ...completeSubmission,
      laboratoryAssistant: "Иванова А.А.",
      shiftSupervisor: "Петров П.П.",
      clayBrand: "Глина ГИМ-2",
      clayMoisture: "6,8",
      clayGrainComposition: "0–3 мм",
      temperMoisture: "1,2",
      temperGrainComposition: "0–5 мм",
      temperSieveResidue1: "4,1",
      temperSieveResidue2: "2,3",
      temperSieveResidue3: "0,8",
      temperSievePass05: "91,2",
      temperBrand: "Шамот ШКИ-66",
      temperBulkDensity: "1,16",
      slipMixerNumber: "3",
      slipTemperature: "42 °C",
      slipDensity: "1,52",
      runnerNumber: "4",
      chargeChamottePercentage: "72",
      chargeClayPercentage: "28",
      chargeResidue0063: "3,4",
      chargeMoisture: "5,9",
      elutriationCoefficient: "0,84",
      recommendationText: "Скорректировать влажность шихты.",
    },
  });
});

test("raw material quality journal rejects missing fields and unknown options", () => {
  const validation = validateLaboratoryRawMaterialQualitySubmission({
    ...completeSubmission,
    recordDate: "2026-02-30",
    laboratoryAssistant: "",
    shift: "third",
    clayBrand: null,
    disintegratorNumber: "3",
    temperMoisture: [],
    slipMixerNumber: " ",
    runnerNumber: {},
    recommendationRecipient: "unknown",
    recommendationText: " ",
  });

  assert.equal(validation.ok, false);
  if (validation.ok) return;
  assert.deepEqual(validation.errors, [
    "Проверьте поле «Дата».",
    "Проверьте поле «Лаборант».",
    "Проверьте поле «Смена».",
    "Проверьте поле «Марка глины».",
    "Проверьте поле «Дезинтегратор №».",
    "Проверьте поле «Влажность отощителя».",
    "Проверьте поле «№ мешалки».",
    "Проверьте поле «№ бегунов».",
    "Проверьте поле «Адрес рекомендации».",
    "Проверьте поле «Текст рекомендации».",
  ]);
});
