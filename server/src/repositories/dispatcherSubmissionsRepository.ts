import { randomUUID } from "node:crypto";
import type { RowDataPacket } from "mysql2/promise";
import type { DatabasePool } from "../db/pool.js";
import {
  buildDispatcherSubmissionSummary,
  mapDispatcherSubmissionRow,
  type DispatcherSubmission,
  type DispatcherSubmissionPayload,
  type DispatcherSubmissionRow,
  type ValidatedDispatcherSubmissionDraft,
} from "../domain/dispatcherSubmission.js";
import {
  dispatcherForms,
  getDispatcherFormDefinition,
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
  count: number | string;
} & RowDataPacket;

type IncidentNumberRow = {
  incident_number: string | null;
} & RowDataPacket;

type DispatcherSubmissionDbRow = DispatcherSubmissionRow & RowDataPacket;

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
  pool: DatabasePool,
): DispatcherSubmissionsRepository {
  return {
    async create(value, submittedByAccountId) {
      const draft = await applyPersistenceDefaults(value.draft, pool);
      const form = getDispatcherFormDefinition(draft.formId);
      const summary =
        form === undefined
          ? value.summary
          : buildDispatcherSubmissionSummary(form, draft.payload);
      const legacyValues = buildLegacyValues(draft.payload, draft.formId, summary);
      const id = randomUUID();

      await pool.query(
        `
          insert into dispatcher_submissions (
            id,
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
          values (?, ?, ?, ?, ?, ?, ?, ?, ?, 'received', ?)
        `,
        [
          id,
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
      const [rows] = await pool.query<DispatcherSubmissionDbRow[]>(
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
          where id = ?
        `,
        [id],
      );

      const row = rows[0];

      if (row === undefined) {
        throw new Error("Dispatcher submission was not returned by database.");
      }

      return mapDispatcherSubmissionRow(row);
    },

    async listLatest(filters = {}) {
      const safeLimit = Math.min(Math.max(filters.limit ?? 100, 1), 500);
      const where = buildWhereClause(filters);
      const [rows] = await pool.query<DispatcherSubmissionDbRow[]>(
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
          limit ?
        `,
        [...where.values, safeLimit],
      );

      return rows.map(mapDispatcherSubmissionRow);
    },

    async readSummary(filters = {}) {
      const where = buildWhereClause(filters);
      const [rows] = await pool.query<CountRow[]>(
        `
          select form_id, count(*) as count
          from dispatcher_submissions
          ${where.sql}
          group by form_id
        `,
        where.values,
      );
      const countByForm = new Map<DispatcherFormId, number>();

      for (const row of rows) {
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

async function applyPersistenceDefaults(
  draft: ValidatedDispatcherSubmissionDraft["draft"],
  pool: DatabasePool,
) {
  if (
    draft.formId !== "incident" ||
    draft.payload.incidentNumber !== undefined
  ) {
    return draft;
  }

  return {
    ...draft,
    payload: {
      ...draft.payload,
      incidentNumber: await readNextIncidentNumber(
        draft.businessAccountId,
        pool,
      ),
    },
  };
}

async function readNextIncidentNumber(
  businessAccountId: string,
  pool: DatabasePool,
) {
  const year = String(new Date().getFullYear());
  const [rows] = await pool.query<IncidentNumberRow[]>(
    `
      select json_unquote(json_extract(payload, '$.incidentNumber')) as incident_number
      from dispatcher_submissions
      where business_account_id = ?
        and form_id = 'incident'
        and json_unquote(json_extract(payload, '$.incidentNumber')) like ?
    `,
    [businessAccountId, `INC-${year}-%`],
  );
  let maxSuffix = 0;

  for (const row of rows) {
    const value = row.incident_number;

    if (value === null || !value.startsWith(`INC-${year}-`)) {
      continue;
    }

    const suffix = Number(value.slice(`INC-${year}-`.length));

    if (Number.isInteger(suffix) && suffix > maxSuffix) {
      maxSuffix = suffix;
    }
  }

  return `INC-${year}-${maxSuffix + 1}`;
}

function buildWhereClause(filters: DispatcherFeedFilters): WhereClause {
  const clauses: string[] = [];
  const values: unknown[] = [];

  if (filters.formId !== undefined) {
    values.push(filters.formId);
    clauses.push("form_id = ?");
  }

  if (filters.dateFrom !== undefined) {
    values.push(filters.dateFrom);
    clauses.push("received_at >= cast(? as datetime)");
  }

  if (filters.dateTo !== undefined) {
    values.push(filters.dateTo);
    clauses.push("received_at < date_add(cast(? as date), interval 1 day)");
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
    readMonthFromPayloadDate(payload.reportDate) ??
    readMonthFromPayloadDate(payload.date) ??
    readMonthFromPayloadDate(payload.datetime) ??
    readMonthFromPayloadDate(payload.closureDateTime) ??
    readMonthFromPayloadDate(payload.entryAt) ??
    new Date().toISOString().slice(0, 7)
  );
}

function readMonthFromPayloadDate(value: string | undefined) {
  if (value === undefined || value.length < 7) {
    return undefined;
  }

  const isoMatch = /^(\d{4})-(\d{2})/.exec(value);

  if (isoMatch !== null) {
    return `${isoMatch[1]}-${isoMatch[2]}`;
  }

  const scriptMatch = /^\d{2}\.(\d{2})\.(\d{4})/.exec(value);

  if (scriptMatch !== null) {
    return `${scriptMatch[2]}-${scriptMatch[1]}`;
  }

  return undefined;
}
