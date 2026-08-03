export type RotaryKiln2FiringJournalSubmission = {
  recordDate: string;
  recordTime: string;
  producedMaterial: string;
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
  Omit<RotaryKiln2FiringJournalSubmission, "producedMaterial"> & {
    id: string;
    createdAt: string;
    /**
     * Записи, сохранённые до появления поля, остаются в журнале без марки и не
     * участвуют в расчёте насыпного веса банок.
     */
    producedMaterial?: string;
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

export type RotaryKiln2FiringJournalPersonnelOptions = {
  shiftSupervisors: string[];
  burnerOperators: string[];
};

/**
 * Насыпной вес материала по последним записям журнала печи 2. Банки берут
 * коэффициент только отсюда, поэтому среднее считает backend.
 */
export type RotaryKiln2MaterialBulkDensity = {
  material: string;
  averageBulkDensityTonsPerCubicMeter: number;
  sampleCount: number;
  latestRecordDate: string;
};
