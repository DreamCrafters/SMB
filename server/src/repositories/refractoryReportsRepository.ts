import { randomUUID } from "node:crypto";
import type { RowDataPacket } from "mysql2/promise";
import type { DatabasePool } from "../db/pool.js";
import type { ProductBrandMergeAlias } from "../contracts/productBrands.js";
import { mergeRefractoryReportBrandReferences } from "../domain/productionBrand.js";
import type {
  RefractoryReportDecision,
  RefractoryReportStatus,
  RefractoryReportType,
  RefractoryShiftNumber,
  ValidatedRefractoryReportSubmission,
} from "../domain/refractoryReport.js";

export type RefractoryReportRevision = {
  id: string;
  reportType: RefractoryReportType;
  reportDate: string;
  shiftNumber: RefractoryShiftNumber;
  revisionNumber: number;
  status: RefractoryReportStatus;
  payload: ValidatedRefractoryReportSubmission["payload"];
  totals: ValidatedRefractoryReportSubmission["totals"];
  submittedByUserId: string;
  submittedByAccountId: string;
  masterDisplayName: string;
  submittedAt: string;
  reviewerDisplayName?: string;
  reviewedAt?: string;
  rejectionComment?: string;
};

export type PublicRefractoryReportRevision = Omit<
  RefractoryReportRevision,
  "submittedByUserId" | "submittedByAccountId"
>;

export type RefractoryReportsRepository = {
  submit: (input: {
    report: ValidatedRefractoryReportSubmission;
    submittedByUserId: string;
    submittedByAccountId: string;
    masterDisplayName: string;
  }) => Promise<RefractoryReportRevision>;
  listLatestForShift: (input: {
    reportDate: string;
    shiftNumber: RefractoryShiftNumber;
  }) => Promise<RefractoryReportRevision[]>;
  listLatestApprovedCoshForDates: (input: {
    reportDates: readonly string[];
  }) => Promise<RefractoryReportRevision[]>;
  /** Последняя подтверждённая сводка ЦОШ строго раньше указанных даты и смены. */
  findLatestApprovedCoshBefore: (input: {
    reportDate: string;
    shiftNumber: RefractoryShiftNumber;
  }) => Promise<RefractoryReportRevision | undefined>;
  listCoshMasterOptions: () => Promise<string[]>;
  listPending: () => Promise<RefractoryReportRevision[]>;
  listRecentForSubmitter: (input: {
    submittedByAccountId: string;
  }) => Promise<RefractoryReportRevision[]>;
  review: (input: {
    reportId: string;
    decision: RefractoryReportDecision;
    reviewerUserId: string;
    reviewerAccountId: string;
    reviewerDisplayName: string;
  }) => Promise<RefractoryReportRevision>;
};

export class RefractoryReportPendingError extends Error {
  constructor() {
    super("This refractory report already has a pending revision.");
    this.name = "RefractoryReportPendingError";
  }
}

export class RefractoryReportNotFoundError extends Error {
  constructor() {
    super("Refractory report was not found.");
    this.name = "RefractoryReportNotFoundError";
  }
}

export class RefractoryReportAlreadyReviewedError extends Error {
  constructor() {
    super("Refractory report has already been reviewed.");
    this.name = "RefractoryReportAlreadyReviewedError";
  }
}

export class RefractoryReportSelfReviewError extends Error {
  constructor() {
    super("A refractory report cannot be reviewed by its author.");
    this.name = "RefractoryReportSelfReviewError";
  }
}

type RefractoryReportRow = RowDataPacket & {
  id: string;
  report_type: RefractoryReportType;
  report_date: Date | string;
  shift_number: number;
  revision_number: number;
  status: RefractoryReportStatus;
  payload: unknown;
  totals: unknown;
  submitted_by_user_id: string;
  submitted_by_account_id: string;
  master_display_name: string;
  submitted_at: Date | string;
  reviewer_display_name: string | null;
  reviewed_at: Date | string | null;
  rejection_comment: string | null;
};

type CoshMasterOptionRow = RowDataPacket & {
  master_name: string;
};

type RefractoryReportsRepositoryOptions = {
  createId?: () => string;
  readProductBrandMergeAliases?: () => Promise<readonly ProductBrandMergeAlias[]>;
};

const revisionFieldNames = [
  "id",
  "report_type",
  "report_date",
  "shift_number",
  "revision_number",
  "status",
  "payload",
  "totals",
  "submitted_by_user_id",
  "submitted_by_account_id",
  "master_display_name",
  "submitted_at",
  "reviewer_display_name",
  "reviewed_at",
  "rejection_comment",
] as const;

const selectRevisionFields = revisionFieldNames.join(",\n  ");
const selectRevisionFieldsWithAlias = revisionFieldNames
  .map((field) => `revisions.${field}`)
  .join(",\n  ");

export function createRefractoryReportsRepository(
  pool: DatabasePool,
  {
    createId = randomUUID,
    readProductBrandMergeAliases = async () => [],
  }: RefractoryReportsRepositoryOptions = {},
): RefractoryReportsRepository {
  async function mapPersistedRevisions(rows: RefractoryReportRow[]) {
    if (rows.length === 0) return [];
    const aliases = await readProductBrandMergeAliases();
    return rows.map((row) => {
      const revision = mapRevision(row);
      const payload = aliases.reduce<unknown>((current, alias) =>
        mergeRefractoryReportBrandReferences(
          revision.reportType,
          current,
          alias.sourceName,
          alias.replacementName,
        ).payload, revision.payload);
      return {
        ...revision,
        payload: payload as ValidatedRefractoryReportSubmission["payload"],
      };
    });
  }

  async function readById(reportId: string, forUpdate = false) {
    const [rows] = await pool.query<RefractoryReportRow[]>(
      `select ${selectRevisionFields}
       from refractory_report_revisions
       where id = ?
       ${forUpdate ? "for update" : ""}`,
      [reportId],
    );
    return (await mapPersistedRevisions(rows))[0];
  }

  return {
    async submit(input) {
      const { report } = input;
      await pool.query(
        `insert into refractory_report_keys (
          report_type, report_date, shift_number
        ) values (?, ?, ?)
        on duplicate key update report_type = values(report_type)`,
        [report.reportType, report.reportDate, report.shiftNumber],
      );
      const [rows] = await pool.query<RefractoryReportRow[]>(
        `select ${selectRevisionFields}
         from refractory_report_revisions
         where report_type = ? and report_date = ? and shift_number = ?
         order by revision_number desc
         limit 1
         for update`,
        [report.reportType, report.reportDate, report.shiftNumber],
      );
      const latest = rows[0] === undefined ? undefined : mapRevision(rows[0]);

      if (latest?.status === "pending") {
        throw new RefractoryReportPendingError();
      }

      const id = createId();
      const revisionNumber = (latest?.revisionNumber ?? 0) + 1;
      await pool.query(
        `insert into refractory_report_revisions (
          id,
          report_type,
          report_date,
          shift_number,
          revision_number,
          status,
          payload,
          totals,
          submitted_by_user_id,
          submitted_by_account_id,
          master_display_name
        ) values (?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?)`,
        [
          id,
          report.reportType,
          report.reportDate,
          report.shiftNumber,
          revisionNumber,
          JSON.stringify(report.payload),
          JSON.stringify(report.totals),
          input.submittedByUserId,
          input.submittedByAccountId,
          input.masterDisplayName,
        ],
      );

      const saved = await readById(id);
      if (saved === undefined) throw new RefractoryReportNotFoundError();
      return saved;
    },

    async listLatestForShift(input) {
      const [rows] = await pool.query<RefractoryReportRow[]>(
        `select ${selectRevisionFieldsWithAlias}
         from refractory_report_revisions revisions
         join (
           select report_type, max(revision_number) as revision_number
           from refractory_report_revisions
           where report_date = ? and shift_number = ?
           group by report_type
         ) latest
           on latest.report_type = revisions.report_type
          and latest.revision_number = revisions.revision_number
         where revisions.report_date = ? and revisions.shift_number = ?
         order by revisions.report_type asc`,
        [
          input.reportDate,
          input.shiftNumber,
          input.reportDate,
          input.shiftNumber,
        ],
      );
      return mapPersistedRevisions(rows);
    },

    async listLatestApprovedCoshForDates(input) {
      const reportDates = Array.from(new Set(input.reportDates));

      if (reportDates.length === 0) {
        return [];
      }

      const placeholders = reportDates.map(() => "?").join(", ");
      const [rows] = await pool.query<RefractoryReportRow[]>(
        `select ${selectRevisionFieldsWithAlias}
         from refractory_report_revisions revisions
         where revisions.report_type = 'cosh'
           and revisions.status = 'approved'
           and revisions.report_date in (${placeholders})
           and not exists (
             select 1
             from refractory_report_revisions newer
             where newer.report_type = revisions.report_type
               and newer.report_date = revisions.report_date
               and newer.status = 'approved'
               and (
                 newer.shift_number > revisions.shift_number
                 or (
                   newer.shift_number = revisions.shift_number
                   and newer.revision_number > revisions.revision_number
                 )
               )
           )
         order by revisions.report_date asc`,
        reportDates,
      );
      return mapPersistedRevisions(rows);
    },

    async findLatestApprovedCoshBefore(input) {
      const [rows] = await pool.query<RefractoryReportRow[]>(
        `select ${selectRevisionFields}
         from refractory_report_revisions
         where report_type = 'cosh'
           and status = 'approved'
           and (report_date < ? or (report_date = ? and shift_number < ?))
         order by report_date desc, shift_number desc, revision_number desc
         limit 1`,
        [input.reportDate, input.reportDate, input.shiftNumber],
      );
      return (await mapPersistedRevisions(rows))[0];
    },

    async listCoshMasterOptions() {
      const [rows] = await pool.query<CoshMasterOptionRow[]>(
        `select master_name
         from (
           select
             coalesce(
               nullif(trim(json_unquote(json_extract(payload, '$.coshMaster'))), ''),
               master_display_name
             ) as master_name,
             submitted_at
           from refractory_report_revisions
           where report_type = 'cosh'
         ) master_options
         where master_name <> ''
         group by master_name
         order by max(submitted_at) desc, master_name asc`,
      );
      return rows.map((row) => row.master_name);
    },

    async listPending() {
      const [rows] = await pool.query<RefractoryReportRow[]>(
        `select ${selectRevisionFields}
         from refractory_report_revisions
         where status = 'pending'
         order by submitted_at asc, id asc`,
      );
      return mapPersistedRevisions(rows);
    },

    async listRecentForSubmitter(input) {
      const [rows] = await pool.query<RefractoryReportRow[]>(
        `select ${selectRevisionFieldsWithAlias}
         from refractory_report_revisions revisions
         join (
           select
             report_type,
             report_date,
             shift_number,
             max(revision_number) as revision_number
           from refractory_report_revisions
           group by report_type, report_date, shift_number
         ) latest
           on latest.report_type = revisions.report_type
          and latest.report_date = revisions.report_date
          and latest.shift_number = revisions.shift_number
          and latest.revision_number = revisions.revision_number
         where revisions.submitted_by_account_id = ?
           and (
             revisions.status in ('pending', 'rejected')
             or revisions.reviewed_at >= current_timestamp(3) - interval 30 day
           )
         order by coalesce(revisions.reviewed_at, revisions.submitted_at) desc,
                  revisions.id desc`,
        [input.submittedByAccountId],
      );
      return mapPersistedRevisions(rows);
    },

    async review(input) {
      const current = await readById(input.reportId, true);
      if (current === undefined) throw new RefractoryReportNotFoundError();
      if (current.status !== "pending") {
        throw new RefractoryReportAlreadyReviewedError();
      }
      if (
        current.submittedByUserId === input.reviewerUserId ||
        current.submittedByAccountId === input.reviewerAccountId
      ) {
        throw new RefractoryReportSelfReviewError();
      }

      const status: RefractoryReportStatus =
        input.decision.decision === "approve" ? "approved" : "rejected";
      await pool.query(
        `update refractory_report_revisions
         set status = ?,
             reviewed_by_user_id = ?,
             reviewed_by_account_id = ?,
             reviewer_display_name = ?,
             reviewed_at = current_timestamp(3),
             rejection_comment = ?
         where id = ? and status = 'pending'`,
        [
          status,
          input.reviewerUserId,
          input.reviewerAccountId,
          input.reviewerDisplayName,
          input.decision.decision === "reject" ? input.decision.comment : null,
          input.reportId,
        ],
      );

      const saved = await readById(input.reportId);
      if (saved === undefined) throw new RefractoryReportNotFoundError();
      return saved;
    },
  };
}

export function toPublicRefractoryReportRevision(
  report: RefractoryReportRevision,
): PublicRefractoryReportRevision {
  const {
    submittedByUserId: _submittedByUserId,
    submittedByAccountId: _submittedByAccountId,
    ...publicReport
  } = report;
  return publicReport;
}

function mapRevision(row: RefractoryReportRow): RefractoryReportRevision {
  return {
    id: row.id,
    reportType: row.report_type,
    reportDate: toDateOnly(row.report_date),
    shiftNumber: row.shift_number as RefractoryShiftNumber,
    revisionNumber: Number(row.revision_number),
    status: row.status,
    payload: readJson(
      row.payload,
    ) as ValidatedRefractoryReportSubmission["payload"],
    totals: readJson(
      row.totals,
    ) as ValidatedRefractoryReportSubmission["totals"],
    submittedByUserId: row.submitted_by_user_id,
    submittedByAccountId: row.submitted_by_account_id,
    masterDisplayName: row.master_display_name,
    submittedAt: new Date(row.submitted_at).toISOString(),
    ...(row.reviewer_display_name === null
      ? {}
      : { reviewerDisplayName: row.reviewer_display_name }),
    ...(row.reviewed_at === null
      ? {}
      : { reviewedAt: new Date(row.reviewed_at).toISOString() }),
    ...(row.rejection_comment === null
      ? {}
      : { rejectionComment: row.rejection_comment }),
  };
}

function readJson(value: unknown) {
  if (typeof value === "string") return JSON.parse(value) as unknown;
  return value;
}

function toDateOnly(value: Date | string) {
  if (typeof value === "string") return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
}
