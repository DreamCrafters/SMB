import { randomUUID } from "node:crypto";
import type { RowDataPacket } from "mysql2/promise";
import type { DatabasePool } from "../db/pool.js";
import type {
  RotaryKiln2FiringJournalFilters,
  RotaryKiln2FiringJournalPersonnelOptions,
  RotaryKiln2FiringJournalRecord,
  RotaryKiln2FiringJournalSelection,
  RotaryKiln2FiringJournalSubmission,
  RotaryKiln2MaterialBulkDensity,
} from "../contracts/rotaryKiln2FiringJournal.js";

type RepositoryFilters = RotaryKiln2FiringJournalFilters & {
  limit?: number;
};

export type RotaryKiln2MaterialBulkDensityFilters = {
  material?: string;
  sampleSize?: number;
};

export type RotaryKiln2FiringJournalCorrectionResult = {
  before: RotaryKiln2FiringJournalRecord;
  record: RotaryKiln2FiringJournalRecord;
};

export type RotaryKiln2FiringJournalRepository = {
  create: (input: {
    record: RotaryKiln2FiringJournalSubmission;
    submittedByUserId: string;
    submittedByAccountId: string;
  }) => Promise<RotaryKiln2FiringJournalRecord>;
  update: (input: {
    id: string;
    record: RotaryKiln2FiringJournalSubmission;
    correctedByUserId: string;
    correctedByAccountId: string;
    correctedByDisplayName: string;
  }) => Promise<RotaryKiln2FiringJournalCorrectionResult | undefined>;
  list: (
    filters?: RepositoryFilters,
  ) => Promise<RotaryKiln2FiringJournalSelection>;
  findLatestCreated: () => Promise<
    RotaryKiln2FiringJournalRecord | undefined
  >;
  listPersonnelOptions: () => Promise<
    RotaryKiln2FiringJournalPersonnelOptions
  >;
  listMaterialBulkDensities: (
    filters?: RotaryKiln2MaterialBulkDensityFilters,
  ) => Promise<RotaryKiln2MaterialBulkDensity[]>;
};

type RotaryKiln2FiringJournalRow = RowDataPacket & {
  id: string;
  record_date: Date | string;
  record_time: string;
  produced_material: string | null;
  water_absorption: number | string;
  temperature_before_cyclone: number | string;
  temperature_before_filter: number | string;
  temperature_in_field_chamber: number | string;
  temperature_at_rollback: number | string;
  gas_consumption_per_hour: number | string;
  vacuum_value: number | string;
  pressure_value: number | string;
  shift_supervisor: string;
  burner_operator: string;
  laboratory_assistant: string;
  sieve_pass_05: number | string;
  bulk_density: number | string;
  kiln_load_buckets_per_hour: number | string;
  note: string | null;
  created_at: Date | string;
  average_bulk_density: number | string | null;
};

type RotaryKiln2MaterialBulkDensityRow = RowDataPacket & {
  material: string;
  average_bulk_density: number | string;
  sample_count: number | string;
  latest_record_date: Date | string;
};

type RotaryKiln2PersonnelOptionRow = RowDataPacket & {
  option_type: "shift_supervisor" | "burner_operator";
  value: string;
};

type RepositoryOptions = {
  createId?: () => string;
  now?: () => Date;
};

const defaultListLimit = 200;
const maxListLimit = 500;

/**
 * Насыпной вес материала считается по последним записям журнала печи 2. Пока их
 * меньше десяти, среднее берётся по всем накопленным.
 */
export const rotaryKiln2BulkDensitySampleSize = 10;
const maxBulkDensitySampleSize = 100;

export function createRotaryKiln2FiringJournalRepository(
  pool: DatabasePool,
  {
    createId = randomUUID,
    now = () => new Date(),
  }: RepositoryOptions = {},
): RotaryKiln2FiringJournalRepository {
  return {
    async create(input) {
      const id = createId();
      const createdAt = now().toISOString();
      const record = input.record;

      await pool.query(
        `insert into rotary_kiln_2_firing_journal (
          id,
          record_date,
          record_time,
          produced_material,
          water_absorption,
          temperature_before_cyclone,
          temperature_before_filter,
          temperature_in_field_chamber,
          temperature_at_rollback,
          gas_consumption_per_hour,
          vacuum_value,
          pressure_value,
          shift_supervisor,
          burner_operator,
          laboratory_assistant,
          sieve_pass_05,
          bulk_density,
          kiln_load_buckets_per_hour,
          note,
          submitted_by_user_id,
          submitted_by_account_id,
          created_at
        ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          record.recordDate,
          record.recordTime,
          record.producedMaterial,
          record.waterAbsorption,
          record.temperatureBeforeCyclone,
          record.temperatureBeforeFilter,
          record.temperatureInFieldChamber,
          record.temperatureAtRollback,
          record.gasConsumptionPerHour,
          record.vacuum,
          record.pressure,
          record.shiftSupervisor,
          record.burnerOperator,
          record.laboratoryAssistant,
          record.sievePass05,
          record.bulkDensity,
          record.kilnLoadBucketsPerHour,
          record.note ?? null,
          input.submittedByUserId,
          input.submittedByAccountId,
          createdAt,
        ],
      );

      return { id, ...record, createdAt };
    },

    async update(input) {
      const [rows] = await pool.query<RotaryKiln2FiringJournalRow[]>(
        `select
          id,
          record_date,
          record_time,
          produced_material,
          water_absorption,
          temperature_before_cyclone,
          temperature_before_filter,
          temperature_in_field_chamber,
          temperature_at_rollback,
          gas_consumption_per_hour,
          vacuum_value,
          pressure_value,
          shift_supervisor,
          burner_operator,
          laboratory_assistant,
          sieve_pass_05,
          bulk_density,
          kiln_load_buckets_per_hour,
          note,
          created_at
        from rotary_kiln_2_firing_journal
        where id = ?
        limit 1
        for update`,
        [input.id],
      );
      const current = rows[0];
      if (current === undefined) return undefined;

      const before = mapRecord(current);
      const correctedAt = now().toISOString();
      const corrected = {
        id: input.id,
        ...input.record,
        createdAt: before.createdAt,
      };

      await pool.query(
        `update rotary_kiln_2_firing_journal
        set
          record_date = ?,
          record_time = ?,
          produced_material = ?,
          water_absorption = ?,
          temperature_before_cyclone = ?,
          temperature_before_filter = ?,
          temperature_in_field_chamber = ?,
          temperature_at_rollback = ?,
          gas_consumption_per_hour = ?,
          vacuum_value = ?,
          pressure_value = ?,
          shift_supervisor = ?,
          burner_operator = ?,
          laboratory_assistant = ?,
          sieve_pass_05 = ?,
          bulk_density = ?,
          kiln_load_buckets_per_hour = ?,
          note = ?
        where id = ?`,
        [
          input.record.recordDate,
          input.record.recordTime,
          input.record.producedMaterial,
          input.record.waterAbsorption,
          input.record.temperatureBeforeCyclone,
          input.record.temperatureBeforeFilter,
          input.record.temperatureInFieldChamber,
          input.record.temperatureAtRollback,
          input.record.gasConsumptionPerHour,
          input.record.vacuum,
          input.record.pressure,
          input.record.shiftSupervisor,
          input.record.burnerOperator,
          input.record.laboratoryAssistant,
          input.record.sievePass05,
          input.record.bulkDensity,
          input.record.kilnLoadBucketsPerHour,
          input.record.note ?? null,
          input.id,
        ],
      );
      await pool.query(
        `insert into rotary_kiln_2_firing_revisions (
          id,
          firing_record_id,
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
          JSON.stringify(corrected),
          input.correctedByUserId,
          input.correctedByAccountId,
          input.correctedByDisplayName,
          correctedAt,
        ],
      );

      return { before, record: corrected };
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
            shift_supervisor,
            burner_operator,
            laboratory_assistant,
            coalesce(note, '')
          ),
          ?
        ) > 0`);
        parameters.push(filters.query);
      }

      const limit = Math.min(
        Math.max(Math.trunc(filters.limit ?? defaultListLimit), 1),
        maxListLimit,
      );
      const where = clauses.length === 0 ? "" : `where ${clauses.join(" and ")}`;
      const [rows] = await pool.query<RotaryKiln2FiringJournalRow[]>(
        `select
          selected.*,
          avg(selected.bulk_density) over () as average_bulk_density
        from (
          select
            id,
            record_date,
            record_time,
            produced_material,
            water_absorption,
            temperature_before_cyclone,
            temperature_before_filter,
            temperature_in_field_chamber,
            temperature_at_rollback,
            gas_consumption_per_hour,
            vacuum_value,
            pressure_value,
            shift_supervisor,
            burner_operator,
            laboratory_assistant,
            sieve_pass_05,
            bulk_density,
            kiln_load_buckets_per_hour,
            note,
            created_at
          from rotary_kiln_2_firing_journal
          ${where}
          order by record_date desc, record_time desc, created_at desc, id desc
          limit ?
        ) as selected
        order by
          selected.record_date desc,
          selected.record_time desc,
          selected.created_at desc,
          selected.id desc`,
        [...parameters, limit],
      );

      return {
        records: rows.map(mapRecord),
        averageBulkDensity: rows[0]?.average_bulk_density == null
          ? null
          : Number(rows[0].average_bulk_density),
      };
    },

    async findLatestCreated() {
      const [rows] = await pool.query<RotaryKiln2FiringJournalRow[]>(
        `select
          id,
          record_date,
          record_time,
          produced_material,
          water_absorption,
          temperature_before_cyclone,
          temperature_before_filter,
          temperature_in_field_chamber,
          temperature_at_rollback,
          gas_consumption_per_hour,
          vacuum_value,
          pressure_value,
          shift_supervisor,
          burner_operator,
          laboratory_assistant,
          sieve_pass_05,
          bulk_density,
          kiln_load_buckets_per_hour,
          note,
          created_at
        from rotary_kiln_2_firing_journal
        order by created_at desc, id desc
        limit 1`,
      );

      return rows[0] === undefined ? undefined : mapRecord(rows[0]);
    },

    async listPersonnelOptions() {
      const [rows] = await pool.query<RotaryKiln2PersonnelOptionRow[]>(
        `select option_type, value
        from (
          select
            'shift_supervisor' as option_type,
            shift_supervisor as value,
            max(created_at) as last_used_at
          from rotary_kiln_2_firing_journal
          group by shift_supervisor
          union all
          select
            'burner_operator' as option_type,
            burner_operator as value,
            max(created_at) as last_used_at
          from rotary_kiln_2_firing_journal
          group by burner_operator
        ) as personnel_options
        order by option_type asc, last_used_at desc, value asc`,
      );

      return {
        shiftSupervisors: rows
          .filter((row) => row.option_type === "shift_supervisor")
          .map((row) => row.value),
        burnerOperators: rows
          .filter((row) => row.option_type === "burner_operator")
          .map((row) => row.value),
      };
    },

    async listMaterialBulkDensities(filters = {}) {
      const sampleSize = Math.min(
        Math.max(
          Math.trunc(filters.sampleSize ?? rotaryKiln2BulkDensitySampleSize),
          1,
        ),
        maxBulkDensitySampleSize,
      );
      const materialClause = filters.material === undefined
        ? ""
        : "and produced_material = ?";
      const [rows] = await pool.query<RotaryKiln2MaterialBulkDensityRow[]>(
        `select
          ranked.produced_material as material,
          avg(ranked.bulk_density) as average_bulk_density,
          count(*) as sample_count,
          max(ranked.record_date) as latest_record_date
        from (
          select
            produced_material,
            bulk_density,
            record_date,
            row_number() over (
              partition by produced_material
              order by record_date desc, record_time desc, created_at desc, id desc
            ) as position
          from rotary_kiln_2_firing_journal
          where produced_material is not null
            and produced_material <> ''
            ${materialClause}
        ) as ranked
        where ranked.position <= ?
        group by ranked.produced_material
        order by ranked.produced_material asc`,
        filters.material === undefined
          ? [sampleSize]
          : [filters.material, sampleSize],
      );

      return rows.map((row) => ({
        material: row.material,
        averageBulkDensityTonsPerCubicMeter: roundToSixDecimals(
          Number(row.average_bulk_density),
        ),
        sampleCount: Number(row.sample_count),
        latestRecordDate: formatDate(row.latest_record_date),
      }));
    },
  };
}

function roundToSixDecimals(value: number) {
  return Math.round((value + Number.EPSILON) * 1_000_000) / 1_000_000;
}

function mapRecord(
  row: RotaryKiln2FiringJournalRow,
): RotaryKiln2FiringJournalRecord {
  return {
    id: row.id,
    recordDate: formatDate(row.record_date),
    recordTime: row.record_time.slice(0, 5),
    ...(row.produced_material === null || row.produced_material === ""
      ? {}
      : { producedMaterial: row.produced_material }),
    waterAbsorption: Number(row.water_absorption),
    temperatureBeforeCyclone: Number(row.temperature_before_cyclone),
    temperatureBeforeFilter: Number(row.temperature_before_filter),
    temperatureInFieldChamber: Number(row.temperature_in_field_chamber),
    temperatureAtRollback: Number(row.temperature_at_rollback),
    gasConsumptionPerHour: Number(row.gas_consumption_per_hour),
    vacuum: Number(row.vacuum_value),
    pressure: Number(row.pressure_value),
    shiftSupervisor: row.shift_supervisor,
    burnerOperator: row.burner_operator,
    laboratoryAssistant: row.laboratory_assistant,
    sievePass05: Number(row.sieve_pass_05),
    bulkDensity: Number(row.bulk_density),
    kilnLoadBucketsPerHour: Number(row.kiln_load_buckets_per_hour),
    ...(row.note === null ? {} : { note: row.note }),
    createdAt: new Date(row.created_at).toISOString(),
  };
}

function formatDate(value: Date | string) {
  return typeof value === "string"
    ? value.slice(0, 10)
    : value.toISOString().slice(0, 10);
}
