export type RotaryKiln2FiringJournalSubmission = {
  recordDate: string;
  recordTime: string;
  waterAbsorption: number;
  temperatureBeforeCyclone: number;
  temperatureBeforeFilter: number;
  temperatureInFieldChamber: number;
  temperatureAtRollback: number;
  gasConsumptionPerHour: number;
  vacuum: number;
  pressure: number;
  shiftSupervisor: string;
  burnerOperator: string;
  laboratoryAssistant: string;
  sievePass05: number;
  bulkDensity: number;
  kilnLoadBucketsPerHour: number;
  note?: string;
};

export type RotaryKiln2FiringJournalRecord =
  RotaryKiln2FiringJournalSubmission & {
    id: string;
    createdAt: string;
  };

export type RotaryKiln2FiringJournalFilters = {
  dateFrom?: string;
  dateTo?: string;
  query?: string;
};

export type RotaryKiln2FiringJournalSelection = {
  records: RotaryKiln2FiringJournalRecord[];
  averageBulkDensity: number | null;
};
