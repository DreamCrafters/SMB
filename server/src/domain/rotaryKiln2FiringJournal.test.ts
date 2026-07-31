import assert from "node:assert/strict";
import test from "node:test";
import { validateRotaryKiln2FiringJournalSubmission } from "./rotaryKiln2FiringJournal.js";

test("rotary kiln 2 firing journal accepts and normalizes a complete record", () => {
  const validation = validateRotaryKiln2FiringJournalSubmission({
    recordDate: "2026-07-29",
    recordTime: "08:05",
    producedMaterial: "  ШКИ-66 ",
    waterAbsorption: 4.2,
    temperatureBeforeCyclone: 850,
    temperatureBeforeFilter: 210.5,
    temperatureInFieldChamber: 118,
    temperatureAtRollback: 96,
    gasConsumptionPerHour: 320.4,
    vacuum: 14.5,
    pressure: 1.8,
    shiftSupervisor: "  Петров П.П.  ",
    burnerOperator: "  Сидоров С.С. ",
    laboratoryAssistant: " Иванова А.А. ",
    sievePass05: 0.7,
    bulkDensity: 1.16,
    kilnLoadBucketsPerHour: 12,
    note: "  Краткая остановка для осмотра.  ",
  });

  assert.deepEqual(validation, {
    ok: true,
    value: {
      recordDate: "2026-07-29",
      recordTime: "08:05",
      producedMaterial: "ШКИ-66",
      waterAbsorption: 4.2,
      temperatureBeforeCyclone: 850,
      temperatureBeforeFilter: 210.5,
      temperatureInFieldChamber: 118,
      temperatureAtRollback: 96,
      gasConsumptionPerHour: 320.4,
      vacuum: 14.5,
      pressure: 1.8,
      shiftSupervisor: "Петров П.П.",
      burnerOperator: "Сидоров С.С.",
      laboratoryAssistant: "Иванова А.А.",
      sievePass05: 0.7,
      bulkDensity: 1.16,
      kilnLoadBucketsPerHour: 12,
      note: "Краткая остановка для осмотра.",
    },
  });
});

test("rotary kiln 2 firing journal reports every invalid field", () => {
  const validation = validateRotaryKiln2FiringJournalSubmission({
    recordDate: "2026-02-30",
    recordTime: "24:10",
    producedMaterial: "  ",
    waterAbsorption: "4,2",
    temperatureBeforeCyclone: Number.POSITIVE_INFINITY,
    temperatureBeforeFilter: 1_000_000_000,
    temperatureInFieldChamber: null,
    temperatureAtRollback: undefined,
    gasConsumptionPerHour: {},
    vacuum: [],
    pressure: "1.8",
    shiftSupervisor: " ",
    burnerOperator: "",
    laboratoryAssistant: 42,
    sievePass05: Number.NaN,
    bulkDensity: -1_000_000_000,
    kilnLoadBucketsPerHour: "12",
    note: "x".repeat(2_001),
  });

  assert.equal(validation.ok, false);
  if (validation.ok) return;

  assert.deepEqual(validation.errors, [
    "Укажите корректную дату.",
    "Укажите корректное время.",
    "Укажите производимый материал.",
    "Проверьте поле «Водопоглощение».",
    "Проверьте поле «t перед циклоном».",
    "Проверьте поле «t перед фильтром».",
    "Проверьте поле «t в полевой камере».",
    "Проверьте поле «t на откатной».",
    "Проверьте поле «Расход газа в час».",
    "Проверьте поле «Разряжение».",
    "Проверьте поле «Давление».",
    "Укажите мастера смены.",
    "Укажите обжигальщика.",
    "Укажите лаборанта.",
    "Проверьте поле «Проход ч/з сито 0,5».",
    "Проверьте поле «Насыпной вес».",
    "Проверьте поле «Загрузка печи в ковшах в час».",
    "Примечание должно содержать не больше 2000 символов.",
  ]);
});
