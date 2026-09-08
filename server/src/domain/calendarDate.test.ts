import assert from "node:assert/strict";
import test from "node:test";
import { readCalendarDate } from "./calendarDate.js";

test("calendar dates retain their exact stored ISO representation", () => {
  for (const value of ["2026-09-09", "2024-02-29", "2000-02-29", "2026-12-31"]) {
    assert.equal(readCalendarDate(value), value);
  }
});

test("calendar dates reject impossible days and noncanonical inputs", () => {
  for (const value of [
    "2026-02-29", "1900-02-29", "2026-04-31", "2026-00-10",
    "2026-13-10", "2026-01-00", "2026-01-32", "0099-01-01",
    "2026-9-9", "09.09.2026", " 2026-09-09", "2026-09-09 ",
    "2026-09-09T00:00:00Z", "", null, undefined, 20260909, {}, [],
  ]) {
    assert.equal(readCalendarDate(value), undefined);
  }
});
