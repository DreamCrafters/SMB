import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  boardAssignmentAccessOptions,
  nonAdminNavigationItems,
} from "../.test-build/src/content.js";

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
      "business.laboratory_results",
      "business.board_assignments",
      "business.user_actions",
      "business.dispatcher_form",
    ],
  );

  const appSource = await readFile(new URL("src/App.tsx", projectRoot), "utf8");
  const positionFormSource = /type AdminPositionFormState = \{([\s\S]*?)\n\};/u.exec(appSource)?.[1];

  assert.equal(positionFormSource?.includes("accountType"), false);
  assert.equal(appSource.includes("<span>Базовый кабинет</span>"), false);
  assert.match(
    appSource,
    /\{nonAdminNavigationItems\s*\.filter\([\s\S]*?item\.id !== "business\.board_assignments"/u,
  );
  assert.match(
    appSource,
    /\{boardAssignmentAccessOptions\.map\(\(option\) => \(/u,
  );
  assert.match(
    appSource,
    /disabled=\{!canManageAccess \|\| position\.accountType === "admin"\}/u,
  );
  assert.match(appSource, /"Сохранить порядок"/u);
  assert.match(appSource, />\s*Выше\s*</u);
  assert.match(appSource, />\s*Ниже\s*</u);
  assert.match(
    appSource,
    /saveAdminPositionOrder\(\s*positionOrderDraft\.map\(\(position\) => position\.id\)/u,
  );

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
