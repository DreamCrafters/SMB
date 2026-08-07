import { randomUUID } from "node:crypto";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import type {
  ProductBrandDeletionImpact,
  ProductBrandDeletionResult,
  ProductBrandFilters,
  ProductBrandMergeAlias,
  ProductBrandRecord,
  ProductBrandSubmission,
} from "../contracts/productBrands.js";
import type { DatabasePool } from "../db/pool.js";
import { acquireDatabaseMutationLock } from "../db/transactionContext.js";
import {
  mergeDispatcherProductionBrandReferences,
  mergeRefractoryReportBrandReferences,
  normalizeProductionBrandLookupLabel,
} from "../domain/productionBrand.js";
import {
  buildDispatcherSubmissionSummary,
  type DispatcherSubmissionPayload,
} from "../domain/dispatcherSubmission.js";
import { getDispatcherFormDefinition } from "../domain/dispatcherForms.js";
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

export class ProductBrandReplacementRequiredError extends Error {
  constructor() {
    super("A referenced product brand requires a replacement before deletion.");
    this.name = "ProductBrandReplacementRequiredError";
  }
}

export class ProductBrandReplacementNotFoundError extends Error {
  constructor() {
    super("The replacement product brand does not exist or is inactive.");
    this.name = "ProductBrandReplacementNotFoundError";
  }
}

export class ProductBrandSameReplacementError extends Error {
  constructor() {
    super("A product brand cannot replace itself.");
    this.name = "ProductBrandSameReplacementError";
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
  readDeletionImpact: (id: string) => Promise<ProductBrandDeletionImpact | undefined>;
  listMergeAliases: () => Promise<ProductBrandMergeAlias[]>;
  deleteRecord: (input: {
    id: string;
    replacementId?: string;
    deletedByUserId: string;
    deletedByAccountId: string;
    deletedByDisplayName: string;
  }) => Promise<ProductBrandDeletionResult | undefined>;
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
type BrandMergeRow = RowDataPacket & {
  id: string;
  name: string;
  merged_into_id: string | null;
};

type CountRow = RowDataPacket & { count: number | string };
type DispatcherBrandRow = RowDataPacket & {
  id: string;
  payload: unknown;
};
type RefractoryBrandRow = RowDataPacket & {
  id: string;
  report_type: string;
  payload: unknown;
};
type LaboratoryResultBrandRow = RowDataPacket & {
  id: string;
  payload: unknown;
};
type CurrentBankAssignmentRow = RowDataPacket & {
  bank_number: number;
  laboratory_result_id: string | null;
  sample_index: number | null;
  sample_identifier: string | null;
  bulk_density: number | string;
  bulk_density_source: string;
  bulk_density_sample_count: number | string | null;
};

type RepositoryOptions = {
  createId?: () => string;
  now?: () => Date;
  referenceLockPool?: DatabasePool;
};

export function createProductBrandsRepository(
  pool: DatabasePool,
  {
    createId = randomUUID,
    now = () => new Date(),
    referenceLockPool = pool,
  }: RepositoryOptions = {},
): ProductBrandsRepository {
  async function readLabels() {
    const [rows] = await pool.query<BrandLabelRow[]>(
      `select name, normalized_name
      from product_brands
      where deleted_at is null
      order by name asc`,
    );
    return rows;
  }

  async function readMergeAliases() {
    const [rows] = await pool.query<BrandMergeRow[]>(
      `select id, name, merged_into_id
      from product_brands`,
    );
    return buildTerminalMergeAliases(rows);
  }

  async function readDeletionUsageCount(
    source: Pick<ProductBrandRow, "id" | "name">,
    lockRows = false,
  ) {
    const sourceName = source.name;
    let usageCount = 0;
    for (const { table, column } of directBrandReferenceColumns) {
      const [rows] = await pool.query<CountRow[]>(
        `select count(*) as count
        from ${table}
        where ${column} = ?`,
        [sourceName],
      );
      usageCount += Number(rows[0]?.count ?? 0);
    }

    const [bankRows] = await pool.query<CountRow[]>(
      `select count(*) as count
      from laboratory_bank_assignments assignment
      join (
        select bank_number, max(sequence_id) as sequence_id
        from laboratory_bank_assignments
        group by bank_number
      ) current_assignment
        on current_assignment.sequence_id = assignment.sequence_id
      where assignment.material_label = ?`,
      [sourceName],
    );
    usageCount += Number(bankRows[0]?.count ?? 0);

    const lockClause = lockRows ? " for update" : "";
    const [dispatcherRows] = await pool.query<DispatcherBrandRow[]>(
      `select id, payload
      from dispatcher_submissions
      where form_id = 'production'${lockClause}`,
    );
    usageCount += dispatcherRows.filter((row) =>
      mergeDispatcherProductionBrandReferences(
        readStringPayload(row.payload),
        sourceName,
        sourceName,
      ).changed
    ).length;

    usageCount += await countCurrentRefractoryReferences(
      sourceName,
      sourceName,
    );
    return usageCount;
  }

  async function mergeReferences(
    sourceName: string,
    replacementName: string,
    actor: {
      userId: string;
      accountId: string;
      displayName: string;
    },
  ) {
    let updatedRecords = 0;
    for (const { table, column } of directBulkBrandReferenceColumns) {
      const [result] = await pool.query<ResultSetHeader>(
        `update ${table}
        set ${column} = ?
        where ${column} = ?`,
        [replacementName, sourceName],
      );
      updatedRecords += result.affectedRows;
    }

    const [bankAssignments] = await pool.query<CurrentBankAssignmentRow[]>(
      `select
        assignment.bank_number,
        assignment.laboratory_result_id,
        assignment.sample_index,
        assignment.sample_identifier,
        assignment.bulk_density,
        assignment.bulk_density_source,
        assignment.bulk_density_sample_count
      from laboratory_bank_assignments assignment
      join (
        select bank_number, max(sequence_id) as sequence_id
        from laboratory_bank_assignments
        group by bank_number
      ) current_assignment
        on current_assignment.sequence_id = assignment.sequence_id
      where assignment.material_label = ?
      for update`,
      [sourceName],
    );
    for (const assignment of bankAssignments) {
      await pool.query(
        `insert into laboratory_bank_assignments (
          id,
          bank_number,
          laboratory_result_id,
          sample_index,
          sample_identifier,
          material_label,
          bulk_density,
          bulk_density_source,
          bulk_density_sample_count,
          assigned_by_user_id,
          assigned_by_account_id,
          assigned_by_display_name,
          assigned_at
        ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          createId(),
          assignment.bank_number,
          assignment.laboratory_result_id,
          assignment.sample_index,
          assignment.sample_identifier,
          replacementName,
          assignment.bulk_density,
          assignment.bulk_density_source,
          assignment.bulk_density_sample_count,
          actor.userId,
          actor.accountId,
          actor.displayName,
          now().toISOString(),
        ],
      );
      updatedRecords += 1;
    }

    const [laboratoryRows] = await pool.query<LaboratoryResultBrandRow[]>(
      `select id, payload
      from laboratory_results
      where product_brand = ?
      for update`,
      [sourceName],
    );
    for (const row of laboratoryRows) {
      const payload = readJsonRecord(row.payload);
      await pool.query(
        `update laboratory_results
        set product_brand = ?, payload = ?
        where id = ?`,
        [
          replacementName,
          JSON.stringify({ ...payload, productBrand: replacementName }),
          row.id,
        ],
      );
      updatedRecords += 1;
    }

    const [dispatcherRows] = await pool.query<DispatcherBrandRow[]>(
      `select id, payload
      from dispatcher_submissions
      where form_id = 'production'
      for update`,
    );
    const productionForm = getDispatcherFormDefinition("production");
    for (const row of dispatcherRows) {
      const result = mergeDispatcherProductionBrandReferences(
        readStringPayload(row.payload),
        sourceName,
        replacementName,
      );
      if (!result.changed) continue;
      await pool.query(
        `update dispatcher_submissions
        set payload = ?, summary = ?
        where id = ?`,
        [
          JSON.stringify(result.payload),
          productionForm === undefined
            ? "Запись без краткого описания"
            : buildDispatcherSubmissionSummary(productionForm, result.payload),
          row.id,
        ],
      );
      updatedRecords += 1;
    }

    updatedRecords += await countCurrentRefractoryReferences(
      sourceName,
      replacementName,
    );
    return updatedRecords;
  }

  async function countCurrentRefractoryReferences(
    sourceName: string,
    replacementName: string,
  ) {
    const [rows] = await pool.query<RefractoryBrandRow[]>(
      `select revisions.id, revisions.report_type, revisions.payload
      from refractory_report_revisions revisions
      where not exists (
        select 1
        from refractory_report_revisions newer
        where newer.report_type = revisions.report_type
          and newer.report_date = revisions.report_date
          and newer.shift_number = revisions.shift_number
          and newer.revision_number > revisions.revision_number
      ) or (
        revisions.report_type = 'cosh'
        and revisions.status = 'approved'
        and not exists (
          select 1
          from refractory_report_revisions newer_approved
          where newer_approved.report_type = revisions.report_type
            and newer_approved.report_date = revisions.report_date
            and newer_approved.status = 'approved'
            and (
              newer_approved.shift_number > revisions.shift_number
              or (
                newer_approved.shift_number = revisions.shift_number
                and newer_approved.revision_number > revisions.revision_number
              )
            )
        )
      )`,
    );
    const aliases = await readMergeAliases();
    return rows.filter((row) =>
      mergeRefractoryReportBrandReferences(
        row.report_type,
        aliases.reduce<unknown>((payload, alias) =>
          mergeRefractoryReportBrandReferences(
            row.report_type,
            payload,
            alias.sourceName,
            alias.replacementName,
          ).payload, readJsonValue(row.payload)),
        sourceName,
        replacementName,
      ).changed
    ).length;
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
    acquireReferenceMutationLock(signal) {
      return acquireDatabaseMutationLock({
        pool: referenceLockPool,
        lockName: "smb:product_brand_references",
        signal,
      });
    },

    async list() {
      return (await readLabels()).map((row) => row.name);
    },

    async listRecords(filters = {}) {
      const query = filters.query?.trim();
      const where = query === undefined || query === ""
        ? "where deleted_at is null"
        : `where deleted_at is null and instr(
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
        where id = ? and deleted_at is null
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

    async readDeletionImpact(id) {
      const [rows] = await pool.query<ProductBrandRow[]>(
        `${productBrandRecordSelect}
        where id = ? and deleted_at is null
        limit 1`,
        [id],
      );
      const source = rows[0];
      if (source === undefined) return undefined;
      return { usageCount: await readDeletionUsageCount(source) };
    },

    async listMergeAliases() {
      return readMergeAliases();
    },

    async deleteRecord({
      id,
      replacementId,
      deletedByUserId,
      deletedByAccountId,
      deletedByDisplayName,
    }) {
      if (replacementId === id) throw new ProductBrandSameReplacementError();
      const [rows] = replacementId === undefined
        ? await pool.query<ProductBrandRow[]>(
            `${productBrandRecordSelect}
            where id = ? and deleted_at is null
            limit 1
            for update`,
            [id],
          )
        : await pool.query<ProductBrandRow[]>(
            `${productBrandRecordSelect}
            where id in (?, ?) and deleted_at is null
            order by id asc
            for update`,
            [id, replacementId],
          );
      const source = rows.find((row) => row.id === id);
      if (source === undefined) return undefined;
      const replacement = replacementId === undefined
        ? undefined
        : rows.find((row) => row.id === replacementId);
      if (replacementId !== undefined && replacement === undefined) {
        throw new ProductBrandReplacementNotFoundError();
      }

      const updatedRecords = replacement === undefined
        ? 0
        : await mergeReferences(source.name, replacement.name, {
            userId: deletedByUserId,
            accountId: deletedByAccountId,
            displayName: deletedByDisplayName,
          });
      if (
        replacement === undefined &&
        await readDeletionUsageCount(source, true) > 0
      ) {
        throw new ProductBrandReplacementRequiredError();
      }

      const deletedAt = now().toISOString();
      await pool.query(
        `update product_brands
        set deleted_at = ?, merged_into_id = ?, updated_at = ?
        where id = ? and deleted_at is null`,
        [
          deletedAt,
          replacement?.id ?? null,
          deletedAt,
          source.id,
        ],
      );
      return {
        sourceId: source.id,
        sourceName: source.name,
        ...(replacement === undefined
          ? {}
          : {
              replacementId: replacement.id,
              replacementName: replacement.name,
            }),
        updatedRecords,
      };
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

const productBrandRecordSelect = `select
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
from product_brands`;

const directBrandReferenceColumns = [
  { table: "rotary_kiln_2_firing_journal", column: "produced_material" },
  { table: "laboratory_unshaped_product_sample_journal", column: "product_name" },
  { table: "laboratory_results", column: "product_brand" },
  { table: "refractory_wagons", column: "product_brand" },
  { table: "laboratory_green_product_quality_journal", column: "product_brand" },
] as const;

const directBulkBrandReferenceColumns = directBrandReferenceColumns.filter(
  ({ table }) => table !== "laboratory_results",
);

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

function readJsonValue(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
}

function readJsonRecord(value: unknown): Record<string, unknown> {
  const parsed = readJsonValue(value);
  return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
    ? parsed as Record<string, unknown>
    : {};
}

function readStringPayload(value: unknown): DispatcherSubmissionPayload {
  const parsed = readJsonRecord(value);
  return Object.fromEntries(Object.entries(parsed).filter(
    (entry): entry is [string, string] => typeof entry[1] === "string",
  ));
}

function buildTerminalMergeAliases(
  rows: readonly BrandMergeRow[],
): ProductBrandMergeAlias[] {
  const rowById = new Map(rows.map((row) => [row.id, row]));
  return rows.flatMap((source) => {
    if (source.merged_into_id === null) return [];
    const visited = new Set([source.id]);
    let target = rowById.get(source.merged_into_id);
    while (target !== undefined && target.merged_into_id !== null) {
      if (visited.has(target.id)) return [];
      visited.add(target.id);
      target = rowById.get(target.merged_into_id);
    }
    return target === undefined
      ? []
      : [{ sourceName: source.name, replacementName: target.name }];
  });
}
