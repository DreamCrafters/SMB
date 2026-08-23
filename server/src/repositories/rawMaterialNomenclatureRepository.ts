import { randomUUID } from "node:crypto";
import type { RowDataPacket } from "mysql2/promise";
import type {
  RawMaterialNomenclatureCorrectionResult,
  RawMaterialNomenclatureFilters,
  RawMaterialNomenclatureRecord,
  RawMaterialNomenclatureSubmission,
} from "../contracts/rawMaterialNomenclature.js";
import type { DatabasePool } from "../db/pool.js";
import type { ValidatedRawMaterialNomenclatureSubmission } from "../domain/rawMaterialNomenclature.js";

export class RawMaterialNomenclatureNameAlreadyExistsError extends Error {
  constructor() {
    super("Сырьё с таким наименованием уже есть в номенклатуре.");
    this.name = "RawMaterialNomenclatureNameAlreadyExistsError";
  }
}

export type RawMaterialNomenclatureRepository = {
  /** Наименования для выпадающих списков журналов. */
  listLabels: () => Promise<string[]>;
  listRecords: (
    filters?: RawMaterialNomenclatureFilters,
  ) => Promise<RawMaterialNomenclatureRecord[]>;
  createRecord: (input: {
    record: ValidatedRawMaterialNomenclatureSubmission;
    submittedByUserId: string;
    submittedByAccountId: string;
  }) => Promise<RawMaterialNomenclatureRecord>;
  updateRecord: (input: {
    id: string;
    record: ValidatedRawMaterialNomenclatureSubmission;
    correctedByUserId: string;
    correctedByAccountId: string;
    correctedByDisplayName: string;
  }) => Promise<RawMaterialNomenclatureCorrectionResult | undefined>;
};

type RawMaterialRow = {
  id: string;
  name: string;
  description: string | null;
  product_class: string | null;
  application_industry: string | null;
  normative_document: string | null;
  al2o3: string | null;
  fe2o3: string | null;
  created_at: Date | string;
  updated_at: Date | string;
} & RowDataPacket;

type RepositoryOptions = {
  createId?: () => string;
  now?: () => Date;
};

const recordSelect = `select
    id,
    name,
    description,
    product_class,
    application_industry,
    normative_document,
    al2o3,
    fe2o3,
    created_at,
    updated_at
  from laboratory_raw_material_nomenclature`;

export function createRawMaterialNomenclatureRepository(
  pool: DatabasePool,
  { createId = randomUUID, now = () => new Date() }: RepositoryOptions = {},
): RawMaterialNomenclatureRepository {
  return {
    async listLabels() {
      const [rows] = await pool.query<RawMaterialRow[]>(
        `select name from laboratory_raw_material_nomenclature order by name asc`,
      );
      return rows.map((row) => row.name);
    },

    async listRecords(filters = {}) {
      const query = filters.query?.trim();
      const where = query === undefined || query === ""
        ? ""
        : `where instr(
          concat_ws(
            ' ',
            name,
            description,
            product_class,
            application_industry,
            normative_document,
            al2o3,
            fe2o3
          ),
          ?
        ) > 0`;
      const [rows] = await pool.query<RawMaterialRow[]>(
        `${recordSelect}
        ${where}
        order by name asc`,
        query === undefined || query === "" ? [] : [query],
      );
      return rows.map(mapRow);
    },

    async createRecord(input) {
      const id = createId();
      const timestamp = now().toISOString();
      const record = input.record;

      try {
        await pool.query(
          `insert into laboratory_raw_material_nomenclature (
            id,
            name,
            normalized_name,
            description,
            product_class,
            application_industry,
            normative_document,
            al2o3,
            fe2o3,
            submitted_by_user_id,
            submitted_by_account_id,
            created_at,
            updated_at
          ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            id,
            record.name,
            record.normalizedName,
            nullable(record.description),
            nullable(record.productClass),
            nullable(record.applicationIndustry),
            nullable(record.normativeDocument),
            nullable(record.al2o3),
            nullable(record.fe2o3),
            input.submittedByUserId,
            input.submittedByAccountId,
            timestamp,
            timestamp,
          ],
        );
      } catch (error) {
        if (isDuplicateEntryError(error)) {
          throw new RawMaterialNomenclatureNameAlreadyExistsError();
        }
        throw error;
      }

      return {
        id,
        ...toSubmission(record),
        createdAt: timestamp,
        updatedAt: timestamp,
      };
    },

    async updateRecord(input) {
      const [rows] = await pool.query<RawMaterialRow[]>(
        `${recordSelect}
        where id = ?
        limit 1
        for update`,
        [input.id],
      );
      const row = rows[0];
      if (row === undefined) return undefined;

      const before = mapRow(row);
      const updatedAt = now().toISOString();
      const next = input.record;

      try {
        await pool.query(
          `update laboratory_raw_material_nomenclature
          set name = ?,
            normalized_name = ?,
            description = ?,
            product_class = ?,
            application_industry = ?,
            normative_document = ?,
            al2o3 = ?,
            fe2o3 = ?,
            updated_at = ?
          where id = ?`,
          [
            next.name,
            next.normalizedName,
            nullable(next.description),
            nullable(next.productClass),
            nullable(next.applicationIndustry),
            nullable(next.normativeDocument),
            nullable(next.al2o3),
            nullable(next.fe2o3),
            updatedAt,
            input.id,
          ],
        );
      } catch (error) {
        if (isDuplicateEntryError(error)) {
          throw new RawMaterialNomenclatureNameAlreadyExistsError();
        }
        throw error;
      }

      const record: RawMaterialNomenclatureRecord = {
        id: input.id,
        ...toSubmission(next),
        createdAt: before.createdAt,
        updatedAt,
      };
      await pool.query(
        `insert into laboratory_raw_material_nomenclature_revisions (
          id,
          raw_material_id,
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
          updatedAt,
        ],
      );
      return { before, record };
    },
  };
}

function mapRow(row: RawMaterialRow): RawMaterialNomenclatureRecord {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? "",
    productClass: row.product_class ?? "",
    applicationIndustry: row.application_industry ?? "",
    normativeDocument: row.normative_document ?? "",
    al2o3: row.al2o3 ?? "",
    fe2o3: row.fe2o3 ?? "",
    createdAt: formatTimestamp(row.created_at),
    updatedAt: formatTimestamp(row.updated_at),
  };
}

function toSubmission(
  value: ValidatedRawMaterialNomenclatureSubmission,
): RawMaterialNomenclatureSubmission {
  const { normalizedName: _normalizedName, ...submission } = value;
  return submission;
}

function nullable(value: string) {
  return value === "" ? null : value;
}

function formatTimestamp(value: Date | string) {
  return value instanceof Date ? value.toISOString() : String(value);
}

function isDuplicateEntryError(error: unknown) {
  return error instanceof Error &&
    "code" in error &&
    error.code === "ER_DUP_ENTRY";
}
