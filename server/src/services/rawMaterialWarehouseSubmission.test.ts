import assert from "node:assert/strict";
import test from "node:test";
import type {
  RawMaterialNomenclatureRepository,
} from "../repositories/rawMaterialNomenclatureRepository.js";
import { canonicalizeRawMaterialWarehouseSubmission } from "./rawMaterialWarehouseSubmission.js";

const record = {
  movementDate: "2026-08-18",
  materialLabel: " глина   бр-1 ",
  stackLocation: "Штабель 4",
  receivedTons: "12.5",
  supplier: "ООО Поставщик",
  shippedTons: "0",
  recipient: "",
};

function createNomenclature(
  labels: string[],
): Pick<RawMaterialNomenclatureRepository, "listLabels"> {
  return {
    async listLabels() {
      return labels;
    },
  };
}

test("warehouse submission uses the canonical nomenclature label", async () => {
  const result = await canonicalizeRawMaterialWarehouseSubmission({
    nomenclature: createNomenclature(["Глина БР-1", "Кварцевая мука R10 EW"]),
    record,
  });

  assert.deepEqual(result, { ...record, materialLabel: "Глина БР-1" });
});

test("warehouse submission rejects a material missing from the nomenclature", async () => {
  const result = await canonicalizeRawMaterialWarehouseSubmission({
    nomenclature: createNomenclature(["Кварцевая мука R10 EW"]),
    record,
  });

  assert.equal(result, undefined);
});
