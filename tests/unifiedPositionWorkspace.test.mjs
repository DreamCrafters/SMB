import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { nonAdminNavigationItems } from "../.test-build/src/content.js";

const projectRoot = new URL("../", import.meta.url);

test("every non-admin position uses the complete unified workspace catalog", async () => {
  assert.deepEqual(
    nonAdminNavigationItems.map(({ id }) => id),
    [
      "business.overview",
      "business.dispatcher",
    "business.work",
    "business.production_plan",
    "business.refractory_shop",
    "business.user_actions",
      "business.dispatcher_form",
    ],
  );

  const appSource = await readFile(new URL("src/App.tsx", projectRoot), "utf8");
  const positionFormSource = /type AdminPositionFormState = \{([\s\S]*?)\n\};/u.exec(appSource)?.[1];

  assert.equal(positionFormSource?.includes("accountType"), false);
  assert.equal(appSource.includes("<span>Базовый кабинет</span>"), false);
  assert.match(appSource, /\{nonAdminNavigationItems\.map\(\(item\) => \(/u);
  assert.match(
    appSource,
    /disabled=\{!canManageAccess \|\| position\.accountType === "admin"\}/u,
  );
});
