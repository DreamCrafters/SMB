import assert from "node:assert/strict";
import test from "node:test";
import {
  executeAdminDispatcherImport,
  previewAdminDispatcherImport,
  requestAdminDispatcherImportOptions,
} from "../.test-build/src/services/adminDispatcherImport.js";

const originalFetch = globalThis.fetch;

test.after(() => {
  globalThis.fetch = originalFetch;
});

test("admin dispatcher import service reads options and previews a workbook", async () => {
  const calls = [];

  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });

    if (String(url).endsWith("/preview")) {
      return jsonResponse({
        previewToken: "a".repeat(64),
        totalRecords: 5,
        newRecords: 4,
        existingRecords: 1,
        sheets: [
          {
            sheetName: "Оборудование",
            sourceRows: 2,
            importRecords: 2,
            skippedRows: 0,
          },
          {
            sheetName: "Инциденты",
            sourceRows: 1,
            importRecords: 2,
            skippedRows: 0,
          },
          {
            sheetName: "Посетители",
            sourceRows: 1,
            importRecords: 1,
            skippedRows: 0,
          },
        ],
        warnings: [],
      });
    }

    return jsonResponse({
      businessAccounts: [{ id: "business-main", displayName: "Основной бизнес" }],
    });
  };

  const options = await requestAdminDispatcherImportOptions({
    baseUrl: "http://api.test",
  });
  const preview = await previewAdminDispatcherImport(
    {
      spreadsheetUrl: "https://docs.google.com/spreadsheets/d/test-sheet/edit",
      businessAccountId: "business-main",
    },
    { baseUrl: "http://api.test" },
  );

  assert.equal(options.status, "ready");
  assert.equal(preview.status, "ready");
  assert.equal(preview.totalRecords, 5);
  assert.equal(
    calls[0].url,
    "http://api.test/api/admin/database/imports/dispatcher",
  );
  assert.equal(calls[1].init.method, "POST");
  assert.deepEqual(JSON.parse(calls[1].init.body), {
    spreadsheetUrl: "https://docs.google.com/spreadsheets/d/test-sheet/edit",
    businessAccountId: "business-main",
  });
});

test("admin dispatcher import service sends the preview token on execute", async () => {
  let request;

  globalThis.fetch = async (url, init) => {
    request = { url: String(url), init };
    return jsonResponse({ totalRecords: 5, inserted: 4, skipped: 1 });
  };

  const result = await executeAdminDispatcherImport(
    {
      spreadsheetUrl: "https://docs.google.com/spreadsheets/d/test-sheet/edit",
      businessAccountId: "business-main",
      previewToken: "b".repeat(64),
    },
    { baseUrl: "http://api.test" },
  );

  assert.equal(result.status, "ready");
  assert.equal(result.inserted, 4);
  assert.equal(
    request.url,
    "http://api.test/api/admin/database/imports/dispatcher/execute",
  );
  assert.equal(JSON.parse(request.init.body).previewToken, "b".repeat(64));
});

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json",
    },
  });
}
