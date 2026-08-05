import assert from "node:assert/strict";
import test from "node:test";
import {
  validateLaboratoryUnshapedProductSampleCorrection,
  validateLaboratoryUnshapedProductSampleSubmission,
} from "./laboratoryUnshapedProductSampleJournal.js";

test("unshaped product sample journal normalizes a complete record", () => {
  const validation = validateLaboratoryUnshapedProductSampleSubmission({
    sampleNumber: "  18 ",
    sampleDate: "2026-08-05",
    sampledBy: " Иванова А.А. ",
    batchNumber: " 55 ",
    sampleCode: " .18 ",
    productName: " Шамот молотый ",
    batchMass: " 12,5 т ",
    moisture: " 0,8 ",
    grainComposition: " 0-5 мм ",
    fireResistance: " 1710 °C ",
    suitability: "yes",
    notes: "  Без отклонений.  ",
    chemicalAnalysisNumber: "999",
  });

  assert.deepEqual(validation, {
    ok: true,
    value: {
      sampleNumber: "18",
      sampleDate: "2026-08-05",
      sampledBy: "Иванова А.А.",
      batchNumber: "55",
      sampleCode: ".18",
      productName: "Шамот молотый",
      batchMass: "12,5 т",
      moisture: "0,8",
      grainComposition: "0-5 мм",
      fireResistance: "1710 °C",
      suitability: "yes",
      notes: "Без отклонений.",
    },
  });
});

test("unshaped product sample correction accepts an empty note", () => {
  const validation = validateLaboratoryUnshapedProductSampleCorrection({
    sampleNumber: "19",
    sampleDate: "2026-08-05",
    sampledBy: "Иванова А.А.",
    batchNumber: "56",
    sampleCode: ".19",
    productName: "Шамот",
    batchMass: "10 т",
    moisture: "0,7",
    grainComposition: "0-3 мм",
    fireResistance: "1690 °C",
    suitability: "maybe",
    notes: " ",
  });

  assert.equal(validation.ok, true);
  if (!validation.ok) return;
  assert.equal(validation.value.notes, undefined);
});

test("unshaped product sample journal rejects invalid fields and suitability", () => {
  const validation = validateLaboratoryUnshapedProductSampleSubmission({
    sampleNumber: "",
    sampleDate: "2026-02-30",
    sampledBy: null,
    batchNumber: [],
    sampleCode: 18,
    productName: " ",
    batchMass: "",
    moisture: {},
    grainComposition: "",
    fireResistance: "",
    suitability: "unknown",
    notes: [],
  });

  assert.equal(validation.ok, false);
  if (validation.ok) return;
  assert.deepEqual(validation.errors, [
    "Проверьте поле «Номер пробы».",
    "Проверьте поле «Дата».",
    "Проверьте поле «Кто брал пробы».",
    "Проверьте поле «№ партии».",
    "Проверьте поле «Код пробы».",
    "Проверьте поле «Наименование продукции».",
    "Проверьте поле «Масса партии».",
    "Проверьте поле «Влажность».",
    "Проверьте поле «Зерновой состав».",
    "Проверьте поле «Огнеупорность».",
    "Проверьте поле «Пригодность».",
    "Проверьте поле «Примечание».",
  ]);
});
