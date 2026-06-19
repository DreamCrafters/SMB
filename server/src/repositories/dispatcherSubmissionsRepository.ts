import type { PgPool } from "../db/pool.js";
import {
  mapDispatcherSubmissionRow,
  type DispatcherSubmission,
  type DispatcherSubmissionDraft,
  type DispatcherSubmissionRow,
} from "../domain/dispatcherSubmission.js";

export type DispatcherSubmissionsRepository = {
  create: (
    draft: DispatcherSubmissionDraft,
    submittedByAccountId: string,
  ) => Promise<DispatcherSubmission>;
  listLatest: (limit?: number) => Promise<DispatcherSubmission[]>;
};

export function createDispatcherSubmissionsRepository(
  pool: PgPool,
): DispatcherSubmissionsRepository {
  return {
    async create(draft, submittedByAccountId) {
      const result = await pool.query<DispatcherSubmissionRow>(
        `
          insert into dispatcher_submissions (
            business_account_id,
            period,
            metric_code,
            raw_value,
            comment,
            status,
            submitted_by_account_id
          )
          values ($1, $2, $3, $4, $5, 'received', $6)
          returning
            id,
            business_account_id,
            period,
            metric_code,
            raw_value,
            comment,
            status,
            submitted_by_account_id,
            submitted_at,
            received_at
        `,
        [
          draft.businessAccountId,
          draft.period,
          draft.metricCode,
          draft.rawValue,
          draft.comment ?? null,
          submittedByAccountId,
        ],
      );

      const row = result.rows[0];

      if (row === undefined) {
        throw new Error("Dispatcher submission was not returned by database.");
      }

      return mapDispatcherSubmissionRow(row);
    },

    async listLatest(limit = 100) {
      const safeLimit = Math.min(Math.max(limit, 1), 500);
      const result = await pool.query<DispatcherSubmissionRow>(
        `
          select
            id,
            business_account_id,
            period,
            metric_code,
            raw_value,
            comment,
            status,
            submitted_by_account_id,
            submitted_at,
            received_at
          from dispatcher_submissions
          order by received_at desc
          limit $1
        `,
        [safeLimit],
      );

      return result.rows.map(mapDispatcherSubmissionRow);
    },
  };
}
