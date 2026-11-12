import assert from "node:assert/strict";
import test from "node:test";
import type { AccountCapability, AccountNavigationItem, ServerUserProfile } from "./auth.js";
import {
  applyInstanceProfile,
  filterInstanceCapabilities,
  filterInstanceNavigation,
  hasInstanceNavigationItem,
  InstanceNavigationConfigError,
  isInstanceApiPath,
  isInstanceNavigationItem,
  mergeInstanceNavigationOrder,
  readInstanceNavigation,
} from "./instanceAccess.js";
import { defaultNavigationOrder, validateNavigationSettings } from "./navigationOrder.js";
import {
  buildGeneralDirectorBoardMeetingReminder,
  buildGeneralDirectorLoginNotifications,
  readInstanceNotificationTypes,
} from "./notificationSettings.js";

// The foundation another organization starts with (задача 147): assignments, settings and the action journal.
const foundation = readInstanceNavigation(
  "business.assignments, business.director_assignments,business.board_assignments,business.collegium_assignments,business.settings,business.user_actions",
)!;

test("the instance list comes from the env and fails loudly on a wrong section", () => {
  assert.equal(readInstanceNavigation(undefined), undefined);
  assert.equal(readInstanceNavigation("  "), undefined);
  assert.deepEqual(readInstanceNavigation("business.settings,business.settings"), ["business.settings"]);
  // A value without a single section is a typo, not "every section".
  for (const value of ["business.laboratory", "admin.database", "business.settings,поручения", ",", " , ,"]) {
    assert.throws(() => readInstanceNavigation(value), InstanceNavigationConfigError, value);
  }
});

test("an unrestricted instance keeps every section and right", () => {
  const capabilities: AccountCapability[] = ["business.manage_laboratory_results", "platform.manage_users"];
  assert.deepEqual(filterInstanceNavigation(undefined, defaultNavigationOrder), defaultNavigationOrder);
  assert.deepEqual(filterInstanceCapabilities(undefined, capabilities), capabilities);
  assert.equal(isInstanceNavigationItem(undefined, "business.laboratory_results"), true);
  assert.equal(hasInstanceNavigationItem(undefined, []), true);
});

test("another organization's instance has only its sections; administrative ones always exist", () => {
  assert.deepEqual(filterInstanceNavigation(foundation, defaultNavigationOrder), [
    "business.assignments", "business.director_assignments", "business.board_assignments", "business.collegium_assignments",
    "business.settings", "business.user_actions",
    "admin.account_preview", "admin.accounts", "admin.navigation", "admin.user_actions", "admin.database",
  ]);
  for (const absent of ["business.laboratory_results", "business.railway_wagons", "business.refractory_shop", "business.production",
    "business.overview", "business.dispatcher_form", "business.warehouse_1c", "business.collegium_initiatives"] as AccountNavigationItem[]) {
    assert.equal(isInstanceNavigationItem(foundation, absent), false, absent);
  }
  assert.equal(hasInstanceNavigationItem(foundation, ["business.laboratory_results", "business.settings"]), true);
  assert.equal(hasInstanceNavigationItem(foundation, ["business.laboratory_results"]), false);
});

test("rights of absent sections are stripped, shared and platform rights stay", () => {
  const stored: AccountCapability[] = [
    "business.view_all_statistics", "business.view_dispatcher_feed", "business.view_overview_visitors",
    "business.manage_laboratory_results", "business.review_raw_material_warehouse", "business.view_laboratory_results",
    "business.submit_refractory_reports", "business.view_production", "business.view_warehouse_1c",
    "business.view_railway_wagons", "business.manage_railway_wagon_orders", "business.manage_collegium_initiatives",
    "business.manage_personnel", "business.submit_forms",
    "business.view_board_assignments", "business.create_board_assignments", "business.review_board_assignments", "business.execute_board_assignments",
    "business.view_director_assignments", "business.view_director_assignment_registry", "business.manage_director_assignments", "business.execute_director_assignments",
    "business.view_collegium_assignments", "business.manage_collegium_assignments",
    "business.manage_notification_settings", "business.view_user_actions",
    "platform.manage_users", "platform.manage_access", "platform.view_audit",
  ];
  assert.deepEqual(filterInstanceCapabilities(foundation, stored), [
    "business.view_board_assignments", "business.create_board_assignments", "business.review_board_assignments", "business.execute_board_assignments",
    "business.view_director_assignments", "business.view_director_assignment_registry", "business.manage_director_assignments", "business.execute_director_assignments",
    "business.view_collegium_assignments", "business.manage_collegium_assignments",
    "business.manage_notification_settings", "business.view_user_actions",
    "platform.manage_users", "platform.manage_access", "platform.view_audit",
  ]);
  // The dispatcher feed is shared by «Обзор» and «Диспетчерская»: one present section keeps it.
  assert.deepEqual(filterInstanceCapabilities(["business.dispatcher"], ["business.view_dispatcher_feed", "business.view_all_statistics"]), ["business.view_dispatcher_feed"]);
});

test("a session profile passes the instance gate without touching the stored one", () => {
  const profile = { userId: "u", displayName: "u", accountType: "business_owner", receivedAt: "2026-11-12T00:00:00Z", activeAccess: {
    accountId: "a", accountType: "business_owner", position: "board_chair", positionDisplayName: "Председатель", displayName: "u", scope: { kind: "organization" }, issuedAt: "2026-11-12T00:00:00Z",
    navigationItems: ["business.overview", "business.dispatcher", "business.work", "business.board_assignments", "business.assignments"],
    capabilities: ["business.view_all_statistics", "business.view_dispatcher_feed", "business.view_board_assignments", "business.review_board_assignments"],
  } } as ServerUserProfile;
  const gated = applyInstanceProfile(foundation, profile);
  assert.deepEqual(gated.activeAccess.navigationItems, ["business.board_assignments", "business.assignments"]);
  assert.deepEqual(gated.activeAccess.capabilities, ["business.view_board_assignments", "business.review_board_assignments"]);
  assert.equal(profile.activeAccess.navigationItems.length, 5);
  assert.equal(applyInstanceProfile(undefined, profile), profile);
});

test("the menu order of an instance is its own complete sequence; absent sections keep their stored places", () => {
  const catalog = filterInstanceNavigation(foundation, defaultNavigationOrder);
  const saved = [...catalog].reverse();
  assert.equal(validateNavigationSettings({ navigationOrder: saved }, catalog).ok, true);
  // The whole code base catalog, a missing section and a foreign name are not this instance's order.
  assert.equal(validateNavigationSettings({ navigationOrder: defaultNavigationOrder }, catalog).ok, false);
  assert.equal(validateNavigationSettings({ navigationOrder: saved.slice(1) }, catalog).ok, false);
  assert.equal(validateNavigationSettings({ navigationOrder: saved, navigationLabels: { "business.laboratory_results": "Лаб" } }, catalog).ok, false);
  assert.equal(validateNavigationSettings({ navigationOrder: saved, navigationLabels: { "business.assignments": "Задачи" } }, catalog).ok, true);
  const merged = mergeInstanceNavigationOrder(foundation, saved, defaultNavigationOrder);
  assert.deepEqual(merged.slice(0, saved.length), saved);
  assert.deepEqual(new Set(merged), new Set(defaultNavigationOrder));
  assert.equal(merged.length, defaultNavigationOrder.length);
  assert.equal(validateNavigationSettings({ navigationOrder: merged }).ok, true);
  assert.deepEqual(mergeInstanceNavigationOrder(undefined, saved, defaultNavigationOrder), saved);
});

test("message types and the NMOU board meeting reminder follow the instance", () => {
  assert.deepEqual(readInstanceNotificationTypes(foundation).map(({ id }) => id), ["board_assignments", "general_director_assignments", "collegium_assignments"]);
  assert.equal(readInstanceNotificationTypes(undefined).length, 12);
  assert.deepEqual(readInstanceNotificationTypes(["business.dispatcher_form"]).map(({ id }) => id), ["incidents", "visitors", "equipment_reports", "production_reports"]);
  const reminder = { position: "general_director", today: "2026-11-05" } as const;
  assert.match(buildGeneralDirectorBoardMeetingReminder(reminder) ?? "", /15 число/u);
  assert.equal(buildGeneralDirectorBoardMeetingReminder({ ...reminder, enabled: false }), undefined);
  assert.deepEqual(buildGeneralDirectorLoginNotifications({ ...reminder, overdueAssignments: [], boardMeetingReminderEnabled: false }), []);
  assert.equal(buildGeneralDirectorLoginNotifications({ ...reminder, overdueAssignments: [] }).length, 1);
});

test("the API of absent modules does not exist in the instance, even for an administrator", () => {
  for (const path of ["/api/auth/login", "/api/access/profile", "/api/admin/positions", "/api/admin/database/tables/app_users/rows", "/api/admin/audit-events",
    "/api/navigation-order", "/api/table-layouts", "/api/notification-settings/board_assignments", "/api/login-notifications",
    "/api/director-assignments", "/api/collegium-assignments/x/action", "/api/board-assignments", "/api/board-assignment-completions", "/health"]) {
    assert.equal(isInstanceApiPath(foundation, path), true, path);
  }
  for (const path of ["/api/laboratory/results", "/api/refractory-wagons", "/api/refractory-reports/x", "/api/dispatcher/submissions", "/api/business/overview",
    "/api/railway-wagons", "/api/railway-reference/stations", "/api/warehouse-1c/balances", "/api/upload-report", "/api/production-plans", "/api/production-brands",
    "/api/collegium-initiatives", "/api/collegium-meetings", "/api/personnel", "/api/admin/database/imports/dispatcher/preview", "/api/some-future-module"]) {
    assert.equal(isInstanceApiPath(foundation, path), false, path);
    assert.equal(isInstanceApiPath(undefined, path), true, path);
  }
  assert.equal(isInstanceApiPath(["business.laboratory_review"], "/api/laboratory/results"), true);
  assert.equal(isInstanceApiPath(["business.collegium_initiatives"], "/api/collegium-meetings/1"), true);
});
