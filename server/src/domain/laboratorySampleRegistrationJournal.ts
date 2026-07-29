import {
  laboratorySampleRegistrationJournalFields,
  type LaboratorySampleRegistrationJournalSubmission,
} from "../contracts/laboratorySampleRegistrationJournal.js";

export type LaboratorySampleRegistrationJournalValidation =
  | { ok: true; value: LaboratorySampleRegistrationJournalSubmission }
  | { ok: false; errors: string[] };

const maxShortTextLength = 120;
const maxNotesLength = 2_000;

export function validateLaboratorySampleRegistrationJournalSubmission(
  input: unknown,
): LaboratorySampleRegistrationJournalValidation {
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

  for (const field of laboratorySampleRegistrationJournalFields) {
    const value = field.kind === "date"
      ? readCalendarDate(input[field.id])
      : readText(input[field.id], maxShortTextLength);
    if (value === undefined) {
      errors.push(`Проверьте поле «${field.label}».`);
    } else {
      values.set(field.id, value);
    }
  }

  const notes = readOptionalText(input.notes, maxNotesLength);
  if (input.notes !== undefined && input.notes !== null && notes === undefined) {
    errors.push(`Примечания должны содержать не больше ${maxNotesLength} символов.`);
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
      al2o3: values.get("al2o3")!,
      fe2o3: values.get("fe2o3")!,
      sio2: values.get("sio2")!,
      cao2: values.get("cao2")!,
      p2o5: values.get("p2o5")!,
      lossOnIgnition: values.get("lossOnIgnition")!,
      moisture: values.get("moisture")!,
      chemicalAnalysisDate: values.get("chemicalAnalysisDate")!,
      chemicalAnalysisLaboratoryAssistant:
        values.get("chemicalAnalysisLaboratoryAssistant")!,
      batchNumber: values.get("batchNumber")!,
      ...(notes === undefined ? {} : { notes }),
    },
  };
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
