import assert from "node:assert/strict";
import test from "node:test";
import {
  laboratoryReviewCentralLabViews,
  laboratoryReviewJournals,
  laboratoryReviewQualityControlViews,
  laboratoryReviewRootViews,
  laboratoryReviewRefractoryShopViews,
  laboratoryReviewViews,
  selectLaboratoryReviewJournals,
} from "../.test-build/src/services/laboratoryReviewJournals.js";

function readView(id) {
  const view = laboratoryReviewViews.find((item) => item.id === id);
  assert.ok(view, `Expected the ${id} view`);
  return view;
}

test("the root row keeps separate CZL, quality control, and refractory groups", () => {
  assert.deepEqual(
    laboratoryReviewViews.map((view) => [
      view.id,
      view.journal,
      view.section,
      view.group,
    ]),
    [
      ["all", "all", "all", "root"],
      ["chemical_analysis", "chemical_analysis", "all", "central-lab"],
      ["rotary_kiln_2", "rotary_kiln_2", "all", "central-lab"],
      ["unshaped_product_samples", "unshaped_product_samples", "all", "quality-control"],
      ["formed_product_samples", "formed_product_samples", "all", "quality-control"],
      ["verifications", "verifications", "all", "quality-control"],
      ["sample_registration", "sample_registration", "all", "quality-control"],
      ["raw_material_quality", "raw_material_quality", "all", "refractory-shop"],
      ["green_product_quality", "green_product_quality", "all", "refractory-shop"],
    ],
  );
  assert.deepEqual(
    laboratoryReviewRootViews.map((view) => view.id),
    ["all"],
  );
  assert.deepEqual(
    laboratoryReviewCentralLabViews.map((view) => view.id),
    [
      "chemical_analysis",
      "rotary_kiln_2",
    ],
  );
  assert.deepEqual(
    laboratoryReviewQualityControlViews.map((view) => view.id),
    [
      "unshaped_product_samples",
      "formed_product_samples",
      "verifications",
      "sample_registration",
    ],
  );
  assert.deepEqual(
    laboratoryReviewRefractoryShopViews.map((view) => view.id),
    ["raw_material_quality", "green_product_quality"],
  );
});

test("the control sections and their results journal are gone from the review", () => {
  assert.deepEqual(
    laboratoryReviewViews.filter((view) => view.section !== "all"),
    [],
  );
  assert.deepEqual(
    laboratoryReviewJournals.map((journal) => journal.id),
    [
      "sample_registration",
      "chemical_analysis",
      "rotary_kiln_2",
      "unshaped_product_samples",
      "formed_product_samples",
      "verifications",
      "raw_material_quality",
      "green_product_quality",
    ],
  );

  const { visible, excluded } = selectLaboratoryReviewJournals(readView("all"), {
    isNameFilterEnabled: false,
  });
  assert.equal(
    visible.some((journal) => journal.id === "results"),
    false,
  );
  assert.deepEqual(excluded, []);
});

test("every laboratory journal is shown while no narrowing filter is on", () => {
  const { visible, excluded } = selectLaboratoryReviewJournals(readView("all"), {
    isNameFilterEnabled: false,
  });

  assert.deepEqual(
    visible.map((journal) => journal.id),
    laboratoryReviewJournals.map((journal) => journal.id),
  );
  assert.deepEqual(excluded, []);
});

test("nomenclature filter drops the journal without a nomenclature column", () => {
  const { visible, excluded } = selectLaboratoryReviewJournals(readView("all"), {
    isNameFilterEnabled: true,
  });

  assert.deepEqual(visible.map((journal) => journal.id), [
    "sample_registration",
    "chemical_analysis",
    "unshaped_product_samples",
    "formed_product_samples",
    "verifications",
    "raw_material_quality",
    "green_product_quality",
  ]);
  assert.deepEqual(excluded.map(({ journal, reason }) => [journal.id, reason]), [
    ["rotary_kiln_2", "не содержит наименования (номенклатуры)"],
  ]);
});

test("selecting one journal keeps it alone and reports when the filter excludes it", () => {
  const selected = selectLaboratoryReviewJournals(readView("chemical_analysis"), {
    isNameFilterEnabled: true,
  });
  assert.deepEqual(selected.visible.map((journal) => journal.id), [
    "chemical_analysis",
  ]);
  assert.deepEqual(selected.excluded, []);

  const excludedByFilter = selectLaboratoryReviewJournals(
    readView("rotary_kiln_2"),
    { isNameFilterEnabled: true },
  );
  assert.deepEqual(excludedByFilter.visible, []);
  assert.deepEqual(
    excludedByFilter.excluded.map(({ journal }) => journal.id),
    ["rotary_kiln_2"],
  );
});
