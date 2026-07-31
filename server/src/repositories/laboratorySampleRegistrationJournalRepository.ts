import { randomUUID } from "node:crypto";
import type { RowDataPacket } from "mysql2/promise";
import type {
  LaboratorySampleRegistrationJournalFilters,
  LaboratorySampleRegistrationJournalRecord,
  LaboratorySampleRegistrationJournalSubmission,
} from "../contracts/laboratorySampleRegistrationJournal.js";
import type { LaboratorySampleRegistrationOption } from "../contracts/laboratoryChemicalAnalysisJournal.js";
import type { DatabasePool } from "../db/pool.js";
import { escapeLikePattern } from "./laboratoryResultsRepository.js";

type RepositoryFilters = LaboratorySampleRegistrationJournalFilters & {
  limit?: number;
};

export type LaboratorySampleRegistrationJournalRepository = {
  create: (input: {
    record: LaboratorySampleRegistrationJournalSubmission;
    submittedByUserId: string;
    submittedByAccountId: string;
  }) => Promise<LaboratorySampleRegistrationJournalRecord>;
  list: (
    filters?: RepositoryFilters,
  ) => Promise<LaboratorySampleRegistrationJournalRecord[]>;
  listOptions: (filters?: {
    query?: string;
    limit?: number;
  }) => Promise<LaboratorySampleRegistrationOption[]>;
  findOptionById: (
    id: string,
  ) => Promise<LaboratorySampleRegistrationOption | undefined>;
};

type LaboratorySampleRegistrationJournalRow = RowDataPacket & {
  id: string;
  sample_number: string;
  laboratory_sample_code: string;
  sampling_date: Date | string;
  sampling_laboratory_assistant: string;
  sample_name: string;
  registration_date: Date | string;
  sampling_location: string;
  al2o3: string | null;
  fe2o3: string | null;
  sio2: string | null;
  cao2: string | null;
  p2o5: string | null;
  loss_on_ignition: string | null;
  moisture: string | null;
  chemical_analysis_date: Date | string | null;
  chemical_analysis_laboratory_assistant: string | null;
  batch_number: string | null;
  notes: string | null;
  created_at: Date | string;
};

type LaboratorySampleRegistrationOptionRow = RowDataPacket & {
  id: string;
  laboratory_sample_code: string;
  sample_number: string;
  sample_name: string;
  sampling_date: Date | string;
  registration_date: Date | string;
};

type RepositoryOptions = {
  createId?: () => string;
  now?: () => Date;
};

const defaultListLimit = 200;
const maxListLimit = 500;

export function createLaboratorySampleRegistrationJournalRepository(
  pool: DatabasePool,
  {
    createId = randomUUID,
    now = () => new Date(),
  }: RepositoryOptions = {},
): LaboratorySampleRegistrationJournalRepository {
  return {
    async create(input) {
      const id = createId();
      const createdAt = now().toISOString();
      const record = input.record;

      await pool.query(
        `insert into laboratory_sample_registration_journal (
          id,
          sample_number,
          laboratory_sample_code,
          sampling_date,
          sampling_laboratory_assistant,
          sample_name,
          registration_date,
          sampling_location,
          submitted_by_user_id,
          submitted_by_account_id,
          created_at
        ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          record.sampleNumber,
          record.laboratorySampleCode,
          record.samplingDate,
          record.samplingLaboratoryAssistant,
          record.sampleName,
          record.registrationDate,
          record.samplingLocation,
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
        clauses.push("registration.registration_date >= ?");
        parameters.push(filters.dateFrom);
      }
      if (filters.dateTo !== undefined) {
        clauses.push("registration.registration_date <= ?");
        parameters.push(filters.dateTo);
      }
      if (filters.query !== undefined) {
        clauses.push(`instr(
          concat_ws(
            ' ',
            registration.sample_number,
            registration.laboratory_sample_code,
            registration.sampling_laboratory_assistant,
            registration.sample_name,
            registration.sampling_location,
            case
              when analysis.id is null
                then coalesce(registration.chemical_analysis_laboratory_assistant, '')
              else analysis.chemical_analysis_laboratory_assistant
            end,
            case
              when analysis.id is null
                then coalesce(registration.batch_number, '')
              else analysis.batch_number
            end,
            case
              when analysis.id is null
                then coalesce(registration.notes, '')
              else coalesce(analysis.notes, '')
            end
          ),
          ?
        ) > 0`);
        parameters.push(filters.query);
      }
      if (filters.nameQuery !== undefined) {
        clauses.push("registration.sample_name like ?");
        parameters.push(`%${escapeLikePattern(filters.nameQuery)}%`);
      }

      const limit = Math.min(
        Math.max(Math.trunc(filters.limit ?? defaultListLimit), 1),
        maxListLimit,
      );
      const where = clauses.length === 0 ? "" : `where ${clauses.join(" and ")}`;
      const [rows] = await pool.query<LaboratorySampleRegistrationJournalRow[]>(
        `select
          registration.id,
          registration.sample_number,
          registration.laboratory_sample_code,
          registration.sampling_date,
          registration.sampling_laboratory_assistant,
          registration.sample_name,
          registration.registration_date,
          registration.sampling_location,
          case when analysis.id is null
            then registration.al2o3 else analysis.al2o3 end as al2o3,
          case when analysis.id is null
            then registration.fe2o3 else analysis.fe2o3 end as fe2o3,
          case when analysis.id is null
            then registration.sio2 else analysis.sio2 end as sio2,
          case when analysis.id is null
            then registration.cao2 else analysis.cao2 end as cao2,
          case when analysis.id is null
            then registration.p2o5 else analysis.p2o5 end as p2o5,
          case when analysis.id is null
            then registration.loss_on_ignition
            else analysis.loss_on_ignition end as loss_on_ignition,
          case when analysis.id is null
            then registration.moisture else analysis.moisture end as moisture,
          case when analysis.id is null
            then registration.chemical_analysis_date
            else analysis.chemical_analysis_date end as chemical_analysis_date,
          case when analysis.id is null
            then registration.chemical_analysis_laboratory_assistant
            else analysis.chemical_analysis_laboratory_assistant
          end as chemical_analysis_laboratory_assistant,
          case when analysis.id is null
            then registration.batch_number
            else analysis.batch_number end as batch_number,
          case when analysis.id is null
            then registration.notes else analysis.notes end as notes,
          registration.created_at
        from laboratory_sample_registration_journal registration
        left join laboratory_chemical_analysis_journal analysis
          on analysis.sequence_id = (
            select max(latest.sequence_id)
            from laboratory_chemical_analysis_journal latest
            where latest.sample_registration_id = registration.id
          )
        ${where}
        order by
          registration.registration_date desc,
          registration.created_at desc,
          registration.id desc
        limit ?`,
        [...parameters, limit],
      );

      return rows.map(mapRecord);
    },

    async listOptions(filters = {}) {
      const limit = Math.min(
        Math.max(Math.trunc(filters.limit ?? maxListLimit), 1),
        maxListLimit,
      );
      const where = filters.query === undefined
        ? ""
        : `where instr(
            concat_ws(
              ' ',
              laboratory_sample_code,
              sample_number,
              sample_name,
              sampling_laboratory_assistant,
              sampling_location
            ),
            ?
          ) > 0`;
      const parameters = filters.query === undefined
        ? [limit]
        : [filters.query, limit];
      const [rows] = await pool.query<LaboratorySampleRegistrationOptionRow[]>(
        `select
          id,
          laboratory_sample_code,
          sample_number,
          sample_name,
          sampling_date,
          registration_date
        from laboratory_sample_registration_journal
        ${where}
        order by registration_date desc, created_at desc, id desc
        limit ?`,
        parameters,
      );

      return rows.map(mapOption);
    },

    async findOptionById(id) {
      const [rows] = await pool.query<LaboratorySampleRegistrationOptionRow[]>(
        `select
          id,
          laboratory_sample_code,
          sample_number,
          sample_name,
          sampling_date,
          registration_date
        from laboratory_sample_registration_journal
        where id = ?
        limit 1`,
        [id],
      );

      return rows[0] === undefined ? undefined : mapOption(rows[0]);
    },
  };
}

function mapRecord(
  row: LaboratorySampleRegistrationJournalRow,
): LaboratorySampleRegistrationJournalRecord {
  return {
    id: row.id,
    sampleNumber: row.sample_number,
    laboratorySampleCode: row.laboratory_sample_code,
    samplingDate: formatDate(row.sampling_date),
    samplingLaboratoryAssistant: row.sampling_laboratory_assistant,
    sampleName: row.sample_name,
    registrationDate: formatDate(row.registration_date),
    samplingLocation: row.sampling_location,
    ...(row.al2o3 === null ? {} : { al2o3: row.al2o3 }),
    ...(row.fe2o3 === null ? {} : { fe2o3: row.fe2o3 }),
    ...(row.sio2 === null ? {} : { sio2: row.sio2 }),
    ...(row.cao2 === null ? {} : { cao2: row.cao2 }),
    ...(row.p2o5 === null ? {} : { p2o5: row.p2o5 }),
    ...(row.loss_on_ignition === null
      ? {}
      : { lossOnIgnition: row.loss_on_ignition }),
    ...(row.moisture === null ? {} : { moisture: row.moisture }),
    ...(row.chemical_analysis_date === null
      ? {}
      : { chemicalAnalysisDate: formatDate(row.chemical_analysis_date) }),
    ...(row.chemical_analysis_laboratory_assistant === null
      ? {}
      : {
          chemicalAnalysisLaboratoryAssistant:
            row.chemical_analysis_laboratory_assistant,
        }),
    ...(row.batch_number === null ? {} : { batchNumber: row.batch_number }),
    ...(row.notes === null ? {} : { notes: row.notes }),
    createdAt: new Date(row.created_at).toISOString(),
  };
}

function mapOption(
  row: LaboratorySampleRegistrationOptionRow,
): LaboratorySampleRegistrationOption {
  return {
    id: row.id,
    laboratorySampleCode: row.laboratory_sample_code,
    sampleNumber: row.sample_number,
    sampleName: row.sample_name,
    samplingDate: formatDate(row.sampling_date),
    registrationDate: formatDate(row.registration_date),
  };
}

function formatDate(value: Date | string) {
  return typeof value === "string"
    ? value.slice(0, 10)
    : value.toISOString().slice(0, 10);
}
