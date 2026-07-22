export const laboratoryIndicatorIds = [
  "al2o3",
  "fe2o3",
  "sio2",
  "cao2",
  "p2o5",
  "loss_on_ignition",
  "moisture",
  "bulk_density",
  "water_absorption",
  "strength",
  "grain_composition",
] as const;

export type LaboratoryIndicatorId = (typeof laboratoryIndicatorIds)[number];
export type LaboratorySection = "incoming" | "finished_product";

export type LaboratoryIndicatorReference = {
  id: LaboratoryIndicatorId;
  label: string;
  standard?: string;
};

export type LaboratoryMaterialReference = {
  label: string;
  indicators: LaboratoryIndicatorReference[];
};

export type LaboratoryReference = {
  incomingMaterials: LaboratoryMaterialReference[];
  finishedProductTypes: LaboratoryMaterialReference[];
};

export type LaboratoryIndicatorValues = Partial<
  Record<LaboratoryIndicatorId, string>
>;

export type IncomingLaboratoryResultSubmission = {
  section: "incoming";
  analysisDate: string;
  materialLabel: string;
  sampleIdentifier: string;
  documentType?: "Сертификат на отгруженную продукцию";
  documentNumber?: string;
  transportType?: "ЖД" | "Автотранспорт грузовой" | "Легковой автотранспорт";
  samplingMethod?: string;
  documentIndicators?: string;
  values: LaboratoryIndicatorValues;
};

export type FinishedProductLaboratoryResultSubmission = {
  section: "finished_product";
  analysisDate: string;
  materialLabel: string;
  productBrand: string;
  values: LaboratoryIndicatorValues;
};

export type LaboratoryResultSubmission =
  | IncomingLaboratoryResultSubmission
  | FinishedProductLaboratoryResultSubmission;

export type LaboratoryResult = LaboratoryResultSubmission & {
  id: string;
  laboratoryAssistantDisplayName: string;
  createdAt: string;
};

export type LaboratoryResultFilters = {
  section?: LaboratorySection;
  dateFrom?: string;
  dateTo?: string;
  materialLabel?: string;
  productBrand?: string;
};
