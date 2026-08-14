import assert from "node:assert/strict";
import test from "node:test";
import type { DatabasePool } from "../db/pool.js";
import {
  createRefractoryWagonsRepository,
  RefractoryWagonBrandMismatchError,
  RefractoryWagonNumberAlreadyExistsError,
} from "./refractoryWagonsRepository.js";

const shopOwnedWagon = {
  number: "В-17",
  loadingDate: "2026-08-06",
  productBrand: "ШКУ-32",
  pressDate: "2026-08-05",
  pieceCount: 480,
  setter: "Иванов И.И.",
  pressOperator: "Петров П.П.",
};

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
          press_date: "2026-08-05",
          piece_count: 480,
          setter_name: "Иванов И.И.",
          press_operator: "Петров П.П.",
          raw_control_date: null,
          firing_operator: "Зайцев З.З.",
          sorter_name: "Орлова О.О.",
          post_firing_condition: "Можно эксплуатировать",
          service_approval_date: "2026-08-14",
          created_at: "2026-08-06T08:30:00.000Z",
        }], []];
      }
      if (/from refractory_wagon_lifecycle_events/u.test(sql)) {
        return [[
          { wagon_id: "wagon-17", event_type: "firing", event_date: "2026-08-07" },
          { wagon_id: "wagon-17", event_type: "firing", event_date: "2026-08-08" },
          { wagon_id: "wagon-17", event_type: "firing", event_date: "2026-08-09" },
          { wagon_id: "wagon-17", event_type: "firing", event_date: "2026-08-10" },
          { wagon_id: "wagon-17", event_type: "firing", event_date: "2026-08-11" },
          { wagon_id: "wagon-17", event_type: "firing", event_date: "2026-08-12" },
          { wagon_id: "wagon-17", event_type: "sorting", event_date: "2026-08-12" },
        ], []];
      }
      return [[], []];
    },
  } as unknown as DatabasePool;
  const repository = createRefractoryWagonsRepository(pool, {
    createId: () => "wagon-17",
    now: () => new Date("2026-08-06T08:30:00.000Z"),
  });

  const created = await repository.create({
    wagon: shopOwnedWagon,
    submittedByUserId: "refractory-user",
    submittedByAccountId: "refractory-account",
  });

  // Производные поля заполняются отчётом печного отделения и осмотром.
  assert.deepEqual(created, {
    id: "wagon-17",
    ...shopOwnedWagon,
    rawControlDate: null,
    firingOperator: null,
    firingDates: [],
    sorter: null,
    sortingDate: null,
    postFiringCondition: null,
    serviceApprovalDate: null,
    createdAt: "2026-08-06T08:30:00.000Z",
  });
  assert.match(queries[0]?.sql ?? "", /insert into refractory_wagon_catalog/u);
  assert.deepEqual(queries[0]?.parameters, [
    "wagon-17",
    "В-17",
    "refractory-user",
    "refractory-account",
    "2026-08-06T08:30:00.000Z",
  ]);
  assert.match(queries[1]?.sql ?? "", /insert into refractory_wagons/u);
  assert.deepEqual(queries[1]?.parameters, [
    "wagon-17",
    "wagon-17",
    "В-17",
    "2026-08-06",
    "ШКУ-32",
    "2026-08-05",
    480,
    "Иванов И.И.",
    "Петров П.П.",
    "refractory-user",
    "refractory-account",
    "2026-08-06T08:30:00.000Z",
  ]);

  assert.deepEqual(await repository.list(), [{
    id: "wagon-17",
    ...shopOwnedWagon,
    rawControlDate: null,
    firingOperator: "Зайцев З.З.",
    firingDates: [
      "2026-08-07",
      "2026-08-08",
      "2026-08-09",
      "2026-08-10",
      "2026-08-11",
      "2026-08-12",
    ],
    sorter: "Орлова О.О.",
    sortingDate: "2026-08-12",
    postFiringCondition: "Можно эксплуатировать",
    serviceApprovalDate: "2026-08-14",
    createdAt: "2026-08-06T08:30:00.000Z",
  }]);
  assert.match(queries[2]?.sql ?? "", /order by sequence_id desc/u);
  assert.match(queries[3]?.sql ?? "", /from refractory_wagon_lifecycle_events/u);
  assert.deepEqual(await repository.findByIds(["wagon-17"]), [{
    id: "wagon-17",
    number: "В-17",
    productBrand: "ШКУ-32",
  }]);
  assert.match(queries[4]?.sql ?? "", /where id in \(\?\)/u);
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
      wagon: { ...shopOwnedWagon, pressDate: null, pieceCount: null },
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
          catalog_wagon_id: "catalog-17",
          wagon_number: "В-17",
          loading_date: "2026-08-06",
          product_brand: "ШКУ-32",
          press_date: null,
          piece_count: null,
          setter_name: "Иванов И.И.",
          press_operator: "Петров П.П.",
          raw_control_date: "2026-08-07",
          firing_operator: "Зайцев З.З.",
          sorter_name: null,
          post_firing_condition: null,
          service_approval_date: null,
          created_at: "2026-08-06T08:30:00.000Z",
        }], []];
      }
      if (/from refractory_wagon_lifecycle_events/u.test(sql)) {
        return [[
          { wagon_id: "wagon-17", event_type: "firing", event_date: "2026-08-08" },
          { wagon_id: "wagon-17", event_type: "sorting", event_date: "2026-08-11" },
        ], []];
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
      pressDate: "2026-08-04",
      pieceCount: 512,
      setter: "Сидоров С.С.",
      pressOperator: "Кузнецов К.К.",
    },
    correctedByUserId: "refractory-user",
    correctedByAccountId: "refractory-account",
    correctedByDisplayName: "Мастер ОЦ",
  });

  assert.equal(correction?.before.number, "В-17");
  // Исправление вагона не трогает производные поля обжига и осмотра.
  assert.deepEqual(correction?.record, {
    id: "wagon-17",
    number: "В-17А",
    loadingDate: "2026-08-05",
    productBrand: "ША-22",
    pressDate: "2026-08-04",
    pieceCount: 512,
    setter: "Сидоров С.С.",
    pressOperator: "Кузнецов К.К.",
    rawControlDate: "2026-08-07",
    firingOperator: "Зайцев З.З.",
    firingDates: ["2026-08-08"],
    sorter: null,
    sortingDate: "2026-08-11",
    postFiringCondition: null,
    serviceApprovalDate: null,
    createdAt: "2026-08-06T08:30:00.000Z",
  });
  assert.deepEqual(correction?.before.firingDates, ["2026-08-08"]);
  // Переименование сначала фиксируется в каталоге — там живёт уникальность.
  assert.match(queries[2]?.sql ?? "", /update refractory_wagon_catalog/u);
  assert.deepEqual(queries[2]?.parameters, ["В-17А", "catalog-17"]);
  assert.match(queries[3]?.sql ?? "", /update refractory_wagons/u);
  assert.deepEqual(queries[3]?.parameters, [
    "В-17А",
    "2026-08-05",
    "ША-22",
    "2026-08-04",
    512,
    "Сидоров С.С.",
    "Кузнецов К.К.",
    "wagon-17",
  ]);
  assert.match(
    queries[4]?.sql ?? "",
    /insert into refractory_wagon_revisions/u,
  );
  assert.deepEqual(queries[4]?.parameters?.slice(0, 2), [
    "revision-1",
    "wagon-17",
  ]);
  assert.deepEqual(queries[4]?.parameters?.slice(4), [
    "refractory-user",
    "refractory-account",
    "Мастер ОЦ",
    "2026-08-08T09:15:00.000Z",
  ]);
});

test("refractory wagon repository replaces report-derived firing and sorting events", async () => {
  const queries: Array<{ sql: string; parameters?: unknown[] }> = [];
  const pool = {
    async query(sql: string, parameters?: unknown[]) {
      queries.push({ sql, parameters });
      if (/select id[\s\S]+from refractory_wagons[\s\S]+for update/u.test(sql)) {
        return [[...(parameters ?? []).map((id) => ({
          id,
          product_brand: "ША-22",
        }))], []];
      }
      return [[], []];
    },
  } as unknown as DatabasePool;
  const repository = createRefractoryWagonsRepository(pool);

  await repository.replaceReportLifecycle({
    sourceReportId: "report-9",
    reportDate: "2026-08-12",
    shiftNumber: 2,
    firingWagonIds: ["wagon-17", "wagon-18"],
    sortingWagonIds: ["wagon-18"],
    wagonProductBrands: {
      "wagon-17": "ША-22",
      "wagon-18": "ША-22",
    },
    firingOperators: {
      "wagon-17": "Зайцев З.З.",
      "wagon-18": "Зайцев З.З.",
    },
    sorters: { "wagon-18": "Орлова О.О." },
    firingDates: { "wagon-17": "2026-08-11", "wagon-18": null },
    sortingDates: { "wagon-18": "2026-08-13" },
  });

  assert.deepEqual(queries[0]?.parameters, ["wagon-17", "wagon-18"]);
  assert.match(queries[1]?.sql ?? "", /delete from refractory_wagon_lifecycle_events/u);
  assert.deepEqual(queries[1]?.parameters, ["firing", "2026-08-12", 2]);
  assert.match(queries[2]?.sql ?? "", /insert into refractory_wagon_lifecycle_events/u);
  // Дата вагона 17 указана в строке отчёта, вагон 18 наследует общую дату отчёта.
  assert.deepEqual(queries[2]?.parameters, [
    "firing", "2026-08-12", 2, "firing", 0, "wagon-17", "2026-08-11", "report-9",
    "firing", "2026-08-12", 2, "firing", 1, "wagon-18", "2026-08-12", "report-9",
    "firing", "2026-08-12", 2, "sorting", 0, "wagon-18", "2026-08-13", "report-9",
  ]);
  // Обжигальщик и сортировщик строки отчёта переносятся в затронутые вагоны.
  assert.match(queries[3]?.sql ?? "", /set firing_operator = \?/u);
  assert.deepEqual(queries[3]?.parameters, ["Зайцев З.З.", "wagon-17"]);
  assert.match(
    queries[4]?.sql ?? "",
    /set firing_operator = \?, sorter_name = \?/u,
  );
  assert.deepEqual(queries[4]?.parameters, [
    "Зайцев З.З.",
    "Орлова О.О.",
    "wagon-18",
  ]);

  await assert.rejects(
    () => repository.replaceReportLifecycle({
      sourceReportId: "report-10",
      reportDate: "2026-08-13",
      shiftNumber: 1,
      firingWagonIds: ["wagon-17"],
      sortingWagonIds: [],
      wagonProductBrands: { "wagon-17": "Другая марка" },
      firingOperators: {},
      sorters: {},
      firingDates: {},
      sortingDates: {},
    }),
    RefractoryWagonBrandMismatchError,
  );
});
