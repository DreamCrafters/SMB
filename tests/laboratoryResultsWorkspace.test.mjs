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

test("laboratory workspace supports results, banks, and both laboratory journals", async () => {
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
  const submissions = [];
  const kilnJournalSubmissions = [];
  const kilnJournalRequests = [];
  const sampleRegistrationSubmissions = [];
  const sampleRegistrationRequests = [];

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
      if (url.pathname === "/api/laboratory/banks") {
        return jsonResponse({
          currentAssignments: [{
            assignmentId: "assignment-1",
            bankNumber: 1,
            laboratoryResultId: "laboratory-result-existing",
            sampleIndex: 0,
            sampleIdentifier: "Неформованные изделия",
            materialLabel: "ШКИ-66",
            bulkDensityTonsPerCubicMeter: 1.16,
            assignedByDisplayName: "Иванова Анна",
            assignedAt: "2026-07-22T08:30:00.000Z",
          }],
          history: [{
            assignmentId: "assignment-1",
            bankNumber: 1,
            laboratoryResultId: "laboratory-result-existing",
            sampleIndex: 0,
            sampleIdentifier: "Неформованные изделия",
            materialLabel: "ШКИ-66",
            bulkDensityTonsPerCubicMeter: 1.16,
            assignedByDisplayName: "Иванова Анна",
            assignedAt: "2026-07-22T08:30:00.000Z",
          }, {
            assignmentId: "assignment-2",
            bankNumber: 2,
            laboratoryResultId: "laboratory-result-finished",
            sampleIndex: 0,
            sampleIdentifier: "Неформованные изделия",
            materialLabel: "ША-22",
            bulkDensityTonsPerCubicMeter: 1.2,
            assignedByDisplayName: "Иванова Анна",
            assignedAt: "2026-07-22T09:30:00.000Z",
          }],
          eligibleProducts: [{
            laboratoryResultId: "laboratory-result-finished",
            productType: "Неформованные изделия",
            productBrand: "ШКИ-66",
            analysisDate: "2026-07-23",
            bulkDensityTonsPerCubicMeter: 1.16,
          }],
        });
      }
      if (url.pathname === "/api/laboratory/rotary-kiln-2-journal") {
        if (init.method === "POST") {
          const submission = JSON.parse(String(init.body));
          kilnJournalSubmissions.push(submission);
          return jsonResponse({
            record: {
              id: "kiln-record-created",
              ...submission,
              createdAt: "2026-07-29T08:30:00.000Z",
            },
          }, 201);
        }
        kilnJournalRequests.push(Object.fromEntries(url.searchParams));
        return jsonResponse({
          records: [{
            id: "kiln-record-1",
            recordDate: "2026-07-29",
            recordTime: "08:05",
            waterAbsorption: 4.2,
            temperatureBeforeCyclone: 850,
            temperatureBeforeFilter: 210.5,
            temperatureInFieldChamber: 118,
            temperatureAtRollback: 96,
            gasConsumptionPerHour: 320.4,
            vacuum: 14.5,
            pressure: 1.8,
            shiftSupervisor: "Петров П.П.",
            burnerOperator: "Сидоров С.С.",
            laboratoryAssistant: "Иванова А.А.",
            sievePass05: 0.7,
            bulkDensity: 1.16,
            kilnLoadBucketsPerHour: 12,
            note: "Краткая остановка для осмотра.",
            createdAt: "2026-07-29T08:30:00.000Z",
          }, {
            id: "kiln-record-2",
            recordDate: "2026-07-28",
            recordTime: "20:10",
            waterAbsorption: 4.4,
            temperatureBeforeCyclone: 845,
            temperatureBeforeFilter: 208,
            temperatureInFieldChamber: 116,
            temperatureAtRollback: 95,
            gasConsumptionPerHour: 318,
            vacuum: 14,
            pressure: 1.7,
            shiftSupervisor: "Кузнецов К.К.",
            burnerOperator: "Смирнов С.С.",
            laboratoryAssistant: "Иванова А.А.",
            sievePass05: 0.8,
            bulkDensity: 1.24,
            kilnLoadBucketsPerHour: 11,
            createdAt: "2026-07-28T20:30:00.000Z",
          }],
          averageBulkDensity: 1.2,
        });
      }
      if (url.pathname === "/api/laboratory/sample-registration-journal") {
        if (init.method === "POST") {
          const submission = JSON.parse(String(init.body));
          sampleRegistrationSubmissions.push(submission);
          return jsonResponse({
            record: {
              id: "sample-registration-created",
              ...submission,
              createdAt: "2026-07-30T08:30:00.000Z",
            },
          }, 201);
        }
        sampleRegistrationRequests.push(Object.fromEntries(url.searchParams));
        return jsonResponse({
          records: [{
            id: "sample-registration-1",
            sampleNumber: "17-А",
            laboratorySampleCode: "ЛП-2026-017",
            samplingDate: "2026-07-29",
            samplingLaboratoryAssistant: "Иванова А.А.",
            sampleName: "Шамот молотый",
            registrationDate: "2026-07-29",
            samplingLocation: "Склад сырья",
            al2o3: "31,4",
            fe2o3: "2,1",
            sio2: "58,7",
            cao2: "< 0,1",
            p2o5: "0,03",
            lossOnIgnition: "4,2",
            moisture: "0,8",
            chemicalAnalysisDate: "2026-07-30",
            chemicalAnalysisLaboratoryAssistant: "Петрова П.П.",
            batchNumber: "П-42",
            notes: "Без отклонений.",
            createdAt: "2026-07-30T08:30:00.000Z",
          }],
        });
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
            }, {
              sampleIdentifier: "Автомобиль А123БВ",
              values: { strength: "38,1" },
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
    const historyCell = rootElement.querySelector(".laboratory-results-table td");
    assert.ok(historyCell);
    const historyCellStyle = dom.window.getComputedStyle(historyCell);
    assert.deepEqual({
      hasDownloadButton: Array.from(rootElement.querySelectorAll("button")).some(
        (button) => button.textContent?.trim() === "Скачать PDF",
      ),
      historyCellBorderBottomStyle: historyCellStyle.borderBottomStyle,
      historyCellBorderRightStyle: historyCellStyle.borderRightStyle,
    }, {
      hasDownloadButton: false,
      historyCellBorderBottomStyle: "solid",
      historyCellBorderRightStyle: "solid",
    });

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
    const banksTab = Array.from(rootElement.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === "Банки",
    );
    assert.ok(banksTab);
    await React.act(async () => banksTab.click());
    await waitFor(React, () =>
      rootElement.querySelectorAll(".laboratory-bank-card").length === 3
    );
    assert.match(rootElement.textContent, /Насыпной вес: 1,16 т\/м³/u);
    assert.match(rootElement.textContent, /Вид продукции: Неформованные изделия/u);
    assert.match(
      rootElement.textContent,
      /23\.07\.2026 · ШКИ-66 · Неформованные изделия/u,
    );
    const bankHistoryTable = rootElement.querySelector(
      ".laboratory-bank-history .laboratory-results-table",
    );
    assert.ok(bankHistoryTable);
    const bankHistoryCellStyle = dom.window.getComputedStyle(
      bankHistoryTable.querySelector("td"),
    );
    assert.equal(bankHistoryCellStyle.borderRightStyle, "solid");
    assert.equal(bankHistoryCellStyle.borderBottomStyle, "solid");
    assert.equal(
      Array.from(rootElement.querySelectorAll("label > span")).some(
        (label) => label.textContent === "Результат готовой продукции",
      ),
      true,
    );

    const kilnJournalTab = Array.from(rootElement.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === "Журнал печи 2",
    );
    assert.ok(kilnJournalTab);
    await React.act(async () => kilnJournalTab.click());
    await waitFor(React, () =>
      rootElement.textContent.includes(
        "Журнал контроля параметров обжига вращающейся печи 2",
      )
    );
    await waitFor(React, () => rootElement.textContent.includes("Петров П.П."));

    const expectedJournalLabels = [
      "Дата",
      "Время",
      "Водопоглощение",
      "t перед циклоном",
      "t перед фильтром",
      "t в полевой камере",
      "t на откатной",
      "Расход газа в час",
      "Разряжение",
      "Давление",
      "Мастер смены",
      "Обжигальщик",
      "Лаборант",
      "Проход ч/з сито 0,5",
      "Насыпной вес",
      "Загрузка печи в ковшах в час",
      "Примечание (в т.ч. причины простоя, инциденты и пр.)",
    ];
    const journalForm = rootElement.querySelector(".rotary-kiln-journal-form");
    assert.ok(journalForm);
    for (const label of expectedJournalLabels) {
      assert.ok(findControlByLabel(journalForm, label));
    }
    const average = rootElement.querySelector(".rotary-kiln-journal-average");
    const filters = rootElement.querySelector(".rotary-kiln-journal-filters");
    assert.ok(average);
    assert.ok(filters);
    assert.equal(average.textContent?.trim(), "Средний насыпной вес: 1,2");
    assert.equal(
      Boolean(
        average.compareDocumentPosition(filters) &
          dom.window.Node.DOCUMENT_POSITION_FOLLOWING
      ),
      true,
    );

    const journalValues = {
      "Дата": "2026-07-29",
      "Время": "12:15",
      "Водопоглощение": "4.3",
      "t перед циклоном": "852",
      "t перед фильтром": "212",
      "t в полевой камере": "119",
      "t на откатной": "97",
      "Расход газа в час": "321",
      "Разряжение": "14.6",
      "Давление": "1.9",
      "Мастер смены": "Петров П.П.",
      "Обжигальщик": "Сидоров С.С.",
      "Лаборант": "Иванова А.А.",
      "Проход ч/з сито 0,5": "0.75",
      "Насыпной вес": "1.18",
      "Загрузка печи в ковшах в час": "12",
      "Примечание (в т.ч. причины простоя, инциденты и пр.)":
        "Работа без отклонений.",
    };
    await React.act(async () => {
      for (const [label, value] of Object.entries(journalValues)) {
        const input = findControlByLabel(journalForm, label);
        setNativeInputValue(input, value);
        input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
      }
    });
    await React.act(async () => {
      journalForm.dispatchEvent(
        new dom.window.Event("submit", { bubbles: true, cancelable: true }),
      );
    });
    await waitFor(React, () => kilnJournalSubmissions.length === 1);
    assert.deepEqual(kilnJournalSubmissions[0], {
      recordDate: "2026-07-29",
      recordTime: "12:15",
      waterAbsorption: 4.3,
      temperatureBeforeCyclone: 852,
      temperatureBeforeFilter: 212,
      temperatureInFieldChamber: 119,
      temperatureAtRollback: 97,
      gasConsumptionPerHour: 321,
      vacuum: 14.6,
      pressure: 1.9,
      shiftSupervisor: "Петров П.П.",
      burnerOperator: "Сидоров С.С.",
      laboratoryAssistant: "Иванова А.А.",
      sievePass05: 0.75,
      bulkDensity: 1.18,
      kilnLoadBucketsPerHour: 12,
      note: "Работа без отклонений.",
    });

    const searchInput = findControlByLabel(filters, "Поиск");
    await React.act(async () => {
      setNativeInputValue(searchInput, "Петров");
      searchInput.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    });
    await waitFor(React, () =>
      kilnJournalRequests.some((request) => request.query === "Петров")
    );

    const sampleRegistrationTab = Array.from(
      rootElement.querySelectorAll("button"),
    ).find(
      (button) => button.textContent?.trim() === "Регистрация проб",
    );
    assert.ok(sampleRegistrationTab);
    await React.act(async () => sampleRegistrationTab.click());
    await waitFor(React, () =>
      rootElement.textContent.includes("Журнал регистрации отбора проб")
    );
    await waitFor(React, () =>
      rootElement.textContent.includes("ЛП-2026-017")
    );

    const sampleRegistrationForm = rootElement.querySelector(
      ".sample-registration-journal-form",
    );
    assert.ok(sampleRegistrationForm);
    const sampleRegistrationValues = {
      "№ пробы": "18-Б",
      "Код лабораторной пробы": "ЛП-2026-018",
      "Дата отбора": "2026-07-30",
      "Лаборант (отбор проб)": "Иванова А.А.",
      "Наименование пробы": "Глина огнеупорная",
      "Дата регистрации": "2026-07-30",
      "Место отбора пробы": "Склад сырья",
      "Al2O3": "30,8",
      "Fe2O3": "2,3",
      "SiO2": "59,1",
      "CaO2": "< 0,1",
      "P2O5": "0,04",
      "ппп": "4,1",
      "Влажность": "0,7",
      "Дата хим. анализа": "2026-07-31",
      "Лаборант (химический анализ)": "Петрова П.П.",
      "Номер партии": "П-43",
      "Примечания": "Соответствует требованиям.",
    };
    await React.act(async () => {
      for (const [label, value] of Object.entries(sampleRegistrationValues)) {
        const input = findControlByLabel(sampleRegistrationForm, label);
        setNativeInputValue(input, value);
        input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
      }
    });
    await React.act(async () => {
      sampleRegistrationForm.dispatchEvent(
        new dom.window.Event("submit", { bubbles: true, cancelable: true }),
      );
    });
    await waitFor(React, () => sampleRegistrationSubmissions.length === 1);
    assert.deepEqual(sampleRegistrationSubmissions[0], {
      sampleNumber: "18-Б",
      laboratorySampleCode: "ЛП-2026-018",
      samplingDate: "2026-07-30",
      samplingLaboratoryAssistant: "Иванова А.А.",
      sampleName: "Глина огнеупорная",
      registrationDate: "2026-07-30",
      samplingLocation: "Склад сырья",
      al2o3: "30,8",
      fe2o3: "2,3",
      sio2: "59,1",
      cao2: "< 0,1",
      p2o5: "0,04",
      lossOnIgnition: "4,1",
      moisture: "0,7",
      chemicalAnalysisDate: "2026-07-31",
      chemicalAnalysisLaboratoryAssistant: "Петрова П.П.",
      batchNumber: "П-43",
      notes: "Соответствует требованиям.",
    });

    const sampleRegistrationFilters = rootElement.querySelector(
      ".sample-registration-journal-filters",
    );
    assert.ok(sampleRegistrationFilters);
    const sampleSearchInput = findControlByLabel(
      sampleRegistrationFilters,
      "Поиск",
    );
    await React.act(async () => {
      setNativeInputValue(sampleSearchInput, "ЛП-2026-017");
      sampleSearchInput.dispatchEvent(
        new dom.window.Event("input", { bubbles: true }),
      );
    });
    await waitFor(React, () =>
      sampleRegistrationRequests.some(
        (request) => request.query === "ЛП-2026-017",
      )
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
