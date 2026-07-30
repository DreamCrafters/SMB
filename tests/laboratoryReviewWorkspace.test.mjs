import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
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

test("laboratory review filters results by section, analysis date, and nomenclature", async () => {
  const dom = new JSDOM(
    '<!doctype html><html><body><div id="root"></div></body></html>',
    { url: "http://127.0.0.1:5173/" },
  );
  const styleElement = dom.window.document.createElement("style");
  styleElement.textContent = await readFile(
    new URL("../src/styles.css", import.meta.url),
    "utf8",
  );
  dom.window.document.head.append(styleElement);
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
  const resultRequests = [];

  try {
    const { LaboratoryReviewWorkspace } = await vite.ssrLoadModule(
      "/src/LaboratoryReview.tsx",
    );
    globalThis.fetch = async (input) => {
      const url = new URL(String(input), "http://127.0.0.1:5173/");

      if (url.pathname === "/api/laboratory/reference") {
        return jsonResponse({
          reference: {
            indicators: [{ id: "al2o3", label: "Al2O3", standard: "ГОСТ 1" }],
            incomingTestProfiles: [],
            finishedProductTypes: [],
          },
        });
      }
      if (url.pathname === "/api/laboratory/results") {
        resultRequests.push({
          section: url.searchParams.get("section"),
          dateFrom: url.searchParams.get("dateFrom"),
          dateTo: url.searchParams.get("dateTo"),
          name: url.searchParams.get("name"),
        });
        return jsonResponse({
          results: [
            {
              id: "laboratory-result-incoming",
              section: "incoming",
              analysisDate: "2026-07-20",
              materialLabel: "Глина марки ГИМ-2",
              samples: [{
                sampleIdentifier: "Вагон 12345",
                values: { al2o3: "31,4" },
              }],
              laboratoryAssistantDisplayName: "Иванова Анна",
              createdAt: "2026-07-20T08:30:00.000Z",
            },
            {
              id: "laboratory-result-finished",
              section: "finished_product",
              analysisDate: "2026-07-22",
              materialLabel: "Неформованные изделия",
              productBrand: "ШКИ-66",
              values: { al2o3: "44,1" },
              laboratoryAssistantDisplayName: "Иванова Анна",
              createdAt: "2026-07-22T08:30:00.000Z",
            },
          ],
        });
      }
      throw new Error(`Unexpected request: ${url.pathname}`);
    };

    const container = dom.window.document.querySelector("#root");
    const root = createRoot(container);
    await React.act(async () => {
      root.render(
        React.createElement(LaboratoryReviewWorkspace, {
          isAdminPreviewMode: false,
          onShowToast: () => {},
        }),
      );
    });
    await waitFor(React, () => resultRequests.length > 0);

    assert.deepEqual(resultRequests[0], {
      section: null,
      dateFrom: null,
      dateTo: null,
      name: null,
    });

    const sectionTabs = Array.from(
      container.querySelectorAll(".laboratory-section-tabs button"),
    ).map((button) => button.textContent);
    assert.deepEqual(sectionTabs, [
      "Все испытания",
      "Входящий контроль",
      "Выходящий контроль",
    ]);

    const headers = Array.from(
      container.querySelectorAll(".laboratory-results-table thead th"),
    ).map((cell) => cell.textContent);
    assert.deepEqual(headers.slice(0, 4), [
      "Дата анализа",
      "Раздел",
      "Объект испытаний / вид продукции",
      "Номер пробы / марка",
    ]);
    const sectionCells = Array.from(
      container.querySelectorAll(".laboratory-results-table tbody tr"),
    ).map((row) => row.querySelectorAll("td")[1]?.textContent);
    assert.deepEqual(sectionCells, ["Входящий контроль", "Выходящий контроль"]);

    await React.act(async () => {
      findButtonByText(container, "Выходящий контроль").dispatchEvent(
        new dom.window.MouseEvent("click", { bubbles: true }),
      );
    });
    await waitFor(React, () =>
      resultRequests.some((request) => request.section === "finished_product")
    );

    assert.equal(
      container.querySelector(".laboratory-review-filters .laboratory-filters"),
      null,
      "Filter inputs stay hidden until a filter button is pressed.",
    );

    await React.act(async () => {
      findButtonByText(container, "По дате испытаний").dispatchEvent(
        new dom.window.MouseEvent("click", { bubbles: true }),
      );
    });
    const dateFromInput = findInputByLabel(container, "С даты");
    await React.act(async () => {
      setNativeInputValue(dateFromInput, "2026-07-21");
      dateFromInput.dispatchEvent(
        new dom.window.Event("input", { bubbles: true }),
      );
    });
    await waitFor(React, () =>
      resultRequests.some((request) => request.dateFrom === "2026-07-21")
    );

    await React.act(async () => {
      findButtonByText(container, "По наименованию (номенклатуре)")
        .dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
    });
    const nameInput = findInputByLabel(container, "Наименование");
    await React.act(async () => {
      setNativeInputValue(nameInput, "ШКИ");
      nameInput.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    });
    await waitFor(React, () =>
      resultRequests.some((request) => request.name === "ШКИ")
    );

    const combined = resultRequests.at(-1);
    assert.deepEqual(combined, {
      section: "finished_product",
      dateFrom: "2026-07-21",
      dateTo: null,
      name: "ШКИ",
    });

    // Switching a filter off must drop its value from the next request.
    await React.act(async () => {
      findButtonByText(container, "По дате испытаний").dispatchEvent(
        new dom.window.MouseEvent("click", { bubbles: true }),
      );
    });
    await waitFor(React, () => resultRequests.at(-1)?.dateFrom === null);
    assert.equal(resultRequests.at(-1)?.name, "ШКИ");

    assert.equal(
      container.querySelector("form"),
      null,
      "Review tab must not expose any data entry form.",
    );

    await React.act(async () => root.unmount());
  } finally {
    globalThis.fetch = previousFetch;
    await vite.close();
    restoreDomGlobals(previousGlobals);
    dom.window.close();
  }
});

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function findButtonByText(root, text) {
  const button = Array.from(root.querySelectorAll("button")).find(
    (item) => item.textContent === text,
  );
  assert.ok(button, `Expected button labelled ${text}`);
  return button;
}

function findInputByLabel(root, labelText) {
  const label = Array.from(root.querySelectorAll("label")).find(
    (item) => item.querySelector(":scope > span")?.textContent === labelText,
  );
  const input = label?.querySelector("input");
  assert.ok(input, `Expected input labelled ${labelText}`);
  return input;
}

function setNativeInputValue(input, value) {
  const setter = Object.getOwnPropertyDescriptor(
    Object.getPrototypeOf(input),
    "value",
  )?.set;

  setter.call(input, value);
}

async function waitFor(React, predicate) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (predicate()) return;
    await React.act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
  }
  assert.fail("Timed out waiting for laboratory review state.");
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
