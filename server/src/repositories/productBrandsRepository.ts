import { randomUUID } from "node:crypto";
import type { RowDataPacket } from "mysql2/promise";
import type {
  ProductBrandFilters,
  ProductBrandRecord,
  ProductBrandSubmission,
} from "../contracts/productBrands.js";
import type { DatabasePool } from "../db/pool.js";
import {
  normalizeProductionBrandLookupLabel,
} from "../domain/productionBrand.js";
import type {
  ProductionBrandReference,
  ProductionBrandResolution,
  ProductionBrandsDataSource,
} from "../domain/productionBrandsDataSource.js";
import type { ValidatedProductBrandSubmission } from "../domain/productBrandJournal.js";

export class ProductBrandNameAlreadyExistsError extends Error {
  constructor() {
    super("A product brand with this normalized name already exists.");
    this.name = "ProductBrandNameAlreadyExistsError";
  }
}

export type ProductBrandsRepository = ProductionBrandsDataSource & {
  listRecords: (filters?: ProductBrandFilters) => Promise<ProductBrandRecord[]>;
  createRecord: (input: {
    record: ValidatedProductBrandSubmission;
    submittedByUserId: string;
    submittedByAccountId: string;
  }) => Promise<ProductBrandRecord>;
  updateRecord: (input: {
    id: string;
    record: ValidatedProductBrandSubmission;
    correctedByUserId: string;
    correctedByAccountId: string;
    correctedByDisplayName: string;
  }) => Promise<ProductBrandCorrectionResult | undefined>;
};

export type ProductBrandCorrectionResult = {
  before: ProductBrandRecord;
  record: ProductBrandRecord;
};

type ProductBrandRow = RowDataPacket & {
  id: string;
  name: string;
  normalized_name: string;
  description: string | null;
  product_class: string | null;
  application_industry: string | null;
  normative_document: string | null;
  geometry: string | null;
  al2o3: string | null;
  fe2o3: string | null;
  strength: string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

type BrandLabelRow = RowDataPacket & {
  name: string;
  normalized_name: string;
};

type RepositoryOptions = {
  createId?: () => string;
  now?: () => Date;
};

export function createProductBrandsRepository(
  pool: DatabasePool,
  {
    createId = randomUUID,
    now = () => new Date(),
  }: RepositoryOptions = {},
): ProductBrandsRepository {
  async function readLabels() {
    const [rows] = await pool.query<BrandLabelRow[]>(
      `select name, normalized_name
      from product_brands
      order by name asc`,
    );
    return rows;
  }

  async function createRecord(input: {
    record: ValidatedProductBrandSubmission;
    submittedByUserId: string;
    submittedByAccountId: string;
  }) {
    const id = createId();
    const timestamp = now().toISOString();
    const record = input.record;

    try {
      await pool.query(
        `insert into product_brands (
          id,
          name,
          normalized_name,
          description,
          product_class,
          application_industry,
          normative_document,
          geometry,
          al2o3,
          fe2o3,
          strength,
          submitted_by_user_id,
          submitted_by_account_id,
          created_at,
          updated_at
        ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          record.name,
          record.normalizedName,
          nullable(record.description),
          nullable(record.productClass),
          nullable(record.applicationIndustry),
          nullable(record.normativeDocument),
          nullable(record.geometry),
          nullable(record.al2o3),
          nullable(record.fe2o3),
          nullable(record.strength),
          input.submittedByUserId,
          input.submittedByAccountId,
          timestamp,
          timestamp,
        ],
      );
    } catch (error) {
      if (isDuplicateEntryError(error)) {
        throw new ProductBrandNameAlreadyExistsError();
      }
      throw error;
    }

    return {
      id,
      ...toSubmission(record),
      createdAt: timestamp,
      updatedAt: timestamp,
    };
  }

  return {
    async list() {
      return (await readLabels()).map((row) => row.name);
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
            geometry,
            al2o3,
            fe2o3,
            strength
          ),
          ?
        ) > 0`;
      const [rows] = await pool.query<ProductBrandRow[]>(
        `select
          id,
          name,
          normalized_name,
          description,
          product_class,
          application_industry,
          normative_document,
          geometry,
          al2o3,
          fe2o3,
          strength,
          created_at,
          updated_at
        from product_brands
        ${where}
        order by name asc`,
        query === undefined || query === "" ? [] : [query],
      );
      return rows.map(mapProductBrandRow);
    },

    createRecord,

    async updateRecord(input) {
      const [rows] = await pool.query<ProductBrandRow[]>(
        `select
          id,
          name,
          normalized_name,
          description,
          product_class,
          application_industry,
          normative_document,
          geometry,
          al2o3,
          fe2o3,
          strength,
          created_at,
          updated_at
        from product_brands
        where id = ?
        limit 1
        for update`,
        [input.id],
      );
      const row = rows[0];
      if (row === undefined) return undefined;

      const before = mapProductBrandRow(row);
      const updatedAt = now().toISOString();
      const next = input.record;

      try {
        await pool.query(
          `update product_brands
          set name = ?,
            normalized_name = ?,
            description = ?,
            product_class = ?,
            application_industry = ?,
            normative_document = ?,
            geometry = ?,
            al2o3 = ?,
            fe2o3 = ?,
            strength = ?,
            updated_at = ?
          where id = ?`,
          [
            next.name,
            next.normalizedName,
            nullable(next.description),
            nullable(next.productClass),
            nullable(next.applicationIndustry),
            nullable(next.normativeDocument),
            nullable(next.geometry),
            nullable(next.al2o3),
            nullable(next.fe2o3),
            nullable(next.strength),
            updatedAt,
            input.id,
          ],
        );
      } catch (error) {
        if (isDuplicateEntryError(error)) {
          throw new ProductBrandNameAlreadyExistsError();
        }
        throw error;
      }

      const record: ProductBrandRecord = {
        id: input.id,
        ...toSubmission(next),
        createdAt: before.createdAt,
        updatedAt,
      };
      await pool.query(
        `insert into product_brand_revisions (
          id,
          product_brand_id,
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

    async resolveReferences(references: ProductionBrandReference[]): Promise<ProductionBrandResolution> {
      const labels = await readLabels();
      const labelByKey = new Map(
        labels.map((row) => [row.normalized_name, row.name]),
      );
      const missing = references.find((reference) =>
        !labelByKey.has(normalizeProductionBrandLookupLabel(reference.label))
      );
      if (missing !== undefined) return { ok: false, missing };
      return {
        ok: true,
        references: references.map((reference) => ({
          fieldName: reference.fieldName,
          label:
            labelByKey.get(normalizeProductionBrandLookupLabel(reference.label)) ??
              reference.label,
        })),
      };
    },

  };
}

function mapProductBrandRow(row: ProductBrandRow): ProductBrandRecord {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? "",
    productClass: row.product_class ?? "",
    applicationIndustry: row.application_industry ?? "",
    normativeDocument: row.normative_document ?? "",
    geometry: row.geometry ?? "",
    al2o3: row.al2o3 ?? "",
    fe2o3: row.fe2o3 ?? "",
    strength: row.strength ?? "",
    createdAt: formatTimestamp(row.created_at),
    updatedAt: formatTimestamp(row.updated_at),
  };
}

function toSubmission(
  value: ValidatedProductBrandSubmission,
): ProductBrandSubmission {
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
