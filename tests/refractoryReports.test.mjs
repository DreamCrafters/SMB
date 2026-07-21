import assert from "node:assert/strict";
import test from "node:test";
import {
  buildRefractoryDecisionNotifications,
  countReturnedRefractoryReports,
  countReturnedRefractoryReportsByType,
  decideRefractoryReport,
  listReturnedRefractoryShifts,
  requestOwnRefractoryReports,
  requestPendingRefractoryReports,
  requestRefractoryReports,
  submitRefractoryReport,
} from "../.test-build/src/services/refractoryReports.js";

const originalFetch = globalThis.fetch;

test.after(() => {
  globalThis.fetch = originalFetch;
});

test("refractory report service uses separate shift, queue, submit and decision endpoints", async () => {
  const calls = [];
  const report = {
    id: "report-1",
    reportType: "firing",
    reportDate: "2026-07-20",
    shiftNumber: 2,
    revisionNumber: 1,
    status: "pending",
    payload: {
      rows: [
        {
          productBrand: "ША",
          quantityPieces: 100,
          rejectCracksPieces: 2,
          rejectTotalPieces: 2,
        },
      ],
    },
    totals: {
      quantityPieces: 100,
      palletCount: 0,
      goodTonsAverageWeight: 0,
      goodTonsWeighed: 0,
      rejectTotalPieces: 2,
      rejectUnderburnPieces: 0,
      rejectCracksPieces: 2,
      rejectFusionPieces: 0,
      rejectChipsPieces: 0,
    },
    masterDisplayName: "Мастер ОЦ",
    submittedAt: "2026-07-20T20:30:00.000Z",
  };
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return jsonResponse(
      init?.method === "POST" ? { report } : { reports: [report] },
      init?.method === "POST" ? 201 : 200,
    );
  };

  const shift = await requestRefractoryReports("2026-07-20", 2, {
    baseUrl: "http://api.test",
  });
  const queue = await requestPendingRefractoryReports({
    baseUrl: "http://api.test",
  });
  const ownReports = await requestOwnRefractoryReports({
    baseUrl: "http://api.test",
  });
  const submitted = await submitRefractoryReport(
    {
      reportType: "firing",
      reportDate: "2026-07-20",
      shiftNumber: 2,
      payload: {
        rows: [
          {
            productBrand: "ША",
            quantityPieces: 100,
            rejectCracksPieces: 2,
          },
        ],
      },
    },
    { baseUrl: "http://api.test" },
  );
  const decided = await decideRefractoryReport(
    "report-1",
    { decision: "reject", comment: "Уточните брак" },
    { baseUrl: "http://api.test" },
  );

  assert.equal(shift.status, "ready");
  assert.equal(queue.status, "ready");
  assert.equal(ownReports.status, "ready");
  assert.equal(submitted.status, "ready");
  assert.equal(decided.status, "ready");
  assert.equal(
    calls[0].url,
    "http://api.test/api/refractory-reports?date=2026-07-20&shift=2",
  );
  assert.equal(calls[1].url, "http://api.test/api/refractory-reports/pending");
  assert.equal(calls[2].url, "http://api.test/api/refractory-reports/own");
  assert.deepEqual(JSON.parse(calls[4].init.body), {
    decision: "reject",
    comment: "Уточните брак",
  });
});

test("refractory decision notifications report approvals and rejection comments", () => {
  const approved = buildReport({ id: "approved", status: "approved" });
  const rejected = buildReport({
    id: "rejected",
    status: "rejected",
    rejectionComment: "Уточните выпуск шамота",
  });
  const unchanged = buildReport({ id: "unchanged", status: "pending" });
  const previousStatuses = new Map([
    [approved.id, "pending"],
    [rejected.id, "pending"],
    [unchanged.id, "pending"],
  ]);

  assert.deepEqual(
    buildRefractoryDecisionNotifications(previousStatuses, [
      approved,
      rejected,
      unchanged,
    ]),
    [
      {
        reportId: "approved",
        title: "Таблица принята",
        message: "Печное отделение · 20.07.2026 · смена 2.",
      },
      {
        reportId: "rejected",
        title: "Возвращено на доработку",
        message:
          "Печное отделение · 20.07.2026 · смена 2. Причина: Уточните выпуск шамота",
      },
    ],
  );
});

test("refractory return count includes only latest revisions awaiting correction", () => {
  const reports = [
    buildReport({
      id: "superseded-rejection",
      reportType: "cosh",
      revisionNumber: 1,
      status: "rejected",
    }),
    buildReport({
      id: "resent-report",
      reportType: "cosh",
      revisionNumber: 2,
      status: "pending",
    }),
    buildReport({
      id: "returned-report",
      reportType: "equipment",
      revisionNumber: 1,
      status: "rejected",
    }),
    buildReport({
      id: "approved-report",
      reportType: "firing",
      revisionNumber: 1,
      status: "approved",
    }),
  ];

  assert.equal(countReturnedRefractoryReports(reports), 1);
  assert.deepEqual(
    countReturnedRefractoryReportsByType(reports, {
      reportDate: "2026-07-20",
      shiftNumber: 2,
    }),
    {
      cosh: 0,
      equipment: 1,
      firing: 0,
    },
  );
  assert.deepEqual(
    countReturnedRefractoryReportsByType(reports, {
      reportDate: "2026-07-21",
      shiftNumber: 2,
    }),
    {
      cosh: 0,
      equipment: 0,
      firing: 0,
    },
  );
  assert.deepEqual(listReturnedRefractoryShifts(reports), [
    { reportDate: "2026-07-20", shiftNumber: 2 },
  ]);
});

test("refractory report service rejects malformed server totals", async () => {
  globalThis.fetch = async () =>
    jsonResponse({
      reports: [
        {
          id: "bad",
          reportType: "cosh",
          reportDate: "2026-07-20",
          shiftNumber: 1,
          revisionNumber: 1,
          status: "pending",
          payload: {},
          totals: { chamotteOutputTons: "not-a-number" },
          masterDisplayName: "Мастер",
          submittedAt: "2026-07-20T08:00:00.000Z",
        },
      ],
    });

  const result = await requestPendingRefractoryReports({
    baseUrl: "http://api.test",
  });

  assert.equal(result.status, "error");
  assert.equal(result.code, "invalid_response");
});

function jsonResponse(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function buildReport(overrides = {}) {
  return {
    id: "report-1",
    reportType: "firing",
    reportDate: "2026-07-20",
    shiftNumber: 2,
    revisionNumber: 1,
    status: "pending",
    payload: { rows: [] },
    totals: {},
    masterDisplayName: "Мастер ОЦ",
    submittedAt: "2026-07-20T20:30:00.000Z",
    ...overrides,
  };
}
