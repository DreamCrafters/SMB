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
    return { ok: false, error: "Проверьте выбранную банку и пробу." };
  }

  const bankNumber = input.bankNumber;
  const laboratoryResultId = input.laboratoryResultId;
  const sampleIndex = input.sampleIndex;
  if (
    !bankNumbers.includes(bankNumber as BankNumber) ||
    typeof laboratoryResultId !== "string" ||
    !/^[a-zA-Z0-9-]{1,100}$/u.test(laboratoryResultId) ||
    !Number.isInteger(sampleIndex) ||
    Number(sampleIndex) < 0
  ) {
    return { ok: false, error: "Проверьте выбранную банку и пробу." };
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
  if (result === undefined || result.section !== "incoming") {
    return {
      ok: false,
      error: "Выбранный результат входящего контроля не найден.",
    };
  }

  const sample = result.samples[request.sampleIndex];
  if (sample === undefined) {
    return { ok: false, error: "Выбранная проба не найдена." };
  }

  const bulkDensityTonsPerCubicMeter = readPositiveLocalizedNumber(
    sample.values.bulk_density,
  );
  if (bulkDensityTonsPerCubicMeter === undefined) {
    return {
      ok: false,
      error: "В выбранной пробе не указан корректный насыпной вес.",
    };
  }

  return {
    ok: true,
    value: {
      ...request,
      sampleIdentifier: sample.sampleIdentifier,
      materialLabel: result.materialLabel,
      bulkDensityTonsPerCubicMeter,
    },
  };
}

export function listEligibleLaboratoryBankSamples(
  results: readonly StoredLaboratoryResult[],
) {
  return results.flatMap((result) => {
    if (result.section !== "incoming") return [];
    return result.samples.flatMap((sample, sampleIndex) => {
      const bulkDensityTonsPerCubicMeter = readPositiveLocalizedNumber(
        sample.values.bulk_density,
      );
      return bulkDensityTonsPerCubicMeter === undefined
        ? []
        : [{
            laboratoryResultId: result.id,
            sampleIndex,
            sampleIdentifier: sample.sampleIdentifier,
            materialLabel: result.materialLabel,
            analysisDate: result.analysisDate,
            bulkDensityTonsPerCubicMeter,
          }];
    });
  });
}

function readPositiveLocalizedNumber(value: string | undefined) {
  const parsed = Number((value ?? "").trim().replace(/\s/gu, "").replace(",", "."));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
