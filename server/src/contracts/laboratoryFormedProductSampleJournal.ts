/**
 * Задача 79 добавила вагонный путь: марка и дата формовки подтягиваются из
 * Журнала вагонов (`refractory_wagons`) по номеру вагона и дате сортировки,
 * как и марка в отчётах печного отделения (задача 88). Доработка задачи 64
 * вернула второй, независимый путь — трансляцию из Регистрации проб: код
 * пробы и марка изделия приходят предзаполнением из
 * `SampleRegistrationTransmissionPicker`, дата формовки в этом случае
 * неизвестна. Ровно один путь на запись: `wagonNumber` — вагонный (марка и
 * дата формовки резолвятся сервером, `sampleCode` игнорируется), либо
 * `sampleCode`+`productBrand` — трансляция (`moldingDate` остаётся `null`).
 */
export type LaboratoryFormedProductSampleSubmission = {
  sortingDate: string;
  wagonNumber?: string;
  sampleCode?: string;
  productBrand?: string;
  sourceSampleRegistrationId?: string;
};

export type LaboratoryFormedProductSampleCorrection =
  LaboratoryFormedProductSampleSubmission;

/**
 * `wagonNumber`/`sampleCode` — взаимоисключающие провенансы записи, `null`
 * означает «эта проба пришла не отсюда». `moldingDate` есть только у
 * вагонного пути. У записей, сохранённых до задачи 79, `wagonNumber` и
 * `moldingDate` тоже `null` (номер вагона и дата формовки не вводились,
 * `productBrand` был заполнен вручную).
 */
export type LaboratoryFormedProductSampleRecord = {
  id: string;
  sortingDate: string;
  wagonNumber: string | null;
  sampleCode: string | null;
  productBrand: string;
  moldingDate: string | null;
  sourceSampleRegistrationId?: string;
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
  { id: "sampleCode", label: "Код пробы", kind: "text", editable: true },
  {
    id: "productBrand",
    label: "Марка изделия",
    kind: "text",
    editable: true,
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
