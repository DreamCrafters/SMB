import assert from "node:assert/strict";
import test from "node:test";
import type { DatabasePool } from "../db/pool.js";
import {
  createLaboratoryRawMaterialQualityJournalRepository,
} from "./laboratoryRawMaterialQualityJournalRepository.js";

const record = {
  recordDate: "2026-08-05",
  laboratoryAssistant: "Иванова А.А.",
  shiftSupervisor: "Петров П.П.",
  shift: "day" as const,
  clayBrand: "Глина ГИМ-2",
  clayMoisture: "6,8",
  clayGrainComposition: "0–3 мм",
  disintegratorNumber: "2" as const,
  temperMoisture: "1,2",
  temperGrainComposition: "0–5 мм",
  temperSieveResidue1: "4,1",
  temperSieveResidue2: "2,3",
  temperSieveResidue3: "0,8",
  temperSievePass05: "91,2",
  temperBrand: "Шамот ШКИ-66",
  temperBulkDensity: "1,16",
  slipMixerNumber: "3",
  slipTemperature: "42 °C",
  slipDensity: "1,52",
  runnerNumber: "4",
  chargeChamottePercentage: "72",
  chargeClayPercentage: "28",
  chargeResidue0063: "3,4",
  chargeMoisture: "5,9",
  elutriationCoefficient: "0,84",
  recommendationRecipient: "runner_operator" as const,
  recommendationText: "Скорректировать влажность шихты.",
};

test("raw material quality repository stores every section with the session author", async () => {
  const queries: Array<{ sql: string; parameters?: unknown[] }> = [];
  const pool = {
    async query(sql: string, parameters?: unknown[]) {
      queries.push({ sql, parameters });
      return [[], []];
    },
  } as unknown as DatabasePool;
  const repository = createLaboratoryRawMaterialQualityJournalRepository(pool, {
    createId: () => "raw-material-quality-1",
    now: () => new Date("2026-08-05T08:30:00.000Z"),
  });

  const saved = await repository.create({
    record,
    submittedByUserId: "laboratory-user",
    submittedByAccountId: "laboratory-account",
  });

  assert.deepEqual(saved, {
    id: "raw-material-quality-1",
    ...record,
    createdAt: "2026-08-05T08:30:00.000Z",
  });
  assert.match(
    queries[0]?.sql ?? "",
    /insert into laboratory_raw_material_quality_journal/u,
  );
  assert.deepEqual(queries[0]?.parameters, [
    "raw-material-quality-1",
    ...Object.values(record),
    "laboratory-user",
    "laboratory-account",
    "2026-08-05T08:30:00.000Z",
  ]);
});

test("raw material quality repository filters and maps the complete journal", async () => {
  let querySql = "";
  let queryParameters: unknown[] = [];
  const pool = {
    async query(sql: string, parameters?: unknown[]) {
      querySql = sql;
      queryParameters = parameters ?? [];
      return [[{
        id: "raw-material-quality-1",
        record_date: record.recordDate,
        laboratory_assistant: record.laboratoryAssistant,
        shift_supervisor: record.shiftSupervisor,
        shift_code: record.shift,
        clay_brand: record.clayBrand,
        clay_moisture: record.clayMoisture,
        clay_grain_composition: record.clayGrainComposition,
        disintegrator_number: record.disintegratorNumber,
        temper_moisture: record.temperMoisture,
        temper_grain_composition: record.temperGrainComposition,
        temper_sieve_residue_1: record.temperSieveResidue1,
        temper_sieve_residue_2: record.temperSieveResidue2,
        temper_sieve_residue_3: record.temperSieveResidue3,
        temper_sieve_pass_05: record.temperSievePass05,
        temper_brand: record.temperBrand,
        temper_bulk_density: record.temperBulkDensity,
        slip_mixer_number: record.slipMixerNumber,
        slip_temperature: record.slipTemperature,
        slip_density: record.slipDensity,
        runner_number: record.runnerNumber,
        charge_chamotte_percentage: record.chargeChamottePercentage,
        charge_clay_percentage: record.chargeClayPercentage,
        charge_residue_0063: record.chargeResidue0063,
        charge_moisture: record.chargeMoisture,
        elutriation_coefficient: record.elutriationCoefficient,
        recommendation_recipient: record.recommendationRecipient,
        recommendation_text: record.recommendationText,
        created_at: "2026-08-05T08:30:00.000Z",
      }], []];
    },
  } as unknown as DatabasePool;
  const repository = createLaboratoryRawMaterialQualityJournalRepository(pool);

  assert.deepEqual(await repository.list({
    dateFrom: "2026-08-01",
    dateTo: "2026-08-31",
    query: "Бегунщик",
    nameQuery: "ШКИ_100%",
  }), [{
    id: "raw-material-quality-1",
    ...record,
    createdAt: "2026-08-05T08:30:00.000Z",
  }]);
  assert.match(querySql, /record_date >= \?/u);
  assert.match(querySql, /record_date <= \?/u);
  assert.match(querySql, /instr\(/u);
  assert.match(
    querySql,
    /\(clay_brand like \? or temper_brand like \?\)/u,
  );
  assert.match(querySql, /order by record_date desc, sequence_id desc/u);
  assert.deepEqual(queryParameters, [
    "2026-08-01",
    "2026-08-31",
    "Бегунщик",
    "%ШКИ\\_100\\%%",
    "%ШКИ\\_100\\%%",
    200,
  ]);
});

test("raw material quality repository lists editable options from full history", async () => {
  let querySql = "";
  const pool = {
    async query(sql: string) {
      querySql = sql;
      return [[
        { option_type: "laboratory_assistant", value: "Иванова А.А." },
        { option_type: "shift_supervisor", value: "Петров П.П." },
        { option_type: "clay_brand", value: "Глина ГИМ-2" },
        { option_type: "temper_brand", value: "Шамот ШКИ-66" },
        { option_type: "slip_mixer_number", value: "3" },
        { option_type: "runner_number", value: "4" },
      ], []];
    },
  } as unknown as DatabasePool;
  const repository = createLaboratoryRawMaterialQualityJournalRepository(pool);

  assert.deepEqual(await repository.listOptions(), {
    laboratoryAssistants: ["Иванова А.А."],
    shiftSupervisors: ["Петров П.П."],
    clayBrands: ["Глина ГИМ-2"],
    temperBrands: ["Шамот ШКИ-66"],
    slipMixerNumbers: ["3"],
    runnerNumbers: ["4"],
  });
  assert.match(querySql, /group by laboratory_assistant/u);
  assert.match(querySql, /group by shift_supervisor/u);
  assert.match(querySql, /group by clay_brand/u);
  assert.match(querySql, /group by temper_brand/u);
  assert.match(querySql, /group by slip_mixer_number/u);
  assert.match(querySql, /group by runner_number/u);
  assert.match(querySql, /order by option_type asc, last_used_at desc, value asc/u);
});

test("raw material quality repository corrects a stable row and stores a revision", async () => {
  const queries: Array<{ sql: string; parameters?: unknown[] }> = [];
  const pool = {
    async query(sql: string, parameters?: unknown[]) {
      queries.push({ sql, parameters });
      if (/select[\s\S]+for update/u.test(sql)) {
        return [[buildJournalRow()], []];
      }
      return [[], []];
    },
  } as unknown as DatabasePool;
  const repository = createLaboratoryRawMaterialQualityJournalRepository(pool, {
    createId: () => "raw-material-quality-revision-1",
    now: () => new Date("2026-08-05T10:15:00.000Z"),
  });
  const corrected = {
    ...record,
    clayMoisture: "7,0",
    recommendationText: "Снизить влажность глины.",
  };

  const result = await repository.update({
    id: "raw-material-quality-1",
    record: corrected,
    correctedByUserId: "laboratory-user",
    correctedByAccountId: "laboratory-account",
    correctedByDisplayName: "Иванова Анна",
  });

  assert.deepEqual(result, {
    before: record,
    record: {
      id: "raw-material-quality-1",
      ...corrected,
      createdAt: "2026-08-05T08:30:00.000Z",
    },
  });
  assert.match(queries[0]?.sql ?? "", /for update/u);
  assert.match(
    queries[1]?.sql ?? "",
    /update laboratory_raw_material_quality_journal/u,
  );
  assert.deepEqual(queries[1]?.parameters, [
    ...Object.values(corrected),
    "raw-material-quality-1",
  ]);
  assert.match(
    queries[2]?.sql ?? "",
    /insert into laboratory_raw_material_quality_revisions/u,
  );
  assert.deepEqual(queries[2]?.parameters, [
    "raw-material-quality-revision-1",
    "raw-material-quality-1",
    JSON.stringify(record),
    JSON.stringify(corrected),
    "laboratory-user",
    "laboratory-account",
    "Иванова Анна",
    "2026-08-05T10:15:00.000Z",
  ]);
});

function buildJournalRow() {
  return {
    id: "raw-material-quality-1",
    record_date: record.recordDate,
    laboratory_assistant: record.laboratoryAssistant,
    shift_supervisor: record.shiftSupervisor,
    shift_code: record.shift,
    clay_brand: record.clayBrand,
    clay_moisture: record.clayMoisture,
    clay_grain_composition: record.clayGrainComposition,
    disintegrator_number: record.disintegratorNumber,
    temper_moisture: record.temperMoisture,
    temper_grain_composition: record.temperGrainComposition,
    temper_sieve_residue_1: record.temperSieveResidue1,
    temper_sieve_residue_2: record.temperSieveResidue2,
    temper_sieve_residue_3: record.temperSieveResidue3,
    temper_sieve_pass_05: record.temperSievePass05,
    temper_brand: record.temperBrand,
    temper_bulk_density: record.temperBulkDensity,
    slip_mixer_number: record.slipMixerNumber,
    slip_temperature: record.slipTemperature,
    slip_density: record.slipDensity,
    runner_number: record.runnerNumber,
    charge_chamotte_percentage: record.chargeChamottePercentage,
    charge_clay_percentage: record.chargeClayPercentage,
    charge_residue_0063: record.chargeResidue0063,
    charge_moisture: record.chargeMoisture,
    elutriation_coefficient: record.elutriationCoefficient,
    recommendation_recipient: record.recommendationRecipient,
    recommendation_text: record.recommendationText,
    created_at: "2026-08-05T08:30:00.000Z",
  };
}
