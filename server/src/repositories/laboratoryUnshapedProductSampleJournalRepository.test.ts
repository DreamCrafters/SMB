import assert from "node:assert/strict";
import test from "node:test";
import type { DatabasePool } from "../db/pool.js";
import { createLaboratoryUnshapedProductSampleJournalRepository } from "./laboratoryUnshapedProductSampleJournalRepository.js";

const record = {
  sampleNumber: "17",
  sampleDate: "2026-08-05",
  sampledBy: "Иванова А.А.",
  batchNumber: "55",
  sampleCode: ".17",
  productName: "Шамот молотый",
  batchMass: "20 т",
  moisture: "0,8",
  grainComposition: "0–3 мм",
  fireResistance: "1710 °C",
  suitability: "yes" as const,
  notes: "Без замечаний",
};

test("unshaped product sample repository stores the record and session author", async () => {
  const queries: Array<{ sql: string; parameters?: unknown[] }> = [];
  const pool = {
    async query(sql: string, parameters?: unknown[]) {
      queries.push({ sql, parameters });
      return [[], []];
    },
  } as unknown as DatabasePool;
  const repository = createLaboratoryUnshapedProductSampleJournalRepository(pool, {
    createId: () => "unshaped-sample-1",
    now: () => new Date("2026-08-05T08:30:00.000Z"),
  });

  const saved = await repository.create({
    record,
    submittedByUserId: "laboratory-user",
    submittedByAccountId: "laboratory-account",
  });

  assert.deepEqual(saved, {
    id: "unshaped-sample-1",
    ...record,
    createdAt: "2026-08-05T08:30:00.000Z",
  });
  assert.match(
    queries[0]?.sql ?? "",
    /insert into laboratory_unshaped_product_sample_journal/u,
  );
  assert.deepEqual(queries[0]?.parameters, [
    "unshaped-sample-1",
    "17",
    "2026-08-05",
    "Иванова А.А.",
    "55",
    ".17",
    "Шамот молотый",
    "20 т",
    null,
    "0,8",
    "0–3 мм",
    "1710 °C",
    "yes",
    "Без замечаний",
    "laboratory-user",
    "laboratory-account",
    "2026-08-05T08:30:00.000Z",
  ]);
});

test("unshaped product sample repository filters and maps history", async () => {
  let querySql = "";
  let queryParameters: unknown[] = [];
  const pool = {
    async query(sql: string, parameters?: unknown[]) {
      querySql = sql;
      queryParameters = parameters ?? [];
      return [[{
        id: "unshaped-sample-1",
        sample_number: "17",
        sample_date: "2026-08-05",
        sampled_by: "Иванова А.А.",
        batch_number: "55",
        sample_code: ".17",
        product_name: "Шамот молотый",
        batch_mass: "20 т",
        chemical_analysis_number: null,
        moisture: "0,8",
        grain_composition: "0–3 мм",
        fire_resistance: "1710 °C",
        suitability: "yes",
        notes: "Без замечаний",
        created_at: "2026-08-05T08:30:00.000Z",
      }], []];
    },
  } as unknown as DatabasePool;
  const repository = createLaboratoryUnshapedProductSampleJournalRepository(pool);

  const rows = await repository.list({
    dateFrom: "2026-08-01",
    dateTo: "2026-08-31",
    query: ".17",
    nameQuery: "Шамот_100%",
  });

  assert.deepEqual(rows, [{
    id: "unshaped-sample-1",
    ...record,
    createdAt: "2026-08-05T08:30:00.000Z",
  }]);
  assert.match(querySql, /sample_date >= \?/u);
  assert.match(querySql, /sample_date <= \?/u);
  assert.match(querySql, /instr\(/u);
  assert.match(querySql, /product_name like \?/u);
  assert.match(
    querySql,
    /cast\(trim\(sample_number\) as unsigned\)[\s\S]+end desc/u,
  );
  assert.deepEqual(queryParameters, [
    "2026-08-01",
    "2026-08-31",
    ".17",
    "%Шамот\\_100\\%%",
    200,
  ]);
});

test("unshaped product sample repository builds automatic draft values", async () => {
  const queries: string[] = [];
  const pool = {
    async query(sql: string) {
      queries.push(sql);
      if (sql.includes("max(cast")) {
        return [[{ max_sample_number: "17" }], []];
      }
      return [[{ sampled_by: "Иванова А.А." }], []];
    },
  } as unknown as DatabasePool;
  const repository = createLaboratoryUnshapedProductSampleJournalRepository(pool);

  assert.equal(await repository.getNextSampleNumber(), "18");
  assert.equal(await repository.getLastSampledBy(), "Иванова А.А.");
  assert.match(queries[0] ?? "", /max\(cast\(trim\(sample_number\) as unsigned\)\)/u);
  assert.match(queries[1] ?? "", /order by sequence_id desc limit 1/u);
});

test("unshaped product sample repository corrects a stable row and stores revision", async () => {
  const queries: Array<{ sql: string; parameters?: unknown[] }> = [];
  const pool = {
    async query(sql: string, parameters?: unknown[]) {
      queries.push({ sql, parameters });
      if (/select[\s\S]+for update/u.test(sql)) {
        return [[{
          id: "unshaped-sample-1",
          sample_number: record.sampleNumber,
          sample_date: record.sampleDate,
          sampled_by: record.sampledBy,
          batch_number: record.batchNumber,
          sample_code: record.sampleCode,
          product_name: record.productName,
          batch_mass: record.batchMass,
          chemical_analysis_number: "43",
          moisture: record.moisture,
          grain_composition: record.grainComposition,
          fire_resistance: record.fireResistance,
          suitability: record.suitability,
          notes: record.notes,
          created_at: "2026-08-05T08:30:00.000Z",
        }], []];
      }
      return [[], []];
    },
  } as unknown as DatabasePool;
  const repository = createLaboratoryUnshapedProductSampleJournalRepository(pool, {
    createId: () => "unshaped-revision-1",
    now: () => new Date("2026-08-05T09:15:00.000Z"),
  });
  const corrected = {
    ...record,
    productName: "Шамот исправленный",
    suitability: "maybe" as const,
  };

  const result = await repository.update({
    id: "unshaped-sample-1",
    record: corrected,
    correctedByUserId: "laboratory-user",
    correctedByAccountId: "laboratory-account",
    correctedByDisplayName: "Иванова Анна",
  });

  assert.deepEqual(result, {
    before: { ...record, chemicalAnalysisNumber: "43" },
    record: {
      id: "unshaped-sample-1",
      ...corrected,
      chemicalAnalysisNumber: "43",
      createdAt: "2026-08-05T08:30:00.000Z",
    },
  });
  assert.match(queries[0]?.sql ?? "", /for update/u);
  assert.match(
    queries[1]?.sql ?? "",
    /update laboratory_unshaped_product_sample_journal/u,
  );
  assert.match(
    queries[2]?.sql ?? "",
    /insert into laboratory_unshaped_product_sample_revisions/u,
  );
  assert.deepEqual(queries[2]?.parameters, [
    "unshaped-revision-1",
    "unshaped-sample-1",
    JSON.stringify({ ...record, chemicalAnalysisNumber: "43" }),
    JSON.stringify({ ...corrected, chemicalAnalysisNumber: "43" }),
    "laboratory-user",
    "laboratory-account",
    "Иванова Анна",
    "2026-08-05T09:15:00.000Z",
  ]);
});
