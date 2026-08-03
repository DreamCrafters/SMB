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

test("hybrid position switches between business and admin navigation", async () => {
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

  try {
    globalThis.fetch = async (input) => {
      const url = new URL(String(input), "http://127.0.0.1:5173/");

      if (url.pathname === "/api/access/profile") {
        return jsonResponse({ profile: buildHybridPositionProfile() });
      }
      if (url.pathname === "/api/business/overview") {
        return jsonResponse({
          period: { monthStart: "2026-08-01", today: "2026-08-03" },
          incidents: {
            monthTotal: 0,
            monthClosed: 0,
            todayTotal: 0,
            openNow: 0,
          },
          laboratory: { monthTotal: 0, todayTotal: 0 },
          receivedAt: "2026-08-03T08:00:00.000Z",
        });
      }
      if (url.pathname === "/api/admin/database") {
        return jsonResponse({ tables: [] });
      }

      return jsonResponse({});
    };

    const { default: App } = await vite.ssrLoadModule("/src/App.tsx");
    const rootElement = dom.window.document.getElementById("root");
    const root = createRoot(rootElement);

    await React.act(async () => {
      root.render(React.createElement(App));
    });
    await waitFor(React, () => readNavigationButtons(rootElement).length === 2);

    const navigationButtons = readNavigationButtons(rootElement);
    const overviewButton = navigationButtons.find(
      (button) => button.querySelector("span")?.textContent === "Обзор",
    );
    const databaseButton = navigationButtons.find(
      (button) => button.querySelector("span")?.textContent === "БД",
    );
    assert.ok(overviewButton);
    assert.ok(databaseButton);
    assert.equal(rootElement.querySelectorAll('section[aria-label="Обзор"]').length, 1);
    assertSingleActiveNavigation(rootElement, "Обзор");

    await React.act(async () => databaseButton.click());
    await waitFor(
      React,
      () => rootElement.querySelector('section[aria-label="БД"]') !== null,
    );
    assert.equal(rootElement.querySelector('section[aria-label="Обзор"]'), null);
    assertSingleActiveNavigation(rootElement, "БД");

    await React.act(async () => overviewButton.click());
    await waitFor(
      React,
      () => rootElement.querySelector('section[aria-label="Обзор"]') !== null,
    );
    assert.equal(rootElement.querySelector('section[aria-label="БД"]'), null);
    assertSingleActiveNavigation(rootElement, "Обзор");

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

function readNavigationButtons(rootElement) {
  return Array.from(rootElement.querySelectorAll(".primary-nav .nav-item"));
}

function assertSingleActiveNavigation(rootElement, expectedLabel) {
  const activeButtons = Array.from(
    rootElement.querySelectorAll('.primary-nav .nav-item[aria-current="page"]'),
  );
  assert.equal(activeButtons.length, 1);
  assert.equal(activeButtons[0].querySelector("span")?.textContent, expectedLabel);
}

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function buildHybridPositionProfile() {
  return {
    userId: "admin-user",
    displayName: "Администратор",
    accountType: "business_owner",
    activeAccess: {
      accountId: "admin-access",
      accountType: "business_owner",
      position: "hybrid-position",
      positionDisplayName: "Руководитель и администратор",
      displayName: "Руководитель и администратор",
      scope: { kind: "organization" },
      capabilities: [
        "business.view_all_statistics",
        "platform.manage_analytics_database",
      ],
      navigationItems: ["business.overview", "admin.database"],
      issuedAt: "2026-08-03T08:00:00.000Z",
    },
    receivedAt: "2026-08-03T08:00:00.000Z",
  };
}

async function waitFor(React, predicate) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (predicate()) return;
    await React.act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
  }
  assert.fail("Timed out waiting for hybrid position navigation.");
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
