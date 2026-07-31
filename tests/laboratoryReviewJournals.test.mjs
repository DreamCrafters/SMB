import assert from "node:assert/strict";
import test from "node:test";
import {
  laboratoryReviewJournals,
  selectLaboratoryReviewJournals,
} from "../.test-build/src/services/laboratoryReviewJournals.js";

test("every laboratory journal is shown while no narrowing filter is on", () => {
  const { visible, excluded } = selectLaboratoryReviewJournals("all", {
    section: "all",
    isNameFilterEnabled: false,
  });

  assert.deepEqual(
    visible.map((journal) => journal.id),
    laboratoryReviewJournals.map((journal) => journal.id),
  );
  assert.deepEqual(excluded, []);
});

test("section filter keeps only the journal split into incoming and finished control", () => {
  const { visible, excluded } = selectLaboratoryReviewJournals("all", {
    section: "finished_product",
    isNameFilterEnabled: false,
  });

  assert.deepEqual(visible.map((journal) => journal.id), ["results"]);
  assert.deepEqual(excluded.map(({ journal, reason }) => [journal.id, reason]), [
    ["sample_registration", "не делится на входящий и выходящий контроль"],
    ["chemical_analysis", "не делится на входящий и выходящий контроль"],
    ["rotary_kiln_2", "не делится на входящий и выходящий контроль"],
  ]);
});

test("nomenclature filter drops the journal without a nomenclature column", () => {
  const { visible, excluded } = selectLaboratoryReviewJournals("all", {
    section: "all",
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
  const selected = selectLaboratoryReviewJournals("chemical_analysis", {
    section: "all",
    isNameFilterEnabled: true,
  });
  assert.deepEqual(selected.visible.map((journal) => journal.id), [
    "chemical_analysis",
  ]);
  assert.deepEqual(selected.excluded, []);

  const excludedByFilter = selectLaboratoryReviewJournals("rotary_kiln_2", {
    section: "all",
    isNameFilterEnabled: true,
  });
  assert.deepEqual(excludedByFilter.visible, []);
  assert.deepEqual(
    excludedByFilter.excluded.map(({ journal }) => journal.id),
    ["rotary_kiln_2"],
  );
});
