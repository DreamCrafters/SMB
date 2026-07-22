import assert from "node:assert/strict";
import test from "node:test";
import {
  requestLaboratoryReference,
  requestLaboratoryResults,
  submitLaboratoryResult,
} from "../.test-build/src/services/laboratoryResults.js";

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

test("laboratory service reads reference, filtered history, and saved result", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (input, init = {}) => {
    const url = input.toString();
    calls.push({ url, init });

    if (url.endsWith("/api/laboratory/reference")) {
      return jsonResponse({
        reference: {
          incomingMaterials: [{
            label: "Глина",
            indicators: [{ id: "al2o3", label: "Al2O3", standard: "ГОСТ 1" }],
          }],
          finishedProductTypes: [],
        },
      });
    }
    if (init.method === "POST") {
      return jsonResponse({
        result: {
          id: "laboratory-result-1",
          section: "incoming",
          analysisDate: "2026-07-22",
          materialLabel: "Глина",
          sampleIdentifier: "Вагон 12345",
          values: { al2o3: "31,4" },
          laboratoryAssistantDisplayName: "Иванова Анна",
          createdAt: "2026-07-22T08:30:00.000Z",
        },
      }, 201);
    }
    return jsonResponse({ results: [] });
  };

  try {
    const reference = await requestLaboratoryReference({ baseUrl: "http://api.test" });
    const history = await requestLaboratoryResults(
      { section: "incoming", dateFrom: "2026-07-01", materialLabel: "Глина" },
      { baseUrl: "http://api.test" },
    );
    const saved = await submitLaboratoryResult(
      {
        section: "incoming",
        analysisDate: "2026-07-22",
        materialLabel: "Глина",
        sampleIdentifier: "Вагон 12345",
        values: { al2o3: "31,4" },
      },
      { baseUrl: "http://api.test" },
    );

    assert.equal(reference.status, "ready");
    assert.equal(history.status, "ready");
    assert.equal(saved.status, "ready");
    assert.equal(saved.status === "ready" ? saved.result.id : undefined, "laboratory-result-1");
    assert.equal(
      calls[1].url,
      "http://api.test/api/laboratory/results?section=incoming&dateFrom=2026-07-01&material=%D0%93%D0%BB%D0%B8%D0%BD%D0%B0",
    );
    assert.deepEqual(JSON.parse(calls[2].init.body), {
      section: "incoming",
      analysisDate: "2026-07-22",
      materialLabel: "Глина",
      sampleIdentifier: "Вагон 12345",
      values: { al2o3: "31,4" },
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
