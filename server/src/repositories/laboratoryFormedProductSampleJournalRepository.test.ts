import assert from "node:assert/strict";
import test from "node:test";
import type { DatabasePool } from "../db/pool.js";
import { createLaboratoryFormedProductSampleJournalRepository } from "./laboratoryFormedProductSampleJournalRepository.js";
import { LaboratorySampleRegistrationTransmissionUnavailableError } from "./laboratorySampleRegistrationJournalRepository.js";

const record = {
  sortingDate: "2026-08-05",
  sampleCode: "26.19",
  productBrand: "ША-1,3",
};

test("formed product sample repository stores the record and session author", async () => {
  const queries: Array<{ sql: string; parameters?: unknown[] }> = [];
  const pool = {
    async query(sql: string, parameters?: unknown[]) {
      queries.push({ sql, parameters });
      return [[], []];
    },
  } as unknown as DatabasePool;
  const repository = createLaboratoryFormedProductSampleJournalRepository(pool, {
    createId: () => "formed-sample-1",
    now: () => new Date("2026-08-05T08:30:00.000Z"),
  });

  const saved = await repository.create({
    record,
    submittedByUserId: "laboratory-user",
    submittedByAccountId: "laboratory-account",
  });

  assert.deepEqual(saved, {
    id: "formed-sample-1",
    ...record,
    createdAt: "2026-08-05T08:30:00.000Z",
  });
  assert.match(
    queries[0]?.sql ?? "",
    /insert into laboratory_formed_product_sample_journal/u,
  );
  assert.deepEqual(queries[0]?.parameters, [
    "formed-sample-1",
    "2026-08-05",
    "26.19",
    "ША-1,3",
    null,
    "laboratory-user",
    "laboratory-account",
    "2026-08-05T08:30:00.000Z",
  ]);
});

test("formed product sample repository claims a pending transmission on create", async () => {
  const pool = {
    async query() {
      return [[], []];
    },
  } as unknown as DatabasePool;
  const claims: Array<{
    sampleRegistrationId: string;
    target: string;
    targetRecordId: string;
  }> = [];
  const repository = createLaboratoryFormedProductSampleJournalRepository(pool, {
    createId: () => "formed-sample-2",
    now: () => new Date("2026-08-05T08:30:00.000Z"),
    claimSampleRegistrationTransmission: async (input) => {
      claims.push(input);
      return { ok: true };
    },
  });

  const saved = await repository.create({
    record: { ...record, sourceSampleRegistrationId: "sample-registration-1" },
    submittedByUserId: "laboratory-user",
    submittedByAccountId: "laboratory-account",
  });

  assert.equal(saved.sourceSampleRegistrationId, "sample-registration-1");
  assert.deepEqual(claims, [{
    sampleRegistrationId: "sample-registration-1",
    target: "formed_product_sample",
    targetRecordId: "formed-sample-2",
  }]);
});

test("formed product sample repository rejects create when the transmission is unavailable", async () => {
  const pool = {
    async query() {
      return [[], []];
    },
  } as unknown as DatabasePool;
  const repository = createLaboratoryFormedProductSampleJournalRepository(pool, {
    claimSampleRegistrationTransmission: async () => (
      { ok: false, reason: "wrong_target" }
    ),
  });

  await assert.rejects(
    () => repository.create({
      record: { ...record, sourceSampleRegistrationId: "sample-registration-1" },
      submittedByUserId: "laboratory-user",
      submittedByAccountId: "laboratory-account",
    }),
    LaboratorySampleRegistrationTransmissionUnavailableError,
  );
});

test("formed product sample repository corrects a stable row and stores revision", async () => {
  const queries: Array<{ sql: string; parameters?: unknown[] }> = [];
  const pool = {
    async query(sql: string, parameters?: unknown[]) {
      queries.push({ sql, parameters });
      if (/select[\s\S]+for update/u.test(sql)) {
        return [[{
          id: "formed-sample-1",
          sorting_date: record.sortingDate,
          sample_code: record.sampleCode,
          product_brand: record.productBrand,
          source_sample_registration_id: "sample-registration-1",
          created_at: "2026-08-05T08:30:00.000Z",
        }], []];
      }
      return [[], []];
    },
  } as unknown as DatabasePool;
  const repository = createLaboratoryFormedProductSampleJournalRepository(pool, {
    createId: () => "formed-revision-1",
    now: () => new Date("2026-08-05T09:15:00.000Z"),
  });
  const corrected = { ...record, productBrand: "ША-1,7" };

  const result = await repository.update({
    id: "formed-sample-1",
    record: corrected,
    correctedByUserId: "laboratory-user",
    correctedByAccountId: "laboratory-account",
    correctedByDisplayName: "Иванова Анна",
  });

  assert.deepEqual(result, {
    before: record,
    record: {
      id: "formed-sample-1",
      ...corrected,
      sourceSampleRegistrationId: "sample-registration-1",
      createdAt: "2026-08-05T08:30:00.000Z",
    },
  });
  assert.match(queries[0]?.sql ?? "", /for update/u);
  assert.match(
    queries[1]?.sql ?? "",
    /update laboratory_formed_product_sample_journal/u,
  );
  assert.deepEqual(queries[1]?.parameters, [
    "2026-08-05",
    "26.19",
    "ША-1,7",
    "formed-sample-1",
  ]);
  assert.match(
    queries[2]?.sql ?? "",
    /insert into laboratory_formed_product_sample_revisions/u,
  );
  assert.deepEqual(queries[2]?.parameters, [
    "formed-revision-1",
    "formed-sample-1",
    JSON.stringify(record),
    JSON.stringify(corrected),
    "laboratory-user",
    "laboratory-account",
    "Иванова Анна",
    "2026-08-05T09:15:00.000Z",
  ]);
});

test("formed product sample repository filters and maps history", async () => {
  let querySql = "";
  let queryParameters: unknown[] = [];
  const pool = {
    async query(sql: string, parameters?: unknown[]) {
      querySql = sql;
      queryParameters = parameters ?? [];
      return [[{
        id: "formed-sample-1",
        sorting_date: record.sortingDate,
        sample_code: record.sampleCode,
        product_brand: record.productBrand,
        source_sample_registration_id: null,
        created_at: "2026-08-05T08:30:00.000Z",
      }], []];
    },
  } as unknown as DatabasePool;
  const repository = createLaboratoryFormedProductSampleJournalRepository(pool);

  const rows = await repository.list({
    dateFrom: "2026-08-01",
    dateTo: "2026-08-31",
    query: "26.19",
    nameQuery: "ША",
  });

  assert.deepEqual(rows, [{
    id: "formed-sample-1",
    ...record,
    createdAt: "2026-08-05T08:30:00.000Z",
  }]);
  assert.match(querySql, /sorting_date >= \?/u);
  assert.match(querySql, /sorting_date <= \?/u);
  assert.match(querySql, /instr\(/u);
  assert.match(querySql, /product_brand like \?/u);
  assert.deepEqual(queryParameters, [
    "2026-08-01",
    "2026-08-31",
    "26.19",
    "%ША%",
    200,
  ]);
});
