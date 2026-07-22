import assert from "node:assert/strict";
import test from "node:test";
import type { LaboratoryReferenceData } from "../integrations/googleSheetsReference.js";
import type { LaboratoryResult } from "../repositories/laboratoryResultsRepository.js";
import { buildLaboratoryProtocol } from "./laboratoryProtocol.js";

const reference: LaboratoryReferenceData = {
  indicators: [
    { id: "al2o3", label: "Al2O3", standard: "ГОСТ 2642.4-2016, п.7.1" },
    { id: "fe2o3", label: "Fe2O3", standard: "ГОСТ 2642.5, п.8" },
    { id: "moisture", label: "Влажность", standard: "ГОСТ 2642.1-2016" },
    { id: "strength", label: "Прочность", standard: "ГОСТ 4071.2-94" },
  ],
  incomingTestProfiles: [{
    label: "Глина",
    indicatorIds: ["al2o3", "fe2o3", "moisture"],
  }],
  finishedProductTypes: [{
    label: "Формованные изделия",
    indicatorIds: ["al2o3", "strength"],
  }],
};

test("incoming protocol matches a free-text object to its profile and keeps every sample", () => {
  const result: LaboratoryResult = {
    id: "result-1",
    section: "incoming",
    analysisDate: "2026-07-21",
    materialLabel: "Глина марки ГИМ-2",
    purpose: "Входной контроль партии",
    protocolNote: "Исследования завершены.",
    documentType: "Сертификат на отгруженную продукцию",
    documentNumber: "42/ГИМ",
    transportType: "ЖД",
    samplingMethod: "ГОСТ 2642.0-2014",
    documentIndicators: "Al2O3 не менее 28 %",
    samples: [
      {
        sampleIdentifier: "Вагон 12345",
        values: { al2o3: "31,4", moisture: "0,8" },
      },
      {
        sampleIdentifier: "Вагон 67890",
        values: { al2o3: "30,9", strength: "18,2" },
      },
    ],
    laboratoryAssistantDisplayName: "Иванова А.А.",
    createdAt: "2026-07-22T08:30:00.000Z",
  };

  const protocol = buildLaboratoryProtocol(result, reference);

  assert.equal(protocol.protocolDate, "22.07.2026");
  assert.equal(protocol.testDate, "21.07.2026");
  assert.equal(protocol.objectName, "Глина марки ГИМ-2");
  assert.equal(protocol.purpose, "Входной контроль партии");
  assert.equal(protocol.protocolNote, "Исследования завершены.");
  assert.deepEqual(protocol.optionalFields, [
    { label: "Вид документа, соответствие которому проводится проверка", value: "Сертификат на отгруженную продукцию" },
    { label: "Номер документа", value: "42/ГИМ" },
    { label: "Способ доставки и идентификаторы транспорта", value: "ЖД; Вагон 12345, Вагон 67890" },
    { label: "Способ отбора проб", value: "ГОСТ 2642.0-2014" },
    { label: "Показатели по сертификату", value: "Al2O3 не менее 28 %" },
  ]);
  assert.equal(protocol.sampleGroups.length, 2);
  assert.deepEqual(
    protocol.sampleGroups[0]?.rows.map((row) => [row.indicatorId, row.value]),
    [
      ["al2o3", "31,4"],
      ["fe2o3", ""],
      ["moisture", "0,8"],
      ["strength", ""],
    ],
  );
  assert.equal(protocol.sampleGroups[1]?.identifier, "Вагон 67890");
});

test("finished product protocol uses its configured indicator rows", () => {
  const result: LaboratoryResult = {
    id: "result-2",
    section: "finished_product",
    analysisDate: "2026-07-20",
    materialLabel: "Формованные изделия",
    productBrand: "ША-22",
    purpose: "Контроль готовой продукции",
    protocolNote: "Соответствует требованиям.",
    values: { strength: "38,1" },
    laboratoryAssistantDisplayName: "Иванова А.А.",
    createdAt: "2026-07-20T12:00:00.000Z",
  };

  const protocol = buildLaboratoryProtocol(result, reference);

  assert.equal(protocol.objectName, "Формованные изделия, марка ША-22");
  assert.deepEqual(
    protocol.sampleGroups[0]?.rows.map((row) => row.indicatorId),
    ["al2o3", "strength"],
  );
});
