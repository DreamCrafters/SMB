import { randomUUID } from "node:crypto";
import type { RowDataPacket } from "mysql2/promise";
import type { DatabasePool } from "../db/pool.js";
import type {
  RotaryKiln2FiringJournalFilters,
  RotaryKiln2FiringJournalRecord,
  RotaryKiln2FiringJournalSelection,
  RotaryKiln2FiringJournalSubmission,
} from "../contracts/rotaryKiln2FiringJournal.js";

type RepositoryFilters = RotaryKiln2FiringJournalFilters & {
  limit?: number;
};

export type RotaryKiln2FiringJournalRepository = {
  create: (input: {
    record: RotaryKiln2FiringJournalSubmission;
    submittedByUserId: string;
    submittedByAccountId: string;
  }) => Promise<RotaryKiln2FiringJournalRecord>;
  list: (
    filters?: RepositoryFilters,
  ) => Promise<RotaryKiln2FiringJournalSelection>;
};

type RotaryKiln2FiringJournalRow = RowDataPacket & {
  id: string;
  record_date: Date | string;
  record_time: string;
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

type RepositoryOptions = {
  createId?: () => string;
  now?: () => Date;
};

const defaultListLimit = 200;
const maxListLimit = 500;

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
        ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          record.recordDate,
          record.recordTime,
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
  };
}

function mapRecord(
  row: RotaryKiln2FiringJournalRow,
): RotaryKiln2FiringJournalRecord {
  return {
    id: row.id,
    recordDate: formatDate(row.record_date),
    recordTime: row.record_time.slice(0, 5),
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
