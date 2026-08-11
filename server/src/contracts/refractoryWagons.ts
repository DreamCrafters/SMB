export type RefractoryWagonSubmission = {
  number: string;
  loadingDate: string;
  productBrand: string;
  pressDate: string | null;
  pieceCount: number | null;
  setter: string | null;
  pressOperator: string | null;
  firingOperator: string | null;
  sorter: string | null;
  postFiringCondition: string | null;
  serviceApprovalDate: string | null;
};

export type RefractoryWagonRecord = {
  id: string;
  number: string;
  loadingDate: string | null;
  productBrand: string | null;
  pressDate: string | null;
  pieceCount: number | null;
  setter: string | null;
  pressOperator: string | null;
  rawControlDate: string | null;
  firingOperator: string | null;
  firingDates: string[];
  sorter: string | null;
  sortingDate: string | null;
  postFiringCondition: string | null;
  serviceApprovalDate: string | null;
  createdAt: string;
};
