import assert from "node:assert/strict";
import test from "node:test";
import {
  canRequestDispatcherForms,
  canSubmitDispatcherForms,
} from "../.test-build/src/services/accessGuards.js";

function buildProfile(accountType, capabilities) {
  return {
    userId: `${accountType}-user`,
    displayName: accountType,
    accountType,
    activeAccess: {
      accountId: `${accountType}-access`,
      accountType,
      displayName: `${accountType} access`,
      scope: {
        kind: "department",
        businessAccountId: "business-id",
        departmentId: "department-id",
      },
      capabilities,
      issuedAt: "2026-06-21T00:00:00.000Z",
    },
    businessAccounts: [],
    departments: [],
    organizationStructureMode: "current",
    receivedAt: "2026-06-21T00:00:00.000Z",
  };
}

test("worker submit forms capability does not grant dispatcher form access", () => {
  const profile = buildProfile("worker", ["business.submit_forms"]);

  assert.equal(canRequestDispatcherForms(profile), false);
  assert.equal(canSubmitDispatcherForms(profile), false);
});

test("dispatcher submit capability grants dispatcher form access", () => {
  const profile = buildProfile("dispatcher", [
    "business.submit_dispatcher_forms",
  ]);

  assert.equal(canRequestDispatcherForms(profile), true);
  assert.equal(canSubmitDispatcherForms(profile), true);
});

test("owner feed capability can request dispatcher forms for labels only", () => {
  const profile = buildProfile("business_owner", [
    "business.view_dispatcher_feed",
  ]);

  assert.equal(canRequestDispatcherForms(profile), true);
  assert.equal(canSubmitDispatcherForms(profile), false);
});
