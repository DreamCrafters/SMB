import assert from "node:assert/strict";
import test from "node:test";
import {
  correctProductBrand,
  deleteProductBrand,
  requestProductBrandDeletionImpact,
  requestProductBrandJournal,
  submitProductBrand,
} from "../.test-build/src/services/productBrandJournal.js";

const originalFetch = globalThis.fetch;

test.after(() => {
  globalThis.fetch = originalFetch;
});

test("product brand journal service lists, creates and corrects detailed records", async () => {
  const calls = [];
  const record = {
    id: "brand-1",
    name: "ША-8",
    description: "Шамотное изделие",
    productClass: "Формованный",
    applicationIndustry: "Металлургия",
    normativeDocument: "ГОСТ 390-2018",
    geometry: "230×114×65",
    al2o3: "30 %",
    fe2o3: "3 %",
    strength: "20 Н/мм²",
    createdAt: "2026-08-07T08:00:00.000Z",
    updatedAt: "2026-08-07T08:00:00.000Z",
  };
  const submission = {
    name: record.name,
    description: record.description,
    productClass: record.productClass,
    applicationIndustry: record.applicationIndustry,
    normativeDocument: record.normativeDocument,
    geometry: record.geometry,
    al2o3: record.al2o3,
    fe2o3: record.fe2o3,
    strength: record.strength,
  };

  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    if (String(url).endsWith("/brand-1/deletion-impact")) {
      return jsonResponse({ impact: { usageCount: 4 } });
    }
    if (init.method === "DELETE") {
      return jsonResponse({
        deletion: {
          sourceId: "brand-1",
          sourceName: "ША-8",
          replacementId: "brand-2",
          replacementName: "ШБ-5",
          updatedRecords: 4,
        },
      });
    }
    return jsonResponse(init.method === "GET" || init.method === undefined
      ? { records: [record] }
      : { record }, init.method === "POST" ? 201 : 200);
  };

  assert.deepEqual(
    await requestProductBrandJournal(
      { query: "ША" },
      { baseUrl: "http://api.test" },
    ),
    { status: "ready", records: [record] },
  );
  assert.deepEqual(
    await submitProductBrand(submission, { baseUrl: "http://api.test" }),
    { status: "ready", record },
  );
  assert.deepEqual(
    await correctProductBrand("brand-1", submission, {
      baseUrl: "http://api.test",
    }),
    { status: "ready", record },
  );
  assert.deepEqual(
    await requestProductBrandDeletionImpact("brand-1", {
      baseUrl: "http://api.test",
    }),
    { status: "ready", impact: { usageCount: 4 } },
  );
  assert.deepEqual(
    await deleteProductBrand("brand-1", "brand-2", {
      baseUrl: "http://api.test",
    }),
    {
      status: "ready",
      deletion: {
        sourceId: "brand-1",
        sourceName: "ША-8",
        replacementId: "brand-2",
        replacementName: "ШБ-5",
        updatedRecords: 4,
      },
    },
  );

  assert.equal(
    calls[0].url,
    "http://api.test/api/laboratory/product-brands?query=%D0%A8%D0%90",
  );
  assert.equal(calls[1].init.method, "POST");
  assert.equal(calls[2].init.method, "PATCH");
  assert.equal(
    calls[2].url,
    "http://api.test/api/laboratory/product-brands/brand-1",
  );
  assert.equal(
    calls[3].url,
    "http://api.test/api/laboratory/product-brands/brand-1/deletion-impact",
  );
  assert.equal(calls[4].init.method, "DELETE");
  assert.deepEqual(JSON.parse(calls[4].init.body), { replacementId: "brand-2" });
});

function jsonResponse(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}
