import assert from "node:assert/strict";
import test from "node:test";
import {
  recordAuditScreenView,
  requestAdminAuditReport,
} from "../.test-build/src/services/adminAudit.js";

const originalFetch = globalThis.fetch;

test.after(() => {
  globalThis.fetch = originalFetch;
});

const actor = {
  userId: "user-1",
  accountId: "access-1",
  login: "ivanov",
  displayName: "Иванов Иван",
  positionDisplayName: "Диспетчер",
};

test("admin audit service sends compact filters and hides events outside the report window", async () => {
  let requestedUrl = "";
  globalThis.fetch = async (url) => {
    requestedUrl = String(url);
    return jsonResponse({
      events: [
        {
          id: "event-current",
          actor,
          category: "navigation",
          action: "view.screen",
          outcome: "success",
          summary: "Открыт экран «Форма»",
          details: [],
          occurredAt: "2026-07-15T08:00:00.000Z",
        },
        {
          id: "event-old",
          actor,
          category: "navigation",
          action: "view.screen",
          outcome: "success",
          summary: "Старая запись",
          details: [],
          occurredAt: "2026-04-15T08:00:00.000Z",
        },
      ],
      actors: [{ ...actor, status: "active", lastEventAt: "2026-07-15T08:00:00.000Z" }],
      summary: {
        total: 1,
        byCategory: [
          { category: "authentication", count: 0 },
          { category: "navigation", count: 1 },
          { category: "form_submission", count: 0 },
          { category: "data_change", count: 0 },
          { category: "administration", count: 0 },
        ],
      },
      window: {
        from: "2026-04-16T00:00:00.000Z",
        to: "2026-07-16T00:00:00.000Z",
      },
      limit: 25,
      offset: 50,
    });
  };

  const result = await requestAdminAuditReport({
    baseUrl: "http://api.test",
    actorAccountId: "access-1",
    category: "navigation",
    limit: 25,
    offset: 50,
  });

  assert.equal(result.status, "ready");
  assert.deepEqual(result.events.map((event) => event.id), ["event-current"]);
  assert.equal(
    requestedUrl,
    "http://api.test/api/admin/audit-events?actorAccountId=access-1&category=navigation&limit=25&offset=50",
  );
});

test("screen view service sends only the allowlisted screen id", async () => {
  let request;
  globalThis.fetch = async (url, init) => {
    request = { url: String(url), init };
    return jsonResponse({ ok: true }, 201);
  };

  const result = await recordAuditScreenView("admin.user_actions", {
    baseUrl: "http://api.test",
  });

  assert.equal(result.status, "ready");
  assert.equal(request.url, "http://api.test/api/audit/events");
  assert.equal(request.init.method, "POST");
  assert.deepEqual(JSON.parse(request.init.body), {
    screenId: "admin.user_actions",
  });
});

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}
