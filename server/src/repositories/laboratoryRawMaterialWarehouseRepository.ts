import { randomUUID } from "node:crypto";
import type { RowDataPacket } from "mysql2/promise";
import type {
  LaboratoryRawMaterialWarehouseFilters,
  LaboratoryRawMaterialWarehouseOptions,
  LaboratoryRawMaterialWarehouseRecord,
  LaboratoryRawMaterialWarehouseSubmission,
  LaboratoryRawMaterialWarehouseTotals,
} from "../contracts/laboratoryRawMaterialWarehouse.js";
import type { DatabasePool } from "../db/pool.js";
import { escapeLikePattern } from "./laboratoryResultsRepository.js";

export class LaboratoryRawMaterialWarehouseAlreadyReviewedError extends Error {
  constructor() {
    super("This raw material warehouse movement has already been reviewed.");
    this.name = "LaboratoryRawMaterialWarehouseAlreadyReviewedError";
  }
}

export class LaboratoryRawMaterialWarehouseSelfReviewError extends Error {
  constructor() {
    super("An author cannot review their own pending movement.");
    this.name = "LaboratoryRawMaterialWarehouseSelfReviewError";
  }
}

type ReviewInput = {
  id: string;
  action: "approve" | "correct";
  record?: LaboratoryRawMaterialWarehouseSubmission;
  reviewerUserId: string;
  reviewerAccountId: string;
  reviewerDisplayName: string;
};

export type LaboratoryRawMaterialWarehouseReviewResult = {
  before: LaboratoryRawMaterialWarehouseRecord;
  record: LaboratoryRawMaterialWarehouseRecord;
};

export type LaboratoryRawMaterialWarehouseRepository = {
  submit: (input: {
    record: LaboratoryRawMaterialWarehouseSubmission;
    submittedByUserId: string;
    submittedByAccountId: string;
    submittedByDisplayName: string;
  }) => Promise<LaboratoryRawMaterialWarehouseRecord>;
  review: (
    input: ReviewInput,
  ) => Promise<LaboratoryRawMaterialWarehouseReviewResult | undefined>;
  list: (filters?: LaboratoryRawMaterialWarehouseFilters) => Promise<{
    records: LaboratoryRawMaterialWarehouseRecord[];
    totals: LaboratoryRawMaterialWarehouseTotals;
  }>;
  listPending: () => Promise<LaboratoryRawMaterialWarehouseRecord[]>;
  listOptions: () => Promise<LaboratoryRawMaterialWarehouseOptions>;
};

type WarehouseRevisionRow = RowDataPacket & {
  id: string;
  entry_id: string;
  revision_number: number;
  status: "pending" | "approved" | "corrected";
  movement_date: Date | string;
  material_label: string;
  stack_location: string;
  received_tons: number | string;
  supplier: string | null;
  shipped_tons: number | string;
  recipient: string | null;
  submitted_by_user_id: string;
  submitted_by_account_id: string;
  submitted_by_display_name: string;
  submitted_at: Date | string;
  reviewed_by_user_id: string | null;
  reviewed_by_account_id: string | null;
  reviewed_by_display_name: string | null;
  reviewed_at: Date | string | null;
};

type WarehouseTotalsRow = RowDataPacket & {
  record_count: number | string;
  received_tons: number | string;
  shipped_tons: number | string;
  balance_tons: number | string;
};

type WarehouseOptionRow = RowDataPacket & { option_value: string };

type RepositoryOptions = {
  createId?: () => string;
  now?: () => Date;
};

const revisionFields = `
  revisions.id,
  revisions.entry_id,
  revisions.revision_number,
  revisions.status,
  revisions.movement_date,
  revisions.material_label,
  revisions.stack_location,
  revisions.received_tons,
  revisions.supplier,
  revisions.shipped_tons,
  revisions.recipient,
  revisions.submitted_by_user_id,
  revisions.submitted_by_account_id,
  revisions.submitted_by_display_name,
  revisions.submitted_at,
  revisions.reviewed_by_user_id,
  revisions.reviewed_by_account_id,
  revisions.reviewed_by_display_name,
  revisions.reviewed_at
`;

const latestRevisionCondition = `not exists (
  select 1
  from laboratory_raw_material_warehouse_revisions newer
  where newer.entry_id = revisions.entry_id
    and newer.revision_number > revisions.revision_number
)`;

export function createLaboratoryRawMaterialWarehouseRepository(
  pool: DatabasePool,
  {
    createId = randomUUID,
    now = () => new Date(),
  }: RepositoryOptions = {},
): LaboratoryRawMaterialWarehouseRepository {
  async function readOptions(column: "stack_location" | "supplier" | "recipient") {
    const [rows] = await pool.query<WarehouseOptionRow[]>(
      `select trim(${column}) as option_value
       from laboratory_raw_material_warehouse_revisions
       where ${column} is not null and trim(${column}) <> ''
       group by option_value
       order by max(coalesce(reviewed_at, submitted_at)) desc, option_value asc`,
    );
    return rows.map((row) => row.option_value);
  }

  return {
    async submit(input) {
      const entryId = createId();
      const revisionId = createId();
      const submittedAt = now().toISOString();
      await pool.query(
        `insert into laboratory_raw_material_warehouse_revisions (
          id, entry_id, revision_number, status, movement_date,
          material_label, stack_location, received_tons, supplier,
          shipped_tons, recipient, submitted_by_user_id,
          submitted_by_account_id, submitted_by_display_name, submitted_at
        ) values (?, ?, 1, 'pending', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          revisionId,
          entryId,
          input.record.movementDate,
          input.record.materialLabel,
          input.record.stackLocation,
          input.record.receivedTons,
          emptyToNull(input.record.supplier),
          input.record.shippedTons,
          emptyToNull(input.record.recipient),
          input.submittedByUserId,
          input.submittedByAccountId,
          input.submittedByDisplayName,
          submittedAt,
        ],
      );
      return {
        id: entryId,
        revisionNumber: 1,
        status: "pending",
        ...input.record,
        submittedByDisplayName: input.submittedByDisplayName,
        submittedAt,
      };
    },

    async review(input) {
      const [rows] = await pool.query<WarehouseRevisionRow[]>(
        `select ${revisionFields}
         from laboratory_raw_material_warehouse_revisions revisions
         where revisions.entry_id = ?
         order by revisions.revision_number desc
         limit 1
         for update`,
        [input.id],
      );
      const current = rows[0];
      if (current === undefined) return undefined;
      if (input.action === "approve" && current.status !== "pending") {
        throw new LaboratoryRawMaterialWarehouseAlreadyReviewedError();
      }
      if (
        current.status === "pending" &&
        (
          current.submitted_by_user_id === input.reviewerUserId ||
          current.submitted_by_account_id === input.reviewerAccountId
        )
      ) {
        throw new LaboratoryRawMaterialWarehouseSelfReviewError();
      }
      if (input.action === "correct" && input.record === undefined) {
        throw new Error("A corrected warehouse movement requires record values.");
      }

      const record = input.record ?? mapSubmission(current);
      const status = input.action === "approve" ? "approved" : "corrected";
      const revisionNumber = Number(current.revision_number) + 1;
      const reviewedAt = now().toISOString();
      const revisionId = createId();
      await pool.query(
        `insert into laboratory_raw_material_warehouse_revisions (
          id, entry_id, revision_number, status, movement_date,
          material_label, stack_location, received_tons, supplier,
          shipped_tons, recipient, submitted_by_user_id,
          submitted_by_account_id, submitted_by_display_name, submitted_at,
          reviewed_by_user_id, reviewed_by_account_id,
          reviewed_by_display_name, reviewed_at
        ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          revisionId,
          current.entry_id,
          revisionNumber,
          status,
          record.movementDate,
          record.materialLabel,
          record.stackLocation,
          record.receivedTons,
          emptyToNull(record.supplier),
          record.shippedTons,
          emptyToNull(record.recipient),
          current.submitted_by_user_id,
          current.submitted_by_account_id,
          current.submitted_by_display_name,
          toIsoString(current.submitted_at),
          input.reviewerUserId,
          input.reviewerAccountId,
          input.reviewerDisplayName,
          reviewedAt,
        ],
      );
      return {
        before: mapRecord(current),
        record: {
          id: current.entry_id,
          revisionNumber,
          status,
          ...record,
          submittedByDisplayName: current.submitted_by_display_name,
          submittedAt: toIsoString(current.submitted_at),
          warehouseKeeperDisplayName: input.reviewerDisplayName,
          reviewedAt,
        },
      };
    },

    async list(filters = {}) {
      const { where, parameters } = buildHistoryWhere(filters);
      const [rows] = await pool.query<WarehouseRevisionRow[]>(
        `select ${revisionFields}
         from laboratory_raw_material_warehouse_revisions revisions
         where ${where}
         order by revisions.movement_date desc,
           coalesce(revisions.reviewed_at, revisions.submitted_at) desc,
           revisions.entry_id desc`,
        parameters,
      );
      const [totalRows] = await pool.query<WarehouseTotalsRow[]>(
        `select
           count(*) as record_count,
           coalesce(sum(revisions.received_tons), 0) as received_tons,
           coalesce(sum(revisions.shipped_tons), 0) as shipped_tons,
           coalesce(sum(revisions.received_tons - revisions.shipped_tons), 0)
             as balance_tons
         from laboratory_raw_material_warehouse_revisions revisions
         where ${where}`,
        parameters,
      );
      const totals = totalRows[0];
      return {
        records: rows.map(mapRecord),
        totals: {
          recordCount: Number(totals?.record_count ?? 0),
          receivedTons: normalizeDecimal(totals?.received_tons ?? 0),
          shippedTons: normalizeDecimal(totals?.shipped_tons ?? 0),
          balanceTons: normalizeDecimal(totals?.balance_tons ?? 0),
        },
      };
    },

    async listPending() {
      const [rows] = await pool.query<WarehouseRevisionRow[]>(
        `select ${revisionFields}
         from laboratory_raw_material_warehouse_revisions revisions
         where ${latestRevisionCondition}
           and revisions.status = 'pending'
         order by revisions.submitted_at asc, revisions.entry_id asc`,
      );
      return rows.map(mapRecord);
    },

    async listOptions() {
      const [stackLocations, suppliers, recipients] = await Promise.all([
        readOptions("stack_location"),
        readOptions("supplier"),
        readOptions("recipient"),
      ]);
      return { stackLocations, suppliers, recipients };
    },
  };
}

function buildHistoryWhere(filters: LaboratoryRawMaterialWarehouseFilters) {
  const conditions = [
    latestRevisionCondition,
    "revisions.status in ('approved', 'corrected')",
  ];
  const parameters: unknown[] = [];
  if (filters.dateFrom !== undefined) {
    conditions.push("revisions.movement_date >= ?");
    parameters.push(filters.dateFrom);
  }
  if (filters.dateTo !== undefined) {
    conditions.push("revisions.movement_date <= ?");
    parameters.push(filters.dateTo);
  }
  if (filters.query !== undefined) {
    const pattern = `%${escapeLikePattern(filters.query)}%`;
    conditions.push(`(
      revisions.material_label like ? escape '\\\\'
      or coalesce(revisions.supplier, '') like ? escape '\\\\'
      or coalesce(revisions.recipient, '') like ? escape '\\\\'
    )`);
    parameters.push(pattern, pattern, pattern);
  }
  return { where: conditions.join(" and "), parameters };
}

function mapRecord(row: WarehouseRevisionRow): LaboratoryRawMaterialWarehouseRecord {
  return {
    id: row.entry_id,
    revisionNumber: Number(row.revision_number),
    status: row.status,
    ...mapSubmission(row),
    submittedByDisplayName: row.submitted_by_display_name,
    submittedAt: toIsoString(row.submitted_at),
    ...(row.reviewed_by_display_name === null
      ? {}
      : { warehouseKeeperDisplayName: row.reviewed_by_display_name }),
    ...(row.reviewed_at === null
      ? {}
      : { reviewedAt: toIsoString(row.reviewed_at) }),
  };
}

function mapSubmission(row: WarehouseRevisionRow): LaboratoryRawMaterialWarehouseSubmission {
  return {
    movementDate: formatDate(row.movement_date),
    materialLabel: row.material_label,
    stackLocation: row.stack_location,
    receivedTons: normalizeDecimal(row.received_tons),
    supplier: row.supplier ?? "",
    shippedTons: normalizeDecimal(row.shipped_tons),
    recipient: row.recipient ?? "",
  };
}

function formatDate(value: Date | string) {
  return value instanceof Date
    ? value.toISOString().slice(0, 10)
    : String(value).slice(0, 10);
}

function toIsoString(value: Date | string) {
  return value instanceof Date ? value.toISOString() : String(value);
}

function emptyToNull(value: string) {
  return value === "" ? null : value;
}

function normalizeDecimal(value: number | string) {
  const text = String(value);
  if (!text.includes(".")) return text;
  const normalized = text.replace(/0+$/u, "").replace(/[.]$/u, "");
  return normalized === "-0" ? "0" : normalized;
}
