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

test("railway wagon order form adds cargo rows and totals them", async () => {
  const context = await mountWorkspace({ roles: ["sales"], orders: [] });

  try {
    const { React, container, dom } = context;

    await waitFor(React, () => container.querySelector(".railway-cargo-table") !== null);

    const readCargoRows = () =>
      container.querySelectorAll(".railway-cargo-table tbody tr");
    assert.equal(readCargoRows().length, 1);

    await clickButton(React, container, "Добавить груз");
    assert.equal(readCargoRows().length, 2);

    fillNumber(React, dom.window, readCargoRows()[0], 0, "10");
    fillNumber(React, dom.window, readCargoRows()[0], 1, "1.25");
    // Порядок числовых полей строки: паллеты, вес паллеты, Ш, В, Д, вес крепежа.
    fillNumber(React, dom.window, readCargoRows()[0], 5, "0.4");
    fillNumber(React, dom.window, readCargoRows()[1], 0, "4");
    fillNumber(React, dom.window, readCargoRows()[1], 1, "0.5");
    fillNumber(React, dom.window, readCargoRows()[1], 5, "0.1");

    // Итоговый вес строки — вычисляемая ячейка, а не поле ввода.
    assert.deepEqual(
      Array.from(container.querySelectorAll(".railway-calculated")).map(
        (output) => output.textContent,
      ),
      ["12,5", "2"],
    );

    const footer = Array.from(
      container.querySelectorAll(".railway-cargo-table tfoot td"),
    ).map((cell) => cell.textContent);
    assert.deepEqual(footer, ["", "14", "1,75", "14,5", "", "", "0,5", ""]);
    assert.match(container.textContent, /Общий вес в вагоне: 15 т/u);

    await clickButton(React, readCargoRows()[1], "Удалить");
    assert.equal(readCargoRows().length, 1);
  } finally {
    await context.dispose();
  }
});

test("railway wagon stages are shown only to the role that fills them", async () => {
  const order = buildOrder({ orderedAt: "2026-09-07T08:00:00.000Z" });
  const context = await mountWorkspace({ roles: ["carrier"], orders: [order] });

  try {
    const { React, container } = context;

    await waitFor(React, () => container.querySelector(".railway-orders-table tbody tr") !== null);

    // Сотрудник по работе с РЖД заявку не создаёт.
    assert.equal(container.querySelector(".railway-wagon-form"), null);
    assert.match(container.textContent, /сотрудник по работе с РЖД/u);

    await clickButton(React, container, "Этапы");
    await waitFor(React, () => container.querySelector(".railway-stage-panel") !== null);

    assert.deepEqual(
      Array.from(container.querySelectorAll(".railway-stage-item legend")).map(
        (legend) => legend.textContent,
      ),
      ["Условия перевозки"],
    );
  } finally {
    await context.dispose();
  }
});

test("railway wagon list shows the derived status and hides passed stages", async () => {
  const order = buildOrder({
    orderedAt: "2026-09-07T08:00:00.000Z",
    pricingStartedAt: "2026-09-07T09:00:00.000Z",
    logisticsApprovedAt: "2026-09-07T10:00:00.000Z",
  });
  const context = await mountWorkspace({ roles: ["logistics"], orders: [order] });

  try {
    const { React, container } = context;

    await waitFor(React, () => container.querySelector(".railway-orders-table tbody tr") !== null);

    const firstCell = container.querySelector(".railway-orders-table tbody td");
    assert.equal(firstCell.textContent, "Согласовано логистом");

    await clickButton(React, container, "Этапы");
    await waitFor(React, () => container.querySelector(".railway-stage-panel") !== null);

    // Логист уже согласовал, следующий этап за менеджером.
    assert.match(
      container.querySelector(".railway-stage-panel").textContent,
      /Доступных этапов нет/u,
    );
  } finally {
    await context.dispose();
  }
});

async function mountWorkspace({ roles, orders }) {
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

  globalThis.fetch = async (input) => {
    const url = new URL(String(input), "http://127.0.0.1:5173/");

    if (url.pathname === "/api/railway-wagons") {
      return jsonResponse({ orders, carrierOptions: [], roles });
    }
    if (url.pathname === "/api/railway-reference/securing-methods") {
      return jsonResponse({
        securingMethods: [{ name: "Растяжки", description: null }],
      });
    }
    if (url.pathname === "/api/production-brands") {
      return jsonResponse({ labels: ["ШБ-5"] });
    }
    if (url.pathname === "/api/laboratory/raw-material-nomenclature") {
      return jsonResponse({ records: [] });
    }

    return jsonResponse({});
  };

  const { RailwayWagonsWorkspace } = await vite.ssrLoadModule(
    "/src/RailwayWagons.tsx",
  );
  const container = dom.window.document.querySelector("#root");
  const root = createRoot(container);

  await React.act(async () => {
    root.render(
      React.createElement(RailwayWagonsWorkspace, {
        isAdminPreviewMode: false,
        onShowToast: () => {},
      }),
    );
  });

  return {
    React,
    container,
    dom,
    async dispose() {
      globalThis.fetch = previousFetch;
      await vite.close();
      restoreDomGlobals(previousGlobals);
      dom.window.close();
    },
  };
}

function buildOrder(stages) {
  return {
    id: "order-1",
    contractReference: "12/2026",
    movementDirection: "На погрузку",
    destinationStation: "Абагур-Лесной",
    destinationStationRoad: "З-Сиб",
    wagonType: "КР (крытый)",
    rentCost: null,
    tariffCost: null,
    demurragePenalty: null,
    carrier: null,
    wagonNumber: null,
    expectedArrivalDate: null,
    currentLocation: null,
    replacedByOrderId: null,
    cargoLines: [],
    createdAt: "2026-09-07T08:00:00.000Z",
    orderedAt: null,
    pricingStartedAt: null,
    logisticsApprovedAt: null,
    managerApprovedAt: null,
    specificationSignedAt: null,
    enRouteAt: null,
    atLoadingStationAt: null,
    rejectedAt: null,
    atShipperTrackAt: null,
    atLoadingAt: null,
    loadedAt: null,
    acceptedForCarriageAt: null,
    deliveredAt: null,
    unloadedAt: null,
    releasedAt: null,
    ...stages,
  };
}

async function clickButton(React, root, label) {
  const button = Array.from(root.querySelectorAll("button")).find(
    (item) => item.textContent === label,
  );
  assert.ok(button, `Expected a button labelled ${label}`);
  await React.act(async () => {
    button.dispatchEvent(new globalThis.window.MouseEvent("click", { bubbles: true }));
  });
}

function fillNumber(React, window, row, index, value) {
  const input = row.querySelectorAll('input[type="number"]')[index];
  assert.ok(input, `Expected a numeric input at ${index}`);
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    "value",
  )?.set;
  React.act(() => {
    setter.call(input, value);
    input.dispatchEvent(new window.Event("input", { bubbles: true }));
  });
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
  assert.fail("Timed out waiting for the railway wagons state.");
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
