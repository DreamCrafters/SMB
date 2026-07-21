import assert from "node:assert/strict";
import test from "node:test";
import type { DatabasePool } from "../db/pool.js";
import {
  createRefractoryReportsRepository,
  RefractoryReportPendingError,
  RefractoryReportSelfReviewError,
} from "./refractoryReportsRepository.js";

const pendingRow = {
  id: "report-1",
  report_type: "firing",
  report_date: "2026-07-20",
  shift_number: 2,
  revision_number: 1,
  status: "pending",
  payload: JSON.stringify({
    rows: [{ productBrand: "ША", rejectTotalPieces: 0 }],
  }),
  totals: JSON.stringify({ rejectTotalPieces: 0 }),
  submitted_by_user_id: "operator-user",
  submitted_by_account_id: "operator-account",
  master_display_name: "Мастер ОЦ",
  submitted_at: "2026-07-20T20:00:00.000Z",
  reviewer_display_name: null,
  reviewed_at: null,
  rejection_comment: null,
};

test("repository blocks a second revision while the first awaits review", async () => {
  const pool = {
    async query(sql: string) {
      if (sql.includes("order by revision_number desc"))
        return [[pendingRow], []];
      return [[], []];
    },
  } as unknown as DatabasePool;
  const repository = createRefractoryReportsRepository(pool);

  await assert.rejects(
    repository.submit({
      report: {
        reportType: "firing",
        reportDate: "2026-07-20",
        shiftNumber: 2,
        payload: { rows: [] },
        totals: {
          quantityPieces: 0,
          palletCount: 0,
          goodTonsAverageWeight: 0,
          goodTonsWeighed: 0,
          rejectTotalPieces: 0,
          rejectUnderburnPieces: 0,
          rejectCracksPieces: 0,
          rejectFusionPieces: 0,
          rejectChipsPieces: 0,
        },
      },
      submittedByUserId: "operator-user",
      submittedByAccountId: "operator-account",
      masterDisplayName: "Мастер ОЦ",
    }),
    RefractoryReportPendingError,
  );
});

test("repository prevents the submitting user from reviewing through another access", async () => {
  const pool = {
    async query(sql: string) {
      if (sql.includes("where id = ?")) return [[pendingRow], []];
      return [[], []];
    },
  } as unknown as DatabasePool;
  const repository = createRefractoryReportsRepository(pool);

  await assert.rejects(
    repository.review({
      reportId: "report-1",
      decision: { decision: "approve" },
      reviewerUserId: "operator-user",
      reviewerAccountId: "dispatcher-account",
      reviewerDisplayName: "Мастер ОЦ",
    }),
    RefractoryReportSelfReviewError,
  );
});

test("repository keeps every latest returned report and recent decisions for one submitting account", async () => {
  let querySql = "";
  let queryParameters: unknown[] = [];
  const pool = {
    async query(sql: string, parameters: unknown[]) {
      querySql = sql;
      queryParameters = parameters;
      return [[pendingRow], []];
    },
  } as unknown as DatabasePool;
  const repository = createRefractoryReportsRepository(pool);

  const reports = await repository.listRecentForSubmitter({
    submittedByAccountId: "operator-account",
  });

  assert.equal(reports[0]?.id, "report-1");
  assert.match(querySql, /max\(revision_number\)/u);
  assert.match(querySql, /revisions\.submitted_by_account_id = \?/u);
  assert.match(querySql, /revisions\.status in \('pending', 'rejected'\)/u);
  assert.match(querySql, /revisions\.reviewed_at >=/u);
  assert.doesNotMatch(querySql, /limit 200/u);
  assert.deepEqual(queryParameters, ["operator-account"]);
});
