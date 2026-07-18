import assert from "node:assert/strict";
import test from "node:test";
import {
  clearAdminDatabaseTable,
  deleteAdminDatabaseRow,
  mergeAdminDatabaseRows,
  replaceTestDatabaseWithProductionSnapshot,
  requestAdminDatabaseRows,
  requestAdminDatabaseTables,
  requestProductionSnapshotStatus,
  updateAdminDatabaseRow,
} from "../.test-build/src/services/adminDatabase.js";

const originalFetch = globalThis.fetch;

test.after(() => {
  globalThis.fetch = originalFetch;
});

const table = {
  name: "dispatcher_submissions",
  label: "Диспетчерские записи",
  rowCount: 1,
  primaryKey: ["id"],
  canDelete: true,
  canClear: true,
  canMerge: false,
  columns: [
    {
      name: "summary",
      label: "Краткое описание",
      format: "text",
      editable: true,
      multiline: true,
      nullable: true,
    },
  ],
};

test("admin database service reads tables from remote API", async () => {
  const calls = [];

  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });

    return jsonResponse({ tables: [table] });
  };

  const result = await requestAdminDatabaseTables({
    baseUrl: "http://api.test",
  });

  assert.equal(result.status, "ready");
  assert.equal(result.tables[0].name, "dispatcher_submissions");
  assert.equal(calls[0].url, "http://api.test/api/admin/database");
  assert.equal(calls[0].init.method, "GET");
});

test("admin database service builds relative rows endpoint without browser window", async () => {
  let requestedUrl = "";

  globalThis.fetch = async (url) => {
    requestedUrl = String(url);

    return jsonResponse({
      table,
      rows: [
        {
          primaryKey: {
            id: "row-id",
          },
          values: {
            id: "row-id",
            summary: "text",
          },
          editorFields: [
            {
              name: "payload.fio",
              label: "ФИО посетителя",
              inputType: "text",
              required: true,
              options: [],
              value: "Иванов Иван",
            },
          ],
        },
      ],
      mergeTargets: [],
      limit: 25,
      offset: 50,
    });
  };

  const result = await requestAdminDatabaseRows("dispatcher_submissions", {
    limit: 25,
    offset: 50,
  });

  assert.equal(result.status, "ready");
  assert.equal(
    requestedUrl,
    "/api/admin/database/tables/dispatcher_submissions/rows?limit=25&offset=50",
  );
});

test("admin database service sends update and delete mutations", async () => {
  const calls = [];

  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });

    return jsonResponse({ ok: true });
  };

  const updateResult = await updateAdminDatabaseRow("dispatcher_submissions", {
    primaryKey: {
      id: "row-id",
    },
    values: {
      summary: "updated",
    },
  });
  const deleteResult = await deleteAdminDatabaseRow("dispatcher_submissions", {
    primaryKey: {
      id: "row-id",
    },
  });

  assert.equal(updateResult.status, "ready");
  assert.equal(deleteResult.status, "ready");
  assert.equal(calls[0].init.method, "PATCH");
  assert.deepEqual(JSON.parse(calls[0].init.body), {
    primaryKey: {
      id: "row-id",
    },
    values: {
      summary: "updated",
    },
  });
  assert.equal(calls[1].init.method, "DELETE");
  assert.deepEqual(JSON.parse(calls[1].init.body), {
    primaryKey: {
      id: "row-id",
    },
    values: {},
  });
});

test("admin database service sends a merge between two existing rows", async () => {
  let request;

  globalThis.fetch = async (url, init) => {
    request = { url: String(url), init };
    return jsonResponse({ ok: true });
  };

  const result = await mergeAdminDatabaseRows("production_unformed_brands", {
    sourcePrimaryKey: { id: "brand-source" },
    targetPrimaryKey: { id: "brand-target" },
  });

  assert.deepEqual(result, { status: "ready" });
  assert.equal(
    request.url,
    "/api/admin/database/tables/production_unformed_brands/rows/merge",
  );
  assert.equal(request.init.method, "POST");
  assert.deepEqual(JSON.parse(request.init.body), {
    sourcePrimaryKey: { id: "brand-source" },
    targetPrimaryKey: { id: "brand-target" },
  });
});

test("admin database service clears an allowlisted table with explicit confirmation", async () => {
  let request;

  globalThis.fetch = async (url, init) => {
    request = { url: String(url), init };

    return jsonResponse({ ok: true, deleted: 582 });
  };

  const result = await clearAdminDatabaseTable("dispatcher_submissions");

  assert.deepEqual(result, {
    status: "ready",
    deleted: 582,
  });
  assert.equal(
    request.url,
    "/api/admin/database/tables/dispatcher_submissions/rows/all",
  );
  assert.equal(request.init.method, "DELETE");
  assert.deepEqual(JSON.parse(request.init.body), {
    confirmation: "dispatcher_submissions",
  });
});

test("admin database service checks and starts a production snapshot replacement", async () => {
  const calls = [];

  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });

    return calls.length === 1
      ? jsonResponse({
          available: true,
          inProgress: false,
          confirmationPhrase: "ЗАМЕНИТЬ ТЕСТОВУЮ БД",
        })
      : jsonResponse({
          ok: true,
          tableCount: 12,
          rowCount: 345,
          authSessionsCleared: true,
        });
  };

  const status = await requestProductionSnapshotStatus();
  const result = await replaceTestDatabaseWithProductionSnapshot(
    "ЗАМЕНИТЬ ТЕСТОВУЮ БД",
  );

  assert.deepEqual(status, {
    status: "ready",
    available: true,
    inProgress: false,
    confirmationPhrase: "ЗАМЕНИТЬ ТЕСТОВУЮ БД",
  });
  assert.deepEqual(result, {
    status: "ready",
    tableCount: 12,
    rowCount: 345,
    authSessionsCleared: true,
  });
  assert.equal(calls[0].url, "/api/admin/database/production-snapshot");
  assert.equal(calls[0].init.method, "GET");
  assert.equal(calls[1].init.method, "POST");
  assert.deepEqual(JSON.parse(calls[1].init.body), {
    confirmation: "ЗАМЕНИТЬ ТЕСТОВУЮ БД",
  });
});

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json",
    },
  });
}
