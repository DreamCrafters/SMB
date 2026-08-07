import assert from "node:assert/strict";
import test from "node:test";
import type { DatabasePool } from "../db/pool.js";
import {
  createProductBrandsRepository,
  ProductBrandNameAlreadyExistsError,
  ProductBrandReplacementRequiredError,
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

test("product brand repository requires a replacement for a used brand", async () => {
  const pool = {
    async query(sql: string) {
      if (/from product_brands[\s\S]+where id = \?[\s\S]+for update/u.test(sql)) {
        return [[buildRow()], []];
      }
      if (/select count\(\*\) as count/u.test(sql)) {
        return [[{ count: 1 }], []];
      }
      if (/from dispatcher_submissions/u.test(sql) || /from refractory_report_revisions/u.test(sql)) {
        return [[], []];
      }
      return [[], []];
    },
  } as unknown as DatabasePool;
  const repository = createProductBrandsRepository(pool);

  await assert.rejects(
    () => repository.deleteRecord({ id: "brand-1", ...deletionActor }),
    ProductBrandReplacementRequiredError,
  );
});

test("product brand repository archives an unused brand without a replacement", async () => {
  const queries: Array<{ sql: string; parameters?: unknown[] }> = [];
  const pool = {
    async query(sql: string, parameters?: unknown[]) {
      queries.push({ sql, parameters });
      if (/from product_brands[\s\S]+where id = \?[\s\S]+for update/u.test(sql)) {
        return [[buildRow()], []];
      }
      if (/select count\(\*\) as count/u.test(sql)) {
        return [[{ count: 0 }], []];
      }
      if (/from dispatcher_submissions/u.test(sql) || /from refractory_report_revisions/u.test(sql)) {
        return [[], []];
      }
      if (/select id, name, merged_into_id/u.test(sql)) return [[], []];
      return [{ affectedRows: 1 }, []];
    },
  } as unknown as DatabasePool;
  const repository = createProductBrandsRepository(pool, {
    now: () => new Date("2026-08-08T10:00:00.000Z"),
  });

  assert.deepEqual(await repository.deleteRecord({
    id: "brand-1",
    ...deletionActor,
  }), {
    sourceId: "brand-1",
    sourceName: "ША-8",
    updatedRecords: 0,
  });
  assert.ok(queries.some(({ sql, parameters }) =>
    /update product_brands[\s\S]+deleted_at/u.test(sql) &&
    parameters?.[1] === null
  ));
});

test("product brand repository transfers every current reference before archiving a duplicate", async () => {
  const queries: Array<{ sql: string; parameters?: unknown[] }> = [];
  const source = buildRow();
  const replacement = {
    ...buildRow(),
    id: "brand-2",
    name: "ШБ-5",
    normalized_name: "шб-5",
  };
  const pool = {
    async query(sql: string, parameters?: unknown[]) {
      queries.push({ sql, parameters });
      if (/from product_brands[\s\S]+where id in/u.test(sql)) {
        return [[source, replacement], []];
      }
      if (/from dispatcher_submissions/u.test(sql)) {
        return [[{
          id: "submission-1",
          payload: {
            unformedBrand1: "ШБ-5",
            unformedFact1: "0.25",
            unformedBrand2: "ША-8",
            unformedFact2: "1.75",
          },
        }], []];
      }
      if (/from refractory_report_revisions/u.test(sql)) {
        return [[{
          id: "report-1",
          report_type: "cosh",
          payload: {
            chamotteOutputRows: [
              { productBrand: "ШБ-5", quantityTons: 0.25 },
              { productBrand: "ША-8", quantityTons: 1.75 },
            ],
          },
        }], []];
      }
      if (/from laboratory_results/u.test(sql)) {
        return [[{
          id: "result-1",
          payload: { productBrand: "ША-8", purpose: "Контроль" },
        }], []];
      }
      if (/from laboratory_bank_assignments/u.test(sql)) {
        return [[{
          bank_number: 1,
          laboratory_result_id: null,
          sample_index: null,
          sample_identifier: null,
          bulk_density: "1.25",
          bulk_density_source: "rotary_kiln_2_journal",
          bulk_density_sample_count: 4,
        }], []];
      }
      if (/select id, name, merged_into_id/u.test(sql)) {
        return [[source, replacement].map((row) => ({
          id: row.id,
          name: row.name,
          merged_into_id: null,
        })), []];
      }
      if (/update (rotary_kiln_2_firing_journal|laboratory_unshaped_product_sample_journal|refractory_wagons|laboratory_green_product_quality_journal)/u.test(sql)) {
        return [{ affectedRows: 1 }, []];
      }
      return [{ affectedRows: 1 }, []];
    },
  } as unknown as DatabasePool;
  const repository = createProductBrandsRepository(pool, {
    now: () => new Date("2026-08-08T10:00:00.000Z"),
  });

  assert.deepEqual(await repository.deleteRecord({
    id: "brand-1",
    replacementId: "brand-2",
    ...deletionActor,
  }), {
    sourceId: "brand-1",
    sourceName: "ША-8",
    replacementId: "brand-2",
    replacementName: "ШБ-5",
    updatedRecords: 8,
  });
  const dispatcherUpdate = queries.find(({ sql }) =>
    /update dispatcher_submissions/u.test(sql)
  );
  assert.deepEqual(JSON.parse(String(dispatcherUpdate?.parameters?.[0])), {
    unformedBrand1: "ШБ-5",
    unformedFact1: "2",
  });
  assert.ok(queries.some(({ sql }) =>
    /from refractory_report_revisions revisions[\s\S]+not exists/u.test(sql)
  ));
  assert.equal(queries.some(({ sql }) =>
    /update refractory_report_revisions/u.test(sql)
  ), false);
  const bankAssignmentInsert = queries.find(({ sql }) =>
    /insert into laboratory_bank_assignments/u.test(sql)
  );
  assert.equal(bankAssignmentInsert?.parameters?.[5], "ШБ-5");
  assert.deepEqual(bankAssignmentInsert?.parameters?.slice(9, 12), [
    deletionActor.deletedByUserId,
    deletionActor.deletedByAccountId,
    deletionActor.deletedByDisplayName,
  ]);
  assert.ok(queries.some(({ sql, parameters }) =>
    /update product_brands[\s\S]+deleted_at/u.test(sql) &&
    parameters?.includes("brand-1")
  ));
});

test("product brand repository resolves chained merges to the active terminal brand", async () => {
  const pool = {
    async query(sql: string) {
      if (/select id, name, merged_into_id[\s\S]+from product_brands/u.test(sql)) {
        return [[
          { id: "brand-1", name: "Дубль 1", merged_into_id: "brand-2" },
          { id: "brand-2", name: "Дубль 2", merged_into_id: "brand-3" },
          { id: "brand-3", name: "Основная", merged_into_id: null },
        ], []];
      }
      return [[], []];
    },
  } as unknown as DatabasePool;

  assert.deepEqual(
    await createProductBrandsRepository(pool).listMergeAliases(),
    [
      { sourceName: "Дубль 1", replacementName: "Основная" },
      { sourceName: "Дубль 2", replacementName: "Основная" },
    ],
  );
});

test("product brand repository counts effective approved COSH references through merge aliases", async () => {
  const statements: string[] = [];
  const source = {
    ...buildRow(),
    id: "brand-2",
    name: "Промежуточная",
    normalized_name: "промежуточная",
  };
  const replacement = {
    ...buildRow(),
    id: "brand-3",
    name: "Основная",
    normalized_name: "основная",
  };
  const pool = {
    async query(sql: string) {
      statements.push(sql);
      if (/from product_brands[\s\S]+where id in/u.test(sql)) {
        return [[source, replacement], []];
      }
      if (/select id, name, merged_into_id[\s\S]+from product_brands/u.test(sql)) {
        return [[
          { id: "brand-1", name: "Первый дубль", merged_into_id: "brand-2" },
          { id: "brand-2", name: "Промежуточная", merged_into_id: null },
          { id: "brand-3", name: "Основная", merged_into_id: null },
        ], []];
      }
      if (/from refractory_report_revisions revisions/u.test(sql)) {
        return [[{
          id: "cosh-approved",
          report_type: "cosh",
          payload: {
            chamotteOutputRows: [{
              productBrand: "Первый дубль",
              quantityTons: 2,
            }],
          },
        }], []];
      }
      if (
        /from laboratory_bank_assignments/u.test(sql) ||
        /from laboratory_results/u.test(sql) ||
        /from dispatcher_submissions/u.test(sql)
      ) {
        return [[], []];
      }
      return [{ affectedRows: 0 }, []];
    },
  } as unknown as DatabasePool;

  assert.deepEqual(await createProductBrandsRepository(pool).deleteRecord({
    id: "brand-2",
    replacementId: "brand-3",
    ...deletionActor,
  }), {
    sourceId: "brand-2",
    sourceName: "Промежуточная",
    replacementId: "brand-3",
    replacementName: "Основная",
    updatedRecords: 1,
  });
  assert.ok(statements.some((sql) =>
    /revisions\.status = 'approved'[\s\S]+newer_approved/u.test(sql)
  ));
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

const deletionActor = {
  deletedByUserId: "laboratory-user",
  deletedByAccountId: "laboratory-account",
  deletedByDisplayName: "Лаборант",
};

function withoutNormalizedName(value: typeof submission) {
  const { normalizedName: _normalizedName, ...record } = value;
  return record;
}
