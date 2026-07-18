import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { createServer } from "vite";

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

function captureDomGlobals() {
  return Object.fromEntries(
    [
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
    ].map((name) => [name, globalThis[name]]),
  );
}

function installDomGlobals(window) {
  Object.assign(globalThis, {
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
  });
}

function restoreDomGlobals(previousGlobals) {
  for (const [name, value] of Object.entries(previousGlobals)) {
    if (value === undefined) {
      delete globalThis[name];
    } else {
      globalThis[name] = value;
    }
  }
}
