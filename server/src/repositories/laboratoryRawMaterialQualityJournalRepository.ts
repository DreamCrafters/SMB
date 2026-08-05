import { randomUUID } from "node:crypto";
import type { RowDataPacket } from "mysql2/promise";
import type {
  LaboratoryRawMaterialQualityDisintegrator,
  LaboratoryRawMaterialQualityFilters,
  LaboratoryRawMaterialQualityOptions,
  LaboratoryRawMaterialQualityRecord,
  LaboratoryRawMaterialQualityRecommendationRecipient,
  LaboratoryRawMaterialQualityShift,
  LaboratoryRawMaterialQualitySubmission,
} from "../contracts/laboratoryRawMaterialQualityJournal.js";
import type { DatabasePool } from "../db/pool.js";
import { escapeLikePattern } from "./laboratoryResultsRepository.js";

type RepositoryFilters = LaboratoryRawMaterialQualityFilters & {
  limit?: number;
};

export type LaboratoryRawMaterialQualityJournalRepository = {
  create: (input: {
    record: LaboratoryRawMaterialQualitySubmission;
    submittedByUserId: string;
    submittedByAccountId: string;
  }) => Promise<LaboratoryRawMaterialQualityRecord>;
  list: (
    filters?: RepositoryFilters,
  ) => Promise<LaboratoryRawMaterialQualityRecord[]>;
  listOptions: () => Promise<LaboratoryRawMaterialQualityOptions>;
  update: (input: {
    id: string;
    record: LaboratoryRawMaterialQualitySubmission;
    correctedByUserId: string;
    correctedByAccountId: string;
    correctedByDisplayName: string;
  }) => Promise<LaboratoryRawMaterialQualityCorrectionResult | undefined>;
};

export type LaboratoryRawMaterialQualityCorrectionResult = {
  before: LaboratoryRawMaterialQualitySubmission;
  record: LaboratoryRawMaterialQualityRecord;
};

type JournalRow = RowDataPacket & {
  id: string;
  record_date: Date | string;
  laboratory_assistant: string;
  shift_supervisor: string;
  shift_code: LaboratoryRawMaterialQualityShift;
  clay_brand: string;
  clay_moisture: string;
  clay_grain_composition: string;
  disintegrator_number: LaboratoryRawMaterialQualityDisintegrator;
  temper_moisture: string;
  temper_grain_composition: string;
  temper_sieve_residue_1: string;
  temper_sieve_residue_2: string;
  temper_sieve_residue_3: string;
  temper_sieve_pass_05: string;
  temper_brand: string;
  temper_bulk_density: string;
  slip_mixer_number: string;
  slip_temperature: string;
  slip_density: string;
  runner_number: string;
  charge_chamotte_percentage: string;
  charge_clay_percentage: string;
  charge_residue_0063: string;
  charge_moisture: string;
  elutriation_coefficient: string;
  recommendation_recipient: LaboratoryRawMaterialQualityRecommendationRecipient;
  recommendation_text: string;
  created_at: Date | string;
};

type OptionRow = RowDataPacket & {
  option_type:
    | "laboratory_assistant"
    | "shift_supervisor"
    | "clay_brand"
    | "temper_brand"
    | "slip_mixer_number"
    | "runner_number";
  value: string;
};

type RepositoryOptions = {
  createId?: () => string;
  now?: () => Date;
};

const defaultListLimit = 200;
const maxListLimit = 500;

export function createLaboratoryRawMaterialQualityJournalRepository(
  pool: DatabasePool,
  {
    createId = randomUUID,
    now = () => new Date(),
  }: RepositoryOptions = {},
): LaboratoryRawMaterialQualityJournalRepository {
  return {
    async create(input) {
      const id = createId();
      const createdAt = now().toISOString();
      const record = input.record;

      await pool.query(
        `insert into laboratory_raw_material_quality_journal (
          id,
          record_date,
          laboratory_assistant,
          shift_supervisor,
          shift_code,
          clay_brand,
          clay_moisture,
          clay_grain_composition,
          disintegrator_number,
          temper_moisture,
          temper_grain_composition,
          temper_sieve_residue_1,
          temper_sieve_residue_2,
          temper_sieve_residue_3,
          temper_sieve_pass_05,
          temper_brand,
          temper_bulk_density,
          slip_mixer_number,
          slip_temperature,
          slip_density,
          runner_number,
          charge_chamotte_percentage,
          charge_clay_percentage,
          charge_residue_0063,
          charge_moisture,
          elutriation_coefficient,
          recommendation_recipient,
          recommendation_text,
          submitted_by_user_id,
          submitted_by_account_id,
          created_at
        ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          record.recordDate,
          record.laboratoryAssistant,
          record.shiftSupervisor,
          record.shift,
          record.clayBrand,
          record.clayMoisture,
          record.clayGrainComposition,
          record.disintegratorNumber,
          record.temperMoisture,
          record.temperGrainComposition,
          record.temperSieveResidue1,
          record.temperSieveResidue2,
          record.temperSieveResidue3,
          record.temperSievePass05,
          record.temperBrand,
          record.temperBulkDensity,
          record.slipMixerNumber,
          record.slipTemperature,
          record.slipDensity,
          record.runnerNumber,
          record.chargeChamottePercentage,
          record.chargeClayPercentage,
          record.chargeResidue0063,
          record.chargeMoisture,
          record.elutriationCoefficient,
          record.recommendationRecipient,
          record.recommendationText,
          input.submittedByUserId,
          input.submittedByAccountId,
          createdAt,
        ],
      );

      return { id, ...record, createdAt };
    },

    async list(filters = {}) {
      const clauses: string[] = [];
      const parameters: unknown[] = [];

      if (filters.dateFrom !== undefined) {
        clauses.push("record_date >= ?");
        parameters.push(filters.dateFrom);
      }
      if (filters.dateTo !== undefined) {
        clauses.push("record_date <= ?");
        parameters.push(filters.dateTo);
      }
      if (filters.query !== undefined) {
        clauses.push(`instr(
          concat_ws(
            ' ',
            laboratory_assistant,
            shift_supervisor,
            case shift_code
              when 'day' then '8:00-20:00'
              when 'night' then '20:00-8:00'
              else shift_code
            end,
            clay_brand,
            clay_moisture,
            clay_grain_composition,
            disintegrator_number,
            temper_moisture,
            temper_grain_composition,
            temper_sieve_residue_1,
            temper_sieve_residue_2,
            temper_sieve_residue_3,
            temper_sieve_pass_05,
            temper_brand,
            temper_bulk_density,
            slip_mixer_number,
            slip_temperature,
            slip_density,
            runner_number,
            charge_chamotte_percentage,
            charge_clay_percentage,
            charge_residue_0063,
            charge_moisture,
            elutriation_coefficient,
            case recommendation_recipient
              when 'dryer_operator' then 'Сушильщик'
              when 'runner_operator' then 'Бегунщик'
              when 'slurry_operator' then 'Шликерщик'
              when 'batch_operator' then 'Шихтовщик'
              else recommendation_recipient
            end,
            recommendation_text
          ),
          ?
        ) > 0`);
        parameters.push(filters.query);
      }
      if (filters.nameQuery !== undefined) {
        clauses.push("(clay_brand like ? or temper_brand like ?)");
        const pattern = `%${escapeLikePattern(filters.nameQuery)}%`;
        parameters.push(pattern, pattern);
      }

      const limit = Math.min(
        Math.max(Math.trunc(filters.limit ?? defaultListLimit), 1),
        maxListLimit,
      );
      const where = clauses.length === 0 ? "" : `where ${clauses.join(" and ")}`;
      const [rows] = await pool.query<JournalRow[]>(
        `select
          id,
          record_date,
          laboratory_assistant,
          shift_supervisor,
          shift_code,
          clay_brand,
          clay_moisture,
          clay_grain_composition,
          disintegrator_number,
          temper_moisture,
          temper_grain_composition,
          temper_sieve_residue_1,
          temper_sieve_residue_2,
          temper_sieve_residue_3,
          temper_sieve_pass_05,
          temper_brand,
          temper_bulk_density,
          slip_mixer_number,
          slip_temperature,
          slip_density,
          runner_number,
          charge_chamotte_percentage,
          charge_clay_percentage,
          charge_residue_0063,
          charge_moisture,
          elutriation_coefficient,
          recommendation_recipient,
          recommendation_text,
          created_at
        from laboratory_raw_material_quality_journal
        ${where}
        order by record_date desc, sequence_id desc
        limit ?`,
        [...parameters, limit],
      );

      return rows.map(mapRecord);
    },

    async listOptions() {
      const [rows] = await pool.query<OptionRow[]>(
        `select option_type, value
        from (
          select
            'laboratory_assistant' as option_type,
            laboratory_assistant as value,
            max(created_at) as last_used_at
          from laboratory_raw_material_quality_journal
          group by laboratory_assistant
          union all
          select
            'shift_supervisor' as option_type,
            shift_supervisor as value,
            max(created_at) as last_used_at
          from laboratory_raw_material_quality_journal
          group by shift_supervisor
          union all
          select
            'clay_brand' as option_type,
            clay_brand as value,
            max(created_at) as last_used_at
          from laboratory_raw_material_quality_journal
          group by clay_brand
          union all
          select
            'temper_brand' as option_type,
            temper_brand as value,
            max(created_at) as last_used_at
          from laboratory_raw_material_quality_journal
          group by temper_brand
          union all
          select
            'slip_mixer_number' as option_type,
            slip_mixer_number as value,
            max(created_at) as last_used_at
          from laboratory_raw_material_quality_journal
          group by slip_mixer_number
          union all
          select
            'runner_number' as option_type,
            runner_number as value,
            max(created_at) as last_used_at
          from laboratory_raw_material_quality_journal
          group by runner_number
        ) as journal_options
        order by option_type asc, last_used_at desc, value asc`,
      );

      return {
        laboratoryAssistants: readOptions(rows, "laboratory_assistant"),
        shiftSupervisors: readOptions(rows, "shift_supervisor"),
        clayBrands: readOptions(rows, "clay_brand"),
        temperBrands: readOptions(rows, "temper_brand"),
        slipMixerNumbers: readOptions(rows, "slip_mixer_number"),
        runnerNumbers: readOptions(rows, "runner_number"),
      };
    },

    async update(input) {
      const [rows] = await pool.query<JournalRow[]>(
        `select
          id,
          record_date,
          laboratory_assistant,
          shift_supervisor,
          shift_code,
          clay_brand,
          clay_moisture,
          clay_grain_composition,
          disintegrator_number,
          temper_moisture,
          temper_grain_composition,
          temper_sieve_residue_1,
          temper_sieve_residue_2,
          temper_sieve_residue_3,
          temper_sieve_pass_05,
          temper_brand,
          temper_bulk_density,
          slip_mixer_number,
          slip_temperature,
          slip_density,
          runner_number,
          charge_chamotte_percentage,
          charge_clay_percentage,
          charge_residue_0063,
          charge_moisture,
          elutriation_coefficient,
          recommendation_recipient,
          recommendation_text,
          created_at
        from laboratory_raw_material_quality_journal
        where id = ?
        limit 1
        for update`,
        [input.id],
      );
      const current = rows[0];
      if (current === undefined) return undefined;

      const before = mapSubmission(current);
      const correctedAt = now().toISOString();
      const record = input.record;
      await pool.query(
        `update laboratory_raw_material_quality_journal
        set
          record_date = ?,
          laboratory_assistant = ?,
          shift_supervisor = ?,
          shift_code = ?,
          clay_brand = ?,
          clay_moisture = ?,
          clay_grain_composition = ?,
          disintegrator_number = ?,
          temper_moisture = ?,
          temper_grain_composition = ?,
          temper_sieve_residue_1 = ?,
          temper_sieve_residue_2 = ?,
          temper_sieve_residue_3 = ?,
          temper_sieve_pass_05 = ?,
          temper_brand = ?,
          temper_bulk_density = ?,
          slip_mixer_number = ?,
          slip_temperature = ?,
          slip_density = ?,
          runner_number = ?,
          charge_chamotte_percentage = ?,
          charge_clay_percentage = ?,
          charge_residue_0063 = ?,
          charge_moisture = ?,
          elutriation_coefficient = ?,
          recommendation_recipient = ?,
          recommendation_text = ?
        where id = ?`,
        [...readSubmissionValues(record), input.id],
      );
      await pool.query(
        `insert into laboratory_raw_material_quality_revisions (
          id,
          raw_material_quality_id,
          before_snapshot,
          after_snapshot,
          corrected_by_user_id,
          corrected_by_account_id,
          corrected_by_display_name,
          created_at
        ) values (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          createId(),
          input.id,
          JSON.stringify(before),
          JSON.stringify(record),
          input.correctedByUserId,
          input.correctedByAccountId,
          input.correctedByDisplayName,
          correctedAt,
        ],
      );

      return {
        before,
        record: {
          id: input.id,
          ...record,
          createdAt: new Date(current.created_at).toISOString(),
        },
      };
    },
  };
}

function readOptions(rows: OptionRow[], type: OptionRow["option_type"]) {
  return rows
    .filter((row) => row.option_type === type)
    .map((row) => row.value);
}

function mapRecord(row: JournalRow): LaboratoryRawMaterialQualityRecord {
  return {
    id: row.id,
    ...mapSubmission(row),
    createdAt: new Date(row.created_at).toISOString(),
  };
}

function mapSubmission(
  row: JournalRow,
): LaboratoryRawMaterialQualitySubmission {
  return {
    recordDate: formatDate(row.record_date),
    laboratoryAssistant: row.laboratory_assistant,
    shiftSupervisor: row.shift_supervisor,
    shift: row.shift_code,
    clayBrand: row.clay_brand,
    clayMoisture: row.clay_moisture,
    clayGrainComposition: row.clay_grain_composition,
    disintegratorNumber: row.disintegrator_number,
    temperMoisture: row.temper_moisture,
    temperGrainComposition: row.temper_grain_composition,
    temperSieveResidue1: row.temper_sieve_residue_1,
    temperSieveResidue2: row.temper_sieve_residue_2,
    temperSieveResidue3: row.temper_sieve_residue_3,
    temperSievePass05: row.temper_sieve_pass_05,
    temperBrand: row.temper_brand,
    temperBulkDensity: row.temper_bulk_density,
    slipMixerNumber: row.slip_mixer_number,
    slipTemperature: row.slip_temperature,
    slipDensity: row.slip_density,
    runnerNumber: row.runner_number,
    chargeChamottePercentage: row.charge_chamotte_percentage,
    chargeClayPercentage: row.charge_clay_percentage,
    chargeResidue0063: row.charge_residue_0063,
    chargeMoisture: row.charge_moisture,
    elutriationCoefficient: row.elutriation_coefficient,
    recommendationRecipient: row.recommendation_recipient,
    recommendationText: row.recommendation_text,
  };
}

function readSubmissionValues(record: LaboratoryRawMaterialQualitySubmission) {
  return [
    record.recordDate,
    record.laboratoryAssistant,
    record.shiftSupervisor,
    record.shift,
    record.clayBrand,
    record.clayMoisture,
    record.clayGrainComposition,
    record.disintegratorNumber,
    record.temperMoisture,
    record.temperGrainComposition,
    record.temperSieveResidue1,
    record.temperSieveResidue2,
    record.temperSieveResidue3,
    record.temperSievePass05,
    record.temperBrand,
    record.temperBulkDensity,
    record.slipMixerNumber,
    record.slipTemperature,
    record.slipDensity,
    record.runnerNumber,
    record.chargeChamottePercentage,
    record.chargeClayPercentage,
    record.chargeResidue0063,
    record.chargeMoisture,
    record.elutriationCoefficient,
    record.recommendationRecipient,
    record.recommendationText,
  ];
}

function formatDate(value: Date | string) {
  return typeof value === "string"
    ? value.slice(0, 10)
    : value.toISOString().slice(0, 10);
}
