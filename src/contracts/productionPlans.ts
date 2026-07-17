export const productionCategories = [
  "forming",
  "sorting",
  "unformed",
  "chamotte",
] as const;

export type ProductionCategory = (typeof productionCategories)[number];

export type ProductionCategoryPlans = Record<ProductionCategory, number>;

export type ProductionDailyPlan = {
  date: string;
  values: ProductionCategoryPlans;
};

export type ProductionPlanRevision = {
  revisionId: string;
  month: string;
  monthlyPlans: ProductionCategoryPlans;
  workingDayCount: number;
  dailyPlans: ProductionDailyPlan[];
  createdByUserId: string;
  createdAt: string;
};

export type ProductionPlanPreviewRequest = {
  month: string;
  monthlyPlans: ProductionCategoryPlans;
};

export type ProductionPlanPreviewResponse = ProductionPlanPreviewRequest & {
  suggestedWorkingDates: string[];
  workingDayCount: number;
};

export type SaveProductionPlanRequest = ProductionPlanPreviewRequest & {
  workingDates: string[];
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
