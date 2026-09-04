import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  boardAssignmentAccessOptions,
  nonAdminNavigationItems,
} from "../.test-build/src/content.js";

const projectRoot = new URL("../", import.meta.url);

test("position form edits working tabs while admin rights are managed separately", async () => {
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
      "business.warehouse_1c",
      "business.settings",
      "business.user_actions",
      "business.dispatcher_form",
    ],
  );

  const appSource = await readFile(new URL("src/App.tsx", projectRoot), "utf8");
  const positionFormSource = /type AdminPositionFormState = \{([\s\S]*?)\n\};/u.exec(appSource)?.[1];

  assert.equal(positionFormSource?.includes("accountType"), false);
  assert.equal(positionFormSource?.includes("showAdminNavigation"), false);
  assert.equal(appSource.includes("<span>Базовый кабинет</span>"), false);
  // Список рабочих вкладок должности учитывает переименование разделов.
  assert.match(
    appSource,
    /applyNavigationLabels\(nonAdminNavigationItems, navigationLabels\)\s*\.filter\([\s\S]*?item\.id !== "business\.board_assignments"/u,
  );
  assert.match(
    appSource,
    /\{boardAssignmentAccessOptions\.map\(\(option\) => \(/u,
  );
  assert.equal(appSource.includes(">Админ<"), false);
  assert.equal(appSource.includes("Административные вкладки"), false);
  assert.match(appSource, /<th>Права админа<\/th>/u);
  assert.match(appSource, /aria-label=\{`Права админа для должности/u);
  assert.doesNotMatch(appSource, /positionForm\.navigationItems\.length === 0/u);
  assert.doesNotMatch(
    appSource,
    /Перед отключением прав админа добавьте должности рабочую вкладку/u,
  );
  assert.match(appSource, /resolveAllowedWorkspaceKind\(/u);
  assert.match(
    appSource,
    /position\.accountType === "admin" \|\|\s*isProtectedMutationRestricted \|\|\s*positionOrderDraft !== undefined \|\|\s*isSavingPositionOrder/u,
  );
  assert.doesNotMatch(
    appSource,
    /admin-position-order-actions[\s\S]{0,500}Сохранить порядок/u,
  );
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
