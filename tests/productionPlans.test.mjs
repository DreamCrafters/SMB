import assert from "node:assert/strict";
import test from "node:test";
import {
  requestProductionDailyPlan,
  requestProductionPlan,
  requestProductionPlanPreview,
  saveProductionPlan,
} from "../.test-build/src/services/productionPlans.js";

const originalFetch = globalThis.fetch;

test.after(() => {
  globalThis.fetch = originalFetch;
});

test("production plan service previews, saves and reads server-owned plans", async () => {
  const calls = [];
  const monthlyPlans = {
    forming: 1_000,
    sorting: 800,
    unformed: 500,
    chamotte: 200,
  };
  const plan = {
    revisionId: "revision-1",
    month: "2026-07",
    monthlyPlans,
    workingDayCount: 3,
    dailyPlans: [
      { date: "2026-07-01", values: { forming: 334, sorting: 267, unformed: 167, chamotte: 67 } },
      { date: "2026-07-02", values: { forming: 334, sorting: 267, unformed: 167, chamotte: 67 } },
      { date: "2026-07-03", values: { forming: 332, sorting: 266, unformed: 166, chamotte: 66 } },
    ],
    createdByUserId: "economist-user",
    createdAt: "2026-07-17T10:00:00.000Z",
  };
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });

    if (String(url).endsWith("/preview")) {
      return jsonResponse({
        month: "2026-07",
        monthlyPlans,
        workingDayCount: 23,
        suggestedWorkingDates: ["2026-07-01", "2026-07-02"],
      });
    }

    if (String(url).includes("/daily?date=")) {
      return jsonResponse({
        plan: {
          date: "2026-07-01",
          values: { forming: 334, sorting: 267, unformed: 167, chamotte: 67 },
        },
      });
    }

    return jsonResponse({ plan }, init?.method === "POST" ? 201 : 200);
  };

  const preview = await requestProductionPlanPreview(
    { month: "2026-07", monthlyPlans },
    { baseUrl: "http://api.test" },
  );
  const saved = await saveProductionPlan(
    {
      month: "2026-07",
      monthlyPlans,
      workingDates: ["2026-07-01", "2026-07-02", "2026-07-03"],
    },
    { baseUrl: "http://api.test" },
  );
  const loaded = await requestProductionPlan("2026-07", {
    baseUrl: "http://api.test",
  });
  const daily = await requestProductionDailyPlan("2026-07-01", {
    baseUrl: "http://api.test",
  });

  assert.equal(preview.status, "ready");
  assert.equal(preview.workingDayCount, 23);
  assert.equal(saved.status, "ready");
  assert.equal(saved.plan.dailyPlans.at(-1).values.forming, 332);
  assert.equal(loaded.status, "ready");
  assert.deepEqual(loaded.plan.monthlyPlans, monthlyPlans);
  assert.equal(daily.status, "ready");
  assert.deepEqual(daily.plan, {
    date: "2026-07-01",
    values: { forming: 334, sorting: 267, unformed: 167, chamotte: 67 },
  });
  assert.equal(calls[0].url, "http://api.test/api/production-plans/preview");
  assert.equal(calls[0].init.method, "POST");
  assert.equal(calls[2].url, "http://api.test/api/production-plans?month=2026-07");
  assert.equal(
    calls[3].url,
    "http://api.test/api/production-plans/daily?date=2026-07-01",
  );
});

function jsonResponse(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}
