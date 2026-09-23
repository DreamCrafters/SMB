import assert from "node:assert/strict";
import test from "node:test";
import { canUseRootDevAccess } from "./adminAccountProtection.js";
import { buildDefaultDevAccessOptions, buildDevProfile } from "./devAccessProfile.js";
import type { ServerUserProfile } from "./auth.js";

test("dev root authority follows trusted session capabilities rather than fixed account IDs", () => {
  const option = buildDefaultDevAccessOptions().find(item => item.accountType === "admin")!;
  const profile = buildDevProfile(option, new Date().toISOString()) as ServerUserProfile;
  profile.userId = "different-dev-user";
  profile.activeAccess.accountId = "different-dev-access";
  assert.equal(canUseRootDevAccess(profile, "dev", true), true);
  assert.equal(canUseRootDevAccess(profile, "auth", true), false);
  assert.equal(canUseRootDevAccess(profile, "dev", false), false);
  profile.activeAccess.capabilities = ["platform.manage_users", "platform.manage_access"];
  profile.userId = "dev-user-admin";
  profile.activeAccess.accountId = "dev-access-admin";
  assert.equal(canUseRootDevAccess(profile, "dev", true), false);
});
