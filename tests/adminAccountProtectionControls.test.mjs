import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { createServer } from "vite";

const DOM_GLOBAL_NAMES = [
  "document",
  "Element",
  "Event",
  "FormData",
  "HTMLElement",
  "HTMLInputElement",
  "MouseEvent",
  "navigator",
  "Node",
  "window",
  "IS_REACT_ACT_ENVIRONMENT",
];

test("delegated account manager cannot change protected account controls", async () => {
  const dom = new JSDOM(
    '<!doctype html><html><body><div id="root"></div></body></html>',
    { url: "http://127.0.0.1:5173/" },
  );
  dom.window.matchMedia = () => ({
    matches: false,
    media: "",
    onchange: null,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent() { return false; },
  });
  const previousGlobals = captureDomGlobals();
  const previousFetch = globalThis.fetch;
  const previousRemoteApiUrl = process.env.VITE_SMB_REMOTE_API_URL;
  process.env.VITE_SMB_REMOTE_API_URL = "http://127.0.0.1:5173";
  installDomGlobals(dom.window);
  const React = await import("react");
  const { createRoot } = await import("react-dom/client");
  const vite = await createServer({
    appType: "custom",
    logLevel: "silent",
    server: { middlewareMode: true },
  });
  const account = buildProtectedAccount();

  try {
    globalThis.fetch = async (input, init = {}) => {
      const url = new URL(String(input), "http://127.0.0.1:5173/");
      const method = init.method ?? "GET";

      if (url.pathname === "/api/access/profile") {
        return jsonResponse({ profile: buildDelegatedProfile() });
      }
      if (url.pathname === "/api/admin/accounts" && method === "GET") {
        return jsonResponse({
          accounts: [account],
          canManageProtectedAccounts: false,
        });
      }
      if (url.pathname === "/api/admin/positions" && method === "GET") {
        return jsonResponse({
          positions: [buildPosition()],
          canAssignAdminNavigation: false,
          canManageProtectedPositions: false,
        });
      }
      if (url.pathname === "/api/admin/notification-settings" && method === "GET") {
        return jsonResponse({
          users: [{
            userId: account.userId,
            displayName: account.userDisplayName,
            position: account.position,
            positionDisplayName: account.positionDisplayName,
            isProtected: true,
            email: "protected@example.com",
            maxUserId: "101",
            settings: [{
              type: "board_assignments",
              label: "Поручения Совета директоров",
              adminEnabled: true,
              emailEnabled: true,
              maxEnabled: true,
            }],
          }],
        });
      }
      if (url.pathname === "/api/audit/events" && method === "POST") {
        return jsonResponse({ ok: true });
      }

      throw new Error(`Unexpected request: ${method} ${url.pathname}`);
    };

    const { default: App } = await vite.ssrLoadModule("/src/App.tsx");
    const rootElement = dom.window.document.getElementById("root");
    const root = createRoot(rootElement);

    await React.act(async () => root.render(React.createElement(App)));
    await waitFor(
      React,
      () => rootElement.querySelector(".admin-accounts-table tbody tr") !== null,
    );

    const accountTabs = Array.from(
      rootElement.querySelectorAll('[role="tablist"][aria-label="Разделы учётных записей"] [role="tab"]'),
      (tab) => tab.textContent?.trim(),
    );
    assert.deepEqual(accountTabs, [
      "Учётные записи",
      "Должности",
      "Уведомления",
    ]);
    assert.equal(
      rootElement.querySelector(".admin-accounts-table th:nth-child(4)")?.textContent,
      "Защита",
    );

    const row = rootElement.querySelector(".admin-accounts-table tbody tr");
    assert.ok(row);
    const protection = row.querySelector(
      `input[aria-label="Защитить аккаунт ${account.login}"]`,
    );
    const position = row.querySelector(
      `select[aria-label="Должность для ${account.login}"]`,
    );
    const reset = Array.from(row.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === "Сбросить",
    );
    const toggle = row.querySelector(
      `button[aria-label="Отключить вход для ${account.login}"]`,
    );
    const remove = Array.from(row.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === "Удалить",
    );

    assert.ok(protection);
    assert.equal(protection.checked, true);
    assert.equal(protection.disabled, true);
    assert.equal(position?.disabled, true);
    assert.equal(reset?.disabled, true);
    assert.equal(toggle?.disabled, true);
    assert.equal(remove?.disabled, true);

    await React.act(async () => {
      rootElement.querySelector(
        'button[role="tab"][aria-controls="admin-accounts-panel-positions"]',
      )?.click();
    });
    await waitFor(
      React,
      () => rootElement.querySelector(".admin-positions-table tbody tr") !== null,
    );

    const positionRow = rootElement.querySelector(
      ".admin-positions-table tbody tr",
    );
    assert.ok(positionRow);
    const positionProtection = positionRow.querySelector(
      'input[aria-label="Защитить должность Администратор подразделения"]',
    );
    const editPosition = Array.from(positionRow.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === "Изменить",
    );
    const removePosition = Array.from(positionRow.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === "Удалить",
    );
    assert.ok(positionProtection);
    assert.equal(positionProtection.checked, true);
    assert.equal(positionProtection.disabled, true);
    assert.equal(editPosition?.disabled, true);
    assert.equal(removePosition?.disabled, true);

    await React.act(async () => {
      rootElement.querySelector(
        'button[role="tab"][aria-controls="admin-accounts-panel-notifications"]',
      )?.click();
    });
    await waitFor(
      React,
      () => rootElement.querySelector(".notification-admin-user-row") !== null,
    );
    await React.act(async () => {
      rootElement.querySelector(".notification-admin-user-row")?.click();
    });
    const contactInputs = rootElement.querySelectorAll(
      ".notification-admin-contacts input",
    );
    assert.equal(contactInputs.length, 2);
    assert.equal(contactInputs[0].value, "protected@example.com");
    assert.equal(contactInputs[1].value, "101");
    assert.equal(contactInputs[0].disabled, true);
    assert.equal(contactInputs[1].disabled, true);
    const channelInputs = rootElement.querySelectorAll(
      ".notification-settings-table input[type=\"checkbox\"]",
    );
    assert.equal(channelInputs.length, 2);
    assert.equal(channelInputs[0].disabled, true);
    assert.equal(channelInputs[1].disabled, true);

    await React.act(async () => root.unmount());
  } finally {
    globalThis.fetch = previousFetch;
    if (previousRemoteApiUrl === undefined) {
      delete process.env.VITE_SMB_REMOTE_API_URL;
    } else {
      process.env.VITE_SMB_REMOTE_API_URL = previousRemoteApiUrl;
    }
    await vite.close();
    dom.window.close();
    restoreDomGlobals(previousGlobals);
  }
});

function buildDelegatedProfile() {
  return {
    userId: "delegated-user",
    displayName: "Менеджер аккаунтов",
    accountType: "business_owner",
    activeAccess: {
      accountId: "delegated-access",
      accountType: "business_owner",
      position: "accounts-manager",
      positionDisplayName: "Менеджер аккаунтов",
      displayName: "Менеджер аккаунтов",
      scope: { kind: "organization" },
      capabilities: ["platform.manage_users", "platform.manage_access"],
      navigationItems: ["admin.accounts"],
      issuedAt: "2026-08-03T08:00:00.000Z",
    },
    receivedAt: "2026-08-03T08:00:00.000Z",
  };
}

function buildProtectedAccount() {
  return {
    accessId: "protected-access",
    userId: "protected-user",
    login: "protected-admin",
    userDisplayName: "Защищённый администратор",
    userStatus: "active",
    isProtected: true,
    accessDisplayName: "Защищённый администратор access",
    accountType: "business_owner",
    position: "protected-position",
    positionDisplayName: "Администратор подразделения",
    scope: { kind: "organization" },
    capabilities: ["platform.manage_users", "platform.manage_access"],
    navigationItems: ["admin.accounts"],
    createdAt: "2026-08-03T08:00:00.000Z",
  };
}

function buildPosition() {
  return {
    id: "protected-position",
    displayName: "Администратор подразделения",
    accountType: "business_owner",
    navigationItems: ["admin.accounts"],
    capabilities: ["platform.manage_users", "platform.manage_access"],
    boardAssignmentAccess: "none",
    isProtected: false,
    isAdminProtected: true,
    usageCount: 0,
    createdAt: "2026-08-03T08:00:00.000Z",
  };
}

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function waitFor(React, predicate) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (predicate()) return;
    await React.act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
  }
  assert.fail("Timed out waiting for protected account controls.");
}

function captureDomGlobals() {
  return Object.fromEntries(
    DOM_GLOBAL_NAMES.map((name) => [
      name,
      Object.getOwnPropertyDescriptor(globalThis, name),
    ]),
  );
}

function installDomGlobals(window) {
  const domGlobals = {
    document: window.document,
    Element: window.Element,
    Event: window.Event,
    FormData: window.FormData,
    HTMLElement: window.HTMLElement,
    HTMLInputElement: window.HTMLInputElement,
    MouseEvent: window.MouseEvent,
    navigator: window.navigator,
    Node: window.Node,
    window,
    IS_REACT_ACT_ENVIRONMENT: true,
  };
  for (const [name, value] of Object.entries(domGlobals)) {
    Object.defineProperty(globalThis, name, {
      configurable: true,
      enumerable: true,
      value,
      writable: true,
    });
  }
}

function restoreDomGlobals(previousGlobals) {
  for (const [name, descriptor] of Object.entries(previousGlobals)) {
    if (descriptor === undefined) delete globalThis[name];
    else Object.defineProperty(globalThis, name, descriptor);
  }
}
