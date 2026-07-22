import assert from "node:assert/strict";
import test from "node:test";
import {
  listEligibleLaboratoryBankSamples,
  resolveLaboratoryBankAssignment,
  validateLaboratoryBankAssignmentRequest,
} from "./laboratoryBankAssignment.js";

const incomingResult = {
  id: "result-1",
  section: "incoming" as const,
  analysisDate: "2026-07-23",
  materialLabel: "ШКИ",
  samples: [
    { sampleIdentifier: "Проба без веса", values: { moisture: "0,3" } },
    { sampleIdentifier: "Проба 2", values: { bulk_density: "1,16" } },
  ],
  laboratoryAssistantDisplayName: "Иванова А.А.",
  createdAt: "2026-07-23T08:00:00.000Z",
};

test("laboratory bank assignment resolves a specific incoming sample density", () => {
  const request = validateLaboratoryBankAssignmentRequest({
    bankNumber: 2,
    laboratoryResultId: "result-1",
    sampleIndex: 1,
  });
  assert.equal(request.ok, true);
  if (!request.ok) return;

  assert.deepEqual(resolveLaboratoryBankAssignment(request.value, incomingResult), {
    ok: true,
    value: {
      bankNumber: 2,
      laboratoryResultId: "result-1",
      sampleIndex: 1,
      sampleIdentifier: "Проба 2",
      materialLabel: "ШКИ",
      bulkDensityTonsPerCubicMeter: 1.16,
    },
  });
});

test("eligible bank samples contain only incoming samples with positive density", () => {
  assert.deepEqual(listEligibleLaboratoryBankSamples([incomingResult]), [{
    laboratoryResultId: "result-1",
    sampleIndex: 1,
    sampleIdentifier: "Проба 2",
    materialLabel: "ШКИ",
    analysisDate: "2026-07-23",
    bulkDensityTonsPerCubicMeter: 1.16,
  }]);
});

test("laboratory bank assignment rejects a sample without density", () => {
  assert.deepEqual(resolveLaboratoryBankAssignment({
    bankNumber: 1,
    laboratoryResultId: "result-1",
    sampleIndex: 0,
  }, incomingResult), {
    ok: false,
    error: "В выбранной пробе не указан корректный насыпной вес.",
  });
});
