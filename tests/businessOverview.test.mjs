import assert from "node:assert/strict";
import test from "node:test";
import { requestBusinessOverview } from "../.test-build/src/services/businessOverview.js";

test("requestBusinessOverview accepts the server-owned overview contract", async () => {
  const originalFetch = globalThis.fetch;
  let requestedUrl = "";

  globalThis.fetch = async (url) => {
    requestedUrl = String(url);
    return new Response(JSON.stringify({
      period: {
        monthStart: "2026-07-01",
        today: "2026-07-23",
      },
      incidents: {
        monthTotal: 12,
        monthClosed: 8,
        todayTotal: 2,
        openNow: 4,
      },
      laboratory: {
        monthTotal: 31,
        todayTotal: 3,
        sampled: { monthTotal: 18, todayTotal: 2 },
        chemicalAnalyses: { monthTotal: 14, todayTotal: 1 },
        rotaryKiln2Readings: { monthTotal: 62, todayTotal: 4 },
      },
      receivedAt: "2026-07-23T12:00:00.000Z",
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  try {
    assert.deepEqual(
      await requestBusinessOverview({ baseUrl: "http://api.test" }),
      {
        status: "ready",
        overview: {
          period: {
            monthStart: "2026-07-01",
            today: "2026-07-23",
          },
          incidents: {
            monthTotal: 12,
            monthClosed: 8,
            todayTotal: 2,
            openNow: 4,
          },
          laboratory: {
            monthTotal: 31,
            todayTotal: 3,
            sampled: { monthTotal: 18, todayTotal: 2 },
            chemicalAnalyses: { monthTotal: 14, todayTotal: 1 },
            rotaryKiln2Readings: { monthTotal: 62, todayTotal: 4 },
          },
          receivedAt: "2026-07-23T12:00:00.000Z",
        },
      },
    );
    assert.equal(requestedUrl, "http://api.test/api/business/overview");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
