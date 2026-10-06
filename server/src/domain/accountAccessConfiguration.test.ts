import assert from "node:assert/strict";
import test from "node:test";
import {
  accountTypeByPosition,
  combinePositionAccessDefinitions,
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
import { readAssignmentInboxAccess } from "../contracts/directorAssignments.js";
import { readCollegiumInitiativeAccess } from "../contracts/collegiumInitiatives.js";

test("registry tabs send and control, «Поручения» sources execute", () => {
  assert.deepEqual(resolveCapabilitiesForPosition("general_director", ["business.director_assignments"], "none", { collegiumInitiativeAccess: "none" }),
    ["business.view_director_assignments", "business.manage_director_assignments"]);
  assert.deepEqual(resolveCapabilitiesForPosition("custom", ["business.assignments"], ["director", "collegium"], { collegiumInitiativeAccess: "none" }), [
    "business.view_director_assignments", "business.execute_director_assignments",
    "business.view_collegium_assignments", "business.execute_collegium_assignments",
  ]);
  // Sources grant nothing without the tab, and the tab grants nothing without sources.
  assert.deepEqual(resolveCapabilitiesForPosition("custom", [], ["director"], { collegiumInitiativeAccess: "none" }), []);
  assert.deepEqual(resolveCapabilitiesForPosition("custom", ["business.assignments"], "none", { collegiumInitiativeAccess: "none" }), []);
  const both = resolveCapabilitiesForPosition("custom", ["business.director_assignments", "business.assignments"], ["director"], { collegiumInitiativeAccess: "none" });
  assert.deepEqual(new Set(both), new Set(["business.view_director_assignments", "business.manage_director_assignments", "business.execute_director_assignments"]));
});

test("«Поручения» sources survive a capability round trip and validate as levels", () => {
  const navigation = ["business.assignments"] as const;
  for (const sources of [["director"], ["collegium"], ["board"], ["director", "collegium", "board"]] as const) {
    const capabilities = resolveCapabilitiesForPosition("custom", [...navigation], [...sources], { collegiumInitiativeAccess: "none" });
    assert.deepEqual(readAssignmentInboxAccess(capabilities, navigation), sources);
    assert.equal(isNavigationAccessLevel(navigation[0], [...sources]), true);
  }
  // Задача 131: the tab may stay without sources and then shows only controlled registers.
  assert.equal(isNavigationAccessLevel(navigation[0], "none"), true);
  for (const value of [[], ["director", "director"], ["send"], "director", null]) {
    assert.equal(isNavigationAccessLevel(navigation[0], value), false, JSON.stringify(value));
  }
  assert.equal(readAssignmentInboxAccess(["business.execute_director_assignments"], []), "none");
  // The view right alone, e.g. from the sending tab, is not a source.
  assert.equal(readAssignmentInboxAccess(["business.view_director_assignments"], navigation), "none");
  assert.deepEqual(resolveCapabilitiesForNavigationLevel(navigation[0], "board"), ["business.view_board_assignments", "business.execute_board_assignments"]);
  assert.deepEqual(resolveCapabilitiesForNavigationLevel(navigation[0], "unknown"), []);
  assert.deepEqual(new Set(resolveMaximumCapabilitiesForNavigation(navigation[0])), new Set([
    "business.view_director_assignments", "business.execute_director_assignments",
    "business.view_collegium_assignments", "business.execute_collegium_assignments",
    "business.view_board_assignments", "business.execute_board_assignments",
    "business.manage_director_assignments", "business.manage_collegium_assignments",
    "business.create_board_assignments", "business.review_board_assignments",
  ]));
  assert.deepEqual(resolveMaximumCapabilitiesForNavigation("business.collegium_assignments"), [
    "business.view_collegium_assignments", "business.manage_collegium_assignments",
  ]);
});

test("board execution combines with board creation or review in one position", () => {
  const navigation = ["business.assignments", "business.board_assignments"] as const;
  assert.deepEqual(new Set(resolveCapabilitiesForPosition("custom", [...navigation], ["board"], { collegiumInitiativeAccess: "none", boardAssignmentAccess: "review" })), new Set([
    "business.view_board_assignments", "business.create_board_assignments", "business.review_board_assignments", "business.execute_board_assignments",
  ]));
  assert.equal(isNavigationAccessLevel("business.board_assignments", "execute"), false);
  assert.equal(readBoardAssignmentAccess(["business.view_board_assignments", "business.execute_board_assignments"], ["business.board_assignments"]), "view");
});

test("multiple positions combine navigation and capabilities in one account", () => {
  assert.deepEqual(
    combinePositionAccessDefinitions([
      {
        accountType: "worker",
        navigationItems: ["business.work"],
        capabilities: ["business.submit_forms"],
      },
      {
        accountType: "business_owner",
        navigationItems: ["business.overview", "business.work"],
        capabilities: ["business.view_all_statistics"],
      },
    ]),
    {
      accountType: "business_owner",
      navigationItems: ["business.work", "business.overview"],
      capabilities: ["business.submit_forms", "business.view_all_statistics"],
    },
  );
});

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
    "position-mixed", [...navigationItems], "none", {
      collegiumInitiativeAccess: "none",
      boardAssignmentAccess: "create",
      hasAdminRights: false,
      showOverviewVisitors: false,
      canReviewRawMaterialWarehouse: false,
      railwayWagonAccess: railwayAccess,
    },
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
  assert.deepEqual(resolveCapabilitiesForPosition("custom", [], "none", {
    collegiumInitiativeAccess: "none",
    boardAssignmentAccess: "none",
    hasAdminRights: false,
    showOverviewVisitors: false,
    railwayWagonAccess: ["sales", "carrier"],
  }), []);
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
      { collegiumInitiativeAccess: "none", boardAssignmentAccess: "none", hasAdminRights: true },
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
      { collegiumInitiativeAccess: "none", boardAssignmentAccess: "none", hasAdminRights: true },
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
      {
        collegiumInitiativeAccess: "none",
        boardAssignmentAccess: "none",
        hasAdminRights: false,
        showOverviewVisitors: false,
        canReviewRawMaterialWarehouse: true,
      },
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
      "none",
      { collegiumInitiativeAccess: "none", boardAssignmentAccess: "view" },
    ),
    [
      "business.view_board_assignments",
    ],
  );
  assert.deepEqual(
    resolveCapabilitiesForPosition(
      "position-secretary",
      [...navigationItems],
      "none",
      { collegiumInitiativeAccess: "none", boardAssignmentAccess: "create" },
    ),
    [
      "business.view_board_assignments",
      "business.create_board_assignments",
    ],
  );
  // Board execution is a «Поручения» source, not a variant of the board tab.
  assert.deepEqual(
    resolveCapabilitiesForPosition(
      "position-executor",
      ["business.assignments"],
      ["board"],
      { collegiumInitiativeAccess: "none" },
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
      "none",
      { collegiumInitiativeAccess: "none", boardAssignmentAccess: "review" },
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
  // Execution is a «Поручения» source now; the board tab reads it as plain viewing.
  assert.equal(
    readBoardAssignmentAccess(
      [
        "business.view_board_assignments",
        "business.execute_board_assignments",
      ],
      ["business.board_assignments"],
    ),
    "view",
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

test("collegium initiative levels are cumulative and read back by the highest right", () => {
  const navigation = ["business.collegium_initiatives"] as const;
  const resolve = (level: "none" | "view" | "participant" | "secretary" | "chair") =>
    resolveCapabilitiesForPosition("custom", [...navigation], "none", {
      collegiumInitiativeAccess: level,
    });

  assert.deepEqual(resolve("view"), ["business.view_collegium_initiatives"]);
  assert.deepEqual(resolve("chair"), [
    "business.view_collegium_initiatives",
    "business.participate_collegium_initiatives",
    "business.manage_collegium_initiatives",
    "business.approve_collegium_initiatives",
  ]);
  // An enabled tab never grants less than view.
  assert.deepEqual(resolve("none"), ["business.view_collegium_initiatives"]);
  for (const level of ["view", "participant", "secretary", "chair"] as const) {
    assert.equal(readCollegiumInitiativeAccess(resolve(level), navigation), level);
    assert.equal(isNavigationAccessLevel(navigation[0], level), true);
  }
  assert.equal(isNavigationAccessLevel(navigation[0], "none"), false);
  assert.equal(isNavigationAccessLevel(navigation[0], "owner"), false);
  // Without the tab the level grants nothing and reads back as none.
  assert.deepEqual(
    resolveCapabilitiesForPosition("custom", [], "none", {
      collegiumInitiativeAccess: "chair",
    }),
    [],
  );
  assert.equal(readCollegiumInitiativeAccess(resolve("chair"), []), "none");

  // Two positions combine to the higher level.
  const combined = combinePositionAccessDefinitions([
    { accountType: "business_owner", navigationItems: [...navigation], capabilities: resolve("participant") },
    { accountType: "business_owner", navigationItems: [...navigation], capabilities: resolve("secretary") },
  ]);
  assert.equal(
    readCollegiumInitiativeAccess(combined.capabilities, combined.navigationItems),
    "secretary",
  );

  // Tab preview shows the maximum, level preview the cumulative set of that level.
  assert.deepEqual(resolveMaximumCapabilitiesForNavigation(navigation[0]), resolve("chair"));
  assert.deepEqual(resolveCapabilitiesForNavigationLevel(navigation[0], "secretary"), resolve("secretary"));
});
