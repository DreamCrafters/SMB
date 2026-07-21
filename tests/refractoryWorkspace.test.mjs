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

test("refractory workspace opens one of three independent table buttons", async () => {
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
    const { RefractoryShopWorkspace } = await vite.ssrLoadModule(
      "/src/RefractoryReports.tsx",
    );
    const { readRefractoryShiftContext } = await vite.ssrLoadModule(
      "/src/services/refractoryShift.ts",
    );
    const initialShift = readRefractoryShiftContext();
    const returnedReport = buildReturnedReport({
      reportDate: initialShift.reportDate,
      shiftNumber: initialShift.shiftNumber,
    });
    globalThis.fetch = async (input) => {
      const url = new URL(String(input), "http://127.0.0.1:5173/");
      const isReturnedShift =
        url.searchParams.get("date") === returnedReport.reportDate &&
        url.searchParams.get("shift") === String(returnedReport.shiftNumber);
      return new Response(
        JSON.stringify({ reports: isReturnedShift ? [returnedReport] : [] }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    };
    const rootElement = dom.window.document.getElementById("root");
    const root = createRoot(rootElement);

    await React.act(async () => {
      root.render(
        React.createElement(RefractoryShopWorkspace, {
          profile: buildOperatorProfile(),
          isAdminPreviewMode: false,
          onShowToast() {},
        }),
      );
    });
    await waitFor(
      React,
      () =>
        rootElement.querySelector(".refractory-report-return-count") !== null,
    );

    const menuButtons = Array.from(
      rootElement.querySelectorAll(".refractory-report-menu button"),
    );
    assert.deepEqual(
      menuButtons.map(
        (button) =>
          button.querySelector(".refractory-report-label")?.textContent,
      ),
      ["ЦОШ", "Оборудование и выпуск сырца", "Печное отделение"],
    );
    assert.equal(
      menuButtons[0].querySelector(".refractory-report-return-count"),
      null,
    );
    assert.equal(
      menuButtons[1].querySelector(".refractory-report-return-count")
        ?.textContent,
      "1",
    );
    assert.match(
      menuButtons[1].getAttribute("aria-label") ?? "",
      /Возвращено на доработку: 1/u,
    );
    assert.equal(
      menuButtons[2].querySelector(".refractory-report-return-count"),
      null,
    );

    const reportDateInput = rootElement.querySelector('input[type="date"]');
    assert.ok(reportDateInput);
    const otherDate =
      initialShift.reportDate === "2026-07-20"
        ? "2026-07-21"
        : "2026-07-20";
    await React.act(async () => {
      setNativeInputValue(reportDateInput, otherDate);
      reportDateInput.dispatchEvent(
        new dom.window.Event("input", { bubbles: true }),
      );
    });
    await waitFor(
      React,
      () =>
        rootElement.querySelector(".refractory-report-return-count") === null,
    );
    assert.equal(
      menuButtons[1].querySelector(".refractory-report-return-count"),
      null,
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
    globalThis.fetch = previousFetch;
    await vite.close();
    dom.window.close();
    restoreDomGlobals(previousGlobals);
  }
});

test("refractory navigation shows the number of reports returned for correction", async () => {
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
    const { SideRail } = await vite.ssrLoadModule("/src/App.tsx");
    const rootElement = dom.window.document.getElementById("root");
    const root = createRoot(rootElement);

    await React.act(async () => {
      root.render(
        React.createElement(SideRail, {
          profile: buildOperatorProfile(),
          signedInDisplayName: "Иванов Иван Иванович",
          isAdminPreviewMode: false,
          isMobile: false,
          isOpen: true,
          onToggle() {},
          onRequestClose() {},
          onClearSession() {},
          isSessionLoading: false,
          ownerTab: "refractory_shop",
          onOwnerTabChange() {},
          adminTab: "account_preview",
          onAdminTabChange() {},
          pendingRefractoryCount: 0,
          returnedRefractoryCount: 2,
        }),
      );
    });

    const refractoryButton = Array.from(
      rootElement.querySelectorAll(".primary-nav button"),
    ).find((button) => button.textContent.includes("Огнеупорный цех"));
    assert.ok(refractoryButton);
    assert.equal(
      refractoryButton.querySelector(".nav-notification-count")?.textContent,
      "2",
    );

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

    const rejectButton = Array.from(rootElement.querySelectorAll("button")).find(
      (button) => button.textContent === "Вернуть на доработку",
    );
    assert.ok(rejectButton);
    await React.act(async () => rejectButton.click());

    assert.ok(rootElement.querySelector(".refractory-reject-comment textarea"));
    assert.equal(
      Array.from(rootElement.querySelectorAll("button")).some(
        (button) => button.textContent === "Подтвердить",
      ),
      false,
    );
    assert.ok(
      Array.from(rootElement.querySelectorAll("button")).some(
        (button) => button.textContent === "Вернуть",
      ),
    );

    await React.act(async () => root.unmount());
  } finally {
    await vite.close();
    dom.window.close();
    restoreDomGlobals(previousGlobals);
  }
});

test("refractory report highlights invalid numeric fields with a clear message", async () => {
  const dom = new JSDOM(
    '<!doctype html><html><body><div id="root"></div></body></html>',
    { url: "http://127.0.0.1:5173/" },
  );
  const previousGlobals = captureDomGlobals();
  installDomGlobals(dom.window);
  const previousFetch = globalThis.fetch;
  let postCount = 0;
  globalThis.fetch = async (_input, init) => {
    if (init?.method === "POST") postCount += 1;
    return new Response(
      JSON.stringify(
        init?.method === "POST"
          ? {
              error: {
                code: "invalid_response",
                message: "Строка 1, «Работа, ч»: укажите число от 0 до 24.",
                details: [
                  {
                    fieldPath: "formed.0.workedHours",
                    message:
                      "Строка 1, «Работа, ч»: укажите число от 0 до 24.",
                  },
                ],
              },
            }
          : { reports: [] },
      ),
      {
        status: init?.method === "POST" ? 400 : 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  };
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

    await React.act(async () => {
      root.render(
        React.createElement(RefractoryShopWorkspace, {
          profile: buildOperatorProfile(),
          isAdminPreviewMode: false,
          onShowToast() {},
        }),
      );
    });
    await waitFor(
      React,
      () => rootElement.querySelector(".refractory-report-form") !== null,
    );

    const menuButtons = Array.from(
      rootElement.querySelectorAll(".refractory-report-menu button"),
    );
    await React.act(async () => menuButtons[1].click());
    const workedHours = rootElement.querySelector(
      'input[aria-label="Пресс СМ-1085 №1: Работа, ч"]',
    );
    assert.ok(workedHours);

    await React.act(async () => {
      setNativeInputValue(workedHours, "4ч,5");
      workedHours.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    });
    assert.equal(workedHours.value, "4.5");

    setNativeInputValue(workedHours, "42");
    const form = rootElement.querySelector(".refractory-report-form");
    await React.act(async () => {
      form.dispatchEvent(
        new dom.window.Event("submit", { bubbles: true, cancelable: true }),
      );
    });

    assert.equal(postCount, 0);
    assert.equal(workedHours.getAttribute("aria-invalid"), "true");
    assert.match(
      rootElement.querySelector(".form-status-error")?.textContent ?? "",
      /Работа, ч.*от 0 до 24/u,
    );
    assert.doesNotMatch(rootElement.textContent, /workedHours/u);

    await React.act(async () => {
      setNativeInputValue(workedHours, "4");
      workedHours.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    });
    assert.equal(workedHours.hasAttribute("aria-invalid"), false);

    await React.act(async () => {
      form.dispatchEvent(
        new dom.window.Event("submit", { bubbles: true, cancelable: true }),
      );
    });
    assert.equal(postCount, 1);
    assert.equal(workedHours.getAttribute("aria-invalid"), "true");

    await React.act(async () => root.unmount());
  } finally {
    globalThis.fetch = previousFetch;
    await vite.close();
    dom.window.close();
    restoreDomGlobals(previousGlobals);
  }
});

function setNativeInputValue(input, value) {
  const setter = Object.getOwnPropertyDescriptor(
    input.ownerDocument.defaultView.HTMLInputElement.prototype,
    "value",
  )?.set;

  setter.call(input, value);
}

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

function buildReturnedReport(overrides = {}) {
  return {
    ...buildPendingReport(),
    id: "returned-report",
    reportType: "equipment",
    status: "rejected",
    payload: { formedRows: [], unformedRows: [] },
    totals: {},
    rejectionComment: "Уточните данные",
    ...overrides,
  };
}

function buildOperatorProfile() {
  return {
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
}

async function waitFor(React, predicate) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (predicate()) return;
    await React.act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
  }
  assert.fail("Timed out waiting for refractory workspace state.");
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
