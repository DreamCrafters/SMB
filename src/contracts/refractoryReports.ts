export const refractoryReportTypes = ["cosh", "equipment", "firing"] as const;
export type RefractoryReportType = (typeof refractoryReportTypes)[number];
export type RefractoryShiftNumber = 1 | 2;
export type RefractoryReportStatus = "pending" | "rejected" | "approved";

export const refractoryReportLabels: Record<RefractoryReportType, string> = {
  cosh: "ЦОШ",
  equipment: "Сводка по работе оборудования",
  firing: "Печное отделение",
};

export const refractoryEquipmentNames = [
  "Пресс СМ-1085 №1",
  "СМ-1085 №2",
  "СМ-1085 №3",
  "СМ-1085 №4",
  "СМ-1085 №5",
  "СМ-1085 №6",
  "СМ-1085 №7",
  "СМ-1085 №8",
  "Пресс 4КФ-200 №1",
  "4КФ-200 №2",
  "Пресс «ФЕЩЕНКО» №1",
  "«ФЕЩЕНКО» №2",
  "«ФЕЩЕНКО» №3",
  "«ФЕЩЕНКО» №4",
  "Пресс «ТАТПЛЕН»",
] as const;

export type RefractoryCoshPayload = {
  kilnNumber?: string;
  chamotteOutputRows?: Array<{
    productBrand: string;
    quantityTons: number;
  }>;
  /** Legacy shape kept for revisions saved before dynamic brand rows. */
  chamotteOutput?: Partial<Record<"shbo" | "shgr1" | "shgr2" | "shki", number>>;
  loadingBucketsPerHour?: number;
  totalLoadingBuckets?: number;
  jarMeasurements?: Array<{
    jarNumber: 1 | 2 | 3;
    values: number[];
    bankLabel?: string;
    material?: string;
    assignmentId?: string;
    bulkDensitySource?: string;
    bulkDensitySampleCount?: number;
    laboratoryResultId?: string;
    sampleIndex?: number;
    sampleIdentifier?: string;
    assignmentAssignedAt?: string;
    averageHeightMeters?: number;
    volumeCubicMeters?: number;
    bulkDensityTonsPerCubicMeter?: number;
    materialMassTons?: number;
  }>;
  bunkerFill?: Array<{
    bunker: "I" | "II" | "III" | "IV";
    productName?: string;
    quantity?: number;
  }>;
  chamotteSupply?: Array<{
    source: "I" | "II" | "III" | "street";
    productName?: string;
    quantity?: number;
  }>;
  bagging?: { jarNumber?: string; quantity?: number };
  scrapRemovalTons?: number;
  furnaceIgnitionTime?: string;
  loadingStartTime?: string;
  bunkerTransitionTime?: string;
  bunkerNumber?: string;
  jarTransitionTime?: string;
  jarNumber?: string;
  furnaceStopTime?: string;
  note?: string;
};

export type RefractoryEquipmentPayload = {
  formedRows: Array<{
    equipment: (typeof refractoryEquipmentNames)[number];
    productBrand?: string;
    outputNorm?: number;
    actualPieces?: number;
    actualTons?: number;
    workedHours?: number;
    mechanicalRepairHours?: number;
    electricalRepairHours?: number;
    carriageReplacementHours?: number;
    brandReplacementHours?: number;
    moldReplacementHours?: number;
    reserveHours?: number;
    workerAbsenceHours?: number;
    rawMaterialAbsenceHours?: number;
    note?: string;
    totalDowntimeHours?: number;
  }>;
  unformedRows: Array<{
    productBrand: string;
    outputNormContainers?: number;
    actualContainers?: number;
    actualTons?: number;
  }>;
};

export type RefractoryFiringPayload = {
  rows: Array<{
    productBrand: string;
    firingWagons?: RefractoryFiringWagonReference[];
    firingDate?: string;
    firingOperator?: string;
    sortingWagons?: RefractoryFiringWagonReference[];
    sortingDate?: string;
    sorter?: string;
    quantityPieces?: number;
    palletCount?: number;
    goodTonsAverageWeight?: number;
    goodTonsWeighed?: number;
    rejectUnderburnPieces?: number;
    rejectCracksPieces?: number;
    rejectFusionPieces?: number;
    rejectChipsPieces?: number;
    note?: string;
    rejectTotalPieces?: number;
  }>;
  calcinationHours?: number;
  sorterCount?: number;
  planFailureReason?: string;
};

export type RefractoryFiringWagonReference = {
  id: string;
  number?: string;
};

export type RefractoryReportSubmission =
  | {
      reportType: "cosh";
      reportDate: string;
      shiftNumber: RefractoryShiftNumber;
      payload: RefractoryCoshPayload;
    }
  | {
      reportType: "equipment";
      reportDate: string;
      shiftNumber: RefractoryShiftNumber;
      payload: RefractoryEquipmentPayload;
    }
  | {
      reportType: "firing";
      reportDate: string;
      shiftNumber: RefractoryShiftNumber;
      payload: RefractoryFiringPayload;
    };

export type RefractoryReportRevision = RefractoryReportSubmission & {
  id: string;
  revisionNumber: number;
  status: RefractoryReportStatus;
  totals: Record<string, number>;
  masterDisplayName: string;
  submittedAt: string;
  reviewerDisplayName?: string;
  reviewedAt?: string;
  rejectionComment?: string;
};

export type RefractoryReportDecision =
  | { decision: "approve" }
  | { decision: "reject"; comment: string };

export type RefractoryReportsResponse = { reports: RefractoryReportRevision[] };
export type RefractoryReportResponse = { report: RefractoryReportRevision };
