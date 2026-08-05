import {
  laboratoryRawMaterialQualityDisintegratorValues,
  laboratoryRawMaterialQualityFields,
  laboratoryRawMaterialQualityRecommendationRecipientValues,
  laboratoryRawMaterialQualityShiftValues,
  type LaboratoryRawMaterialQualitySubmission,
} from "../contracts/laboratoryRawMaterialQualityJournal.js";

export type LaboratoryRawMaterialQualityValidation =
  | { ok: true; value: LaboratoryRawMaterialQualitySubmission }
  | { ok: false; errors: string[] };

const maxShortTextLength = 120;
const maxRecommendationLength = 2_000;

export function validateLaboratoryRawMaterialQualitySubmission(
  input: unknown,
): LaboratoryRawMaterialQualityValidation {
  if (!isRecord(input)) {
    return {
      ok: false,
      errors: ["Передайте данные журнала контроля качества сырья."],
    };
  }

  const errors: string[] = [];
  const normalized: Record<string, string> = {};

  for (const field of laboratoryRawMaterialQualityFields) {
    const value = field.kind === "date"
      ? readCalendarDate(input[field.id])
      : field.kind === "shift"
        ? readOption(input[field.id], laboratoryRawMaterialQualityShiftValues)
        : field.kind === "disintegrator"
          ? readOption(
              input[field.id],
              laboratoryRawMaterialQualityDisintegratorValues,
            )
          : field.kind === "recommendation"
            ? readOption(
                input[field.id],
                laboratoryRawMaterialQualityRecommendationRecipientValues,
              )
            : readText(
                input[field.id],
                field.kind === "long_text"
                  ? maxRecommendationLength
                  : maxShortTextLength,
              );
    if (value === undefined) {
      errors.push(`Проверьте поле «${field.label}».`);
    } else {
      normalized[field.id] = value;
    }
  }

  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: normalized as LaboratoryRawMaterialQualitySubmission,
  };
}

function readOption<const Value extends string>(
  value: unknown,
  allowed: readonly Value[],
): Value | undefined {
  return typeof value === "string" && allowed.includes(value as Value)
    ? value as Value
    : undefined;
}

function readCalendarDate(value: unknown) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) {
    return undefined;
  }
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day
    ? value
    : undefined;
}

function readText(value: unknown, maxLength: number) {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().replace(/\s+/gu, " ");
  return normalized.length > 0 && normalized.length <= maxLength
    ? normalized
    : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
