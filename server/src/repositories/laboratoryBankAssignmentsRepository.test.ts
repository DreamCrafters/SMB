import assert from "node:assert/strict";
import test from "node:test";
import type { DatabasePool } from "../db/pool.js";
import { createLaboratoryBankAssignmentsRepository } from "./laboratoryBankAssignmentsRepository.js";

test("laboratory bank repository appends assignments with a material snapshot", async () => {
  const queries: Array<{ sql: string; parameters?: unknown[] }> = [];
  const pool = {
    async query(sql: string, parameters?: unknown[]) {
      queries.push({ sql, parameters });
      return [[], []];
    },
  } as unknown as DatabasePool;
  const repository = createLaboratoryBankAssignmentsRepository(pool, {
    createId: () => "assignment-1",
    now: () => new Date("2026-07-23T08:00:00.000Z"),
  });

  const saved = await repository.assign({
    bankNumber: 1,
    laboratoryResultId: "result-1",
    sampleIndex: 2,
    sampleIdentifier: "Вагон 123",
    materialLabel: "ШКИ",
    bulkDensityTonsPerCubicMeter: 1.16,
    assignedByUserId: "user-lab",
    assignedByAccountId: "account-lab",
    assignedByDisplayName: "Иванова А.А.",
  });

  assert.equal(saved.assignmentId, "assignment-1");
  assert.equal(saved.materialLabel, "ШКИ");
  assert.equal(saved.bulkDensityTonsPerCubicMeter, 1.16);
  assert.match(queries[0]?.sql ?? "", /insert into laboratory_bank_assignments/u);
  assert.deepEqual(queries[0]?.parameters?.slice(0, 7), [
    "assignment-1", 1, "result-1", 2, "Вагон 123", "ШКИ", 1.16,
  ]);
});

test("laboratory bank repository reads one latest assignment per bank", async () => {
  let querySql = "";
  const pool = {
    async query(sql: string) {
      querySql = sql;
      return [[{
        id: "assignment-3",
        bank_number: 3,
        laboratory_result_id: "result-3",
        sample_index: 0,
        sample_identifier: "Проба 3",
        material_label: "ШГР-28",
        bulk_density: "1.090000",
        assigned_by_display_name: "Иванова А.А.",
        assigned_at: "2026-07-23T08:00:00.000Z",
      }], []];
    },
  } as unknown as DatabasePool;
  const repository = createLaboratoryBankAssignmentsRepository(pool);

  const assignments = await repository.listCurrent();

  assert.match(querySql, /max\(sequence_id\).*group by bank_number/su);
  assert.equal(assignments[0]?.bankNumber, 3);
  assert.equal(assignments[0]?.bulkDensityTonsPerCubicMeter, 1.09);
});
