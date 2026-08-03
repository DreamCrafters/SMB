import type { LaboratoryChemicalAnalysisValues } from "./laboratoryChemicalAnalysisJournal.js";

export type LaboratorySampleRegistrationJournalSubmission = {
  sampleNumber: string;
  laboratorySampleCode: string;
  samplingDate: string;
  samplingLaboratoryAssistant: string;
  sampleName: string;
  registrationDate: string;
  samplingLocation: string;
  waterAbsorption: string;
};

export type LaboratorySampleRegistrationCorrection =
  Omit<LaboratorySampleRegistrationJournalSubmission, "waterAbsorption"> &
  Partial<
    Pick<LaboratorySampleRegistrationJournalSubmission, "waterAbsorption">
  >;

export type LaboratorySampleRegistrationDraft = Pick<
  LaboratorySampleRegistrationJournalSubmission,
  "sampleNumber" | "laboratorySampleCode"
>;

export function buildLaboratorySampleCodeDraft(sampleNumber: string) {
  const numericValue = sampleNumber.match(/\d+/u)?.[0] ?? "";
  return numericValue === "" ? "" : `.${numericValue}`;
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
] as const satisfies readonly {
  id: keyof LaboratorySampleRegistrationJournalSubmission;
  label: string;
  section: "registration";
  kind: "text" | "date";
}[];

export type LaboratorySampleRegistrationJournalRecord =
  Omit<LaboratorySampleRegistrationJournalSubmission, "waterAbsorption"> &
  Partial<Pick<LaboratorySampleRegistrationJournalSubmission, "waterAbsorption">> &
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
