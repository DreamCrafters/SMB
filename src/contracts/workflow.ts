import type { DispatcherProductionBankContent } from "./laboratoryBanks.js";

export type DataEntryStatus =
  | "draft"
  | "submitted"
  | "needs_correction"
  | "confirmed"
  | "rejected";

export type ConfirmationStatus =
  | "waiting"
  | "approved"
  | "rejected"
  | "needs_correction";

export type DispatcherSubmissionStatus =
  | "received"
  | "queued"
  | "accepted"
  | "rejected";

export type DispatcherFormId =
  | "equipment"
  | "production"
  | "incident"
  | "incident_close"
  | "visitor"
  | "visitor_exit"
  | "gas_oc"
  | "gas_cosh";

export type DispatcherFormFieldType =
  | "text"
  | "number"
  | "signed-number"
  | "integer"
  | "date"
  | "month"
  | "datetime-local"
  | "select"
  | "textarea";

export type DispatcherFormField = {
  name: string;
  label: string;
  type: DispatcherFormFieldType;
  required: boolean;
  options?: string[];
  maxLength?: number;
};

export type DispatcherFormDefinition = {
  id: DispatcherFormId;
  title: string;
  sheetName: string;
  fields: DispatcherFormField[];
};

export type DispatcherSubmissionPayload = Record<string, string>;

export type DispatcherSubmissionDraft = {
  formId: DispatcherFormId;
  payload: DispatcherSubmissionPayload;
};

export type DispatcherSubmission = {
  id: string;
  formId: DispatcherFormId;
  formTitle: string;
  payload: DispatcherSubmissionPayload;
  summary: string;
  status: DispatcherSubmissionStatus;
  submittedByAccountId: string;
  submittedAt: string;
  receivedAt: string;
};

export type DispatcherFormsResponse = {
  forms: DispatcherFormDefinition[];
};

export type DispatcherSubmissionResponse = {
  submission: DispatcherSubmission;
};

export type DispatcherEquipmentReportResponse = {
  submissions: DispatcherSubmission[];
  reportStatus: "created" | "updated";
};

export type DispatcherFeedSummaryItem = {
  formId: DispatcherFormId;
  formTitle: string;
  count: number;
};

export type DispatcherFeedSummary = {
  total: number;
  byForm: DispatcherFeedSummaryItem[];
};

export type ProductionReportBaseRow = {
  reportId: string;
  reportDate: string;
  receivedAt: string;
};

export type ProductionMetricRow = ProductionReportBaseRow & {
  brand?: string;
  dayPlan?: number;
  dayFact?: number;
  monthPlan?: number;
  monthFact?: number;
  deviation?: number;
};

export type ProductionBrandFact = {
  brand: string;
  value: number;
  monthValue: number;
};

export type ProductionBrandCategoryRow = ProductionMetricRow & {
  facts: ProductionBrandFact[];
};

export type ProductionJarMeasurementRow = ProductionReportBaseRow & {
  jarNumber: number;
  start?: number;
  end?: number;
  consumption?: number;
};

export type ProductionGranulationRow = ProductionReportBaseRow & {
  platesInOperation?: number;
  millHours?: number;
  fraction1630Day?: number;
  fraction1630Month?: number;
  fraction1218Day?: number;
  fraction1218Month?: number;
};

export type ProductionReportTables = {
  forming: ProductionBrandCategoryRow[];
  sorting: ProductionBrandCategoryRow[];
  unformed: ProductionBrandCategoryRow[];
  chamotte: ProductionBrandCategoryRow[];
  jars: ProductionJarMeasurementRow[];
  granulation: ProductionGranulationRow[];
};

export type ProductionMonthOverview = {
  month: string;
  totalFact: number;
};

export type OpenIncidentSummary = {
  incidentNumber: string;
  openedAt: string;
  location?: string;
  incidentType?: string;
  criticality?: string;
  description?: string;
};

export type DispatcherFeedResponse = {
  submissions: DispatcherSubmission[];
  productionReportTables: ProductionReportTables;
  productionMonthOverview: ProductionMonthOverview | null;
  openIncidents: OpenIncidentSummary[];
  /** Текущее содержимое банок, назначенное Лабораторией. */
  bankContents: DispatcherProductionBankContent[];
  receivedAt: string;
  summary: DispatcherFeedSummary;
};
