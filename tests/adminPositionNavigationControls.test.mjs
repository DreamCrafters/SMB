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

test("delegated account manager preserves disabled admin tabs while editing business tabs", async () => {
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
  const position = buildHybridPosition();
  let savedPosition;

  try {
    globalThis.fetch = async (input, init = {}) => {
      const url = new URL(String(input), "http://127.0.0.1:5173/");
      const method = init.method ?? "GET";

      if (url.pathname === "/api/access/profile") {
        return jsonResponse({ profile: buildDelegatedProfile() });
      }
      if (url.pathname === "/api/admin/accounts" && method === "GET") {
        return jsonResponse({ accounts: [] });
      }
      if (url.pathname === "/api/admin/positions" && method === "GET") {
        return jsonResponse({
          positions: [position],
          canAssignAdminNavigation: false,
        });
      }
      if (
        url.pathname === "/api/admin/positions/hybrid-position" &&
        method === "PATCH"
      ) {
        savedPosition = JSON.parse(String(init.body));
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
      () => rootElement.querySelector(".admin-positions-table tbody tr") !== null,
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
    const adminToggle = findCheckbox(dialog, "Админ");
    const databaseToggle = findCheckbox(dialog, "БД (");
    const dispatcherToggle = findCheckbox(dialog, "Диспетчерская (");

    assert.ok(adminToggle);
    assert.equal(adminToggle.checked, true);
    assert.equal(adminToggle.disabled, true);
    assert.ok(databaseToggle);
    assert.equal(databaseToggle.checked, true);
    assert.equal(databaseToggle.disabled, true);
    assert.ok(dispatcherToggle);
    assert.equal(dispatcherToggle.checked, false);
    assert.equal(dispatcherToggle.disabled, false);

    await React.act(async () => dispatcherToggle.click());
    assert.equal(dispatcherToggle.checked, true);
    assert.equal(databaseToggle.checked, true);

    const saveButton = dialog.querySelector('button[type="submit"]');
    assert.ok(saveButton);
    await React.act(async () => saveButton.click());
    await waitFor(React, () => savedPosition !== undefined);

    assert.deepEqual(savedPosition, {
      displayName: "Руководитель с БД",
      navigationItems: [
        "business.overview",
        "admin.database",
        "business.dispatcher",
      ],
      boardAssignmentAccess: "none",
    });

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
    navigationItems: ["business.overview", "admin.database"],
    capabilities: [
      "business.view_all_statistics",
      "platform.manage_analytics_database",
    ],
    boardAssignmentAccess: "none",
    isProtected: false,
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
