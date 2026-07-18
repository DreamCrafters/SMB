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

test("forming and sorting facts switch focus on the first mouse press", async () => {
  const dom = new JSDOM(
    "<!doctype html><html><body><div id=\"root\"></div></body></html>",
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
    const { ProductionSummaryTable } = await vite.ssrLoadModule("/src/App.tsx");
    const rootElement = dom.window.document.getElementById("root");
    const root = createRoot(rootElement);

    await React.act(async () => {
      const form = {
        id: "production",
        title: "Выработка",
        description: "",
        fields: [
          {
            label: "Факт формовки за сутки",
            name: "formingDay",
            required: false,
            type: "number",
          },
          {
            label: "Факт сортировки за сутки",
            name: "sortingDay",
            required: false,
            type: "number",
          },
        ],
      };

      root.render(
        React.createElement(
          React.Fragment,
          null,
          React.createElement(ProductionSummaryTable, {
            brandLabels: [],
            form,
            isAdminPreviewMode: false,
            prefix: "forming",
            title: "Формовка",
            onCreateBrand: async () => ({}),
          }),
          React.createElement(ProductionSummaryTable, {
            brandLabels: [],
            form,
            isAdminPreviewMode: false,
            prefix: "sorting",
            title: "Сортировка",
            onCreateBrand: async () => ({}),
          }),
        ),
      );
    });

    let previousInput;

    for (const name of ["formingDay", "sortingDay"]) {
      const input = dom.window.document.querySelector(`input[name="${name}"]`);

      assert.ok(input instanceof dom.window.HTMLInputElement);
      const firstPressWasNotCancelled = input.dispatchEvent(
        new dom.window.MouseEvent("mousedown", {
          bubbles: true,
          button: 0,
          cancelable: true,
        }),
      );

      assert.equal(firstPressWasNotCancelled, false);
      assert.equal(dom.window.document.activeElement, input);
      if (previousInput !== undefined) {
        assert.notEqual(dom.window.document.activeElement, previousInput);
      }

      const repeatedPressWasNotCancelled = input.dispatchEvent(
        new dom.window.MouseEvent("mousedown", {
          bubbles: true,
          button: 0,
          cancelable: true,
        }),
      );

      assert.equal(repeatedPressWasNotCancelled, true);
      assert.equal(dom.window.document.activeElement, input);
      previousInput = input;
    }

    await React.act(async () => root.unmount());
  } finally {
    await vite.close();
    dom.window.close();
    restoreDomGlobals(previousGlobals);
  }
});

test("production dashboard selects the first section that receives live rows", async () => {
  const dom = new JSDOM(
    "<!doctype html><html><body><div id=\"root\"></div></body></html>",
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
  const emptyTables = {
    forming: [],
    sorting: [],
    unformed: [],
    chamotte: [],
    jars: [],
    granulation: [],
  };

  try {
    const { ProductionReportSummaryTable } = await vite.ssrLoadModule(
      "/src/App.tsx",
    );
    const rootElement = dom.window.document.getElementById("root");
    const root = createRoot(rootElement);

    await React.act(async () => {
      root.render(
        React.createElement(ProductionReportSummaryTable, {
          form: undefined,
          submissions: [],
          tables: emptyTables,
        }),
      );
    });

    await React.act(async () => {
      root.render(
        React.createElement(ProductionReportSummaryTable, {
          form: undefined,
          submissions: [],
          tables: {
            ...emptyTables,
            unformed: [
              {
                reportId: "production-today",
                reportDate: "2026-07-18",
                receivedAt: "2026-07-18T18:00:00.000Z",
                facts: [
                  { brand: "ПБ-5", value: 12, monthValue: 12 },
                ],
                dayFact: 12,
                monthFact: 12,
              },
            ],
          },
        }),
      );
    });

    const activeSection = dom.window.document.querySelector(
      '[aria-label="Таблицы выработки"] button[aria-pressed="true"]',
    );

    assert.equal(activeSection?.textContent, "Неформованная продукция");
    assert.doesNotMatch(
      rootElement.textContent ?? "",
      /Нет данных для выбранной таблицы и периода/u,
    );

    await React.act(async () => root.unmount());
  } finally {
    await vite.close();
    dom.window.close();
    restoreDomGlobals(previousGlobals);
  }
});

test("DOM globals replace and restore a getter-only navigator", () => {
  const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const dom = new JSDOM("<!doctype html><html><body></body></html>");

  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    enumerable: true,
    get: () => ({ userAgent: "Node.js" }),
  });
  const previousGlobals = captureDomGlobals();

  try {
    installDomGlobals(dom.window);
    assert.equal(globalThis.navigator, dom.window.navigator);

    restoreDomGlobals(previousGlobals);
    assert.deepEqual(
      Object.getOwnPropertyDescriptor(globalThis, "navigator"),
      previousGlobals.navigator,
    );
  } finally {
    dom.window.close();
    restoreGlobal("navigator", originalNavigator);
  }
});

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
    restoreGlobal(name, descriptor);
  }
}

function restoreGlobal(name, descriptor) {
  if (descriptor === undefined) {
    delete globalThis[name];
  } else {
    Object.defineProperty(globalThis, name, descriptor);
  }
}
