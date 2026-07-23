export type BankNumber = 1 | 2 | 3;

export type LaboratoryBankAssignment = {
  assignmentId: string;
  bankNumber: BankNumber;
  laboratoryResultId: string;
  sampleIndex: number;
  sampleIdentifier: string;
  materialLabel: string;
  bulkDensityTonsPerCubicMeter: number;
  assignedByDisplayName: string;
  assignedAt: string;
};

export type LaboratoryBankProduct = {
  laboratoryResultId: string;
  productType: string;
  productBrand: string;
  analysisDate: string;
  bulkDensityTonsPerCubicMeter: number;
};

export type BankVolumeReference = {
  points: Array<{ heightMeters: number; volumeCubicMeters: number }>;
};

export type LaboratoryBanksResponse = {
  currentAssignments: LaboratoryBankAssignment[];
  history: LaboratoryBankAssignment[];
  eligibleProducts: LaboratoryBankProduct[];
};

export type RefractoryBanksResponse = {
  currentAssignments: LaboratoryBankAssignment[];
  volumeReference: BankVolumeReference;
};
