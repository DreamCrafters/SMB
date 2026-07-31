export type LaboratoryChemicalAnalysisValues = {
  batchNumber: string;
  chemicalAnalysisDate?: string;
  chemicalAnalysisLaboratoryAssistant?: string;
  al2o3?: string;
  fe2o3?: string;
  sio2?: string;
  cao2?: string;
  p2o5?: string;
  lossOnIgnition?: string;
  moisture?: string;
  notes?: string;
};

export const laboratoryChemicalAnalysisFields = [
  {
    id: "chemicalAnalysisDate",
    label: "Дата хим. анализа",
    kind: "date",
    required: false,
  },
  {
    id: "chemicalAnalysisLaboratoryAssistant",
    label: "Лаборант",
    kind: "text",
    required: false,
  },
  {
    id: "batchNumber",
    label: "Номер партии",
    kind: "text",
    required: true,
  },
  {
    id: "al2o3",
    label: "Al2O3",
    kind: "indicator",
    required: false,
  },
  {
    id: "fe2o3",
    label: "Fe2O3",
    kind: "indicator",
    required: false,
  },
  {
    id: "sio2",
    label: "SiO2",
    kind: "indicator",
    required: false,
  },
  {
    id: "cao2",
    label: "CaO2",
    kind: "indicator",
    required: false,
  },
  {
    id: "p2o5",
    label: "P2O5",
    kind: "indicator",
    required: false,
  },
  {
    id: "lossOnIgnition",
    label: "ппп",
    kind: "indicator",
    required: false,
  },
  {
    id: "moisture",
    label: "Влажность",
    kind: "indicator",
    required: false,
  },
  {
    id: "notes",
    label: "Примечания",
    kind: "notes",
    required: false,
  },
] as const satisfies readonly {
  id: keyof LaboratoryChemicalAnalysisValues;
  label: string;
  kind: "text" | "date" | "indicator" | "notes";
  required: boolean;
}[];

export type LaboratoryChemicalAnalysisJournalSubmission = {
  sampleRegistrationId: string;
} & LaboratoryChemicalAnalysisValues;

export type LaboratoryChemicalAnalysisJournalRecord =
  LaboratoryChemicalAnalysisJournalSubmission & {
    id: string;
    laboratorySampleCode: string;
    sampleNumber: string;
    sampleName: string;
    createdAt: string;
  };

export type LaboratorySampleRegistrationOption = {
  id: string;
  laboratorySampleCode: string;
  sampleNumber: string;
  sampleName: string;
  samplingDate: string;
  registrationDate: string;
};

export type LaboratoryChemicalAnalysisJournalFilters = {
  dateFrom?: string;
  dateTo?: string;
  query?: string;
  sampleQuery?: string;
  /** Substring match across the sample nomenclature only. */
  nameQuery?: string;
};

export type LaboratoryChemicalAnalysisJournalSelection = {
  records: LaboratoryChemicalAnalysisJournalRecord[];
  sampleOptions: LaboratorySampleRegistrationOption[];
};
