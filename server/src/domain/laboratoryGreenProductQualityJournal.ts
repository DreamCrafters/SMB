import {
  laboratoryGreenProductQualityGeneralFields,
  laboratoryGreenProductQualityMeasurementFields,
  laboratoryGreenProductQualityPressNumberValues,
  type LaboratoryGreenProductQualityMeasurement,
  type LaboratoryGreenProductQualitySubmission,
} from "../contracts/laboratoryGreenProductQualityJournal.js";

export type LaboratoryGreenProductQualityValidation =
  | { ok: true; value: LaboratoryGreenProductQualitySubmission }
  | { ok: false; errors: string[] };

const maxShortTextLength = 120;
const maxRecommendationLength = 2_000;
const maxWagonCount = 50;
const maxPieceCount = 1_000_000;

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

  for (const field of laboratoryGreenProductQualityGeneralFields) {
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
      : field.kind === "optional_date"
        ? readNullableCalendarDate(input[field.id])
        : field.kind === "optional_count"
          ? readNullableCount(input[field.id])
          : field.kind === "press"
            ? readOption(
                input[field.id],
                laboratoryGreenProductQualityPressNumberValues,
              )
            : readText(input[field.id], maxShortTextLength);

    if (value === undefined) {
      errors.push(`Проверьте поле «${field.label}».`);
    } else {
      normalized[field.id] = value;
    }
  }

  const measurements = readMeasurementRows(input.measurements);
  if (measurements === undefined) {
    errors.push("Проверьте таблицу линейных размеров и показателей качества.");
  } else {
    normalized.measurements = measurements;
  }

  const recommendations = readText(
    input.pressOperatorRecommendations,
    maxRecommendationLength,
  );
  if (recommendations === undefined) {
    errors.push("Проверьте поле «Рекомендации прессовщику».");
  } else {
    normalized.pressOperatorRecommendations = recommendations;
  }

  return errors.length === 0
    ? {
        ok: true,
        value: normalized as LaboratoryGreenProductQualitySubmission,
      }
    : { ok: false, errors };
}

function readMeasurementRows(
  value: unknown,
): LaboratoryGreenProductQualityMeasurement[] | undefined {
  if (!Array.isArray(value) || value.length === 0) return undefined;
  const rows: LaboratoryGreenProductQualityMeasurement[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const row = readMeasurementRow(value[index], index);
    if (row === undefined) return undefined;
    rows.push(row);
  }
  return rows;
}

function readMeasurementRow(
  row: unknown,
  index: number,
): LaboratoryGreenProductQualityMeasurement | undefined {
  if (!isRecord(row)) return undefined;
  const values: Record<string, string> = {};
  for (const field of laboratoryGreenProductQualityMeasurementFields) {
    const value = readMeasurement(row[field.id]);
    if (value === undefined) return undefined;
    values[field.id] = value;
  }
  return {
    measurementNumber: index + 1,
    ...values,
  } as LaboratoryGreenProductQualityMeasurement;
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

/** Поля вагона могут быть пустыми: их заполняет огнеупорный цех при садке. */
function readNullableCalendarDate(value: unknown) {
  if (value === undefined || value === null) return null;
  if (typeof value === "string" && value.trim().length === 0) return null;
  return readCalendarDate(value);
}

function readNullableCount(value: unknown) {
  if (value === undefined || value === null) return null;
  if (typeof value === "string") {
    const normalized = value.trim();
    if (normalized.length === 0) return null;
    return /^\d+$/u.test(normalized) && Number(normalized) <= maxPieceCount
      ? Number(normalized)
      : undefined;
  }
  if (typeof value !== "number" || !Number.isInteger(value)) return undefined;
  return value >= 0 && value <= maxPieceCount ? value : undefined;
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
