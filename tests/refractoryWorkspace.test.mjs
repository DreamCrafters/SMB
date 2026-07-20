import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { createServer } from "vite";

const DOM_GLOBAL_NAMES = [
  "document",
  "Element",
  "Event",
  "HTMLElement",
  "HTMLInputElement",
  "MouseEvent",
  "navigator",
  "Node",
  "window",
  "IS_REACT_ACT_ENVIRONMENT",
];

test("refractory workspace opens one of three independent table buttons", async () => {
  const dom = new JSDOM(
    '<!doctype html><html><body><div id="root"></div></body></html>',
    { url: "http://127.0.0.1:5173/" },
  );
  const previousGlobals = captureDomGlobals();
  installDomGlobals(dom.window);
  const React = await import("react");
  const { createRoot } = await import("react-dom/client");
  const vite = await createServer({
    appType: "custom",
    logLevel: "silent",
    server: { middlewareMode: true },
  });

  try {
    const { RefractoryShopWorkspace } = await vite.ssrLoadModule(
      "/src/RefractoryReports.tsx",
    );
    const rootElement = dom.window.document.getElementById("root");
    const root = createRoot(rootElement);
    const profile = {
      userId: "operator-user",
      displayName: "Иванов Иван Иванович",
      accountType: "worker",
      activeAccess: {
        accountId: "operator-access",
        accountType: "worker",
        position: "refractory-operator",
        positionDisplayName: "Мастер ОЦ",
        displayName: "Мастер ОЦ",
        scope: { kind: "organization" },
        capabilities: ["business.submit_refractory_reports"],
        navigationItems: ["business.refractory_shop"],
        issuedAt: "2026-07-21T08:00:00.000Z",
      },
      receivedAt: "2026-07-21T08:00:00.000Z",
    };

    await React.act(async () => {
      root.render(
        React.createElement(RefractoryShopWorkspace, {
          profile,
          isAdminPreviewMode: true,
          onShowToast() {},
        }),
      );
    });

    const menuButtons = Array.from(
      rootElement.querySelectorAll(".refractory-report-menu button"),
    );
    assert.deepEqual(
      menuButtons.map((button) => button.querySelector("span")?.textContent),
      ["ЦОШ", "Оборудование и выпуск сырца", "Печное отделение"],
    );
    assert.equal(
      rootElement.querySelector("input[readonly]")?.value,
      "Иванов Иван Иванович",
    );

    await React.act(async () => menuButtons[1].click());
    assert.ok(
      rootElement.querySelector(
        'input[aria-label="Пресс СМ-1085 №1: Марка изделия"]',
      ),
    );
    assert.equal(rootElement.querySelectorAll("form").length, 1);

    await React.act(async () => root.unmount());
  } finally {
    await vite.close();
    dom.window.close();
    restoreDomGlobals(previousGlobals);
  }
});

test("dispatcher opens pending refractory reports from a separate choice button", async () => {
  const dom = new JSDOM(
    '<!doctype html><html><body><div id="root"></div></body></html>',
    { url: "http://127.0.0.1:5173/" },
  );
  const previousGlobals = captureDomGlobals();
  installDomGlobals(dom.window);
  const React = await import("react");
  const { createRoot } = await import("react-dom/client");
  const vite = await createServer({
    appType: "custom",
    logLevel: "silent",
    server: { middlewareMode: true },
  });

  try {
    const { DataEntryWorkspace } = await vite.ssrLoadModule("/src/App.tsx");
    const rootElement = dom.window.document.getElementById("root");
    const root = createRoot(rootElement);

    await React.act(async () => {
      root.render(
        React.createElement(DataEntryWorkspace, {
          ariaLabel: "Внесение данных диспетчером",
          status: "",
          isSubmitting: false,
          onSubmit() {},
          dispatcherForms: {
            status: "ready",
            source: "remote",
            forms: [],
          },
          currentUserDisplayName: "Диспетчер",
          isAdminPreviewMode: false,
          refreshVersion: 0,
          onResetStatus() {},
          onShowToast() {},
          pendingRefractoryReports: [buildPendingReport()],
          refractoryQueueError: "",
          onRefractoryReportResolved() {},
        }),
      );
    });

    assert.equal(
      rootElement.querySelector(
        'section[aria-label="Таблицы ОЦ на подтверждение"]',
      ),
      null,
    );
    const queueButton = Array.from(rootElement.querySelectorAll("button")).find(
      (button) => button.textContent.includes("Таблицы огнеупорного цеха"),
    );
    assert.ok(queueButton);
    assert.match(queueButton.textContent, /Ожидают решения: 1/u);

    await React.act(async () => queueButton.click());
    assert.ok(
      rootElement.querySelector(
        'section[aria-label="Таблицы ОЦ на подтверждение"]',
      ),
    );
    assert.ok(
      Array.from(rootElement.querySelectorAll("button")).some(
        (button) => button.textContent === "К выбору формы",
      ),
    );

    await React.act(async () => root.unmount());
  } finally {
    await vite.close();
    dom.window.close();
    restoreDomGlobals(previousGlobals);
  }
});

function buildPendingReport() {
  return {
    id: "report-1",
    reportType: "cosh",
    reportDate: "2026-07-21",
    shiftNumber: 1,
    revisionNumber: 1,
    status: "pending",
    payload: { kilnNumber: "1" },
    totals: {
      chamotteOutputTons: 0,
      bunkerFillTons: 0,
      chamotteSupplyTons: 0,
      baggingTons: 0,
      scrapRemovalTons: 0,
    },
    masterDisplayName: "Мастер ОЦ",
    submittedAt: "2026-07-21T08:30:00.000Z",
  };
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
