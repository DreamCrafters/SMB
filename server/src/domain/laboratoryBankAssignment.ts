import type { RotaryKiln2MaterialBulkDensity } from "../contracts/rotaryKiln2FiringJournal.js";
import { bankNumbers, type BankNumber } from "./bankMeasurement.js";

export type LaboratoryBankAssignmentRequest = {
  bankNumber: BankNumber;
  material: string;
};

export type LaboratoryBankAssignmentSelection = {
  bankNumber: BankNumber;
  materialLabel: string;
  bulkDensityTonsPerCubicMeter: number;
  bulkDensitySource: "rotary_kiln_2_journal";
  bulkDensitySampleCount: number;
};

export type LaboratoryBankAssignmentValidation =
  | { ok: true; value: LaboratoryBankAssignmentRequest }
  | { ok: false; error: string };

export type LaboratoryBankAssignmentResolution =
  | { ok: true; value: LaboratoryBankAssignmentSelection }
  | { ok: false; error: string };

const maxMaterialLength = 120;

export function validateLaboratoryBankAssignmentRequest(
  input: unknown,
): LaboratoryBankAssignmentValidation {
  const invalid = {
    ok: false,
    error: "Проверьте выбранную банку и материал из журнала печи 2.",
  } as const;

  if (!isRecord(input)) return invalid;

  const bankNumber = input.bankNumber;
  const material = typeof input.material === "string"
    ? input.material.trim().replace(/\s+/gu, " ")
    : "";
  if (
    !bankNumbers.includes(bankNumber as BankNumber) ||
    material === "" ||
    material.length > maxMaterialLength
  ) {
    return invalid;
  }

  return {
    ok: true,
    value: { bankNumber: bankNumber as BankNumber, material },
  };
}

/**
 * Насыпной вес не вводится вручную: его даёт среднее по последним записям
 * журнала печи 2 для выбранного материала.
 */
export function resolveLaboratoryBankAssignment(
  request: LaboratoryBankAssignmentRequest,
  materialBulkDensity: RotaryKiln2MaterialBulkDensity | undefined,
): LaboratoryBankAssignmentResolution {
  if (materialBulkDensity === undefined || materialBulkDensity.sampleCount < 1) {
    return {
      ok: false,
      error:
        `Для материала «${request.material}» нет записей насыпного веса в журнале печи 2.`,
    };
  }

  const bulkDensityTonsPerCubicMeter =
    materialBulkDensity.averageBulkDensityTonsPerCubicMeter;
  if (
    !Number.isFinite(bulkDensityTonsPerCubicMeter) ||
    bulkDensityTonsPerCubicMeter <= 0
  ) {
    return {
      ok: false,
      error:
        `Средний насыпной вес материала «${request.material}» в журнале печи 2 должен быть больше нуля.`,
    };
  }

  return {
    ok: true,
    value: {
      bankNumber: request.bankNumber,
      materialLabel: materialBulkDensity.material,
      bulkDensityTonsPerCubicMeter,
      bulkDensitySource: "rotary_kiln_2_journal",
      bulkDensitySampleCount: materialBulkDensity.sampleCount,
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
