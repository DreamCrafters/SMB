import assert from "node:assert/strict";
import test from "node:test";
import {
  laboratoryReviewJournals,
  laboratoryReviewViews,
  selectLaboratoryReviewJournals,
} from "../.test-build/src/services/laboratoryReviewJournals.js";

function readView(id) {
  const view = laboratoryReviewViews.find((item) => item.id === id);
  assert.ok(view, `Expected the ${id} view`);
  return view;
}

test("one button list holds every control section and journal", () => {
  assert.deepEqual(
    laboratoryReviewViews.map((view) => [view.id, view.journal, view.section]),
    [
      ["all", "all", "all"],
      ["incoming", "results", "incoming"],
      ["finished_product", "results", "finished_product"],
      ["sample_registration", "sample_registration", "all"],
      ["chemical_analysis", "chemical_analysis", "all"],
      ["rotary_kiln_2", "rotary_kiln_2", "all"],
    ],
  );
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

test("a control section keeps only the results journal", () => {
  const { visible, excluded } = selectLaboratoryReviewJournals(
    readView("finished_product"),
    { isNameFilterEnabled: false },
  );

  assert.deepEqual(visible.map((journal) => journal.id), ["results"]);
  assert.deepEqual(excluded, []);
});

test("nomenclature filter drops the journal without a nomenclature column", () => {
  const { visible, excluded } = selectLaboratoryReviewJournals(readView("all"), {
    isNameFilterEnabled: true,
  });

  assert.deepEqual(visible.map((journal) => journal.id), [
    "results",
    "sample_registration",
    "chemical_analysis",
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
