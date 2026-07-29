import { randomUUID } from "node:crypto";
import type { RowDataPacket } from "mysql2/promise";
import type {
  LaboratoryChemicalAnalysisJournalFilters,
  LaboratoryChemicalAnalysisJournalRecord,
  LaboratoryChemicalAnalysisJournalSubmission,
  LaboratorySampleRegistrationOption,
} from "../contracts/laboratoryChemicalAnalysisJournal.js";
import type { DatabasePool } from "../db/pool.js";

type RepositoryFilters = LaboratoryChemicalAnalysisJournalFilters & {
  limit?: number;
};

export type LaboratoryChemicalAnalysisJournalRepository = {
  create: (input: {
    analysis: LaboratoryChemicalAnalysisJournalSubmission;
    sample: LaboratorySampleRegistrationOption;
    submittedByUserId: string;
    submittedByAccountId: string;
  }) => Promise<LaboratoryChemicalAnalysisJournalRecord>;
  list: (
    filters?: RepositoryFilters,
  ) => Promise<LaboratoryChemicalAnalysisJournalRecord[]>;
};

type LaboratoryChemicalAnalysisJournalRow = RowDataPacket & {
  id: string;
  sample_registration_id: string;
  laboratory_sample_code: string;
  sample_number: string;
  sample_name: string;
  chemical_analysis_date: Date | string;
  chemical_analysis_laboratory_assistant: string;
  batch_number: string;
  al2o3: string;
  fe2o3: string;
  sio2: string;
  cao2: string;
  p2o5: string;
  loss_on_ignition: string;
  moisture: string;
  notes: string | null;
  created_at: Date | string;
};

type RepositoryOptions = {
  createId?: () => string;
  now?: () => Date;
};

const defaultListLimit = 200;
const maxListLimit = 500;

export function createLaboratoryChemicalAnalysisJournalRepository(
  pool: DatabasePool,
  {
    createId = randomUUID,
    now = () => new Date(),
  }: RepositoryOptions = {},
): LaboratoryChemicalAnalysisJournalRepository {
  return {
    async create(input) {
      const id = createId();
      const createdAt = now().toISOString();
      const analysis = input.analysis;

      await pool.query(
        `insert into laboratory_chemical_analysis_journal (
          id,
          sample_registration_id,
          chemical_analysis_date,
          chemical_analysis_laboratory_assistant,
          batch_number,
          al2o3,
          fe2o3,
          sio2,
          cao2,
          p2o5,
          loss_on_ignition,
          moisture,
          notes,
          submitted_by_user_id,
          submitted_by_account_id,
          created_at
        ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          analysis.sampleRegistrationId,
          analysis.chemicalAnalysisDate,
          analysis.chemicalAnalysisLaboratoryAssistant,
          analysis.batchNumber,
          analysis.al2o3,
          analysis.fe2o3,
          analysis.sio2,
          analysis.cao2,
          analysis.p2o5,
          analysis.lossOnIgnition,
          analysis.moisture,
          analysis.notes ?? null,
          input.submittedByUserId,
          input.submittedByAccountId,
          createdAt,
        ],
      );

      return {
        id,
        ...analysis,
        laboratorySampleCode: input.sample.laboratorySampleCode,
        sampleNumber: input.sample.sampleNumber,
        sampleName: input.sample.sampleName,
        createdAt,
      };
    },

    async list(filters = {}) {
      const clauses: string[] = [];
      const parameters: unknown[] = [];

      if (filters.dateFrom !== undefined) {
        clauses.push("analysis.chemical_analysis_date >= ?");
        parameters.push(filters.dateFrom);
      }
      if (filters.dateTo !== undefined) {
        clauses.push("analysis.chemical_analysis_date <= ?");
        parameters.push(filters.dateTo);
      }
      if (filters.query !== undefined) {
        clauses.push(`instr(
          concat_ws(
            ' ',
            registration.laboratory_sample_code,
            registration.sample_number,
            registration.sample_name,
            analysis.chemical_analysis_laboratory_assistant,
            analysis.batch_number,
            coalesce(analysis.notes, '')
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
      const [rows] = await pool.query<LaboratoryChemicalAnalysisJournalRow[]>(
        `select
          analysis.id,
          analysis.sample_registration_id,
          registration.laboratory_sample_code,
          registration.sample_number,
          registration.sample_name,
          analysis.chemical_analysis_date,
          analysis.chemical_analysis_laboratory_assistant,
          analysis.batch_number,
          analysis.al2o3,
          analysis.fe2o3,
          analysis.sio2,
          analysis.cao2,
          analysis.p2o5,
          analysis.loss_on_ignition,
          analysis.moisture,
          analysis.notes,
          analysis.created_at
        from laboratory_chemical_analysis_journal analysis
        join laboratory_sample_registration_journal registration
          on registration.id = analysis.sample_registration_id
        ${where}
        order by
          analysis.chemical_analysis_date desc,
          analysis.created_at desc,
          analysis.sequence_id desc
        limit ?`,
        [...parameters, limit],
      );

      return rows.map(mapRecord);
    },
  };
}

function mapRecord(
  row: LaboratoryChemicalAnalysisJournalRow,
): LaboratoryChemicalAnalysisJournalRecord {
  return {
    id: row.id,
    sampleRegistrationId: row.sample_registration_id,
    laboratorySampleCode: row.laboratory_sample_code,
    sampleNumber: row.sample_number,
    sampleName: row.sample_name,
    chemicalAnalysisDate: formatDate(row.chemical_analysis_date),
    chemicalAnalysisLaboratoryAssistant:
      row.chemical_analysis_laboratory_assistant,
    batchNumber: row.batch_number,
    al2o3: row.al2o3,
    fe2o3: row.fe2o3,
    sio2: row.sio2,
    cao2: row.cao2,
    p2o5: row.p2o5,
    lossOnIgnition: row.loss_on_ignition,
    moisture: row.moisture,
    ...(row.notes === null ? {} : { notes: row.notes }),
    createdAt: new Date(row.created_at).toISOString(),
  };
}

function formatDate(value: Date | string) {
  return typeof value === "string"
    ? value.slice(0, 10)
    : value.toISOString().slice(0, 10);
}
