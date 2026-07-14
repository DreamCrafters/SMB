import assert from "node:assert/strict";
import test from "node:test";
import {
  executeAdminDispatcherImport,
  previewAdminDispatcherImport,
} from "../.test-build/src/services/adminDispatcherImport.js";

const originalFetch = globalThis.fetch;

test.after(() => {
  globalThis.fetch = originalFetch;
});

test("admin dispatcher import service previews a workbook without business selection", async () => {
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

    throw new Error(`Unexpected request: ${url}`);
  };

  const preview = await previewAdminDispatcherImport(
    {
      spreadsheetUrl: "https://docs.google.com/spreadsheets/d/test-sheet/edit",
    },
    { baseUrl: "http://api.test" },
  );

  assert.equal(preview.status, "ready");
  assert.equal(preview.totalRecords, 5);
  assert.equal(
    calls[0].url,
    "http://api.test/api/admin/database/imports/dispatcher/preview",
  );
  assert.equal(calls[0].init.method, "POST");
  assert.deepEqual(JSON.parse(calls[0].init.body), {
    spreadsheetUrl: "https://docs.google.com/spreadsheets/d/test-sheet/edit",
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
  assert.deepEqual(JSON.parse(request.init.body), {
    spreadsheetUrl: "https://docs.google.com/spreadsheets/d/test-sheet/edit",
    previewToken: "b".repeat(64),
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
