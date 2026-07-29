import assert from "node:assert/strict";
import test from "node:test";
import type { DatabasePool } from "../db/pool.js";
import { createLaboratorySampleRegistrationJournalRepository } from "./laboratorySampleRegistrationJournalRepository.js";

const record = {
  sampleNumber: "17-А",
  laboratorySampleCode: "ЛП-2026-017",
  samplingDate: "2026-07-29",
  samplingLaboratoryAssistant: "Иванова А.А.",
  sampleName: "Шамот молотый",
  registrationDate: "2026-07-29",
  samplingLocation: "Склад сырья",
  al2o3: "31,4",
  fe2o3: "2,1",
  sio2: "58,7",
  cao2: "< 0,1",
  p2o5: "0,03",
  lossOnIgnition: "4,2",
  moisture: "0,8",
  chemicalAnalysisDate: "2026-07-30",
  chemicalAnalysisLaboratoryAssistant: "Петрова П.П.",
  batchNumber: "П-42",
  notes: "Без отклонений.",
};

test("sample registration repository stores the complete record and session author", async () => {
  const queries: Array<{ sql: string; parameters?: unknown[] }> = [];
  const pool = {
    async query(sql: string, parameters?: unknown[]) {
      queries.push({ sql, parameters });
      return [[], []];
    },
  } as unknown as DatabasePool;
  const repository = createLaboratorySampleRegistrationJournalRepository(pool, {
    createId: () => "sample-registration-1",
    now: () => new Date("2026-07-30T08:30:00.000Z"),
  });

  const saved = await repository.create({
    record,
    submittedByUserId: "laboratory-user",
    submittedByAccountId: "laboratory-account",
  });

  assert.deepEqual(saved, {
    id: "sample-registration-1",
    ...record,
    createdAt: "2026-07-30T08:30:00.000Z",
  });
  assert.match(
    queries[0]?.sql ?? "",
    /insert into laboratory_sample_registration_journal/u,
  );
  assert.deepEqual(queries[0]?.parameters, [
    "sample-registration-1",
    "17-А",
    "ЛП-2026-017",
    "2026-07-29",
    "Иванова А.А.",
    "Шамот молотый",
    "2026-07-29",
    "Склад сырья",
    "31,4",
    "2,1",
    "58,7",
    "< 0,1",
    "0,03",
    "4,2",
    "0,8",
    "2026-07-30",
    "Петрова П.П.",
    "П-42",
    "Без отклонений.",
    "laboratory-user",
    "laboratory-account",
    "2026-07-30T08:30:00.000Z",
  ]);
});

test("sample registration repository filters history by registration date and search", async () => {
  let querySql = "";
  let queryParameters: unknown[] = [];
  const pool = {
    async query(sql: string, parameters?: unknown[]) {
      querySql = sql;
      queryParameters = parameters ?? [];
      return [[{
        id: "sample-registration-1",
        sample_number: "17-А",
        laboratory_sample_code: "ЛП-2026-017",
        sampling_date: "2026-07-29",
        sampling_laboratory_assistant: "Иванова А.А.",
        sample_name: "Шамот молотый",
        registration_date: "2026-07-29",
        sampling_location: "Склад сырья",
        al2o3: "31,4",
        fe2o3: "2,1",
        sio2: "58,7",
        cao2: "< 0,1",
        p2o5: "0,03",
        loss_on_ignition: "4,2",
        moisture: "0,8",
        chemical_analysis_date: "2026-07-30",
        chemical_analysis_laboratory_assistant: "Петрова П.П.",
        batch_number: "П-42",
        notes: null,
        created_at: "2026-07-30T08:30:00.000Z",
      }], []];
    },
  } as unknown as DatabasePool;
  const repository = createLaboratorySampleRegistrationJournalRepository(pool);
  const { notes: _notes, ...recordWithoutNotes } = record;

  const records = await repository.list({
    dateFrom: "2026-07-01",
    dateTo: "2026-07-31",
    query: "ЛП-2026-017",
  });

  assert.deepEqual(records, [{
    id: "sample-registration-1",
    ...recordWithoutNotes,
    createdAt: "2026-07-30T08:30:00.000Z",
  }]);
  assert.match(querySql, /registration_date >= \?/u);
  assert.match(querySql, /registration_date <= \?/u);
  assert.match(querySql, /instr\(/u);
  assert.match(
    querySql,
    /order by registration_date desc, created_at desc, id desc/u,
  );
  assert.deepEqual(queryParameters, [
    "2026-07-01",
    "2026-07-31",
    "ЛП-2026-017",
    200,
  ]);
});
