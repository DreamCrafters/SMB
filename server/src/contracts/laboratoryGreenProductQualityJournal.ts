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

export type LaboratoryGreenProductQualityAvailableWagon =
  LaboratoryGreenProductQualityWagonOption & {
    loadingDate: string | null;
    productBrand: string | null;
    pressDate: string | null;
    pieceCount: number | null;
    setter: string | null;
    pressOperator: string | null;
  };

export type LaboratoryGreenProductQualityMeasurement = {
  measurementNumber: number;
  lengthFirst: string;
  lengthSecond: string;
  widthFirst: string;
  widthSecond: string;
  heightFirst: string;
  heightSecond: string;
  weight: string;
  mechanicalStrength: string;
  density: string;
};

export type LaboratoryGreenProductQualitySubmission = {
  recordDate: string;
  pressNumber: LaboratoryGreenProductQualityPressNumber;
  productBrand: string;
  pressDate: string | null;
  setter: string;
  pressOperator: string;
  loadingDate: string | null;
  pieceCount: number | null;
  wagonIds: string[];
  measurements: LaboratoryGreenProductQualityMeasurement[];
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
  wagons: LaboratoryGreenProductQualityAvailableWagon[];
};

export const laboratoryGreenProductQualityGeneralFields = [
  { id: "recordDate", label: "Дата", kind: "date" },
  { id: "pressNumber", label: "№ пресса", kind: "press" },
  { id: "productBrand", label: "Марка изделия", kind: "brand" },
  { id: "pressDate", label: "Дата пресса", kind: "optional_date" },
  { id: "setter", label: "Садчик", kind: "option" },
  { id: "pressOperator", label: "Прессовщик", kind: "option" },
  { id: "loadingDate", label: "Дата садки", kind: "optional_date" },
  { id: "pieceCount", label: "Кол-во шт.", kind: "optional_count" },
  { id: "wagonIds", label: "№№ вагонов", kind: "wagons" },
] as const satisfies readonly {
  id:
    | "recordDate"
    | "pressNumber"
    | "productBrand"
    | "pressDate"
    | "setter"
    | "pressOperator"
    | "loadingDate"
    | "pieceCount"
    | "wagonIds";
  label: string;
  kind:
    | "brand"
    | "date"
    | "optional_count"
    | "optional_date"
    | "option"
    | "press"
    | "wagons";
}[];

/**
 * Линейные размеры и показатели качества объединены во внутреннюю таблицу
 * замеров (задача 86): строк может быть несколько, `measurementNumber`
 * считается сервером по позиции в массиве.
 */
export const laboratoryGreenProductQualityMeasurementFields = [
  { id: "lengthFirst", label: "Длина 1", kind: "number" },
  { id: "lengthSecond", label: "Длина 2", kind: "number" },
  { id: "widthFirst", label: "Ширина 1", kind: "number" },
  { id: "widthSecond", label: "Ширина 2", kind: "number" },
  { id: "heightFirst", label: "Высота 1", kind: "number" },
  { id: "heightSecond", label: "Высота 2", kind: "number" },
  { id: "weight", label: "Вес", kind: "number" },
  { id: "mechanicalStrength", label: "Механическая прочность", kind: "number" },
  { id: "density", label: "Плотность", kind: "number" },
] as const satisfies readonly {
  id: keyof Omit<LaboratoryGreenProductQualityMeasurement, "measurementNumber">;
  label: string;
  kind: "number";
}[];

/** Рекомендации прессовщику относятся ко всей записи, не к строке замера. */
export const laboratoryGreenProductQualitySummaryFields = [
  {
    id: "pressOperatorRecommendations",
    label: "Рекомендации прессовщику",
    kind: "long_text",
  },
] as const satisfies readonly {
  id: "pressOperatorRecommendations";
  label: string;
  kind: "long_text";
}[];
