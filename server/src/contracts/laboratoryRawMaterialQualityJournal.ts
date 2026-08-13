export const laboratoryRawMaterialQualityShiftValues = [
  "day",
  "night",
  "day_short",
] as const;

export type LaboratoryRawMaterialQualityShift =
  (typeof laboratoryRawMaterialQualityShiftValues)[number];

export const laboratoryRawMaterialQualityShiftLabels: Record<
  LaboratoryRawMaterialQualityShift,
  string
> = {
  day: "8:00-20:00",
  night: "20:00-8:00",
  day_short: "08:00-17:00",
};

export const laboratoryRawMaterialQualityDisintegratorValues = ["1", "2"] as const;
export type LaboratoryRawMaterialQualityDisintegrator =
  (typeof laboratoryRawMaterialQualityDisintegratorValues)[number];

export const laboratoryRawMaterialQualityBallMillValues = ["1", "2", "3"] as const;
export type LaboratoryRawMaterialQualityBallMill =
  (typeof laboratoryRawMaterialQualityBallMillValues)[number];

export const laboratoryRawMaterialQualitySixSlotValues = [
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
] as const;
export type LaboratoryRawMaterialQualitySixSlot =
  (typeof laboratoryRawMaterialQualitySixSlotValues)[number];

export const laboratoryRawMaterialQualityRecommendationRecipientValues = [
  "dryer_operator",
  "runner_operator",
  "slurry_operator",
  "batch_operator",
] as const;

export type LaboratoryRawMaterialQualityRecommendationRecipient =
  (typeof laboratoryRawMaterialQualityRecommendationRecipientValues)[number];

export const laboratoryRawMaterialQualityRecommendationRecipientLabels: Record<
  LaboratoryRawMaterialQualityRecommendationRecipient,
  string
> = {
  dryer_operator: "Сушильщик",
  runner_operator: "Бегунщик",
  slurry_operator: "Шликерщик",
  batch_operator: "Шихтовщик",
};

export type LaboratoryClayMeasurementRow = {
  measurementNumber: number;
  clayBrand: string | null;
  disintegratorNumber: LaboratoryRawMaterialQualityDisintegrator | null;
  moisture: string | null;
  sieveResidue3: string | null;
  sievePass05: string | null;
};

export type LaboratoryTemperMeasurementRow = {
  measurementNumber: number;
  temperBrand: string | null;
  ballMillNumber: LaboratoryRawMaterialQualityBallMill | null;
  sieveResidue3: string | null;
  sieveResidue2: string | null;
  sieveResidue1: string | null;
  sievePass05: string | null;
};

export type LaboratorySlipMeasurementRow = {
  measurementNumber: number;
  mixerNumber: LaboratoryRawMaterialQualitySixSlot | null;
  temperature: string | null;
  density: string | null;
};

export type LaboratoryRunnerMeasurementRow = {
  runnerNumber: LaboratoryRawMaterialQualitySixSlot | null;
  chamottePercentage: string | null;
  clayPercentage: string | null;
  residue0063: string | null;
  moisture: string | null;
  isReserve: boolean;
};

export type LaboratoryRawMaterialQualitySubmission = {
  recordDate: string;
  laboratoryAssistant: string;
  shiftSupervisor: string;
  shift: LaboratoryRawMaterialQualityShift;
  clayMeasurements: LaboratoryClayMeasurementRow[];
  temperMeasurements: LaboratoryTemperMeasurementRow[];
  slipMeasurements: LaboratorySlipMeasurementRow[];
  runnerMeasurements: LaboratoryRunnerMeasurementRow[];
  elutriationCoefficient: string | null;
  recommendationRecipient: LaboratoryRawMaterialQualityRecommendationRecipient | null;
  recommendationText: string | null;
};

export type LaboratoryRawMaterialQualityRecord =
  LaboratoryRawMaterialQualitySubmission & {
    id: string;
    createdAt: string;
  };

export type LaboratoryRawMaterialQualityFilters = {
  dateFrom?: string;
  dateTo?: string;
  query?: string;
  /** Substring match against the clay and temper brands only. */
  nameQuery?: string;
};

export type LaboratoryRawMaterialQualityOptions = {
  laboratoryAssistants: string[];
  shiftSupervisors: string[];
  clayBrands: string[];
  temperBrands: string[];
};

export const laboratoryRawMaterialQualityGeneralFields = [
  { id: "recordDate", label: "Дата", kind: "date" },
  { id: "laboratoryAssistant", label: "Лаборант", kind: "option" },
  { id: "shiftSupervisor", label: "Мастер смены", kind: "option" },
  { id: "shift", label: "Смена", kind: "shift" },
] as const satisfies readonly {
  id: "recordDate" | "laboratoryAssistant" | "shiftSupervisor" | "shift";
  label: string;
  kind: "date" | "option" | "shift";
}[];

export const laboratoryClayMeasurementFields = [
  { id: "clayBrand", label: "Марка глины", kind: "option" },
  { id: "disintegratorNumber", label: "Дезинтегратор №", kind: "disintegrator" },
  { id: "moisture", label: "Влажность", kind: "text" },
  { id: "sieveResidue3", label: "Остаток на сите № 3", kind: "text" },
  { id: "sievePass05", label: "Остаток на сите № 0,5", kind: "text" },
] as const satisfies readonly {
  id: keyof Omit<LaboratoryClayMeasurementRow, "measurementNumber">;
  label: string;
  kind: "disintegrator" | "option" | "text";
}[];

export const laboratoryTemperMeasurementFields = [
  { id: "temperBrand", label: "Марка отощителя", kind: "option" },
  { id: "ballMillNumber", label: "Шаровая", kind: "ball_mill" },
  { id: "sieveResidue3", label: "Остаток на сите № 3", kind: "text" },
  { id: "sieveResidue2", label: "Остаток на сите № 2", kind: "text" },
  { id: "sieveResidue1", label: "Остаток на сите № 1", kind: "text" },
  { id: "sievePass05", label: "Остаток на сите № 0,5", kind: "text" },
] as const satisfies readonly {
  id: keyof Omit<LaboratoryTemperMeasurementRow, "measurementNumber">;
  label: string;
  kind: "ball_mill" | "option" | "text";
}[];

export const laboratorySlipMeasurementFields = [
  { id: "mixerNumber", label: "№ мешалки", kind: "mixer_number" },
  { id: "temperature", label: "Температура шликера", kind: "text" },
  { id: "density", label: "Плотность, гр/см³", kind: "text" },
] as const satisfies readonly {
  id: keyof Omit<LaboratorySlipMeasurementRow, "measurementNumber">;
  label: string;
  kind: "mixer_number" | "text";
}[];

export const laboratoryRunnerMeasurementFields = [
  { id: "runnerNumber", label: "№ бегунов", kind: "runner_number" },
  { id: "chamottePercentage", label: "% шамота", kind: "text" },
  { id: "clayPercentage", label: "% глины", kind: "text" },
  { id: "residue0063", label: "Остаток 0,063", kind: "text" },
  { id: "moisture", label: "Влажность", kind: "text" },
  { id: "isReserve", label: "Резерв", kind: "checkbox" },
] as const satisfies readonly {
  id: keyof LaboratoryRunnerMeasurementRow;
  label: string;
  kind: "checkbox" | "runner_number" | "text";
}[];

export const laboratoryRawMaterialQualitySummaryFields = [
  { id: "elutriationCoefficient", label: "Коэффициент отмучивания", kind: "text" },
  {
    id: "recommendationRecipient",
    label: "Адрес рекомендации",
    kind: "recommendation",
  },
  { id: "recommendationText", label: "Текст рекомендации", kind: "long_text" },
] as const satisfies readonly {
  id: "elutriationCoefficient" | "recommendationRecipient" | "recommendationText";
  label: string;
  kind: "long_text" | "recommendation" | "text";
}[];
