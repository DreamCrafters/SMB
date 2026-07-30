import assert from "node:assert/strict";
import test from "node:test";
import {
  accountTypeByPosition,
  navigationItemsByAccountType,
  readBoardAssignmentAccess,
  resolveCapabilitiesForPosition,
  resolveCapabilitiesForNavigation,
  validateNavigationItemsForAccountType,
} from "./accountAccessConfiguration.js";

test("executive positions use the business owner workspace", () => {
  assert.equal(accountTypeByPosition.board_chair, "business_owner");
  assert.equal(accountTypeByPosition.board_deputy_chair, "business_owner");
  assert.equal(accountTypeByPosition.board_assignment_reviewer, "business_owner");
  assert.equal(accountTypeByPosition.board_member, "business_owner");
  assert.equal(accountTypeByPosition.general_director, "business_owner");
  assert.equal(accountTypeByPosition.economist, "business_owner");
});

test("all non-admin account types share one navigation catalog", () => {
  assert.equal(
    navigationItemsByAccountType.business_owner.includes("business.user_actions"),
    false,
  );
  assert.equal(
    validateNavigationItemsForAccountType("business_owner", [
      "business.overview",
    ]),
    true,
  );
  assert.equal(
    validateNavigationItemsForAccountType("business_owner", [
      "admin.database",
    ]),
    false,
  );
  assert.equal(validateNavigationItemsForAccountType("worker", []), false);
  assert.equal(
    validateNavigationItemsForAccountType("worker", [
      "business.overview",
      "business.dispatcher_form",
    ]),
    true,
  );
  assert.equal(
    validateNavigationItemsForAccountType("business_owner", [
      "business.overview",
      "business.dispatcher",
      "business.work",
      "business.user_actions",
    ]),
    true,
  );
  assert.equal(
    validateNavigationItemsForAccountType("business_owner", [
      "business.dispatcher_form",
    ]),
    true,
  );
  assert.equal(
    validateNavigationItemsForAccountType("dispatcher", [
      "business.dispatcher_form",
    ]),
    true,
  );
  assert.equal(
    validateNavigationItemsForAccountType("dispatcher", [
      "business.overview",
      "business.production_plan",
      "business.refractory_shop",
    ]),
    true,
  );
  assert.equal(
    validateNavigationItemsForAccountType("dispatcher", ["admin.database"]),
    false,
  );
  assert.equal(
    validateNavigationItemsForAccountType("admin", ["business.overview"]),
    false,
  );
});

test("navigation selection expands only to its server capabilities", () => {
  assert.deepEqual(resolveCapabilitiesForNavigation(["admin.accounts"]), [
    "platform.manage_users",
    "platform.manage_access",
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
