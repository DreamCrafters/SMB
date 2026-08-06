export type RefractoryWagonSubmission = {
  number: string;
  loadingDate: string;
  productBrand: string;
};

export type RefractoryWagonRecord = {
  id: string;
  number: string;
  loadingDate: string | null;
  productBrand: string | null;
  rawControlDate: string | null;
  firingDates: string[];
  sortingDate: string | null;
  createdAt: string;
};
