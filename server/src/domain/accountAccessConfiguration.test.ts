import assert from "node:assert/strict";
import test from "node:test";
import {
  accountTypeByPosition,
  navigationItemsByAccountType,
  resolveCapabilitiesForNavigation,
  validateNavigationItemsForAccountType,
} from "./accountAccessConfiguration.js";

test("executive positions use the business owner workspace", () => {
  assert.equal(accountTypeByPosition.board_chair, "business_owner");
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
});
