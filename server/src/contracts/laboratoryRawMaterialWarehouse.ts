export const laboratoryRawMaterialWarehouseStatuses = [
  "pending",
  "approved",
  "corrected",
] as const;

export type LaboratoryRawMaterialWarehouseStatus =
  (typeof laboratoryRawMaterialWarehouseStatuses)[number];

export const laboratoryRawMaterialWarehouseStatusLabels: Record<
  LaboratoryRawMaterialWarehouseStatus,
  string
> = {
  pending: "Ожидает подтверждения кладовщиком",
  approved: "Утверждено кладовщиком",
  corrected: "Скорректировано кладовщиком",
};

export type LaboratoryRawMaterialWarehouseSubmission = {
  movementDate: string;
  materialLabel: string;
  stackLocation: string;
  receivedTons: string;
  supplier: string;
  shippedTons: string;
  recipient: string;
};

export type LaboratoryRawMaterialWarehouseRecord =
  LaboratoryRawMaterialWarehouseSubmission & {
    id: string;
    revisionNumber: number;
    status: LaboratoryRawMaterialWarehouseStatus;
    submittedByDisplayName: string;
    submittedAt: string;
    warehouseKeeperDisplayName?: string;
    reviewedAt?: string;
  };

export type LaboratoryRawMaterialWarehouseFilters = {
  dateFrom?: string;
  dateTo?: string;
  query?: string;
};

export type LaboratoryRawMaterialWarehouseOptions = {
  /**
   * Доработка задачи 95: допустимые виды сырья берутся из server-owned
   * `Номенклатура → Сырьё`, а не из журнала марок или истории склада.
   */
  materials: string[];
  stackLocations: string[];
  suppliers: string[];
  recipients: string[];
};

export type LaboratoryRawMaterialWarehouseTotals = {
  recordCount: number;
  receivedTons: string;
  shippedTons: string;
  balanceTons: string;
};

export type LaboratoryRawMaterialWarehousePermissions = {
  canSubmit: boolean;
  canReview: boolean;
};

export type LaboratoryRawMaterialWarehouseResponse = {
  records: LaboratoryRawMaterialWarehouseRecord[];
  pendingRecords: LaboratoryRawMaterialWarehouseRecord[];
  options: LaboratoryRawMaterialWarehouseOptions;
  totals: LaboratoryRawMaterialWarehouseTotals;
  permissions: LaboratoryRawMaterialWarehousePermissions;
  draftDate: string;
};

export type LaboratoryRawMaterialWarehouseReviewRequest =
  | { action: "approve" }
  | {
      action: "correct";
      record: LaboratoryRawMaterialWarehouseSubmission;
    };
