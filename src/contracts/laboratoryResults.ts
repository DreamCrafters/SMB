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

export type LaboratoryProductTypeReference = {
  label: string;
  indicatorIds: LaboratoryIndicatorId[];
};

export type LaboratoryIncomingTestProfile = LaboratoryProductTypeReference;

export type LaboratoryReference = {
  indicators: LaboratoryIndicatorReference[];
  incomingTestProfiles: LaboratoryIncomingTestProfile[];
  finishedProductTypes: LaboratoryProductTypeReference[];
};

export type LaboratoryIndicatorValues = Partial<
  Record<LaboratoryIndicatorId, string>
>;

export type IncomingLaboratorySample = {
  sampleIdentifier: string;
  values: LaboratoryIndicatorValues;
};

export type IncomingLaboratoryResultSubmission = {
  section: "incoming";
  analysisDate: string;
  materialLabel: string;
  purpose?: string;
  protocolNote?: string;
  documentType?: "Сертификат на отгруженную продукцию";
  documentNumber?: string;
  transportType?: "ЖД" | "Автотранспорт грузовой" | "Легковой автотранспорт";
  samplingMethod?: string;
  documentIndicators?: string;
  samples: IncomingLaboratorySample[];
};

export type FinishedProductLaboratoryResultSubmission = {
  section: "finished_product";
  analysisDate: string;
  materialLabel: string;
  productBrand: string;
  purpose?: string;
  protocolNote?: string;
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
