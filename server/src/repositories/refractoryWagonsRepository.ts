import { randomUUID } from "node:crypto";
import type { RowDataPacket } from "mysql2/promise";
import type {
  RefractoryWagonRecord,
  RefractoryWagonSubmission,
} from "../contracts/refractoryWagons.js";
import type { DatabasePool } from "../db/pool.js";

export class RefractoryWagonNumberAlreadyExistsError extends Error {
  constructor() {
    super("A refractory wagon with this number already exists.");
    this.name = "RefractoryWagonNumberAlreadyExistsError";
  }
}

export type RefractoryWagonsRepository = {
  create: (input: {
    wagon: RefractoryWagonSubmission;
    submittedByUserId: string;
    submittedByAccountId: string;
  }) => Promise<RefractoryWagonRecord>;
  list: () => Promise<RefractoryWagonRecord[]>;
  update: (input: {
    id: string;
    wagon: RefractoryWagonSubmission;
    correctedByUserId: string;
    correctedByAccountId: string;
    correctedByDisplayName: string;
  }) => Promise<RefractoryWagonCorrectionResult | undefined>;
};

export type RefractoryWagonCorrectionResult = {
  before: RefractoryWagonRecord;
  record: RefractoryWagonRecord;
};

type WagonRow = RowDataPacket & {
  id: string;
  wagon_number: string;
  loading_date: Date | string | null;
  product_brand: string | null;
  raw_control_date: Date | string | null;
  created_at: Date | string;
};

type RepositoryOptions = {
  createId?: () => string;
  now?: () => Date;
};

export function createRefractoryWagonsRepository(
  pool: DatabasePool,
  {
    createId = randomUUID,
    now = () => new Date(),
  }: RepositoryOptions = {},
): RefractoryWagonsRepository {
  return {
    async create(input) {
      const id = createId();
      const createdAt = now().toISOString();
      try {
        await pool.query(
          `insert into refractory_wagons (
            id,
            wagon_number,
            loading_date,
            product_brand,
            submitted_by_user_id,
            submitted_by_account_id,
            created_at
          ) values (?, ?, ?, ?, ?, ?, ?)`,
          [
            id,
            input.wagon.number,
            input.wagon.loadingDate,
            input.wagon.productBrand,
            input.submittedByUserId,
            input.submittedByAccountId,
            createdAt,
          ],
        );
      } catch (error) {
        if (isDuplicateEntryError(error)) {
          throw new RefractoryWagonNumberAlreadyExistsError();
        }
        throw error;
      }

      return {
        id,
        ...input.wagon,
        rawControlDate: null,
        createdAt,
      };
    },

    async list() {
      const [rows] = await pool.query<WagonRow[]>(
        `select
          id,
          wagon_number,
          loading_date,
          product_brand,
          raw_control_date,
          created_at
        from refractory_wagons
        order by sequence_id desc`,
      );
      return rows.map(mapWagonRow);
    },

    async update(input) {
      const [rows] = await pool.query<WagonRow[]>(
        `select
          id,
          wagon_number,
          loading_date,
          product_brand,
          raw_control_date,
          created_at
        from refractory_wagons
        where id = ?
        limit 1
        for update`,
        [input.id],
      );
      const row = rows[0];
      if (row === undefined) return undefined;

      const before = mapWagonRow(row);
      try {
        await pool.query(
          `update refractory_wagons
          set wagon_number = ?, loading_date = ?, product_brand = ?
          where id = ?`,
          [
            input.wagon.number,
            input.wagon.loadingDate,
            input.wagon.productBrand,
            input.id,
          ],
        );
      } catch (error) {
        if (isDuplicateEntryError(error)) {
          throw new RefractoryWagonNumberAlreadyExistsError();
        }
        throw error;
      }

      const record: RefractoryWagonRecord = {
        ...before,
        ...input.wagon,
      };
      await pool.query(
        `insert into refractory_wagon_revisions (
          id,
          wagon_id,
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
          JSON.stringify(record),
          input.correctedByUserId,
          input.correctedByAccountId,
          input.correctedByDisplayName,
          now().toISOString(),
        ],
      );

      return { before, record };
    },
  };
}

function mapWagonRow(row: WagonRow): RefractoryWagonRecord {
  return {
    id: row.id,
    number: row.wagon_number,
    loadingDate: formatOptionalCalendarDate(row.loading_date),
    productBrand: row.product_brand,
    rawControlDate: formatOptionalCalendarDate(row.raw_control_date),
    createdAt: row.created_at instanceof Date
      ? row.created_at.toISOString()
      : String(row.created_at),
  };
}

function formatOptionalCalendarDate(value: Date | string | null) {
  if (value === null) return null;
  return value instanceof Date
    ? value.toISOString().slice(0, 10)
    : String(value).slice(0, 10);
}

function isDuplicateEntryError(error: unknown) {
  return error instanceof Error &&
    "code" in error &&
    error.code === "ER_DUP_ENTRY";
}
