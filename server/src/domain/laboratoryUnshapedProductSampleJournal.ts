import type {
  LaboratoryUnshapedProductSampleCorrection,
  LaboratoryUnshapedProductSampleSubmission,
} from "../contracts/laboratoryUnshapedProductSampleJournal.js";
import {
  laboratoryUnshapedProductSampleFields,
  laboratoryUnshapedProductSampleSuitabilityValues,
} from "../contracts/laboratoryUnshapedProductSampleJournal.js";

export type LaboratoryUnshapedProductSampleValidation =
  | { ok: true; value: LaboratoryUnshapedProductSampleSubmission }
  | { ok: false; errors: string[] };

const maxShortTextLength = 120;
const maxNotesLength = 2_000;

export function validateLaboratoryUnshapedProductSampleSubmission(
  input: unknown,
): LaboratoryUnshapedProductSampleValidation {
  return validateRecord(input);
}

export function validateLaboratoryUnshapedProductSampleCorrection(
  input: unknown,
): LaboratoryUnshapedProductSampleValidation {
  return validateRecord(input);
}

function validateRecord(input: unknown): LaboratoryUnshapedProductSampleValidation {
  if (!isRecord(input)) {
    return {
      ok: false,
      errors: ["Передайте данные журнала проб неформованной продукции."],
    };
  }

  const errors: string[] = [];
  const values = new Map<keyof LaboratoryUnshapedProductSampleCorrection, string>();

  for (const field of laboratoryUnshapedProductSampleFields) {
    if (!field.editable || field.id === "notes" || field.id === "suitability") {
      continue;
    }
    const value = field.kind === "date"
      ? readCalendarDate(input[field.id])
      : readText(input[field.id], maxShortTextLength);
    if (value === undefined) errors.push(`Проверьте поле «${field.label}».`);
    else values.set(field.id, value);
  }

  const suitability = typeof input.suitability === "string" &&
      laboratoryUnshapedProductSampleSuitabilityValues.includes(
        input.suitability as (typeof laboratoryUnshapedProductSampleSuitabilityValues)[number],
      )
    ? input.suitability as LaboratoryUnshapedProductSampleSubmission["suitability"]
    : undefined;
  if (suitability === undefined) {
    errors.push("Проверьте поле «Пригодность».");
  }

  const notes = readText(input.notes, maxNotesLength);
  if (!isMissingOptionalText(input.notes) && notes === undefined) {
    errors.push("Проверьте поле «Примечание».");
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

  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: {
      sampleNumber: values.get("sampleNumber")!,
      sampleDate: values.get("sampleDate")!,
      sampledBy: values.get("sampledBy")!,
      batchNumber: values.get("batchNumber")!,
      sampleCode: values.get("sampleCode")!,
      productName: values.get("productName")!,
      batchMass: values.get("batchMass")!,
      moisture: values.get("moisture")!,
      grainComposition: values.get("grainComposition")!,
      fireResistance: values.get("fireResistance")!,
      suitability: suitability!,
      ...(notes === undefined ? {} : { notes }),
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
