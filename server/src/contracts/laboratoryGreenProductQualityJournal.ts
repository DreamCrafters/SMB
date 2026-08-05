export const laboratoryGreenProductQualityPressNumberValues = [
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
] as const;

export type LaboratoryGreenProductQualityPressNumber =
  (typeof laboratoryGreenProductQualityPressNumberValues)[number];

export type LaboratoryGreenProductQualityWagonOption = {
  id: string;
  number: string;
};

export type LaboratoryGreenProductQualitySubmission = {
  recordDate: string;
  pressNumber: LaboratoryGreenProductQualityPressNumber;
  productBrand: string;
  setter: string;
  pressOperator: string;
  wagonIds: string[];
  lengthFirst: string;
  lengthSecond: string;
  widthFirst: string;
  widthSecond: string;
  heightFirst: string;
  heightSecond: string;
  weight: string;
  mechanicalStrength: string;
  density: string;
  pressOperatorRecommendations: string;
};

export type LaboratoryGreenProductQualityRecord =
  LaboratoryGreenProductQualitySubmission & {
    id: string;
    wagons: LaboratoryGreenProductQualityWagonOption[];
    createdAt: string;
  };

export type LaboratoryGreenProductQualityFilters = {
  dateFrom?: string;
  dateTo?: string;
  query?: string;
  /** Substring match against the canonical product brand only. */
  nameQuery?: string;
};

export type LaboratoryGreenProductQualityOptions = {
  setters: string[];
  pressOperators: string[];
  wagons: LaboratoryGreenProductQualityWagonOption[];
};

export type LaboratoryGreenProductQualityFieldGroup =
  | "general"
  | "dimensions"
  | "measurements";

export const laboratoryGreenProductQualityFields = [
  { id: "recordDate", label: "Дата", kind: "date", group: "general" },
  { id: "pressNumber", label: "№ пресса", kind: "press", group: "general" },
  { id: "productBrand", label: "Марка изделия", kind: "brand", group: "general" },
  { id: "setter", label: "Садчик", kind: "option", group: "general" },
  { id: "pressOperator", label: "Прессовщик", kind: "option", group: "general" },
  { id: "wagonIds", label: "№№ вагонов", kind: "wagons", group: "general" },
  { id: "lengthFirst", label: "Длина 1", kind: "number", group: "dimensions" },
  { id: "lengthSecond", label: "Длина 2", kind: "number", group: "dimensions" },
  { id: "widthFirst", label: "Ширина 1", kind: "number", group: "dimensions" },
  { id: "widthSecond", label: "Ширина 2", kind: "number", group: "dimensions" },
  { id: "heightFirst", label: "Высота 1", kind: "number", group: "dimensions" },
  { id: "heightSecond", label: "Высота 2", kind: "number", group: "dimensions" },
  { id: "weight", label: "Вес", kind: "number", group: "measurements" },
  {
    id: "mechanicalStrength",
    label: "Механическая прочность",
    kind: "number",
    group: "measurements",
  },
  { id: "density", label: "Плотность", kind: "number", group: "measurements" },
  {
    id: "pressOperatorRecommendations",
    label: "Рекомендации прессовщику",
    kind: "long_text",
    group: "measurements",
  },
] as const satisfies readonly {
  id: keyof LaboratoryGreenProductQualitySubmission;
  label: string;
  kind: "brand" | "date" | "long_text" | "number" | "option" | "press" | "wagons";
  group: LaboratoryGreenProductQualityFieldGroup;
}[];
