import assert from "node:assert/strict";
import test from "node:test";
import type { DatabasePool } from "../db/pool.js";
import { createLaboratoryResultsRepository } from "./laboratoryResultsRepository.js";

const protocolReference = {
  indicators: [{ id: "al2o3" as const, label: "Al2O3", standard: "ГОСТ 1" }],
  incomingTestProfiles: [{ label: "Глина", indicatorIds: ["al2o3" as const] }],
  finishedProductTypes: [],
};

test("laboratory repository stores the session author with the validated result", async () => {
  const queries: Array<{ sql: string; parameters?: unknown[] }> = [];
  const pool = {
    async query(sql: string, parameters?: unknown[]) {
      queries.push({ sql, parameters });
      return [[], []];
    },
  } as unknown as DatabasePool;
  const repository = createLaboratoryResultsRepository(pool, {
    createId: () => "laboratory-result-1",
    now: () => new Date("2026-07-22T08:30:00.000Z"),
  });

  const saved = await repository.create({
    result: {
      section: "incoming",
      analysisDate: "2026-07-22",
      materialLabel: "Глина",
      samples: [{
        sampleIdentifier: "Вагон 12345",
        values: { al2o3: "31,4", moisture: "0,8" },
      }],
    },
    submittedByUserId: "user-lab",
    submittedByAccountId: "account-lab",
    laboratoryAssistantDisplayName: "Иванова А.А.",
    protocolReference,
  });

  assert.deepEqual(saved, {
    id: "laboratory-result-1",
    section: "incoming",
    analysisDate: "2026-07-22",
    materialLabel: "Глина",
    samples: [{
      sampleIdentifier: "Вагон 12345",
      values: { al2o3: "31,4", moisture: "0,8" },
    }],
    laboratoryAssistantDisplayName: "Иванова А.А.",
    createdAt: "2026-07-22T08:30:00.000Z",
  });
  assert.match(queries[0]?.sql ?? "", /insert into laboratory_results/u);
  assert.equal(queries[0]?.parameters?.[0], "laboratory-result-1");
  assert.equal(queries[0]?.parameters?.[5], "user-lab");
  assert.equal(queries[0]?.parameters?.[6], "account-lab");
  assert.equal(queries[0]?.parameters?.[7], "Иванова А.А.");
  assert.deepEqual(
    JSON.parse(String(queries[0]?.parameters?.[8])).protocolReference,
    protocolReference,
  );
});

test("laboratory repository finds one result with its saved protocol reference", async () => {
  const pool = {
    async query() {
      return [[{
        id: "laboratory-result-1",
        section: "incoming",
        analysis_date: "2026-07-22",
        material_label: "Глина марки ГИМ-2",
        product_brand: null,
        payload: JSON.stringify({
          section: "incoming",
          analysisDate: "2026-07-22",
          materialLabel: "Глина марки ГИМ-2",
          samples: [{ sampleIdentifier: "Вагон 123", values: { al2o3: "31,4" } }],
          protocolReference,
        }),
        laboratory_assistant_display_name: "Иванова А.А.",
        created_at: "2026-07-22T08:30:00.000Z",
      }], []];
    },
  } as unknown as DatabasePool;
  const repository = createLaboratoryResultsRepository(pool);

  const stored = await repository.findById("laboratory-result-1");

  assert.equal(stored?.id, "laboratory-result-1");
  assert.deepEqual(stored?.protocolReference, protocolReference);
});

test("laboratory repository lists filtered results newest first", async () => {
  let querySql = "";
  let queryParameters: unknown[] = [];
  const pool = {
    async query(sql: string, parameters?: unknown[]) {
      querySql = sql;
      queryParameters = parameters ?? [];
      return [[{
        id: "laboratory-result-2",
        section: "finished_product",
        analysis_date: "2026-07-21",
        material_label: "Формованные изделия",
        product_brand: "ША-22",
        payload: JSON.stringify({
          section: "finished_product",
          analysisDate: "2026-07-21",
          materialLabel: "Формованные изделия",
          productBrand: "ША-22",
          values: { strength: "38,1" },
          protocolReference,
        }),
        laboratory_assistant_display_name: "Иванова А.А.",
        created_at: "2026-07-21T09:00:00.000Z",
      }], []];
    },
  } as unknown as DatabasePool;
  const repository = createLaboratoryResultsRepository(pool);

  const results = await repository.list({
    section: "finished_product",
    dateFrom: "2026-07-01",
    dateTo: "2026-07-31",
    materialLabel: "Формованные изделия",
  });

  assert.equal(results[0]?.id, "laboratory-result-2");
  assert.equal("protocolReference" in (results[0] ?? {}), false);
  assert.match(querySql, /section = \?/u);
  assert.match(querySql, /analysis_date >= \?/u);
  assert.match(querySql, /analysis_date <= \?/u);
  assert.match(querySql, /material_label = \?/u);
  assert.match(querySql, /order by analysis_date desc, created_at desc, id desc/u);
  assert.deepEqual(queryParameters, [
    "finished_product",
    "2026-07-01",
    "2026-07-31",
    "Формованные изделия",
    100,
  ]);
});

test("laboratory repository matches a name query against object and brand", async () => {
  let querySql = "";
  let queryParameters: unknown[] = [];
  const pool = {
    async query(sql: string, parameters?: unknown[]) {
      querySql = sql;
      queryParameters = parameters ?? [];
      return [[], []];
    },
  } as unknown as DatabasePool;
  const repository = createLaboratoryResultsRepository(pool);

  await repository.list({ nameQuery: "100%_ШКИ" });

  assert.match(
    querySql,
    /\(material_label like \? or coalesce\(product_brand, ''\) like \?\)/u,
  );
  assert.deepEqual(queryParameters, [
    "%100\\%\\_ШКИ%",
    "%100\\%\\_ШКИ%",
    100,
  ]);
});

test("laboratory repository counts saved tests for the current month and today", async () => {
  let querySql = "";
  let queryParameters: unknown[] = [];
  const pool = {
    async query(sql: string, parameters?: unknown[]) {
      querySql = sql;
      queryParameters = parameters ?? [];
      return [[{
        result_month_count: "7",
        result_today_count: 2,
        sampled_month_count: "11",
        sampled_today_count: 3,
        chemical_analysis_month_count: "9",
        chemical_analysis_today_count: 1,
        kiln_month_count: "24",
        kiln_today_count: 4,
      }], []];
    },
  } as unknown as DatabasePool;
  const repository = createLaboratoryResultsRepository(pool);

  const summary = await repository.readOverviewSummary({
    monthStart: "2026-07-01",
    today: "2026-07-23",
  });

  assert.deepEqual(summary, {
    monthTotal: 7,
    todayTotal: 2,
    sampled: { monthTotal: 11, todayTotal: 3 },
    chemicalAnalyses: { monthTotal: 9, todayTotal: 1 },
    rotaryKiln2Readings: { monthTotal: 24, todayTotal: 4 },
  });
  assert.match(querySql, /from laboratory_sample_registration_journal/u);
  assert.match(querySql, /from laboratory_chemical_analysis_journal/u);
  assert.match(
    querySql,
    /date\(convert_tz\(created_at, '\+00:00', '\+03:00'\)\)/u,
  );
  assert.match(querySql, /from rotary_kiln_2_firing_journal/u);
  assert.match(
    querySql,
    /analysis_date = \?[^]*as result_today_count/u,
  );
  assert.deepEqual(queryParameters, [
    "2026-07-01",
    "2026-07-23",
    "2026-07-23",
    "2026-07-01",
    "2026-07-23",
    "2026-07-23",
    "2026-07-01",
    "2026-07-23",
    "2026-07-23",
    "2026-07-01",
    "2026-07-23",
    "2026-07-23",
  ]);
});

test("laboratory repository reads a legacy incoming result as one sample", async () => {
  const pool = {
    async query() {
      return [[{
        id: "laboratory-result-legacy",
        section: "incoming",
        analysis_date: "2026-07-20",
        material_label: "Глина",
        product_brand: null,
        payload: JSON.stringify({
          section: "incoming",
          analysisDate: "2026-07-20",
          materialLabel: "Глина",
          sampleIdentifier: "Вагон 100",
          values: { moisture: "0,9" },
        }),
        laboratory_assistant_display_name: "Иванова А.А.",
        created_at: "2026-07-20T09:00:00.000Z",
      }], []];
    },
  } as unknown as DatabasePool;
  const repository = createLaboratoryResultsRepository(pool);

  assert.deepEqual(await repository.list({ section: "incoming" }), [{
    id: "laboratory-result-legacy",
    section: "incoming",
    analysisDate: "2026-07-20",
    materialLabel: "Глина",
    samples: [{
      sampleIdentifier: "Вагон 100",
      values: { moisture: "0,9" },
    }],
    laboratoryAssistantDisplayName: "Иванова А.А.",
    createdAt: "2026-07-20T09:00:00.000Z",
  }]);
});
