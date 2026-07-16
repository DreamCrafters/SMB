import assert from "node:assert/strict";
import test from "node:test";
import {
  buildDispatcherSubmissionAuditDetails,
  canProfileViewAuditScreen,
  readAuditScreen,
  resolveAuditWindowStart,
} from "./audit.js";
import type { ServerUserProfile } from "./auth.js";

test("audit report starts exactly three calendar months before now", () => {
  assert.equal(
    resolveAuditWindowStart(new Date("2026-07-31T12:30:00.000Z")).toISOString(),
    "2026-04-30T12:30:00.000Z",
  );
  assert.equal(
    resolveAuditWindowStart(new Date("2026-03-31T08:00:00.000Z")).toISOString(),
    "2025-12-31T08:00:00.000Z",
  );
});

test("dispatcher audit details expose only server-defined form fields", () => {
  const details = buildDispatcherSubmissionAuditDetails("incident", {
    datetime: "2026-07-16T10:15",
    location: "Цех 1",
    incidentType: "Травма",
    description: "Краткое описание",
    criticality: "Высокий",
    responsible: "Иванов И.И.",
    immediateActions: "Остановили участок",
    incidentNumber: "INC-2026-4",
    password: "must-never-appear",
  });

  assert.deepEqual(details, [
    { label: "Дата и время инцидента", value: "2026-07-16T10:15" },
    { label: "Место (цех/участок)", value: "Цех 1" },
    { label: "Тип инцидента", value: "Травма" },
    { label: "Описание", value: "Краткое описание" },
    { label: "Критичность", value: "Высокий" },
    { label: "Ответственный за регистрацию", value: "Иванов И.И." },
    { label: "Оперативные меры", value: "Остановили участок" },
  ]);
  assert.doesNotMatch(JSON.stringify(details), /password|must-never-appear|incidentNumber/u);
});

test("client-reported views are restricted to known tabs and screens", () => {
  assert.deepEqual(readAuditScreen("admin.user_actions"), {
    id: "admin.user_actions",
    title: "Действия пользователей",
  });
  assert.deepEqual(readAuditScreen("business.user_actions"), {
    id: "business.user_actions",
    title: "Действия пользователей",
  });
  assert.deepEqual(readAuditScreen("dispatcher.form.visitor"), {
    id: "dispatcher.form.visitor",
    title: "Форма: Вход посетителя",
  });
  assert.deepEqual(readAuditScreen("dispatcher.form.production"), {
    id: "dispatcher.form.production",
    title: "Форма: Выработка",
  });
  assert.equal(readAuditScreen("admin.secret-screen"), undefined);
});

test("screen views must be available to the active account or its admin preview", () => {
  const dispatcher = buildProfile({
    navigationItems: ["business.dispatcher_form"],
    capabilities: ["business.submit_dispatcher_forms"],
  });
  const admin = buildProfile({
    navigationItems: ["admin.account_preview"],
    capabilities: ["platform.manage_users"],
  });
  const dispatcherForm = readAuditScreen("dispatcher.form.incident");
  const adminDatabase = readAuditScreen("admin.database");
  const businessOverview = readAuditScreen("business.overview");

  assert.ok(dispatcherForm !== undefined);
  assert.ok(adminDatabase !== undefined);
  assert.ok(businessOverview !== undefined);
  assert.equal(canProfileViewAuditScreen(dispatcher, dispatcherForm), true);
  assert.equal(canProfileViewAuditScreen(dispatcher, adminDatabase), false);
  assert.equal(canProfileViewAuditScreen(admin, businessOverview), true);
  assert.equal(canProfileViewAuditScreen(admin, adminDatabase), false);
});

function buildProfile({
  navigationItems,
  capabilities,
}: Pick<
  ServerUserProfile["activeAccess"],
  "navigationItems" | "capabilities"
>): ServerUserProfile {
  return {
    userId: "user-1",
    displayName: "Иванов Иван",
    accountType: "admin",
    activeAccess: {
      accountId: "account-1",
      accountType: "admin",
      position: "administrator",
      positionDisplayName: "Администратор",
      displayName: "Администратор",
      scope: { kind: "platform" },
      navigationItems,
      capabilities,
      issuedAt: "2026-07-16T00:00:00.000Z",
    },
    businessAccounts: [],
    receivedAt: "2026-07-16T00:00:00.000Z",
  };
}
