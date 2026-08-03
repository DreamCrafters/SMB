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

test("dispatcher login reports open incidents and can open the closing form", async () => {
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
    dom.window.setTimeout(() => callback(dom.window.performance.now()), 0);
  dom.window.cancelAnimationFrame = (id) => dom.window.clearTimeout(id);

  const previousGlobals = captureDomGlobals();
  const previousFetch = globalThis.fetch;
  const previousAppEnv = process.env.VITE_SMB_APP_ENV;
  const previousRemoteApiUrl = process.env.VITE_SMB_REMOTE_API_URL;
  process.env.VITE_SMB_APP_ENV = "production";
  process.env.VITE_SMB_REMOTE_API_URL = "http://127.0.0.1:5173";
  installDomGlobals(dom.window);
  const React = await import("react");
  const { createRoot } = await import("react-dom/client");
  const vite = await createServer({
    appType: "custom",
    logLevel: "silent",
    server: { middlewareMode: true },
  });
  let isAuthenticated = false;

  try {
    globalThis.fetch = async (input, init = {}) => {
      const url = new URL(String(input), "http://127.0.0.1:5173/");
      const method = init.method ?? "GET";

      if (url.pathname === "/api/access/profile" && method === "GET") {
        return isAuthenticated
          ? jsonResponse({ profile: buildDispatcherProfile() })
          : jsonResponse(
              {
                error: {
                  code: "unauthenticated",
                  message: "Требуется вход.",
                },
              },
              401,
            );
      }
      if (url.pathname === "/api/auth/login" && method === "POST") {
        isAuthenticated = true;
        return jsonResponse({ ok: true });
      }
      if (url.pathname === "/api/auth/logout" && method === "POST") {
        isAuthenticated = false;
        return jsonResponse({ ok: true });
      }
      if (url.pathname === "/api/dispatcher/forms" && method === "GET") {
        return jsonResponse({
          forms: [
            {
              id: "incident_close",
              title: "Закрытие инцидента",
              sheetName: "Инциденты",
              fields: [
                {
                  name: "incidentNumber",
                  label: "№",
                  type: "text",
                  required: true,
                },
              ],
            },
          ],
        });
      }
      if (
        url.pathname === "/api/dispatcher/submissions" &&
        method === "GET"
      ) {
        return jsonResponse(buildDispatcherFeedResponse());
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
    await waitFor(React, () => rootElement.querySelector(".auth-login-form"));

    await login(React, dom.window, rootElement);
    await waitFor(
      React,
      () => rootElement.querySelector('[aria-labelledby="dispatcher-incident-login-title"]'),
    );

    const firstDialog = rootElement.querySelector('[role="dialog"]');
    assert.ok(firstDialog);
    assert.match(firstDialog.textContent, /Незакрытых инцидентов: 2/u);
    const continueButton = findButton(firstDialog, "Продолжить работу");
    const openClosingButton = findButton(
      firstDialog,
      "Перейти к закрытию инцидентов",
    );
    assert.ok(continueButton);
    assert.ok(openClosingButton);

    await React.act(async () => {
      firstDialog.dispatchEvent(
        new dom.window.MouseEvent("mousedown", { bubbles: true }),
      );
    });
    assert.ok(rootElement.querySelector('[role="dialog"]'));

    await React.act(async () => continueButton.click());
    assert.equal(rootElement.querySelector('[role="dialog"]'), null);
    assert.ok(
      rootElement.querySelector('.dispatcher-form-choice[aria-label="Выбор формы"]'),
    );

    const logoutButton = findButton(rootElement, "Выйти из аккаунта");
    assert.ok(logoutButton);
    await React.act(async () => logoutButton.click());
    await waitFor(React, () => rootElement.querySelector(".auth-login-form"));

    await login(React, dom.window, rootElement);
    await waitFor(
      React,
      () => rootElement.querySelector('[aria-labelledby="dispatcher-incident-login-title"]'),
    );
    const secondDialog = rootElement.querySelector('[role="dialog"]');
    assert.ok(secondDialog);

    const backdrop = secondDialog.parentElement;
    assert.ok(backdrop?.classList.contains("admin-db-modal-backdrop"));
    await React.act(async () => {
      backdrop.dispatchEvent(
        new dom.window.MouseEvent("mousedown", { bubbles: true }),
      );
    });
    assert.equal(rootElement.querySelector('[role="dialog"]'), null);

    const secondLogoutButton = findButton(rootElement, "Выйти из аккаунта");
    assert.ok(secondLogoutButton);
    await React.act(async () => secondLogoutButton.click());
    await waitFor(React, () => rootElement.querySelector(".auth-login-form"));

    await login(React, dom.window, rootElement);
    await waitFor(
      React,
      () => rootElement.querySelector('[aria-labelledby="dispatcher-incident-login-title"]'),
    );
    const thirdDialog = rootElement.querySelector('[role="dialog"]');
    assert.ok(thirdDialog);
    const thirdOpenClosingButton = findButton(
      thirdDialog,
      "Перейти к закрытию инцидентов",
    );
    assert.ok(thirdOpenClosingButton);

    await React.act(async () => thirdOpenClosingButton.click());
    await waitFor(
      React,
      () =>
        rootElement.querySelector(".dispatcher-form-toolbar strong")?.textContent ===
        "Закрытие инцидента",
    );
    assert.equal(rootElement.querySelector('[role="dialog"]'), null);
    assert.match(
      rootElement.querySelector(".incident-close-choice")?.textContent ?? "",
      /Выберите инцидент/u,
    );

    await React.act(async () => root.unmount());
  } finally {
    globalThis.fetch = previousFetch;
    if (previousAppEnv === undefined) {
      delete process.env.VITE_SMB_APP_ENV;
    } else {
      process.env.VITE_SMB_APP_ENV = previousAppEnv;
    }
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

async function login(React, window, rootElement) {
  const loginInput = rootElement.querySelector('input[name="login"]');
  const passwordInput = rootElement.querySelector('input[name="password"]');
  const form = rootElement.querySelector(".auth-login-form");
  assert.ok(loginInput);
  assert.ok(passwordInput);
  assert.ok(form);

  await React.act(async () => {
    setNativeInputValue(loginInput, "dispatcher");
    loginInput.dispatchEvent(new window.Event("input", { bubbles: true }));
    setNativeInputValue(passwordInput, "password");
    passwordInput.dispatchEvent(new window.Event("input", { bubbles: true }));
  });
  await React.act(async () => {
    form.dispatchEvent(
      new window.Event("submit", { bubbles: true, cancelable: true }),
    );
  });
}

function findButton(rootElement, label) {
  return Array.from(rootElement.querySelectorAll("button")).find(
    (button) => button.textContent?.trim() === label,
  );
}

function setNativeInputValue(input, value) {
  const descriptor = Object.getOwnPropertyDescriptor(
    input.ownerDocument.defaultView.HTMLInputElement.prototype,
    "value",
  );
  descriptor.set.call(input, value);
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
      capabilities: [
        "business.submit_dispatcher_forms",
        "business.view_dispatcher_feed",
      ],
      navigationItems: ["business.dispatcher_form"],
      issuedAt: "2026-08-03T08:00:00.000Z",
    },
    receivedAt: "2026-08-03T08:00:00.000Z",
  };
}

function buildDispatcherFeedResponse() {
  return {
    submissions: [],
    productionReportTables: {
      forming: [],
      sorting: [],
      unformed: [],
      chamotte: [],
      jars: [],
      granulation: [],
    },
    productionReportTableTotals: {
      forming: { rowCount: 0 },
      sorting: { rowCount: 0 },
      unformed: { rowCount: 0 },
      chamotte: { rowCount: 0 },
      jars: { rowCount: 0 },
      granulation: { rowCount: 0 },
    },
    productionMonthOverview: null,
    openIncidents: [
      {
        incidentNumber: "INC-2026-31",
        openedAt: "03.08.2026 08:00",
      },
      {
        incidentNumber: "INC-2026-32",
        openedAt: "03.08.2026 09:00",
      },
    ],
    bankContents: [],
    receivedAt: "2026-08-03T09:05:00.000Z",
    summary: { total: 0, byForm: [] },
  };
}

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function waitFor(React, predicate) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (predicate()) return;
    await React.act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
  }
  assert.fail("Timed out waiting for dispatcher login prompt state.");
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
