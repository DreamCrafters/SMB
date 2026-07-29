import assert from "node:assert/strict";
import test from "node:test";
import type { DatabasePool } from "../db/pool.js";
import { createLaboratoryChemicalAnalysisJournalRepository } from "./laboratoryChemicalAnalysisJournalRepository.js";

const analysis = {
  sampleRegistrationId: "sample-registration-1",
  chemicalAnalysisDate: "2026-07-30",
  chemicalAnalysisLaboratoryAssistant: "Петрова П.П.",
  batchNumber: "П-42",
  al2o3: "31,4",
  fe2o3: "2,1",
  sio2: "58,7",
  cao2: "< 0,1",
  p2o5: "0,03",
  lossOnIgnition: "4,2",
  moisture: "0,8",
  notes: "Без отклонений.",
};

const minimalAnalysis = {
  sampleRegistrationId: "sample-registration-1",
  batchNumber: "П-42",
};

const sample = {
  id: "sample-registration-1",
  laboratorySampleCode: "ЛП-2026-017",
  sampleNumber: "17-А",
  sampleName: "Шамот молотый",
  samplingDate: "2026-07-29",
  registrationDate: "2026-07-30",
};

test("chemical analysis repository stores linked append-only record", async () => {
  const queries: Array<{ sql: string; parameters?: unknown[] }> = [];
  const pool = {
    async query(sql: string, parameters?: unknown[]) {
      queries.push({ sql, parameters });
      return [[], []];
    },
  } as unknown as DatabasePool;
  const repository = createLaboratoryChemicalAnalysisJournalRepository(pool, {
    createId: () => "chemical-analysis-1",
    now: () => new Date("2026-07-30T08:30:00.000Z"),
  });

  assert.deepEqual(await repository.create({
    analysis: minimalAnalysis,
    sample,
    submittedByUserId: "laboratory-user",
    submittedByAccountId: "laboratory-account",
  }), {
    id: "chemical-analysis-1",
    ...minimalAnalysis,
    laboratorySampleCode: "ЛП-2026-017",
    sampleNumber: "17-А",
    sampleName: "Шамот молотый",
    createdAt: "2026-07-30T08:30:00.000Z",
  });
  assert.match(
    queries[0]?.sql ?? "",
    /insert into laboratory_chemical_analysis_journal/u,
  );
  assert.deepEqual(queries[0]?.parameters, [
    "chemical-analysis-1",
    "sample-registration-1",
    null,
    null,
    "П-42",
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    "laboratory-user",
    "laboratory-account",
    "2026-07-30T08:30:00.000Z",
  ]);
});

test("chemical analysis repository lists linked samples with filters", async () => {
  let querySql = "";
  let queryParameters: unknown[] = [];
  const pool = {
    async query(sql: string, parameters?: unknown[]) {
      querySql = sql;
      queryParameters = parameters ?? [];
      return [[{
        id: "chemical-analysis-1",
        sample_registration_id: "sample-registration-1",
        laboratory_sample_code: "ЛП-2026-017",
        sample_number: "17-А",
        sample_name: "Шамот молотый",
        chemical_analysis_date: "2026-07-30",
        chemical_analysis_laboratory_assistant: "Петрова П.П.",
        batch_number: "П-42",
        al2o3: "31,4",
        fe2o3: "2,1",
        sio2: "58,7",
        cao2: "< 0,1",
        p2o5: "0,03",
        loss_on_ignition: "4,2",
        moisture: "0,8",
        notes: null,
        created_at: "2026-07-30T08:30:00.000Z",
      }], []];
    },
  } as unknown as DatabasePool;
  const repository = createLaboratoryChemicalAnalysisJournalRepository(pool);
  const { notes: _notes, ...analysisWithoutNotes } = analysis;

  assert.deepEqual(await repository.list({
    dateFrom: "2026-07-01",
    dateTo: "2026-07-31",
    query: "ЛП-2026-017",
  }), [{
    id: "chemical-analysis-1",
    ...analysisWithoutNotes,
    laboratorySampleCode: "ЛП-2026-017",
    sampleNumber: "17-А",
    sampleName: "Шамот молотый",
    createdAt: "2026-07-30T08:30:00.000Z",
  }]);
  assert.match(
    querySql,
    /join laboratory_sample_registration_journal registration/u,
  );
  assert.match(querySql, /analysis\.chemical_analysis_date >= \?/u);
  assert.match(querySql, /analysis\.chemical_analysis_date <= \?/u);
  assert.match(querySql, /instr\(/u);
  assert.deepEqual(queryParameters, [
    "2026-07-01",
    "2026-07-31",
    "ЛП-2026-017",
    200,
  ]);
});

test("chemical analysis repository omits optional values when they are absent", async () => {
  const pool = {
    async query() {
      return [[{
        id: "chemical-analysis-2",
        sample_registration_id: "sample-registration-1",
        laboratory_sample_code: "ЛП-2026-017",
        sample_number: "17-А",
        sample_name: "Шамот молотый",
        chemical_analysis_date: null,
        chemical_analysis_laboratory_assistant: null,
        batch_number: "П-42",
        al2o3: null,
        fe2o3: null,
        sio2: null,
        cao2: null,
        p2o5: null,
        loss_on_ignition: null,
        moisture: null,
        notes: null,
        created_at: "2026-07-30T09:30:00.000Z",
      }], []];
    },
  } as unknown as DatabasePool;
  const repository = createLaboratoryChemicalAnalysisJournalRepository(pool);

  assert.deepEqual(await repository.list(), [{
    id: "chemical-analysis-2",
    sampleRegistrationId: "sample-registration-1",
    laboratorySampleCode: "ЛП-2026-017",
    sampleNumber: "17-А",
    sampleName: "Шамот молотый",
    batchNumber: "П-42",
    createdAt: "2026-07-30T09:30:00.000Z",
  }]);
});
