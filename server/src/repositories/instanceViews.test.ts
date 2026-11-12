import assert from "node:assert/strict";
import test from "node:test";
import type { AccountNavigationItem } from "../domain/auth.js";
import { defaultNavigationOrder } from "../domain/navigationOrder.js";
import type { AccountsRepository, AdminPositionSummary } from "./accountsRepository.js";
import { createInstanceAccountsView, createInstanceNavigationOrderView } from "./instanceViews.js";
import type { NavigationOrderRepository, NavigationSettings } from "./navigationOrderRepository.js";

const instance = ["business.assignments", "business.board_assignments", "business.director_assignments", "business.settings"] as const;

const storedPosition: AdminPositionSummary = {
  id: "board_chair", displayName: "Председатель совета директоров", accountType: "business_owner",
  navigationItems: ["business.overview", "business.dispatcher", "business.railway_wagons", "business.board_assignments", "business.assignments", "admin.accounts"],
  capabilities: ["business.view_all_statistics", "business.view_overview_visitors", "business.view_railway_wagons", "business.manage_railway_wagon_orders",
    "business.view_board_assignments", "business.create_board_assignments", "business.review_board_assignments",
    "business.view_director_assignments", "business.execute_director_assignments", "platform.manage_users"],
  boardAssignmentAccess: "review", railwayWagonAccess: ["sales"], assignmentInboxAccess: ["director"], collegiumInitiativeAccess: "none",
  showOverviewVisitors: true, isProtected: false, hasAdminRights: true, adminNavigationItems: ["admin.accounts"], usageCount: 1, createdAt: "2026-11-12T00:00:00Z",
};

test("an instance reads positions and accounts without the sections it does not have (задача 147)", async () => {
  const calls: string[] = [];
  const accounts = {
    async listPositions() { return [structuredClone(storedPosition)]; },
    async updatePosition(input: { id: string }) { calls.push(`update:${input.id}`); return structuredClone(storedPosition); },
    async listAccounts() { return [{ accessId: "a", navigationItems: [...storedPosition.navigationItems], capabilities: [...storedPosition.capabilities] }]; },
    async deletePosition() { calls.push("delete"); return "deleted"; },
  } as unknown as AccountsRepository;
  const view = createInstanceAccountsView(accounts, instance);
  const [position] = await view.listPositions();
  assert.deepEqual(position.navigationItems, ["business.board_assignments", "business.assignments", "admin.accounts"]);
  assert.deepEqual(position.capabilities, ["business.view_board_assignments", "business.create_board_assignments", "business.review_board_assignments",
    "business.view_director_assignments", "business.execute_director_assignments", "platform.manage_users"]);
  // Levels are read back from what is left: the wagon role and the visitors block went with their sections.
  assert.equal(position.boardAssignmentAccess, "review");
  assert.deepEqual(position.assignmentInboxAccess, ["director"]);
  assert.equal(position.railwayWagonAccess, "none");
  assert.equal(position.showOverviewVisitors, false);
  assert.deepEqual(position.adminNavigationItems, ["admin.accounts"]);
  assert.deepEqual((await view.updatePosition({ id: "board_chair" } as never))?.navigationItems, position.navigationItems);
  const [account] = await view.listAccounts();
  assert.deepEqual(account.navigationItems, position.navigationItems);
  assert.equal(account.capabilities.includes("business.view_railway_wagons"), false);
  // Other operations reach the storage untouched.
  assert.equal(await view.deletePosition("x"), "deleted");
  assert.deepEqual(calls, ["update:board_chair", "delete"]);
  assert.equal(createInstanceAccountsView(accounts, undefined), accounts);
});

test("an instance orders and renames only its own sections; the others keep their places and names", async () => {
  let stored: NavigationSettings = { navigationOrder: [...defaultNavigationOrder], navigationLabels: { "business.laboratory_results": "Лаборатория - ввод", "business.settings": "Параметры" } };
  const repository: NavigationOrderRepository = {
    async read() { return structuredClone(stored); },
    async set(settings) { const previous = stored; stored = structuredClone(settings); return { previous, updated: structuredClone(settings) }; },
  };
  const view = createInstanceNavigationOrderView(repository, instance);
  const read = await view.read();
  assert.deepEqual(read.navigationOrder, ["business.assignments", "business.director_assignments", "business.board_assignments", "business.settings",
    "admin.account_preview", "admin.accounts", "admin.navigation", "admin.user_actions", "admin.database"]);
  assert.deepEqual(read.navigationLabels, { "business.settings": "Параметры" });

  const saved: AccountNavigationItem[] = ["business.settings", ...read.navigationOrder.filter((item) => item !== "business.settings")];
  const change = await view.set({ navigationOrder: saved, navigationLabels: { "business.assignments": "Задачи" } });
  assert.deepEqual(change.updated.navigationOrder, saved);
  assert.deepEqual(change.previous.navigationOrder, read.navigationOrder);
  assert.deepEqual(stored.navigationOrder.slice(0, saved.length), saved);
  assert.equal(stored.navigationOrder.length, defaultNavigationOrder.length);
  assert.equal(new Set(stored.navigationOrder).size, defaultNavigationOrder.length);
  assert.deepEqual(stored.navigationLabels, { "business.laboratory_results": "Лаборатория - ввод", "business.assignments": "Задачи" });
  assert.equal(createInstanceNavigationOrderView(repository, undefined), repository);
});
