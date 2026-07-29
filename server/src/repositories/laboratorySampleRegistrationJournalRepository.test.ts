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
};

const linkedAnalysis = {
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
  const { notes: _notes, ...analysisWithoutNotes } = linkedAnalysis;

  const records = await repository.list({
    dateFrom: "2026-07-01",
    dateTo: "2026-07-31",
    query: "ЛП-2026-017",
  });

  assert.deepEqual(records, [{
    id: "sample-registration-1",
    ...record,
    ...analysisWithoutNotes,
    createdAt: "2026-07-30T08:30:00.000Z",
  }]);
  assert.match(querySql, /registration\.registration_date >= \?/u);
  assert.match(querySql, /registration\.registration_date <= \?/u);
  assert.match(querySql, /instr\(/u);
  assert.match(
    querySql,
    /left join laboratory_chemical_analysis_journal analysis/u,
  );
  assert.match(querySql, /select max\(latest\.sequence_id\)/u);
  assert.match(
    querySql,
    /case when analysis\.id is null\s+then registration\.al2o3 else analysis\.al2o3 end as al2o3/u,
  );
  assert.match(
    querySql,
    /registration\.registration_date desc/u,
  );
  assert.deepEqual(queryParameters, [
    "2026-07-01",
    "2026-07-31",
    "ЛП-2026-017",
    200,
  ]);
});

test("sample registration repository omits chemistry until an analysis exists", async () => {
  const pool = {
    async query() {
      return [[{
        id: "sample-registration-2",
        sample_number: "18-Б",
        laboratory_sample_code: "ЛП-2026-018",
        sampling_date: "2026-07-30",
        sampling_laboratory_assistant: "Иванова А.А.",
        sample_name: "Глина огнеупорная",
        registration_date: "2026-07-30",
        sampling_location: "Склад сырья",
        al2o3: null,
        fe2o3: null,
        sio2: null,
        cao2: null,
        p2o5: null,
        loss_on_ignition: null,
        moisture: null,
        chemical_analysis_date: null,
        chemical_analysis_laboratory_assistant: null,
        batch_number: null,
        notes: null,
        created_at: "2026-07-30T09:00:00.000Z",
      }], []];
    },
  } as unknown as DatabasePool;
  const repository = createLaboratorySampleRegistrationJournalRepository(pool);

  assert.deepEqual(await repository.list(), [{
    id: "sample-registration-2",
    sampleNumber: "18-Б",
    laboratorySampleCode: "ЛП-2026-018",
    samplingDate: "2026-07-30",
    samplingLaboratoryAssistant: "Иванова А.А.",
    sampleName: "Глина огнеупорная",
    registrationDate: "2026-07-30",
    samplingLocation: "Склад сырья",
    createdAt: "2026-07-30T09:00:00.000Z",
  }]);
});

test("sample registration repository lists and resolves selectable samples", async () => {
  const queries: Array<{ sql: string; parameters?: unknown[] }> = [];
  const optionRow = {
    id: "sample-registration-1",
    laboratory_sample_code: "ЛП-2026-017",
    sample_number: "17-А",
    sample_name: "Шамот молотый",
    sampling_date: "2026-07-29",
    registration_date: "2026-07-30",
  };
  const pool = {
    async query(sql: string, parameters?: unknown[]) {
      queries.push({ sql, parameters });
      return [[optionRow], []];
    },
  } as unknown as DatabasePool;
  const repository = createLaboratorySampleRegistrationJournalRepository(pool);
  const expectedOption = {
    id: "sample-registration-1",
    laboratorySampleCode: "ЛП-2026-017",
    sampleNumber: "17-А",
    sampleName: "Шамот молотый",
    samplingDate: "2026-07-29",
    registrationDate: "2026-07-30",
  };

  assert.deepEqual(await repository.listOptions({
    query: "ЛП-2020-001",
    limit: 50,
  }), [expectedOption]);
  assert.deepEqual(
    await repository.findOptionById("sample-registration-1"),
    expectedOption,
  );
  assert.match(queries[0]?.sql ?? "", /where instr\(/u);
  assert.deepEqual(queries[0]?.parameters, ["ЛП-2020-001", 50]);
  assert.match(queries[1]?.sql ?? "", /where id = \?/u);
  assert.deepEqual(queries[1]?.parameters, ["sample-registration-1"]);
});
