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
  };
  receivedAt: string;
};
