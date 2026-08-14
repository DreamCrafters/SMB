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
import type { RefractoryWagonsRepository } from "./refractoryWagonsRepository.js";

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
  product_brand: string;
  molding_date: Date | string | null;
  created_at: Date | string;
};

type RepositoryOptions = {
  createId?: () => string;
  now?: () => Date;
  refractoryWagons: RefractoryWagonsRepository;
};

const defaultListLimit = 200;
const maxListLimit = 500;

export function createLaboratoryFormedProductSampleJournalRepository(
  pool: DatabasePool,
  { createId = randomUUID, now = () => new Date(), refractoryWagons }:
    RepositoryOptions,
): LaboratoryFormedProductSampleJournalRepository {
  async function resolveWagon(record: LaboratoryFormedProductSampleSubmission) {
    const wagon = await refractoryWagons.findBySortingDate({
      number: record.wagonNumber,
      sortingDate: record.sortingDate,
    });
    if (wagon === undefined) {
      throw new LaboratoryFormedProductSampleWagonNotFoundError();
    }
    return { productBrand: wagon.productBrand, moldingDate: wagon.pressDate };
  }

  return {
    async create(input) {
      const { productBrand, moldingDate } = await resolveWagon(input.record);
      const id = createId();
      const createdAt = now().toISOString();

      await pool.query(
        `insert into laboratory_formed_product_sample_journal (
          id,
          sorting_date,
          wagon_number,
          product_brand,
          molding_date,
          submitted_by_user_id,
          submitted_by_account_id,
          created_at
        ) values (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          input.record.sortingDate,
          input.record.wagonNumber,
          productBrand,
          moldingDate,
          input.submittedByUserId,
          input.submittedByAccountId,
          createdAt,
        ],
      );

      return {
        id,
        ...input.record,
        productBrand,
        moldingDate,
        createdAt,
      };
    },

    async update(input) {
      const [rows] = await pool.query<JournalRow[]>(
        `select
          id,
          sorting_date,
          wagon_number,
          product_brand,
          molding_date,
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
      const { productBrand, moldingDate } = await resolveWagon(input.record);
      const correctedAt = now().toISOString();
      const after: LaboratoryFormedProductSampleCorrection = {
        sortingDate: input.record.sortingDate,
        wagonNumber: input.record.wagonNumber,
      };

      await pool.query(
        `update laboratory_formed_product_sample_journal
        set
          sorting_date = ?,
          wagon_number = ?,
          product_brand = ?,
          molding_date = ?
        where id = ?`,
        [
          input.record.sortingDate,
          input.record.wagonNumber,
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
          ...after,
          productBrand,
          moldingDate,
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
          concat_ws(' ', wagon_number, product_brand),
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
          wagon_number,
          product_brand,
          molding_date,
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
): FormedProductSampleSnapshot {
  return {
    sortingDate: formatDate(row.sorting_date),
    wagonNumber: row.wagon_number,
    productBrand: row.product_brand,
    moldingDate: formatOptionalDate(row.molding_date),
  };
}

function mapRecord(row: JournalRow): LaboratoryFormedProductSampleRecord {
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

function formatOptionalDate(value: Date | string | null) {
  return value === null ? null : formatDate(value);
}
