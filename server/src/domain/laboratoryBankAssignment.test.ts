import assert from "node:assert/strict";
import test from "node:test";
import {
  applyLatestBankBulkDensities,
  resolveLaboratoryBankAssignment,
  validateLaboratoryBankAssignmentRequest,
} from "./laboratoryBankAssignment.js";

test("COSH bank assignments use the latest laboratory density for their material", () => {
  const assignments = applyLatestBankBulkDensities([
    {
      assignmentId: "assignment-1",
      bankNumber: 1 as const,
      materialLabel: " ШКИ-66 ",
      bulkDensityTonsPerCubicMeter: 1.4,
      bulkDensitySource: "laboratory_result" as const,
      bulkDensitySampleCount: 3,
      laboratoryResultId: "legacy-result",
      sampleIndex: 0,
      sampleIdentifier: "legacy-sample",
      assignedAt: "2026-07-20T08:00:00.000Z",
    },
  ], [{
    material: "ШКИ-66",
    averageBulkDensityTonsPerCubicMeter: 1.57,
    sampleCount: 10,
    latestRecordDate: "2026-08-16",
  }]);

  assert.deepEqual(assignments[0], {
    assignmentId: "assignment-1",
    bankNumber: 1,
    materialLabel: "ШКИ-66",
    bulkDensityTonsPerCubicMeter: 1.57,
    bulkDensitySource: "rotary_kiln_2_journal",
    bulkDensitySampleCount: 10,
    bulkDensityLatestRecordDate: "2026-08-16",
    assignedAt: "2026-07-20T08:00:00.000Z",
  });
});

test("COSH bank assignments choose the newest normalized material duplicate", () => {
  const assignments = applyLatestBankBulkDensities([
    {
      assignmentId: "assignment-1",
      bankNumber: 1 as const,
      materialLabel: "ШКИ-66",
      bulkDensityTonsPerCubicMeter: 1.4,
      bulkDensitySource: "rotary_kiln_2_journal" as const,
      assignedAt: "2026-07-20T08:00:00.000Z",
    },
  ], [
    {
      material: "ШКИ-66",
      averageBulkDensityTonsPerCubicMeter: 1.57,
      sampleCount: 10,
      latestRecordDate: "2026-08-16",
    },
    {
      material: "  шки-66  ",
      averageBulkDensityTonsPerCubicMeter: 1.41,
      sampleCount: 4,
      latestRecordDate: "2026-08-10",
    },
  ]);

  assert.deepEqual(assignments[0], {
    assignmentId: "assignment-1",
    bankNumber: 1,
    materialLabel: "ШКИ-66",
    bulkDensityTonsPerCubicMeter: 1.57,
    bulkDensitySource: "rotary_kiln_2_journal",
    bulkDensitySampleCount: 10,
    bulkDensityLatestRecordDate: "2026-08-16",
    assignedAt: "2026-07-20T08:00:00.000Z",
  });
});

const materialBulkDensity = {
  material: "ШКИ-66",
  averageBulkDensityTonsPerCubicMeter: 1.16,
  sampleCount: 10,
  latestRecordDate: "2026-07-30",
};

test("laboratory bank assignment resolves the kiln journal average", () => {
  const request = validateLaboratoryBankAssignmentRequest({
    bankNumber: 2,
    material: "  ШКИ-66  ",
  });
  assert.equal(request.ok, true);
  if (!request.ok) return;
  assert.equal(request.value.material, "ШКИ-66");

  assert.deepEqual(
    resolveLaboratoryBankAssignment(request.value, materialBulkDensity),
    {
      ok: true,
      value: {
        bankNumber: 2,
        materialLabel: "ШКИ-66",
        bulkDensityTonsPerCubicMeter: 1.16,
        bulkDensitySource: "rotary_kiln_2_journal",
        bulkDensitySampleCount: 10,
      },
    },
  );
});

test("laboratory bank assignment rejects a bank or material outside the journal", () => {
  assert.deepEqual(
    validateLaboratoryBankAssignmentRequest({ bankNumber: 4, material: "ШКИ" }),
    {
      ok: false,
      error: "Проверьте выбранную банку и материал из журнала печи 2.",
    },
  );
  assert.deepEqual(
    validateLaboratoryBankAssignmentRequest({ bankNumber: 1, material: "  " }),
    {
      ok: false,
      error: "Проверьте выбранную банку и материал из журнала печи 2.",
    },
  );
  assert.deepEqual(
    resolveLaboratoryBankAssignment(
      { bankNumber: 1, material: "ШГР-28" },
      undefined,
    ),
    {
      ok: false,
      error:
        "Для материала «ШГР-28» нет записей насыпного веса в журнале печи 2.",
    },
  );
});

test("laboratory bank assignment rejects a non positive average density", () => {
  assert.deepEqual(
    resolveLaboratoryBankAssignment({ bankNumber: 1, material: "ШКИ-66" }, {
      ...materialBulkDensity,
      averageBulkDensityTonsPerCubicMeter: 0,
    }),
    {
      ok: false,
      error:
        "Средний насыпной вес материала «ШКИ-66» в журнале печи 2 должен быть больше нуля.",
    },
  );
});
