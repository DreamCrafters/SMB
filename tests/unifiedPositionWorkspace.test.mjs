import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  boardAssignmentAccessOptions,
  navigationAccessLevels,
  nonAdminNavigationItems,
  railwayWagonAccessOptions,
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
      "business.assignments",
      "business.director_assignments",
      "business.personnel",
      "business.board_assignments",
      "business.collegium_assignments",
      "business.collegium_initiatives",
      "business.warehouse_1c",
      "business.railway_wagons",
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
    /applyNavigationLabels\(nonAdminNavigationItems, navigationLabels\)\s*\.map\(\(item\) => \{/u,
  );
  // Каждая вкладка выдаётся отдельно; роли настраиваются рядом с ней.
  assert.doesNotMatch(
    appSource,
    /\{boardAssignmentAccessOptions\.map\(\(option\) => \(/u,
  );
  assert.doesNotMatch(
    appSource,
    /\{railwayWagonAccessOptions\.map\(\(option\) => \(/u,
  );
  assert.match(appSource, /renderPositionAccessControls\(item\.id, hasTab\)/u);
  assert.match(appSource, /readPositionLevelPatch\(item\.id, isChecked, current\)/u);
  assert.equal(appSource.includes(">Админ<"), false);
  assert.equal(appSource.includes("Административные вкладки"), false);
  // Admin sections are a separate group of the form, shown only to the root admin.
  assert.match(appSource, /<TableHeader>Права администратора<\/TableHeader>/u);
  assert.match(appSource, /\{canAssignAdminNavigation \? \(\s*<fieldset className="admin-account-navigation-fieldset admin-position-admin-rights">\s*<legend>Права администратора<\/legend>/u);
  assert.match(appSource, /applyNavigationLabels\(navigationItemsByAccountType\.admin, navigationLabels\)/u);
  assert.match(positionFormSource ?? "", /adminNavigationItems: AccountNavigationItem\[\]/u);
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
  assert.doesNotMatch(appSource, />\s*Выше\s*</u);
  assert.doesNotMatch(appSource, />\s*Ниже\s*</u);

  // Подпись уровня не повторяет название вкладки: вкладку называет галочка.
  assert.deepEqual(
    boardAssignmentAccessOptions.map(({ label }) => label),
    [
      "Только просмотр",
      "Просмотр и создание поручений",
      "Создание, приёмка и возврат на доработку",
    ],
  );
  assert.deepEqual(
    railwayWagonAccessOptions.map(({ id }) => id),
    ["view", "sales", "carrier", "logistics", "dispatcher"],
  );
  // Режимы и уровни рабочих вкладок описаны одним каталогом.
  assert.deepEqual(
    Object.keys(navigationAccessLevels),
    ["business.assignments", "business.board_assignments", "business.railway_wagons", "business.collegium_initiatives"],
  );
  assert.equal(
    navigationAccessLevels["business.railway_wagons"].title,
    "Роли в разделе",
  );
});

test("bulk tab access assigns the level next to the access checkbox", async () => {
  const appSource = await readFile(new URL("src/App.tsx", projectRoot), "utf8");

  // Столбец уровня появляется только у вкладок, где доступ делится на уровни.
  assert.match(
    appSource,
    /selectedNavigationAccessLevels === undefined \? null : \(\s*<TableHeader>\{selectedNavigationAccessLevels\.title\}<\/TableHeader>/u,
  );
  assert.match(appSource, /className="admin-position-navigation-access-level"/u);
  // Смена уровня сохраняет вкладку включённой и шлёт сам уровень.
  assert.match(
    appSource,
    /handleSetPositionNavigationAccess\(\s*\[position\.id\],\s*true,\s*event\.currentTarget\.value as\s*\|?\s*BoardAssignmentAccess[\s|A-Za-z]*,\s*\)/u,
  );
  // Список уровней недоступен, пока вкладка не выдана.
  assert.match(
    appSource,
    /isSavingPositionNavigationAccess \|\| !hasAccess/u,
  );
});
