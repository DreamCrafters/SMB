import assert from "node:assert/strict";
import test from "node:test";
import type { DatabasePool } from "../db/pool.js";
import {
  createRefractoryWagonsRepository,
  RefractoryWagonNumberAlreadyExistsError,
} from "./refractoryWagonsRepository.js";

test("refractory wagon repository creates and lists server-owned wagon records", async () => {
  const queries: Array<{ sql: string; parameters?: unknown[] }> = [];
  const pool = {
    async query(sql: string, parameters?: unknown[]) {
      queries.push({ sql, parameters });
      if (/from refractory_wagons/u.test(sql)) {
        return [[{
          id: "wagon-17",
          wagon_number: "В-17",
          loading_date: "2026-08-06",
          product_brand: "ШКУ-32",
          raw_control_date: null,
          created_at: "2026-08-06T08:30:00.000Z",
        }], []];
      }
      return [[], []];
    },
  } as unknown as DatabasePool;
  const repository = createRefractoryWagonsRepository(pool, {
    createId: () => "wagon-17",
    now: () => new Date("2026-08-06T08:30:00.000Z"),
  });

  const created = await repository.create({
    wagon: {
      number: "В-17",
      loadingDate: "2026-08-06",
      productBrand: "ШКУ-32",
    },
    submittedByUserId: "refractory-user",
    submittedByAccountId: "refractory-account",
  });

  assert.deepEqual(created, {
    id: "wagon-17",
    number: "В-17",
    loadingDate: "2026-08-06",
    productBrand: "ШКУ-32",
    rawControlDate: null,
    createdAt: "2026-08-06T08:30:00.000Z",
  });
  assert.match(queries[0]?.sql ?? "", /insert into refractory_wagons/u);
  assert.deepEqual(queries[0]?.parameters, [
    "wagon-17",
    "В-17",
    "2026-08-06",
    "ШКУ-32",
    "refractory-user",
    "refractory-account",
    "2026-08-06T08:30:00.000Z",
  ]);

  assert.deepEqual(await repository.list(), [created]);
  assert.match(queries[1]?.sql ?? "", /order by sequence_id desc/u);
});

test("refractory wagon repository reports a duplicate wagon number", async () => {
  const pool = {
    async query() {
      throw Object.assign(new Error("Duplicate entry"), { code: "ER_DUP_ENTRY" });
    },
  } as unknown as DatabasePool;
  const repository = createRefractoryWagonsRepository(pool);

  await assert.rejects(
    () => repository.create({
      wagon: {
        number: "В-17",
        loadingDate: "2026-08-06",
        productBrand: "ШКУ-32",
      },
      submittedByUserId: "refractory-user",
      submittedByAccountId: "refractory-account",
    }),
    RefractoryWagonNumberAlreadyExistsError,
  );
});

test("refractory wagon repository corrects a wagon and stores an immutable revision", async () => {
  const queries: Array<{ sql: string; parameters?: unknown[] }> = [];
  const pool = {
    async query(sql: string, parameters?: unknown[]) {
      queries.push({ sql, parameters });
      if (/from refractory_wagons[\s\S]+for update/u.test(sql)) {
        return [[{
          id: "wagon-17",
          wagon_number: "В-17",
          loading_date: "2026-08-06",
          product_brand: "ШКУ-32",
          raw_control_date: "2026-08-07",
          created_at: "2026-08-06T08:30:00.000Z",
        }], []];
      }
      return [[], []];
    },
  } as unknown as DatabasePool;
  let nextId = 0;
  const repository = createRefractoryWagonsRepository(pool, {
    createId: () => `revision-${++nextId}`,
    now: () => new Date("2026-08-08T09:15:00.000Z"),
  });

  const correction = await repository.update({
    id: "wagon-17",
    wagon: {
      number: "В-17А",
      loadingDate: "2026-08-05",
      productBrand: "ША-22",
    },
    correctedByUserId: "refractory-user",
    correctedByAccountId: "refractory-account",
    correctedByDisplayName: "Мастер ОЦ",
  });

  assert.equal(correction?.before.number, "В-17");
  assert.deepEqual(correction?.record, {
    id: "wagon-17",
    number: "В-17А",
    loadingDate: "2026-08-05",
    productBrand: "ША-22",
    rawControlDate: "2026-08-07",
    createdAt: "2026-08-06T08:30:00.000Z",
  });
  assert.match(queries[1]?.sql ?? "", /update refractory_wagons/u);
  assert.deepEqual(queries[1]?.parameters, [
    "В-17А",
    "2026-08-05",
    "ША-22",
    "wagon-17",
  ]);
  assert.match(
    queries[2]?.sql ?? "",
    /insert into refractory_wagon_revisions/u,
  );
  assert.deepEqual(queries[2]?.parameters?.slice(0, 2), [
    "revision-1",
    "wagon-17",
  ]);
  assert.deepEqual(queries[2]?.parameters?.slice(4), [
    "refractory-user",
    "refractory-account",
    "Мастер ОЦ",
    "2026-08-08T09:15:00.000Z",
  ]);
});
