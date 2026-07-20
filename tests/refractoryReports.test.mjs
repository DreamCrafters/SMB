import assert from "node:assert/strict";
import test from "node:test";
import {
  decideRefractoryReport,
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
      rows: [{
        productBrand: "ША",
        quantityPieces: 100,
        rejectCracksPieces: 2,
        rejectTotalPieces: 2,
      }],
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
  const submitted = await submitRefractoryReport(
    {
      reportType: "firing",
      reportDate: "2026-07-20",
      shiftNumber: 2,
      payload: {
        rows: [{
          productBrand: "ША",
          quantityPieces: 100,
          rejectCracksPieces: 2,
        }],
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
  assert.equal(submitted.status, "ready");
  assert.equal(decided.status, "ready");
  assert.equal(
    calls[0].url,
    "http://api.test/api/refractory-reports?date=2026-07-20&shift=2",
  );
  assert.equal(calls[1].url, "http://api.test/api/refractory-reports/pending");
  assert.deepEqual(JSON.parse(calls[3].init.body), {
    decision: "reject",
    comment: "Уточните брак",
  });
});

test("refractory report service rejects malformed server totals", async () => {
  globalThis.fetch = async () => jsonResponse({
    reports: [{
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
    }],
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
