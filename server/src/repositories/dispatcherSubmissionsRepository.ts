import { randomUUID } from "node:crypto";
import type { RowDataPacket } from "mysql2/promise";
import type { DatabasePool } from "../db/pool.js";
import {
  buildDispatcherSubmissionDedupeKey,
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
  offset?: number;
  formId?: DispatcherFormId;
  dateFrom?: string;
  dateTo?: string;
  reportDate?: string;
  reportMonth?: string;
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

export type EquipmentReportRevisionDraft = {
  reportDate: string;
  status: "updated";
  submissions: readonly DispatcherSubmission[];
  submittedByAccountId: string;
};

type CountRow = {
  form_id: string;
  count: number | string;
} & RowDataPacket;

type IncidentNumberRow = {
  incident_number: string | null;
} & RowDataPacket;

type DispatcherSubmissionDbRow = DispatcherSubmissionRow & RowDataPacket;

type ProductionCoshMasterOptionRow = {
  cosh_master: string;
} & RowDataPacket;

type WhereClause = {
  sql: string;
  values: unknown[];
};

const dispatcherFeedPageLimit = 2_000;

/**
 * Дата отчёта хранится в payload в двух форматах: `DD.MM.YYYY` у сводок,
 * сохранённых формой, и `YYYY-MM-DD` у legacy-импорта. Для сравнения дат обе
 * записи приводятся к `date`; нераспознанное значение даёт `null` и выпадает из
 * выборки.
 */
const productionReportDateSql = `case
    when json_unquote(json_extract(payload, '$.reportDate')) like '__.__.____'
      then str_to_date(
        json_unquote(json_extract(payload, '$.reportDate')), '%d.%m.%Y')
    else str_to_date(
      json_unquote(json_extract(payload, '$.reportDate')), '%Y-%m-%d')
  end`;

export type DispatcherSubmissionsRepository = {
  create: (
    value: ValidatedDispatcherSubmissionDraft,
    submittedByAccountId: string,
  ) => Promise<DispatcherSubmission>;
  recordEquipmentReportRevision: (
    value: EquipmentReportRevisionDraft,
  ) => Promise<void>;
  listLatest: (filters?: DispatcherFeedFilters) => Promise<DispatcherSubmission[]>;
  /**
   * Последняя сводка `Выработка` строго раньше даты отчёта. Нужна цепочке веса
   * по отгрузкам: пропущенный день не должен обнулять накопленный баланс,
   * поэтому база ищется по дате отчёта, а не только за предыдущий календарный
   * день.
   */
  findLatestProductionBefore?: (
    reportDate: string,
  ) => Promise<DispatcherSubmission | undefined>;
  listProductionCoshMasterOptions?: () => Promise<string[]>;
  readSummary: (filters?: DispatcherFeedFilters) => Promise<DispatcherFeedSummary>;
};

export async function recordEquipmentReportRevisionForDate(
  pool: DatabasePool,
  value: {
    reportDate: string;
    submittedByAccountId: string;
  },
) {
  const repository = createDispatcherSubmissionsRepository(pool);
  const submissions = await repository.listLatest({
    formId: "equipment",
    reportDate: value.reportDate,
    limit: dispatcherFeedPageLimit,
  });

  if (submissions.length === 0) {
    throw new Error("Updated equipment report was not found.");
  }

  await repository.recordEquipmentReportRevision({
    ...value,
    status: "updated",
    submissions,
  });
}

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
      const legacyValues = buildDispatcherLegacyValues(draft.payload, draft.formId, summary);
      const dedupeKey = buildDispatcherSubmissionDedupeKey(draft);
      const id = randomUUID();

      const insertMode = draft.formId === "equipment" ? "insert" : "insert ignore";
      const duplicateUpdate =
        draft.formId === "equipment"
          ? `
              on duplicate key update
                period = values(period),
                metric_code = values(metric_code),
                raw_value = values(raw_value),
                comment = values(comment),
                form_id = values(form_id),
                payload = values(payload),
                summary = values(summary),
                status = 'received',
                submitted_by_account_id = values(submitted_by_account_id),
                submitted_at = current_timestamp(3),
                received_at = current_timestamp(3)
            `
          : "";

      await pool.query(
        `
          ${insertMode} into dispatcher_submissions (
            id,
            period,
            metric_code,
            raw_value,
            comment,
            form_id,
            payload,
            summary,
            dedupe_key,
            status,
            submitted_by_account_id
          )
          values (?, ?, ?, ?, ?, ?, ?, ?, ?, 'received', ?)
          ${duplicateUpdate}
        `,
        [
          id,
          legacyValues.period,
          legacyValues.metricCode,
          legacyValues.rawValue,
          legacyValues.comment,
          draft.formId,
          JSON.stringify(draft.payload),
          summary,
          dedupeKey,
          submittedByAccountId,
        ],
      );
      const [rows] = await pool.query<DispatcherSubmissionDbRow[]>(
        `
          select
            id,
            form_id,
            payload,
            summary,
            status,
            submitted_by_account_id,
            submitted_at,
            received_at
          from dispatcher_submissions
          where ${dedupeKey === null ? "id" : "dedupe_key"} = ?
        `,
        [dedupeKey ?? id],
      );

      const row = rows[0];

      if (row === undefined) {
        throw new Error("Dispatcher submission was not returned by database.");
      }

      return mapDispatcherSubmissionRow(row);
    },

    async recordEquipmentReportRevision(value) {
      await pool.query(
        `
          insert into dispatcher_equipment_report_revisions (
            id,
            report_date,
            revision_status,
            payload,
            submitted_by_account_id
          )
          values (?, ?, ?, ?, ?)
        `,
        [
          randomUUID(),
          value.reportDate,
          value.status,
          JSON.stringify({
            submissions: value.submissions.map((submission) => ({
              id: submission.id,
              formId: submission.formId,
              payload: submission.payload,
              summary: submission.summary,
              receivedAt: submission.receivedAt,
            })),
          }),
          value.submittedByAccountId,
        ],
      );
    },

    async listLatest(filters = {}) {
      const safeLimit = Math.min(
        Math.max(filters.limit ?? 100, 1),
        dispatcherFeedPageLimit,
      );
      const safeOffset = Math.max(Math.trunc(filters.offset ?? 0), 0);
      const where = buildWhereClause(filters);
      const [rows] = await pool.query<DispatcherSubmissionDbRow[]>(
        `
          select
            id,
            form_id,
            payload,
            summary,
            status,
            submitted_by_account_id,
            submitted_at,
            received_at
          from dispatcher_submissions
          ${where.sql}
          order by received_at desc, submitted_at desc, id desc
          limit ? offset ?
        `,
        [...where.values, safeLimit, safeOffset],
      );

      return rows.map(mapDispatcherSubmissionRow);
    },

    async findLatestProductionBefore(reportDate) {
      const [rows] = await pool.query<DispatcherSubmissionDbRow[]>(
        `
          select
            id,
            form_id,
            payload,
            summary,
            status,
            submitted_by_account_id,
            submitted_at,
            received_at
          from dispatcher_submissions
          where form_id = ?
            and ${productionReportDateSql} < cast(? as date)
          order by ${productionReportDateSql} desc,
            received_at desc, submitted_at desc, id desc
          limit 1
        `,
        ["production", reportDate],
      );
      const row = rows[0];

      return row === undefined ? undefined : mapDispatcherSubmissionRow(row);
    },

    async listProductionCoshMasterOptions() {
      const [rows] = await pool.query<ProductionCoshMasterOptionRow[]>(
        `
          select
            trim(json_unquote(json_extract(payload, '$.coshMaster'))) as cosh_master
          from dispatcher_submissions
          where form_id = ?
            and json_type(json_extract(payload, '$.coshMaster')) = 'STRING'
            and trim(json_unquote(json_extract(payload, '$.coshMaster'))) <> ''
          group by cosh_master
          order by max(received_at) desc, cosh_master asc
        `,
        ["production"],
      );

      return rows.map((row) => row.cosh_master);
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
      incidentNumber: await readNextIncidentNumber(pool),
    },
  };
}

async function readNextIncidentNumber(
  pool: DatabasePool,
) {
  const year = String(new Date().getFullYear());
  const [rows] = await pool.query<IncidentNumberRow[]>(
    `
      select json_unquote(json_extract(payload, '$.incidentNumber')) as incident_number
      from dispatcher_submissions
      where form_id = 'incident'
        and json_unquote(json_extract(payload, '$.incidentNumber')) like ?
    `,
    [`INC-${year}-%`],
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

  if (filters.reportDate !== undefined) {
    values.push(
      filters.reportDate,
      formatReportDateForPayload(filters.reportDate),
    );
    clauses.push(
      "json_unquote(json_extract(payload, '$.reportDate')) in (?, ?)",
    );
  }

  if (filters.reportMonth !== undefined) {
    const [year, month] = filters.reportMonth.split("-");

    values.push(
      filters.reportMonth,
      `%.${month}.${year}`,
      `${filters.reportMonth}-%`,
    );
    clauses.push(
      "(json_unquote(json_extract(payload, '$.reportMonth')) = ? or " +
        "json_unquote(json_extract(payload, '$.reportDate')) like ? or " +
        "json_unquote(json_extract(payload, '$.reportDate')) like ?)",
    );
  }

  return {
    sql: clauses.length === 0 ? "" : `where ${clauses.join(" and ")}`,
    values,
  };
}

function formatReportDateForPayload(value: string) {
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (parts === null) {
    return value;
  }

  return `${parts[3]}.${parts[2]}.${parts[1]}`;
}

export function buildDispatcherLegacyValues(
  payload: DispatcherSubmissionPayload,
  formId: string,
  summary: string,
  fallbackPeriod = new Date().toISOString().slice(0, 7),
) {
  return {
    period: readLegacyPeriod(payload, fallbackPeriod),
    metricCode: formId,
    rawValue: summary,
    comment: payload.note ?? payload.comment ?? null,
  };
}

function readLegacyPeriod(payload: DispatcherSubmissionPayload, fallbackPeriod: string) {
  return (
    payload.reportMonth ??
    payload.monthYear ??
    readMonthFromPayloadDate(payload.reportDate) ??
    readMonthFromPayloadDate(payload.date) ??
    readMonthFromPayloadDate(payload.datetime) ??
    readMonthFromPayloadDate(payload.closureDateTime) ??
    readMonthFromPayloadDate(payload.entryAt) ??
    fallbackPeriod
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
