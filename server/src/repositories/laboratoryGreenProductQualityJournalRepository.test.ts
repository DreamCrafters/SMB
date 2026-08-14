import assert from "node:assert/strict";
import test from "node:test";
import type { DatabasePool } from "../db/pool.js";
import {
  createLaboratoryGreenProductQualityJournalRepository,
  LaboratoryGreenProductQualityWagonBrandMismatchError,
  LaboratoryGreenProductQualityWagonUnavailableError,
} from "./laboratoryGreenProductQualityJournalRepository.js";

const record = {
  recordDate: "2026-08-05",
  pressNumber: "3" as const,
  productBrand: "ШКУ-32",
  pressDate: "2026-08-04",
  setter: "Иванов И.И.",
  pressOperator: "Петров П.П.",
  loadingDate: "2026-08-05",
  pieceCount: 480,
  wagonIds: ["wagon-2", "wagon-1"],
  measurements: [
    {
      measurementNumber: 1,
      lengthFirst: "230,5",
      lengthSecond: "231",
      widthFirst: "114",
      widthSecond: "114",
      heightFirst: "64",
      heightSecond: "63,8",
      weight: "3,4",
      mechanicalStrength: "42.5",
      density: "2,11",
    },
  ],
  pressOperatorRecommendations: "Проверить давление прессования.",
};

test("green product quality repository stores canonical wagon links with the journal", async () => {
  const queries: Array<{ sql: string; parameters?: unknown[] }> = [];
  const pool = {
    async query(sql: string, parameters?: unknown[]) {
      queries.push({ sql, parameters });
      if (/from refractory_wagons/u.test(sql)) {
        return [[
          {
            id: "wagon-1",
            wagon_number: "В-01",
            product_brand: " шку-32 ",
          },
          {
            id: "wagon-2",
            wagon_number: "В-02",
            product_brand: "ШКУ-32",
          },
        ], []];
      }
      return [[], []];
    },
  } as unknown as DatabasePool;
  const repository = createLaboratoryGreenProductQualityJournalRepository(pool, {
    createId: () => "green-quality-1",
    now: () => new Date("2026-08-05T08:30:00.000Z"),
  });

  assert.deepEqual(await repository.create({
    record,
    submittedByUserId: "laboratory-user",
    submittedByAccountId: "laboratory-account",
  }), {
    id: "green-quality-1",
    ...record,
    wagons: [
      { id: "wagon-2", number: "В-02" },
      { id: "wagon-1", number: "В-01" },
    ],
    createdAt: "2026-08-05T08:30:00.000Z",
  });
  assert.match(queries[0]?.sql ?? "", /from refractory_wagons/u);
  assert.match(
    queries[1]?.sql ?? "",
    /insert into laboratory_green_product_quality_journal/u,
  );
  assert.match(
    queries[2]?.sql ?? "",
    /insert into laboratory_green_product_quality_wagons/u,
  );
  assert.deepEqual(queries[2]?.parameters, [
    "green-quality-1",
    "wagon-2",
    0,
    "green-quality-1",
    "wagon-1",
    1,
  ]);
  const rawControlUpdate = queries.find(
    ({ sql }) => /update refractory_wagons wagon/u.test(sql),
  );
  assert.deepEqual(rawControlUpdate?.parameters, [
    "wagon-2",
    "wagon-1",
    "wagon-2",
    "wagon-1",
  ]);
});

test("green product quality repository rejects a missing wagon before writing the journal", async () => {
  const queries: Array<{ sql: string; parameters?: unknown[] }> = [];
  const pool = {
    async query(sql: string, parameters?: unknown[]) {
      queries.push({ sql, parameters });
      return [[{
        id: "wagon-1",
        wagon_number: "В-01",
        product_brand: null,
      }], []];
    },
  } as unknown as DatabasePool;
  const repository = createLaboratoryGreenProductQualityJournalRepository(pool);

  await assert.rejects(
    () => repository.create({
      record,
      submittedByUserId: "laboratory-user",
      submittedByAccountId: "laboratory-account",
    }),
    LaboratoryGreenProductQualityWagonUnavailableError,
  );
  assert.equal(queries.length, 1);
  assert.match(queries[0]?.sql ?? "", /from refractory_wagons/u);
});

test("green product quality repository rejects wagons with different product brands", async () => {
  const queries: Array<{ sql: string; parameters?: unknown[] }> = [];
  const pool = {
    async query(sql: string, parameters?: unknown[]) {
      queries.push({ sql, parameters });
      return [[
        {
          id: "wagon-1",
          wagon_number: "В-01",
          product_brand: "ШКУ-32",
        },
        {
          id: "wagon-2",
          wagon_number: "В-02",
          product_brand: "ШКИ-66",
        },
      ], []];
    },
  } as unknown as DatabasePool;
  const repository = createLaboratoryGreenProductQualityJournalRepository(pool);

  await assert.rejects(
    () => repository.create({
      record,
      submittedByUserId: "laboratory-user",
      submittedByAccountId: "laboratory-account",
    }),
    LaboratoryGreenProductQualityWagonBrandMismatchError,
  );
  assert.equal(queries.length, 1);
  assert.match(queries[0]?.sql ?? "", /product_brand/u);
  assert.match(queries[0]?.sql ?? "", /for update/u);
});

test("green product quality repository accepts a legacy wagon without a product brand", async () => {
  const queries: Array<{ sql: string; parameters?: unknown[] }> = [];
  const pool = {
    async query(sql: string, parameters?: unknown[]) {
      queries.push({ sql, parameters });
      if (/from refractory_wagons/u.test(sql)) {
        return [[
          {
            id: "wagon-1",
            wagon_number: "В-01",
            product_brand: null,
          },
          {
            id: "wagon-2",
            wagon_number: "В-02",
            product_brand: "ШКУ-32",
          },
        ], []];
      }
      return [[], []];
    },
  } as unknown as DatabasePool;
  const repository = createLaboratoryGreenProductQualityJournalRepository(pool, {
    createId: () => "green-quality-with-legacy-wagon",
    now: () => new Date("2026-08-05T08:30:00.000Z"),
  });

  const saved = await repository.create({
    record,
    submittedByUserId: "laboratory-user",
    submittedByAccountId: "laboratory-account",
  });

  assert.deepEqual(saved.wagons, [
    { id: "wagon-2", number: "В-02" },
    { id: "wagon-1", number: "В-01" },
  ]);
  assert.match(queries[0]?.sql ?? "", /for update/u);
});

test("green product quality repository filters and returns wagon numbers in selection order", async () => {
  const queries: Array<{ sql: string; parameters?: unknown[] }> = [];
  const pool = {
    async query(sql: string, parameters?: unknown[]) {
      queries.push({ sql, parameters });
      if (/select\s+link\.green_product_quality_id/u.test(sql)) {
        return [[
          {
            green_product_quality_id: "green-quality-1",
            id: "wagon-2",
            wagon_number: "В-02",
          },
          {
            green_product_quality_id: "green-quality-1",
            id: "wagon-1",
            wagon_number: "В-01",
          },
        ], []];
      }
      return [[buildJournalRow()], []];
    },
  } as unknown as DatabasePool;
  const repository = createLaboratoryGreenProductQualityJournalRepository(pool);

  assert.deepEqual(await repository.list({
    dateFrom: "2026-08-01",
    dateTo: "2026-08-31",
    query: "Петров",
    nameQuery: "ШКУ_100%",
  }), [{
    id: "green-quality-1",
    ...record,
    wagons: [
      { id: "wagon-2", number: "В-02" },
      { id: "wagon-1", number: "В-01" },
    ],
    createdAt: "2026-08-05T08:30:00.000Z",
  }]);
  assert.match(queries[0]?.sql ?? "", /record_date >= \?/u);
  assert.match(queries[0]?.sql ?? "", /record_date <= \?/u);
  assert.match(queries[0]?.sql ?? "", /instr\(/u);
  assert.match(queries[0]?.sql ?? "", /product_brand like \?/u);
  assert.match(queries[0]?.sql ?? "", /order by record_date desc, sequence_id desc/u);
  assert.deepEqual(queries[0]?.parameters, [
    "2026-08-01",
    "2026-08-31",
    "Петров",
    "%ШКУ\\_100\\%%",
    200,
  ]);
  assert.deepEqual(queries[1]?.parameters, ["green-quality-1"]);
});

test("green product quality repository lists people from history and wagons from the registry", async () => {
  const queries: string[] = [];
  const pool = {
    async query(sql: string) {
      queries.push(sql);
      if (/from refractory_wagons/u.test(sql)) {
        return [[
          {
            id: "wagon-2",
            wagon_number: "В-02",
            loading_date: "2026-08-05",
            product_brand: "ШКИ-66",
            press_date: "2026-08-04",
            piece_count: 480,
            setter_name: "Сидоров С.С.",
            press_operator: "Кузнецов К.К.",
          },
          {
            id: "wagon-1",
            wagon_number: "В-01",
            loading_date: "2026-08-04",
            product_brand: "ШКУ-32",
            press_date: null,
            piece_count: null,
            setter_name: null,
            press_operator: null,
          },
        ], []];
      }
      return [[
        { option_type: "setter", value: "Иванов И.И." },
        { option_type: "press_operator", value: "Петров П.П." },
      ], []];
    },
  } as unknown as DatabasePool;
  const repository = createLaboratoryGreenProductQualityJournalRepository(pool);

  assert.deepEqual(await repository.listOptions(), {
    setters: ["Иванов И.И."],
    pressOperators: ["Петров П.П."],
    wagons: [
      {
        id: "wagon-2",
        number: "В-02",
        loadingDate: "2026-08-05",
        productBrand: "ШКИ-66",
        pressDate: "2026-08-04",
        pieceCount: 480,
        setter: "Сидоров С.С.",
        pressOperator: "Кузнецов К.К.",
      },
      {
        id: "wagon-1",
        number: "В-01",
        loadingDate: "2026-08-04",
        productBrand: "ШКУ-32",
        pressDate: null,
        pieceCount: null,
        setter: null,
        pressOperator: null,
      },
    ],
  });
  assert.match(queries[0] ?? "", /group by setter_name/u);
  assert.match(queries[0] ?? "", /group by press_operator/u);
  assert.match(queries[0] ?? "", /order by option_type asc, last_used_at desc, value asc/u);
  assert.match(
    queries[1] ?? "",
    /order by loading_date desc, wagon\.sequence_id desc/u,
  );
  // Вагон в ремонте не предлагается лаборанту для новой садки.
  assert.match(queries[1] ?? "", /post_firing_condition is null or post_firing_condition <> \?/u);
});

test("green product quality repository corrects a stable row and stores wagon-aware revision snapshots", async () => {
  const queries: Array<{ sql: string; parameters?: unknown[] }> = [];
  const corrected = {
    ...record,
    wagonIds: ["wagon-3"],
    measurements: [{ ...record.measurements[0]!, lengthSecond: "232" }],
    pressOperatorRecommendations: "Снизить давление прессования.",
  };
  const pool = {
    async query(sql: string, parameters?: unknown[]) {
      queries.push({ sql, parameters });
      if (/from refractory_wagons/u.test(sql) && !/inner join/u.test(sql)) {
        return [[{
          id: "wagon-3",
          wagon_number: "В-03",
          product_brand: "ШКУ-32",
        }], []];
      }
      if (/for update/u.test(sql)) return [[buildJournalRow()], []];
      if (/select\s+link\.green_product_quality_id/u.test(sql)) {
        return [[
          {
            green_product_quality_id: "green-quality-1",
            id: "wagon-2",
            wagon_number: "В-02",
          },
          {
            green_product_quality_id: "green-quality-1",
            id: "wagon-1",
            wagon_number: "В-01",
          },
        ], []];
      }
      return [[], []];
    },
  } as unknown as DatabasePool;
  const repository = createLaboratoryGreenProductQualityJournalRepository(pool, {
    createId: () => "green-quality-revision-1",
    now: () => new Date("2026-08-05T10:15:00.000Z"),
  });

  assert.deepEqual(await repository.update({
    id: "green-quality-1",
    record: corrected,
    correctedByUserId: "laboratory-user",
    correctedByAccountId: "laboratory-account",
    correctedByDisplayName: "Иванова Анна",
  }), {
    before: {
      ...record,
      wagons: [
        { id: "wagon-2", number: "В-02" },
        { id: "wagon-1", number: "В-01" },
      ],
    },
    record: {
      id: "green-quality-1",
      ...corrected,
      wagons: [{ id: "wagon-3", number: "В-03" }],
      createdAt: "2026-08-05T08:30:00.000Z",
    },
  });
  assert.match(queries[1]?.sql ?? "", /for update/u);
  assert.match(
    queries.find(({ sql }) => /update laboratory_green_product_quality_journal/u.test(sql))?.sql ?? "",
    /update laboratory_green_product_quality_journal/u,
  );
  assert.match(
    queries.find(({ sql }) => /delete from laboratory_green_product_quality_wagons/u.test(sql))?.sql ?? "",
    /delete from laboratory_green_product_quality_wagons/u,
  );
  const revision = queries.find(
    ({ sql }) => /insert into laboratory_green_product_quality_revisions/u.test(sql),
  );
  assert.deepEqual(revision?.parameters?.slice(0, 2), [
    "green-quality-revision-1",
    "green-quality-1",
  ]);
  assert.deepEqual(JSON.parse(String(revision?.parameters?.[2])), {
    ...record,
    wagons: [
      { id: "wagon-2", number: "В-02" },
      { id: "wagon-1", number: "В-01" },
    ],
  });
  assert.deepEqual(JSON.parse(String(revision?.parameters?.[3])), {
    ...corrected,
    wagons: [{ id: "wagon-3", number: "В-03" }],
  });
  assert.deepEqual(revision?.parameters?.slice(4), [
    "laboratory-user",
    "laboratory-account",
    "Иванова Анна",
    "2026-08-05T10:15:00.000Z",
  ]);
  const rawControlUpdate = queries.find(
    ({ sql }) => /update refractory_wagons wagon/u.test(sql),
  );
  assert.deepEqual(rawControlUpdate?.parameters, [
    "wagon-2",
    "wagon-1",
    "wagon-3",
    "wagon-2",
    "wagon-1",
    "wagon-3",
  ]);
});

function buildJournalRow() {
  return {
    id: "green-quality-1",
    record_date: record.recordDate,
    press_number: record.pressNumber,
    product_brand: record.productBrand,
    press_date: record.pressDate,
    setter_name: record.setter,
    press_operator: record.pressOperator,
    loading_date: record.loadingDate,
    piece_count: record.pieceCount,
    measurements: record.measurements,
    press_operator_recommendations: record.pressOperatorRecommendations,
    created_at: "2026-08-05T08:30:00.000Z",
  };
}
