import { randomUUID } from "node:crypto";
import type { RowDataPacket } from "mysql2/promise";
import type {
  LaboratoryFormedProductSampleCorrection,
  LaboratoryFormedProductSampleFilters,
  LaboratoryFormedProductSampleRecord,
  LaboratoryFormedProductSampleSubmission,
} from "../contracts/laboratoryFormedProductSampleJournal.js";
import type { DatabasePool } from "../db/pool.js";
import { escapeLikePattern } from "./laboratoryResultsRepository.js";
import {
  LaboratorySampleRegistrationTransmissionUnavailableError,
  type ClaimSampleRegistrationTransmission,
} from "./laboratorySampleRegistrationJournalRepository.js";

type RepositoryFilters = LaboratoryFormedProductSampleFilters & {
  limit?: number;
};

type CreatedRecord = LaboratoryFormedProductSampleSubmission & {
  id: string;
  createdAt: string;
};

export type LaboratoryFormedProductSampleCorrectionResult = {
  before: LaboratoryFormedProductSampleCorrection;
  record: LaboratoryFormedProductSampleRecord;
};

export type LaboratoryFormedProductSampleJournalRepository = {
  create: (input: {
    record: LaboratoryFormedProductSampleSubmission;
    submittedByUserId: string;
    submittedByAccountId: string;
  }) => Promise<CreatedRecord>;
  update: (input: {
    id: string;
    record: LaboratoryFormedProductSampleCorrection;
    correctedByUserId: string;
    correctedByAccountId: string;
    correctedByDisplayName: string;
  }) => Promise<LaboratoryFormedProductSampleCorrectionResult | undefined>;
  list: (
    filters?: RepositoryFilters,
  ) => Promise<LaboratoryFormedProductSampleRecord[]>;
};

type JournalRow = RowDataPacket & {
  id: string;
  sorting_date: Date | string;
  sample_code: string;
  product_brand: string;
  source_sample_registration_id: string | null;
  created_at: Date | string;
};

type RepositoryOptions = {
  createId?: () => string;
  now?: () => Date;
  claimSampleRegistrationTransmission?: ClaimSampleRegistrationTransmission;
};

const defaultListLimit = 200;
const maxListLimit = 500;

export function createLaboratoryFormedProductSampleJournalRepository(
  pool: DatabasePool,
  {
    createId = randomUUID,
    now = () => new Date(),
    claimSampleRegistrationTransmission,
  }: RepositoryOptions = {},
): LaboratoryFormedProductSampleJournalRepository {
  return {
    async create(input) {
      const id = createId();
      const createdAt = now().toISOString();
      const record = input.record;

      if (record.sourceSampleRegistrationId !== undefined) {
        const claim = await claimSampleRegistrationTransmission?.({
          sampleRegistrationId: record.sourceSampleRegistrationId,
          target: "formed_product_sample",
          targetRecordId: id,
        });
        if (claim === undefined || !claim.ok) {
          throw new LaboratorySampleRegistrationTransmissionUnavailableError();
        }
      }

      await pool.query(
        `insert into laboratory_formed_product_sample_journal (
          id,
          sorting_date,
          sample_code,
          product_brand,
          source_sample_registration_id,
          submitted_by_user_id,
          submitted_by_account_id,
          created_at
        ) values (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          record.sortingDate,
          record.sampleCode,
          record.productBrand,
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
          sorting_date,
          sample_code,
          product_brand,
          source_sample_registration_id,
          created_at
        from laboratory_formed_product_sample_journal
        where id = ?
        limit 1
        for update`,
        [input.id],
      );
      const current = rows[0];
      if (current === undefined) return undefined;

      const before = mapSnapshot(current);
      const correctedAt = now().toISOString();
      const after: LaboratoryFormedProductSampleCorrection = {
        sortingDate: input.record.sortingDate,
        sampleCode: input.record.sampleCode,
        productBrand: input.record.productBrand,
      };

      await pool.query(
        `update laboratory_formed_product_sample_journal
        set
          sorting_date = ?,
          sample_code = ?,
          product_brand = ?
        where id = ?`,
        [
          input.record.sortingDate,
          input.record.sampleCode,
          input.record.productBrand,
          input.id,
        ],
      );
      await pool.query(
        `insert into laboratory_formed_product_sample_revisions (
          id,
          formed_product_sample_id,
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
          ...(current.source_sample_registration_id === null
            ? {}
            : {
                sourceSampleRegistrationId:
                  current.source_sample_registration_id,
              }),
          createdAt: new Date(current.created_at).toISOString(),
        },
      };
    },

    async list(filters = {}) {
      const clauses: string[] = [];
      const parameters: unknown[] = [];

      if (filters.dateFrom !== undefined) {
        clauses.push("sorting_date >= ?");
        parameters.push(filters.dateFrom);
      }
      if (filters.dateTo !== undefined) {
        clauses.push("sorting_date <= ?");
        parameters.push(filters.dateTo);
      }
      if (filters.query !== undefined) {
        clauses.push(`instr(
          concat_ws(' ', sample_code, product_brand),
          ?
        ) > 0`);
        parameters.push(filters.query);
      }
      if (filters.nameQuery !== undefined) {
        clauses.push("product_brand like ?");
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
          sorting_date,
          sample_code,
          product_brand,
          source_sample_registration_id,
          created_at
        from laboratory_formed_product_sample_journal
        ${where}
        order by sorting_date desc, sequence_id desc
        limit ?`,
        [...parameters, limit],
      );

      return rows.map(mapRecord);
    },
  };
}

function mapSnapshot(
  row: JournalRow,
): LaboratoryFormedProductSampleCorrection {
  return {
    sortingDate: formatDate(row.sorting_date),
    sampleCode: row.sample_code,
    productBrand: row.product_brand,
  };
}

function mapRecord(row: JournalRow): LaboratoryFormedProductSampleRecord {
  return {
    id: row.id,
    ...mapSnapshot(row),
    ...(row.source_sample_registration_id === null
      ? {}
      : { sourceSampleRegistrationId: row.source_sample_registration_id }),
    createdAt: new Date(row.created_at).toISOString(),
  };
}

function formatDate(value: Date | string) {
  return typeof value === "string"
    ? value.slice(0, 10)
    : value.toISOString().slice(0, 10);
}
