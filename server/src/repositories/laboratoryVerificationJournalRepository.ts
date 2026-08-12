import { randomUUID } from "node:crypto";
import type { RowDataPacket } from "mysql2/promise";
import type {
  LaboratoryVerificationCorrection,
  LaboratoryVerificationFilters,
  LaboratoryVerificationRecord,
  LaboratoryVerificationSubmission,
} from "../contracts/laboratoryVerificationJournal.js";
import type { DatabasePool } from "../db/pool.js";
import { escapeLikePattern } from "./laboratoryResultsRepository.js";
import {
  LaboratorySampleRegistrationTransmissionUnavailableError,
  type ClaimSampleRegistrationTransmission,
} from "./laboratorySampleRegistrationJournalRepository.js";

type RepositoryFilters = LaboratoryVerificationFilters & { limit?: number };

type CreatedRecord = LaboratoryVerificationSubmission & {
  id: string;
  createdAt: string;
};

export type LaboratoryVerificationCorrectionResult = {
  before: LaboratoryVerificationCorrection;
  record: LaboratoryVerificationRecord;
};

export type LaboratoryVerificationJournalRepository = {
  create: (input: {
    record: LaboratoryVerificationSubmission;
    submittedByUserId: string;
    submittedByAccountId: string;
  }) => Promise<CreatedRecord>;
  update: (input: {
    id: string;
    record: LaboratoryVerificationCorrection;
    correctedByUserId: string;
    correctedByAccountId: string;
    correctedByDisplayName: string;
  }) => Promise<LaboratoryVerificationCorrectionResult | undefined>;
  list: (
    filters?: RepositoryFilters,
  ) => Promise<LaboratoryVerificationRecord[]>;
};

type JournalRow = RowDataPacket & {
  id: string;
  verification_date: Date | string;
  product_name: string;
  sampling_location: string;
  sample_code: string;
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

export function createLaboratoryVerificationJournalRepository(
  pool: DatabasePool,
  {
    createId = randomUUID,
    now = () => new Date(),
    claimSampleRegistrationTransmission,
  }: RepositoryOptions = {},
): LaboratoryVerificationJournalRepository {
  return {
    async create(input) {
      const id = createId();
      const createdAt = now().toISOString();
      const record = input.record;

      if (record.sourceSampleRegistrationId !== undefined) {
        const claim = await claimSampleRegistrationTransmission?.({
          sampleRegistrationId: record.sourceSampleRegistrationId,
          target: "verification",
          targetRecordId: id,
        });
        if (claim === undefined || !claim.ok) {
          throw new LaboratorySampleRegistrationTransmissionUnavailableError();
        }
      }

      await pool.query(
        `insert into laboratory_verification_journal (
          id,
          verification_date,
          product_name,
          sampling_location,
          sample_code,
          source_sample_registration_id,
          submitted_by_user_id,
          submitted_by_account_id,
          created_at
        ) values (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          record.verificationDate,
          record.productName,
          record.samplingLocation,
          record.sampleCode,
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
          verification_date,
          product_name,
          sampling_location,
          sample_code,
          source_sample_registration_id,
          created_at
        from laboratory_verification_journal
        where id = ?
        limit 1
        for update`,
        [input.id],
      );
      const current = rows[0];
      if (current === undefined) return undefined;

      const before = mapSnapshot(current);
      const correctedAt = now().toISOString();
      const after: LaboratoryVerificationCorrection = {
        verificationDate: input.record.verificationDate,
        productName: input.record.productName,
        samplingLocation: input.record.samplingLocation,
        sampleCode: input.record.sampleCode,
      };

      await pool.query(
        `update laboratory_verification_journal
        set
          verification_date = ?,
          product_name = ?,
          sampling_location = ?,
          sample_code = ?
        where id = ?`,
        [
          input.record.verificationDate,
          input.record.productName,
          input.record.samplingLocation,
          input.record.sampleCode,
          input.id,
        ],
      );
      await pool.query(
        `insert into laboratory_verification_revisions (
          id,
          verification_id,
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
        clauses.push("verification_date >= ?");
        parameters.push(filters.dateFrom);
      }
      if (filters.dateTo !== undefined) {
        clauses.push("verification_date <= ?");
        parameters.push(filters.dateTo);
      }
      if (filters.query !== undefined) {
        clauses.push(`instr(
          concat_ws(' ', product_name, sampling_location, sample_code),
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
          verification_date,
          product_name,
          sampling_location,
          sample_code,
          source_sample_registration_id,
          created_at
        from laboratory_verification_journal
        ${where}
        order by verification_date desc, sequence_id desc
        limit ?`,
        [...parameters, limit],
      );

      return rows.map(mapRecord);
    },
  };
}

function mapSnapshot(row: JournalRow): LaboratoryVerificationCorrection {
  return {
    verificationDate: formatDate(row.verification_date),
    productName: row.product_name,
    samplingLocation: row.sampling_location,
    sampleCode: row.sample_code,
  };
}

function mapRecord(row: JournalRow): LaboratoryVerificationRecord {
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
