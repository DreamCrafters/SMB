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
      "business.board_assignments",
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
  // Вкладки с уровнями больше не подменяются набором галочек уровней: каждая
  // вкладка это одна галочка, а уровень выбирается списком рядом.
  assert.doesNotMatch(
    appSource,
    /\{boardAssignmentAccessOptions\.map\(\(option\) => \(/u,
  );
  assert.doesNotMatch(
    appSource,
    /\{railwayWagonAccessOptions\.map\(\(option\) => \(/u,
  );
  assert.match(appSource, /renderPositionAccessLevelSelect\(item\.id, hasTab\)/u);
  assert.match(appSource, /readPositionLevelPatch\(item\.id, isChecked, current\)/u);
  assert.equal(appSource.includes(">Админ<"), false);
  assert.equal(appSource.includes("Административные вкладки"), false);
  assert.match(appSource, /<TableHeader>Права админа<\/TableHeader>/u);
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

  // Подпись уровня не повторяет название вкладки: вкладку называет галочка.
  assert.deepEqual(
    boardAssignmentAccessOptions.map(({ label }) => label),
    [
      "Только просмотр",
      "Просмотр и создание поручений",
      "Исполнение и отправка на проверку",
      "Создание, приёмка и возврат на доработку",
    ],
  );
  assert.deepEqual(
    railwayWagonAccessOptions.map(({ id }) => id),
    ["view", "sales", "carrier", "logistics", "dispatcher"],
  );
  // Уровни есть ровно у двух вкладок, и обе описаны одним каталогом.
  assert.deepEqual(
    Object.keys(navigationAccessLevels),
    ["business.board_assignments", "business.railway_wagons"],
  );
  assert.equal(
    navigationAccessLevels["business.railway_wagons"].title,
    "Роль в разделе",
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
    /handleSetPositionNavigationAccess\(\s*\[position\.id\],\s*true,\s*event\.currentTarget\.value,\s*\)/u,
  );
  // Список уровней недоступен, пока вкладка не выдана.
  assert.match(
    appSource,
    /isSavingPositionNavigationAccess \|\| !hasAccess/u,
  );
});
