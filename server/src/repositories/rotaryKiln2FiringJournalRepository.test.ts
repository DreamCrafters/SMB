import assert from "node:assert/strict";
import test from "node:test";
import type { DatabasePool } from "../db/pool.js";
import { createRotaryKiln2FiringJournalRepository } from "./rotaryKiln2FiringJournalRepository.js";

const record = {
  recordDate: "2026-07-29",
  recordTime: "08:05",
  producedMaterial: "ШКИ-66",
  waterAbsorption: 4.2,
  temperatureBeforeCyclone: 850,
  temperatureBeforeFilter: 210.5,
  temperatureInFieldChamber: 118,
  temperatureAtRollback: 96,
  gasConsumptionPerHour: 320.4,
  vacuum: 14.5,
  pressure: 1.8,
  shiftSupervisor: "Петров П.П.",
  burnerOperator: "Сидоров С.С.",
  laboratoryAssistant: "Иванова А.А.",
  sievePass05: 0.7,
  bulkDensity: 1.16,
  kilnLoadBucketsPerHour: 12,
  note: "Краткая остановка для осмотра.",
};

test("rotary kiln 2 firing repository stores every parameter and session author", async () => {
  const queries: Array<{ sql: string; parameters?: unknown[] }> = [];
  const pool = {
    async query(sql: string, parameters?: unknown[]) {
      queries.push({ sql, parameters });
      return [[], []];
    },
  } as unknown as DatabasePool;
  const repository = createRotaryKiln2FiringJournalRepository(pool, {
    createId: () => "kiln-record-1",
    now: () => new Date("2026-07-29T08:30:00.000Z"),
  });

  const saved = await repository.create({
    record,
    submittedByUserId: "laboratory-user",
    submittedByAccountId: "laboratory-account",
  });

  assert.deepEqual(saved, {
    id: "kiln-record-1",
    ...record,
    createdAt: "2026-07-29T08:30:00.000Z",
  });
  assert.match(queries[0]?.sql ?? "", /insert into rotary_kiln_2_firing_journal/u);
  assert.deepEqual(queries[0]?.parameters, [
    "kiln-record-1",
    "2026-07-29",
    "08:05",
    "ШКИ-66",
    4.2,
    850,
    210.5,
    118,
    96,
    320.4,
    14.5,
    1.8,
    "Петров П.П.",
    "Сидоров С.С.",
    "Иванова А.А.",
    0.7,
    1.16,
    12,
    "Краткая остановка для осмотра.",
    "laboratory-user",
    "laboratory-account",
    "2026-07-29T08:30:00.000Z",
  ]);
});

test("rotary kiln 2 firing repository stores omitted task 58 measurements as null", async () => {
  const queries: Array<{ sql: string; parameters?: unknown[] }> = [];
  const pool = {
    async query(sql: string, parameters?: unknown[]) {
      queries.push({ sql, parameters });
      return [[], []];
    },
  } as unknown as DatabasePool;
  const repository = createRotaryKiln2FiringJournalRepository(pool, {
    createId: () => "kiln-record-with-gaps",
    now: () => new Date("2026-08-07T09:30:00.000Z"),
  });
  const {
    temperatureInFieldChamber: _temperatureInFieldChamber,
    sievePass05: _sievePass05,
    kilnLoadBucketsPerHour: _kilnLoadBucketsPerHour,
    ...recordWithoutOptionalMeasurements
  } = record;

  const saved = await repository.create({
    record: recordWithoutOptionalMeasurements,
    submittedByUserId: "laboratory-user",
    submittedByAccountId: "laboratory-account",
  });

  assert.deepEqual(saved, {
    id: "kiln-record-with-gaps",
    ...recordWithoutOptionalMeasurements,
    createdAt: "2026-08-07T09:30:00.000Z",
  });
  assert.equal(queries[0]?.parameters?.[7], null);
  assert.equal(queries[0]?.parameters?.[15], null);
  assert.equal(queries[0]?.parameters?.[17], null);
});

test("rotary kiln 2 firing repository averages exactly the filtered displayed rows", async () => {
  let querySql = "";
  let queryParameters: unknown[] = [];
  const pool = {
    async query(sql: string, parameters?: unknown[]) {
      querySql = sql;
      queryParameters = parameters ?? [];
      return [[{
        id: "kiln-record-1",
        record_date: "2026-07-29",
        record_time: "08:05",
        produced_material: "ШКИ-66",
        water_absorption: "4.2000",
        temperature_before_cyclone: "850.0000",
        temperature_before_filter: "210.5000",
        temperature_in_field_chamber: "118.0000",
        temperature_at_rollback: "96.0000",
        gas_consumption_per_hour: "320.4000",
        vacuum_value: "14.5000",
        pressure_value: "1.8000",
        shift_supervisor: "Петров П.П.",
        burner_operator: "Сидоров С.С.",
        laboratory_assistant: "Иванова А.А.",
        sieve_pass_05: "0.7000",
        bulk_density: "1.1600",
        kiln_load_buckets_per_hour: "12.0000",
        note: null,
        created_at: "2026-07-29T08:30:00.000Z",
        average_bulk_density: "1.20000000",
      }], []];
    },
  } as unknown as DatabasePool;
  const repository = createRotaryKiln2FiringJournalRepository(pool);
  const { note: _note, ...recordWithoutNote } = record;

  const selection = await repository.list({
    dateFrom: "2026-07-01",
    dateTo: "2026-07-31",
    query: "Петров",
  });

  assert.deepEqual(selection, {
    records: [{
      id: "kiln-record-1",
      ...recordWithoutNote,
      createdAt: "2026-07-29T08:30:00.000Z",
    }],
    averageBulkDensity: 1.2,
  });
  assert.match(querySql, /avg\(selected\.bulk_density\) over \(\)/u);
  assert.match(querySql, /record_date >= \?/u);
  assert.match(querySql, /record_date <= \?/u);
  assert.match(querySql, /instr\(/u);
  assert.match(querySql, /limit \?\s*\) as selected/u);
  assert.deepEqual(queryParameters, [
    "2026-07-01",
    "2026-07-31",
    "Петров",
    200,
  ]);
});

test("rotary kiln 2 firing repository averages the last records of each material", async () => {
  let querySql = "";
  let queryParameters: unknown[] = [];
  const pool = {
    async query(sql: string, parameters?: unknown[]) {
      querySql = sql;
      queryParameters = parameters ?? [];
      return [[{
        material: "ШКИ-66",
        average_bulk_density: "1.1633333333",
        sample_count: "3",
        latest_record_date: "2026-07-30",
      }], []];
    },
  } as unknown as DatabasePool;
  const repository = createRotaryKiln2FiringJournalRepository(pool);

  const materials = await repository.listMaterialBulkDensities();

  assert.deepEqual(materials, [{
    material: "ШКИ-66",
    averageBulkDensityTonsPerCubicMeter: 1.163333,
    sampleCount: 3,
    latestRecordDate: "2026-07-30",
  }]);
  assert.match(querySql, /row_number\(\) over \(\s*partition by produced_material/u);
  assert.match(querySql, /where ranked\.position <= \?/u);
  assert.match(querySql, /produced_material is not null/u);
  assert.deepEqual(queryParameters, [10]);
});

test("rotary kiln 2 firing repository can average a single requested material", async () => {
  let queryParameters: unknown[] = [];
  const pool = {
    async query(_sql: string, parameters?: unknown[]) {
      queryParameters = parameters ?? [];
      return [[], []];
    },
  } as unknown as DatabasePool;
  const repository = createRotaryKiln2FiringJournalRepository(pool);

  const materials = await repository.listMaterialBulkDensities({
    material: "ШГР-28",
  });

  assert.deepEqual(materials, []);
  assert.deepEqual(queryParameters, ["ШГР-28", 10]);
});

test("rotary kiln 2 firing repository lists personnel options from the complete history", async () => {
  let querySql = "";
  const pool = {
    async query(sql: string) {
      querySql = sql;
      return [[
        {
          option_type: "burner_operator",
          value: "Сидоров С.С.",
        },
        {
          option_type: "burner_operator",
          value: "Смирнов С.С.",
        },
        {
          option_type: "shift_supervisor",
          value: "Петров П.П.",
        },
        {
          option_type: "shift_supervisor",
          value: "Кузнецов К.К.",
        },
      ], []];
    },
  } as unknown as DatabasePool;
  const repository = createRotaryKiln2FiringJournalRepository(pool);

  const options = await repository.listPersonnelOptions();

  assert.deepEqual(options, {
    shiftSupervisors: ["Петров П.П.", "Кузнецов К.К."],
    burnerOperators: ["Сидоров С.С.", "Смирнов С.С."],
  });
  assert.match(querySql, /group by shift_supervisor/u);
  assert.match(querySql, /group by burner_operator/u);
  assert.match(querySql, /order by option_type asc, last_used_at desc/u);
  assert.doesNotMatch(querySql, /limit/u);
});

test("rotary kiln 2 firing repository reads the last created record for the next draft", async () => {
  let querySql = "";
  const pool = {
    async query(sql: string) {
      querySql = sql;
      return [[{
        id: "kiln-record-backdated",
        record_date: "2026-07-27",
        record_time: "06:00",
        produced_material: "ША-22",
        water_absorption: "4.3000",
        temperature_before_cyclone: "852.0000",
        temperature_before_filter: "212.0000",
        temperature_in_field_chamber: "119.0000",
        temperature_at_rollback: "97.0000",
        gas_consumption_per_hour: "321.0000",
        vacuum_value: "14.6000",
        pressure_value: "1.9000",
        shift_supervisor: "Ильин И.И.",
        burner_operator: "Фомин Ф.Ф.",
        laboratory_assistant: "Иванова А.А.",
        sieve_pass_05: "0.7500",
        bulk_density: "1.1800",
        kiln_load_buckets_per_hour: "12.0000",
        note: null,
        created_at: "2026-07-30T12:30:00.000Z",
      }], []];
    },
  } as unknown as DatabasePool;
  const repository = createRotaryKiln2FiringJournalRepository(pool);

  const latestRecord = await repository.findLatestCreated();

  assert.deepEqual(latestRecord, {
    id: "kiln-record-backdated",
    recordDate: "2026-07-27",
    recordTime: "06:00",
    producedMaterial: "ША-22",
    waterAbsorption: 4.3,
    temperatureBeforeCyclone: 852,
    temperatureBeforeFilter: 212,
    temperatureInFieldChamber: 119,
    temperatureAtRollback: 97,
    gasConsumptionPerHour: 321,
    vacuum: 14.6,
    pressure: 1.9,
    shiftSupervisor: "Ильин И.И.",
    burnerOperator: "Фомин Ф.Ф.",
    laboratoryAssistant: "Иванова А.А.",
    sievePass05: 0.75,
    bulkDensity: 1.18,
    kilnLoadBucketsPerHour: 12,
    createdAt: "2026-07-30T12:30:00.000Z",
  });
  assert.match(querySql, /order by created_at desc, id desc/u);
  assert.match(querySql, /limit 1/u);
  assert.doesNotMatch(querySql, /record_date desc/u);
});

test("rotary kiln 2 firing repository omits null task 58 measurements", async () => {
  const pool = {
    async query() {
      return [[{
        id: "kiln-record-with-gaps",
        record_date: "2026-08-07",
        record_time: "09:15",
        produced_material: "ШГР-К",
        water_absorption: "4.2000",
        temperature_before_cyclone: "850.0000",
        temperature_before_filter: "210.5000",
        temperature_in_field_chamber: null,
        temperature_at_rollback: "96.0000",
        gas_consumption_per_hour: "320.4000",
        vacuum_value: "14.5000",
        pressure_value: "1.8000",
        shift_supervisor: "Петров П.П.",
        burner_operator: "Сидоров С.С.",
        laboratory_assistant: "Иванова А.А.",
        sieve_pass_05: null,
        bulk_density: "1.1600",
        kiln_load_buckets_per_hour: null,
        note: null,
        created_at: "2026-08-07T09:30:00.000Z",
      }], []];
    },
  } as unknown as DatabasePool;
  const repository = createRotaryKiln2FiringJournalRepository(pool);

  const latestRecord = await repository.findLatestCreated();

  assert.deepEqual(latestRecord, {
    id: "kiln-record-with-gaps",
    recordDate: "2026-08-07",
    recordTime: "09:15",
    producedMaterial: "ШГР-К",
    waterAbsorption: 4.2,
    temperatureBeforeCyclone: 850,
    temperatureBeforeFilter: 210.5,
    temperatureAtRollback: 96,
    gasConsumptionPerHour: 320.4,
    vacuum: 14.5,
    pressure: 1.8,
    shiftSupervisor: "Петров П.П.",
    burnerOperator: "Сидоров С.С.",
    laboratoryAssistant: "Иванова А.А.",
    bulkDensity: 1.16,
    createdAt: "2026-08-07T09:30:00.000Z",
  });
});

test("rotary kiln 2 firing repository corrects a stable record and stores a revision", async () => {
  const queries: Array<{ sql: string; parameters?: unknown[] }> = [];
  const pool = {
    async query(sql: string, parameters?: unknown[]) {
      queries.push({ sql, parameters });
      if (/select[\s\S]+for update/u.test(sql)) {
        return [[{
          id: "kiln-record-1",
          record_date: record.recordDate,
          record_time: record.recordTime,
          produced_material: record.producedMaterial,
          water_absorption: String(record.waterAbsorption),
          temperature_before_cyclone: String(record.temperatureBeforeCyclone),
          temperature_before_filter: String(record.temperatureBeforeFilter),
          temperature_in_field_chamber: String(record.temperatureInFieldChamber),
          temperature_at_rollback: String(record.temperatureAtRollback),
          gas_consumption_per_hour: String(record.gasConsumptionPerHour),
          vacuum_value: String(record.vacuum),
          pressure_value: String(record.pressure),
          shift_supervisor: record.shiftSupervisor,
          burner_operator: record.burnerOperator,
          laboratory_assistant: record.laboratoryAssistant,
          sieve_pass_05: String(record.sievePass05),
          bulk_density: String(record.bulkDensity),
          kiln_load_buckets_per_hour: String(record.kilnLoadBucketsPerHour),
          note: record.note,
          created_at: "2026-07-29T08:30:00.000Z",
        }], []];
      }
      return [[], []];
    },
  } as unknown as DatabasePool;
  const repository = createRotaryKiln2FiringJournalRepository(pool, {
    createId: () => "kiln-revision-1",
    now: () => new Date("2026-08-04T10:15:00.000Z"),
  });
  const {
    temperatureInFieldChamber: _temperatureInFieldChamber,
    sievePass05: _sievePass05,
    kilnLoadBucketsPerHour: _kilnLoadBucketsPerHour,
    ...recordWithoutOptionalMeasurements
  } = record;
  const correctedRecord = {
    ...recordWithoutOptionalMeasurements,
    recordTime: "09:15",
    producedMaterial: "ША-22",
    bulkDensity: 1.2,
    note: "Исправлено по журналу.",
  };

  const result = await repository.update({
    id: "kiln-record-1",
    record: correctedRecord,
    correctedByUserId: "laboratory-user",
    correctedByAccountId: "laboratory-account",
    correctedByDisplayName: "Иванова Анна",
  });

  assert.deepEqual(result, {
    before: {
      id: "kiln-record-1",
      ...record,
      createdAt: "2026-07-29T08:30:00.000Z",
    },
    record: {
      id: "kiln-record-1",
      ...correctedRecord,
      createdAt: "2026-07-29T08:30:00.000Z",
    },
  });
  assert.match(queries[0]?.sql ?? "", /where id = \?[\s\S]+for update/u);
  assert.deepEqual(queries[0]?.parameters, ["kiln-record-1"]);
  assert.match(queries[1]?.sql ?? "", /update rotary_kiln_2_firing_journal/u);
  assert.equal(queries[1]?.parameters?.[6], null);
  assert.equal(queries[1]?.parameters?.[14], null);
  assert.equal(queries[1]?.parameters?.[16], null);
  assert.equal(queries[1]?.parameters?.at(-1), "kiln-record-1");
  assert.match(
    queries[2]?.sql ?? "",
    /insert into rotary_kiln_2_firing_revisions/u,
  );
  assert.equal(queries[2]?.parameters?.[0], "kiln-revision-1");
  assert.equal(queries[2]?.parameters?.[1], "kiln-record-1");
  assert.deepEqual(JSON.parse(String(queries[2]?.parameters?.[2])), {
    id: "kiln-record-1",
    ...record,
    createdAt: "2026-07-29T08:30:00.000Z",
  });
  assert.deepEqual(JSON.parse(String(queries[2]?.parameters?.[3])), {
    id: "kiln-record-1",
    ...correctedRecord,
    createdAt: "2026-07-29T08:30:00.000Z",
  });
  assert.deepEqual(queries[2]?.parameters?.slice(4), [
    "laboratory-user",
    "laboratory-account",
    "Иванова Анна",
    "2026-08-04T10:15:00.000Z",
  ]);
});
