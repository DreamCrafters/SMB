import assert from "node:assert/strict";
import test from "node:test";
import {
  formatAdminDatabaseCellValue,
  hasAdminDatabaseRowActions,
} from "../.test-build/src/services/adminDatabasePresentation.js";

test("admin database presentation translates statuses and empty values", () => {
  assert.equal(formatAdminDatabaseCellValue(null, "text"), "—");
  assert.equal(formatAdminDatabaseCellValue("active", "status"), "Активен");
  assert.equal(formatAdminDatabaseCellValue("disabled", "status"), "Отключён");
  assert.equal(formatAdminDatabaseCellValue("expired", "status"), "Истекла");
  assert.equal(formatAdminDatabaseCellValue("current", "status"), "Текущая");
  assert.equal(formatAdminDatabaseCellValue("custom-status", "status"), "custom-status");
  assert.equal(
    formatAdminDatabaseCellValue("2026-07-15T08:30:00.000Z", "date"),
    "15.07.2026",
  );
});

test("admin database presentation only enables declared row actions", () => {
  assert.equal(
    hasAdminDatabaseRowActions({
      primaryKey: [],
      canDelete: false,
      columns: [
        {
          editable: false,
        },
      ],
    }),
    false,
  );
  assert.equal(
    hasAdminDatabaseRowActions({
      primaryKey: ["id"],
      canDelete: false,
      columns: [
        {
          editable: true,
        },
      ],
    }),
    true,
  );
});
