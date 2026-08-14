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
  "IS_REACT_ACT_ENVIRONMENT",
];

test("admin preview separates account types, created accounts, and working tabs", async () => {
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

  try {
    globalThis.fetch = async (input, init = {}) => {
      const url = new URL(String(input), "http://127.0.0.1:5173/");
      if (url.pathname === "/api/navigation-order") {
        return jsonResponse({ navigationOrder: defaultNavigationOrder });
      }
      const method = init.method ?? "GET";

      if (url.pathname === "/api/access/profile") {
        return jsonResponse({ profile: buildAdminProfile() });
      }
      if (url.pathname === "/api/admin/accounts" && method === "GET") {
        return jsonResponse({
          accounts: [buildCreatedAccount()],
          canManageProtectedAccounts: true,
        });
      }
      if (url.pathname === "/api/admin/positions" && method === "GET") {
        return jsonResponse({
          positions: [buildPosition()],
          canAssignAdminNavigation: true,
          canManageProtectedPositions: true,
        });
      }
      if (url.pathname === "/api/audit/events" && method === "POST") {
        return jsonResponse({ ok: true });
      }
      if (url.pathname === "/api/admin/audit-events" && method === "GET") {
        assert.equal(url.searchParams.get("scope"), "organization");
        return jsonResponse(buildEmptyAuditReport());
      }

      throw new Error(`Unexpected request: ${method} ${url.pathname}`);
    };

    const { default: App, buildAdminPreviewProfile } =
      await vite.ssrLoadModule("/src/App.tsx");
    const rootElement = dom.window.document.getElementById("root");
    const root = createRoot(rootElement);

    const readOnlyProfile = buildAdminPreviewProfile({
      ...buildCreatedAccount(),
      capabilities: [
        "business.manage_production_plan",
        "business.view_board_assignments",
      ],
      navigationItems: [
        "business.production_plan",
        "business.board_assignments",
      ],
    });
    assert.deepEqual(readOnlyProfile.activeAccess.capabilities, [
      "business.view_board_assignments",
    ]);

    await React.act(async () => root.render(React.createElement(App)));
    await waitFor(
      React,
      () => rootElement.querySelector('[role="tablist"][aria-label="Разделы предпросмотра"]') !== null,
    );

    assert.match(rootElement.textContent, /Предпросмотр/);
    assert.doesNotMatch(rootElement.textContent, /Просмотр аккаунта/);
    const previewTabs = Array.from(
      rootElement.querySelectorAll(
        '[role="tablist"][aria-label="Разделы предпросмотра"] [role="tab"]',
      ),
      (tab) => tab.textContent?.trim(),
    );
    assert.deepEqual(previewTabs, [
      "Типы аккаунтов",
      "Созданные аккаунты",
      "Вкладки",
    ]);
    assert.ok(findButton(rootElement, "Руководитель производства"));
    assert.equal(findButtonContaining(rootElement, "Созданный руководитель"), undefined);

    await React.act(async () => {
      findButton(rootElement, "Созданные аккаунты")?.click();
    });
    assert.ok(findButtonContaining(rootElement, "Созданный руководитель"));
    assert.equal(findButton(rootElement, "Руководитель производства"), undefined);

    await React.act(async () => {
      findButton(rootElement, "Вкладки")?.click();
    });
    const workPreviewButton = findButtonContaining(rootElement, "Работа");
    assert.ok(workPreviewButton);

    await React.act(async () => {
      workPreviewButton.click();
    });
    await waitFor(
      React,
      () => rootElement.querySelector('[aria-label="Рабочие данные"]') !== null,
    );

    assert.match(rootElement.textContent, /АДМИН ПРЕВЬЮ МОД/);
    assert.ok(findButtonContaining(rootElement, "Работа"));
    assert.equal(findButtonContaining(rootElement, "Обзор"), undefined);

    await React.act(async () => {
      findButton(rootElement, "Выйти из превью мода")?.click();
    });
    await waitFor(
      React,
      () => rootElement.querySelector('[role="tablist"][aria-label="Разделы предпросмотра"]') !== null,
    );
    await React.act(async () => {
      findButton(rootElement, "Вкладки")?.click();
    });
    await React.act(async () => {
      findButtonContaining(rootElement, "Действия пользователей")?.click();
    });
    await waitFor(
      React,
      () => Array.from(rootElement.querySelectorAll("h2")).some(
        (heading) => heading.textContent?.trim() === "Действия пользователей",
      ),
    );
    assert.doesNotMatch(
      rootElement.textContent,
      /Отчёт доступен после входа в учётную запись руководителя/,
    );

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

function buildAdminProfile() {
  return {
    userId: "admin-user",
    displayName: "admin",
    accountType: "admin",
    activeAccess: {
      accountId: "admin-access",
      accountType: "admin",
      position: "administrator",
      positionDisplayName: "Администратор",
      displayName: "admin",
      scope: { kind: "platform" },
      capabilities: [],
      navigationItems: ["admin.account_preview"],
      issuedAt: "2026-08-10T08:00:00.000Z",
    },
    receivedAt: "2026-08-10T08:00:00.000Z",
  };
}

function buildCreatedAccount() {
  return {
    accessId: "created-access",
    userId: "created-user",
    login: "CREATED",
    userDisplayName: "Созданный руководитель",
    userStatus: "active",
    isProtected: false,
    isProtectedByAdminRights: false,
    accessDisplayName: "Созданный руководитель",
    accountType: "business_owner",
    position: "production-owner",
    positionDisplayName: "Руководитель производства",
    scope: { kind: "organization" },
    capabilities: ["business.view_own_statistics"],
    navigationItems: ["business.work"],
    createdAt: "2026-08-10T08:00:00.000Z",
  };
}

function buildPosition() {
  return {
    id: "production-owner",
    displayName: "Руководитель производства",
    accountType: "business_owner",
    navigationItems: ["business.work"],
    capabilities: ["business.view_own_statistics"],
    boardAssignmentAccess: "none",
    showOverviewVisitors: true,
    isProtected: false,
    hasAdminRights: false,
    usageCount: 1,
    createdAt: "2026-08-10T08:00:00.000Z",
  };
}

function buildEmptyAuditReport() {
  return {
    events: [],
    actors: [],
    summary: { total: 0, byCategory: [] },
    window: {
      from: "2026-05-10T00:00:00.000Z",
      to: "2026-08-11T00:00:00.000Z",
    },
    limit: 50,
    offset: 0,
  };
}

function findButton(rootElement, label) {
  return Array.from(rootElement.querySelectorAll("button")).find(
    (button) => button.textContent?.trim() === label,
  );
}

function findButtonContaining(rootElement, label) {
  return Array.from(rootElement.querySelectorAll("button")).find(
    (button) => button.textContent?.includes(label),
  );
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
  assert.fail("Timed out waiting for admin preview.");
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
