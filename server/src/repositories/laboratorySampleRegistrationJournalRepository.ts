import { randomUUID } from "node:crypto";
import type { RowDataPacket } from "mysql2/promise";
import type {
  LaboratorySampleRegistrationJournalFilters,
  LaboratorySampleRegistrationJournalRecord,
  LaboratorySampleRegistrationJournalSubmission,
} from "../contracts/laboratorySampleRegistrationJournal.js";
import type { DatabasePool } from "../db/pool.js";

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
  al2o3: string;
  fe2o3: string;
  sio2: string;
  cao2: string;
  p2o5: string;
  loss_on_ignition: string;
  moisture: string;
  chemical_analysis_date: Date | string;
  chemical_analysis_laboratory_assistant: string;
  batch_number: string;
  notes: string | null;
  created_at: Date | string;
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
          al2o3,
          fe2o3,
          sio2,
          cao2,
          p2o5,
          loss_on_ignition,
          moisture,
          chemical_analysis_date,
          chemical_analysis_laboratory_assistant,
          batch_number,
          notes,
          submitted_by_user_id,
          submitted_by_account_id,
          created_at
        ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          record.sampleNumber,
          record.laboratorySampleCode,
          record.samplingDate,
          record.samplingLaboratoryAssistant,
          record.sampleName,
          record.registrationDate,
          record.samplingLocation,
          record.al2o3,
          record.fe2o3,
          record.sio2,
          record.cao2,
          record.p2o5,
          record.lossOnIgnition,
          record.moisture,
          record.chemicalAnalysisDate,
          record.chemicalAnalysisLaboratoryAssistant,
          record.batchNumber,
          record.notes ?? null,
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
        clauses.push("registration_date >= ?");
        parameters.push(filters.dateFrom);
      }
      if (filters.dateTo !== undefined) {
        clauses.push("registration_date <= ?");
        parameters.push(filters.dateTo);
      }
      if (filters.query !== undefined) {
        clauses.push(`instr(
          concat_ws(
            ' ',
            sample_number,
            laboratory_sample_code,
            sampling_laboratory_assistant,
            sample_name,
            sampling_location,
            chemical_analysis_laboratory_assistant,
            batch_number,
            coalesce(notes, '')
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
      const [rows] = await pool.query<LaboratorySampleRegistrationJournalRow[]>(
        `select
          id,
          sample_number,
          laboratory_sample_code,
          sampling_date,
          sampling_laboratory_assistant,
          sample_name,
          registration_date,
          sampling_location,
          al2o3,
          fe2o3,
          sio2,
          cao2,
          p2o5,
          loss_on_ignition,
          moisture,
          chemical_analysis_date,
          chemical_analysis_laboratory_assistant,
          batch_number,
          notes,
          created_at
        from laboratory_sample_registration_journal
        ${where}
        order by registration_date desc, created_at desc, id desc
        limit ?`,
        [...parameters, limit],
      );

      return rows.map(mapRecord);
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
    al2o3: row.al2o3,
    fe2o3: row.fe2o3,
    sio2: row.sio2,
    cao2: row.cao2,
    p2o5: row.p2o5,
    lossOnIgnition: row.loss_on_ignition,
    moisture: row.moisture,
    chemicalAnalysisDate: formatDate(row.chemical_analysis_date),
    chemicalAnalysisLaboratoryAssistant:
      row.chemical_analysis_laboratory_assistant,
    batchNumber: row.batch_number,
    ...(row.notes === null ? {} : { notes: row.notes }),
    createdAt: new Date(row.created_at).toISOString(),
  };
}

function formatDate(value: Date | string) {
  return typeof value === "string"
    ? value.slice(0, 10)
    : value.toISOString().slice(0, 10);
}
