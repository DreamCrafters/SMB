import { buildLaboratorySampleCodeDraft } from "./laboratorySampleRegistrationJournal.js";
import type { LaboratoryChemicalAnalysisValues } from "./laboratoryChemicalAnalysisJournal.js";

export const laboratoryUnshapedProductSampleSuitabilityValues = [
  "yes",
  "no",
  "maybe",
] as const;

export type LaboratoryUnshapedProductSampleSuitability =
  (typeof laboratoryUnshapedProductSampleSuitabilityValues)[number];

export const laboratoryUnshapedProductSampleSuitabilityLabels: Record<
  LaboratoryUnshapedProductSampleSuitability,
  string
> = {
  yes: "Да",
  no: "Нет",
  maybe: "м.б.",
};

export type LaboratoryUnshapedProductSampleSubmission = {
  sampleNumber: string;
  sampleDate: string;
  sampledBy: string;
  batchNumber: string;
  sampleCode: string;
  productName: string;
  batchMass: string;
  moisture: string;
  grainComposition: string;
  fireResistance: string;
  suitability: LaboratoryUnshapedProductSampleSuitability;
  notes?: string;
  sourceSampleRegistrationId?: string;
};

export type LaboratoryUnshapedProductSampleCorrection =
  LaboratoryUnshapedProductSampleSubmission;

export type LaboratoryUnshapedProductSampleDraft = {
  sampleNumber: string;
  sampleCode: string;
  sampleDate: string;
  sampledBy: string;
  currentYear: number;
};

export type LaboratoryUnshapedProductSampleRecord =
  LaboratoryUnshapedProductSampleSubmission & {
    id: string;
    chemicalAnalysisNumber?: string;
    chemicalAnalysis?: LaboratoryChemicalAnalysisValues;
    createdAt: string;
  };

export type LaboratoryUnshapedProductSampleFilters = {
  dateFrom?: string;
  dateTo?: string;
  query?: string;
  /** Substring match across the product nomenclature only. */
  nameQuery?: string;
};

export const laboratoryUnshapedProductSampleFields = [
  { id: "sampleNumber", label: "Номер пробы", kind: "text", editable: true },
  { id: "sampleDate", label: "Дата", kind: "date", editable: true },
  { id: "sampledBy", label: "Кто брал пробы", kind: "text", editable: true },
  { id: "batchNumber", label: "№ партии", kind: "text", editable: true },
  { id: "sampleCode", label: "Код пробы", kind: "text", editable: true },
  {
    id: "productName",
    label: "Наименование продукции",
    kind: "text",
    editable: true,
  },
  { id: "batchMass", label: "Масса партии", kind: "text", editable: true },
  {
    id: "chemicalAnalysisNumber",
    label: "№ хим. анализа",
    kind: "text",
    editable: false,
  },
  { id: "moisture", label: "Влажность", kind: "text", editable: true },
  {
    id: "grainComposition",
    label: "Зерновой состав",
    kind: "text",
    editable: true,
  },
  {
    id: "fireResistance",
    label: "Огнеупорность",
    kind: "text",
    editable: true,
  },
  {
    id: "suitability",
    label: "Пригодность",
    kind: "suitability",
    editable: true,
  },
  { id: "notes", label: "Примечание", kind: "notes", editable: true },
] as const satisfies readonly {
  id: keyof LaboratoryUnshapedProductSampleRecord;
  label: string;
  kind: "date" | "notes" | "suitability" | "text";
  editable: boolean;
}[];

export function buildLaboratoryUnshapedProductSampleCodeDraft(
  sampleNumber: string,
  currentYear: number,
) {
  return buildLaboratorySampleCodeDraft(sampleNumber, currentYear);
}
