export type ProductionDailyPlan = {
  date: string;
  value: number;
};

export type ProductionPlanRevision = {
  revisionId: string;
  month: string;
  monthlyPlan: number;
  workingDayCount: number;
  dailyPlans: ProductionDailyPlan[];
  createdByUserId: string;
  createdAt: string;
};

export type ProductionPlanPreviewRequest = {
  month: string;
  monthlyPlan: number;
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
