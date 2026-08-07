import assert from "node:assert/strict";
import test from "node:test";
import {
  requestProductionBrands,
} from "../.test-build/src/services/productionBrands.js";

const originalFetch = globalThis.fetch;

test.after(() => {
  globalThis.fetch = originalFetch;
});

test("production brands service reads the shared server journal", async () => {
  const calls = [];
  const label = "ПБ-5";

  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return jsonResponse({ labels: [label] });
  };

  const listed = await requestProductionBrands({ baseUrl: "http://api.test" });

  assert.deepEqual(listed, { status: "ready", labels: [label] });
  assert.equal(calls[0].url, "http://api.test/api/production-brands");
  assert.equal(calls[0].init.method, "GET");
});

function jsonResponse(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}
