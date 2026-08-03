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

test("dispatcher form opens shared history and active navigation resets the workspace", async () => {
  const dom = new JSDOM(
    '<!doctype html><html><body><div id="root"></div></body></html>',
    { url: "http://127.0.0.1:5173/" },
  );
  dom.window.matchMedia = () => ({
    matches: false,
    media: "",
    onchange: null,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent() {
      return false;
    },
  });
  const previousGlobals = captureDomGlobals();
  const previousFetch = globalThis.fetch;
  const previousRemoteApiUrl = process.env.VITE_SMB_REMOTE_API_URL;
  process.env.VITE_SMB_REMOTE_API_URL = "http://127.0.0.1:5173";
  installDomGlobals(dom.window);
  const React = await import("react");
  const { createRoot } = await import("react-dom/client");
  const vite = await createServer({
    appType: "custom",
    logLevel: "silent",
    server: { middlewareMode: true },
  });

  try {
    globalThis.fetch = async (input) => {
      const url = new URL(String(input), "http://127.0.0.1:5173/");

      if (url.pathname === "/api/access/profile") {
        return jsonResponse({ profile: buildDispatcherProfile() });
      }
      if (url.pathname === "/api/dispatcher/forms") {
        return jsonResponse({
          forms: [
            {
              id: "incident",
              title: "Открытие инцидента",
              sheetName: "Открытие инцидента",
              fields: [
                {
                  name: "description",
                  label: "Описание",
                  type: "text",
                  required: false,
                },
              ],
            },
          ],
        });
      }
      if (url.pathname === "/api/dispatcher/submissions") {
        return jsonResponse({
          submissions: [
            {
              id: "incident-1",
              formId: "incident",
              formTitle: "Открытие инцидента",
              payload: {
                incidentNumber: "INC-2026-1",
                datetime: "24.07.2026 10:00",
              },
              summary: "INC-2026-1",
              status: "received",
              submittedByAccountId: "dispatcher-access",
              submittedAt: "2026-07-24T07:00:00.000Z",
              receivedAt: "2026-07-24T07:00:00.000Z",
            },
          ],
          productionReportTables: {
            forming: [],
            sorting: [],
            unformed: [],
            chamotte: [],
            jars: [],
            granulation: [],
          },
          productionMonthOverview: null,
          openIncidents: [],
          bankContents: [],
          receivedAt: "2026-07-24T07:00:00.000Z",
          summary: {
            total: 1,
            byForm: [{ formId: "incident", count: 1 }],
          },
        });
      }

      return jsonResponse({});
    };

    const { default: App } = await vite.ssrLoadModule("/src/App.tsx");
    const rootElement = dom.window.document.getElementById("root");
    const root = createRoot(rootElement);

    await React.act(async () => {
      root.render(React.createElement(App));
    });
    await waitFor(
      React,
      () =>
        Array.from(
          rootElement.querySelectorAll(".dispatcher-form-choice-button"),
        ).some((button) => button.textContent.includes("Открытие инцидента")),
    );

    const formButton = Array.from(
      rootElement.querySelectorAll(".dispatcher-form-choice-button"),
    ).find((button) => button.textContent.includes("Открытие инцидента"));
    assert.ok(formButton);

    await React.act(async () => formButton.click());
    assert.ok(rootElement.querySelector(".data-entry-form"));
    const draftInput = rootElement.querySelector('input[name="description"]');
    assert.ok(draftInput);
    draftInput.value = "Черновик инцидента";

    const historyButton = Array.from(
      rootElement.querySelectorAll(".dispatcher-form-toolbar button"),
    ).find((button) => button.textContent === "Посмотреть историю");
    assert.ok(historyButton);

    await React.act(async () => historyButton.click());

    const hiddenForm = rootElement.querySelector(".data-entry-form");
    assert.ok(hiddenForm);
    assert.equal(hiddenForm.hidden, true);
    const historyPanel = rootElement.querySelector(
      'section[aria-label="Диспетчерская"]',
    );
    assert.ok(historyPanel);
    assert.deepEqual(
      Array.from(
        historyPanel.querySelectorAll(".dispatcher-feed-group-button"),
        (button) => button.textContent,
      ),
      ["Выработка", "Оборудование", "Инциденты", "Посетители"],
    );
    assert.equal(
      Array.from(
        historyPanel.querySelectorAll(".dispatcher-feed-group-button"),
      ).find((button) => button.textContent === "Инциденты")
        ?.getAttribute("aria-pressed"),
      "true",
    );
    assert.deepEqual(
      Array.from(
        historyPanel.querySelectorAll(".dispatcher-period-button"),
        (button) => button.textContent,
      ),
      ["Сегодня", "Текущий месяц", "Текущий год", "Своё", "Все незакрытые"],
    );

    const returnToFormButton = Array.from(
      rootElement.querySelectorAll(".dispatcher-form-toolbar button"),
    ).find((button) => button.textContent === "Вернуться к форме");
    assert.ok(returnToFormButton);
    await React.act(async () => returnToFormButton.click());
    assert.equal(rootElement.querySelector(".data-entry-form")?.hidden, false);
    assert.equal(
      rootElement.querySelector('input[name="description"]')?.value,
      "Черновик инцидента",
    );

    const activeNavigationButton = rootElement.querySelector(
      '.primary-nav .nav-item[aria-current="page"]',
    );
    assert.ok(activeNavigationButton);
    assert.match(activeNavigationButton.textContent, /Форма/u);

    await React.act(async () => activeNavigationButton.click());

    assert.equal(rootElement.querySelector(".data-entry-form"), null);
    assert.ok(
      rootElement.querySelector('.dispatcher-form-choice[aria-label="Выбор формы"]'),
    );

    await React.act(async () => root.unmount());
  } finally {
    globalThis.fetch = previousFetch;
    if (previousRemoteApiUrl === undefined) {
      delete process.env.VITE_SMB_REMOTE_API_URL;
    } else {
      process.env.VITE_SMB_REMOTE_API_URL = previousRemoteApiUrl;
    }
    await vite.close();
    dom.window.close();
    restoreDomGlobals(previousGlobals);
  }
});

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function buildDispatcherProfile() {
  return {
    userId: "dispatcher-user",
    displayName: "Иванов Иван",
    accountType: "dispatcher",
    activeAccess: {
      accountId: "dispatcher-access",
      accountType: "dispatcher",
      position: "dispatcher",
      positionDisplayName: "Диспетчер",
      displayName: "Диспетчер",
      scope: { kind: "organization" },
      capabilities: [
        "business.submit_dispatcher_forms",
        "business.view_dispatcher_feed",
      ],
      navigationItems: ["business.dispatcher_form"],
      issuedAt: "2026-07-24T08:00:00.000Z",
    },
    receivedAt: "2026-07-24T08:00:00.000Z",
  };
}

async function waitFor(React, predicate) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (predicate()) return;
    await React.act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
  }
  assert.fail("Timed out waiting for the dispatcher form choice.");
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
