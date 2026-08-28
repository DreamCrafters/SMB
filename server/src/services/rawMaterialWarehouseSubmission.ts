import type {
  LaboratoryRawMaterialWarehouseSubmission,
} from "../contracts/laboratoryRawMaterialWarehouse.js";
import { normalizeProductionBrandLookupLabel } from "../domain/productionBrand.js";
import type {
  RawMaterialNomenclatureRepository,
} from "../repositories/rawMaterialNomenclatureRepository.js";

type RawMaterialLabelsSource = Pick<
  RawMaterialNomenclatureRepository,
  "listLabels"
>;

export async function canonicalizeRawMaterialWarehouseSubmission({
  nomenclature,
  record,
}: {
  nomenclature: RawMaterialLabelsSource;
  record: LaboratoryRawMaterialWarehouseSubmission;
}): Promise<LaboratoryRawMaterialWarehouseSubmission | undefined> {
  const normalizedMaterialLabel = normalizeProductionBrandLookupLabel(
    record.materialLabel,
  );
  const materialLabel = (await nomenclature.listLabels()).find(
    (label) =>
      normalizeProductionBrandLookupLabel(label) === normalizedMaterialLabel,
  );

  return materialLabel === undefined
    ? undefined
    : { ...record, materialLabel };
}
