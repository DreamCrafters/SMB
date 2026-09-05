import type { LaboratoryChemicalAnalysisValues } from "./laboratoryChemicalAnalysisJournal.js";

export type LaboratoryVerificationSubmission = {
  verificationDate: string;
  productName: string;
  samplingLocation: string;
  sampleCode: string;
  sourceSampleRegistrationId?: string;
};

export type LaboratoryVerificationCorrection =
  LaboratoryVerificationSubmission;

export type LaboratoryVerificationRecord = LaboratoryVerificationSubmission & {
  id: string;
  chemicalAnalysis?: LaboratoryChemicalAnalysisValues;
  createdAt: string;
};

export type LaboratoryVerificationFilters = {
  dateFrom?: string;
  dateTo?: string;
  query?: string;
  /** Substring match across the product nomenclature only. */
  nameQuery?: string;
};

export const laboratoryVerificationFields = [
  { id: "verificationDate", label: "Дата", kind: "date", editable: true },
  {
    id: "productName",
    label: "Наименование продукции",
    kind: "text",
    editable: true,
  },
  {
    id: "samplingLocation",
    label: "Место отбора пробы",
    kind: "text",
    editable: true,
  },
  { id: "sampleCode", label: "Код пробы", kind: "text", editable: true },
] as const satisfies readonly {
  id: keyof LaboratoryVerificationSubmission;
  label: string;
  kind: "date" | "text";
  editable: boolean;
}[];
