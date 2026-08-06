import type { RotaryKiln2FiringJournalSubmission } from "../contracts/rotaryKiln2FiringJournal.js";

export type RotaryKiln2FiringJournalValidation =
  | { ok: true; value: RotaryKiln2FiringJournalSubmission }
  | { ok: false; errors: string[] };

const maxShortTextLength = 120;
const maxNoteLength = 2_000;
const maxDecimalMagnitude = 999_999_999.9999;

const numericFields = [
  ["waterAbsorption", "Водопоглощение"],
  ["temperatureBeforeCyclone", "t перед циклоном"],
  ["temperatureBeforeFilter", "t перед фильтром"],
  ["temperatureInFieldChamber", "t в полевой камере"],
  ["temperatureAtRollback", "t на откатной"],
  ["gasConsumptionPerHour", "Расход газа в час"],
  ["vacuum", "Разряжение"],
  ["pressure", "Давление"],
  ["sievePass05", "Проход ч/з сито 0,5"],
  ["bulkDensity", "Насыпной вес"],
  ["kilnLoadBucketsPerHour", "Загрузка печи в ковшах в час"],
] as const satisfies readonly [
  keyof RotaryKiln2FiringJournalSubmission,
  string,
][];
const optionalNumericFields = new Set<
  keyof RotaryKiln2FiringJournalSubmission
>([
  "temperatureInFieldChamber",
  "sievePass05",
  "kilnLoadBucketsPerHour",
]);

export function validateRotaryKiln2FiringJournalSubmission(
  input: unknown,
): RotaryKiln2FiringJournalValidation {
  if (!isRecord(input)) {
    return {
      ok: false,
      errors: ["Передайте данные журнала параметров обжига."],
    };
  }

  const errors: string[] = [];
  const recordDate = readCalendarDate(input.recordDate);
  const recordTime = readTime(input.recordTime);
  const producedMaterial = readText(input.producedMaterial, maxShortTextLength);
  const shiftSupervisor = readText(input.shiftSupervisor, maxShortTextLength);
  const burnerOperator = readText(input.burnerOperator, maxShortTextLength);
  const laboratoryAssistant = readText(
    input.laboratoryAssistant,
    maxShortTextLength,
  );
  const note = readOptionalText(input.note, maxNoteLength);
  const numericValues = new Map<
    keyof RotaryKiln2FiringJournalSubmission,
    number
  >();

  if (recordDate === undefined) {
    errors.push("Укажите корректную дату.");
  }
  if (recordTime === undefined) {
    errors.push("Укажите корректное время.");
  }
  if (producedMaterial === undefined) {
    errors.push("Укажите производимый материал.");
  }
  validateNumericFields(input, numericFields.slice(0, 8), errors, numericValues);
  if (shiftSupervisor === undefined) {
    errors.push("Укажите мастера смены.");
  }
  if (burnerOperator === undefined) {
    errors.push("Укажите обжигальщика.");
  }
  if (laboratoryAssistant === undefined) {
    errors.push("Укажите лаборанта.");
  }
  validateNumericFields(input, numericFields.slice(8), errors, numericValues);
  if (input.note !== undefined && input.note !== null && note === undefined) {
    errors.push(`Примечание должно содержать не больше ${maxNoteLength} символов.`);
  }

  if (
    errors.length > 0 ||
    recordDate === undefined ||
    recordTime === undefined ||
    producedMaterial === undefined ||
    shiftSupervisor === undefined ||
    burnerOperator === undefined ||
    laboratoryAssistant === undefined
  ) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    value: {
      recordDate,
      recordTime,
      producedMaterial,
      waterAbsorption: numericValues.get("waterAbsorption")!,
      temperatureBeforeCyclone: numericValues.get("temperatureBeforeCyclone")!,
      temperatureBeforeFilter: numericValues.get("temperatureBeforeFilter")!,
      ...(numericValues.has("temperatureInFieldChamber")
        ? {
            temperatureInFieldChamber:
              numericValues.get("temperatureInFieldChamber")!,
          }
        : {}),
      temperatureAtRollback: numericValues.get("temperatureAtRollback")!,
      gasConsumptionPerHour: numericValues.get("gasConsumptionPerHour")!,
      vacuum: numericValues.get("vacuum")!,
      pressure: numericValues.get("pressure")!,
      shiftSupervisor,
      burnerOperator,
      laboratoryAssistant,
      ...(numericValues.has("sievePass05")
        ? { sievePass05: numericValues.get("sievePass05")! }
        : {}),
      bulkDensity: numericValues.get("bulkDensity")!,
      ...(numericValues.has("kilnLoadBucketsPerHour")
        ? {
            kilnLoadBucketsPerHour:
              numericValues.get("kilnLoadBucketsPerHour")!,
          }
        : {}),
      ...(note === undefined ? {} : { note }),
    },
  };
}

function validateNumericFields(
  input: Record<string, unknown>,
  fields: readonly (
    readonly [keyof RotaryKiln2FiringJournalSubmission, string]
  )[],
  errors: string[],
  values: Map<keyof RotaryKiln2FiringJournalSubmission, number>,
) {
  for (const [field, label] of fields) {
    const inputValue = input[field];
    if (
      optionalNumericFields.has(field) &&
      isMissingOptionalDecimal(inputValue)
    ) {
      continue;
    }
    const value = readDecimal(inputValue);
    if (value === undefined) {
      errors.push(`Проверьте поле «${label}».`);
    } else {
      values.set(field, value);
    }
  }
}

function isMissingOptionalDecimal(value: unknown) {
  return value === undefined || value === null || value === "";
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

function readTime(value: unknown) {
  return typeof value === "string" &&
      /^(?:[01]\d|2[0-3]):[0-5]\d$/u.test(value)
    ? value
    : undefined;
}

function readDecimal(value: unknown) {
  return typeof value === "number" &&
      Number.isFinite(value) &&
      Math.abs(value) <= maxDecimalMagnitude
    ? value
    : undefined;
}

function readOptionalText(value: unknown, maxLength: number) {
  if (value === undefined || value === null || value === "") return undefined;
  return readText(value, maxLength);
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
