import assert from "node:assert/strict";
import test from "node:test";
import {
  deleteAdminDatabaseRow,
  requestAdminDatabaseRows,
  requestAdminDatabaseTables,
  updateAdminDatabaseRow,
} from "../.test-build/src/services/adminDatabase.js";

const originalFetch = globalThis.fetch;

test.after(() => {
  globalThis.fetch = originalFetch;
});

const table = {
  name: "dispatcher_submissions",
  rowCount: 1,
  primaryKey: ["id"],
  columns: [
    {
      name: "id",
      dataType: "varchar",
      columnType: "varchar(64)",
      nullable: false,
      primaryKey: true,
      defaultValue: null,
      extra: "",
    },
    {
      name: "summary",
      dataType: "text",
      columnType: "text",
      nullable: true,
      primaryKey: false,
      defaultValue: null,
      extra: "",
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
        },
      ],
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

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json",
    },
  });
}
