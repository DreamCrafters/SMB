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

test("warehouse 1C tab shows the loaded stock report and switches date and account", async () => {
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
  const requests = [];

  try {
    const { Warehouse1cWorkspace } = await vite.ssrLoadModule(
      "/src/Warehouse1c.tsx",
    );
    globalThis.fetch = async (input) => {
      const url = new URL(String(input), "http://127.0.0.1:5173/");

      if (url.pathname !== "/api/warehouse-1c/stock-balances") {
        throw new Error(`Unexpected request: ${url.pathname}`);
      }

      const accountCode = url.searchParams.get("accountCode");
      const reportDate = url.searchParams.get("reportDate");

      requests.push({ accountCode, reportDate });

      return jsonResponse({
        accounts: [
          { code: "10.01", label: "Счёт 10.01 (Материалы)" },
          { code: "43", label: "Счёт 43 (Готовая продукция)" },
        ],
        accountCode: accountCode ?? "43",
        availableDates: ["2026-08-23", "2026-08-22"],
        report: {
          accountCode: accountCode ?? "43",
          accountLabel: accountCode === "10.01"
            ? "Счёт 10.01 (Материалы)"
            : "Счёт 43 (Готовая продукция)",
          reportDate: reportDate ?? "2026-08-23",
          fileName: "Остатки.xlsx",
          importedAt: "2026-08-23 06:30:00.000",
          balances: [
            {
              nomenclature: "ША-8",
              openingBalance: "12500.5",
              closingBalance: "10",
            },
            {
              nomenclature: "ШБ-5",
              openingBalance: "",
              closingBalance: "3",
            },
          ],
        },
      });
    };

    const container = dom.window.document.querySelector("#root");
    const root = createRoot(container);
    await React.act(async () => {
      root.render(React.createElement(Warehouse1cWorkspace));
    });
    await waitFor(React, () => container.querySelector("tbody tr") !== null);

    // Раздел открывается кнопкой «Остатки»: движение по складу — следующий этап.
    assert.deepEqual(
      Array.from(container.querySelectorAll(".laboratory-section-tabs button"))
        .map((button) => button.textContent),
      ["Остатки"],
    );
    assert.deepEqual(
      Array.from(container.querySelectorAll("thead th"))
        .map((cell) => cell.textContent),
      ["Номенклатура", "Ост. нач.", "Ост. кон."],
    );
    // Пустой остаток не превращается в ноль.
    assert.deepEqual(readTableRows(container), [
      ["ША-8", "12 500,5", "10"],
      ["ШБ-5", "—", "3"],
    ]);
    assert.deepEqual(requests, [{ accountCode: null, reportDate: null }]);

    const dateSelect = findSelectByLabel(container, "Дата");
    assert.deepEqual(
      Array.from(dateSelect.options).map((option) => option.textContent),
      ["23.08.2026", "22.08.2026"],
    );
    assert.equal(dateSelect.value, "2026-08-23");

    await React.act(async () => {
      selectOption(dom.window, dateSelect, "2026-08-22");
    });
    await waitFor(React, () => requests.length > 1);
    assert.deepEqual(requests[1], {
      accountCode: null,
      reportDate: "2026-08-22",
    });

    const accountSelect = findSelectByLabel(container, "Счёт");
    assert.deepEqual(
      Array.from(accountSelect.options).map((option) => option.textContent),
      ["Счёт 10.01 (Материалы)", "Счёт 43 (Готовая продукция)"],
    );

    // Смена счёта сбрасывает дату: у другого счёта свой набор выгрузок.
    await React.act(async () => {
      selectOption(dom.window, accountSelect, "10.01");
    });
    await waitFor(React, () => requests.length > 2);
    assert.deepEqual(requests[2], { accountCode: "10.01", reportDate: null });
  } finally {
    globalThis.fetch = previousFetch;
    await vite.close();
    restoreDomGlobals(previousGlobals);
    dom.window.close();
  }
});

test("warehouse 1C tab says when it reads the production database", async () => {
  const dom = new JSDOM(
    '<!doctype html><html><body><div id="root"></div></body></html>',
    { url: "http://127.0.0.1:5173/" },
  );
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
    const { Warehouse1cWorkspace } = await vite.ssrLoadModule(
      "/src/Warehouse1c.tsx",
    );
    globalThis.fetch = async () =>
      jsonResponse({
        accounts: [{ code: "43", label: "Счёт 43 (Готовая продукция)" }],
        accountCode: "43",
        availableDates: ["2026-08-23"],
        isReadOnlySource: true,
        report: {
          accountCode: "43",
          accountLabel: "Счёт 43 (Готовая продукция)",
          reportDate: "2026-08-23",
          fileName: "Остатки.xlsx",
          importedAt: "2026-08-23 06:30:00.000",
          balances: [
            { nomenclature: "ША-8", openingBalance: "1", closingBalance: "2" },
          ],
        },
      });

    const container = dom.window.document.querySelector("#root");
    const root = createRoot(container);
    await React.act(async () => {
      root.render(React.createElement(Warehouse1cWorkspace));
    });
    await waitFor(React, () => container.querySelector("tbody tr") !== null);

    // Иначе непонятно, почему на тестовом сайте видны боевые остатки.
    assert.match(
      container.textContent,
      /Данные основной базы/u,
    );
  } finally {
    globalThis.fetch = previousFetch;
    await vite.close();
    restoreDomGlobals(previousGlobals);
    dom.window.close();
  }
});

test("warehouse 1C tab explains an empty store instead of an empty table", async () => {
  const dom = new JSDOM(
    '<!doctype html><html><body><div id="root"></div></body></html>',
    { url: "http://127.0.0.1:5173/" },
  );
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
    const { Warehouse1cWorkspace } = await vite.ssrLoadModule(
      "/src/Warehouse1c.tsx",
    );
    globalThis.fetch = async () =>
      jsonResponse({
        accounts: [{ code: "43", label: "Счёт 43 (Готовая продукция)" }],
        accountCode: "43",
        availableDates: [],
      });

    const container = dom.window.document.querySelector("#root");
    const root = createRoot(container);
    await React.act(async () => {
      root.render(React.createElement(Warehouse1cWorkspace));
    });
    await waitFor(
      React,
      () => container.querySelector(".laboratory-empty-note") !== null,
    );

    assert.equal(
      container.querySelector(".laboratory-empty-note").textContent,
      "Остатки из 1С за выбранную дату ещё не загружены.",
    );
    assert.equal(findSelectByLabel(container, "Дата").disabled, true);
    assert.equal(container.querySelector("table"), null);
  } finally {
    globalThis.fetch = previousFetch;
    await vite.close();
    restoreDomGlobals(previousGlobals);
    dom.window.close();
  }
});

function readTableRows(root) {
  return Array.from(root.querySelectorAll("tbody tr")).map((row) =>
    Array.from(row.querySelectorAll("td")).map((cell) => cell.textContent));
}

function findSelectByLabel(root, labelText) {
  const label = Array.from(root.querySelectorAll("label")).find(
    (item) => item.querySelector(":scope > span")?.textContent === labelText,
  );
  const select = label?.querySelector("select");
  assert.ok(select, `Expected select labelled ${labelText}`);
  return select;
}

function selectOption(window, select, value) {
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLSelectElement.prototype,
    "value",
  )?.set;

  setter.call(select, value);
  select.dispatchEvent(new window.Event("change", { bubbles: true }));
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
  assert.fail("Timed out waiting for the warehouse 1C state.");
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
