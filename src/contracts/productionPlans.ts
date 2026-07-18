export const productionCategories = [
  "forming",
  "sorting",
  "unformed",
  "chamotte",
] as const;

export type ProductionCategory = (typeof productionCategories)[number];

export type ProductionCategoryPlans = Record<ProductionCategory, number>;

export type ProductionCategoryScheduleInput = {
  monthlyPlan: number;
  workingDates: string[];
};

export type ProductionCategoryScheduleInputs = Record<
  ProductionCategory,
  ProductionCategoryScheduleInput
>;

export type ProductionCategoryDailyPlan = {
  date: string;
  value: number;
};

export type ProductionCategorySchedule = {
  monthlyPlan: number;
  workingDayCount: number;
  dailyPlans: ProductionCategoryDailyPlan[];
};

export type ProductionCategorySchedules = Record<
  ProductionCategory,
  ProductionCategorySchedule
>;

export type ProductionPlanSchedules = Partial<ProductionCategorySchedules>;

export type ProductionDailyPlan = {
  date: string;
  values: Partial<ProductionCategoryPlans>;
};

export type ProductionPlanRevision = {
  revisionId: string;
  month: string;
  schedules: ProductionPlanSchedules;
  createdByUserId: string;
  createdAt: string;
};

export type ProductionPlanPreviewRequest = {
  month: string;
};

export type ProductionPlanPreviewResponse = ProductionPlanPreviewRequest & {
  allDates: string[];
  weekdayDates: string[];
};

export type SaveProductionPlanRequest = {
  month: string;
  category: ProductionCategory;
  schedule: ProductionCategoryScheduleInput;
};

export type ProductionPlanResponse = {
  plan: ProductionPlanRevision | null;
};

export type ProductionDailyPlanResponse = {
  plan: ProductionDailyPlan | null;
};

export const productionBrandCategories = [
  "product",
  "unformed",
  "chamotte",
] as const;

export type ProductionBrandCategory =
  (typeof productionBrandCategories)[number];

export type ProductionBrandLabel = {
  id: string;
  category: ProductionBrandCategory;
  label: string;
  createdAt: string;
};

export type ProductionBrandsResponse = {
  labels: ProductionBrandLabel[];
};

export type CreateProductionBrandRequest = {
  category: ProductionBrandCategory;
  label: string;
};

export type ProductionBrandResponse = {
  label: ProductionBrandLabel;
};
