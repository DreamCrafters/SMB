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

test("repository selects the latest approved COSH shift for each requested date", async () => {
  let querySql = "";
  let queryParameters: readonly unknown[] = [];
  const approvedCoshRow = {
    ...pendingRow,
    id: "cosh-approved",
    report_type: "cosh",
    report_date: "2026-07-21",
    status: "approved",
    payload: JSON.stringify({
      jarMeasurements: [
        { jarNumber: 1, values: [1.2], averageHeightMeters: 1.2 },
      ],
    }),
  };
  const pool = {
    async query(sql: string, parameters: readonly unknown[]) {
      querySql = sql;
      queryParameters = parameters;
      return [[approvedCoshRow], []];
    },
  } as unknown as DatabasePool;
  const repository = createRefractoryReportsRepository(pool);

  const reports = await repository.listLatestApprovedCoshForDates({
    reportDates: ["2026-07-20", "2026-07-21", "2026-07-21"],
  });

  assert.equal(reports[0]?.id, "cosh-approved");
  assert.match(querySql, /revisions\.report_type = 'cosh'/u);
  assert.match(querySql, /revisions\.status = 'approved'/u);
  assert.match(querySql, /newer\.shift_number > revisions\.shift_number/u);
  assert.match(querySql, /newer\.revision_number > revisions\.revision_number/u);
  assert.deepEqual(queryParameters, ["2026-07-20", "2026-07-21"]);
});

test("repository accumulates COSH master options from new and legacy revisions", async () => {
  let querySql = "";
  const pool = {
    async query(sql: string) {
      querySql = sql;
      return [[
        { master_name: "Сидоров С.С." },
        { master_name: "Иванов И.И." },
      ], []];
    },
  } as unknown as DatabasePool;
  const repository = createRefractoryReportsRepository(pool);

  assert.deepEqual(await repository.listCoshMasterOptions(), [
    "Сидоров С.С.",
    "Иванов И.И.",
  ]);
  assert.match(querySql, /json_extract\(payload, '\$\.coshMaster'\)/u);
  assert.match(querySql, /master_display_name/u);
  assert.match(querySql, /group by master_name/u);
});

test("repository canonicalizes merged brands while keeping report revision rows immutable", async () => {
  const statements: string[] = [];
  const pool = {
    async query(sql: string) {
      statements.push(sql);
      return [[{
        ...pendingRow,
        id: "cosh-current",
        report_type: "cosh",
        status: "approved",
        payload: JSON.stringify({
          chamotteOutputRows: [
            { productBrand: "Дубль", quantityTons: 1.25 },
            { productBrand: "Основная", quantityTons: 0.75 },
          ],
        }),
      }], []];
    },
  } as unknown as DatabasePool;
  const repository = createRefractoryReportsRepository(pool, {
    readProductBrandMergeAliases: async () => [{
      sourceName: "Дубль",
      replacementName: "Основная",
    }],
  });

  const reports = await repository.listLatestForShift({
    reportDate: "2026-07-20",
    shiftNumber: 2,
  });

  assert.deepEqual(reports[0]?.payload, {
    chamotteOutputRows: [{ productBrand: "Основная", quantityTons: 2 }],
  });
  assert.equal(statements.some((sql) => /^\s*update /u.test(sql)), false);
});
