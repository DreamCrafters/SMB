/**
 * Доработка задачи 95: `Номенклатура` разделена на `Марки` и `Сырьё`. Сырьё
 * повторяет карточку марки без «Геометрия Д*Ш*В» и «Прочность» — это свойства
 * готового изделия, а не материала.
 */
export type RawMaterialNomenclatureSubmission = {
  name: string;
  description: string;
  productClass: string;
  applicationIndustry: string;
  normativeDocument: string;
  al2o3: string;
  fe2o3: string;
};

export type RawMaterialNomenclatureRecord =
  RawMaterialNomenclatureSubmission & {
    id: string;
    createdAt: string;
    updatedAt: string;
  };

export type RawMaterialNomenclatureFilters = {
  query?: string;
};

export type RawMaterialNomenclatureCorrectionResult = {
  before: RawMaterialNomenclatureSubmission;
  record: RawMaterialNomenclatureRecord;
};

export const rawMaterialNomenclatureFields = [
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
  { id: "al2o3", label: "Al2O3", kind: "text", maxLength: 120 },
  { id: "fe2o3", label: "Fe2O3", kind: "text", maxLength: 120 },
] as const satisfies readonly {
  id: keyof RawMaterialNomenclatureSubmission;
  label: string;
  kind: "long_text" | "text";
  maxLength: number;
}[];
