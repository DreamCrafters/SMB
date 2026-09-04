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

const initialNavigationOrder = [
  "business.overview",
  "business.dispatcher",
  "business.work",
  "business.production_plan",
  "business.refractory_shop",
  "business.laboratory_results",
  "business.laboratory_review",
  "business.board_assignments",
  "business.warehouse_1c",
  "business.settings",
  "business.user_actions",
  "business.dispatcher_form",
  "admin.account_preview",
  "admin.accounts",
  "admin.navigation",
  "admin.user_actions",
  "admin.database",
];

test("original administrator reorders the shared left navigation", async () => {
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
  let savedOrder;
  let savedLabels;
  let resolveOrderRequest;
  const orderRequest = new Promise((resolve) => {
    resolveOrderRequest = resolve;
  });

  try {
    globalThis.fetch = async (input, init = {}) => {
      const url = new URL(String(input), "http://127.0.0.1:5173/");
      const method = init.method ?? "GET";

      if (url.pathname === "/api/access/profile") {
        return jsonResponse({ profile: buildAdminProfile() });
      }
      if (url.pathname === "/api/navigation-order" && method === "GET") {
        return orderRequest;
      }
      if (url.pathname === "/api/admin/navigation-order" && method === "PUT") {
        const body = JSON.parse(String(init.body));
        savedOrder = body.navigationOrder;
        savedLabels = body.navigationLabels;
        return jsonResponse({
          navigationOrder: savedOrder,
          navigationLabels: { "admin.database": "База данных" },
        });
      }
      if (url.pathname === "/api/admin/accounts" && method === "GET") {
        return jsonResponse({ accounts: [], canManageProtectedAccounts: true });
      }
      if (url.pathname === "/api/admin/positions" && method === "GET") {
        return jsonResponse({
          positions: [],
          canAssignAdminNavigation: true,
          canManageProtectedPositions: true,
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
    assert.equal(findNavigationButton(rootElement, "Вкладки"), undefined);

    await React.act(async () => {
      resolveOrderRequest(jsonResponse({
        navigationOrder: initialNavigationOrder,
        navigationLabels: {},
      }));
      await orderRequest;
    });
    await waitFor(
      React,
      () => findNavigationButton(rootElement, "Вкладки") !== undefined,
    );

    await React.act(async () => {
      findNavigationButton(rootElement, "Вкладки")?.click();
    });
    await waitFor(
      React,
      () => rootElement.querySelector('[aria-label="Порядок вкладок"]') !== null,
    );

    await React.act(async () => {
      rootElement.querySelector('button[aria-label="Переместить БД выше"]')?.click();
    });
    // Раздел переименовывается прямо в строке порядка.
    const renameInput = Array.from(
      rootElement.querySelectorAll(".admin-navigation-order-rename input"),
    ).find((input) => input.placeholder === "БД");
    assert.ok(renameInput);
    await React.act(async () => {
      setNativeInputValue(renameInput, "  База   данных ");
      renameInput.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    });
    await React.act(async () => {
      findButton(rootElement, "Сохранить порядок")?.click();
    });
    await waitFor(React, () => savedOrder !== undefined);

    assert.deepEqual(savedOrder.slice(-5), [
      "admin.account_preview",
      "admin.accounts",
      "admin.navigation",
      "admin.database",
      "admin.user_actions",
    ]);
    assert.deepEqual(savedLabels, { "admin.database": "  База   данных " });
    // Переименованный раздел сразу виден в левой панели.
    assert.deepEqual(readVisibleNavigationLabels(rootElement), [
      "Предпросмотр",
      "Учётные записи",
      "Вкладки",
      "База данных",
      "Действия пользователей",
    ]);

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
      capabilities: ["platform.manage_navigation_order"],
      navigationItems: [
        "admin.account_preview",
        "admin.accounts",
        "admin.navigation",
        "admin.user_actions",
        "admin.database",
      ],
      issuedAt: "2026-08-10T08:00:00.000Z",
    },
    receivedAt: "2026-08-10T08:00:00.000Z",
  };
}

function setNativeInputValue(input, value) {
  const descriptor = Object.getOwnPropertyDescriptor(
    input.constructor.prototype,
    "value",
  );
  descriptor?.set?.call(input, value);
}

function findButton(rootElement, label) {
  return Array.from(rootElement.querySelectorAll("button")).find(
    (button) => button.textContent?.trim() === label,
  );
}

function findNavigationButton(rootElement, label) {
  return Array.from(rootElement.querySelectorAll(".primary-nav > button")).find(
    (button) => button.querySelector("span")?.childNodes[0]?.textContent?.trim() === label,
  );
}

function readVisibleNavigationLabels(rootElement) {
  return Array.from(
    rootElement.querySelectorAll(".primary-nav > button > span"),
    (element) => element.childNodes[0]?.textContent?.trim(),
  );
}

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function waitFor(React, predicate) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (predicate()) return;
    await React.act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
  }
  assert.fail("Timed out waiting for navigation order workspace.");
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
