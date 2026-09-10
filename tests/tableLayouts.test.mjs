import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { createServer } from "vite";

async function withTables(run) {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: "http://127.0.0.1:5173/", pretendToBeVisual: true });
  const names = ["window", "document", "navigator", "Element", "HTMLElement", "Node", "Event", "MouseEvent", "KeyboardEvent", "HTMLInputElement", "IS_REACT_ACT_ENVIRONMENT", "requestAnimationFrame", "cancelAnimationFrame"];
  const saved = names.map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]);
  for (const name of names) Object.defineProperty(globalThis, name, { configurable: true, writable: true, value: name === "IS_REACT_ACT_ENVIRONMENT" ? true : dom.window[name] });
  const previousFetch = globalThis.fetch;
  let current = { tableId: "warehouse.stock", revision: 0, widths: {} };
  const writes = [];
  let failSave = false;
  globalThis.fetch = async (_url, options) => {
    if (options.method === "PUT") {
      if (failSave) return Response.json({ error: { message: "Другая версия" } }, { status: 409 });
      const sent = JSON.parse(options.body);
      writes.push(sent);
      current = { ...sent, revision: current.revision + 1 };
      return Response.json(current);
    }
    return Response.json({ canManage: true, layouts: [current] });
  };
  const vite = await createServer({ appType: "custom", logLevel: "silent", server: { middlewareMode: true } });
  const React = await import("react");
  const { createRoot } = await import("react-dom/client");
  const { TableLayoutProvider } = await vite.ssrLoadModule("/src/TableLayoutProvider.tsx");
  const { ManagedTable } = await vite.ssrLoadModule("/src/ManagedTable.tsx");
  const { TableCell, TableHeader } = await vite.ssrLoadModule("/src/TableCell.tsx");
  const h = React.createElement;
  const root = createRoot(document.getElementById("root"));
  try {
    await run({ dom, React, h, root, TableLayoutProvider, ManagedTable, TableCell, TableHeader, writes, setStored: (layout) => { current = layout; },
      failSave: () => { failSave = true; },
      render: async (children) => React.act(async () => root.render(h(TableLayoutProvider, null, children))),
      click: async (text) => React.act(async () => {
        const button = [...document.querySelectorAll("button")].find((item) => item.textContent === text);
        assert.ok(button, text); button.click();
      }),
    });
  } finally {
    await React.act(async () => root.unmount());
    await vite.close(); globalThis.fetch = previousFetch; dom.window.close();
    for (const [name, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor); else delete globalThis[name];
    }
  }
}

test("table widths follow optional column identities, save once, cancel and report conflicts", async () => withTables(async ({ dom, React, h, TableHeader: TH, TableCell: TD, ManagedTable, render, click, writes, failSave }) => {
  const table = (warehouse) => h(ManagedTable, { tableId: "warehouse.stock", columns: warehouse ? ["warehouse", "nomenclature"] : ["nomenclature"] },
    h("thead", null, h("tr", null, ...(warehouse ? [h(TH, { key: "warehouse" }, "Склад")] : []), h(TH, { key: "name" }, "Номенклатура"))),
    h("tbody", null, h("tr", null, ...(warehouse ? [h(TD, { key: "warehouse" }, "Центральный")] : []), h(TD, { key: "name" }, "Материал"))));
  await render(table(true));
  await click("Настроить колонки");
  let handle = document.querySelector('[role="separator"][aria-label="Ширина: Номенклатура"]');
  assert.ok(handle);
  await React.act(async () => handle.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })));
  assert.equal(writes.length, 0);
  assert.equal(document.querySelector("table").style.getPropertyValue("--table-column-1"), "188px");
  await click("Сохранить");
  assert.deepEqual(writes, [{ tableId: "warehouse.stock", revision: 0, widths: { nomenclature: 188 } }]);
  await render(table(false));
  assert.equal(document.querySelectorAll("col").length, 1);
  assert.equal(document.querySelector("table").style.getPropertyValue("--table-column-0"), "188px");
  await click("Настроить колонки");
  await click("Сбросить ширины");
  assert.equal(document.querySelector("table").style.getPropertyValue("--table-column-0"), "180px");
  await click("Отмена");
  assert.equal(document.querySelector("table").style.getPropertyValue("--table-column-0"), "188px");
  await click("Настроить колонки"); failSave(); await click("Сохранить");
  assert.match(document.body.textContent, /Другая версия/u);
  assert.ok([...document.querySelectorAll("button")].find((button) => button.textContent === "Сохранить").disabled);
}));

test("grouped headers expose handles only for physical leaf columns and preserve form controls", async () => withTables(async ({ h, ManagedTable, TableHeader: TH, TableCell: TD, render, click }) => {
  await render(h(ManagedTable, { tableId: "production.granulation" },
    h("caption", null, "Грануляция"),
    h("thead", null, h("tr", null, h(TH, { rowSpan: 2 }, "Тарелки"), h(TH, { rowSpan: 2 }, "Мельница"), h(TH, { colSpan: 2 }, "Выпуск")),
      h("tr", null, h(TH, null, "16/30"), h(TH, null, "12/18"))),
    h("tbody", null, h("tr", null, h(TD, null, h("input", { name: "plates", defaultValue: "2" })), h(TD, null, "12"), h(TD, null, "10"), h(TD, null, "9")))));
  assert.equal(document.querySelector("table").firstElementChild.tagName, "CAPTION");
  assert.equal(document.querySelector('input[name="plates"]').value, "2");
  assert.equal(document.querySelector('input[name="plates"]').closest(".table-cell-text"), null);
  await click("Настроить колонки");
  assert.equal(document.querySelectorAll('[role="separator"]').length, 4);
  assert.equal(document.querySelector('[aria-label="Ширина: Выпуск"]'), null);
}));

test("overflow tooltip shows complete text only when clipped and closes with Escape", async () => withTables(async ({ dom, React, h, ManagedTable, TableHeader: TH, TableCell: TD, render }) => {
  const longText = "Полный текст <script>без HTML</script> ".repeat(20);
  await render(h(ManagedTable, { tableId: "warehouse.stock", columns: ["nomenclature"] }, h("thead", null, h("tr", null, h(TH, null, "Наименование"))),
    h("tbody", null, h("tr", null, h(TD, null, longText)))));
  const text = document.querySelector("td .table-cell-text");
  Object.defineProperties(text, { scrollHeight: { value: 150, configurable: true }, clientHeight: { value: 52 } });
  await React.act(async () => text.dispatchEvent(new dom.window.MouseEvent("mouseover", { bubbles: true })));
  assert.equal(document.querySelector('[role="tooltip"]').textContent, longText);
  assert.equal(document.querySelector('[role="tooltip"] script'), null);
  await React.act(async () => document.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Escape" })));
  assert.equal(document.querySelector('[role="tooltip"]'), null);
  Object.defineProperty(text, "scrollHeight", { value: 50 });
  await React.act(async () => text.dispatchEvent(new dom.window.MouseEvent("mouseover", { bubbles: true })));
  assert.equal(document.querySelector('[role="tooltip"]'), null);
}));


test("reset preserves widths of hidden columns and other database tables", async () => withTables(async ({ h, ManagedTable, TableHeader: TH, render, click, writes, setStored }) => {
  setStored({ tableId: "admin.database", revision: 3, widths: { "field.app_users.login": 240, "field.dispatcher_submissions.id": 200 } });
  await render(h(ManagedTable, { tableId: "admin.database", columns: ["field.app_users.login"] },
    h("thead", null, h("tr", null, h(TH, null, "Логин")))));
  await click("Настроить колонки"); await click("Сбросить ширины"); await click("Сохранить");
  assert.deepEqual(writes[0].widths, { "field.dispatcher_submissions.id": 200 });
}));

test("record text and its metadata share one clamp without nested tab stops", async () => withTables(async ({ h, React, dom, ManagedTable, TableCell: TD, TableHeader: TH, render }) => {
  let opened = false;
  await render(h(ManagedTable, { tableId: "board.assignments", columns: ["description"] },
    h("thead", null, h("tr", null, h(TH, null, "Содержание"))),
    h("tbody", null, h("tr", null, h(TD, null,
      h("button", { className: "board-assignment-link", onClick: () => { opened = true; } }, "Поручение ".repeat(100)),
      h("small", null, "Протокол 1, пункт 2"))))));
  assert.equal(document.querySelectorAll("td .table-cell-text").length, 1);
  assert.equal(document.querySelectorAll(".table-cell-text[tabindex]").length, 0);
  await React.act(async () => document.querySelector("td button").click());
  assert.equal(opened, true);
  const cell = document.querySelector("td");
  const text = cell.querySelector(".table-cell-text");
  Object.defineProperties(text, { scrollHeight: { value: 200 }, clientHeight: { value: 52 } });
  await React.act(async () => cell.dispatchEvent(new dom.window.MouseEvent("mouseover", { bubbles: true })));
  assert.match(document.querySelector('[role="tooltip"]').textContent, /Протокол 1, пункт 2/u);
}));


test("pointer resize previews without saving and cancellation restores the width", async () => withTables(async ({ dom, React, h, ManagedTable, TableHeader: TH, TableCell: TD, render, click, writes }) => {
  const captured = new WeakMap();
  dom.window.HTMLElement.prototype.setPointerCapture = function (id) { captured.set(this, id); };
  dom.window.HTMLElement.prototype.hasPointerCapture = function (id) { return captured.get(this) === id; };
  dom.window.HTMLElement.prototype.releasePointerCapture = function () { captured.delete(this); };
  await render(h("form", { id: "business-form" }, h(ManagedTable, { tableId: "warehouse.stock", columns: ["nomenclature"] },
    h("thead", null, h("tr", null, h(TH, null, "Номенклатура"))), h("tbody", null, h("tr", null, h(TD, null, h("input", { name: "business", defaultValue: "Текст формы" })))))));
  await click("Настроить колонки");
  const input = document.querySelector('input[name="business"]');
  const numeric = document.querySelector('.table-layout-fields input');
  assert.notEqual(numeric.form, input.form);
  assert.equal(input.form.id, "business-form");
  const handle = document.querySelector('[role="separator"]');
  async function pointer(type, x) {
    await React.act(async () => {
      const event = new dom.window.MouseEvent(type, { clientX: x, button: 0, bubbles: true });
      Object.defineProperty(event, "pointerId", { value: 7 });
      handle.dispatchEvent(event);
      await new Promise((resolve) => dom.window.requestAnimationFrame(resolve));
    });
  }
  await pointer("pointerdown", 100); await pointer("pointermove", 140);
  assert.equal(document.querySelector("table").style.getPropertyValue("--table-column-0"), "220px");
  assert.equal(writes.length, 0);
  assert.equal(document.querySelector('input[name="business"]'), input);
  await pointer("pointercancel", 140);
  assert.equal(document.querySelector("table").style.getPropertyValue("--table-column-0"), "180px");
  await pointer("pointerdown", 100); await pointer("pointermove", 140); await pointer("pointerup", 140);
  await click("Сохранить");
  assert.deepEqual(writes[0].widths, { nomenclature: 220 });
}));
