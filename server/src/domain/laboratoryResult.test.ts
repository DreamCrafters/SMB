import assert from "node:assert/strict";
import test from "node:test";
import type { LaboratoryReferenceData } from "../integrations/googleSheetsReference.js";
import { validateLaboratoryResultSubmission } from "./laboratoryResult.js";

const reference: LaboratoryReferenceData = {
  indicators: [
    { id: "al2o3", label: "Al2O3", standard: "ГОСТ 1" },
    { id: "moisture", label: "Влажность", standard: "ГОСТ 2" },
    { id: "water_absorption", label: "Водопоглощение" },
    { id: "strength", label: "Прочность" },
  ],
  incomingTestProfiles: [],
  finishedProductTypes: [{
    label: "Формованные изделия",
    indicatorIds: [],
  }],
};

test("incoming laboratory report accepts free-text material and multiple samples", () => {
  const result = validateLaboratoryResultSubmission(
    {
      section: "incoming",
      analysisDate: "2026-07-22",
      materialLabel: "  Глина   огнеупорная  ",
      purpose: "  Определение   химического состава ",
      protocolNote: " Партия соответствует требованиям. ",
      documentType: "Сертификат на отгруженную продукцию",
      documentNumber: "С-77",
      transportType: "ЖД",
      samplingMethod: "По ГОСТ",
      documentIndicators: "Al2O3 не менее 30%",
      samples: [
        {
          sampleIdentifier: "Вагон 12345",
          values: { al2o3: "31,4" },
        },
        {
          sampleIdentifier: "Автомобиль А123БВ",
          values: { strength: "38,1" },
        },
      ],
    },
    reference,
  );

  assert.deepEqual(result, {
    ok: true,
    value: {
      section: "incoming",
      analysisDate: "2026-07-22",
      materialLabel: "Глина огнеупорная",
      purpose: "Определение химического состава",
      protocolNote: "Партия соответствует требованиям.",
      documentType: "Сертификат на отгруженную продукцию",
      documentNumber: "С-77",
      transportType: "ЖД",
      samplingMethod: "По ГОСТ",
      documentIndicators: "Al2O3 не менее 30%",
      samples: [
        {
          sampleIdentifier: "Вагон 12345",
          values: { al2o3: "31,4" },
        },
        {
          sampleIdentifier: "Автомобиль А123БВ",
          values: { strength: "38,1" },
        },
      ],
    },
  });
});

test("laboratory result accepts any one available indicator", () => {
  const mainIndicator = validateLaboratoryResultSubmission(
    {
      section: "finished_product",
      analysisDate: "2026-07-22",
      materialLabel: "Формованные изделия",
      productBrand: "ША-22",
      purpose: "Контроль готовой продукции",
      protocolNote: "Соответствует требованиям.",
      values: { strength: "38,1" },
    },
    reference,
  );
  const additionalIndicator = validateLaboratoryResultSubmission(
    {
      section: "finished_product",
      analysisDate: "2026-07-22",
      materialLabel: "Формованные изделия",
      productBrand: "ША-22",
      purpose: "Контроль готовой продукции",
      protocolNote: "Соответствует требованиям.",
      values: { al2o3: "31,4" },
    },
    reference,
  );

  assert.equal(mainIndicator.ok, true);
  assert.equal(additionalIndicator.ok, true);
});

test("laboratory result rejects an empty indicator set", () => {
  const result = validateLaboratoryResultSubmission(
    {
      section: "finished_product",
      analysisDate: "2026-07-22",
      materialLabel: "Формованные изделия",
      productBrand: "ША-22",
      purpose: "Контроль готовой продукции",
      protocolNote: "Соответствует требованиям.",
      values: {},
    },
    reference,
  );

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.deepEqual(result.errors, [
    "Заполните хотя бы один показатель испытаний.",
  ]);
});

test("incoming laboratory report rejects missing material and invalid sample", () => {
  const result = validateLaboratoryResultSubmission(
    {
      section: "incoming",
      analysisDate: "22.07.2026",
      materialLabel: "",
      purpose: "",
      protocolNote: "",
      transportType: "Самолёт",
      samples: [{ sampleIdentifier: "", values: {} }],
    },
    reference,
  );

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.deepEqual(result.errors, [
    "Укажите дату анализа.",
    "Укажите объект испытаний.",
    "Укажите цель испытаний.",
    "Укажите примечание к протоколу.",
    "Выберите вид транспорта из списка.",
    "Проба 1: укажите номер пробы или идентификатор транспорта.",
    "Проба 1: заполните хотя бы один показатель испытаний.",
  ]);
});
