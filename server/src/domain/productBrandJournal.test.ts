import assert from "node:assert/strict";
import test from "node:test";
import { validateProductBrandSubmission } from "./productBrandJournal.js";

test("product brand journal accepts a required name and optional characteristics", () => {
  assert.deepEqual(
    validateProductBrandSubmission({
      name: "  ША-8  ",
      description: "  Огнеупорное изделие  ",
      productClass: "",
      applicationIndustry: " Металлургия ",
      normativeDocument: " ГОСТ 390-2018 ",
      geometry: " 230×114×65 ",
      al2o3: " ≥ 30 % ",
      fe2o3: " ≤ 3 % ",
      strength: " 20 Н/мм² ",
    }),
    {
      ok: true,
      value: {
        name: "ША-8",
        normalizedName: "ша-8",
        description: "Огнеупорное изделие",
        productClass: "",
        applicationIndustry: "Металлургия",
        normativeDocument: "ГОСТ 390-2018",
        geometry: "230×114×65",
        al2o3: "≥ 30 %",
        fe2o3: "≤ 3 %",
        strength: "20 Н/мм²",
      },
    },
  );
});

test("product brand journal rejects missing names, oversized values and unknown fields", () => {
  assert.deepEqual(
    validateProductBrandSubmission({
      name: " ",
      description: "",
      productClass: "",
      applicationIndustry: "",
      normativeDocument: "",
      geometry: "",
      al2o3: "",
      fe2o3: "",
      strength: "",
    }),
    { ok: false, errors: ["Введите наименование марки."] },
  );

  const oversized = validateProductBrandSubmission({
    name: "ША-8",
    description: "А".repeat(2001),
    productClass: "",
    applicationIndustry: "",
    normativeDocument: "",
    geometry: "",
    al2o3: "",
    fe2o3: "",
    strength: "",
  });
  assert.equal(oversized.ok, false);

  assert.deepEqual(
    validateProductBrandSubmission({
      name: "ША-8",
      description: "",
      productClass: "",
      applicationIndustry: "",
      normativeDocument: "",
      geometry: "",
      al2o3: "",
      fe2o3: "",
      strength: "",
      hidden: "value",
    }),
    { ok: false, errors: ["Запрос содержит неизвестные поля."] },
  );
});
