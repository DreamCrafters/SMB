import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  boardAssignmentAccessOptions,
  nonAdminNavigationItems,
} from "../.test-build/src/content.js";

const projectRoot = new URL("../", import.meta.url);

test("positions can combine the unified workspace with guarded admin tabs", async () => {
  assert.deepEqual(
    nonAdminNavigationItems.map(({ id }) => id),
    [
      "business.overview",
      "business.dispatcher",
      "business.work",
      "business.production_plan",
      "business.refractory_shop",
      "business.laboratory_results",
      "business.laboratory_review",
      "business.board_assignments",
      "business.user_actions",
      "business.dispatcher_form",
    ],
  );

  const appSource = await readFile(new URL("src/App.tsx", projectRoot), "utf8");
  const positionFormSource = /type AdminPositionFormState = \{([\s\S]*?)\n\};/u.exec(appSource)?.[1];

  assert.equal(positionFormSource?.includes("accountType"), false);
  assert.equal(positionFormSource?.includes("showAdminNavigation"), true);
  assert.equal(appSource.includes("<span>Базовый кабинет</span>"), false);
  assert.match(
    appSource,
    /\{nonAdminNavigationItems\s*\.filter\([\s\S]*?item\.id !== "business\.board_assignments"/u,
  );
  assert.match(
    appSource,
    /\{boardAssignmentAccessOptions\.map\(\(option\) => \(/u,
  );
  assert.match(appSource, />\s*Админ\s*</u);
  assert.match(
    appSource,
    /navigationItemsByAccountType\.admin\.map\(\(item\) => \(/u,
  );
  assert.match(
    appSource,
    /disabled=\{isSubmitting \|\| !positionsState\.canAssignAdminNavigation\}/u,
  );
  assert.match(appSource, /resolveAllowedWorkspaceKind\(/u);
  assert.match(
    appSource,
    /position\.accountType === "admin" \|\|\s*isProtectedMutationRestricted \|\|\s*positionOrderDraft !== undefined \|\|\s*isSavingPositionOrder/u,
  );
  assert.equal(appSource.includes("Сохранить порядок"), false);
  assert.match(appSource, />\s*Выше\s*</u);
  assert.match(appSource, />\s*Ниже\s*</u);

  assert.deepEqual(
    boardAssignmentAccessOptions.map(({ label }) => label),
    [
      "Поручения Совета директоров (только просмотр)",
      "Поручения Совета директоров (просмотр и создание поручений)",
      "Поручения Совета директоров (исполнение и отправка на проверку)",
      "Поручения Совета директоров (создание, приёмка и возврат на доработку)",
    ],
  );
});
