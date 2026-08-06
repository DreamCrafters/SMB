export type RefractoryWagonSubmission = {
  number: string;
  loadingDate: string;
  productBrand: string;
  setter: string | null;
  pressOperator: string | null;
};

export type RefractoryWagonRecord = {
  id: string;
  number: string;
  loadingDate: string | null;
  productBrand: string | null;
  setter: string | null;
  pressOperator: string | null;
  rawControlDate: string | null;
  firingDates: string[];
  sortingDate: string | null;
  createdAt: string;
};
