import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateBankMeasurement,
  calculateCoshBankMeasurements,
  type BankAssignmentSnapshot,
  type BankVolumeReference,
} from "./bankMeasurement.js";

const volumeReference: BankVolumeReference = {
  points: [
    { heightMeters: 0, volumeCubicMeters: 988.5 },
    { heightMeters: 0.1, volumeCubicMeters: 980.65 },
    { heightMeters: 0.2, volumeCubicMeters: 972.8 },
    { heightMeters: 10, volumeCubicMeters: 203.5 },
    { heightMeters: 11, volumeCubicMeters: 117.5 },
    { heightMeters: 15, volumeCubicMeters: 0 },
  ],
};

const assignments: BankAssignmentSnapshot[] = [
  buildAssignment(1, "ШКИ", 1.16),
  buildAssignment(2, "ШКИ-66", 1.57),
  buildAssignment(3, "ШГР-28", 1.09),
];

test("bank measurement calculates average, table volume, and material mass", () => {
  const result = calculateBankMeasurement({
    assignment: assignments[0],
    measurements: [0, 0.1, 0.2, 0.3],
    volumeReference,
  });

  assert.deepEqual(result, {
    ok: true,
    value: {
      bankNumber: 1,
      bankLabel: "I",
      material: "ШКИ",
      assignmentId: "assignment-1",
      bulkDensitySource: "rotary_kiln_2_journal",
      bulkDensitySampleCount: 10,
      assignmentAssignedAt: "2026-07-23T08:00:00.000Z",
      measurements: [0, 0.1, 0.2, 0.3],
      averageHeightMeters: 0.15,
      volumeCubicMeters: 976.725,
      bulkDensityTonsPerCubicMeter: 1.16,
      materialMassTons: 1133.001,
    },
  });
});

test("bank measurement accepts any positive number of measurements", () => {
  const result = calculateBankMeasurement({
    assignment: assignments[1],
    measurements: [10, 10.5, 11],
    volumeReference,
  });

  assert.deepEqual(result, {
    ok: true,
    value: {
      bankNumber: 2,
      bankLabel: "II",
      material: "ШКИ-66",
      assignmentId: "assignment-2",
      bulkDensitySource: "rotary_kiln_2_journal",
      bulkDensitySampleCount: 10,
      assignmentAssignedAt: "2026-07-23T08:00:00.000Z",
      measurements: [10, 10.5, 11],
      averageHeightMeters: 10.5,
      volumeCubicMeters: 160.5,
      bulkDensityTonsPerCubicMeter: 1.57,
      materialMassTons: 251.985,
    },
  });
});

test("bank measurement rejects empty and out-of-table measurements", () => {
  assert.deepEqual(
    calculateBankMeasurement({
      assignment: assignments[2],
      measurements: [],
      volumeReference,
    }),
    { ok: false, error: "Добавьте хотя бы один замер." },
  );
  assert.deepEqual(
    calculateBankMeasurement({
      assignment: assignments[2],
      measurements: [15.1],
      volumeReference,
    }),
    { ok: false, error: "Замеры должны быть от 0 до 15 м." },
  );
});

test("COSH calculation requires all three banks and keeps assignment snapshots", () => {
  const missingAssignment = calculateCoshBankMeasurements({
    assignments: assignments.slice(0, 2),
    measurements: [
      { bankNumber: 1, values: [1] },
      { bankNumber: 2, values: [2] },
      { bankNumber: 3, values: [3] },
    ],
    volumeReference,
  });
  const complete = calculateCoshBankMeasurements({
    assignments,
    measurements: [
      { bankNumber: 1, values: [1] },
      { bankNumber: 2, values: [2, 2.2] },
      { bankNumber: 3, values: [15] },
    ],
    volumeReference,
  });

  assert.deepEqual(missingAssignment, {
    ok: false,
    error: "Лаборатория должна назначить содержимое банки III.",
  });
  assert.equal(complete.ok, true);
  if (!complete.ok) return;
  assert.equal(complete.value.length, 3);
  assert.equal(complete.value[1]?.material, "ШКИ-66");
  assert.equal(complete.value[2]?.materialMassTons, 0);
});

test("bank measurement keeps calculating a legacy laboratory result snapshot", () => {
  const result = calculateBankMeasurement({
    assignment: {
      assignmentId: "assignment-legacy",
      bankNumber: 1,
      materialLabel: "ШКИ",
      bulkDensityTonsPerCubicMeter: 1.16,
      bulkDensitySource: "laboratory_result",
      laboratoryResultId: "result-1",
      sampleIndex: 0,
      sampleIdentifier: "Неформованные изделия",
      assignedAt: "2026-07-23T08:00:00.000Z",
    },
    measurements: [15],
    volumeReference,
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(
    {
      bulkDensitySource: result.value.bulkDensitySource,
      bulkDensitySampleCount: result.value.bulkDensitySampleCount,
      sampleIdentifier: result.value.sampleIdentifier,
      materialMassTons: result.value.materialMassTons,
    },
    {
      bulkDensitySource: "laboratory_result",
      bulkDensitySampleCount: undefined,
      sampleIdentifier: "Неформованные изделия",
      materialMassTons: 0,
    },
  );
});

function buildAssignment(
  bankNumber: 1 | 2 | 3,
  materialLabel: string,
  bulkDensityTonsPerCubicMeter: number,
): BankAssignmentSnapshot {
  return {
    assignmentId: `assignment-${bankNumber}`,
    bankNumber,
    materialLabel,
    bulkDensityTonsPerCubicMeter,
    bulkDensitySource: "rotary_kiln_2_journal",
    bulkDensitySampleCount: 10,
    assignedAt: "2026-07-23T08:00:00.000Z",
  };
}
