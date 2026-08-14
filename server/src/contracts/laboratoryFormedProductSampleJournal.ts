/**
 * Задача 79: марка и дата формовки больше не вводятся вручную — сервер
 * подтягивает их из Журнала вагонов (`refractory_wagons`) по номеру вагона и
 * дате сортировки, как и марку в отчётах печного отделения (задача 88).
 */
export type LaboratoryFormedProductSampleSubmission = {
  sortingDate: string;
  wagonNumber: string;
};

export type LaboratoryFormedProductSampleCorrection =
  LaboratoryFormedProductSampleSubmission;

/**
 * `wagonNumber`/`moldingDate` могут отсутствовать только у записей,
 * сохранённых до этой задачи: номер вагона и дата формовки не вводились,
 * `productBrand` тогда заполнялся вручную и остаётся заполненным.
 */
export type LaboratoryFormedProductSampleRecord = {
  id: string;
  sortingDate: string;
  wagonNumber: string | null;
  productBrand: string;
  moldingDate: string | null;
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
  { id: "wagonNumber", label: "№ вагона", kind: "text", editable: true },
  {
    id: "productBrand",
    label: "Марка изделия",
    kind: "text",
    editable: false,
  },
  {
    id: "moldingDate",
    label: "Дата формовки",
    kind: "date",
    editable: false,
  },
] as const satisfies readonly {
  id: keyof LaboratoryFormedProductSampleRecord;
  label: string;
  kind: "date" | "text";
  editable: boolean;
}[];
