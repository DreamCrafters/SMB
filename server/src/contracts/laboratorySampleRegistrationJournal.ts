import type { LaboratoryChemicalAnalysisValues } from "./laboratoryChemicalAnalysisJournal.js";

export type LaboratorySampleRegistrationJournalSubmission = {
  sampleNumber: string;
  laboratorySampleCode: string;
  samplingDate: string;
  samplingLaboratoryAssistant: string;
  sampleName: string;
  registrationDate: string;
  samplingLocation: string;
};

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
] as const satisfies readonly {
  id: keyof LaboratorySampleRegistrationJournalSubmission;
  label: string;
  section: "registration";
  kind: "text" | "date";
}[];

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
