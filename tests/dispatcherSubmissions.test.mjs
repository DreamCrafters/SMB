import assert from "node:assert/strict";
import test from "node:test";
import {
  requestDispatcherFeed,
  submitDispatcherSubmission,
} from "../.test-build/src/services/dispatcherSubmissions.js";
import {
  describeRemoteNetworkFailure,
  getRemoteServerConnection,
} from "../.test-build/src/services/remoteServer.js";

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

test("getRemoteServerConnection warns when a LAN page targets loopback API", () => {
  const result = getRemoteServerConnection({
    baseUrl: "http://127.0.0.1:3000",
    pageHostname: "192.168.0.25",
    pageOrigin: "http://192.168.0.25:5173",
  });

  assert.equal(result.status, "configured");
  assert.match(result.warning, /LAN IP backend-сервера/);
});

test("describeRemoteNetworkFailure includes health and CORS diagnostics", () => {
  const message = describeRemoteNetworkFailure("Не удалось отправить данные.", {
    baseUrl: "http://192.168.0.103:3000",
    pageOrigin: "http://192.168.0.25:5173",
  });

  assert.match(message, /http:\/\/192\.168\.0\.103:3000\/health/);
  assert.match(message, /http:\/\/192\.168\.0\.25:5173/);
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

test("submitDispatcherSubmission reports network diagnostics on fetch failure", async () => {
  globalThis.fetch = async () => {
    throw new TypeError("Failed to fetch");
  };

  const result = await submitDispatcherSubmission(draft, {
    baseUrl: "http://192.168.0.103:3000",
  });

  assert.equal(result.status, "error");
  assert.equal(result.code, "network_error");
  assert.match(result.message, /\/health/);
  assert.match(result.message, /CORS_ORIGIN/);
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
