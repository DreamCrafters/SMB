import {
  laboratoryRawMaterialQualityBallMillValues,
  laboratoryRawMaterialQualityDisintegratorValues,
  laboratoryRawMaterialQualityRecommendationRecipientValues,
  laboratoryRawMaterialQualityShiftValues,
  laboratoryRawMaterialQualitySixSlotValues,
  type LaboratoryClayMeasurementRow,
  type LaboratoryRawMaterialQualitySubmission,
  type LaboratoryRunnerMeasurementRow,
  type LaboratorySlipMeasurementRow,
  type LaboratoryTemperMeasurementRow,
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

  const recordDate = readCalendarDate(input.recordDate);
  if (recordDate === undefined) errors.push("Проверьте поле «Дата».");
  const laboratoryAssistant = readText(input.laboratoryAssistant, maxShortTextLength);
  if (laboratoryAssistant === undefined) errors.push("Проверьте поле «Лаборант».");
  const shiftSupervisor = readText(input.shiftSupervisor, maxShortTextLength);
  if (shiftSupervisor === undefined) errors.push("Проверьте поле «Мастер смены».");
  const shift = readOption(input.shift, laboratoryRawMaterialQualityShiftValues);
  if (shift === undefined) errors.push("Проверьте поле «Смена».");

  const clayMeasurements = readMeasurementArray(
    input.clayMeasurements,
    mapClayMeasurementRow,
  );
  if (clayMeasurements === undefined) {
    errors.push("Проверьте таблицу «Контроль качества глины».");
  }
  const temperMeasurements = readMeasurementArray(
    input.temperMeasurements,
    mapTemperMeasurementRow,
  );
  if (temperMeasurements === undefined) {
    errors.push("Проверьте таблицу «Отощитель».");
  }
  const slipMeasurements = readMeasurementArray(
    input.slipMeasurements,
    mapSlipMeasurementRow,
  );
  if (slipMeasurements === undefined) {
    errors.push("Проверьте таблицу «Шликер».");
  }
  const runnerMeasurements = readMeasurementArray(
    input.runnerMeasurements,
    mapRunnerMeasurementRow,
  );
  if (runnerMeasurements === undefined) {
    errors.push("Проверьте таблицу «Бегуны».");
  }

  const elutriationCoefficient = readNullableText(
    input.elutriationCoefficient,
    maxShortTextLength,
  );
  if (elutriationCoefficient === undefined) {
    errors.push("Проверьте поле «Коэффициент отмучивания».");
  }
  const recommendationRecipient = readNullableOption(
    input.recommendationRecipient,
    laboratoryRawMaterialQualityRecommendationRecipientValues,
  );
  if (recommendationRecipient === undefined) {
    errors.push("Проверьте поле «Адрес рекомендации».");
  }
  const recommendationText = readNullableText(
    input.recommendationText,
    maxRecommendationLength,
  );
  if (recommendationText === undefined) {
    errors.push("Проверьте поле «Текст рекомендации».");
  }

  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: {
      recordDate: recordDate!,
      laboratoryAssistant: laboratoryAssistant!,
      shiftSupervisor: shiftSupervisor!,
      shift: shift!,
      clayMeasurements: clayMeasurements!,
      temperMeasurements: temperMeasurements!,
      slipMeasurements: slipMeasurements!,
      runnerMeasurements: runnerMeasurements!,
      elutriationCoefficient: elutriationCoefficient!,
      recommendationRecipient: recommendationRecipient!,
      recommendationText: recommendationText!,
    },
  };
}

function mapClayMeasurementRow(
  row: unknown,
  index: number,
): LaboratoryClayMeasurementRow | undefined {
  if (!isRecord(row)) return undefined;
  const clayBrand = readNullableText(row.clayBrand, maxShortTextLength);
  const disintegratorNumber = readNullableOption(
    row.disintegratorNumber,
    laboratoryRawMaterialQualityDisintegratorValues,
  );
  const moisture = readNullableText(row.moisture, maxShortTextLength);
  const sieveResidue3 = readNullableText(row.sieveResidue3, maxShortTextLength);
  const sievePass05 = readNullableText(row.sievePass05, maxShortTextLength);
  if (
    clayBrand === undefined ||
    disintegratorNumber === undefined ||
    moisture === undefined ||
    sieveResidue3 === undefined ||
    sievePass05 === undefined
  ) {
    return undefined;
  }
  return {
    measurementNumber: index + 1,
    clayBrand,
    disintegratorNumber,
    moisture,
    sieveResidue3,
    sievePass05,
  };
}

function mapTemperMeasurementRow(
  row: unknown,
  index: number,
): LaboratoryTemperMeasurementRow | undefined {
  if (!isRecord(row)) return undefined;
  const temperBrand = readNullableText(row.temperBrand, maxShortTextLength);
  const ballMillNumber = readNullableOption(
    row.ballMillNumber,
    laboratoryRawMaterialQualityBallMillValues,
  );
  const sieveResidue3 = readNullableText(row.sieveResidue3, maxShortTextLength);
  const sieveResidue2 = readNullableText(row.sieveResidue2, maxShortTextLength);
  const sieveResidue1 = readNullableText(row.sieveResidue1, maxShortTextLength);
  const sievePass05 = readNullableText(row.sievePass05, maxShortTextLength);
  if (
    temperBrand === undefined ||
    ballMillNumber === undefined ||
    sieveResidue3 === undefined ||
    sieveResidue2 === undefined ||
    sieveResidue1 === undefined ||
    sievePass05 === undefined
  ) {
    return undefined;
  }
  return {
    measurementNumber: index + 1,
    temperBrand,
    ballMillNumber,
    sieveResidue3,
    sieveResidue2,
    sieveResidue1,
    sievePass05,
  };
}

function mapSlipMeasurementRow(
  row: unknown,
  index: number,
): LaboratorySlipMeasurementRow | undefined {
  if (!isRecord(row)) return undefined;
  const mixerNumber = readNullableOption(
    row.mixerNumber,
    laboratoryRawMaterialQualitySixSlotValues,
  );
  const temperature = readNullableText(row.temperature, maxShortTextLength);
  const density = readNullableText(row.density, maxShortTextLength);
  if (mixerNumber === undefined || temperature === undefined || density === undefined) {
    return undefined;
  }
  return { measurementNumber: index + 1, mixerNumber, temperature, density };
}

function mapRunnerMeasurementRow(
  row: unknown,
): LaboratoryRunnerMeasurementRow | undefined {
  if (!isRecord(row)) return undefined;
  const runnerNumber = readNullableOption(
    row.runnerNumber,
    laboratoryRawMaterialQualitySixSlotValues,
  );
  const chamottePercentage = readNullableText(row.chamottePercentage, maxShortTextLength);
  const clayPercentage = readNullableText(row.clayPercentage, maxShortTextLength);
  const residue0063 = readNullableText(row.residue0063, maxShortTextLength);
  const moisture = readNullableText(row.moisture, maxShortTextLength);
  if (
    runnerNumber === undefined ||
    chamottePercentage === undefined ||
    clayPercentage === undefined ||
    residue0063 === undefined ||
    moisture === undefined
  ) {
    return undefined;
  }
  return {
    runnerNumber,
    chamottePercentage,
    clayPercentage,
    residue0063,
    moisture,
    isReserve: typeof row.isReserve === "boolean" ? row.isReserve : true,
  };
}

function readMeasurementArray<T>(
  value: unknown,
  mapRow: (row: unknown, index: number) => T | undefined,
): T[] | undefined {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return undefined;
  const rows: T[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const row = mapRow(value[index], index);
    if (row === undefined) return undefined;
    rows.push(row);
  }
  return rows;
}

function readOption<const Value extends string>(
  value: unknown,
  allowed: readonly Value[],
): Value | undefined {
  return typeof value === "string" && allowed.includes(value as Value)
    ? value as Value
    : undefined;
}

function readNullableOption<const Value extends string>(
  value: unknown,
  allowed: readonly Value[],
): Value | null | undefined {
  if (value === undefined || value === null) return null;
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

function readNullableText(value: unknown, maxLength: number) {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().replace(/\s+/gu, " ");
  if (normalized.length === 0) return null;
  return normalized.length <= maxLength ? normalized : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
