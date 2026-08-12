import {
  laboratoryVerificationFields,
  type LaboratoryVerificationCorrection,
  type LaboratoryVerificationSubmission,
} from "../contracts/laboratoryVerificationJournal.js";

export type LaboratoryVerificationValidation =
  | { ok: true; value: LaboratoryVerificationSubmission }
  | { ok: false; errors: string[] };
export type LaboratoryVerificationCorrectionValidation =
  | { ok: true; value: LaboratoryVerificationCorrection }
  | { ok: false; errors: string[] };

const maxShortTextLength = 120;

export function validateLaboratoryVerificationSubmission(
  input: unknown,
): LaboratoryVerificationValidation {
  return validateRecord(input);
}

export function validateLaboratoryVerificationCorrection(
  input: unknown,
): LaboratoryVerificationCorrectionValidation {
  return validateRecord(input);
}

function validateRecord(
  input: unknown,
): LaboratoryVerificationCorrectionValidation {
  if (!isRecord(input)) {
    return { ok: false, errors: ["Передайте данные журнала верификаций."] };
  }

  const errors: string[] = [];
  const values = new Map<keyof LaboratoryVerificationCorrection, string>();

  for (const field of laboratoryVerificationFields) {
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
      verificationDate: values.get("verificationDate")!,
      productName: values.get("productName")!,
      samplingLocation: values.get("samplingLocation")!,
      sampleCode: values.get("sampleCode")!,
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
