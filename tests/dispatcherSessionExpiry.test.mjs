import assert from "node:assert/strict";
import test from "node:test";
import {
  getNextMoscowDispatcherLogoutAt,
  readDispatcherAutoLogoutAt,
} from "../.test-build/src/services/dispatcherSessionExpiry.js";

test("getNextMoscowDispatcherLogoutAt returns today's 07:45 MSK before the boundary", () => {
  const result = getNextMoscowDispatcherLogoutAt(
    new Date("2026-07-15T04:44:59.000Z"),
  );

  assert.equal(result.toISOString(), "2026-07-15T04:45:00.000Z");
});

test("getNextMoscowDispatcherLogoutAt returns tomorrow's 07:45 MSK at the boundary", () => {
  const result = getNextMoscowDispatcherLogoutAt(
    new Date("2026-07-15T04:45:00.000Z"),
  );

  assert.equal(result.toISOString(), "2026-07-16T04:45:00.000Z");
});

test("readDispatcherAutoLogoutAt schedules only dispatcher profiles", () => {
  const now = new Date("2026-07-15T04:40:00.000Z");
  const dispatcherDeadline = readDispatcherAutoLogoutAt(
    { accountType: "dispatcher", activeAccess: {} },
    now,
  );
  const ownerDeadline = readDispatcherAutoLogoutAt(
    { accountType: "business_owner", activeAccess: {} },
    now,
  );

  assert.equal(
    dispatcherDeadline?.toISOString(),
    "2026-07-15T04:45:00.000Z",
  );
  assert.equal(ownerDeadline, undefined);
});

test("readDispatcherAutoLogoutAt honors an earlier server session expiry", () => {
  const deadline = readDispatcherAutoLogoutAt(
    {
      accountType: "dispatcher",
      activeAccess: { expiresAt: "2026-07-15T04:42:00.000Z" },
    },
    new Date("2026-07-15T04:40:00.000Z"),
  );

  assert.equal(deadline?.toISOString(), "2026-07-15T04:42:00.000Z");
});
