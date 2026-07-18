import assert from "node:assert/strict";
import test from "node:test";
import type { DatabasePool } from "../db/pool.js";
import { createProductionBrandsRepository } from "./productionBrandsRepository.js";

test("production brands repository permanently creates and lists catalog labels", async () => {
  const queries: Array<{ sql: string; parameters?: unknown[] }> = [];
  const pool = {
    async query(sql: string, parameters?: unknown[]) {
      queries.push({ sql: normalizeSql(sql), parameters });

      if (sql.includes("where category = ? and normalized_label = ?")) {
        return [[{
          id: "brand-1",
          category: "unformed",
          label: "ПБ-5",
          created_at: "2026-07-17T10:00:00.000Z",
        }], []];
      }

      if (sql.includes("order by category")) {
        return [[{
          id: "brand-1",
          category: "unformed",
          label: "ПБ-5",
          created_at: "2026-07-17T10:00:00.000Z",
        }], []];
      }

      return [[], []];
    },
  } as unknown as DatabasePool;
  const repository = createProductionBrandsRepository(pool, {
    createId: () => "brand-1",
  });

  const created = await repository.create({
    category: "unformed",
    label: "ПБ-5",
    normalizedLabel: "пб-5",
    createdByUserId: "dispatcher-user",
  });
  const labels = await repository.list();

  assert.deepEqual(created, {
    created: true,
    label: {
      id: "brand-1",
      category: "unformed",
      label: "ПБ-5",
      createdAt: "2026-07-17T10:00:00.000Z",
    },
  });
  assert.deepEqual(labels, [created.label]);
  assert.deepEqual(queries[0]?.parameters, [
    "brand-1",
    "unformed",
    "ПБ-5",
    "пб-5",
    "dispatcher-user",
  ]);
  assert.match(queries[0]?.sql ?? "", /insert into production_brand_labels/);
});

test("production brands repository reports an existing normalized label without creating it", async () => {
  const pool = {
    async query(sql: string) {
      if (sql.includes("insert into production_brand_labels")) {
        throw Object.assign(new Error("duplicate"), { code: "ER_DUP_ENTRY" });
      }

      return [[{
        id: "brand-existing",
        category: "chamotte",
        label: "Ш-1",
        created_at: "2026-07-17T10:00:00.000Z",
      }], []];
    },
  } as unknown as DatabasePool;
  const repository = createProductionBrandsRepository(pool);

  const result = await repository.create({
    category: "chamotte",
    label: "ш-1",
    normalizedLabel: "ш-1",
    createdByUserId: "dispatcher-user",
  });

  assert.equal(result.created, false);
  assert.equal(result.label.label, "Ш-1");
});

test("production brand references resolve canonically under row locks", async () => {
  const queries: Array<{ sql: string; parameters?: unknown[] }> = [];
  const pool = {
    async query(sql: string, parameters?: unknown[]) {
      const normalized = normalizeSql(sql);
      queries.push({ sql: normalized, parameters });

      if (normalized.startsWith("select id from production_brand_labels")) {
        return [[
          { id: "product-1" },
          { id: "unformed-1" },
        ], []];
      }

      if (normalized.startsWith("select id, category, label, normalized_label")) {
        return [[
          {
            id: "product-1",
            category: "product",
            label: "ФЛ-1",
            normalized_label: "фл-1",
          },
          {
            id: "unformed-1",
            category: "unformed",
            label: "ПБ-5",
            normalized_label: "пб-5",
          },
        ], []];
      }

      throw new Error(`Unexpected query: ${normalized}`);
    },
  } as unknown as DatabasePool;

  const result = await createProductionBrandsRepository(pool).resolveReferences([
    { category: "product", fieldName: "formingProductBrand", label: " фл-1 " },
    { category: "unformed", fieldName: "unformedBrand3", label: "ПБ-5" },
  ]);

  assert.deepEqual(result, {
    ok: true,
    references: [
      { fieldName: "formingProductBrand", label: "ФЛ-1" },
      { fieldName: "unformedBrand3", label: "ПБ-5" },
    ],
  });
  assert.match(queries[1]?.sql ?? "", /order by id for update$/u);
});

test("production brand reference resolution reports a removed label", async () => {
  const pool = {
    async query(sql: string) {
      return sql.includes("select id from production_brand_labels")
        ? [[], []]
        : [[], []];
    },
  } as unknown as DatabasePool;

  const result = await createProductionBrandsRepository(pool).resolveReferences([
    { category: "chamotte", fieldName: "chamotteBrand1", label: "ША-1" },
  ]);

  assert.deepEqual(result, {
    ok: false,
    missing: { category: "chamotte", fieldName: "chamotteBrand1", label: "ША-1" },
  });
});

function normalizeSql(sql: string) {
  return sql.replace(/\s+/g, " ").trim();
}
