import type { LaboratoryChemicalAnalysisValues } from "./laboratoryChemicalAnalysisJournal.js";

/**
 * Задача 79: цель `formed_product_sample` убрана — этот журнал больше не
 * привязан к пробе из Регистрации проб, марка и дата формовки подтягиваются
 * из Журнала вагонов по номеру вагона и дате сортировки.
 */
export const laboratorySampleRegistrationTransmissionTargets = [
  {
    value: "unshaped_product_sample",
    label: "Регистрация проб готовой неформованной продукции",
  },
  {
    value: "verification",
    label: "Верификации",
  },
] as const;

export type LaboratorySampleRegistrationTransmissionTarget =
  (typeof laboratorySampleRegistrationTransmissionTargets)[number]["value"];

export const laboratorySampleRegistrationTransmissionTargetLabels = Object
  .fromEntries(
    laboratorySampleRegistrationTransmissionTargets.map(
      ({ value, label }) => [value, label],
    ),
  ) as Record<LaboratorySampleRegistrationTransmissionTarget, string>;

export type LaboratorySampleRegistrationJournalSubmission = {
  sampleNumber: string;
  laboratorySampleCode: string;
  samplingDate: string;
  samplingLaboratoryAssistant: string;
  sampleName: string;
  registrationDate: string;
  samplingLocation: string;
  waterAbsorption?: string;
  transmitToJournal?: LaboratorySampleRegistrationTransmissionTarget;
};

export type LaboratorySampleRegistrationCorrection =
  LaboratorySampleRegistrationJournalSubmission;

export type LaboratorySampleRegistrationDraft = Pick<
  LaboratorySampleRegistrationJournalSubmission,
  "sampleNumber" | "laboratorySampleCode"
> & { currentYear: number };

export function buildLaboratorySampleCodeDraft(
  sampleNumber: string,
  currentYear: number,
) {
  const numericValue = sampleNumber.match(/\d+/u)?.[0] ?? "";
  const shortYear = String(currentYear).padStart(4, "0").slice(-2);
  return numericValue === "" ? "" : `${shortYear}.${numericValue}`;
}

export const laboratorySampleRegistrationSamplingLocations = [
  "склад сырья",
  "материальный склад",
  "склад готовой продукции",
  "ОЦ сортировка",
  "ОЦ формовка",
  "ОЦ затарка",
  "ЦОШ",
  "ЦОШ затарка",
  "ЦОМ",
  "ЦПКУ",
] as const;

export const laboratorySampleRegistrationFields = [
  {
    id: "sampleNumber",
    label: "№ пробы",
    section: "registration",
    kind: "text",
  },
  {
    id: "laboratorySampleCode",
    label: "Код лабораторной пробы",
    section: "registration",
    kind: "text",
  },
  {
    id: "samplingDate",
    label: "Дата отбора",
    section: "registration",
    kind: "date",
  },
  {
    id: "samplingLaboratoryAssistant",
    label: "Лаборант (отбор проб)",
    section: "registration",
    kind: "text",
  },
  {
    id: "sampleName",
    label: "Наименование пробы",
    section: "registration",
    kind: "text",
  },
  {
    id: "registrationDate",
    label: "Дата регистрации",
    section: "registration",
    kind: "date",
  },
  {
    id: "samplingLocation",
    label: "Место отбора пробы",
    section: "registration",
    kind: "text",
  },
  {
    id: "waterAbsorption",
    label: "Водопоглощение",
    section: "registration",
    kind: "text",
  },
  {
    id: "transmitToJournal",
    label: "Трансляция в журнал",
    section: "registration",
    kind: "select",
  },
] as const satisfies readonly {
  id: keyof LaboratorySampleRegistrationJournalSubmission;
  label: string;
  section: "registration";
  kind: "text" | "date" | "select";
}[];

export type LaboratorySampleRegistrationTransmissionOption = {
  id: string;
  laboratorySampleCode: string;
  sampleNumber: string;
  sampleName: string;
  samplingDate: string;
  samplingLaboratoryAssistant: string;
  samplingLocation: string;
  registrationDate: string;
};

export type LaboratorySampleRegistrationJournalRecord =
  LaboratorySampleRegistrationJournalSubmission &
  Partial<LaboratoryChemicalAnalysisValues> & {
    id: string;
    createdAt: string;
  };

export type LaboratorySampleRegistrationJournalFilters = {
  dateFrom?: string;
  dateTo?: string;
  query?: string;
  /** Substring match across the sample nomenclature only. */
  nameQuery?: string;
};
