import assert from "node:assert/strict";
import test from "node:test";
import { validateLaboratoryRawMaterialQualitySubmission } from "./laboratoryRawMaterialQualityJournal.js";

const generalFields = {
  recordDate: "2026-08-13",
  laboratoryAssistant: "Иванова А.А.",
  shiftSupervisor: "Петров П.П.",
  shift: "day" as const,
};

test("raw material quality submission accepts general fields with no measurement rows", () => {
  assert.deepEqual(
    validateLaboratoryRawMaterialQualitySubmission({ ...generalFields }),
    {
      ok: true,
      value: {
        ...generalFields,
        clayMeasurements: [],
        temperMeasurements: [],
        slipMeasurements: [],
        runnerMeasurements: [],
        elutriationCoefficient: null,
        recommendationRecipient: null,
        recommendationText: null,
      },
    },
  );
});

test("raw material quality submission accepts the new short day shift", () => {
  const result = validateLaboratoryRawMaterialQualitySubmission({
    ...generalFields,
    shift: "day_short",
  });
  assert.equal(result.ok, true);
  assert.equal(result.ok && result.value.shift, "day_short");
});

test("raw material quality submission rejects missing general fields", () => {
  assert.deepEqual(
    validateLaboratoryRawMaterialQualitySubmission({
      recordDate: "2026-02-30",
      laboratoryAssistant: "",
      shiftSupervisor: "",
      shift: "afternoon",
    }),
    {
      ok: false,
      errors: [
        "Проверьте поле «Дата».",
        "Проверьте поле «Лаборант».",
        "Проверьте поле «Мастер смены».",
        "Проверьте поле «Смена».",
      ],
    },
  );
});

test("raw material quality submission fills every field of a full clay/temper/slip row", () => {
  const result = validateLaboratoryRawMaterialQualitySubmission({
    ...generalFields,
    clayMeasurements: [
      {
        measurementNumber: 999,
        clayBrand: "  Глина ГИМ-2  ",
        disintegratorNumber: "2",
        moisture: "6,8",
        sieveResidue3: "0,4",
        sievePass05: "98,1",
      },
    ],
    temperMeasurements: [
      {
        temperBrand: "Шамот ШКИ-66",
        ballMillNumber: "3",
        sieveResidue3: "0,8",
        sieveResidue2: "2,3",
        sieveResidue1: "4,1",
        sievePass05: "91,2",
      },
    ],
    slipMeasurements: [
      { mixerNumber: "4", temperature: "42 °C", density: "1,52" },
    ],
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.value.clayMeasurements, [
    {
      measurementNumber: 1,
      clayBrand: "Глина ГИМ-2",
      disintegratorNumber: "2",
      moisture: "6,8",
      sieveResidue3: "0,4",
      sievePass05: "98,1",
    },
  ]);
  assert.deepEqual(result.value.temperMeasurements, [
    {
      measurementNumber: 1,
      temperBrand: "Шамот ШКИ-66",
      ballMillNumber: "3",
      sieveResidue3: "0,8",
      sieveResidue2: "2,3",
      sieveResidue1: "4,1",
      sievePass05: "91,2",
    },
  ]);
  assert.deepEqual(result.value.slipMeasurements, [
    { measurementNumber: 1, mixerNumber: "4", temperature: "42 °C", density: "1,52" },
  ]);
});

test("raw material quality submission recomputes measurement numbers from row position", () => {
  const result = validateLaboratoryRawMaterialQualitySubmission({
    ...generalFields,
    clayMeasurements: [
      { measurementNumber: 40, clayBrand: "Глина А" },
      { measurementNumber: 41, clayBrand: "Глина Б" },
    ],
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(
    result.value.clayMeasurements.map((row) => row.measurementNumber),
    [1, 2],
  );
});

test("raw material quality submission accepts a fully empty row as all-null", () => {
  const result = validateLaboratoryRawMaterialQualitySubmission({
    ...generalFields,
    clayMeasurements: [{}],
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.value.clayMeasurements, [
    {
      measurementNumber: 1,
      clayBrand: null,
      disintegratorNumber: null,
      moisture: null,
      sieveResidue3: null,
      sievePass05: null,
    },
  ]);
});

test("raw material quality submission rejects an invalid enum value inside a row", () => {
  assert.deepEqual(
    validateLaboratoryRawMaterialQualitySubmission({
      ...generalFields,
      clayMeasurements: [{ disintegratorNumber: "5" }],
    }),
    { ok: false, errors: ["Проверьте таблицу «Контроль качества глины»."] },
  );
  assert.deepEqual(
    validateLaboratoryRawMaterialQualitySubmission({
      ...generalFields,
      temperMeasurements: [{ ballMillNumber: "9" }],
    }),
    { ok: false, errors: ["Проверьте таблицу «Отощитель»."] },
  );
  assert.deepEqual(
    validateLaboratoryRawMaterialQualitySubmission({
      ...generalFields,
      slipMeasurements: [{ mixerNumber: "7" }],
    }),
    { ok: false, errors: ["Проверьте таблицу «Шликер»."] },
  );
  assert.deepEqual(
    validateLaboratoryRawMaterialQualitySubmission({
      ...generalFields,
      runnerMeasurements: [{ runnerNumber: "0" }],
    }),
    { ok: false, errors: ["Проверьте таблицу «Бегуны»."] },
  );
});

test("raw material quality submission rejects a non-array measurement table", () => {
  assert.deepEqual(
    validateLaboratoryRawMaterialQualitySubmission({
      ...generalFields,
      runnerMeasurements: "not-an-array",
    }),
    { ok: false, errors: ["Проверьте таблицу «Бегуны»."] },
  );
});

test("runner row keeps the reserve flag as sent and defaults it when missing", () => {
  const result = validateLaboratoryRawMaterialQualitySubmission({
    ...generalFields,
    runnerMeasurements: [
      { runnerNumber: "1", isReserve: false },
      { runnerNumber: "2" },
      { runnerNumber: "3", chamottePercentage: "72", isReserve: true },
    ],
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(
    result.value.runnerMeasurements.map((row) => row.isReserve),
    [false, true, true],
  );
});

test("runner row does not require a measurement number field", () => {
  const result = validateLaboratoryRawMaterialQualitySubmission({
    ...generalFields,
    runnerMeasurements: [{ runnerNumber: "6" }],
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.value.runnerMeasurements, [
    {
      runnerNumber: "6",
      chamottePercentage: null,
      clayPercentage: null,
      residue0063: null,
      moisture: null,
      isReserve: true,
    },
  ]);
});

test("raw material quality submission keeps the summary fields optional", () => {
  const result = validateLaboratoryRawMaterialQualitySubmission({
    ...generalFields,
    elutriationCoefficient: "0,84",
    recommendationRecipient: "runner_operator",
    recommendationText: "Скорректировать влажность шихты.",
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.elutriationCoefficient, "0,84");
  assert.equal(result.value.recommendationRecipient, "runner_operator");
  assert.equal(result.value.recommendationText, "Скорректировать влажность шихты.");
});

test("raw material quality submission rejects an invalid recommendation recipient", () => {
  assert.deepEqual(
    validateLaboratoryRawMaterialQualitySubmission({
      ...generalFields,
      recommendationRecipient: "foreman",
    }),
    { ok: false, errors: ["Проверьте поле «Адрес рекомендации»."] },
  );
});
