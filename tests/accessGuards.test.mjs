import assert from "node:assert/strict";
import test from "node:test";
import {
  canManageAnalyticsDatabase,
  canRequestDispatcherForms,
  canSubmitDispatcherForms,
  resolveAllowedNavigationTab,
  resolveAllowedWorkspaceKind,
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
      scope: { kind: "organization" },
      capabilities,
      issuedAt: "2026-06-21T00:00:00.000Z",
    },
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

test("only analytics database capability grants admin database access", () => {
  const adminProfile = buildProfile("admin", [
    "platform.manage_analytics_database",
  ]);
  const ownerProfile = buildProfile("business_owner", [
    "business.view_dispatcher_feed",
  ]);

  assert.equal(canManageAnalyticsDatabase(adminProfile), true);
  assert.equal(canManageAnalyticsDatabase(ownerProfile), false);
});

test("workspace has no active tab when account has no navigation access", () => {
  assert.equal(
    resolveAllowedNavigationTab(
      "overview",
      {
        overview: "business.overview",
        dispatcher: "business.dispatcher",
        work: "business.work",
        dispatcher_form: "business.dispatcher_form",
      },
      [],
    ),
    undefined,
  );
});

test("workspace falls back to the first allowed tab", () => {
  assert.equal(
    resolveAllowedNavigationTab(
      "overview",
      {
        overview: "business.overview",
        dispatcher: "business.dispatcher",
        work: "business.work",
        dispatcher_form: "business.dispatcher_form",
      },
      ["business.dispatcher"],
    ),
    "dispatcher",
  );
});

test("hybrid workspace switches between business and admin navigation", () => {
  const hybridNavigation = ["business.overview", "admin.database"];

  assert.equal(
    resolveAllowedWorkspaceKind("business", hybridNavigation),
    "business",
  );
  assert.equal(
    resolveAllowedWorkspaceKind("admin", hybridNavigation),
    "admin",
  );
  assert.equal(
    resolveAllowedWorkspaceKind("business", ["admin.database"]),
    "admin",
  );
  assert.equal(
    resolveAllowedWorkspaceKind("admin", ["business.overview"]),
    "business",
  );
});
