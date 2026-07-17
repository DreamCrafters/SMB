import { randomUUID } from "node:crypto";
import type { RowDataPacket } from "mysql2/promise";
import type { DatabasePool } from "../db/pool.js";
import type {
  ProductionBrandCategory,
  ProductionBrandLabelInput,
} from "../domain/productionBrand.js";
import { isProductionBrandCategory } from "../domain/productionBrand.js";

export type ProductionBrandLabel = {
  id: string;
  category: ProductionBrandCategory;
  label: string;
  createdAt: string;
};

export type ProductionBrandsRepository = {
  list: () => Promise<ProductionBrandLabel[]>;
  create: (
    input: ProductionBrandLabelInput & { createdByUserId: string },
  ) => Promise<{ label: ProductionBrandLabel; created: boolean }>;
};

type ProductionBrandRow = RowDataPacket & {
  id: string;
  category: string;
  label: string;
  created_at: Date | string;
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

  return { list, create };
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
