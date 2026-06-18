import assert from "node:assert/strict";
import test from "node:test";
import {
  requestDispatcherFeed,
  submitDispatcherSubmission,
} from "../.test-build/src/services/dispatcherSubmissions.js";
import { getRemoteServerConnection } from "../.test-build/src/services/remoteServer.js";

const originalFetch = globalThis.fetch;

test.after(() => {
  globalThis.fetch = originalFetch;
});

const draft = {
  businessAccountId: "business-id",
  period: "2026-06",
  metricCode: "dispatcher.metric",
  rawValue: "42",
  comment: "server validates this",
};

const submission = {
  ...draft,
  id: "submission-id",
  status: "received",
  submittedByAccountId: "dispatcher-access-id",
  submittedAt: "2026-06-18T00:00:00.000Z",
  receivedAt: "2026-06-18T00:00:01.000Z",
};

test("getRemoteServerConnection reports missing remote server without URL", () => {
  const result = getRemoteServerConnection({ baseUrl: "" });

  assert.equal(result.status, "missing");
});

test("submitDispatcherSubmission reports not configured without remote URL", async () => {
  const result = await submitDispatcherSubmission(draft, { baseUrl: "" });

  assert.equal(result.status, "error");
  assert.equal(result.code, "server_not_configured");
});

test("submitDispatcherSubmission posts draft to remote server", async () => {
  let request;

  globalThis.fetch = async (endpoint, init) => {
    request = { endpoint, init };

    return new Response(JSON.stringify({ submission }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  const result = await submitDispatcherSubmission(draft, {
    baseUrl: "https://api.example.test/",
  });

  assert.equal(result.status, "ready");
  assert.equal(request.endpoint, "https://api.example.test/api/dispatcher/submissions");
  assert.equal(request.init.method, "POST");
  assert.equal(request.init.credentials, "include");
  assert.deepEqual(JSON.parse(request.init.body), draft);
});

test("requestDispatcherFeed reads live history from remote server", async () => {
  let request;

  globalThis.fetch = async (endpoint, init) => {
    request = { endpoint, init };

    return new Response(
      JSON.stringify({
        submissions: [submission],
        receivedAt: "2026-06-18T00:00:02.000Z",
      }),
      {
        status: 200,
        headers: { "content-type": "application/json" },
      },
    );
  };

  const result = await requestDispatcherFeed({
    baseUrl: "https://api.example.test",
  });

  assert.equal(result.status, "ready");
  assert.equal(result.submissions.length, 1);
  assert.equal(request.endpoint, "https://api.example.test/api/dispatcher/submissions");
  assert.equal(request.init.method, "GET");
});

test("requestDispatcherFeed rejects unsupported remote payloads", async () => {
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ rows: [] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });

  const result = await requestDispatcherFeed({
    baseUrl: "https://api.example.test",
  });

  assert.equal(result.status, "error");
  assert.equal(result.code, "invalid_response");
});
