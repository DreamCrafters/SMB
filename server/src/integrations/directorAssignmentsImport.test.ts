import assert from "node:assert/strict";
import test from "node:test";
import { previewDirectorAssignmentImport } from "./directorAssignmentsImport.js";

const header = ["Номер задачи", "Дата постановки задачи", "Суть задачи", "Подразделение", "Проект", "Ответственный", "Соисполнители", "Срок выполнения", "Срочность", "Важность", "Этапы", "Факт", "Примечание", "Статус"];
const row = ["1", "01.09.2026", "Проверить расчёт", "Участок", "Проект", "Тестов", "", "08.09.2026 12:00", "Срочно", "Важно", "Этап завершён", "08.09.2026", "Примечание", "Выполнено в срок", "", "", "", "", ""];

test("import preserves completed assignments, legacy fields and stable source identity", () => {
  const first = previewDirectorAssignmentImport([header, row], "2026-09-14T00:00:00Z");
  const second = previewDirectorAssignmentImport([header, row], "2026-09-15T00:00:00Z");
  assert.equal(first.records[0].status, "completed");
  assert.equal(first.records[0].completedOn, "2026-09-08");
  assert.equal(first.records[0].progress, "Этап завершён");
  assert.deepEqual(first.records[0].source?.values, row);
  assert.equal(first.records[0].id, second.records[0].id);
  assert.equal(first.records[0].responsible, null);
  assert.deepEqual(first.records[0].coExecutorIds, []);
  assert.deepEqual(first.warnings, []);
  assert.equal(first.records[0].needsClarification, false);
});

test("same visible number on different dates retains both source assignments", () => {
  const other = [...row]; other[1] = "02.09.2026";
  const result = previewDirectorAssignmentImport([header, row, other], "2026-09-14T00:00:00Z");
  assert.equal(result.records.length, 2);
  assert.notEqual(result.records[0].id, result.records[1].id);
});

test("missing responsibility, deadline and broken status remain explicit legacy warnings", () => {
  const incomplete = [...row]; incomplete[5] = ""; incomplete[7] = ""; incomplete[11] = ""; incomplete[13] = "#REF!";
  const result = previewDirectorAssignmentImport([header, incomplete], "2026-09-14T00:00:00Z");
  assert.equal(result.records[0].needsClarification, true);
  assert.equal(result.records[0].responsible, null);
  assert.equal(result.records[0].currentOccurrenceDate, "");
  assert.equal(result.records[0].source?.originalStatus, "#REF!");
  assert.equal(result.warnings[0].messages.length, 3);
});

test("incomplete completed imports retain warnings and source fields without a parallel status", () => {
  const incomplete = [...row]; incomplete[7] = ""; incomplete[11] = "";
  const result = previewDirectorAssignmentImport([header, incomplete], "2026-09-23T00:00:00Z");
  assert.equal(result.records[0].status, "completed");
  assert.equal(result.records[0].needsClarification, false);
  assert.equal(result.warnings[0].messages.length, 2);
  assert.deepEqual(result.records[0].source?.values, incomplete);
});
