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
  buildSampleChemicalAnalysisSql,
  mapSampleChemicalAnalysis,
} from "./laboratoryChemicalAnalysisJournalRepository.js";
import type { RefractoryWagonsRepository } from "./refractoryWagonsRepository.js";
import {
  LaboratorySampleRegistrationTransmissionUnavailableError,
  type ClaimSampleRegistrationTransmission,
} from "./laboratorySampleRegistrationJournalRepository.js";

export class LaboratoryFormedProductSampleWagonNotFoundError extends Error {
  constructor() {
    super(
      "A refractory wagon was not found for the given number and sorting date.",
    );
    this.name = "LaboratoryFormedProductSampleWagonNotFoundError";
  }
}

type RepositoryFilters = LaboratoryFormedProductSampleFilters & {
  limit?: number;
};

type CreatedRecord = LaboratoryFormedProductSampleRecord;

type FormedProductSampleSnapshot = Omit<
  LaboratoryFormedProductSampleRecord,
  "id" | "createdAt"
>;

export type LaboratoryFormedProductSampleCorrectionResult = {
  before: FormedProductSampleSnapshot;
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
  wagon_number: string | null;
  sample_code: string | null;
  product_brand: string;
  molding_date: Date | string | null;
  source_sample_registration_id: string | null;
  created_at: Date | string;
};

type RepositoryOptions = {
  createId?: () => string;
  now?: () => Date;
  refractoryWagons: RefractoryWagonsRepository;
  claimSampleRegistrationTransmission?: ClaimSampleRegistrationTransmission;
};

const defaultListLimit = 200;
const maxListLimit = 500;

export function createLaboratoryFormedProductSampleJournalRepository(
  pool: DatabasePool,
  {
    createId = randomUUID,
    now = () => new Date(),
    refractoryWagons,
    claimSampleRegistrationTransmission,
  }: RepositoryOptions,
): LaboratoryFormedProductSampleJournalRepository {
  async function resolveWagon(wagonNumber: string, sortingDate: string) {
    const wagon = await refractoryWagons.findBySortingDate({
      number: wagonNumber,
      sortingDate,
    });
    if (wagon === undefined) {
      throw new LaboratoryFormedProductSampleWagonNotFoundError();
    }
    return { productBrand: wagon.productBrand, moldingDate: wagon.pressDate };
  }

  return {
    async create(input) {
      const id = createId();
      const createdAt = now().toISOString();
      const record = input.record;

      if (record.wagonNumber !== undefined) {
        const { productBrand, moldingDate } = await resolveWagon(
          record.wagonNumber,
          record.sortingDate,
        );

        await pool.query(
          `insert into laboratory_formed_product_sample_journal (
            id,
            sorting_date,
            wagon_number,
            sample_code,
            product_brand,
            molding_date,
            source_sample_registration_id,
            submitted_by_user_id,
            submitted_by_account_id,
            created_at
          ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            id,
            record.sortingDate,
            record.wagonNumber,
            null,
            productBrand,
            moldingDate,
            null,
            input.submittedByUserId,
            input.submittedByAccountId,
            createdAt,
          ],
        );

        return {
          id,
          sortingDate: record.sortingDate,
          wagonNumber: record.wagonNumber,
          sampleCode: null,
          productBrand,
          moldingDate,
          createdAt,
        };
      }

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
          wagon_number,
          sample_code,
          product_brand,
          molding_date,
          source_sample_registration_id,
          submitted_by_user_id,
          submitted_by_account_id,
          created_at
        ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          record.sortingDate,
          null,
          record.sampleCode,
          record.productBrand,
          null,
          record.sourceSampleRegistrationId ?? null,
          input.submittedByUserId,
          input.submittedByAccountId,
          createdAt,
        ],
      );

      return {
        id,
        sortingDate: record.sortingDate,
        wagonNumber: null,
        sampleCode: record.sampleCode!,
        productBrand: record.productBrand!,
        moldingDate: null,
        ...(record.sourceSampleRegistrationId === undefined
          ? {}
          : { sourceSampleRegistrationId: record.sourceSampleRegistrationId }),
        createdAt,
      };
    },

    async update(input) {
      const [rows] = await pool.query<JournalRow[]>(
        `select
          id,
          sorting_date,
          wagon_number,
          sample_code,
          product_brand,
          molding_date,
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
      const record = input.record;

      let after: LaboratoryFormedProductSampleCorrection;
      let productBrand: string;
      let moldingDate: string | null;
      let sampleCode: string | null;
      let wagonNumber: string | null;
      if (record.wagonNumber !== undefined) {
        const resolved = await resolveWagon(
          record.wagonNumber,
          record.sortingDate,
        );
        after = { sortingDate: record.sortingDate, wagonNumber: record.wagonNumber };
        productBrand = resolved.productBrand;
        moldingDate = resolved.moldingDate;
        sampleCode = null;
        wagonNumber = record.wagonNumber;
      } else {
        after = {
          sortingDate: record.sortingDate,
          sampleCode: record.sampleCode,
          productBrand: record.productBrand,
        };
        productBrand = record.productBrand!;
        moldingDate = null;
        sampleCode = record.sampleCode ?? null;
        wagonNumber = null;
      }

      await pool.query(
        `update laboratory_formed_product_sample_journal
        set
          sorting_date = ?,
          wagon_number = ?,
          sample_code = ?,
          product_brand = ?,
          molding_date = ?
        where id = ?`,
        [
          record.sortingDate,
          wagonNumber,
          sampleCode,
          productBrand,
          moldingDate,
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
          JSON.stringify({ ...after, productBrand, moldingDate }),
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
          sortingDate: record.sortingDate,
          wagonNumber,
          sampleCode,
          productBrand,
          moldingDate,
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
      const chemicalAnalysis = buildSampleChemicalAnalysisSql("sample_registration");
      const clauses: string[] = [];
      const parameters: unknown[] = [];

      if (filters.dateFrom !== undefined) {
        clauses.push("sample.sorting_date >= ?");
        parameters.push(filters.dateFrom);
      }
      if (filters.dateTo !== undefined) {
        clauses.push("sample.sorting_date <= ?");
        parameters.push(filters.dateTo);
      }
      if (filters.query !== undefined) {
        clauses.push(`instr(
          concat_ws(' ', sample.wagon_number, sample.sample_code, sample.product_brand),
          ?
        ) > 0`);
        parameters.push(filters.query);
      }
      if (filters.nameQuery !== undefined) {
        clauses.push("sample.product_brand like ?");
        parameters.push(`%${escapeLikePattern(filters.nameQuery)}%`);
      }

      const limit = Math.min(
        Math.max(Math.trunc(filters.limit ?? defaultListLimit), 1),
        maxListLimit,
      );
      const where = clauses.length === 0 ? "" : `where ${clauses.join(" and ")}`;
      const [rows] = await pool.query<JournalRow[]>(
        `select
          sample.id,
          sample.sorting_date,
          sample.wagon_number,
          sample.sample_code,
          sample.product_brand,
          sample.molding_date,
          sample.source_sample_registration_id,
          sample.created_at,
          ${chemicalAnalysis.columns}
        from laboratory_formed_product_sample_journal sample
        ${chemicalAnalysis.joins}
        ${where}
        order by sample.sorting_date desc, sample.sequence_id desc
        limit ?`,
        [...parameters, limit],
      );

      return rows.map(mapRecord);
    },
  };
}

function mapSnapshot(
  row: JournalRow,
): FormedProductSampleSnapshot {
  return {
    sortingDate: formatDate(row.sorting_date),
    wagonNumber: row.wagon_number,
    sampleCode: row.sample_code,
    productBrand: row.product_brand,
    moldingDate: formatOptionalDate(row.molding_date),
    ...(row.source_sample_registration_id === null
      ? {}
      : { sourceSampleRegistrationId: row.source_sample_registration_id }),
  };
}

function mapRecord(row: JournalRow): LaboratoryFormedProductSampleRecord {
  return {
    id: row.id,
    ...mapSnapshot(row),
    ...mapSampleChemicalAnalysis(row),
    createdAt: new Date(row.created_at).toISOString(),
  };
}

function formatDate(value: Date | string) {
  return typeof value === "string"
    ? value.slice(0, 10)
    : value.toISOString().slice(0, 10);
}

function formatOptionalDate(value: Date | string | null) {
  return value === null ? null : formatDate(value);
}
