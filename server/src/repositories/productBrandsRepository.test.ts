import assert from "node:assert/strict";
import test from "node:test";
import type { DatabasePool } from "../db/pool.js";
import {
  createProductBrandsRepository,
  ProductBrandNameAlreadyExistsError,
} from "./productBrandsRepository.js";

const submission = {
  name: "ША-8",
  normalizedName: "ша-8",
  description: "Шамотное изделие",
  productClass: "Формованный",
  applicationIndustry: "Металлургия",
  normativeDocument: "ГОСТ 390-2018",
  geometry: "230×114×65",
  al2o3: "30 %",
  fe2o3: "3 %",
  strength: "20 Н/мм²",
};

test("product brand repository creates and lists detailed journal records", async () => {
  const queries: Array<{ sql: string; parameters?: unknown[] }> = [];
  const pool = {
    async query(sql: string, parameters?: unknown[]) {
      queries.push({ sql, parameters });
      if (/select[\s\S]+from product_brands/u.test(sql)) {
        return [[buildRow()], []];
      }
      return [[], []];
    },
  } as unknown as DatabasePool;
  const repository = createProductBrandsRepository(pool, {
    createId: () => "brand-1",
    now: () => new Date("2026-08-07T08:00:00.000Z"),
  });

  assert.deepEqual(await repository.createRecord({
    record: submission,
    submittedByUserId: "laboratory-user",
    submittedByAccountId: "laboratory-account",
  }), {
    id: "brand-1",
    ...withoutNormalizedName(submission),
    createdAt: "2026-08-07T08:00:00.000Z",
    updatedAt: "2026-08-07T08:00:00.000Z",
  });
  assert.match(queries[0]?.sql ?? "", /insert into product_brands/u);
  assert.deepEqual(queries[0]?.parameters, [
    "brand-1",
    "ША-8",
    "ша-8",
    "Шамотное изделие",
    "Формованный",
    "Металлургия",
    "ГОСТ 390-2018",
    "230×114×65",
    "30 %",
    "3 %",
    "20 Н/мм²",
    "laboratory-user",
    "laboratory-account",
    "2026-08-07T08:00:00.000Z",
    "2026-08-07T08:00:00.000Z",
  ]);

  assert.deepEqual(await repository.listRecords({ query: "ША_8%" }), [{
    id: "brand-1",
    ...withoutNormalizedName(submission),
    createdAt: "2026-08-07T08:00:00.000Z",
    updatedAt: "2026-08-07T08:00:00.000Z",
  }]);
  assert.match(queries[1]?.sql ?? "", /instr\(/u);
  assert.deepEqual(queries[1]?.parameters, ["ША_8%"]);
});

test("product brand repository is the canonical source for all brand selectors", async () => {
  const pool = {
    async query(sql: string) {
      if (/select name, normalized_name/u.test(sql)) {
        return [[
          { name: "ША-8", normalized_name: "ша-8" },
          { name: "ШБ-5", normalized_name: "шб-5" },
        ], []];
      }
      return [[], []];
    },
  } as unknown as DatabasePool;
  const repository = createProductBrandsRepository(pool);

  assert.deepEqual(await repository.list(), ["ША-8", "ШБ-5"]);
  assert.deepEqual(await repository.resolveReferences([
    { fieldName: "productBrand", label: "  ша-8 " },
  ]), {
    ok: true,
    references: [{ fieldName: "productBrand", label: "ША-8" }],
  });
  assert.deepEqual(await repository.resolveReferences([
    { fieldName: "productBrand", label: "Нет в журнале" },
  ]), {
    ok: false,
    missing: { fieldName: "productBrand", label: "Нет в журнале" },
  });
});

test("product brand repository stores an immutable correction revision and rejects duplicate names", async () => {
  const queries: Array<{ sql: string; parameters?: unknown[] }> = [];
  let duplicateOnUpdate = false;
  const pool = {
    async query(sql: string, parameters?: unknown[]) {
      queries.push({ sql, parameters });
      if (/select[\s\S]+from product_brands[\s\S]+for update/u.test(sql)) {
        return [[buildRow()], []];
      }
      if (duplicateOnUpdate && /update product_brands/u.test(sql)) {
        const error = new Error("duplicate") as Error & { code: string };
        error.code = "ER_DUP_ENTRY";
        throw error;
      }
      return [[], []];
    },
  } as unknown as DatabasePool;
  const repository = createProductBrandsRepository(pool, {
    createId: () => "revision-1",
    now: () => new Date("2026-08-07T09:00:00.000Z"),
  });

  const updated = await repository.updateRecord({
    id: "brand-1",
    record: { ...submission, description: "Исправленное описание" },
    correctedByUserId: "laboratory-user",
    correctedByAccountId: "laboratory-account",
    correctedByDisplayName: "Лаборант",
  });
  assert.equal(updated?.record.description, "Исправленное описание");
  assert.match(
    queries.find(({ sql }) => /insert into product_brand_revisions/u.test(sql))?.sql ?? "",
    /before_snapshot/u,
  );

  duplicateOnUpdate = true;
  await assert.rejects(
    () => repository.updateRecord({
      id: "brand-1",
      record: { ...submission, name: "ШБ-5", normalizedName: "шб-5" },
      correctedByUserId: "laboratory-user",
      correctedByAccountId: "laboratory-account",
      correctedByDisplayName: "Лаборант",
    }),
    ProductBrandNameAlreadyExistsError,
  );
});

function buildRow() {
  return {
    id: "brand-1",
    name: "ША-8",
    normalized_name: "ша-8",
    description: "Шамотное изделие",
    product_class: "Формованный",
    application_industry: "Металлургия",
    normative_document: "ГОСТ 390-2018",
    geometry: "230×114×65",
    al2o3: "30 %",
    fe2o3: "3 %",
    strength: "20 Н/мм²",
    created_at: "2026-08-07T08:00:00.000Z",
    updated_at: "2026-08-07T08:00:00.000Z",
  };
}

function withoutNormalizedName(value: typeof submission) {
  const { normalizedName: _normalizedName, ...record } = value;
  return record;
}
