import assert from "node:assert/strict";
import test from "node:test";
import {
  listEligibleLaboratoryBankProducts,
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

const finishedProductResult = {
  id: "result-2",
  section: "finished_product" as const,
  analysisDate: "2026-07-23",
  materialLabel: "Неформованные изделия",
  productBrand: "ШКИ-66",
  values: { bulk_density: "1,16" },
  laboratoryAssistantDisplayName: "Иванова А.А.",
  createdAt: "2026-07-23T09:00:00.000Z",
};

test("laboratory bank assignment resolves a finished product density", () => {
  const request = validateLaboratoryBankAssignmentRequest({
    bankNumber: 2,
    laboratoryResultId: "result-2",
    sampleIndex: 0,
  });
  assert.equal(request.ok, true);
  if (!request.ok) return;

  assert.deepEqual(resolveLaboratoryBankAssignment(request.value, finishedProductResult), {
    ok: true,
    value: {
      bankNumber: 2,
      laboratoryResultId: "result-2",
      sampleIndex: 0,
      sampleIdentifier: "Неформованные изделия",
      materialLabel: "ШКИ-66",
      bulkDensityTonsPerCubicMeter: 1.16,
    },
  });
});

test("eligible bank products contain only finished products with positive density", () => {
  assert.deepEqual(listEligibleLaboratoryBankProducts([
    incomingResult,
    finishedProductResult,
  ]), [{
    laboratoryResultId: "result-2",
    productType: "Неформованные изделия",
    productBrand: "ШКИ-66",
    analysisDate: "2026-07-23",
    bulkDensityTonsPerCubicMeter: 1.16,
  }]);
});

test("laboratory bank assignment rejects an incoming control result", () => {
  assert.deepEqual(resolveLaboratoryBankAssignment({
    bankNumber: 1,
    laboratoryResultId: "result-1",
    sampleIndex: 1,
  }, incomingResult), {
    ok: false,
    error: "Выбранный результат готовой продукции не найден.",
  });
});
