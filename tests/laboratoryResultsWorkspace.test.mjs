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

test("incoming laboratory workspace keeps all indicators open and adds multiple samples", async () => {
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
  const submissions = [];

  try {
    const { LaboratoryResultsWorkspace } = await vite.ssrLoadModule(
      "/src/LaboratoryResults.tsx",
    );
    globalThis.fetch = async (input, init = {}) => {
      const url = new URL(String(input), "http://127.0.0.1:5173/");

      if (url.pathname === "/api/laboratory/reference") {
        return jsonResponse({
          reference: {
            indicators: [
              { id: "al2o3", label: "Al2O3", standard: "ГОСТ 1" },
              { id: "strength", label: "Прочность", standard: "ГОСТ 2" },
            ],
            incomingTestProfiles: [
              { label: "Глина", indicatorIds: ["al2o3"] },
            ],
            finishedProductTypes: [],
          },
        });
      }
      if (url.pathname === "/api/production-brands") {
        return jsonResponse({ labels: ["ША-22"] });
      }
      if (url.pathname === "/api/laboratory/results" && init.method === "POST") {
        const submission = JSON.parse(String(init.body));
        submissions.push(submission);
        return jsonResponse({
          result: {
            id: "laboratory-result-1",
            ...submission,
            laboratoryAssistantDisplayName: "Иванова Анна",
            createdAt: "2026-07-22T08:30:00.000Z",
          },
        }, 201);
      }
      if (url.pathname === "/api/laboratory/results") {
        return jsonResponse({
          results: [{
            id: "laboratory-result-existing",
            section: "incoming",
            analysisDate: "2026-07-21",
            materialLabel: "Глина",
            samples: [{
              sampleIdentifier: "Вагон 100",
              values: { al2o3: "30,1" },
            }],
            laboratoryAssistantDisplayName: "Иванова Анна",
            createdAt: "2026-07-21T08:30:00.000Z",
          }],
        });
      }
      throw new Error(`Unexpected request: ${url.pathname}`);
    };

    const rootElement = dom.window.document.getElementById("root");
    const root = createRoot(rootElement);

    await React.act(async () => {
      root.render(
        React.createElement(LaboratoryResultsWorkspace, {
          profile: buildLaboratoryProfile(),
          isAdminPreviewMode: false,
          onShowToast() {},
        }),
      );
    });
    await waitFor(React, () =>
      rootElement.querySelectorAll(".laboratory-indicator-grid input").length === 2
    );

    assert.equal(
      Array.from(rootElement.querySelectorAll("button")).some(
        (button) => button.textContent?.trim() === "Показать все показатели",
      ),
      false,
    );
    assert.equal(rootElement.querySelectorAll(".laboratory-sample-card").length, 1);
    assert.equal(
      Array.from(rootElement.querySelectorAll("label > span")).filter(
        (label) => label.textContent === "Объект испытаний",
      ).length,
      2,
    );
    assert.equal(
      Array.from(rootElement.querySelectorAll("th")).some(
        (heading) => heading.textContent === "Объект испытаний",
      ),
      true,
    );
    assert.equal(
      Array.from(rootElement.querySelectorAll("button")).some(
        (button) => button.textContent?.trim() === "Открыть PDF",
      ),
      true,
    );
    assert.equal(
      Array.from(rootElement.querySelectorAll("button")).some(
        (button) => button.textContent?.trim() === "Скачать PDF",
      ),
      true,
    );

    const addSampleButton = Array.from(rootElement.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === "Добавить пробу",
    );
    assert.ok(addSampleButton);
    await React.act(async () => addSampleButton.click());
    const sampleCards = rootElement.querySelectorAll(".laboratory-sample-card");
    assert.equal(sampleCards.length, 2);

    const materialInput = findInputByLabel(rootElement, "Объект испытаний");
    const protocolNoteInput = findControlByLabel(
      rootElement,
      "Примечание к протоколу",
    );
    const firstSampleInput = findInputByLabel(
      sampleCards[0],
      "Номер пробы, идентификатор транспорта",
    );
    const secondSampleInput = findInputByLabel(
      sampleCards[1],
      "Номер пробы, идентификатор транспорта",
    );
    const firstIndicator = findInputByLabel(sampleCards[0], "Al2O3");
    const secondIndicator = findInputByLabel(sampleCards[1], "Прочность");

    await React.act(async () => {
      setNativeInputValue(materialInput, "Глина огнеупорная");
      materialInput.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
      setNativeInputValue(protocolNoteInput, "Соответствует требованиям.");
      protocolNoteInput.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
      setNativeInputValue(firstSampleInput, "Вагон 12345");
      firstSampleInput.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
      setNativeInputValue(firstIndicator, "31,4");
      firstIndicator.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
      setNativeInputValue(secondSampleInput, "Автомобиль А123БВ");
      secondSampleInput.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
      setNativeInputValue(secondIndicator, "38,1");
      secondIndicator.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    });
    await React.act(async () => {
      rootElement.querySelector(".laboratory-form").dispatchEvent(
        new dom.window.Event("submit", { bubbles: true, cancelable: true }),
      );
    });
    await waitFor(React, () => submissions.length === 1);

    assert.equal(submissions[0].materialLabel, "Глина огнеупорная");
    assert.equal(submissions[0].purpose, "Определение химического состава и свойств");
    assert.equal(submissions[0].protocolNote, "Соответствует требованиям.");
    assert.deepEqual(submissions[0].samples, [
      {
        sampleIdentifier: "Вагон 12345",
        values: { al2o3: "31,4" },
      },
      {
        sampleIdentifier: "Автомобиль А123БВ",
        values: { strength: "38,1" },
      },
    ]);
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

function buildLaboratoryProfile() {
  return {
    userId: "laboratory-user",
    displayName: "Иванова Анна",
    accountType: "business_owner",
    activeAccess: {
      accountId: "laboratory-access",
      accountType: "business_owner",
      position: "laboratory_assistant",
      positionDisplayName: "Лаборант",
      displayName: "Лаборант",
      scope: { kind: "organization" },
      capabilities: ["business.manage_laboratory_results"],
      navigationItems: ["business.laboratory_results"],
      issuedAt: "2026-07-22T08:00:00.000Z",
    },
    receivedAt: "2026-07-22T08:00:00.000Z",
  };
}

function findInputByLabel(root, labelText) {
  return findControlByLabel(root, labelText, "input");
}

function findControlByLabel(root, labelText, selector = "input, textarea") {
  const label = Array.from(root.querySelectorAll("label")).find(
    (item) => item.querySelector(":scope > span")?.textContent === labelText,
  );
  const input = label?.querySelector(selector);
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
  assert.fail("Timed out waiting for laboratory workspace state.");
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
