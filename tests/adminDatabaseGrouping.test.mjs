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

const vite = await createServer({
  appType: "custom",
  logLevel: "silent",
  server: { middlewareMode: true },
});

test.after(async () => {
  await vite.close();
});

test("equipment submissions collapse into one report row with per-item editing", async () => {
  const dom = new JSDOM(
    "<!doctype html><html><body><div id=\"root\"></div></body></html>",
    { url: "http://127.0.0.1:5173/" },
  );
  const previousGlobals = captureDomGlobals();

  installDomGlobals(dom.window);

  const React = await import("react");
  const { createRoot } = await import("react-dom/client");
  try {
    const { AdminDatabaseRowsTable } = await vite.ssrLoadModule("/src/App.tsx");
    const rootElement = dom.window.document.getElementById("root");
    const root = createRoot(rootElement);
    const editedRows = [];
    const group = {
      key: "equipment:22.07.2026",
      label: "Оборудование · отправка за 22.07.2026",
    };

    await React.act(async () => {
      root.render(
        React.createElement(AdminDatabaseRowsTable, {
          rowsState: {
            status: "ready",
            table: buildTable(),
            rows: [
              buildRow("equipment-1", "Оборудование", "Пресс №1", group),
              buildRow("equipment-2", "Оборудование", "Пресс №2", group),
              buildRow("production-1", "Выработка", "Выработка за 22.07.2026"),
            ],
            mergeTargets: [],
            limit: 100,
            offset: 0,
          },
          search: "",
          onEdit: (row) => editedRows.push(row.primaryKey.id),
          onMerge: () => {},
          onDelete: () => {},
          onClear: () => {},
          onNextPage: () => {},
          onPreviousPage: () => {},
        }),
      );
    });

    const readSummaries = () =>
      Array.from(rootElement.querySelectorAll("tbody tr")).map((row) =>
        row.textContent?.replace(/\s+/gu, " ").trim(),
      );

    // Свёрнутая отправка занимает одну строку вместо строки на оборудование.
    const collapsed = readSummaries();
    assert.equal(collapsed.length, 2);
    assert.match(collapsed[0] ?? "", /Оборудование · отправка за 22\.07\.2026/u);
    assert.match(collapsed[0] ?? "", /2 записей/u);
    assert.match(collapsed[1] ?? "", /Выработка за 22\.07\.2026/u);

    const toggle = rootElement.querySelector(".admin-db-group-toggle");
    assert.ok(toggle instanceof dom.window.HTMLElement);
    assert.equal(toggle.getAttribute("aria-expanded"), "false");

    await React.act(async () => toggle.click());

    // Раскрытая отправка показывает каждую единицу оборудования отдельно.
    const expanded = readSummaries();
    assert.equal(expanded.length, 4);
    assert.match(expanded[1] ?? "", /Пресс №1/u);
    assert.match(expanded[2] ?? "", /Пресс №2/u);

    const memberEditButton = Array.from(
      rootElement.querySelectorAll(".admin-db-group-member button"),
    ).find((button) => button.textContent?.trim() === "Править");
    assert.ok(memberEditButton);

    await React.act(async () => memberEditButton.click());

    assert.deepEqual(editedRows, ["equipment-1"]);

    await React.act(async () => root.unmount());
  } finally {
    dom.window.close();
    restoreDomGlobals(previousGlobals);
  }
});

function buildTable() {
  return {
    name: "dispatcher_submissions",
    label: "Диспетчерские записи",
    rowCount: 3,
    primaryKey: ["id"],
    canDelete: false,
    canClear: false,
    canMerge: false,
    controls: {},
    columns: [
      {
        name: "form",
        label: "Раздел",
        format: "text",
        editable: false,
        multiline: false,
        nullable: false,
      },
      {
        name: "summary",
        label: "Краткое описание",
        format: "text",
        editable: true,
        multiline: true,
        nullable: true,
      },
    ],
  };
}

function buildRow(id, form, summary, group) {
  return {
    primaryKey: { id },
    values: { form, summary },
    editorFields: [],
    ...(group === undefined ? {} : { group }),
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
    if (descriptor === undefined) {
      delete globalThis[name];
      continue;
    }

    Object.defineProperty(globalThis, name, descriptor);
  }
}
