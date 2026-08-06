import assert from "node:assert/strict";
import test from "node:test";
import {
  requestLaboratoryReference,
  requestLaboratoryProtocolPdf,
  requestLaboratoryResults,
  submitLaboratoryResult,
} from "../.test-build/src/services/laboratoryResults.js";
import {
  assignLaboratoryBank,
  requestLaboratoryBanks,
} from "../.test-build/src/services/laboratoryBanks.js";
import {
  requestLaboratoryChemicalAnalysisDraft,
  requestLaboratoryChemicalAnalysisProtocolPdf,
} from "../.test-build/src/services/laboratoryChemicalAnalysisJournal.js";

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
    const byName = await requestLaboratoryResults(
      { nameQuery: "Глина", dateTo: "2026-07-31" },
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
    assert.equal(byName.status, "ready");
    assert.equal(saved.status, "ready");
    assert.equal(saved.status === "ready" ? saved.result.id : undefined, "laboratory-result-1");
    assert.equal(
      calls[1].url,
      "http://api.test/api/laboratory/results?section=incoming&dateFrom=2026-07-01&material=%D0%93%D0%BB%D0%B8%D0%BD%D0%B0",
    );
    assert.equal(
      calls[2].url,
      "http://api.test/api/laboratory/results?dateTo=2026-07-31&name=%D0%93%D0%BB%D0%B8%D0%BD%D0%B0",
    );
    assert.deepEqual(JSON.parse(calls[3].init.body), {
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

test("chemical analysis service reads the next editable analysis number", async () => {
  const originalFetch = globalThis.fetch;
  let request;
  globalThis.fetch = async (input, init = {}) => {
    request = { url: input.toString(), init };
    return jsonResponse({
      laboratoryAnalysisNumber: "44",
      laboratoryAssistants: ["Петрова П.П.", "Иванова А.А."],
    });
  };

  try {
    const result = await requestLaboratoryChemicalAnalysisDraft({
      baseUrl: "http://api.test",
    });

    assert.deepEqual(result, {
      status: "ready",
      laboratoryAnalysisNumber: "44",
      laboratoryAssistants: ["Петрова П.П.", "Иванова А.А."],
    });
    assert.equal(
      request.url,
      "http://api.test/api/laboratory/chemical-analysis-draft",
    );
    assert.equal(request.init.method, "GET");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("chemical analysis service downloads a protocol for the active history filters", async () => {
  const originalFetch = globalThis.fetch;
  let request;
  globalThis.fetch = async (input, init = {}) => {
    request = { url: input.toString(), init };
    return new Response(new Uint8Array([37, 80, 68, 70, 45]), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition":
          "inline; filename=\"protocol.pdf\"; filename*=UTF-8''%D0%9F%D1%80%D0%BE%D1%82%D0%BE%D0%BA%D0%BE%D0%BB%20%D0%BE%D1%82%D0%B1%D0%BE%D1%80%D0%B0%20%D0%BF%D1%80%D0%BE%D0%B1.pdf",
      },
    });
  };

  try {
    const result = await requestLaboratoryChemicalAnalysisProtocolPdf(
      {
        dateFrom: "2026-07-01",
        dateTo: "2026-07-31",
        query: "П-42",
      },
      { baseUrl: "http://api.test" },
    );

    assert.equal(result.status, "ready");
    assert.equal(
      result.status === "ready" ? result.filename : undefined,
      "Протокол отбора проб.pdf",
    );
    assert.equal(
      request.url,
      "http://api.test/api/laboratory/chemical-analysis-journal/protocol.pdf?dateFrom=2026-07-01&dateTo=2026-07-31&query=%D0%9F-42",
    );
    assert.equal(new Headers(request.init.headers).get("Accept"), "application/pdf");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("laboratory banks service reads assignments and submits a kiln journal material", async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  const assignment = {
    assignmentId: "assignment-1",
    bankNumber: 1,
    materialLabel: "ШКИ-66",
    bulkDensityTonsPerCubicMeter: 1.16,
    bulkDensitySource: "rotary_kiln_2_journal",
    bulkDensitySampleCount: 10,
    assignedByDisplayName: "Иванова Анна",
    assignedAt: "2026-07-23T08:00:00.000Z",
  };
  const legacyAssignment = {
    assignmentId: "assignment-legacy",
    bankNumber: 2,
    materialLabel: "ШГР-28",
    bulkDensityTonsPerCubicMeter: 1.09,
    bulkDensitySource: "laboratory_result",
    laboratoryResultId: "result-1",
    sampleIndex: 0,
    sampleIdentifier: "Неформованные изделия",
    assignedByDisplayName: "Иванова Анна",
    assignedAt: "2026-07-22T08:00:00.000Z",
  };
  globalThis.fetch = async (input, init = {}) => {
    requests.push({ url: input.toString(), init });
    return init.method === "POST"
      ? jsonResponse({ assignment }, 201)
      : jsonResponse({
          currentAssignments: [assignment],
          history: [assignment, legacyAssignment],
          availableMaterials: [{
            material: "ШКИ-66",
            averageBulkDensityTonsPerCubicMeter: 1.16,
            sampleCount: 10,
            latestRecordDate: "2026-07-30",
          }],
        });
  };

  try {
    const loaded = await requestLaboratoryBanks({ baseUrl: "http://api.test" });
    const saved = await assignLaboratoryBank({
      bankNumber: 1,
      material: "ШКИ-66",
    }, { baseUrl: "http://api.test" });

    assert.equal(loaded.status, "ready");
    assert.equal(loaded.availableMaterials[0]?.sampleCount, 10);
    assert.equal(loaded.history[1]?.bulkDensitySource, "laboratory_result");
    assert.equal(saved.status, "ready");
    assert.deepEqual(JSON.parse(requests[1].init.body), {
      bankNumber: 1,
      material: "ШКИ-66",
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
