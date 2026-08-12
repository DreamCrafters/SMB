import { randomUUID } from "node:crypto";
import type { RowDataPacket } from "mysql2/promise";
import type {
  LaboratoryUnshapedProductSampleCorrection,
  LaboratoryUnshapedProductSampleFilters,
  LaboratoryUnshapedProductSampleRecord,
  LaboratoryUnshapedProductSampleSubmission,
  LaboratoryUnshapedProductSampleSuitability,
} from "../contracts/laboratoryUnshapedProductSampleJournal.js";
import type { DatabasePool } from "../db/pool.js";
import { escapeLikePattern } from "./laboratoryResultsRepository.js";
import {
  LaboratorySampleRegistrationTransmissionUnavailableError,
  type ClaimSampleRegistrationTransmission,
} from "./laboratorySampleRegistrationJournalRepository.js";

type RepositoryFilters = LaboratoryUnshapedProductSampleFilters & {
  limit?: number;
};

type CreatedRecord = LaboratoryUnshapedProductSampleSubmission & {
  id: string;
  createdAt: string;
};

type RevisionSnapshot = LaboratoryUnshapedProductSampleCorrection & {
  chemicalAnalysisNumber?: string;
};

export type LaboratoryUnshapedProductSampleCorrectionResult = {
  before: RevisionSnapshot;
  record: LaboratoryUnshapedProductSampleRecord;
};

export type LaboratoryUnshapedProductSampleJournalRepository = {
  create: (input: {
    record: LaboratoryUnshapedProductSampleSubmission;
    submittedByUserId: string;
    submittedByAccountId: string;
  }) => Promise<CreatedRecord>;
  update: (input: {
    id: string;
    record: LaboratoryUnshapedProductSampleCorrection;
    correctedByUserId: string;
    correctedByAccountId: string;
    correctedByDisplayName: string;
  }) => Promise<LaboratoryUnshapedProductSampleCorrectionResult | undefined>;
  list: (filters?: RepositoryFilters) => Promise<LaboratoryUnshapedProductSampleRecord[]>;
  getNextSampleNumber: () => Promise<string>;
  getLastSampledBy: () => Promise<string>;
};

type JournalRow = RowDataPacket & {
  id: string;
  sample_number: string;
  sample_date: Date | string;
  sampled_by: string;
  batch_number: string;
  sample_code: string;
  product_name: string;
  batch_mass: string;
  chemical_analysis_number: string | null;
  moisture: string;
  grain_composition: string;
  fire_resistance: string;
  suitability: LaboratoryUnshapedProductSampleSuitability;
  notes: string | null;
  source_sample_registration_id: string | null;
  created_at: Date | string;
};

type NextSampleNumberRow = RowDataPacket & {
  max_sample_number: string | null;
};

type LastSampledByRow = RowDataPacket & {
  sampled_by: string;
};

type RepositoryOptions = {
  createId?: () => string;
  now?: () => Date;
  claimSampleRegistrationTransmission?: ClaimSampleRegistrationTransmission;
};

const defaultListLimit = 200;
const maxListLimit = 500;

export function createLaboratoryUnshapedProductSampleJournalRepository(
  pool: DatabasePool,
  {
    createId = randomUUID,
    now = () => new Date(),
    claimSampleRegistrationTransmission,
  }: RepositoryOptions = {},
): LaboratoryUnshapedProductSampleJournalRepository {
  return {
    async create(input) {
      const id = createId();
      const createdAt = now().toISOString();
      const record = input.record;

      if (record.sourceSampleRegistrationId !== undefined) {
        const claim = await claimSampleRegistrationTransmission?.({
          sampleRegistrationId: record.sourceSampleRegistrationId,
          target: "unshaped_product_sample",
          targetRecordId: id,
        });
        if (claim === undefined || !claim.ok) {
          throw new LaboratorySampleRegistrationTransmissionUnavailableError();
        }
      }

      await pool.query(
        `insert into laboratory_unshaped_product_sample_journal (
          id,
          sample_number,
          sample_date,
          sampled_by,
          batch_number,
          sample_code,
          product_name,
          batch_mass,
          chemical_analysis_number,
          moisture,
          grain_composition,
          fire_resistance,
          suitability,
          notes,
          source_sample_registration_id,
          submitted_by_user_id,
          submitted_by_account_id,
          created_at
        ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          record.sampleNumber,
          record.sampleDate,
          record.sampledBy,
          record.batchNumber,
          record.sampleCode,
          record.productName,
          record.batchMass,
          null,
          record.moisture,
          record.grainComposition,
          record.fireResistance,
          record.suitability,
          record.notes ?? null,
          record.sourceSampleRegistrationId ?? null,
          input.submittedByUserId,
          input.submittedByAccountId,
          createdAt,
        ],
      );

      return { id, ...record, createdAt };
    },

    async update(input) {
      const [rows] = await pool.query<JournalRow[]>(
        `select
          id,
          sample_number,
          sample_date,
          sampled_by,
          batch_number,
          sample_code,
          product_name,
          batch_mass,
          chemical_analysis_number,
          moisture,
          grain_composition,
          fire_resistance,
          suitability,
          notes,
          source_sample_registration_id,
          created_at
        from laboratory_unshaped_product_sample_journal
        where id = ?
        limit 1
        for update`,
        [input.id],
      );
      const current = rows[0];
      if (current === undefined) return undefined;

      const before = mapSnapshot(current);
      const correctedAt = now().toISOString();
      const { sourceSampleRegistrationId: _ignoredSource, ...correctedInput } =
        input.record;
      const after: RevisionSnapshot = {
        ...correctedInput,
        ...(current.chemical_analysis_number === null
          ? {}
          : { chemicalAnalysisNumber: current.chemical_analysis_number }),
        ...(current.source_sample_registration_id === null
          ? {}
          : {
              sourceSampleRegistrationId:
                current.source_sample_registration_id,
            }),
      };

      await pool.query(
        `update laboratory_unshaped_product_sample_journal
        set
          sample_number = ?,
          sample_date = ?,
          sampled_by = ?,
          batch_number = ?,
          sample_code = ?,
          product_name = ?,
          batch_mass = ?,
          moisture = ?,
          grain_composition = ?,
          fire_resistance = ?,
          suitability = ?,
          notes = ?
        where id = ?`,
        [
          input.record.sampleNumber,
          input.record.sampleDate,
          input.record.sampledBy,
          input.record.batchNumber,
          input.record.sampleCode,
          input.record.productName,
          input.record.batchMass,
          input.record.moisture,
          input.record.grainComposition,
          input.record.fireResistance,
          input.record.suitability,
          input.record.notes ?? null,
          input.id,
        ],
      );
      await pool.query(
        `insert into laboratory_unshaped_product_sample_revisions (
          id,
          unshaped_product_sample_id,
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
          JSON.stringify(after),
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
          ...after,
          createdAt: new Date(current.created_at).toISOString(),
        },
      };
    },

    async list(filters = {}) {
      const clauses: string[] = [];
      const parameters: unknown[] = [];

      if (filters.dateFrom !== undefined) {
        clauses.push("sample_date >= ?");
        parameters.push(filters.dateFrom);
      }
      if (filters.dateTo !== undefined) {
        clauses.push("sample_date <= ?");
        parameters.push(filters.dateTo);
      }
      if (filters.query !== undefined) {
        clauses.push(`instr(
          concat_ws(
            ' ',
            sample_number,
            sampled_by,
            batch_number,
            sample_code,
            product_name,
            batch_mass,
            coalesce(chemical_analysis_number, ''),
            moisture,
            grain_composition,
            fire_resistance,
            case suitability
              when 'yes' then 'Да'
              when 'no' then 'Нет'
              when 'maybe' then 'м.б.'
              else suitability
            end,
            coalesce(notes, '')
          ),
          ?
        ) > 0`);
        parameters.push(filters.query);
      }
      if (filters.nameQuery !== undefined) {
        clauses.push("product_name like ?");
        parameters.push(`%${escapeLikePattern(filters.nameQuery)}%`);
      }

      const limit = Math.min(
        Math.max(Math.trunc(filters.limit ?? defaultListLimit), 1),
        maxListLimit,
      );
      const where = clauses.length === 0 ? "" : `where ${clauses.join(" and ")}`;
      const [rows] = await pool.query<JournalRow[]>(
        `select
          id,
          sample_number,
          sample_date,
          sampled_by,
          batch_number,
          sample_code,
          product_name,
          batch_mass,
          chemical_analysis_number,
          moisture,
          grain_composition,
          fire_resistance,
          suitability,
          notes,
          created_at
        from laboratory_unshaped_product_sample_journal
        ${where}
        order by
          case
            when trim(sample_number) regexp '^[0-9]+'
              then cast(trim(sample_number) as unsigned)
            else null
          end desc,
          sample_number desc,
          sample_date desc,
          sequence_id desc
        limit ?`,
        [...parameters, limit],
      );

      return rows.map(mapRecord);
    },

    async getNextSampleNumber() {
      const [rows] = await pool.query<NextSampleNumberRow[]>(
        `select cast(
          max(cast(trim(sample_number) as unsigned)) as char
        ) as max_sample_number
        from laboratory_unshaped_product_sample_journal
        where trim(sample_number) regexp '^[0-9]+'`,
      );

      return (BigInt(rows[0]?.max_sample_number ?? "0") + 1n).toString();
    },

    async getLastSampledBy() {
      const [rows] = await pool.query<LastSampledByRow[]>(
        `select sampled_by
        from laboratory_unshaped_product_sample_journal
        order by sequence_id desc limit 1`,
      );

      return rows[0]?.sampled_by ?? "";
    },
  };
}

function mapSnapshot(row: JournalRow): RevisionSnapshot {
  return {
    sampleNumber: row.sample_number,
    sampleDate: formatDate(row.sample_date),
    sampledBy: row.sampled_by,
    batchNumber: row.batch_number,
    sampleCode: row.sample_code,
    productName: row.product_name,
    batchMass: row.batch_mass,
    moisture: row.moisture,
    grainComposition: row.grain_composition,
    fireResistance: row.fire_resistance,
    suitability: row.suitability,
    ...(row.notes === null ? {} : { notes: row.notes }),
    ...(row.source_sample_registration_id === null
      ? {}
      : { sourceSampleRegistrationId: row.source_sample_registration_id }),
    ...(row.chemical_analysis_number === null
      ? {}
      : { chemicalAnalysisNumber: row.chemical_analysis_number }),
  };
}

function mapRecord(row: JournalRow): LaboratoryUnshapedProductSampleRecord {
  return {
    id: row.id,
    ...mapSnapshot(row),
    createdAt: new Date(row.created_at).toISOString(),
  };
}

function formatDate(value: Date | string) {
  return typeof value === "string"
    ? value.slice(0, 10)
    : value.toISOString().slice(0, 10);
}
