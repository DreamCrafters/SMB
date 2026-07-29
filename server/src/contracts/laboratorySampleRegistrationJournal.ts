export type LaboratorySampleRegistrationJournalSubmission = {
  sampleNumber: string;
  laboratorySampleCode: string;
  samplingDate: string;
  samplingLaboratoryAssistant: string;
  sampleName: string;
  registrationDate: string;
  samplingLocation: string;
  al2o3: string;
  fe2o3: string;
  sio2: string;
  cao2: string;
  p2o5: string;
  lossOnIgnition: string;
  moisture: string;
  chemicalAnalysisDate: string;
  chemicalAnalysisLaboratoryAssistant: string;
  batchNumber: string;
  notes?: string;
};

export const laboratorySampleRegistrationJournalFields = [
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
  { id: "al2o3", label: "Al2O3", section: "analysis", kind: "indicator" },
  { id: "fe2o3", label: "Fe2O3", section: "analysis", kind: "indicator" },
  { id: "sio2", label: "SiO2", section: "analysis", kind: "indicator" },
  { id: "cao2", label: "CaO2", section: "analysis", kind: "indicator" },
  { id: "p2o5", label: "P2O5", section: "analysis", kind: "indicator" },
  {
    id: "lossOnIgnition",
    label: "ппп",
    section: "analysis",
    kind: "indicator",
  },
  {
    id: "moisture",
    label: "Влажность",
    section: "analysis",
    kind: "indicator",
  },
  {
    id: "chemicalAnalysisDate",
    label: "Дата хим. анализа",
    section: "analysis",
    kind: "date",
  },
  {
    id: "chemicalAnalysisLaboratoryAssistant",
    label: "Лаборант (химический анализ)",
    section: "analysis",
    kind: "text",
  },
  {
    id: "batchNumber",
    label: "Номер партии",
    section: "analysis",
    kind: "text",
  },
] as const satisfies readonly {
  id: Exclude<keyof LaboratorySampleRegistrationJournalSubmission, "notes">;
  label: string;
  section: "registration" | "analysis";
  kind: "text" | "date" | "indicator";
}[];

export type LaboratorySampleRegistrationJournalRecord =
  LaboratorySampleRegistrationJournalSubmission & {
    id: string;
    createdAt: string;
  };

export type LaboratorySampleRegistrationJournalFilters = {
  dateFrom?: string;
  dateTo?: string;
  query?: string;
};
