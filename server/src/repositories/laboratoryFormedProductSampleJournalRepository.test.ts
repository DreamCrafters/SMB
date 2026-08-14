import assert from "node:assert/strict";
import test from "node:test";
import type { DatabasePool } from "../db/pool.js";
import {
  createLaboratoryFormedProductSampleJournalRepository,
  LaboratoryFormedProductSampleWagonNotFoundError,
} from "./laboratoryFormedProductSampleJournalRepository.js";
import type { RefractoryWagonsRepository } from "./refractoryWagonsRepository.js";

const record = {
  sortingDate: "2026-08-05",
  wagonNumber: "214",
};

function buildRefractoryWagons(
  resolved: { productBrand: string; pressDate: string } | undefined,
): RefractoryWagonsRepository {
  return {
    async findBySortingDate(input: { number: string; sortingDate: string }) {
      if (resolved === undefined) return undefined;
      return { number: input.number, ...resolved };
    },
  } as unknown as RefractoryWagonsRepository;
}

test("formed product sample repository resolves the wagon and stores the record", async () => {
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
    refractoryWagons: buildRefractoryWagons({
      productBrand: "ША-1,3",
      pressDate: "2026-08-01",
    }),
  });

  const saved = await repository.create({
    record,
    submittedByUserId: "laboratory-user",
    submittedByAccountId: "laboratory-account",
  });

  assert.deepEqual(saved, {
    id: "formed-sample-1",
    ...record,
    productBrand: "ША-1,3",
    moldingDate: "2026-08-01",
    createdAt: "2026-08-05T08:30:00.000Z",
  });
  assert.match(
    queries[0]?.sql ?? "",
    /insert into laboratory_formed_product_sample_journal/u,
  );
  assert.deepEqual(queries[0]?.parameters, [
    "formed-sample-1",
    "2026-08-05",
    "214",
    "ША-1,3",
    "2026-08-01",
    "laboratory-user",
    "laboratory-account",
    "2026-08-05T08:30:00.000Z",
  ]);
});

test("formed product sample repository rejects create when no wagon matches the number and sorting date", async () => {
  const pool = {
    async query() {
      return [[], []];
    },
  } as unknown as DatabasePool;
  const repository = createLaboratoryFormedProductSampleJournalRepository(pool, {
    refractoryWagons: buildRefractoryWagons(undefined),
  });

  await assert.rejects(
    () => repository.create({
      record,
      submittedByUserId: "laboratory-user",
      submittedByAccountId: "laboratory-account",
    }),
    LaboratoryFormedProductSampleWagonNotFoundError,
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
          wagon_number: record.wagonNumber,
          product_brand: "ША-1,3",
          molding_date: "2026-08-01",
          created_at: "2026-08-05T08:30:00.000Z",
        }], []];
      }
      return [[], []];
    },
  } as unknown as DatabasePool;
  const repository = createLaboratoryFormedProductSampleJournalRepository(pool, {
    createId: () => "formed-revision-1",
    now: () => new Date("2026-08-05T09:15:00.000Z"),
    refractoryWagons: buildRefractoryWagons({
      productBrand: "ША-1,7",
      pressDate: "2026-08-01",
    }),
  });
  const corrected = { sortingDate: "2026-08-06", wagonNumber: "214" };

  const result = await repository.update({
    id: "formed-sample-1",
    record: corrected,
    correctedByUserId: "laboratory-user",
    correctedByAccountId: "laboratory-account",
    correctedByDisplayName: "Иванова Анна",
  });

  assert.deepEqual(result, {
    before: {
      sortingDate: record.sortingDate,
      wagonNumber: record.wagonNumber,
      productBrand: "ША-1,3",
      moldingDate: "2026-08-01",
    },
    record: {
      id: "formed-sample-1",
      ...corrected,
      productBrand: "ША-1,7",
      moldingDate: "2026-08-01",
      createdAt: "2026-08-05T08:30:00.000Z",
    },
  });
  assert.match(queries[0]?.sql ?? "", /for update/u);
  assert.match(
    queries[1]?.sql ?? "",
    /update laboratory_formed_product_sample_journal/u,
  );
  assert.deepEqual(queries[1]?.parameters, [
    "2026-08-06",
    "214",
    "ША-1,7",
    "2026-08-01",
    "formed-sample-1",
  ]);
  assert.match(
    queries[2]?.sql ?? "",
    /insert into laboratory_formed_product_sample_revisions/u,
  );
  assert.deepEqual(queries[2]?.parameters, [
    "formed-revision-1",
    "formed-sample-1",
    JSON.stringify({
      sortingDate: record.sortingDate,
      wagonNumber: record.wagonNumber,
      productBrand: "ША-1,3",
      moldingDate: "2026-08-01",
    }),
    JSON.stringify({ ...corrected, productBrand: "ША-1,7", moldingDate: "2026-08-01" }),
    "laboratory-user",
    "laboratory-account",
    "Иванова Анна",
    "2026-08-05T09:15:00.000Z",
  ]);
});

test("formed product sample repository rejects correction when no wagon matches", async () => {
  const pool = {
    async query(sql: string) {
      if (/select[\s\S]+for update/u.test(sql)) {
        return [[{
          id: "formed-sample-1",
          sorting_date: record.sortingDate,
          wagon_number: record.wagonNumber,
          product_brand: "ША-1,3",
          molding_date: "2026-08-01",
          created_at: "2026-08-05T08:30:00.000Z",
        }], []];
      }
      return [[], []];
    },
  } as unknown as DatabasePool;
  const repository = createLaboratoryFormedProductSampleJournalRepository(pool, {
    refractoryWagons: buildRefractoryWagons(undefined),
  });

  await assert.rejects(
    () => repository.update({
      id: "formed-sample-1",
      record: { sortingDate: "2026-08-06", wagonNumber: "999" },
      correctedByUserId: "laboratory-user",
      correctedByAccountId: "laboratory-account",
      correctedByDisplayName: "Иванова Анна",
    }),
    LaboratoryFormedProductSampleWagonNotFoundError,
  );
});

test("formed product sample repository filters and maps history, tolerating legacy null wagon fields", async () => {
  let querySql = "";
  let queryParameters: unknown[] = [];
  const pool = {
    async query(sql: string, parameters?: unknown[]) {
      querySql = sql;
      queryParameters = parameters ?? [];
      return [[
        {
          id: "formed-sample-1",
          sorting_date: record.sortingDate,
          wagon_number: record.wagonNumber,
          product_brand: "ША-1,3",
          molding_date: "2026-08-01",
          created_at: "2026-08-05T08:30:00.000Z",
        },
        {
          id: "formed-sample-legacy",
          sorting_date: "2026-07-20",
          wagon_number: null,
          product_brand: "ША-1,3",
          molding_date: null,
          created_at: "2026-07-20T08:30:00.000Z",
        },
      ], []];
    },
  } as unknown as DatabasePool;
  const repository = createLaboratoryFormedProductSampleJournalRepository(pool, {
    refractoryWagons: buildRefractoryWagons(undefined),
  });

  const rows = await repository.list({
    dateFrom: "2026-07-01",
    dateTo: "2026-08-31",
    query: "214",
    nameQuery: "ША",
  });

  assert.deepEqual(rows, [
    {
      id: "formed-sample-1",
      ...record,
      productBrand: "ША-1,3",
      moldingDate: "2026-08-01",
      createdAt: "2026-08-05T08:30:00.000Z",
    },
    {
      id: "formed-sample-legacy",
      sortingDate: "2026-07-20",
      wagonNumber: null,
      productBrand: "ША-1,3",
      moldingDate: null,
      createdAt: "2026-07-20T08:30:00.000Z",
    },
  ]);
  assert.match(querySql, /sorting_date >= \?/u);
  assert.match(querySql, /sorting_date <= \?/u);
  assert.match(querySql, /instr\(/u);
  assert.match(querySql, /product_brand like \?/u);
  assert.deepEqual(queryParameters, [
    "2026-07-01",
    "2026-08-31",
    "214",
    "%ША%",
    200,
  ]);
});
