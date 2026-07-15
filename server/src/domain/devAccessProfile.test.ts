import assert from "node:assert/strict";
import test from "node:test";
import {
  buildDevProfile,
  isDevAccessSessionExpired,
  type DevAccessOption,
} from "./devAccessProfile.js";

const dispatcherOption: DevAccessOption = {
  position: "dispatcher",
  positionDisplayName: "Диспетчер",
  accountType: "dispatcher",
  navigationItems: ["business.dispatcher_form"],
  capabilities: ["business.submit_dispatcher_forms"],
};

test("dispatcher dev profile exposes the 07:45 MSK expiry", () => {
  const profile = buildDevProfile(
    dispatcherOption,
    "2026-07-15T04:40:00.000Z",
  );

  assert.equal(
    profile.activeAccess.expiresAt,
    "2026-07-15T04:45:00.000Z",
  );
});

test("dispatcher dev session is rejected at the daily boundary", () => {
  const isExpired = isDevAccessSessionExpired(
    {
      option: dispatcherOption,
      createdAt: "2026-07-15T04:40:00.000Z",
    },
    new Date("2026-07-15T04:45:00.000Z"),
  );

  assert.equal(isExpired, true);
});
