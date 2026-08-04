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
    null,
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
    nameQuery: "Шамот_100%",
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
  assert.match(querySql, /registration\.sample_name like \?/u);
  assert.deepEqual(queryParameters, [
    "2026-07-01",
    "2026-07-31",
    "ЛП-2026-017",
    "%Шамот\\_100\\%%",
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
        batch_number: null,
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
    createdAt: "2026-07-30T09:30:00.000Z",
  }]);
});

test("chemical analysis repository corrects a stable analysis and stores a revision", async () => {
  const queries: Array<{ sql: string; parameters?: unknown[] }> = [];
  const pool = {
    async query(sql: string, parameters?: unknown[]) {
      queries.push({ sql, parameters });
      if (/select[\s\S]+for update/u.test(sql)) {
        if (/from laboratory_sample_registration_journal/u.test(sql)) {
          return [[{
            laboratory_sample_code: "ЛП-2026-019",
            sample_number: "19-Б",
            sample_name: "Шамот кусковой",
          }], []];
        }
        return [[{
          id: "chemical-analysis-1",
          sample_registration_id: "sample-registration-1",
          laboratory_sample_code: "ЛП-2026-017",
          sample_number: "17-А",
          sample_name: "Шамот молотый",
          chemical_analysis_date: analysis.chemicalAnalysisDate,
          chemical_analysis_laboratory_assistant:
            analysis.chemicalAnalysisLaboratoryAssistant,
          batch_number: analysis.batchNumber,
          al2o3: analysis.al2o3,
          fe2o3: analysis.fe2o3,
          sio2: analysis.sio2,
          cao2: analysis.cao2,
          p2o5: analysis.p2o5,
          loss_on_ignition: analysis.lossOnIgnition,
          moisture: analysis.moisture,
          notes: analysis.notes,
          created_at: "2026-07-30T08:30:00.000Z",
        }], []];
      }
      return [[], []];
    },
  } as unknown as DatabasePool;
  const repository = createLaboratoryChemicalAnalysisJournalRepository(pool, {
    createId: () => "chemical-revision-1",
    now: () => new Date("2026-08-04T10:30:00.000Z"),
  });
  const correctedAnalysis = {
    sampleRegistrationId: "sample-registration-2",
    chemicalAnalysisDate: "2026-08-04",
    al2o3: "31,8",
    notes: "Исправлено по журналу.",
  };
  const result = await repository.update({
    id: "chemical-analysis-1",
    analysis: correctedAnalysis,
    correctedByUserId: "laboratory-user",
    correctedByAccountId: "laboratory-account",
    correctedByDisplayName: "Иванова Анна",
  });

  const before = {
    id: "chemical-analysis-1",
    ...analysis,
    laboratorySampleCode: "ЛП-2026-017",
    sampleNumber: "17-А",
    sampleName: "Шамот молотый",
    createdAt: "2026-07-30T08:30:00.000Z",
  };
  const record = {
    id: "chemical-analysis-1",
    ...correctedAnalysis,
    laboratorySampleCode: "ЛП-2026-019",
    sampleNumber: "19-Б",
    sampleName: "Шамот кусковой",
    createdAt: "2026-07-30T08:30:00.000Z",
  };
  assert.deepEqual(result, { before, record });
  assert.match(
    queries[0]?.sql ?? "",
    /where analysis\.id = \?[\s\S]+for update/u,
  );
  assert.deepEqual(queries[0]?.parameters, ["chemical-analysis-1"]);
  assert.match(
    queries[1]?.sql ?? "",
    /from laboratory_sample_registration_journal/u,
  );
  assert.match(queries[1]?.sql ?? "", /for update/u);
  assert.deepEqual(queries[1]?.parameters, ["sample-registration-2"]);
  assert.match(
    queries[2]?.sql ?? "",
    /update laboratory_chemical_analysis_journal/u,
  );
  assert.deepEqual(queries[2]?.parameters, [
    "sample-registration-2",
    "2026-08-04",
    null,
    null,
    "31,8",
    null,
    null,
    null,
    null,
    null,
    null,
    "Исправлено по журналу.",
    "chemical-analysis-1",
  ]);
  assert.match(
    queries[3]?.sql ?? "",
    /insert into laboratory_chemical_analysis_revisions/u,
  );
  assert.equal(queries[3]?.parameters?.[0], "chemical-revision-1");
  assert.equal(queries[3]?.parameters?.[1], "chemical-analysis-1");
  assert.deepEqual(JSON.parse(String(queries[3]?.parameters?.[2])), before);
  assert.deepEqual(JSON.parse(String(queries[3]?.parameters?.[3])), record);
  assert.deepEqual(queries[3]?.parameters?.slice(4), [
    "laboratory-user",
    "laboratory-account",
    "Иванова Анна",
    "2026-08-04T10:30:00.000Z",
  ]);
});
