import assert from "node:assert/strict";
import test from "node:test";
import type { DatabasePool } from "../db/pool.js";
import type { RowDataPacket } from "mysql2/promise";
import {
  createLaboratoryChemicalAnalysisJournalRepository,
  LaboratoryChemicalAnalysisSampleUnavailableError,
  mapSampleChemicalAnalysis,
} from "./laboratoryChemicalAnalysisJournalRepository.js";

test("sample chemical analysis projection keeps optional values separate from sample data", () => {
  const row = {
    linked_analysis_id: "analysis-108",
    linked_laboratory_analysis_number: "108",
    linked_chemical_analysis_date: new Date("2026-09-04T00:00:00.000Z"),
    linked_chemical_analysis_laboratory_assistant: "Петрова П.П.",
    linked_batch_number: "Партия анализа",
    linked_al2o3: "45,6",
    linked_fe2o3: "1.2",
    linked_sio2: "50",
    linked_cao2: "0",
    linked_p2o5: "< 0,1",
    linked_loss_on_ignition: "2",
    linked_moisture: "0,25",
    linked_notes: null,
    batch_number: "Партия пробы",
    moisture: "0,8",
    notes: "Примечание пробы",
  } as unknown as RowDataPacket;
  assert.deepEqual(mapSampleChemicalAnalysis(row), {
    chemicalAnalysis: {
      laboratoryAnalysisNumber: "108",
      chemicalAnalysisDate: "2026-09-04",
      chemicalAnalysisLaboratoryAssistant: "Петрова П.П.",
      batchNumber: "Партия анализа",
      al2o3: "45,6",
      fe2o3: "1.2",
      sio2: "50",
      cao2: "0",
      p2o5: "< 0,1",
      lossOnIgnition: "2",
      moisture: "0,25",
    },
  });
});

test("sample chemical analysis projection distinguishes an empty analysis from no analysis", () => {
  assert.deepEqual(mapSampleChemicalAnalysis({
    linked_analysis_id: "empty-analysis",
    linked_laboratory_analysis_number: null,
    linked_al2o3: null,
    chemical_analysis_number: "old-number",
  } as unknown as RowDataPacket), { chemicalAnalysis: {} });
  assert.deepEqual(mapSampleChemicalAnalysis({
    linked_analysis_id: null,
    linked_al2o3: null,
  } as unknown as RowDataPacket), {});
});

test("sample chemical analysis projection displays legacy registration values without inventing a number", () => {
  assert.deepEqual(mapSampleChemicalAnalysis({
    linked_analysis_id: null,
    linked_laboratory_analysis_number: null,
    linked_al2o3: "60",
    linked_chemical_analysis_date: "2026-08-05",
  } as unknown as RowDataPacket), {
    chemicalAnalysis: { al2o3: "60", chemicalAnalysisDate: "2026-08-05" },
  });
});

const analysis = {
  sampleSource: "sample_registration" as const,
  sampleId: "sample-registration-1",
  laboratoryAnalysisNumber: "43",
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
  sampleSource: "sample_registration" as const,
  sampleId: "sample-registration-1",
};

const sample = {
  sampleSource: "sample_registration" as const,
  sampleId: "sample-registration-1",
  laboratorySampleCode: "ЛП-2026-017",
  sampleNumber: "17-А",
  sampleName: "Шамот молотый",
  sampleDate: "2026-07-29",
  registrationDate: "2026-07-30",
};

test("chemical analysis repository lists only unanalyzed samples from both journals", async () => {
  let querySql = "";
  const pool = {
    async query(sql: string) {
      querySql = sql;
      return [[
        {
          sample_source: "sample_registration",
          sample_id: "sample-registration-1",
          laboratory_sample_code: "ЛП-2026-017",
          sample_number: "17-А",
          sample_name: "Шамот молотый",
          sample_date: "2026-07-29",
          registration_date: "2026-07-30",
        },
        {
          sample_source: "unshaped_product",
          sample_id: "unshaped-product-sample-18",
          laboratory_sample_code: ".18",
          sample_number: "18",
          sample_name: "Мертель МШ-28",
          sample_date: "2026-08-04",
          registration_date: null,
        },
      ], []];
    },
  } as unknown as DatabasePool;
  const repository = createLaboratoryChemicalAnalysisJournalRepository(pool);

  assert.deepEqual(await repository.listAvailableSampleOptions({
    query: ".1",
  }), [
    sample,
    {
      sampleSource: "unshaped_product",
      sampleId: "unshaped-product-sample-18",
      laboratorySampleCode: ".18",
      sampleNumber: "18",
      sampleName: "Мертель МШ-28",
      sampleDate: "2026-08-04",
    },
  ]);
  assert.match(querySql, /from laboratory_sample_registration_journal/u);
  assert.match(querySql, /union all/u);
  assert.match(querySql, /from laboratory_unshaped_product_sample_journal/u);
  assert.match(querySql, /claim\.sample_id is null/u);
});

test("chemical analysis repository stores linked append-only record", async () => {
  const queries: Array<{ sql: string; parameters?: unknown[] }> = [];
  const pool = {
    async query(sql: string, parameters?: unknown[]) {
      queries.push({ sql, parameters });
      if (/from laboratory_sample_registration_journal registration/u.test(sql)) {
        return [[{
          sample_source: "sample_registration",
          sample_id: sample.sampleId,
          laboratory_sample_code: sample.laboratorySampleCode,
          sample_number: sample.sampleNumber,
          sample_name: sample.sampleName,
          sample_date: sample.sampleDate,
          registration_date: sample.registrationDate,
        }], []];
      }
      return [[], []];
    },
  } as unknown as DatabasePool;
  const repository = createLaboratoryChemicalAnalysisJournalRepository(pool, {
    createId: () => "chemical-analysis-1",
    now: () => new Date("2026-07-30T08:30:00.000Z"),
  });

  assert.deepEqual(await repository.create({
    analysis: minimalAnalysis,
    submittedByUserId: "laboratory-user",
    submittedByAccountId: "laboratory-account",
  }), {
    id: "chemical-analysis-1",
    ...minimalAnalysis,
    laboratorySampleCode: "ЛП-2026-017",
    sampleNumber: "17-А",
    sampleName: "Шамот молотый",
    sampleDate: "2026-07-29",
    registrationDate: "2026-07-30",
    createdAt: "2026-07-30T08:30:00.000Z",
  });
  const insert = queries.find((query) =>
    /insert into laboratory_chemical_analysis_journal/u.test(query.sql)
  );
  assert.match(
    insert?.sql ?? "",
    /insert into laboratory_chemical_analysis_journal/u,
  );
  assert.deepEqual(insert?.parameters, [
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
    null,
    null,
    "laboratory-user",
    "laboratory-account",
    "2026-07-30T08:30:00.000Z",
  ]);
  const claim = queries.find((query) =>
    /insert into laboratory_chemical_analysis_sample_claims/u.test(query.sql)
  );
  assert.deepEqual(claim?.parameters, [
    "sample_registration",
    "sample-registration-1",
    "chemical-analysis-1",
  ]);
});

test("chemical analysis repository rejects a sample claimed before the locked write", async () => {
  const queries: string[] = [];
  const pool = {
    async query(sql: string) {
      queries.push(sql);
      return [[], []];
    },
  } as unknown as DatabasePool;
  const repository = createLaboratoryChemicalAnalysisJournalRepository(pool);

  await assert.rejects(
    repository.create({
      analysis: minimalAnalysis,
      submittedByUserId: "laboratory-user",
      submittedByAccountId: "laboratory-account",
    }),
    LaboratoryChemicalAnalysisSampleUnavailableError,
  );
  assert.equal(queries.length, 1);
  assert.match(queries[0] ?? "", /not exists/u);
  assert.match(queries[0] ?? "", /for update/u);
});

test("chemical analysis repository maps an atomic sample-claim collision", async () => {
  const pool = {
    async query(sql: string) {
      if (/from laboratory_sample_registration_journal registration/u.test(sql)) {
        return [[{
          sample_source: "sample_registration",
          sample_id: sample.sampleId,
          laboratory_sample_code: sample.laboratorySampleCode,
          sample_number: sample.sampleNumber,
          sample_name: sample.sampleName,
          sample_date: sample.sampleDate,
          registration_date: sample.registrationDate,
        }], []];
      }
      if (/insert into laboratory_chemical_analysis_sample_claims/u.test(sql)) {
        throw Object.assign(new Error("Duplicate claim"), {
          code: "ER_DUP_ENTRY",
        });
      }
      return [[], []];
    },
  } as unknown as DatabasePool;
  const repository = createLaboratoryChemicalAnalysisJournalRepository(pool);

  await assert.rejects(
    repository.create({
      analysis: minimalAnalysis,
      submittedByUserId: "laboratory-user",
      submittedByAccountId: "laboratory-account",
    }),
    LaboratoryChemicalAnalysisSampleUnavailableError,
  );
});

test("chemical analysis repository links an unshaped sample and publishes its analysis number", async () => {
  const queries: Array<{ sql: string; parameters?: unknown[] }> = [];
  const pool = {
    async query(sql: string, parameters?: unknown[]) {
      queries.push({ sql, parameters });
      if (/from laboratory_unshaped_product_sample_journal unshaped/u.test(sql)) {
        return [[{
          sample_source: "unshaped_product",
          sample_id: "unshaped-product-sample-18",
          laboratory_sample_code: ".18",
          sample_number: "18",
          sample_name: "Мертель МШ-28",
          sample_date: "2026-08-04",
          registration_date: null,
        }], []];
      }
      return [[], []];
    },
  } as unknown as DatabasePool;
  const repository = createLaboratoryChemicalAnalysisJournalRepository(pool, {
    createId: () => "chemical-analysis-2",
    now: () => new Date("2026-08-04T09:30:00.000Z"),
  });

  const created = await repository.create({
    analysis: {
      sampleSource: "unshaped_product",
      sampleId: "unshaped-product-sample-18",
      laboratoryAnalysisNumber: "47",
    },
    submittedByUserId: "laboratory-user",
    submittedByAccountId: "laboratory-account",
  });

  assert.equal(created.laboratorySampleCode, ".18");
  const insert = queries.find((query) =>
    /insert into laboratory_chemical_analysis_journal/u.test(query.sql)
  );
  assert.deepEqual(insert?.parameters?.slice(0, 4), [
    "chemical-analysis-2",
    null,
    "unshaped-product-sample-18",
    "47",
  ]);
  const sampleUpdate = queries.find((query) =>
    /update laboratory_unshaped_product_sample_journal/u.test(query.sql)
  );
  assert.deepEqual(sampleUpdate?.parameters, [
    "47",
    "unshaped-product-sample-18",
  ]);
  const claim = queries.find((query) =>
    /insert into laboratory_chemical_analysis_sample_claims/u.test(query.sql)
  );
  assert.deepEqual(claim?.parameters, [
    "unshaped_product",
    "unshaped-product-sample-18",
    "chemical-analysis-2",
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
        unshaped_product_sample_id: null,
        sample_source: "sample_registration",
        sample_id: "sample-registration-1",
        laboratory_sample_code: "ЛП-2026-017",
        sample_number: "17-А",
        sample_name: "Шамот молотый",
        sample_date: "2026-07-29",
        registration_date: "2026-07-30",
        laboratory_analysis_number: "43",
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
    sampleDate: "2026-07-29",
    registrationDate: "2026-07-30",
    createdAt: "2026-07-30T08:30:00.000Z",
  }]);
  assert.match(
    querySql,
    /left join laboratory_sample_registration_journal registration/u,
  );
  assert.match(querySql, /analysis\.chemical_analysis_date >= \?/u);
  assert.match(querySql, /analysis\.chemical_analysis_date <= \?/u);
  assert.match(querySql, /instr\(/u);
  assert.match(
    querySql,
    /coalesce\(registration\.sample_name, unshaped\.product_name\) like \?/u,
  );
  assert.match(
    querySql,
    /order by\s+case\s+when trim\(coalesce\(registration\.sample_number, unshaped\.sample_number\)\)\s+regexp '\^\[0-9\]\+'/u,
  );
  assert.match(
    querySql,
    /coalesce\(registration\.sample_number, unshaped\.sample_number\) desc/u,
  );
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
        unshaped_product_sample_id: null,
        sample_source: "sample_registration",
        sample_id: "sample-registration-1",
        laboratory_sample_code: "ЛП-2026-017",
        sample_number: "17-А",
        sample_name: "Шамот молотый",
        sample_date: "2026-07-29",
        registration_date: "2026-07-30",
        laboratory_analysis_number: null,
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
    sampleSource: "sample_registration",
    sampleId: "sample-registration-1",
    laboratorySampleCode: "ЛП-2026-017",
    sampleNumber: "17-А",
    sampleName: "Шамот молотый",
    sampleDate: "2026-07-29",
    registrationDate: "2026-07-30",
    createdAt: "2026-07-30T09:30:00.000Z",
  }]);
});

test("chemical analysis repository corrects a stable analysis and stores a revision", async () => {
  const queries: Array<{ sql: string; parameters?: unknown[] }> = [];
  const pool = {
    async query(sql: string, parameters?: unknown[]) {
      queries.push({ sql, parameters });
      if (/select[\s\S]+for update/u.test(sql)) {
        if (/from laboratory_unshaped_product_sample_journal unshaped/u.test(sql)) {
          return [[{
            sample_source: "unshaped_product",
            sample_id: "unshaped-product-sample-19",
            laboratory_sample_code: ".19",
            sample_number: "19",
            sample_name: "Мертель МШ-28",
            sample_date: "2026-08-04",
            registration_date: null,
          }], []];
        }
        return [[{
          id: "chemical-analysis-1",
          sample_registration_id: "sample-registration-1",
          unshaped_product_sample_id: null,
          sample_source: "sample_registration",
          sample_id: "sample-registration-1",
          laboratory_sample_code: "ЛП-2026-017",
          sample_number: "17-А",
          sample_name: "Шамот молотый",
          sample_date: "2026-07-29",
          registration_date: "2026-07-30",
          laboratory_analysis_number: analysis.laboratoryAnalysisNumber,
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
    sampleSource: "unshaped_product" as const,
    sampleId: "unshaped-product-sample-19",
    laboratoryAnalysisNumber: "44",
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
    sampleDate: "2026-07-29",
    registrationDate: "2026-07-30",
    createdAt: "2026-07-30T08:30:00.000Z",
  };
  const record = {
    id: "chemical-analysis-1",
    ...correctedAnalysis,
    laboratorySampleCode: ".19",
    sampleNumber: "19",
    sampleName: "Мертель МШ-28",
    sampleDate: "2026-08-04",
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
    /from laboratory_unshaped_product_sample_journal/u,
  );
  assert.match(queries[1]?.sql ?? "", /for update/u);
  assert.deepEqual(queries[1]?.parameters, [
    "unshaped-product-sample-19",
    "chemical-analysis-1",
  ]);
  assert.match(
    queries[2]?.sql ?? "",
    /update laboratory_chemical_analysis_journal/u,
  );
  assert.deepEqual(queries[2]?.parameters, [
    null,
    "unshaped-product-sample-19",
    "44",
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
  const removedClaim = queries.find((query) =>
    /delete from laboratory_chemical_analysis_sample_claims/u.test(query.sql)
  );
  assert.deepEqual(removedClaim?.parameters, ["chemical-analysis-1"]);
  const replacementClaim = queries.find((query) =>
    /insert into laboratory_chemical_analysis_sample_claims/u.test(query.sql) &&
    /values \(\?, \?, \?\)/u.test(query.sql)
  );
  assert.deepEqual(replacementClaim?.parameters, [
    "unshaped_product",
    "unshaped-product-sample-19",
    "chemical-analysis-1",
  ]);
  const restoredClaim = queries.find((query) =>
    /insert into laboratory_chemical_analysis_sample_claims/u.test(query.sql) &&
    /select \?, \?, analysis\.id/u.test(query.sql)
  );
  assert.deepEqual(restoredClaim?.parameters, [
    "sample_registration",
    "sample-registration-1",
    "sample-registration-1",
  ]);
  const sampleUpdate = queries.find((query) =>
    /update laboratory_unshaped_product_sample_journal/u.test(query.sql)
  );
  assert.deepEqual(sampleUpdate?.parameters, [
    "44",
    "unshaped-product-sample-19",
  ]);
  const revision = queries.find((query) =>
    /insert into laboratory_chemical_analysis_revisions/u.test(query.sql)
  );
  assert.equal(revision?.parameters?.[0], "chemical-revision-1");
  assert.equal(revision?.parameters?.[1], "chemical-analysis-1");
  assert.deepEqual(JSON.parse(String(revision?.parameters?.[2])), before);
  assert.deepEqual(JSON.parse(String(revision?.parameters?.[3])), record);
  assert.deepEqual(revision?.parameters?.slice(4), [
    "laboratory-user",
    "laboratory-account",
    "Иванова Анна",
    "2026-08-04T10:30:00.000Z",
  ]);
});

test("chemical analysis repository corrects a legacy duplicate without changing its claimed sample", async () => {
  const queries: Array<{ sql: string; parameters?: unknown[] }> = [];
  const pool = {
    async query(sql: string, parameters?: unknown[]) {
      queries.push({ sql, parameters });
      if (/where analysis\.id = \?[\s\S]+for update/u.test(sql)) {
        return [[{
          id: "chemical-analysis-legacy",
          sample_registration_id: sample.sampleId,
          unshaped_product_sample_id: null,
          sample_source: "sample_registration",
          sample_id: sample.sampleId,
          laboratory_sample_code: sample.laboratorySampleCode,
          sample_number: sample.sampleNumber,
          sample_name: sample.sampleName,
          sample_date: sample.sampleDate,
          registration_date: sample.registrationDate,
          laboratory_analysis_number: "41",
          chemical_analysis_date: "2026-07-29",
          chemical_analysis_laboratory_assistant: null,
          batch_number: "П-41",
          al2o3: null,
          fe2o3: null,
          sio2: null,
          cao2: null,
          p2o5: null,
          loss_on_ignition: null,
          moisture: null,
          notes: null,
          created_at: "2026-07-29T08:30:00.000Z",
        }], []];
      }
      if (/from laboratory_sample_registration_journal registration/u.test(sql)) {
        if (/not exists/u.test(sql)) return [[], []];
        return [[{
          sample_source: "sample_registration",
          sample_id: sample.sampleId,
          laboratory_sample_code: sample.laboratorySampleCode,
          sample_number: sample.sampleNumber,
          sample_name: sample.sampleName,
          sample_date: sample.sampleDate,
          registration_date: sample.registrationDate,
        }], []];
      }
      return [[], []];
    },
  } as unknown as DatabasePool;
  const repository = createLaboratoryChemicalAnalysisJournalRepository(pool, {
    createId: () => "chemical-revision-legacy",
    now: () => new Date("2026-08-05T10:30:00.000Z"),
  });

  const result = await repository.update({
    id: "chemical-analysis-legacy",
    analysis: {
      sampleSource: "sample_registration",
      sampleId: sample.sampleId,
      laboratoryAnalysisNumber: "41",
      chemicalAnalysisDate: "2026-07-29",
      batchNumber: "П-41 исправлено",
    },
    correctedByUserId: "laboratory-user",
    correctedByAccountId: "laboratory-account",
    correctedByDisplayName: "Иванова Анна",
  });

  assert.equal(result?.record.batchNumber, "П-41 исправлено");
  const sampleRead = queries.find((query) =>
    /from laboratory_sample_registration_journal registration/u.test(query.sql)
  );
  assert.doesNotMatch(sampleRead?.sql ?? "", /not exists/u);
  assert.equal(
    queries.some((query) =>
      /delete from laboratory_chemical_analysis_sample_claims/u.test(query.sql)
    ),
    false,
  );
  assert.equal(
    queries.some((query) =>
      /insert into laboratory_chemical_analysis_sample_claims/u.test(query.sql)
    ),
    false,
  );
});

test("chemical analysis repository clears the mirrored number when moving away from an unshaped sample", async () => {
  const queries: Array<{ sql: string; parameters?: unknown[] }> = [];
  const pool = {
    async query(sql: string, parameters?: unknown[]) {
      queries.push({ sql, parameters });
      if (/where analysis\.id = \?[\s\S]+for update/u.test(sql)) {
        return [[{
          id: "chemical-analysis-1",
          sample_registration_id: null,
          unshaped_product_sample_id: "unshaped-product-sample-18",
          sample_source: "unshaped_product",
          sample_id: "unshaped-product-sample-18",
          laboratory_sample_code: ".18",
          sample_number: "18",
          sample_name: "Мертель МШ-28",
          sample_date: "2026-08-04",
          registration_date: null,
          laboratory_analysis_number: "47",
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
          created_at: "2026-08-04T09:30:00.000Z",
        }], []];
      }
      if (/from laboratory_sample_registration_journal registration/u.test(sql)) {
        return [[{
          sample_source: "sample_registration",
          sample_id: sample.sampleId,
          laboratory_sample_code: sample.laboratorySampleCode,
          sample_number: sample.sampleNumber,
          sample_name: sample.sampleName,
          sample_date: sample.sampleDate,
          registration_date: sample.registrationDate,
        }], []];
      }
      return [[], []];
    },
  } as unknown as DatabasePool;
  const repository = createLaboratoryChemicalAnalysisJournalRepository(pool, {
    createId: () => "chemical-revision-2",
    now: () => new Date("2026-08-05T08:30:00.000Z"),
  });

  await repository.update({
    id: "chemical-analysis-1",
    analysis: {
      sampleSource: "sample_registration",
      sampleId: sample.sampleId,
      laboratoryAnalysisNumber: "48",
    },
    correctedByUserId: "laboratory-user",
    correctedByAccountId: "laboratory-account",
    correctedByDisplayName: "Иванова Анна",
  });

  const analysisUpdate = queries.find((query) =>
    /update laboratory_chemical_analysis_journal/u.test(query.sql)
  );
  assert.deepEqual(analysisUpdate?.parameters?.slice(0, 3), [
    sample.sampleId,
    null,
    "48",
  ]);
  const clearedSample = queries.find((query) =>
    /update laboratory_unshaped_product_sample_journal/u.test(query.sql)
  );
  assert.deepEqual(clearedSample?.parameters, [
    null,
    "unshaped-product-sample-18",
  ]);
});

test("chemical analysis repository suggests the next numeric analysis number", async () => {
  let querySql = "";
  const pool = {
    async query(sql: string) {
      querySql = sql;
      return [[{ analysis_number: "184467440737095516160" }], []];
    },
  } as unknown as DatabasePool;
  const repository = createLaboratoryChemicalAnalysisJournalRepository(pool);

  assert.equal(
    await repository.getNextLaboratoryAnalysisNumber(),
    "184467440737095516161",
  );
  assert.match(
    querySql,
    /trim\(leading '0' from trim\(laboratory_analysis_number\)\)/u,
  );
  assert.match(
    querySql,
    /trim\(laboratory_analysis_number\) regexp '\^\[0-9\]\+\$'/u,
  );
  assert.match(
    querySql,
    /char_length\(analysis_number\) desc,[\s\S]+analysis_number desc[\s\S]+limit 1/u,
  );
});

test("chemical analysis repository starts numbering when numeric history is empty", async () => {
  const pool = {
    async query() {
      return [[], []];
    },
  } as unknown as DatabasePool;
  const repository = createLaboratoryChemicalAnalysisJournalRepository(pool);

  assert.equal(await repository.getNextLaboratoryAnalysisNumber(), "1");
});

test("chemical analysis repository lists every distinct laboratory assistant", async () => {
  let querySql = "";
  const pool = {
    async query(sql: string) {
      querySql = sql;
      return [[
        { chemical_analysis_laboratory_assistant: "Петрова П.П." },
        { chemical_analysis_laboratory_assistant: "Иванова А.А." },
      ], []];
    },
  } as unknown as DatabasePool;
  const repository = createLaboratoryChemicalAnalysisJournalRepository(pool);

  assert.deepEqual(await repository.listLaboratoryAssistants(), [
    "Петрова П.П.",
    "Иванова А.А.",
  ]);
  assert.match(
    querySql,
    /group by chemical_analysis_laboratory_assistant/u,
  );
  assert.match(querySql, /order by\s+max\(created_at\) desc/u);
  assert.doesNotMatch(querySql, /limit/u);
});

test("chemical analysis repository orders numeric values without leading-zero inflation", async () => {
  const pool = {
    async query(sql: string) {
      assert.match(
        sql,
        /coalesce\([\s\S]+trim\(leading '0' from trim\(laboratory_analysis_number\)\)[\s\S]+,\s*'0'[\s\S]+\) as analysis_number/u,
      );
      assert.match(
        sql,
        /order by\s+char_length\(analysis_number\) desc,\s+analysis_number desc/u,
      );
      return [[{ analysis_number: "99" }], []];
    },
  } as unknown as DatabasePool;
  const repository = createLaboratoryChemicalAnalysisJournalRepository(pool);

  assert.equal(await repository.getNextLaboratoryAnalysisNumber(), "100");
});
