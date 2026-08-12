import {
  laboratoryFormedProductSampleFields,
  type LaboratoryFormedProductSampleCorrection,
  type LaboratoryFormedProductSampleSubmission,
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
  const values = new Map<
    keyof LaboratoryFormedProductSampleCorrection,
    string
  >();

  for (const field of laboratoryFormedProductSampleFields) {
    const value = field.kind === "date"
      ? readCalendarDate(input[field.id])
      : readText(input[field.id], maxShortTextLength);
    if (value === undefined) {
      errors.push(`Проверьте поле «${field.label}».`);
    } else {
      values.set(field.id, value);
    }
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
      sortingDate: values.get("sortingDate")!,
      sampleCode: values.get("sampleCode")!,
      productBrand: values.get("productBrand")!,
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
