import { randomUUID } from "node:crypto";
import type { RowDataPacket } from "mysql2/promise";
import type { DatabasePool } from "../db/pool.js";
import {
  isProductionBrandCategory,
  normalizeProductionBrandLookupLabel,
  type ProductionBrandCategory,
  type ProductionBrandLabelInput,
} from "../domain/productionBrand.js";

export type ProductionBrandLabel = {
  id: string;
  category: ProductionBrandCategory;
  label: string;
  createdAt: string;
};

export type ProductionBrandsRepository = {
  list: () => Promise<ProductionBrandLabel[]>;
  resolveReferences: (
    references: ProductionBrandReferenceInput[],
  ) => Promise<ProductionBrandReferenceResolution>;
  create: (
    input: ProductionBrandLabelInput & { createdByUserId: string },
  ) => Promise<{ label: ProductionBrandLabel; created: boolean }>;
};

export type ProductionBrandReferenceInput = {
  category: ProductionBrandCategory;
  fieldName: string;
  label: string;
};

export type ProductionBrandReferenceResolution =
  | {
      ok: true;
      references: Array<{ fieldName: string; label: string }>;
    }
  | {
      ok: false;
      missing: ProductionBrandReferenceInput;
    };

type ProductionBrandRow = RowDataPacket & {
  id: string;
  category: string;
  label: string;
  created_at: Date | string;
};

type ProductionBrandResolutionRow = RowDataPacket & {
  id: string;
  category: string;
  label: string;
  normalized_label: string;
};

export function createProductionBrandsRepository(
  pool: DatabasePool,
  { createId = randomUUID }: { createId?: () => string } = {},
): ProductionBrandsRepository {
  async function list() {
    const [rows] = await pool.query<ProductionBrandRow[]>(`
      select id, category, label, created_at
      from production_brand_labels
      order by category, label, id
    `);

    return rows.map(mapProductionBrandRow);
  }

  async function create(
    input: ProductionBrandLabelInput & { createdByUserId: string },
  ) {
    const id = createId();

    let created = true;

    try {
      await pool.query(
        `insert into production_brand_labels (
          id, category, label, normalized_label, created_by_user_id
        ) values (?, ?, ?, ?, ?)`,
        [
          id,
          input.category,
          input.label,
          input.normalizedLabel,
          input.createdByUserId,
        ],
      );
    } catch (error) {
      if (!isDuplicateKeyError(error)) throw error;
      created = false;
    }

    const [rows] = await pool.query<ProductionBrandRow[]>(`
      select id, category, label, created_at
      from production_brand_labels
      where category = ? and normalized_label = ?
      limit 1
    `, [input.category, input.normalizedLabel]);
    const row = rows[0];

    if (row === undefined) {
      throw new Error("Created production brand label was not found.");
    }

    return {
      label: mapProductionBrandRow(row),
      created,
    };
  }

  async function resolveReferences(
    references: ProductionBrandReferenceInput[],
  ): Promise<ProductionBrandReferenceResolution> {
    if (references.length === 0) {
      return { ok: true, references: [] };
    }

    const referenceKeys = Array.from(
      new Map(
        references.map((reference) => [
          productionBrandReferenceKey(reference.category, reference.label),
          {
            category: reference.category,
            normalizedLabel: normalizeProductionBrandLookupLabel(reference.label),
          },
        ]),
      ).values(),
    );
    const whereClause = referenceKeys
      .map(() => "(category = ? and normalized_label = ?)")
      .join(" or ");
    const [candidateRows] = await pool.query<Array<RowDataPacket & { id: string }>>(
      `select id from production_brand_labels where ${whereClause}`,
      referenceKeys.flatMap((reference) => [
        reference.category,
        reference.normalizedLabel,
      ]),
    );
    const ids = candidateRows.map((row) => row.id).sort();
    let lockedRows: ProductionBrandResolutionRow[] = [];

    if (ids.length > 0) {
      const placeholders = ids.map(() => "?").join(", ");
      [lockedRows] = await pool.query<ProductionBrandResolutionRow[]>(
        `select id, category, label, normalized_label
         from production_brand_labels
         where id in (${placeholders})
         order by id
         for update`,
        ids,
      );
    }

    const rowByKey = new Map(
      lockedRows.map((row) => [
        `${row.category}:${row.normalized_label}`,
        row,
      ]),
    );
    const missing = references.find(
      (reference) =>
        !rowByKey.has(
          productionBrandReferenceKey(reference.category, reference.label),
        ),
    );

    if (missing !== undefined) {
      return { ok: false, missing };
    }

    return {
      ok: true,
      references: references.map((reference) => ({
        fieldName: reference.fieldName,
        label: rowByKey.get(
          productionBrandReferenceKey(reference.category, reference.label),
        )?.label ?? reference.label,
      })),
    };
  }

  return { list, resolveReferences, create };
}

function productionBrandReferenceKey(
  category: ProductionBrandCategory,
  label: string,
) {
  return `${category}:${normalizeProductionBrandLookupLabel(label)}`;
}

function isDuplicateKeyError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ER_DUP_ENTRY"
  );
}

function mapProductionBrandRow(row: ProductionBrandRow): ProductionBrandLabel {
  if (!isProductionBrandCategory(row.category)) {
    throw new Error("Stored production brand category is invalid.");
  }

  return {
    id: row.id,
    category: row.category,
    label: row.label,
    createdAt: new Date(row.created_at).toISOString(),
  };
}
