import { randomUUID } from "node:crypto";
import type { RowDataPacket } from "mysql2/promise";
import type {
  LaboratoryChemicalAnalysisJournalFilters,
  LaboratoryChemicalAnalysisJournalRecord,
  LaboratoryChemicalAnalysisJournalSubmission,
  LaboratorySampleRegistrationOption,
} from "../contracts/laboratoryChemicalAnalysisJournal.js";
import type { DatabasePool } from "../db/pool.js";
import { escapeLikePattern } from "./laboratoryResultsRepository.js";

type RepositoryFilters = LaboratoryChemicalAnalysisJournalFilters & {
  limit?: number;
};

export type LaboratoryChemicalAnalysisJournalCorrectionResult = {
  before: LaboratoryChemicalAnalysisJournalRecord;
  record: LaboratoryChemicalAnalysisJournalRecord;
};

export type LaboratoryChemicalAnalysisJournalRepository = {
  create: (input: {
    analysis: LaboratoryChemicalAnalysisJournalSubmission;
    sample: LaboratorySampleRegistrationOption;
    submittedByUserId: string;
    submittedByAccountId: string;
  }) => Promise<LaboratoryChemicalAnalysisJournalRecord>;
  update: (input: {
    id: string;
    analysis: LaboratoryChemicalAnalysisJournalSubmission;
    correctedByUserId: string;
    correctedByAccountId: string;
    correctedByDisplayName: string;
  }) => Promise<LaboratoryChemicalAnalysisJournalCorrectionResult | undefined>;
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
  chemical_analysis_date: Date | string | null;
  chemical_analysis_laboratory_assistant: string | null;
  batch_number: string;
  al2o3: string | null;
  fe2o3: string | null;
  sio2: string | null;
  cao2: string | null;
  p2o5: string | null;
  loss_on_ignition: string | null;
  moisture: string | null;
  notes: string | null;
  created_at: Date | string;
};

type LaboratorySampleRegistrationSnapshotRow = RowDataPacket & {
  laboratory_sample_code: string;
  sample_number: string;
  sample_name: string;
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
          analysis.chemicalAnalysisDate ?? null,
          analysis.chemicalAnalysisLaboratoryAssistant ?? null,
          analysis.batchNumber,
          analysis.al2o3 ?? null,
          analysis.fe2o3 ?? null,
          analysis.sio2 ?? null,
          analysis.cao2 ?? null,
          analysis.p2o5 ?? null,
          analysis.lossOnIgnition ?? null,
          analysis.moisture ?? null,
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

    async update(input) {
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
        where analysis.id = ?
        limit 1
        for update`,
        [input.id],
      );
      const current = rows[0];
      if (current === undefined) return undefined;

      const [sampleRows] = await pool.query<
        LaboratorySampleRegistrationSnapshotRow[]
      >(
        `select
          laboratory_sample_code,
          sample_number,
          sample_name
        from laboratory_sample_registration_journal
        where id = ?
        limit 1
        for update`,
        [input.analysis.sampleRegistrationId],
      );
      const selectedSample = sampleRows[0];
      if (selectedSample === undefined) return undefined;

      const before = mapRecord(current);
      const correctedAt = now().toISOString();
      const corrected = {
        id: input.id,
        ...input.analysis,
        laboratorySampleCode: selectedSample.laboratory_sample_code,
        sampleNumber: selectedSample.sample_number,
        sampleName: selectedSample.sample_name,
        createdAt: before.createdAt,
      };

      await pool.query(
        `update laboratory_chemical_analysis_journal
        set
          sample_registration_id = ?,
          chemical_analysis_date = ?,
          chemical_analysis_laboratory_assistant = ?,
          batch_number = ?,
          al2o3 = ?,
          fe2o3 = ?,
          sio2 = ?,
          cao2 = ?,
          p2o5 = ?,
          loss_on_ignition = ?,
          moisture = ?,
          notes = ?
        where id = ?`,
        [
          input.analysis.sampleRegistrationId,
          input.analysis.chemicalAnalysisDate ?? null,
          input.analysis.chemicalAnalysisLaboratoryAssistant ?? null,
          input.analysis.batchNumber,
          input.analysis.al2o3 ?? null,
          input.analysis.fe2o3 ?? null,
          input.analysis.sio2 ?? null,
          input.analysis.cao2 ?? null,
          input.analysis.p2o5 ?? null,
          input.analysis.lossOnIgnition ?? null,
          input.analysis.moisture ?? null,
          input.analysis.notes ?? null,
          input.id,
        ],
      );
      await pool.query(
        `insert into laboratory_chemical_analysis_revisions (
          id,
          chemical_analysis_id,
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
      if (filters.nameQuery !== undefined) {
        clauses.push("registration.sample_name like ?");
        parameters.push(`%${escapeLikePattern(filters.nameQuery)}%`);
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
          coalesce(
            analysis.chemical_analysis_date,
            date(analysis.created_at)
          ) desc,
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
    batchNumber: row.batch_number,
    ...(row.chemical_analysis_date === null
      ? {}
      : { chemicalAnalysisDate: formatDate(row.chemical_analysis_date) }),
    ...(row.chemical_analysis_laboratory_assistant === null
      ? {}
      : {
          chemicalAnalysisLaboratoryAssistant:
            row.chemical_analysis_laboratory_assistant,
        }),
    ...(row.al2o3 === null ? {} : { al2o3: row.al2o3 }),
    ...(row.fe2o3 === null ? {} : { fe2o3: row.fe2o3 }),
    ...(row.sio2 === null ? {} : { sio2: row.sio2 }),
    ...(row.cao2 === null ? {} : { cao2: row.cao2 }),
    ...(row.p2o5 === null ? {} : { p2o5: row.p2o5 }),
    ...(row.loss_on_ignition === null
      ? {}
      : { lossOnIgnition: row.loss_on_ignition }),
    ...(row.moisture === null ? {} : { moisture: row.moisture }),
    ...(row.notes === null ? {} : { notes: row.notes }),
    createdAt: new Date(row.created_at).toISOString(),
  };
}

function formatDate(value: Date | string) {
  return typeof value === "string"
    ? value.slice(0, 10)
    : value.toISOString().slice(0, 10);
}
