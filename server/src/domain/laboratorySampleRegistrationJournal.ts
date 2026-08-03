import {
  laboratorySampleRegistrationFields,
  type LaboratorySampleRegistrationCorrection,
  type LaboratorySampleRegistrationJournalSubmission,
} from "../contracts/laboratorySampleRegistrationJournal.js";

export type LaboratorySampleRegistrationJournalValidation =
  | { ok: true; value: LaboratorySampleRegistrationJournalSubmission }
  | { ok: false; errors: string[] };
export type LaboratorySampleRegistrationCorrectionValidation =
  | { ok: true; value: LaboratorySampleRegistrationCorrection }
  | { ok: false; errors: string[] };

const maxShortTextLength = 120;

export function validateLaboratorySampleRegistrationJournalSubmission(
  input: unknown,
): LaboratorySampleRegistrationJournalValidation {
  return validateLaboratorySampleRegistrationRecord(input);
}

export function validateLaboratorySampleRegistrationCorrection(
  input: unknown,
): LaboratorySampleRegistrationCorrectionValidation {
  return validateLaboratorySampleRegistrationRecord(input);
}

function validateLaboratorySampleRegistrationRecord(
  input: unknown,
): LaboratorySampleRegistrationCorrectionValidation {
  if (!isRecord(input)) {
    return {
      ok: false,
      errors: ["Передайте данные журнала регистрации отбора проб."],
    };
  }

  const errors: string[] = [];
  const values = new Map<
    keyof LaboratorySampleRegistrationJournalSubmission,
    string
  >();

  for (const field of laboratorySampleRegistrationFields) {
    if (field.id === "waterAbsorption") continue;
    const value = field.kind === "date"
      ? readCalendarDate(input[field.id])
      : readText(input[field.id], maxShortTextLength);
    if (value === undefined) {
      errors.push(`Проверьте поле «${field.label}».`);
    } else {
      values.set(field.id, value);
    }
  }

  const waterAbsorption = readText(
    input.waterAbsorption,
    maxShortTextLength,
  );
  if (!isMissingOptionalText(input.waterAbsorption) &&
    waterAbsorption === undefined) {
    errors.push("Проверьте поле «Водопоглощение».");
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    value: {
      sampleNumber: values.get("sampleNumber")!,
      laboratorySampleCode: values.get("laboratorySampleCode")!,
      samplingDate: values.get("samplingDate")!,
      samplingLaboratoryAssistant:
        values.get("samplingLaboratoryAssistant")!,
      sampleName: values.get("sampleName")!,
      registrationDate: values.get("registrationDate")!,
      samplingLocation: values.get("samplingLocation")!,
      ...(waterAbsorption === undefined ? {} : { waterAbsorption }),
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
