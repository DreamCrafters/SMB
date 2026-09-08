import assert from "node:assert/strict";
import test from "node:test";

import {
  applyAccountPreviewAccess,
  canPreviewAccounts,
  parseAccountPreviewTarget,
} from "./accountPreview.js";
import type { ServerUserProfile } from "./auth.js";

function buildAdminProfile(
  navigationItems: string[] = ["admin.account_preview", "admin.accounts"],
): ServerUserProfile {
  return {
    userId: "admin-user",
    displayName: "Администратор",
    accountType: "admin",
    activeAccess: {
      accountId: "admin-access",
      accountType: "admin",
      position: "administrator",
      positionDisplayName: "Администратор",
      displayName: "Администратор",
      scope: { kind: "platform" },
      capabilities: ["platform.manage_access"],
      navigationItems,
      issuedAt: "2026-09-08T00:00:00.000Z",
    },
    receivedAt: "2026-09-08T00:00:00.000Z",
  } as unknown as ServerUserProfile;
}

test("preview target is read from its address", () => {
  assert.deepEqual(parseAccountPreviewTarget("position:position-abc"), {
    kind: "position",
    positionId: "position-abc",
  });
  assert.deepEqual(
    parseAccountPreviewTarget("navigation:business.railway_wagons"),
    { kind: "navigation", navigationItem: "business.railway_wagons" },
  );
  assert.deepEqual(parseAccountPreviewTarget(["position:dispatcher"]), {
    kind: "position",
    positionId: "dispatcher",
  });
});

test("navigation target carries an optional level", () => {
  assert.deepEqual(
    parseAccountPreviewTarget("navigation:business.railway_wagons:carrier"),
    {
      kind: "navigation",
      navigationItem: "business.railway_wagons",
      level: "carrier",
    },
  );
  // Без уровня вкладка показывается целиком.
  assert.deepEqual(
    parseAccountPreviewTarget("navigation:business.railway_wagons"),
    { kind: "navigation", navigationItem: "business.railway_wagons" },
  );
  // Мусор вместо уровня не превращается в «вкладку целиком».
  assert.equal(
    parseAccountPreviewTarget("navigation:business.railway_wagons:Carrier 1"),
    undefined,
  );
  assert.equal(
    parseAccountPreviewTarget("navigation:business.railway_wagons:"),
    undefined,
  );
});

test("preview target rejects anything that is not an address", () => {
  for (
    const value of [
      undefined,
      "",
      "   ",
      "dispatcher",
      "position:",
      "position:Not A Slug",
      "position:../../etc",
      "navigation:business.unknown_tab",
      "capability:platform.manage_access",
      `position:${"a".repeat(400)}`,
    ]
  ) {
    assert.equal(parseAccountPreviewTarget(value), undefined, String(value));
  }
});

test("only an account holding the preview tab may preview", () => {
  assert.equal(canPreviewAccounts(buildAdminProfile()), true);
  assert.equal(
    canPreviewAccounts(buildAdminProfile(["business.dispatcher_form"])),
    false,
  );
});

test("preview swaps the working context but never the identity", () => {
  const previewed = applyAccountPreviewAccess(buildAdminProfile(), {
    position: "position-dispatcher",
    positionDisplayName: "Диспетчер",
    navigationItems: ["business.dispatcher_form"],
    capabilities: ["business.submit_dispatcher_forms"],
  });

  assert.deepEqual(previewed.activeAccess.navigationItems, [
    "business.dispatcher_form",
  ]);
  assert.deepEqual(previewed.activeAccess.capabilities, [
    "business.submit_dispatcher_forms",
  ]);
  assert.equal(previewed.activeAccess.position, "position-dispatcher");
  // Запись, сделанная в предпросмотре, подписана админом, а не сотрудником.
  assert.equal(previewed.userId, "admin-user");
  assert.equal(previewed.displayName, "Администратор");
  assert.equal(previewed.activeAccess.accountId, "admin-access");
  // Пометка доходит и до журнала действий, и до шапки.
  assert.equal(
    previewed.activeAccess.positionDisplayName,
    "Диспетчер (предпросмотр)",
  );
});
