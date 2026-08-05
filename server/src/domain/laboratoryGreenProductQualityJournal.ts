import {
  laboratoryGreenProductQualityFields,
  laboratoryGreenProductQualityPressNumberValues,
  type LaboratoryGreenProductQualitySubmission,
} from "../contracts/laboratoryGreenProductQualityJournal.js";

export type LaboratoryGreenProductQualityValidation =
  | { ok: true; value: LaboratoryGreenProductQualitySubmission }
  | { ok: false; errors: string[] };

const maxShortTextLength = 120;
const maxRecommendationLength = 2_000;
const maxWagonCount = 50;

export function validateLaboratoryGreenProductQualitySubmission(
  input: unknown,
): LaboratoryGreenProductQualityValidation {
  if (!isRecord(input)) {
    return {
      ok: false,
      errors: ["Передайте данные журнала контроля качества сырцовой продукции."],
    };
  }

  const errors: string[] = [];
  const normalized: Record<string, unknown> = {};

  for (const field of laboratoryGreenProductQualityFields) {
    if (field.kind === "wagons") {
      const wagonIds = readWagonIds(input[field.id]);
      if (wagonIds === undefined) {
        errors.push("Выберите хотя бы один вагон.");
      } else if (new Set(wagonIds).size !== wagonIds.length) {
        errors.push("Выберите вагоны без повторов.");
      } else {
        normalized[field.id] = wagonIds;
      }
      continue;
    }

    const value = field.kind === "date"
      ? readCalendarDate(input[field.id])
      : field.kind === "press"
        ? readOption(
            input[field.id],
            laboratoryGreenProductQualityPressNumberValues,
          )
        : field.kind === "number"
          ? readMeasurement(input[field.id])
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

  return errors.length === 0
    ? {
        ok: true,
        value: normalized as LaboratoryGreenProductQualitySubmission,
      }
    : { ok: false, errors };
}

function readWagonIds(value: unknown) {
  if (!Array.isArray(value) || value.length === 0 || value.length > maxWagonCount) {
    return undefined;
  }
  const wagonIds = value.map((item) => typeof item === "string"
    ? item.trim()
    : "");
  return wagonIds.every(
    (item) => item.length > 0 && item.length <= 100 && /^[a-zA-Z0-9-]+$/u.test(item),
  )
    ? wagonIds
    : undefined;
}

function readMeasurement(value: unknown) {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized.length <= 40 && /^\d+(?:[.,]\d+)?$/u.test(normalized)
    ? normalized
    : undefined;
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
