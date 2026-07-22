import assert from "node:assert/strict";
import test from "node:test";
import {
  requestLaboratoryReference,
  requestLaboratoryProtocolPdf,
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
          indicators: [
            { id: "al2o3", label: "Al2O3", standard: "ГОСТ 1" },
          ],
          incomingTestProfiles: [
            { label: "Глина", indicatorIds: ["al2o3"] },
          ],
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
          purpose: "Определение химического состава",
          protocolNote: "Соответствует требованиям.",
          samples: [{
            sampleIdentifier: "Вагон 12345",
            values: { al2o3: "31,4" },
          }],
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
        purpose: "Определение химического состава",
        protocolNote: "Соответствует требованиям.",
        samples: [{
          sampleIdentifier: "Вагон 12345",
          values: { al2o3: "31,4" },
        }],
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
      purpose: "Определение химического состава",
      protocolNote: "Соответствует требованиям.",
      samples: [{
        sampleIdentifier: "Вагон 12345",
        values: { al2o3: "31,4" },
      }],
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("laboratory service downloads the selected result protocol as PDF", async () => {
  const originalFetch = globalThis.fetch;
  let request;
  globalThis.fetch = async (input, init = {}) => {
    request = { url: input.toString(), init };
    return new Response(new Uint8Array([37, 80, 68, 70, 45]), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition":
          "inline; filename=\"protocol.pdf\"; filename*=UTF-8''%D0%9F%D1%80%D0%BE%D1%82%D0%BE%D0%BA%D0%BE%D0%BB.pdf",
      },
    });
  };

  try {
    const result = await requestLaboratoryProtocolPdf(
      "laboratory-result-1",
      { baseUrl: "http://api.test" },
    );

    assert.equal(result.status, "ready");
    assert.equal(result.status === "ready" ? result.filename : undefined, "Протокол.pdf");
    assert.equal(
      request.url,
      "http://api.test/api/laboratory/results/laboratory-result-1/protocol.pdf",
    );
    assert.equal(new Headers(request.init.headers).get("Accept"), "application/pdf");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
