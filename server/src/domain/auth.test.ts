import assert from "node:assert/strict";
import test from "node:test";
import {
  hasDispatcherSessionPassedDailyLogout,
  resolveAccountSessionExpiresAt,
} from "./auth.js";

test("dispatcher session expires at the nearest 07:45 MSK boundary", () => {
  const expiresAt = resolveAccountSessionExpiresAt(
    "dispatcher",
    24,
    new Date("2026-07-15T04:40:00.000Z"),
  );

  assert.equal(expiresAt.toISOString(), "2026-07-15T04:45:00.000Z");
});

test("dispatcher login after 07:45 MSK expires at the next day's boundary", () => {
  const expiresAt = resolveAccountSessionExpiresAt(
    "dispatcher",
    24,
    new Date("2026-07-15T04:46:00.000Z"),
  );

  assert.equal(expiresAt.toISOString(), "2026-07-16T04:45:00.000Z");
});

test("non-dispatcher session keeps the configured TTL", () => {
  const expiresAt = resolveAccountSessionExpiresAt(
    "business_owner",
    24,
    new Date("2026-07-15T04:40:00.000Z"),
  );

  assert.equal(expiresAt.toISOString(), "2026-07-16T04:40:00.000Z");
});

test("dispatcher session keeps an earlier configured TTL", () => {
  const expiresAt = resolveAccountSessionExpiresAt(
    "dispatcher",
    1 / 120,
    new Date("2026-07-15T04:40:00.000Z"),
  );

  assert.equal(expiresAt.toISOString(), "2026-07-15T04:40:30.000Z");
});

test("existing dispatcher session is expired after its daily logout boundary", () => {
  assert.equal(
    hasDispatcherSessionPassedDailyLogout(
      "dispatcher",
      new Date("2026-07-14T12:00:00.000Z"),
      new Date("2026-07-15T04:45:00.000Z"),
    ),
    true,
  );
});

test("daily dispatcher boundary does not expire other account types", () => {
  assert.equal(
    hasDispatcherSessionPassedDailyLogout(
      "business_owner",
      new Date("2026-07-14T12:00:00.000Z"),
      new Date("2026-07-15T04:45:00.000Z"),
    ),
    false,
  );
});
