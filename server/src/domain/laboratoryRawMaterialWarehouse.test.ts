import assert from "node:assert/strict";
import test from "node:test";
import { validateLaboratoryRawMaterialWarehouseSubmission } from "./laboratoryRawMaterialWarehouse.js";

const validSubmission = {
  movementDate: "2026-08-18",
  materialLabel: "Глина огнеупорная",
  stackLocation: "Штабель 4, северная сторона",
  receivedTons: "12.5",
  supplier: "ООО Поставщик",
  shippedTons: "3",
  recipient: "Цех формовки",
};

test("raw material warehouse submission normalizes a valid movement", () => {
  assert.deepEqual(
    validateLaboratoryRawMaterialWarehouseSubmission({
      ...validSubmission,
      materialLabel: "  Глина   огнеупорная ",
      supplier: " ООО   Поставщик ",
      recipient: " Цех   формовки ",
    }),
    {
      ok: true,
      value: validSubmission,
    },
  );
});

test("raw material warehouse submission requires a meaningful movement", () => {
  const result = validateLaboratoryRawMaterialWarehouseSubmission({
    ...validSubmission,
    receivedTons: "0",
    supplier: "",
    shippedTons: "0",
    recipient: "",
  });

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.deepEqual(result.errors, [
    "Укажите поступление или отгрузку больше нуля.",
  ]);
});

test("raw material warehouse submission requires counterparties for entered quantities", () => {
  const result = validateLaboratoryRawMaterialWarehouseSubmission({
    ...validSubmission,
    supplier: "",
    recipient: "",
  });

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.deepEqual(result.errors, [
    "Укажите поставщика для поступившего сырья.",
    "Укажите получателя отгруженного сырья.",
  ]);
});

test("raw material warehouse submission rejects negative quantities and invalid dates", () => {
  const result = validateLaboratoryRawMaterialWarehouseSubmission({
    ...validSubmission,
    movementDate: "2026-02-30",
    receivedTons: "-1",
  });

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.deepEqual(result.errors, [
    "Укажите корректную дату движения.",
    "Поле «Поступило, тонн» должно быть неотрицательным числом не более чем с тремя знаками после запятой.",
  ]);
});
