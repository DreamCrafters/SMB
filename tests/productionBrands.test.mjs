import assert from "node:assert/strict";
import test from "node:test";
import {
  createProductionBrand,
  requestProductionBrands,
} from "../.test-build/src/services/productionBrands.js";

const originalFetch = globalThis.fetch;

test.after(() => {
  globalThis.fetch = originalFetch;
});

test("production brands service lists and permanently creates a label", async () => {
  const calls = [];
  const label = "ПБ-5";

  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return jsonResponse(
      init?.method === "POST" ? { label } : { labels: [label] },
      init?.method === "POST" ? 201 : 200,
    );
  };

  const listed = await requestProductionBrands({ baseUrl: "http://api.test" });
  const created = await createProductionBrand(
    { label: "ПБ-5" },
    { baseUrl: "http://api.test" },
  );

  assert.deepEqual(listed, { status: "ready", labels: [label] });
  assert.deepEqual(created, { status: "ready", label });
  assert.equal(calls[0].url, "http://api.test/api/production-brands");
  assert.equal(calls[1].init.method, "POST");
  assert.equal(calls[1].init.body, JSON.stringify({ label: "ПБ-5" }));
});

function jsonResponse(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}
