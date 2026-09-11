import assert from "node:assert/strict";
import test from "node:test";
import {
  accountTypeByPosition,
  isNavigationAccessLevel,
  navigationItemsByAccountType,
  readBoardAssignmentAccess,
  readRailwayWagonAccess,
  readRawMaterialWarehouseReviewAccess,
  resolveCapabilitiesForPosition,
  resolveCapabilitiesForNavigation,
  resolveCapabilitiesForNavigationLevel,
  resolveMaximumCapabilitiesForNavigation,
  resolveNavigationForPosition,
  validatePositionNavigationItems,
} from "./accountAccessConfiguration.js";
import { isRailwayWagonAccess } from "../contracts/railwayWagons.js";

test("a position keeps every railway role alongside board access when recomputed", () => {
  const navigationItems = [
    "business.railway_wagons",
    "business.board_assignments",
  ] as const;
  const capabilities = [
    "business.view_railway_wagons",
    "business.manage_railway_wagon_orders",
    "business.manage_railway_wagon_carriage",
    "business.view_board_assignments",
    "business.create_board_assignments",
  ] as const;
  const railwayAccess = readRailwayWagonAccess([...capabilities], [...navigationItems]);
  assert.deepEqual(railwayAccess, ["sales", "carrier"]);
  const recomputed = resolveCapabilitiesForPosition(
    "position-mixed", [...navigationItems], "create", false, false, false,
    railwayAccess,
  );
  assert.deepEqual(new Set(recomputed), new Set(capabilities));
});

test("railway access accepts legacy levels and only nonempty unique role sets", () => {
  for (const value of ["none", "view", "sales", "carrier", "logistics", "dispatcher",
    ["sales"], ["sales", "carrier"], ["sales", "carrier", "logistics", "dispatcher"]]) {
    assert.equal(isRailwayWagonAccess(value), true, JSON.stringify(value));
  }
  for (const value of [[], ["sales", "sales"], ["view", "sales"], ["none"],
    ["review"], ["sales", "platform.manage_access"], [null], {}, null, true, 1]) {
    assert.equal(isRailwayWagonAccess(value), false, JSON.stringify(value));
  }
  assert.equal(isNavigationAccessLevel("business.railway_wagons", ["sales", "carrier"]), true);
  assert.equal(isNavigationAccessLevel("business.board_assignments", ["create", "review"]), false);
  assert.equal(isNavigationAccessLevel("business.settings", ["sales"]), false);
  assert.deepEqual(resolveCapabilitiesForPosition("custom", [], "none", false, false, false,
    ["sales", "carrier"]), []);
  assert.equal(readRailwayWagonAccess(["business.manage_railway_wagon_orders"], []), "none");
});

test("executive positions use the business owner workspace", () => {
  assert.equal(accountTypeByPosition.board_chair, "business_owner");
  assert.equal(accountTypeByPosition.board_deputy_chair, "business_owner");
  assert.equal(accountTypeByPosition.board_assignment_reviewer, "business_owner");
  assert.equal(accountTypeByPosition.board_member, "business_owner");
  assert.equal(accountTypeByPosition.general_director, "business_owner");
  assert.equal(accountTypeByPosition.economist, "business_owner");
});

test("positions accept only working navigation selected by an administrator", () => {
  assert.equal(
    navigationItemsByAccountType.business_owner.includes("business.user_actions"),
    false,
  );
  assert.equal(
    validatePositionNavigationItems([
      "business.overview",
    ]),
    true,
  );
  assert.equal(
    validatePositionNavigationItems([
      "admin.database",
    ]),
    false,
  );
  assert.equal(validatePositionNavigationItems([]), true);
  assert.equal(
    validatePositionNavigationItems([
      "business.overview",
      "business.dispatcher_form",
    ]),
    true,
  );
  assert.equal(
    validatePositionNavigationItems([
      "business.overview",
      "business.dispatcher",
      "business.work",
      "business.user_actions",
    ]),
    true,
  );
  assert.equal(
    validatePositionNavigationItems([
      "business.dispatcher_form",
    ]),
    true,
  );
  assert.equal(
    validatePositionNavigationItems([
      "business.overview",
      "business.production_plan",
      "business.refractory_shop",
    ]),
    true,
  );
  assert.equal(
    validatePositionNavigationItems(["business.overview", "admin.database"]),
    false,
  );
});

test("position admin rights grant account management without root admin panels", () => {
  assert.deepEqual(
    resolveNavigationForPosition(["business.overview"], true),
    ["business.overview", "admin.accounts"],
  );
  assert.deepEqual(
    resolveCapabilitiesForPosition(
      "position-delegated-admin",
      ["business.overview"],
      "none",
      true,
    ),
    [
      "business.view_all_statistics",
      "business.view_notifications",
      "business.view_dispatcher_feed",
      "platform.manage_users",
      "platform.manage_access",
      "platform.manage_table_layouts",
      "business.view_overview_visitors",
    ],
  );
  assert.deepEqual(
    resolveNavigationForPosition(
      ["business.overview", "admin.database", "admin.user_actions"],
      true,
    ),
    ["business.overview", "admin.accounts"],
  );
});

test("system administrator keeps every navigation-derived root capability when recomputed", () => {
  assert.deepEqual(
    resolveCapabilitiesForPosition(
      "administrator",
      navigationItemsByAccountType.admin,
      "none",
      true,
    ),
    [
      "platform.manage_users",
      "platform.manage_access",
      "platform.manage_table_layouts",
      "platform.manage_navigation_order",
      "platform.manage_analytics_database",
      "platform.view_audit",
    ],
  );
});

test("navigation selection expands only to its server capabilities", () => {
  assert.deepEqual(resolveCapabilitiesForNavigation(["admin.account_preview"]), []);
  assert.deepEqual(resolveCapabilitiesForNavigation(["admin.accounts"]), [
    "platform.manage_users",
    "platform.manage_access",
    "platform.manage_table_layouts",
  ]);
  assert.deepEqual(resolveCapabilitiesForNavigation(["admin.user_actions"]), [
    "platform.view_audit",
  ]);
  assert.deepEqual(resolveCapabilitiesForNavigation(["business.user_actions"]), [
    "business.view_user_actions",
  ]);
  assert.deepEqual(resolveCapabilitiesForNavigation(["business.production_plan"]), [
    "business.manage_production_plan",
  ]);
  assert.deepEqual(resolveCapabilitiesForNavigation(["business.refractory_shop"]), [
    "business.submit_refractory_reports",
  ]);
  assert.deepEqual(resolveCapabilitiesForNavigation(["business.laboratory_results"]), [
    "business.manage_laboratory_results",
  ]);
  assert.deepEqual(resolveCapabilitiesForNavigation(["business.laboratory_review"]), [
    "business.view_laboratory_results",
  ]);
  assert.deepEqual(resolveCapabilitiesForNavigation(["business.board_assignments"]), [
    "business.view_board_assignments",
  ]);
  assert.deepEqual(resolveCapabilitiesForNavigation(["business.dispatcher_form"]), [
    "business.submit_dispatcher_forms",
    "business.view_dispatcher_feed",
    "business.review_refractory_reports",
  ]);
});

test("raw material warehouse review is a stable capability without general laboratory mutations", () => {
  assert.deepEqual(
    resolveCapabilitiesForPosition(
      "warehouse-position",
      ["business.laboratory_results"],
      "none",
      false,
      false,
      true,
    ),
    ["business.review_raw_material_warehouse"],
  );
  assert.equal(
    readRawMaterialWarehouseReviewAccess([
      "business.review_raw_material_warehouse",
    ]),
    true,
  );
});

test("board assignment actions are derived from the selected access variant", () => {
  const navigationItems = ["business.board_assignments"] as const;

  assert.deepEqual(
    resolveCapabilitiesForPosition(
      "position-observer",
      [...navigationItems],
      "view",
    ),
    [
      "business.view_board_assignments",
    ],
  );
  assert.deepEqual(
    resolveCapabilitiesForPosition(
      "position-secretary",
      [...navigationItems],
      "create",
    ),
    [
      "business.view_board_assignments",
      "business.create_board_assignments",
    ],
  );
  assert.deepEqual(
    resolveCapabilitiesForPosition(
      "position-executor",
      [...navigationItems],
      "execute",
    ),
    [
      "business.view_board_assignments",
      "business.execute_board_assignments",
    ],
  );
  assert.deepEqual(
    resolveCapabilitiesForPosition(
      "position-reviewer",
      [...navigationItems],
      "review",
    ),
    [
      "business.view_board_assignments",
      "business.create_board_assignments",
      "business.review_board_assignments",
    ],
  );
});

test("stored board assignment capabilities resolve to one editable access variant", () => {
  assert.equal(readBoardAssignmentAccess([], []), "none");
  assert.equal(
    readBoardAssignmentAccess(
      ["business.view_board_assignments"],
      ["business.board_assignments"],
    ),
    "view",
  );
  assert.equal(
    readBoardAssignmentAccess(
      [
        "business.view_board_assignments",
        "business.create_board_assignments",
      ],
      ["business.board_assignments"],
    ),
    "create",
  );
  assert.equal(
    readBoardAssignmentAccess(
      [
        "business.view_board_assignments",
        "business.execute_board_assignments",
      ],
      ["business.board_assignments"],
    ),
    "execute",
  );
  assert.equal(
    readBoardAssignmentAccess(
      [
        "business.view_board_assignments",
        "business.create_board_assignments",
        "business.review_board_assignments",
      ],
      ["business.board_assignments"],
    ),
    "review",
  );
});

test("tab preview shows every level at once, a chosen level shows only its own", () => {
  const everything = resolveMaximumCapabilitiesForNavigation(
    "business.railway_wagons",
  );
  assert.ok(everything.includes("business.manage_railway_wagon_orders"));
  assert.ok(everything.includes("business.manage_railway_wagon_carriage"));
  assert.ok(everything.includes("business.approve_railway_wagon_logistics"));
  assert.ok(everything.includes("business.confirm_railway_wagon_movement"));

  const carrier = resolveCapabilitiesForNavigationLevel(
    "business.railway_wagons",
    "carrier",
  );
  assert.ok(carrier.includes("business.view_railway_wagons"));
  assert.ok(carrier.includes("business.manage_railway_wagon_carriage"));
  assert.ok(!carrier.includes("business.manage_railway_wagon_orders"));

  // Уровень чужой вкладки не добавляет ничего.
  assert.deepEqual(
    resolveCapabilitiesForNavigationLevel("business.railway_wagons", "review"),
    resolveCapabilitiesForNavigationLevel("business.railway_wagons", "view"),
  );

  const reviewer = resolveCapabilitiesForNavigationLevel(
    "business.board_assignments",
    "review",
  );
  assert.ok(reviewer.includes("business.review_board_assignments"));
  assert.ok(reviewer.includes("business.create_board_assignments"));
  assert.ok(!reviewer.includes("business.execute_board_assignments"));
});
