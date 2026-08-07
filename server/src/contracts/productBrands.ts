export type ProductBrandSubmission = {
  name: string;
  description: string;
  productClass: string;
  applicationIndustry: string;
  normativeDocument: string;
  geometry: string;
  al2o3: string;
  fe2o3: string;
  strength: string;
};

export type ProductBrandRecord = ProductBrandSubmission & {
  id: string;
  createdAt: string;
  updatedAt: string;
};

export type ProductBrandFilters = {
  query?: string;
};

export type ProductBrandDeletionImpact = {
  usageCount: number;
};

export type ProductBrandDeletionResult = {
  sourceId: string;
  sourceName: string;
  replacementId?: string;
  replacementName?: string;
  updatedRecords: number;
};

export type ProductBrandMergeAlias = {
  sourceName: string;
  replacementName: string;
};

export const productBrandFields = [
  { id: "name", label: "Наименование", kind: "text", maxLength: 120 },
  { id: "description", label: "Описание", kind: "long_text", maxLength: 2000 },
  { id: "productClass", label: "Класс", kind: "text", maxLength: 255 },
  {
    id: "applicationIndustry",
    label: "Отрасль применения",
    kind: "text",
    maxLength: 255,
  },
  {
    id: "normativeDocument",
    label: "Норматив (ГОСТ, ТУ)",
    kind: "text",
    maxLength: 255,
  },
  { id: "geometry", label: "Геометрия Д*Ш*В", kind: "text", maxLength: 255 },
  { id: "al2o3", label: "Al2O3", kind: "text", maxLength: 120 },
  { id: "fe2o3", label: "Fe2O3", kind: "text", maxLength: 120 },
  { id: "strength", label: "Прочность", kind: "text", maxLength: 120 },
] as const satisfies readonly {
  id: keyof ProductBrandSubmission;
  label: string;
  kind: "long_text" | "text";
  maxLength: number;
}[];
