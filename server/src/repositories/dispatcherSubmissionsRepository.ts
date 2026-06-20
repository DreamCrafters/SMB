import type { PgPool } from "../db/pool.js";
import {
  mapDispatcherSubmissionRow,
  type DispatcherSubmission,
  type DispatcherSubmissionPayload,
  type DispatcherSubmissionRow,
  type ValidatedDispatcherSubmissionDraft,
} from "../domain/dispatcherSubmission.js";
import {
  dispatcherForms,
  getDispatcherFormTitle,
  isDispatcherFormId,
  type DispatcherFormId,
} from "../domain/dispatcherForms.js";

export type DispatcherFeedFilters = {
  limit?: number;
  formId?: DispatcherFormId;
  dateFrom?: string;
  dateTo?: string;
};

export type DispatcherFeedSummaryItem = {
  formId: DispatcherFormId;
  formTitle: string;
  count: number;
};

export type DispatcherFeedSummary = {
  total: number;
  byForm: DispatcherFeedSummaryItem[];
};

type CountRow = {
  form_id: string;
  count: string;
};

type WhereClause = {
  sql: string;
  values: unknown[];
};

export type DispatcherSubmissionsRepository = {
  create: (
    value: ValidatedDispatcherSubmissionDraft,
    submittedByAccountId: string,
  ) => Promise<DispatcherSubmission>;
  listLatest: (filters?: DispatcherFeedFilters) => Promise<DispatcherSubmission[]>;
  readSummary: (filters?: DispatcherFeedFilters) => Promise<DispatcherFeedSummary>;
};

export function createDispatcherSubmissionsRepository(
  pool: PgPool,
): DispatcherSubmissionsRepository {
  return {
    async create(value, submittedByAccountId) {
      const { draft, summary } = value;
      const legacyValues = buildLegacyValues(draft.payload, draft.formId, summary);
      const result = await pool.query<DispatcherSubmissionRow>(
        `
          insert into dispatcher_submissions (
            business_account_id,
            period,
            metric_code,
            raw_value,
            comment,
            form_id,
            payload,
            summary,
            status,
            submitted_by_account_id
          )
          values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, 'received', $9)
          returning
            id,
            business_account_id,
            form_id,
            payload,
            summary,
            status,
            submitted_by_account_id,
            submitted_at,
            received_at
        `,
        [
          draft.businessAccountId,
          legacyValues.period,
          legacyValues.metricCode,
          legacyValues.rawValue,
          legacyValues.comment,
          draft.formId,
          JSON.stringify(draft.payload),
          summary,
          submittedByAccountId,
        ],
      );

      const row = result.rows[0];

      if (row === undefined) {
        throw new Error("Dispatcher submission was not returned by database.");
      }

      return mapDispatcherSubmissionRow(row);
    },

    async listLatest(filters = {}) {
      const safeLimit = Math.min(Math.max(filters.limit ?? 100, 1), 500);
      const where = buildWhereClause(filters);
      const result = await pool.query<DispatcherSubmissionRow>(
        `
          select
            id,
            business_account_id,
            form_id,
            payload,
            summary,
            status,
            submitted_by_account_id,
            submitted_at,
            received_at
          from dispatcher_submissions
          ${where.sql}
          order by received_at desc
          limit $${where.values.length + 1}
        `,
        [...where.values, safeLimit],
      );

      return result.rows.map(mapDispatcherSubmissionRow);
    },

    async readSummary(filters = {}) {
      const where = buildWhereClause(filters);
      const result = await pool.query<CountRow>(
        `
          select form_id, count(*)::text as count
          from dispatcher_submissions
          ${where.sql}
          group by form_id
        `,
        where.values,
      );
      const countByForm = new Map<DispatcherFormId, number>();

      for (const row of result.rows) {
        const formId = isDispatcherFormId(row.form_id) ? row.form_id : "equipment";
        countByForm.set(formId, (countByForm.get(formId) ?? 0) + Number(row.count));
      }
      const byForm = dispatcherForms.map((form) => ({
        formId: form.id,
        formTitle: getDispatcherFormTitle(form.id),
        count: countByForm.get(form.id) ?? 0,
      }));

      return {
        total: byForm.reduce((sum, item) => sum + item.count, 0),
        byForm,
      };
    },
  };
}

function buildWhereClause(filters: DispatcherFeedFilters): WhereClause {
  const clauses: string[] = [];
  const values: unknown[] = [];

  if (filters.formId !== undefined) {
    values.push(filters.formId);
    clauses.push(`form_id = $${values.length}`);
  }

  if (filters.dateFrom !== undefined) {
    values.push(filters.dateFrom);
    clauses.push(`received_at >= $${values.length}::date`);
  }

  if (filters.dateTo !== undefined) {
    values.push(filters.dateTo);
    clauses.push(`received_at < ($${values.length}::date + interval '1 day')`);
  }

  return {
    sql: clauses.length === 0 ? "" : `where ${clauses.join(" and ")}`,
    values,
  };
}

function buildLegacyValues(
  payload: DispatcherSubmissionPayload,
  formId: DispatcherFormId,
  summary: string,
) {
  return {
    period: readLegacyPeriod(payload),
    metricCode: formId,
    rawValue: summary,
    comment: payload.note ?? payload.comment ?? null,
  };
}

function readLegacyPeriod(payload: DispatcherSubmissionPayload) {
  return (
    payload.reportMonth ??
    payload.monthYear ??
    readMonthFromDate(payload.reportDate) ??
    readMonthFromDate(payload.date) ??
    readMonthFromDate(payload.happenedAt) ??
    readMonthFromDate(payload.entryAt) ??
    new Date().toISOString().slice(0, 7)
  );
}

function readMonthFromDate(value: string | undefined) {
  if (value === undefined || value.length < 7) {
    return undefined;
  }

  return value.slice(0, 7);
}
