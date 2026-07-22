import assert from "node:assert/strict";
import test from "node:test";
import type { LaboratoryReferenceData } from "../integrations/googleSheetsReference.js";
import { validateLaboratoryResultSubmission } from "./laboratoryResult.js";

const reference: LaboratoryReferenceData = {
  incomingMaterials: [
    {
      label: "Глина",
      indicators: [
        { id: "al2o3", label: "Al2O3", standard: "ГОСТ 1" },
        { id: "moisture", label: "Влажность", standard: "ГОСТ 2" },
      ],
    },
  ],
  finishedProductTypes: [
    {
      label: "Формованные изделия",
      indicators: [
        { id: "water_absorption", label: "Водопоглощение" },
        { id: "strength", label: "Прочность" },
      ],
    },
  ],
};

test("incoming laboratory result is canonicalized against the live matrix", () => {
  const result = validateLaboratoryResultSubmission(
    {
      section: "incoming",
      analysisDate: "2026-07-22",
      materialLabel: "  глина ",
      sampleIdentifier: "Вагон 12345",
      documentType: "Сертификат на отгруженную продукцию",
      documentNumber: "С-77",
      transportType: "ЖД",
      samplingMethod: "По ГОСТ",
      documentIndicators: "Al2O3 не менее 30%",
      values: {
        al2o3: "31,4",
        moisture: "0,8",
      },
    },
    reference,
  );

  assert.deepEqual(result, {
    ok: true,
    value: {
      section: "incoming",
      analysisDate: "2026-07-22",
      materialLabel: "Глина",
      sampleIdentifier: "Вагон 12345",
      documentType: "Сертификат на отгруженную продукцию",
      documentNumber: "С-77",
      transportType: "ЖД",
      samplingMethod: "По ГОСТ",
      documentIndicators: "Al2O3 не менее 30%",
      values: {
        al2o3: "31,4",
        moisture: "0,8",
      },
    },
  });
});

test("finished product result keeps brand and requires every matrix indicator", () => {
  const valid = validateLaboratoryResultSubmission(
    {
      section: "finished_product",
      analysisDate: "2026-07-22",
      materialLabel: "Формованные изделия",
      productBrand: "ША-22",
      values: {
        water_absorption: "4,2",
        strength: "38,1",
      },
    },
    reference,
  );
  const missing = validateLaboratoryResultSubmission(
    {
      section: "finished_product",
      analysisDate: "2026-07-22",
      materialLabel: "Формованные изделия",
      productBrand: "ША-22",
      values: { strength: "38,1", al2o3: "лишнее" },
    },
    reference,
  );

  assert.equal(valid.ok, true);
  assert.equal(missing.ok, false);
  if (missing.ok) return;
  assert.deepEqual(missing.errors, [
    "Заполните показатель «Водопоглощение».",
    "Показатель «Al2O3» не применяется к выбранному материалу.",
  ]);
});

test("laboratory result rejects unknown material and invalid context fields", () => {
  const result = validateLaboratoryResultSubmission(
    {
      section: "incoming",
      analysisDate: "22.07.2026",
      materialLabel: "Неизвестное сырьё",
      sampleIdentifier: "",
      transportType: "Самолёт",
      values: {},
    },
    reference,
  );

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.deepEqual(result.errors, [
    "Укажите дату анализа.",
    "Выберите материал из справочника лаборатории.",
    "Укажите номер пробы или идентификатор транспорта.",
    "Выберите вид транспорта из списка.",
  ]);
});
