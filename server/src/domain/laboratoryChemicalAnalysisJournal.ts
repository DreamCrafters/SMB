import {
  laboratoryChemicalAnalysisFields,
  laboratoryChemicalAnalysisSampleSources,
  laboratoryChemicalAnalysisTotalFieldIds,
  laboratoryChemicalAnalysisTotalLimit,
  laboratoryChemicalAnalysisTotalRuleMessage,
  type LaboratoryChemicalAnalysisJournalSubmission,
  type LaboratoryChemicalAnalysisSampleSource,
  type LaboratoryChemicalAnalysisValues,
} from "../contracts/laboratoryChemicalAnalysisJournal.js";

export type LaboratoryChemicalAnalysisJournalValidation =
  | { ok: true; value: LaboratoryChemicalAnalysisJournalSubmission }
  | { ok: false; errors: string[] };

const maxShortTextLength = 120;
const maxNotesLength = 2_000;

export function validateLaboratoryChemicalAnalysisJournalSubmission(
  input: unknown,
): LaboratoryChemicalAnalysisJournalValidation {
  if (!isRecord(input)) {
    return {
      ok: false,
      errors: ["Передайте данные журнала химических анализов."],
    };
  }

  const errors: string[] = [];
  const sampleSource = readSampleSource(input.sampleSource);
  const sampleId = readText(input.sampleId, maxShortTextLength);
  const values = new Map<keyof LaboratoryChemicalAnalysisValues, string>();

  if (sampleSource === undefined || sampleId === undefined) {
    errors.push("Выберите код лабораторной пробы.");
  }

  for (const field of laboratoryChemicalAnalysisFields) {
    const rawValue = input[field.id];
    const maxLength = field.kind === "notes"
      ? maxNotesLength
      : maxShortTextLength;
    const value = field.kind === "date"
      ? readCalendarDate(rawValue)
      : field.required
        ? readText(rawValue, maxLength)
        : readOptionalText(rawValue, maxLength);

    if (field.required && value === undefined) {
      errors.push(`Проверьте поле «${field.label}».`);
    } else if (
      !field.required &&
      isProvidedValue(rawValue) &&
      value === undefined
    ) {
      errors.push(field.kind === "notes"
        ? `Поле «${field.label}» должно содержать не больше ${maxNotesLength} символов.`
        : `Проверьте поле «${field.label}».`);
    } else if (value !== undefined) {
      values.set(field.id, value);
    }
  }

  const totalIndicators: ChemicalAnalysisPercentage[] = [];
  let hasInvalidTotalIndicator = false;
  for (const fieldId of laboratoryChemicalAnalysisTotalFieldIds) {
    const value = values.get(fieldId);
    if (value === undefined) continue;
    const percentage = readChemicalAnalysisPercentage(value);
    if (percentage === undefined) {
      const field = laboratoryChemicalAnalysisFields.find(
        (item) => item.id === fieldId,
      );
      errors.push(`Проверьте поле «${field?.label ?? fieldId}».`);
      hasInvalidTotalIndicator = true;
      continue;
    }
    totalIndicators.push(percentage);
  }
  if (
    !hasInvalidTotalIndicator &&
    isChemicalAnalysisTotalAboveLimit(
      totalIndicators,
      laboratoryChemicalAnalysisTotalLimit,
    )
  ) {
    errors.push(laboratoryChemicalAnalysisTotalRuleMessage);
  }

  if (
    errors.length > 0 ||
    sampleSource === undefined ||
    sampleId === undefined
  ) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    value: {
      sampleSource,
      sampleId,
      ...(values.has("laboratoryAnalysisNumber")
        ? {
            laboratoryAnalysisNumber:
              values.get("laboratoryAnalysisNumber")!,
          }
        : {}),
      ...(values.has("batchNumber")
        ? { batchNumber: values.get("batchNumber")! }
        : {}),
      ...(values.has("chemicalAnalysisDate")
        ? { chemicalAnalysisDate: values.get("chemicalAnalysisDate")! }
        : {}),
      ...(values.has("chemicalAnalysisLaboratoryAssistant")
        ? {
            chemicalAnalysisLaboratoryAssistant:
              values.get("chemicalAnalysisLaboratoryAssistant")!,
          }
        : {}),
      ...(values.has("al2o3") ? { al2o3: values.get("al2o3")! } : {}),
      ...(values.has("fe2o3") ? { fe2o3: values.get("fe2o3")! } : {}),
      ...(values.has("sio2") ? { sio2: values.get("sio2")! } : {}),
      ...(values.has("cao2") ? { cao2: values.get("cao2")! } : {}),
      ...(values.has("p2o5") ? { p2o5: values.get("p2o5")! } : {}),
      ...(values.has("lossOnIgnition")
        ? { lossOnIgnition: values.get("lossOnIgnition")! }
        : {}),
      ...(values.has("moisture")
        ? { moisture: values.get("moisture")! }
        : {}),
      ...(values.has("notes") ? { notes: values.get("notes")! } : {}),
    },
  };
}

function readSampleSource(
  value: unknown,
): LaboratoryChemicalAnalysisSampleSource | undefined {
  return typeof value === "string" &&
      laboratoryChemicalAnalysisSampleSources.some((source) => source === value)
    ? value as LaboratoryChemicalAnalysisSampleSource
    : undefined;
}

function isProvidedValue(value: unknown) {
  return value !== undefined &&
    value !== null &&
    !(typeof value === "string" && value.trim() === "");
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

type ChemicalAnalysisPercentage = {
  coefficient: bigint;
  scale: number;
};

function readChemicalAnalysisPercentage(
  value: string,
): ChemicalAnalysisPercentage | undefined {
  const match = /^(?:(?:<=?|≤)\s*)?(\d+(?:[.,]\d+)?)\s*%?$/u.exec(value);
  if (match === null) return undefined;
  const [integerPart, fractionalPart = ""] = match[1].split(/[.,]/u);
  return {
    coefficient: BigInt(`${integerPart}${fractionalPart}`),
    scale: fractionalPart.length,
  };
}

function isChemicalAnalysisTotalAboveLimit(
  values: ChemicalAnalysisPercentage[],
  limit: number,
) {
  const commonScale = values.reduce(
    (maximum, value) => Math.max(maximum, value.scale),
    0,
  );
  const total = values.reduce(
    (sum, value) =>
      sum + value.coefficient * 10n ** BigInt(commonScale - value.scale),
    0n,
  );
  const scaledLimit = BigInt(limit) * 10n ** BigInt(commonScale);
  return total > scaledLimit;
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
