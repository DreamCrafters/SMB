import assert from "node:assert/strict";
import test from "node:test";
import { toSqlDateTime } from "./sqlDateTime.js";

test("SQL datetime values are UTC literals accepted by strict sql_mode", () => {
  assert.equal(toSqlDateTime("2026-10-08T02:45:58.658Z"), "2026-10-08 02:45:58.658");
  assert.equal(toSqlDateTime(new Date("2026-10-08T05:45:58.658+03:00")), "2026-10-08 02:45:58.658");
  assert.throws(() => toSqlDateTime("не дата"), /Invalid date/u);
});
