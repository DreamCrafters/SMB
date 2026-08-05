export const laboratoryRawMaterialQualityShiftValues = [
  "day",
  "night",
] as const;

export type LaboratoryRawMaterialQualityShift =
  (typeof laboratoryRawMaterialQualityShiftValues)[number];

export const laboratoryRawMaterialQualityShiftLabels: Record<
  LaboratoryRawMaterialQualityShift,
  string
> = {
  day: "8:00-20:00",
  night: "20:00-8:00",
};

export const laboratoryRawMaterialQualityDisintegratorValues = ["1", "2"] as const;
export type LaboratoryRawMaterialQualityDisintegrator =
  (typeof laboratoryRawMaterialQualityDisintegratorValues)[number];

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

export type LaboratoryRawMaterialQualitySubmission = {
  recordDate: string;
  laboratoryAssistant: string;
  shiftSupervisor: string;
  shift: LaboratoryRawMaterialQualityShift;
  clayBrand: string;
  clayMoisture: string;
  clayGrainComposition: string;
  disintegratorNumber: LaboratoryRawMaterialQualityDisintegrator;
  temperMoisture: string;
  temperGrainComposition: string;
  temperSieveResidue1: string;
  temperSieveResidue2: string;
  temperSieveResidue3: string;
  temperSievePass05: string;
  temperBrand: string;
  temperBulkDensity: string;
  slipMixerNumber: string;
  slipTemperature: string;
  slipDensity: string;
  runnerNumber: string;
  chargeChamottePercentage: string;
  chargeClayPercentage: string;
  chargeResidue0063: string;
  chargeMoisture: string;
  elutriationCoefficient: string;
  recommendationRecipient: LaboratoryRawMaterialQualityRecommendationRecipient;
  recommendationText: string;
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
  slipMixerNumbers: string[];
  runnerNumbers: string[];
};

export type LaboratoryRawMaterialQualityFieldGroup =
  | "general"
  | "clay"
  | "temper"
  | "slip"
  | "runners"
  | "charge";

export const laboratoryRawMaterialQualityFields = [
  { id: "recordDate", label: "Дата", kind: "date", group: "general" },
  {
    id: "laboratoryAssistant",
    label: "Лаборант",
    kind: "option",
    group: "general",
  },
  {
    id: "shiftSupervisor",
    label: "Мастер смены",
    kind: "option",
    group: "general",
  },
  { id: "shift", label: "Смена", kind: "shift", group: "general" },
  { id: "clayBrand", label: "Марка глины", kind: "option", group: "clay" },
  { id: "clayMoisture", label: "Влажность глины", kind: "text", group: "clay" },
  {
    id: "clayGrainComposition",
    label: "Зерновой состав глины",
    kind: "text",
    group: "clay",
  },
  {
    id: "disintegratorNumber",
    label: "Дезинтегратор №",
    kind: "disintegrator",
    group: "clay",
  },
  {
    id: "temperMoisture",
    label: "Влажность отощителя",
    kind: "text",
    group: "temper",
  },
  {
    id: "temperGrainComposition",
    label: "Зерновой состав отощителя",
    kind: "text",
    group: "temper",
  },
  {
    id: "temperSieveResidue1",
    label: "Остаток на сите № 1",
    kind: "text",
    group: "temper",
  },
  {
    id: "temperSieveResidue2",
    label: "Остаток на сите № 2",
    kind: "text",
    group: "temper",
  },
  {
    id: "temperSieveResidue3",
    label: "Остаток на сите № 3",
    kind: "text",
    group: "temper",
  },
  {
    id: "temperSievePass05",
    label: "Проход ч/з 0,5",
    kind: "text",
    group: "temper",
  },
  {
    id: "temperBrand",
    label: "Марка отощителя",
    kind: "option",
    group: "temper",
  },
  {
    id: "temperBulkDensity",
    label: "Насыпной вес",
    kind: "text",
    group: "temper",
  },
  {
    id: "slipMixerNumber",
    label: "№ мешалки",
    kind: "option",
    group: "slip",
  },
  {
    id: "slipTemperature",
    label: "Температура шликера",
    kind: "text",
    group: "slip",
  },
  {
    id: "slipDensity",
    label: "Плотность, гр/см³",
    kind: "text",
    group: "slip",
  },
  {
    id: "runnerNumber",
    label: "№ бегунов",
    kind: "option",
    group: "runners",
  },
  {
    id: "chargeChamottePercentage",
    label: "% шамота",
    kind: "text",
    group: "charge",
  },
  {
    id: "chargeClayPercentage",
    label: "% глины",
    kind: "text",
    group: "charge",
  },
  {
    id: "chargeResidue0063",
    label: "Остаток 0,063",
    kind: "text",
    group: "charge",
  },
  {
    id: "chargeMoisture",
    label: "Влажность шихты",
    kind: "text",
    group: "charge",
  },
  {
    id: "elutriationCoefficient",
    label: "Коэффициент отмучивания",
    kind: "text",
    group: "charge",
  },
  {
    id: "recommendationRecipient",
    label: "Адрес рекомендации",
    kind: "recommendation",
    group: "charge",
  },
  {
    id: "recommendationText",
    label: "Текст рекомендации",
    kind: "long_text",
    group: "charge",
  },
] as const satisfies readonly {
  id: keyof LaboratoryRawMaterialQualitySubmission;
  label: string;
  kind:
    | "date"
    | "disintegrator"
    | "long_text"
    | "option"
    | "recommendation"
    | "shift"
    | "text";
  group: LaboratoryRawMaterialQualityFieldGroup;
}[];
