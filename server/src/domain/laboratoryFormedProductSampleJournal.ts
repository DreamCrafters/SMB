import { readCalendarDate } from "./calendarDate.js";
import type {
  LaboratoryFormedProductSampleCorrection,
  LaboratoryFormedProductSampleSubmission,
} from "../contracts/laboratoryFormedProductSampleJournal.js";

export type LaboratoryFormedProductSampleValidation =
  | { ok: true; value: LaboratoryFormedProductSampleSubmission }
  | { ok: false; errors: string[] };
export type LaboratoryFormedProductSampleCorrectionValidation =
  | { ok: true; value: LaboratoryFormedProductSampleCorrection }
  | { ok: false; errors: string[] };

const maxShortTextLength = 120;

export function validateLaboratoryFormedProductSampleSubmission(
  input: unknown,
): LaboratoryFormedProductSampleValidation {
  return validateRecord(input);
}

export function validateLaboratoryFormedProductSampleCorrection(
  input: unknown,
): LaboratoryFormedProductSampleCorrectionValidation {
  return validateRecord(input);
}

/**
 * Ровно два взаимоисключающих пути (см. контракт): вагонный — только
 * `wagonNumber`, марка и дата формовки резолвятся сервером из вагона;
 * трансляция из Регистрации проб — `sampleCode` и `productBrand` приходят от
 * клиента, `moldingDate` недоступна. Какое поле прислали, то и определяет
 * путь — `sourceSampleRegistrationId` при исправлении клиент не пересылает
 * (репозиторий сохраняет исходную привязку), поэтому ветвление держится на
 * `wagonNumber`, а не на нём.
 */
function validateRecord(
  input: unknown,
): LaboratoryFormedProductSampleCorrectionValidation {
  if (!isRecord(input)) {
    return {
      ok: false,
      errors: [
        "Передайте данные журнала регистрации проб формованной продукции.",
      ],
    };
  }

  const errors: string[] = [];
  const sortingDate = readCalendarDate(input.sortingDate);
  if (sortingDate === undefined) {
    errors.push("Проверьте поле «Дата сортировки».");
  }

  const wagonNumber = readText(input.wagonNumber, maxShortTextLength);
  if (wagonNumber !== undefined) {
    if (errors.length > 0) return { ok: false, errors };
    return {
      ok: true,
      value: { sortingDate: sortingDate!, wagonNumber },
    };
  }

  const sampleCode = readText(input.sampleCode, maxShortTextLength);
  const productBrand = readText(input.productBrand, maxShortTextLength);
  if (sampleCode === undefined) errors.push("Проверьте поле «Код пробы».");
  if (productBrand === undefined) {
    errors.push("Проверьте поле «Марка изделия».");
  }

  const sourceSampleRegistrationId = readText(
    input.sourceSampleRegistrationId,
    maxShortTextLength,
  );
  if (
    !isMissingOptionalText(input.sourceSampleRegistrationId) &&
    sourceSampleRegistrationId === undefined
  ) {
    errors.push("Проверьте выбранную пробу для трансляции.");
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    value: {
      sortingDate: sortingDate!,
      sampleCode: sampleCode!,
      productBrand: productBrand!,
      ...(sourceSampleRegistrationId === undefined
        ? {}
        : { sourceSampleRegistrationId }),
    },
  };
}

function isMissingOptionalText(value: unknown) {
  return value === undefined || value === null ||
    (typeof value === "string" && value.trim() === "");
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
