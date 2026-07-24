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

test("clicking the active left navigation tab returns to its main page", async () => {
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
        return jsonResponse({ profile: buildDispatcherProfile() });
      }
      if (url.pathname === "/api/dispatcher/forms") {
        return jsonResponse({
          forms: [
            {
              id: "incident",
              title: "Открытие инцидента",
              sheetName: "Открытие инцидента",
              fields: [
                {
                  name: "description",
                  label: "Описание",
                  type: "text",
                  required: false,
                },
              ],
            },
          ],
        });
      }

      return jsonResponse({});
    };

    const { default: App } = await vite.ssrLoadModule("/src/App.tsx");
    const rootElement = dom.window.document.getElementById("root");
    const root = createRoot(rootElement);

    await React.act(async () => {
      root.render(React.createElement(App));
    });
    await waitFor(
      React,
      () =>
        Array.from(
          rootElement.querySelectorAll(".dispatcher-form-choice-button"),
        ).some((button) => button.textContent.includes("Открытие инцидента")),
    );

    const formButton = Array.from(
      rootElement.querySelectorAll(".dispatcher-form-choice-button"),
    ).find((button) => button.textContent.includes("Открытие инцидента"));
    assert.ok(formButton);

    await React.act(async () => formButton.click());
    assert.ok(rootElement.querySelector(".data-entry-form"));

    const activeNavigationButton = rootElement.querySelector(
      '.primary-nav .nav-item[aria-current="page"]',
    );
    assert.ok(activeNavigationButton);
    assert.match(activeNavigationButton.textContent, /Форма/u);

    await React.act(async () => activeNavigationButton.click());

    assert.equal(rootElement.querySelector(".data-entry-form"), null);
    assert.ok(
      rootElement.querySelector('.dispatcher-form-choice[aria-label="Выбор формы"]'),
    );

    await React.act(async () => root.unmount());
  } finally {
    globalThis.fetch = previousFetch;
    await vite.close();
    dom.window.close();
    restoreDomGlobals(previousGlobals);
  }
});

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function buildDispatcherProfile() {
  return {
    userId: "dispatcher-user",
    displayName: "Иванов Иван",
    accountType: "dispatcher",
    activeAccess: {
      accountId: "dispatcher-access",
      accountType: "dispatcher",
      position: "dispatcher",
      positionDisplayName: "Диспетчер",
      displayName: "Диспетчер",
      scope: { kind: "organization" },
      capabilities: ["business.submit_dispatcher_forms"],
      navigationItems: ["business.dispatcher_form"],
      issuedAt: "2026-07-24T08:00:00.000Z",
    },
    receivedAt: "2026-07-24T08:00:00.000Z",
  };
}

async function waitFor(React, predicate) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (predicate()) return;
    await React.act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
  }
  assert.fail("Timed out waiting for the dispatcher form choice.");
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
