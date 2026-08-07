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
  receivedAt: string;
};
