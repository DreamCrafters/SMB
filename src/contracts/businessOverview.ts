export type AssignmentOverviewCounts = {
  total: number;
  completed: number;
  overdue: number;
};

/** Executions of the register: all time and with a due date from month start to today. */
export type AssignmentOverviewSummary = AssignmentOverviewCounts & {
  month: AssignmentOverviewCounts;
};

export type BusinessOverview = {
  period: {
    monthStart: string;
    today: string;
  };
  incidents: {
    monthTotal: number;
    monthClosed: number;
    todayTotal: number;
    openNow: number;
  };
  laboratory: {
    monthTotal: number;
    todayTotal: number;
    sampled: {
      monthTotal: number;
      todayTotal: number;
    };
    chemicalAnalyses: {
      monthTotal: number;
      todayTotal: number;
    };
    rotaryKiln2Readings: {
      monthTotal: number;
      todayTotal: number;
    };
  };
  /** Present only when the account can read the whole register. */
  directorAssignments?: AssignmentOverviewSummary;
  boardAssignments?: AssignmentOverviewSummary;
  receivedAt: string;
};
