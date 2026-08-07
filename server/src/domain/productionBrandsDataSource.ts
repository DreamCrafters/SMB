export type ProductionBrandReference = {
  fieldName: string;
  label: string;
};

export type ProductionBrandResolution =
  | { ok: true; references: ProductionBrandReference[] }
  | { ok: false; missing: ProductionBrandReference };

export type ProductionBrandsDataSource = {
  list: () => Promise<string[]>;
  acquireReferenceMutationLock?: (
    signal?: AbortSignal,
  ) => Promise<() => Promise<void>>;
  resolveReferences: (
    references: ProductionBrandReference[],
  ) => Promise<ProductionBrandResolution>;
};
