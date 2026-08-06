export type LaboratoryChemicalAnalysisValues = {
  laboratoryAnalysisNumber?: string;
  batchNumber?: string;
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
    id: "laboratoryAnalysisNumber",
    label: "Номер лабораторного анализа",
    kind: "text",
    required: false,
  },
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
    required: false,
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

export const laboratoryChemicalAnalysisTotalFieldIds = [
  "al2o3",
  "fe2o3",
  "sio2",
  "cao2",
  "p2o5",
  "lossOnIgnition",
] as const satisfies readonly (keyof LaboratoryChemicalAnalysisValues)[];

export const laboratoryChemicalAnalysisTotalLimit = 100;

const laboratoryChemicalAnalysisTotalFieldLabels =
  laboratoryChemicalAnalysisTotalFieldIds.map((fieldId) =>
    laboratoryChemicalAnalysisFields.find((field) => field.id === fieldId)!.label
  );

export const laboratoryChemicalAnalysisTotalRuleMessage =
  `Сумма полей «${laboratoryChemicalAnalysisTotalFieldLabels.slice(0, -1).join("», «")}» и «${laboratoryChemicalAnalysisTotalFieldLabels.at(-1)}» не может быть больше ${laboratoryChemicalAnalysisTotalLimit}.`;

export const laboratoryChemicalAnalysisSampleSources = [
  "sample_registration",
  "unshaped_product",
] as const;

export type LaboratoryChemicalAnalysisSampleSource =
  typeof laboratoryChemicalAnalysisSampleSources[number];

export type LaboratoryChemicalAnalysisSampleReference = {
  sampleSource: LaboratoryChemicalAnalysisSampleSource;
  sampleId: string;
};

export type LaboratoryChemicalAnalysisJournalSubmission =
  LaboratoryChemicalAnalysisSampleReference & LaboratoryChemicalAnalysisValues;

export type LaboratoryChemicalAnalysisDraft = Required<Pick<
  LaboratoryChemicalAnalysisValues,
  "laboratoryAnalysisNumber"
>>;

export type LaboratoryChemicalAnalysisSampleOption =
  LaboratoryChemicalAnalysisSampleReference & {
    laboratorySampleCode: string;
    sampleNumber: string;
    sampleName: string;
    sampleDate: string;
    registrationDate?: string;
  };

/** Registration-journal option retained for its standalone repository API. */
export type LaboratorySampleRegistrationOption = {
  id: string;
  laboratorySampleCode: string;
  sampleNumber: string;
  sampleName: string;
  samplingDate: string;
  registrationDate: string;
};

export type LaboratoryChemicalAnalysisJournalRecord =
  LaboratoryChemicalAnalysisJournalSubmission &
  Omit<LaboratoryChemicalAnalysisSampleOption, "sampleSource" | "sampleId"> & {
    id: string;
    createdAt: string;
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
  sampleOptions: LaboratoryChemicalAnalysisSampleOption[];
};
