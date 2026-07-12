import assert from "node:assert/strict";
import test from "node:test";
import {
  accountTypeByPosition,
  resolveCapabilitiesForNavigation,
  validateNavigationItemsForAccountType,
} from "./accountAccessConfiguration.js";

test("executive positions use the business owner workspace", () => {
  assert.equal(accountTypeByPosition.board_chair, "business_owner");
  assert.equal(accountTypeByPosition.board_member, "business_owner");
  assert.equal(accountTypeByPosition.general_director, "business_owner");
});

test("navigation validation rejects tabs from another workspace", () => {
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
});

test("navigation selection expands only to its server capabilities", () => {
  assert.deepEqual(resolveCapabilitiesForNavigation(["admin.accounts"]), [
    "platform.manage_users",
    "platform.manage_access",
  ]);
});
