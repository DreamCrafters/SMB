import assert from "node:assert/strict";
import test from "node:test";
import type { DatabasePool } from "../db/pool.js";
import {
  createLaboratoryRawMaterialQualityJournalRepository,
} from "./laboratoryRawMaterialQualityJournalRepository.js";
import {
  LaboratorySampleRegistrationTransmissionUnavailableError,
} from "./laboratorySampleRegistrationJournalRepository.js";

const record = {
  recordDate: "2026-08-05",
  laboratoryAssistant: "Иванова А.А.",
  shiftSupervisor: "Петров П.П.",
  shift: "day" as const,
  clayMeasurements: [
    {
      measurementNumber: 1,
      clayBrand: "Глина ГИМ-2",
      disintegratorNumber: "2" as const,
      moisture: "6,8",
      sieveResidue3: "0,4",
      sievePass05: "98,1",
    },
  ],
  temperMeasurements: [
    {
      measurementNumber: 1,
      temperBrand: "Шамот ШКИ-66",
      ballMillNumber: "3" as const,
      sieveResidue3: "0,8",
      sieveResidue2: "2,3",
      sieveResidue1: "4,1",
      sievePass05: "91,2",
    },
  ],
  slipMeasurements: [
    { measurementNumber: 1, mixerNumber: "3" as const, temperature: "42 °C", density: "1,52" },
  ],
  runnerMeasurements: [
    {
      runnerNumber: "4" as const,
      chamottePercentage: "72",
      clayPercentage: "28",
      residue0063: "3,4",
      moisture: "5,9",
      isReserve: false,
    },
  ],
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
    record.recordDate,
    record.laboratoryAssistant,
    record.shiftSupervisor,
    record.shift,
    JSON.stringify(record.clayMeasurements),
    JSON.stringify(record.temperMeasurements),
    JSON.stringify(record.slipMeasurements),
    JSON.stringify(record.runnerMeasurements),
    record.elutriationCoefficient,
    record.recommendationRecipient,
    record.recommendationText,
    null,
    "laboratory-user",
    "laboratory-account",
    "2026-08-05T08:30:00.000Z",
  ]);
});

test("raw material quality repository claims a pending sample transmission on create", async () => {
  const queries: Array<{ sql: string; parameters?: unknown[] }> = [];
  const claims: unknown[] = [];
  const pool = {
    async query(sql: string, parameters?: unknown[]) {
      queries.push({ sql, parameters });
      return [[], []];
    },
  } as unknown as DatabasePool;
  const repository = createLaboratoryRawMaterialQualityJournalRepository(pool, {
    createId: () => "raw-material-quality-1",
    now: () => new Date("2026-08-05T08:30:00.000Z"),
    async claimSampleRegistrationTransmission(input) {
      claims.push(input);
      return { ok: true };
    },
  });

  const saved = await repository.create({
    record: { ...record, sourceSampleRegistrationId: "registration-1" },
    submittedByUserId: "laboratory-user",
    submittedByAccountId: "laboratory-account",
  });

  assert.equal(saved.sourceSampleRegistrationId, "registration-1");
  assert.deepEqual(claims, [{
    sampleRegistrationId: "registration-1",
    target: "raw_material_quality",
    targetRecordId: "raw-material-quality-1",
  }]);
  assert.equal(queries[0]?.parameters?.[12], "registration-1");
});

test("raw material quality repository rejects create when the transmission is unavailable", async () => {
  const queries: string[] = [];
  const pool = {
    async query(sql: string) {
      queries.push(sql);
      return [[], []];
    },
  } as unknown as DatabasePool;
  const repository = createLaboratoryRawMaterialQualityJournalRepository(pool, {
    async claimSampleRegistrationTransmission() {
      return { ok: false, reason: "already_claimed" };
    },
  });

  await assert.rejects(
    repository.create({
      record: { ...record, sourceSampleRegistrationId: "registration-1" },
      submittedByUserId: "laboratory-user",
      submittedByAccountId: "laboratory-account",
    }),
    LaboratorySampleRegistrationTransmissionUnavailableError,
  );
  assert.deepEqual(queries, []);
});

test("raw material quality repository shows the linked sample code and chemical analysis", async () => {
  const queries: Array<{ sql: string; parameters?: unknown[] }> = [];
  const pool = {
    async query(sql: string, parameters?: unknown[]) {
      queries.push({ sql, parameters });
      if (/from laboratory_sample_registration_journal sample/u.test(sql)) {
        return [[{
          registration_id: "registration-1",
          laboratory_sample_code: "26.1690",
          linked_analysis_id: "analysis-1",
          linked_laboratory_analysis_number: "77",
          linked_al2o3: "38,2",
        }], []];
      }
      return [[
        { ...buildJournalRow(), source_sample_registration_id: "registration-1" },
        { ...buildJournalRow(), id: "raw-material-quality-2" },
      ], []];
    },
  } as unknown as DatabasePool;
  const repository = createLaboratoryRawMaterialQualityJournalRepository(pool);

  const records = await repository.list();

  assert.deepEqual(records[0], {
    id: "raw-material-quality-1",
    ...record,
    sourceSampleRegistrationId: "registration-1",
    sampleCode: "26.1690",
    chemicalAnalysis: { laboratoryAnalysisNumber: "77", al2o3: "38,2" },
    createdAt: "2026-08-05T08:30:00.000Z",
  });
  assert.equal(records[1]?.sampleCode, undefined);
  assert.equal(records[1]?.chemicalAnalysis, undefined);
  assert.deepEqual(queries[1]?.parameters, ["registration-1"]);
});

test("raw material quality repository filters and maps the complete journal", async () => {
  let querySql = "";
  let queryParameters: unknown[] = [];
  const pool = {
    async query(sql: string, parameters?: unknown[]) {
      querySql = sql;
      queryParameters = parameters ?? [];
      return [[buildJournalRow()], []];
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
  assert.match(querySql, /clay_measurements/u);
  assert.match(querySql, /temper_measurements/u);
  assert.match(
    querySql,
    /\(clay_measurements like \? or temper_measurements like \?\)/u,
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

test("raw material quality repository lists lab/supervisor options and unique brands from history", async () => {
  const queries: Array<{ sql: string }> = [];
  const pool = {
    async query(sql: string) {
      queries.push({ sql });
      if (sql.includes("union all")) {
        return [[
          { option_type: "laboratory_assistant", value: "Иванова А.А." },
          { option_type: "shift_supervisor", value: "Петров П.П." },
        ], []];
      }
      return [[
        {
          clay_measurements: JSON.stringify([
            { clayBrand: "Глина ГИМ-2" },
            { clayBrand: "Глина ПГА" },
          ]),
          temper_measurements: JSON.stringify([{ temperBrand: "Шамот ШКИ-66" }]),
        },
        {
          clay_measurements: JSON.stringify([{ clayBrand: "Глина ГИМ-2" }]),
          temper_measurements: JSON.stringify([{ temperBrand: null }]),
        },
      ], []];
    },
  } as unknown as DatabasePool;
  const repository = createLaboratoryRawMaterialQualityJournalRepository(pool);

  assert.deepEqual(await repository.listOptions(), {
    laboratoryAssistants: ["Иванова А.А."],
    shiftSupervisors: ["Петров П.П."],
    clayBrands: ["Глина ГИМ-2", "Глина ПГА"],
    temperBrands: ["Шамот ШКИ-66"],
  });
  assert.match(queries[0]?.sql ?? "", /group by laboratory_assistant/u);
  assert.match(queries[0]?.sql ?? "", /group by shift_supervisor/u);
  assert.match(queries[1]?.sql ?? "", /select clay_measurements, temper_measurements/u);
  assert.match(queries[1]?.sql ?? "", /order by created_at desc/u);
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
    clayMeasurements: [
      { ...record.clayMeasurements[0], moisture: "7,0" },
    ],
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
    corrected.recordDate,
    corrected.laboratoryAssistant,
    corrected.shiftSupervisor,
    corrected.shift,
    JSON.stringify(corrected.clayMeasurements),
    JSON.stringify(corrected.temperMeasurements),
    JSON.stringify(corrected.slipMeasurements),
    JSON.stringify(corrected.runnerMeasurements),
    corrected.elutriationCoefficient,
    corrected.recommendationRecipient,
    corrected.recommendationText,
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

test("raw material quality correction keeps the sample link set on creation", async () => {
  const queries: Array<{ sql: string; parameters?: unknown[] }> = [];
  const pool = {
    async query(sql: string, parameters?: unknown[]) {
      queries.push({ sql, parameters });
      if (/select[\s\S]+for update/u.test(sql)) {
        return [[{
          ...buildJournalRow(),
          source_sample_registration_id: "registration-1",
        }], []];
      }
      return [[], []];
    },
  } as unknown as DatabasePool;
  const repository = createLaboratoryRawMaterialQualityJournalRepository(pool, {
    createId: () => "raw-material-quality-revision-1",
  });

  const result = await repository.update({
    id: "raw-material-quality-1",
    record: { ...record, sourceSampleRegistrationId: "registration-2" },
    correctedByUserId: "laboratory-user",
    correctedByAccountId: "laboratory-account",
    correctedByDisplayName: "Иванова Анна",
  });

  assert.equal(result?.record.sourceSampleRegistrationId, "registration-1");
  assert.ok(!queries.some(({ parameters }) =>
    parameters?.includes("registration-2")
  ));
  assert.equal(queries[2]?.parameters?.[3], JSON.stringify(record));
});

function buildJournalRow() {
  return {
    id: "raw-material-quality-1",
    record_date: record.recordDate,
    laboratory_assistant: record.laboratoryAssistant,
    shift_supervisor: record.shiftSupervisor,
    shift_code: record.shift,
    clay_measurements: JSON.stringify(record.clayMeasurements),
    temper_measurements: JSON.stringify(record.temperMeasurements),
    slip_measurements: JSON.stringify(record.slipMeasurements),
    runner_measurements: JSON.stringify(record.runnerMeasurements),
    elutriation_coefficient: record.elutriationCoefficient,
    recommendation_recipient: record.recommendationRecipient,
    recommendation_text: record.recommendationText,
    source_sample_registration_id: null as string | null,
    created_at: "2026-08-05T08:30:00.000Z",
  };
}
