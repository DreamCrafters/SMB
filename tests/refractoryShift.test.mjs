import assert from "node:assert/strict";
import test from "node:test";
import {
  readRefractoryShiftContext,
} from "../.test-build/src/services/refractoryShift.js";

test("night shift after midnight keeps the date when that shift started", () => {
  assert.deepEqual(
    readRefractoryShiftContext(new Date(2026, 6, 21, 3, 30)),
    { reportDate: "2026-07-20", shiftNumber: 2 },
  );
});

test("day and evening shifts use the current calendar date", () => {
  assert.deepEqual(
    readRefractoryShiftContext(new Date(2026, 6, 21, 8, 0)),
    { reportDate: "2026-07-21", shiftNumber: 1 },
  );
  assert.deepEqual(
    readRefractoryShiftContext(new Date(2026, 6, 21, 20, 0)),
    { reportDate: "2026-07-21", shiftNumber: 2 },
  );
});
