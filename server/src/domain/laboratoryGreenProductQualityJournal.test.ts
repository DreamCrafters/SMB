import assert from "node:assert/strict";
import test from "node:test";
import {
  validateLaboratoryGreenProductQualitySubmission,
} from "./laboratoryGreenProductQualityJournal.js";

const validSubmission = {
  recordDate: "2026-08-05",
  pressNumber: "3",
  productBrand: "  ШКУ-32  ",
  setter: "  Иванов   И.И. ",
  pressOperator: "Петров П.П.",
  wagonIds: ["wagon-1", "wagon-2"],
  lengthFirst: "230,5",
  lengthSecond: "231",
  widthFirst: "114",
  widthSecond: "114",
  heightFirst: "64",
  heightSecond: "63,8",
  weight: "3,4",
  mechanicalStrength: "42.5",
  density: "2,11",
  pressOperatorRecommendations: "  Проверить   давление прессования. ",
};

test("green product quality submission normalizes the complete journal record", () => {
  assert.deepEqual(
    validateLaboratoryGreenProductQualitySubmission(validSubmission),
    {
      ok: true,
      value: {
        ...validSubmission,
        productBrand: "ШКУ-32",
        setter: "Иванов И.И.",
        pressOperatorRecommendations: "Проверить давление прессования.",
        // Поля вагона необязательны и приходят из журнала оборота вагонов.
        pressDate: null,
        loadingDate: null,
        pieceCount: null,
      },
    },
  );
});

test("green product quality submission keeps the wagon fields nullable but typed", () => {
  const validation = validateLaboratoryGreenProductQualitySubmission({
    ...validSubmission,
    pressDate: "2026-08-04",
    loadingDate: "2026-08-05",
    pieceCount: "480",
  });

  assert.equal(validation.ok, true);
  if (!validation.ok) return;
  assert.equal(validation.value.pressDate, "2026-08-04");
  assert.equal(validation.value.loadingDate, "2026-08-05");
  assert.equal(validation.value.pieceCount, 480);

  const invalid = validateLaboratoryGreenProductQualitySubmission({
    ...validSubmission,
    pressDate: "04.08.2026",
    pieceCount: "480 шт",
  });

  assert.equal(invalid.ok, false);
  if (invalid.ok) return;
  assert.deepEqual(invalid.errors, [
    "Проверьте поле «Дата пресса».",
    "Проверьте поле «Кол-во шт.».",
  ]);
});

test("green product quality submission rejects unknown presses, duplicate wagons, and non-numeric measurements", () => {
  const validation = validateLaboratoryGreenProductQualitySubmission({
    ...validSubmission,
    pressNumber: "9",
    wagonIds: ["wagon-1", "wagon-1"],
    heightSecond: "63 мм",
  });

  assert.equal(validation.ok, false);
  if (validation.ok) return;
  assert.deepEqual(validation.errors, [
    "Проверьте поле «№ пресса».",
    "Выберите вагоны без повторов.",
    "Проверьте поле «Высота 2».",
  ]);
});
