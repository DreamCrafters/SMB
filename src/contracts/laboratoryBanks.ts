import type { RotaryKiln2MaterialBulkDensity } from "./rotaryKiln2FiringJournal";

export type BankNumber = 1 | 2 | 3;

/**
 * Насыпной вес банки приходит из журнала печи 2; `laboratory_result` остаётся
 * только у назначений, сохранённых до перехода на журнал.
 */
export type BankBulkDensitySource =
  | "rotary_kiln_2_journal"
  | "laboratory_result";

export type LaboratoryBankAssignment = {
  assignmentId: string;
  bankNumber: BankNumber;
  materialLabel: string;
  bulkDensityTonsPerCubicMeter: number;
  bulkDensitySource: BankBulkDensitySource;
  bulkDensitySampleCount?: number;
  bulkDensityLatestRecordDate?: string;
  laboratoryResultId?: string;
  sampleIndex?: number;
  sampleIdentifier?: string;
  assignedByDisplayName: string;
  assignedAt: string;
};

export type BankVolumeReference = {
  points: Array<{ heightMeters: number; volumeCubicMeters: number }>;
};

export type LaboratoryBanksResponse = {
  currentAssignments: LaboratoryBankAssignment[];
  history: LaboratoryBankAssignment[];
  availableMaterials: RotaryKiln2MaterialBulkDensity[];
};

export type DispatcherProductionBankContent = Pick<
  LaboratoryBankAssignment,
  "bankNumber" | "materialLabel"
>;

export type DispatcherProductionBankMeasurement = {
  bankNumber: BankNumber;
  start?: number;
  shipmentStart?: number;
  end?: number;
  shipmentEnd?: number;
};

export type DispatcherProductionBankReportRow = {
  bankNumber: BankNumber;
  materialLabel?: string;
  measurements: number[];
  averageHeightMeters?: number;
  bulkDensityTonsPerCubicMeter?: number;
  bulkDensityLatestRecordDate?: string;
  volumeCubicMeters?: number;
  materialMassTons?: number;
  loadedTons?: number;
  shippedTons?: number;
  shipmentMassTons?: number;
};

export type DispatcherProductionBankReport = {
  reportDate: string;
  shiftNumber: 1 | 2;
  coshMaster: string;
  banks: DispatcherProductionBankReportRow[];
};

export type DispatcherProductionBankContentsResponse = {
  bankContents: DispatcherProductionBankContent[];
  bankMeasurements: DispatcherProductionBankMeasurement[];
  bankInput?: {
    currentAssignments: Array<
      Omit<LaboratoryBankAssignment, "assignedByDisplayName">
    >;
    volumeReference: BankVolumeReference;
    coshMasterOptions: string[];
  };
  bankReport?: DispatcherProductionBankReport;
  reportDate: string;
  previousReportDate: string;
};

export type RefractoryBanksResponse = {
  currentAssignments: LaboratoryBankAssignment[];
  volumeReference: BankVolumeReference;
  coshMasterOptions: string[];
};
