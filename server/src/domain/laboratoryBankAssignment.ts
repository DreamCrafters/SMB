import type { StoredLaboratoryResult } from "../repositories/laboratoryResultsRepository.js";
import { bankNumbers, type BankNumber } from "./bankMeasurement.js";

export type LaboratoryBankAssignmentRequest = {
  bankNumber: BankNumber;
  laboratoryResultId: string;
  sampleIndex: number;
};

export type LaboratoryBankAssignmentSelection = LaboratoryBankAssignmentRequest & {
  sampleIdentifier: string;
  materialLabel: string;
  bulkDensityTonsPerCubicMeter: number;
};

export type LaboratoryBankAssignmentValidation =
  | { ok: true; value: LaboratoryBankAssignmentRequest }
  | { ok: false; error: string };

export type LaboratoryBankAssignmentResolution =
  | { ok: true; value: LaboratoryBankAssignmentSelection }
  | { ok: false; error: string };

export function validateLaboratoryBankAssignmentRequest(
  input: unknown,
): LaboratoryBankAssignmentValidation {
  if (!isRecord(input)) {
    return {
      ok: false,
      error: "Проверьте выбранную банку и результат готовой продукции.",
    };
  }

  const bankNumber = input.bankNumber;
  const laboratoryResultId = input.laboratoryResultId;
  const sampleIndex = input.sampleIndex === undefined ? 0 : input.sampleIndex;
  if (
    !bankNumbers.includes(bankNumber as BankNumber) ||
    typeof laboratoryResultId !== "string" ||
    !/^[a-zA-Z0-9-]{1,100}$/u.test(laboratoryResultId) ||
    sampleIndex !== 0
  ) {
    return {
      ok: false,
      error: "Проверьте выбранную банку и результат готовой продукции.",
    };
  }

  return {
    ok: true,
    value: {
      bankNumber: bankNumber as BankNumber,
      laboratoryResultId,
      sampleIndex: Number(sampleIndex),
    },
  };
}

export function resolveLaboratoryBankAssignment(
  request: LaboratoryBankAssignmentRequest,
  result: StoredLaboratoryResult | undefined,
): LaboratoryBankAssignmentResolution {
  if (
    result === undefined ||
    result.section !== "finished_product" ||
    request.sampleIndex !== 0
  ) {
    return {
      ok: false,
      error: "Выбранный результат готовой продукции не найден.",
    };
  }

  const bulkDensityTonsPerCubicMeter = readPositiveLocalizedNumber(
    result.values.bulk_density,
  );
  if (bulkDensityTonsPerCubicMeter === undefined) {
    return {
      ok: false,
      error: "В выбранном результате не указан корректный насыпной вес.",
    };
  }

  return {
    ok: true,
    value: {
      ...request,
      sampleIdentifier: result.materialLabel,
      materialLabel: result.productBrand,
      bulkDensityTonsPerCubicMeter,
    },
  };
}

export function listEligibleLaboratoryBankProducts(
  results: readonly StoredLaboratoryResult[],
) {
  return results.flatMap((result) => {
    if (result.section !== "finished_product") return [];
    const bulkDensityTonsPerCubicMeter = readPositiveLocalizedNumber(
      result.values.bulk_density,
    );
    return bulkDensityTonsPerCubicMeter === undefined
      ? []
      : [{
          laboratoryResultId: result.id,
          productType: result.materialLabel,
          productBrand: result.productBrand,
          analysisDate: result.analysisDate,
          bulkDensityTonsPerCubicMeter,
        }];
  });
}

function readPositiveLocalizedNumber(value: string | undefined) {
  const parsed = Number((value ?? "").trim().replace(/\s/gu, "").replace(",", "."));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
