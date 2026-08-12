export type LaboratoryFormedProductSampleSubmission = {
  sortingDate: string;
  sampleCode: string;
  productBrand: string;
  sourceSampleRegistrationId?: string;
};

export type LaboratoryFormedProductSampleCorrection =
  LaboratoryFormedProductSampleSubmission;

export type LaboratoryFormedProductSampleRecord =
  LaboratoryFormedProductSampleSubmission & {
    id: string;
    createdAt: string;
  };

export type LaboratoryFormedProductSampleFilters = {
  dateFrom?: string;
  dateTo?: string;
  query?: string;
  /** Substring match across the product brand only. */
  nameQuery?: string;
};

export const laboratoryFormedProductSampleFields = [
  { id: "sortingDate", label: "Дата сортировки", kind: "date", editable: true },
  { id: "sampleCode", label: "Код пробы", kind: "text", editable: true },
  {
    id: "productBrand",
    label: "Марка изделия",
    kind: "text",
    editable: true,
  },
] as const satisfies readonly {
  id: keyof LaboratoryFormedProductSampleSubmission;
  label: string;
  kind: "date" | "text";
  editable: boolean;
}[];
