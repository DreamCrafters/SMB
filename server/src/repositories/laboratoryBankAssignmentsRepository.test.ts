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
    materialLabel: "ШКИ",
    bulkDensityTonsPerCubicMeter: 1.16,
    bulkDensitySource: "rotary_kiln_2_journal",
    bulkDensitySampleCount: 10,
    assignedByUserId: "user-lab",
    assignedByAccountId: "account-lab",
    assignedByDisplayName: "Иванова А.А.",
  });

  assert.equal(saved.assignmentId, "assignment-1");
  assert.equal(saved.materialLabel, "ШКИ");
  assert.equal(saved.bulkDensityTonsPerCubicMeter, 1.16);
  assert.equal(saved.bulkDensitySource, "rotary_kiln_2_journal");
  assert.equal(saved.bulkDensitySampleCount, 10);
  assert.match(queries[0]?.sql ?? "", /insert into laboratory_bank_assignments/u);
  assert.deepEqual(queries[0]?.parameters?.slice(0, 6), [
    "assignment-1", 1, "ШКИ", 1.16, "rotary_kiln_2_journal", 10,
  ]);
});

test("laboratory bank repository reads latest journal and legacy assignments", async () => {
  let querySql = "";
  const pool = {
    async query(sql: string) {
      querySql = sql;
      return [[{
        id: "assignment-3",
        bank_number: 3,
        laboratory_result_id: null,
        sample_index: null,
        sample_identifier: null,
        material_label: "ШГР-28",
        bulk_density: "1.090000",
        bulk_density_source: "rotary_kiln_2_journal",
        bulk_density_sample_count: 7,
        assigned_by_display_name: "Иванова А.А.",
        assigned_at: "2026-07-23T08:00:00.000Z",
      }, {
        id: "assignment-legacy",
        bank_number: 2,
        laboratory_result_id: "result-2",
        sample_index: 0,
        sample_identifier: "Неформованные изделия",
        material_label: "ШКИ-66",
        bulk_density: "1.160000",
        bulk_density_source: "laboratory_result",
        bulk_density_sample_count: null,
        assigned_by_display_name: "Иванова А.А.",
        assigned_at: "2026-07-22T08:00:00.000Z",
      }], []];
    },
  } as unknown as DatabasePool;
  const repository = createLaboratoryBankAssignmentsRepository(pool);

  const assignments = await repository.listCurrent();

  assert.match(querySql, /max\(sequence_id\).*group by bank_number/su);
  assert.match(
    querySql,
    /left join laboratory_results result.*laboratory_result_id is null\s*or result\.section = 'finished_product'/su,
  );
  assert.deepEqual(assignments[0], {
    assignmentId: "assignment-3",
    bankNumber: 3,
    materialLabel: "ШГР-28",
    bulkDensityTonsPerCubicMeter: 1.09,
    bulkDensitySource: "rotary_kiln_2_journal",
    bulkDensitySampleCount: 7,
    assignedByDisplayName: "Иванова А.А.",
    assignedAt: "2026-07-23T08:00:00.000Z",
  });
  assert.deepEqual(assignments[1], {
    assignmentId: "assignment-legacy",
    bankNumber: 2,
    materialLabel: "ШКИ-66",
    bulkDensityTonsPerCubicMeter: 1.16,
    bulkDensitySource: "laboratory_result",
    laboratoryResultId: "result-2",
    sampleIndex: 0,
    sampleIdentifier: "Неформованные изделия",
    assignedByDisplayName: "Иванова А.А.",
    assignedAt: "2026-07-22T08:00:00.000Z",
  });
});
