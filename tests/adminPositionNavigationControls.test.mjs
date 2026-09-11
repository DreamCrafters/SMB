import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { createServer } from "vite";
import { defaultNavigationOrder } from "../.test-build/src/content.js";

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
  "requestAnimationFrame",
  "cancelAnimationFrame",
  "IS_REACT_ACT_ENVIRONMENT",
];

let sharedVite;
async function getVite() {
  sharedVite ??= await createServer({
    appType: "custom",
    logLevel: "silent",
    server: { middlewareMode: true },
  });
  return sharedVite;
}
test.after(async () => sharedVite?.close());

test("delegated manager edits working tabs and combines railway roles without losing board access", async () => {
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
    dispatchEvent() {
      return false;
    },
  });
  dom.window.requestAnimationFrame = (callback) =>
    setTimeout(() => callback(Date.now()), 0);
  dom.window.cancelAnimationFrame = (frameId) => clearTimeout(frameId);
  const previousGlobals = captureDomGlobals();
  const previousFetch = globalThis.fetch;
  const previousRemoteApiUrl = process.env.VITE_SMB_REMOTE_API_URL;
  process.env.VITE_SMB_REMOTE_API_URL = "http://127.0.0.1:5173";
  installDomGlobals(dom.window);
  const React = await import("react");
  const { createRoot } = await import("react-dom/client");
  const vite = await getVite();
  const position = buildHybridPosition();
  let savedPosition;

  try {
    globalThis.fetch = async (input, init = {}) => {
      const url = new URL(String(input), "http://127.0.0.1:5173/");
      if (url.pathname === "/api/navigation-order") {
        return jsonResponse({ navigationOrder: defaultNavigationOrder });
      }
      const method = init.method ?? "GET";

      if (url.pathname === "/api/access/profile") {
        return jsonResponse({ profile: buildDelegatedProfile() });
      }
      if (url.pathname === "/api/admin/accounts" && method === "GET") {
        return jsonResponse({
          accounts: [],
          canManageProtectedAccounts: false,
        });
      }
      if (url.pathname === "/api/admin/positions" && method === "GET") {
        return jsonResponse({
          positions: [buildAdministratorPosition(), position],
          canAssignAdminNavigation: false,
          canManageProtectedPositions: false,
        });
      }
      if (
        url.pathname === "/api/admin/positions/hybrid-position" &&
        method === "PATCH"
      ) {
        savedPosition = JSON.parse(String(init.body));
        Object.assign(position, savedPosition);
        return jsonResponse({
          position: {
            ...position,
            ...savedPosition,
            capabilities: [
              "business.view_all_statistics",
              "business.view_dispatcher_feed",
              "platform.manage_analytics_database",
            ],
          },
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

    await React.act(async () => {
      root.render(React.createElement(App));
    });
    await waitFor(
      React,
      () => rootElement.querySelector(".admin-accounts-table tbody tr") !== null,
    );
    await React.act(async () => {
      rootElement.querySelector(
        'button[role="tab"][aria-controls="admin-accounts-panel-positions"]',
      )?.click();
    });
    await waitFor(
      React,
      () => rootElement.querySelector(".admin-positions-table tbody tr") !== null,
    );
    assert.equal(
      Array.from(rootElement.querySelectorAll("button")).some(
        (button) => button.textContent?.trim() === "Доступ по вкладке",
      ),
      false,
    );

    const positionRow = Array.from(
      rootElement.querySelectorAll(".admin-positions-table tbody tr"),
    ).find((row) => row.textContent?.includes("Руководитель с БД"));
    assert.ok(positionRow);
    const editButton = Array.from(positionRow.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === "Изменить",
    );
    assert.ok(editButton);

    await React.act(async () => editButton.click());

    const dialog = rootElement.querySelector('[role="dialog"]');
    assert.ok(dialog);
    const databaseToggle = findCheckbox(dialog, "БД (");
    const dispatcherToggle = findCheckbox(dialog, "Диспетчерская (");
    const settingsToggle = findCheckbox(dialog, "Настройки (");
    const navigationFieldsets = Array.from(dialog.querySelectorAll("fieldset"));
    const businessFieldset = navigationFieldsets.find(
      (fieldset) => fieldset.querySelector("legend")?.textContent === "Рабочие вкладки",
    );
    assert.equal(findCheckbox(dialog, "Админ"), undefined);
    assert.equal(databaseToggle, undefined);
    assert.ok(dispatcherToggle);
    assert.equal(dispatcherToggle.checked, false);
    assert.equal(dispatcherToggle.disabled, false);
    assert.ok(settingsToggle);
    assert.equal(settingsToggle.checked, false);
    assert.equal(settingsToggle.disabled, false);
    assert.ok(businessFieldset);
    assert.equal(businessFieldset.contains(dispatcherToggle), true);
    assert.deepEqual(
      Array.from(dialog.querySelectorAll("fieldset legend"), (legend) =>
        legend.textContent?.trim()
      ),
      ["Рабочие вкладки"],
    );

    await React.act(async () => dispatcherToggle.click());
    assert.equal(dispatcherToggle.checked, true);
    await React.act(async () => settingsToggle.click());
    assert.equal(settingsToggle.checked, true);

    const roles = dialog.querySelector('[role="group"][aria-label="Роли в разделе ЖД Вагоны"]');
    assert.ok(roles);
    const sales = findCheckbox(roles, "Менеджер по продажам");
    const carrier = findCheckbox(roles, "Сотрудник по работе с РЖД");
    const view = findCheckbox(roles, "Только просмотр");
    assert.equal(carrier.checked, true);
    assert.equal(sales.checked, false);
    await React.act(async () => sales.click());
    assert.equal(sales.checked, true);
    assert.equal(carrier.checked, true);
    assert.equal(view.checked, false);
    await React.act(async () => carrier.click());
    assert.equal(carrier.checked, false);
    assert.equal(sales.checked, true);
    await React.act(async () => sales.click());
    assert.equal(view.checked, true);
    await React.act(async () => sales.click());
    await React.act(async () => carrier.click());
    await React.act(async () => view.click());
    assert.equal(sales.checked, false);
    assert.equal(carrier.checked, false);
    await React.act(async () => sales.click());
    await React.act(async () => carrier.click());

    const saveButton = dialog.querySelector('button[type="submit"]');
    assert.ok(saveButton);
    await React.act(async () => saveButton.click());
    await waitFor(React, () => savedPosition !== undefined);

    assert.deepEqual(savedPosition, {
      displayName: "Руководитель с БД",
      navigationItems: [
        "business.overview",
        "business.board_assignments",
        "business.railway_wagons",
        "business.dispatcher",
        "business.settings",
      ],
      boardAssignmentAccess: "create",
      railwayWagonAccess: ["sales", "carrier"],
      showOverviewVisitors: true,
    });

    const updatedRow = Array.from(rootElement.querySelectorAll(".admin-positions-table tbody tr"))
      .find((row) => row.textContent?.includes("Руководитель с БД"));
    assert.match(updatedRow.textContent, /Менеджер по продажам, Сотрудник по работе с РЖД/u);
    await React.act(async () => Array.from(updatedRow.querySelectorAll("button"))
      .find((button) => button.textContent?.trim() === "Изменить").click());
    const reopenedRoles = rootElement.querySelector('[role="group"][aria-label="Роли в разделе ЖД Вагоны"]');
    assert.equal(findCheckbox(reopenedRoles, "Менеджер по продажам").checked, true);
    assert.equal(findCheckbox(reopenedRoles, "Сотрудник по работе с РЖД").checked, true);
    await React.act(async () => Array.from(rootElement.querySelectorAll('[role="dialog"] button'))
      .find((button) => button.textContent?.trim() === "Отмена").click());

    const createPositionButton = Array.from(
      rootElement.querySelectorAll("button"),
    ).find((button) => button.textContent?.trim() === "Новая должность");
    assert.ok(createPositionButton);
    await React.act(async () => createPositionButton.click());

    const createDialog = rootElement.querySelector('[role="dialog"]');
    assert.ok(createDialog);
    assert.equal(
      createDialog.querySelector("#admin-position-title")?.textContent,
      "Новая должность",
    );
    assert.equal(findCheckbox(createDialog, "Админ"), undefined);
    assert.deepEqual(
      Array.from(createDialog.querySelectorAll("fieldset legend"), (legend) =>
        legend.textContent?.trim(),
      ),
      ["Рабочие вкладки"],
    );
    await React.act(async () => Array.from(createDialog.querySelectorAll("button"))
      .find((button) => button.textContent?.trim() === "Отмена")?.click());

    await React.act(async () => {
      rootElement.querySelector(
        'button[role="tab"][aria-controls="admin-accounts-panel-accounts"]',
      )?.click();
    });
    const createAccountButton = Array.from(rootElement.querySelectorAll("button"))
      .find((button) => button.textContent?.trim() === "Новая учётная запись");
    assert.ok(createAccountButton);
    await React.act(async () => createAccountButton.click());
    const accountDialog = rootElement.querySelector("#admin-account-create-dialog");
    assert.ok(accountDialog);
    const positionPicker = accountDialog.querySelector(
      ".admin-account-position-picker-trigger",
    );
    assert.ok(positionPicker);
    await React.act(async () => positionPicker.click());
    const positionOptions = dom.window.document.body.querySelector(
      "#admin-account-position-picker-options",
    );
    assert.ok(positionOptions);
    assert.equal(
      positionOptions.querySelectorAll('input[type="checkbox"]').length,
      1,
    );
    assert.doesNotMatch(positionOptions.textContent ?? "", /Администратор/u);

    await React.act(async () => root.unmount());
  } finally {
    globalThis.fetch = previousFetch;
    if (previousRemoteApiUrl === undefined) {
      delete process.env.VITE_SMB_REMOTE_API_URL;
    } else {
      process.env.VITE_SMB_REMOTE_API_URL = previousRemoteApiUrl;
    }
    dom.window.close();
    restoreDomGlobals(previousGlobals);
  }
});

test("tab access matrix saves multiple railway roles and keeps them when enabling all", async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: "http://127.0.0.1:5173/" });
  dom.window.matchMedia = () => ({
    matches: false, addEventListener() {}, removeEventListener() {},
  });
  const previousGlobals = captureDomGlobals();
  const previousFetch = globalThis.fetch;
  const previousRemoteApiUrl = process.env.VITE_SMB_REMOTE_API_URL;
  process.env.VITE_SMB_REMOTE_API_URL = "http://127.0.0.1:5173";
  installDomGlobals(dom.window);
  const React = await import("react");
  const { createRoot } = await import("react-dom/client");
  const vite = await getVite();
  const position = buildHybridPosition();
  position.navigationItems = position.navigationItems.filter((id) => id !== "admin.database");
  position.railwayWagonAccess = ["sales", "carrier"];
  const writes = [];
  const positionsResponse = () => jsonResponse({
    positions: [position], canAssignAdminNavigation: true, canManageProtectedPositions: true,
  });
  const rootElement = dom.window.document.getElementById("root");
  const root = createRoot(rootElement);
  try {
    globalThis.fetch = async (input, init = {}) => {
      const url = new URL(String(input), "http://127.0.0.1:5173/");
      const method = init.method ?? "GET";
      if (url.pathname === "/api/navigation-order") {
        return jsonResponse({ navigationOrder: defaultNavigationOrder });
      }
      if (url.pathname === "/api/access/profile") {
        const profile = buildDelegatedProfile();
        profile.accountType = profile.activeAccess.accountType = "admin";
        profile.activeAccess.position = "administrator";
        return jsonResponse({ profile });
      }
      if (url.pathname === "/api/admin/accounts") {
        return jsonResponse({ accounts: [], canManageProtectedAccounts: true });
      }
      if (url.pathname === "/api/admin/positions") return positionsResponse();
      if (url.pathname === "/api/admin/positions/navigation-access" && method === "PUT") {
        const body = JSON.parse(String(init.body));
        writes.push(body);
        if (!body.enabled) {
          position.navigationItems = position.navigationItems.filter((id) => id !== body.navigationItem);
          position.railwayWagonAccess = "none";
        } else {
          position.navigationItems = [...new Set([...position.navigationItems, body.navigationItem])];
          position.railwayWagonAccess = body.accessLevel ??
            (position.railwayWagonAccess === "none" ? "view" : position.railwayWagonAccess);
        }
        return positionsResponse();
      }
      if (url.pathname === "/api/audit/events" && method === "POST") return jsonResponse({ ok: true });
      throw new Error(`Unexpected request: ${method} ${url.pathname}`);
    };
    const { default: App } = await vite.ssrLoadModule("/src/App.tsx");
    await React.act(async () => root.render(React.createElement(App)));
    await waitFor(React, () => rootElement.querySelector(".admin-accounts-table tbody tr") !== null);
    await React.act(async () => rootElement.querySelector(
      'button[role="tab"][aria-controls="admin-accounts-panel-positions"]',
    ).click());
    await waitFor(React, () => rootElement.querySelector(".admin-positions-table tbody tr") !== null);
    await React.act(async () => Array.from(rootElement.querySelectorAll("button"))
      .find((button) => button.textContent?.trim() === "Доступ по вкладке").click());
    const dialog = rootElement.querySelector('[role="dialog"]');
    const tabSelect = dialog.querySelector(".admin-position-navigation-access-toolbar select");
    await React.act(async () => {
      tabSelect.value = "business.railway_wagons";
      tabSelect.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
    });
    const roles = dialog.querySelector('[role="group"]');
    const sales = findCheckbox(roles, "Менеджер по продажам");
    const carrier = findCheckbox(roles, "Сотрудник по работе с РЖД");
    const logistics = findCheckbox(roles, "Директор по логистике");
    assert.equal(sales.checked, true);
    assert.equal(carrier.checked, true);
    await React.act(async () => logistics.click());
    assert.deepEqual(writes.at(-1), {
      navigationItem: "business.railway_wagons", positionIds: [position.id], enabled: true,
      accessLevel: ["sales", "carrier", "logistics"],
    });
    assert.equal(sales.checked, true);
    assert.equal(carrier.checked, true);
    assert.equal(logistics.checked, true);
    await React.act(async () => sales.click());
    assert.deepEqual(writes.at(-1).accessLevel, ["carrier", "logistics"]);
    await React.act(async () => Array.from(dialog.querySelectorAll("button"))
      .find((button) => button.textContent?.trim() === "Вкл. все").click());
    assert.equal("accessLevel" in writes.at(-1), false);
    assert.equal(carrier.checked, true);
    assert.equal(logistics.checked, true);
    const access = dialog.querySelector('input[aria-label^="Доступ к вкладке для должности"]');
    await React.act(async () => access.click());
    assert.equal(writes.at(-1).enabled, false);
    assert.equal(carrier.disabled, true);
    assert.equal(carrier.checked, false);
    await React.act(async () => access.click());
    assert.equal(carrier.disabled, false);
    assert.equal(carrier.checked, false);
    assert.equal(findCheckbox(roles, "Только просмотр").checked, true);
    assert.equal(position.boardAssignmentAccess, "create");
  } finally {
    await React.act(async () => root.unmount());
    globalThis.fetch = previousFetch;
    if (previousRemoteApiUrl === undefined) delete process.env.VITE_SMB_REMOTE_API_URL;
    else process.env.VITE_SMB_REMOTE_API_URL = previousRemoteApiUrl;
    dom.window.close();
    restoreDomGlobals(previousGlobals);
  }
});

function findCheckbox(rootElement, labelPrefix) {
  return Array.from(rootElement.querySelectorAll("label")).find((label) =>
    label.textContent?.trim().startsWith(labelPrefix)
  )?.querySelector('input[type="checkbox"]');
}

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

function buildHybridPosition() {
  return {
    id: "hybrid-position",
    displayName: "Руководитель с БД",
    accountType: "business_owner",
    navigationItems: ["business.overview", "admin.database", "business.board_assignments", "business.railway_wagons"],
    capabilities: [
      "business.view_all_statistics",
      "platform.manage_analytics_database",
      "business.view_board_assignments",
      "business.create_board_assignments",
      "business.view_railway_wagons",
      "business.manage_railway_wagon_carriage",
    ],
    boardAssignmentAccess: "create",
    railwayWagonAccess: "carrier",
    showOverviewVisitors: true,
    isProtected: false,
    hasAdminRights: false,
    usageCount: 1,
    createdAt: "2026-08-03T08:00:00.000Z",
  };
}

function buildAdministratorPosition() {
  return {
    id: "administrator",
    displayName: "Администратор",
    accountType: "admin",
    navigationItems: ["admin.accounts"],
    capabilities: ["platform.manage_users", "platform.manage_access"],
    boardAssignmentAccess: "none",
    railwayWagonAccess: "none",
    showOverviewVisitors: false,
    isProtected: true,
    hasAdminRights: true,
    usageCount: 1,
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
  assert.fail("Timed out waiting for admin position controls.");
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
    requestAnimationFrame: (callback) => setTimeout(() => callback(Date.now()), 0),
    cancelAnimationFrame: (frameId) => clearTimeout(frameId),
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
