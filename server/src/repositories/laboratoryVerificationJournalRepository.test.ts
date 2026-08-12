import assert from "node:assert/strict";
import test from "node:test";
import type { DatabasePool } from "../db/pool.js";
import { createLaboratoryVerificationJournalRepository } from "./laboratoryVerificationJournalRepository.js";
import { LaboratorySampleRegistrationTransmissionUnavailableError } from "./laboratorySampleRegistrationJournalRepository.js";

const record = {
  verificationDate: "2026-08-05",
  productName: "Шамот молотый",
  samplingLocation: "Склад сырья",
  sampleCode: "26.19",
};

test("verification repository stores the record and session author", async () => {
  const queries: Array<{ sql: string; parameters?: unknown[] }> = [];
  const pool = {
    async query(sql: string, parameters?: unknown[]) {
      queries.push({ sql, parameters });
      return [[], []];
    },
  } as unknown as DatabasePool;
  const repository = createLaboratoryVerificationJournalRepository(pool, {
    createId: () => "verification-1",
    now: () => new Date("2026-08-05T08:30:00.000Z"),
  });

  const saved = await repository.create({
    record,
    submittedByUserId: "laboratory-user",
    submittedByAccountId: "laboratory-account",
  });

  assert.deepEqual(saved, {
    id: "verification-1",
    ...record,
    createdAt: "2026-08-05T08:30:00.000Z",
  });
  assert.match(
    queries[0]?.sql ?? "",
    /insert into laboratory_verification_journal/u,
  );
  assert.deepEqual(queries[0]?.parameters, [
    "verification-1",
    "2026-08-05",
    "Шамот молотый",
    "Склад сырья",
    "26.19",
    null,
    "laboratory-user",
    "laboratory-account",
    "2026-08-05T08:30:00.000Z",
  ]);
});

test("verification repository claims a pending transmission on create", async () => {
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
  const repository = createLaboratoryVerificationJournalRepository(pool, {
    createId: () => "verification-2",
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
    target: "verification",
    targetRecordId: "verification-2",
  }]);
});

test("verification repository rejects create when the transmission is unavailable", async () => {
  const pool = {
    async query() {
      return [[], []];
    },
  } as unknown as DatabasePool;
  const repository = createLaboratoryVerificationJournalRepository(pool, {
    claimSampleRegistrationTransmission: async () => (
      { ok: false, reason: "not_found" }
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

test("verification repository corrects a stable row and stores revision", async () => {
  const queries: Array<{ sql: string; parameters?: unknown[] }> = [];
  const pool = {
    async query(sql: string, parameters?: unknown[]) {
      queries.push({ sql, parameters });
      if (/select[\s\S]+for update/u.test(sql)) {
        return [[{
          id: "verification-1",
          verification_date: record.verificationDate,
          product_name: record.productName,
          sampling_location: record.samplingLocation,
          sample_code: record.sampleCode,
          source_sample_registration_id: "sample-registration-1",
          created_at: "2026-08-05T08:30:00.000Z",
        }], []];
      }
      return [[], []];
    },
  } as unknown as DatabasePool;
  const repository = createLaboratoryVerificationJournalRepository(pool, {
    createId: () => "verification-revision-1",
    now: () => new Date("2026-08-05T09:15:00.000Z"),
  });
  const corrected = { ...record, samplingLocation: "ЦОШ" };

  const result = await repository.update({
    id: "verification-1",
    record: corrected,
    correctedByUserId: "laboratory-user",
    correctedByAccountId: "laboratory-account",
    correctedByDisplayName: "Иванова Анна",
  });

  assert.deepEqual(result, {
    before: record,
    record: {
      id: "verification-1",
      ...corrected,
      sourceSampleRegistrationId: "sample-registration-1",
      createdAt: "2026-08-05T08:30:00.000Z",
    },
  });
  assert.match(queries[0]?.sql ?? "", /for update/u);
  assert.match(
    queries[1]?.sql ?? "",
    /update laboratory_verification_journal/u,
  );
  assert.deepEqual(queries[1]?.parameters, [
    "2026-08-05",
    "Шамот молотый",
    "ЦОШ",
    "26.19",
    "verification-1",
  ]);
  assert.match(
    queries[2]?.sql ?? "",
    /insert into laboratory_verification_revisions/u,
  );
  assert.deepEqual(queries[2]?.parameters, [
    "verification-revision-1",
    "verification-1",
    JSON.stringify(record),
    JSON.stringify(corrected),
    "laboratory-user",
    "laboratory-account",
    "Иванова Анна",
    "2026-08-05T09:15:00.000Z",
  ]);
});

test("verification repository filters and maps history", async () => {
  let querySql = "";
  let queryParameters: unknown[] = [];
  const pool = {
    async query(sql: string, parameters?: unknown[]) {
      querySql = sql;
      queryParameters = parameters ?? [];
      return [[{
        id: "verification-1",
        verification_date: record.verificationDate,
        product_name: record.productName,
        sampling_location: record.samplingLocation,
        sample_code: record.sampleCode,
        source_sample_registration_id: null,
        created_at: "2026-08-05T08:30:00.000Z",
      }], []];
    },
  } as unknown as DatabasePool;
  const repository = createLaboratoryVerificationJournalRepository(pool);

  const rows = await repository.list({
    dateFrom: "2026-08-01",
    dateTo: "2026-08-31",
    query: "26.19",
    nameQuery: "Шамот",
  });

  assert.deepEqual(rows, [{
    id: "verification-1",
    ...record,
    createdAt: "2026-08-05T08:30:00.000Z",
  }]);
  assert.match(querySql, /verification_date >= \?/u);
  assert.match(querySql, /verification_date <= \?/u);
  assert.match(querySql, /instr\(/u);
  assert.match(querySql, /product_name like \?/u);
  assert.deepEqual(queryParameters, [
    "2026-08-01",
    "2026-08-31",
    "26.19",
    "%Шамот%",
    200,
  ]);
});
