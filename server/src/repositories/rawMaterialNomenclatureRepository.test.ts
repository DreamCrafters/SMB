import assert from "node:assert/strict";
import test from "node:test";
import type { DatabasePool } from "../db/pool.js";
import {
  createRawMaterialNomenclatureRepository,
  RawMaterialNomenclatureNameAlreadyExistsError,
} from "./rawMaterialNomenclatureRepository.js";

const submission = {
  name: "Глина огнеупорная",
  normalizedName: "глина огнеупорная",
  description: "Сырьё для шамота",
  productClass: "Сырьё",
  applicationIndustry: "Металлургия",
  normativeDocument: "ГОСТ 1234",
  al2o3: "28 %",
  fe2o3: "2 %",
};

test("raw material repository creates and lists nomenclature records", async () => {
  const queries: Array<{ sql: string; parameters?: unknown[] }> = [];
  const pool = {
    async query(sql: string, parameters?: unknown[]) {
      queries.push({ sql, parameters });
      if (/select[\s\S]+from laboratory_raw_material_nomenclature/u.test(sql)) {
        return [[buildRow()], []];
      }
      return [[], []];
    },
  } as unknown as DatabasePool;
  const repository = createRawMaterialNomenclatureRepository(pool, {
    createId: () => "raw-material-1",
    now: () => new Date("2026-08-23T08:00:00.000Z"),
  });

  // Карточка сырья повторяет марку без геометрии и прочности.
  assert.deepEqual(await repository.createRecord({
    record: submission,
    submittedByUserId: "laboratory-user",
    submittedByAccountId: "laboratory-account",
  }), {
    id: "raw-material-1",
    ...withoutNormalizedName(submission),
    createdAt: "2026-08-23T08:00:00.000Z",
    updatedAt: "2026-08-23T08:00:00.000Z",
  });
  assert.match(
    queries[0]?.sql ?? "",
    /insert into laboratory_raw_material_nomenclature/u,
  );
  assert.doesNotMatch(queries[0]?.sql ?? "", /geometry|strength/u);
  assert.deepEqual(queries[0]?.parameters, [
    "raw-material-1",
    "Глина огнеупорная",
    "глина огнеупорная",
    "Сырьё для шамота",
    "Сырьё",
    "Металлургия",
    "ГОСТ 1234",
    "28 %",
    "2 %",
    "laboratory-user",
    "laboratory-account",
    "2026-08-23T08:00:00.000Z",
    "2026-08-23T08:00:00.000Z",
  ]);

  assert.deepEqual(await repository.listRecords({ query: "Глина" }), [{
    id: "raw-material-1",
    ...withoutNormalizedName(submission),
    createdAt: "2026-08-23T08:00:00.000Z",
    updatedAt: "2026-08-23T08:00:00.000Z",
  }]);
  assert.match(queries[1]?.sql ?? "", /instr\(/u);
  assert.deepEqual(queries[1]?.parameters, ["Глина"]);

  assert.deepEqual(await repository.listLabels(), ["Глина огнеупорная"]);
});

test("raw material repository stores a correction revision", async () => {
  const queries: Array<{ sql: string; parameters?: unknown[] }> = [];
  let nextId = 0;
  const pool = {
    async query(sql: string, parameters?: unknown[]) {
      queries.push({ sql, parameters });
      if (/select[\s\S]+from laboratory_raw_material_nomenclature/u.test(sql)) {
        return [[buildRow()], []];
      }
      return [[], []];
    },
  } as unknown as DatabasePool;
  const repository = createRawMaterialNomenclatureRepository(pool, {
    createId: () => `revision-${++nextId}`,
    now: () => new Date("2026-08-23T09:00:00.000Z"),
  });

  const correction = await repository.updateRecord({
    id: "raw-material-1",
    record: { ...submission, description: "Исправленное описание" },
    correctedByUserId: "laboratory-user",
    correctedByAccountId: "laboratory-account",
    correctedByDisplayName: "Лаборант",
  });

  assert.equal(correction?.before.description, "Сырьё для шамота");
  assert.equal(correction?.record.description, "Исправленное описание");
  assert.equal(correction?.record.updatedAt, "2026-08-23T09:00:00.000Z");
  assert.match(queries[0]?.sql ?? "", /for update/u);
  assert.match(
    queries[2]?.sql ?? "",
    /insert into laboratory_raw_material_nomenclature_revisions/u,
  );
});

test("raw material repository reports a duplicate nomenclature name", async () => {
  const pool = {
    async query() {
      throw Object.assign(new Error("Duplicate entry"), {
        code: "ER_DUP_ENTRY",
      });
    },
  } as unknown as DatabasePool;
  const repository = createRawMaterialNomenclatureRepository(pool);

  await assert.rejects(
    () => repository.createRecord({
      record: submission,
      submittedByUserId: "laboratory-user",
      submittedByAccountId: "laboratory-account",
    }),
    RawMaterialNomenclatureNameAlreadyExistsError,
  );
});

function buildRow() {
  return {
    id: "raw-material-1",
    name: submission.name,
    description: submission.description,
    product_class: submission.productClass,
    application_industry: submission.applicationIndustry,
    normative_document: submission.normativeDocument,
    al2o3: submission.al2o3,
    fe2o3: submission.fe2o3,
    created_at: "2026-08-23T08:00:00.000Z",
    updated_at: "2026-08-23T08:00:00.000Z",
  };
}

function withoutNormalizedName(value: typeof submission) {
  const { normalizedName: _normalizedName, ...rest } = value;
  return rest;
}
