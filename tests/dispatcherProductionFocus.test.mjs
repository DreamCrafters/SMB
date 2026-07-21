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

for (const { label, isAdminPreviewMode } of [
  { label: "dispatcher mode", isAdminPreviewMode: false },
  { label: "admin preview", isAdminPreviewMode: true },
]) {
test(`production form loads all saved data by date in ${label}`, async () => {
  const dom = new JSDOM(
    "<!doctype html><html><body><div id=\"root\"></div></body></html>",
    { url: "http://127.0.0.1:5173/" },
  );
  const previousGlobals = captureDomGlobals();
  const previousFetch = globalThis.fetch;
  const previousRemoteApiUrl = process.env.VITE_SMB_REMOTE_API_URL;
  const initialDateRequestStarted = createDeferred();
  const initialDateResponseRelease = createDeferred();
  const selectedDateRequestStarted = createDeferred();
  const selectedDateResponseRelease = createDeferred();
  const emptyDateRequestStarted = createDeferred();
  const emptyDateResponseRelease = createDeferred();
  const requestedUrls = [];

  installDomGlobals(dom.window);
  globalThis.fetch = async (endpoint) => {
    const url = String(endpoint);
    requestedUrls.push(url);

    if (url.includes("/api/production-brands")) {
      return jsonResponse({
        labels: ["МКР-1", "ПБ-5"],
      });
    }

    if (url.includes("/api/production-plans/daily")) {
      return jsonResponse({
        plan: {
          date: "2026-07-18",
          values: {
            forming: 8,
            sorting: 7,
            unformed: 6,
            chamotte: 5,
          },
        },
      });
    }

    if (
      url.includes("/api/dispatcher/submissions") &&
      url.includes("formId=production") &&
      url.includes("reportDate=2026-07-18")
    ) {
      selectedDateRequestStarted.resolve();
      await selectedDateResponseRelease.promise;
      return jsonResponse({
        submissions: [
          {
            id: "production-2026-07-18-latest",
            formId: "production",
            formTitle: "Выработка",
            payload: {
              reportDate: "18.07.2026",
              formingDay: "12.5",
              formingProductBrand: "МКР-1",
              unformedBrand3: "ПБ-5",
              unformedFact3: "4",
              jarStart1: "10",
              granulationFraction1630Day: "2",
            },
            summary: "Выработка за 18.07.2026",
            status: "received",
            submittedByAccountId: "dispatcher-1",
            submittedAt: "2026-07-18T18:00:00.000Z",
            receivedAt: "2026-07-18T18:00:01.000Z",
          },
        ],
        productionReportTables: emptyProductionTables(),
        productionMonthOverview: null,
        receivedAt: "2026-07-18T18:00:02.000Z",
        summary: {
          total: 1,
          byForm: [
            { formId: "production", formTitle: "Выработка", count: 1 },
          ],
        },
      });
    }

    if (
      url.includes("/api/dispatcher/submissions") &&
      url.includes("reportDate=2026-07-17")
    ) {
      emptyDateRequestStarted.resolve();
      await emptyDateResponseRelease.promise;
      return jsonResponse({
        submissions: [],
        productionReportTables: emptyProductionTables(),
        productionMonthOverview: null,
        receivedAt: "2026-07-17T00:00:00.000Z",
        summary: { total: 0, byForm: [] },
      });
    }

    if (url.includes("/api/dispatcher/submissions")) {
      initialDateRequestStarted.resolve();
      await initialDateResponseRelease.promise;
      return jsonResponse({
        submissions: [],
        productionReportTables: emptyProductionTables(),
        productionMonthOverview: null,
        receivedAt: "2026-07-19T00:00:00.000Z",
        summary: { total: 0, byForm: [] },
      });
    }

    throw new Error(`Unexpected request: ${url}`);
  };

  const React = await import("react");
  const { createRoot } = await import("react-dom/client");
  let vite;
  let root;

  try {
    process.env.VITE_SMB_REMOTE_API_URL = "http://127.0.0.1:3000";
    vite = await createServer({
      appType: "custom",
      logLevel: "silent",
      server: { middlewareMode: true },
    });
    const { DispatcherProductionReportFormBody } = await vite.ssrLoadModule(
      "/src/App.tsx",
    );
    const rootElement = dom.window.document.getElementById("root");
    root = createRoot(rootElement);
    const form = buildProductionFormDefinition();

    await React.act(async () => {
      root.render(
        React.createElement(
          "form",
          null,
          React.createElement(DispatcherProductionReportFormBody, {
            form,
            isAdminPreviewMode,
            isSubmitting: false,
            onResetStatus: () => undefined,
            status: "",
          }),
        ),
      );
    });
    await waitForSignal(
      initialDateRequestStarted.promise,
      "The initial production report request did not start",
    );
    await React.act(async () => {
      initialDateResponseRelease.resolve();
      await initialDateResponseRelease.promise;
    });

    const reportDateInput = rootElement.querySelector(
      'input[name="reportDate"]',
    );

    await React.act(async () => {
      setNativeInputValue(reportDateInput, "2026-07-18");
      reportDateInput.dispatchEvent(
        new dom.window.Event("input", { bubbles: true }),
      );
    });
    await waitForSignal(
      selectedDateRequestStarted.promise,
      "The saved production report request did not start",
    );
    assert.ok(
      requestedUrls.some(
        (url) =>
          url.includes("formId=production") &&
          url.includes("reportDate=2026-07-18"),
      ),
      "The saved production report was not requested for the selected date",
    );
    await React.act(async () => {
      selectedDateResponseRelease.resolve();
      await selectedDateResponseRelease.promise;
    });

    assert.equal(
      rootElement.querySelector('input[name="formingDay"]')?.value,
      "12.5",
    );
    assert.equal(
      rootElement.querySelector('input[name="formingProductBrand"]')?.value,
      "МКР-1",
    );
    assert.equal(
      rootElement.querySelector('input[name="unformedBrand3"]')?.value,
      "ПБ-5",
    );
    assert.equal(
      rootElement.querySelector('input[name="unformedFact3"]')?.value,
      "4",
    );
    assert.equal(
      rootElement.querySelector('input[name="jarStart1"]')?.value,
      "10",
    );
    assert.equal(
      rootElement.querySelector(
        'input[name="granulationFraction1630Day"]',
      )?.value,
      "2",
    );
    assert.match(rootElement.textContent ?? "", /Внести изменения/u);
    assert.ok(
      requestedUrls.some((url) => url.includes("/api/production-plans/daily")),
    );
    assert.ok(
      requestedUrls.some((url) => url.includes("/api/production-brands")),
    );
    assert.match(
      rootElement.querySelector(".production-report-daily-plan")?.textContent ?? "",
      /Формовка8.*Сортировка7.*Неформованная продукция, контейнеры6.*Цех обжига шамота5/u,
    );
    const addBrandButtons = rootElement.querySelectorAll(
      'button[aria-label="Добавить новую марку"]',
    );
    assert.equal(addBrandButtons.length, isAdminPreviewMode ? 0 : 1);
    if (!isAdminPreviewMode) {
      assert.ok(
        addBrandButtons[0].compareDocumentPosition(
          rootElement.querySelector(".production-report-table-wrap"),
        ) & dom.window.Node.DOCUMENT_POSITION_FOLLOWING,
      );
    }

    await React.act(async () => {
      setNativeInputValue(reportDateInput, "2026-07-17");
      reportDateInput.dispatchEvent(
        new dom.window.Event("input", { bubbles: true }),
      );
    });
    await waitForSignal(
      emptyDateRequestStarted.promise,
      "The empty production report request did not start",
    );
    assert.ok(
      requestedUrls.some((url) => url.includes("reportDate=2026-07-17")),
      "The empty production report was not requested for the selected date",
    );
    await React.act(async () => {
      emptyDateResponseRelease.resolve();
      await emptyDateResponseRelease.promise;
    });

    assert.equal(
      rootElement.querySelector('input[name="formingDay"]')?.value,
      "",
    );
    assert.doesNotMatch(rootElement.textContent ?? "", /Внести изменения/u);
    assert.match(
      rootElement.textContent ?? "",
      /За выбранную дату данные ещё не внесены/u,
    );

    await React.act(async () => root.unmount());
    root = undefined;
  } finally {
    initialDateResponseRelease.resolve();
    selectedDateResponseRelease.resolve();
    emptyDateResponseRelease.resolve();
    if (root !== undefined) {
      await React.act(async () => root.unmount());
    }
    globalThis.fetch = previousFetch;
    if (vite !== undefined) {
      await vite.close();
    }
    if (previousRemoteApiUrl === undefined) {
      delete process.env.VITE_SMB_REMOTE_API_URL;
    } else {
      process.env.VITE_SMB_REMOTE_API_URL = previousRemoteApiUrl;
    }
    dom.window.close();
    restoreDomGlobals(previousGlobals);
  }
});
}

test("production monthly plan input accepts comma and dot with two decimal places", async () => {
  const dom = new JSDOM(
    "<!doctype html><html><body><div id=\"root\"></div></body></html>",
    { url: "http://127.0.0.1:5173/" },
  );
  const previousGlobals = captureDomGlobals();
  const previousFetch = globalThis.fetch;
  const previousRemoteApiUrl = process.env.VITE_SMB_REMOTE_API_URL;
  const requestsStarted = createDeferred();
  const responsesRelease = createDeferred();
  const requestedKinds = new Set();

  installDomGlobals(dom.window);
  globalThis.fetch = async (endpoint, init) => {
    const url = String(endpoint);

    if (url.includes("/api/production-plans/preview")) {
      requestedKinds.add("preview");
      if (requestedKinds.size === 2) requestsStarted.resolve();
      await responsesRelease.promise;
      const month = JSON.parse(String(init?.body)).month;

      return jsonResponse({
        month,
        allDates: [`${month}-01`],
        weekdayDates: [`${month}-01`],
      });
    }

    if (url.includes("/api/production-plans?month=")) {
      requestedKinds.add("plan");
      if (requestedKinds.size === 2) requestsStarted.resolve();
      await responsesRelease.promise;
      return jsonResponse({ plan: null });
    }

    throw new Error(`Unexpected request: ${url}`);
  };

  const React = await import("react");
  const { createRoot } = await import("react-dom/client");
  let vite;
  let root;

  try {
    process.env.VITE_SMB_REMOTE_API_URL = "http://127.0.0.1:3000";
    vite = await createServer({
      appType: "custom",
      logLevel: "silent",
      server: { middlewareMode: true },
    });
    const { ProductionPlanWorkspace } = await vite.ssrLoadModule(
      "/src/App.tsx",
    );
    const rootElement = dom.window.document.getElementById("root");
    root = createRoot(rootElement);

    await React.act(async () => {
      root.render(
        React.createElement(ProductionPlanWorkspace, {
          isAdminPreviewMode: false,
          onShowToast: () => undefined,
        }),
      );
    });
    await waitForSignal(
      requestsStarted.promise,
      "The production plan requests did not start",
    );
    await React.act(async () => {
      responsesRelease.resolve();
      await responsesRelease.promise;
    });

    const planInput = rootElement.querySelector('input[inputmode="decimal"]');

    assert.ok(planInput instanceof dom.window.HTMLInputElement);
    assert.equal(planInput.disabled, false);
    await React.act(async () => {
      setNativeInputValue(planInput, "12abc,5");
      planInput.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    });
    assert.equal(planInput.value, "12.5");

    await React.act(async () => {
      setNativeInputValue(planInput, "12.756");
      planInput.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    });
    assert.equal(planInput.value, "12.75");

    await React.act(async () => root.unmount());
    root = undefined;
  } finally {
    responsesRelease.resolve();
    if (root !== undefined) {
      await React.act(async () => root.unmount());
    }
    globalThis.fetch = previousFetch;
    if (vite !== undefined) {
      await vite.close();
    }
    if (previousRemoteApiUrl === undefined) {
      delete process.env.VITE_SMB_REMOTE_API_URL;
    } else {
      process.env.VITE_SMB_REMOTE_API_URL = previousRemoteApiUrl;
    }
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

function jsonResponse(payload) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function emptyProductionTables() {
  return {
    forming: [],
    sorting: [],
    unformed: [],
    chamotte: [],
    jars: [],
    granulation: [],
  };
}

function buildProductionFormDefinition() {
  const numberField = (name, label = name) => ({
    name,
    label,
    type: "number",
    required: false,
  });

  return {
    id: "production",
    title: "Выработка",
    description: "",
    fields: [
      { name: "reportDate", label: "Дата отчета", type: "date", required: true },
      numberField("formingDay"),
      numberField("sortingDay"),
      numberField("jarStart1"),
      numberField("jarEnd1"),
      numberField("jarStart2"),
      numberField("jarEnd2"),
      numberField("jarStart3"),
      numberField("jarEnd3"),
      numberField("granulationPlatesInOperation"),
      numberField("granulationMillHours"),
      numberField("granulationFraction1630Day"),
      numberField("granulationFraction1218Day"),
    ],
  };
}

function setNativeInputValue(input, value) {
  const setter = Object.getOwnPropertyDescriptor(
    input.ownerDocument.defaultView.HTMLInputElement.prototype,
    "value",
  )?.set;

  setter.call(input, value);
}

function createDeferred() {
  let resolve;
  const promise = new Promise((promiseResolve) => {
    resolve = promiseResolve;
  });

  return { promise, resolve };
}

async function waitForSignal(signal, failureMessage) {
  let timeoutId;

  try {
    await Promise.race([
      signal,
      new Promise((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error(failureMessage)), 20_000);
      }),
    ]);
  } finally {
    clearTimeout(timeoutId);
  }
}

function restoreGlobal(name, descriptor) {
  if (descriptor === undefined) {
    delete globalThis[name];
  } else {
    Object.defineProperty(globalThis, name, descriptor);
  }
}
