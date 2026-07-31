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

test("laboratory workspace supports results, banks, and laboratory journals", async () => {
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
  const bankAssignments = [];
  const kilnJournalSubmissions = [];
  const kilnJournalRequests = [];
  const sampleRegistrationSubmissions = [];
  const sampleRegistrationRequests = [];
  const chemicalAnalysisSubmissions = [];
  const chemicalAnalysisRequests = [];

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
        if (init.method === "POST") {
          const submission = JSON.parse(String(init.body));
          bankAssignments.push(submission);
          return jsonResponse({
            assignment: {
              assignmentId: "assignment-created",
              bankNumber: submission.bankNumber,
              materialLabel: submission.material,
              bulkDensityTonsPerCubicMeter: 1.18,
              bulkDensitySource: "rotary_kiln_2_journal",
              bulkDensitySampleCount: 3,
              assignedByDisplayName: "Иванова Анна",
              assignedAt: "2026-07-31T08:30:00.000Z",
            },
          }, 201);
        }
        return jsonResponse({
          currentAssignments: [{
            assignmentId: "assignment-1",
            bankNumber: 1,
            materialLabel: "ШКИ-66",
            bulkDensityTonsPerCubicMeter: 1.16,
            bulkDensitySource: "rotary_kiln_2_journal",
            bulkDensitySampleCount: 10,
            assignedByDisplayName: "Иванова Анна",
            assignedAt: "2026-07-22T08:30:00.000Z",
          }],
          history: [{
            assignmentId: "assignment-1",
            bankNumber: 1,
            materialLabel: "ШКИ-66",
            bulkDensityTonsPerCubicMeter: 1.16,
            bulkDensitySource: "rotary_kiln_2_journal",
            bulkDensitySampleCount: 10,
            assignedByDisplayName: "Иванова Анна",
            assignedAt: "2026-07-22T08:30:00.000Z",
          }, {
            assignmentId: "assignment-2",
            bankNumber: 2,
            materialLabel: "ША-22",
            bulkDensityTonsPerCubicMeter: 1.2,
            bulkDensitySource: "laboratory_result",
            laboratoryResultId: "laboratory-result-finished",
            sampleIndex: 0,
            sampleIdentifier: "Неформованные изделия",
            assignedByDisplayName: "Иванова Анна",
            assignedAt: "2026-07-22T09:30:00.000Z",
          }],
          availableMaterials: [{
            material: "ША-22",
            averageBulkDensityTonsPerCubicMeter: 1.18,
            sampleCount: 3,
            latestRecordDate: "2026-07-30",
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
            producedMaterial: "ША-22",
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
      if (url.pathname === "/api/laboratory/chemical-analysis-journal") {
        if (init.method === "POST") {
          const submission = JSON.parse(String(init.body));
          chemicalAnalysisSubmissions.push(submission);
          return jsonResponse({
            record: {
              id: "chemical-analysis-created",
              ...submission,
              laboratorySampleCode: "ЛП-2026-017",
              sampleNumber: "17-А",
              sampleName: "Шамот молотый",
              createdAt: "2026-07-31T08:30:00.000Z",
            },
          }, 201);
        }
        chemicalAnalysisRequests.push(Object.fromEntries(url.searchParams));
        const sampleOptions = url.searchParams.get("sampleQuery") === "другая"
          ? [{
              id: "sample-registration-legacy",
              laboratorySampleCode: "ЛП-2026-017",
              sampleNumber: "17-А",
              sampleName: "Шамот молотый",
              samplingDate: "2026-06-20",
              registrationDate: "2026-06-21",
            }]
          : [{
              id: "sample-registration-1",
              laboratorySampleCode: "ЛП-2026-017",
              sampleNumber: "17-А",
              sampleName: "Шамот молотый",
              samplingDate: "2026-07-29",
              registrationDate: "2026-07-30",
            }, {
              id: "sample-registration-legacy",
              laboratorySampleCode: "ЛП-2026-017",
              sampleNumber: "17-А",
              sampleName: "Шамот молотый",
              samplingDate: "2026-06-20",
              registrationDate: "2026-06-21",
            }];
        return jsonResponse({
          records: [{
            id: "chemical-analysis-1",
            sampleRegistrationId: "sample-registration-1",
            laboratorySampleCode: "ЛП-2026-017",
            sampleNumber: "17-А",
            sampleName: "Шамот молотый",
            chemicalAnalysisDate: "2026-07-30",
            chemicalAnalysisLaboratoryAssistant: "Петрова П.П.",
            batchNumber: "П-42",
            al2o3: "31,4",
            fe2o3: "2,1",
            sio2: "58,7",
            cao2: "< 0,1",
            p2o5: "0,03",
            lossOnIgnition: "4,2",
            moisture: "0,8",
            notes: "Без отклонений.",
            createdAt: "2026-07-30T08:30:00.000Z",
          }],
          sampleOptions,
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
      rootElement.querySelectorAll(".laboratory-bank-card").length === 3
    );

    // Разделы контроля скрыты: насыпной вес считается по журналу печи 2.
    for (const hiddenSection of ["Входящий контроль", "Контроль готовой продукции"]) {
      assert.equal(
        Array.from(rootElement.querySelectorAll("button")).some(
          (button) => button.textContent?.trim() === hiddenSection,
        ),
        false,
      );
    }
    assert.equal(rootElement.querySelectorAll(".laboratory-form").length, 0);
    assert.equal(submissions.length, 0);

    const banksTab = Array.from(rootElement.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === "Банки",
    );
    assert.ok(banksTab);
    await React.act(async () => banksTab.click());
    await waitFor(React, () =>
      rootElement.querySelectorAll(".laboratory-bank-card").length === 3
    );
    assert.match(rootElement.textContent, /Насыпной вес: 1,16 т\/м³/u);
    assert.match(rootElement.textContent, /Журнал печи 2, среднее по 10 записям/u);
    assert.match(
      rootElement.textContent,
      /Результат испытаний: Неформованные изделия/u,
    );
    assert.match(
      rootElement.textContent,
      /ША-22 · 1,18 т\/м³ · среднее по 3 записям/u,
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
    const bankMaterialSelect = findControlByLabel(
      rootElement.querySelector(".laboratory-bank-assignment-form"),
      "Производимый материал",
      "select",
    );
    assert.ok(bankMaterialSelect);
    await React.act(async () => {
      setNativeInputValue(bankMaterialSelect, "ША-22");
      bankMaterialSelect.dispatchEvent(
        new dom.window.Event("change", { bubbles: true }),
      );
    });
    await React.act(async () => {
      rootElement.querySelector(".laboratory-bank-assignment-form").dispatchEvent(
        new dom.window.Event("submit", { bubbles: true, cancelable: true }),
      );
    });
    await waitFor(React, () => bankAssignments.length === 1);
    assert.deepEqual(bankAssignments[0], { bankNumber: 1, material: "ША-22" });

    const findTabByText = (text) =>
      Array.from(rootElement.querySelectorAll("button")).find(
        (button) => button.textContent?.trim() === text,
      );

    // Журналы ЦЗЛ доступны только из кнопки группы, а не из общего ряда вкладок.
    for (const journalLabel of [
      "Журнал печи 2",
      "Регистрация проб",
      "Химические анализы",
    ]) {
      assert.equal(findTabByText(journalLabel), undefined);
    }
    const centralLabTab = findTabByText("ЦЗЛ (Центральная заводская лаборатория)");
    assert.ok(centralLabTab);
    await React.act(async () => centralLabTab.click());

    const kilnJournalTab = findTabByText("Журнал печи 2");
    assert.ok(kilnJournalTab);
    assert.ok(findTabByText("Регистрация проб"));
    assert.ok(findTabByText("Химические анализы"));
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
      "Производимый материал",
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
      "Производимый материал": "ША-22",
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
      producedMaterial: "ША-22",
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

    const chemicalAnalysisTab = Array.from(
      rootElement.querySelectorAll("button"),
    ).find(
      (button) => button.textContent?.trim() === "Химические анализы",
    );
    assert.ok(chemicalAnalysisTab);
    await React.act(async () => chemicalAnalysisTab.click());
    await waitFor(React, () =>
      rootElement.textContent.includes("Журнал химических анализов")
    );
    await waitFor(React, () =>
      rootElement.textContent.includes("ЛП-2026-017")
    );

    const chemicalAnalysisForm = rootElement.querySelector(
      ".chemical-analysis-journal-form",
    );
    assert.ok(chemicalAnalysisForm);
    assert.equal(
      findControlByLabel(chemicalAnalysisForm, "Номер партии").required,
      true,
    );
    for (const optionalLabel of [
      "Дата хим. анализа",
      "Лаборант",
      "Al2O3",
      "Fe2O3",
      "SiO2",
      "CaO2",
      "P2O5",
      "ппп",
      "Влажность",
      "Примечания",
    ]) {
      assert.equal(
        findControlByLabel(chemicalAnalysisForm, optionalLabel).required,
        false,
      );
    }
    const registeredSampleSearch = findControlByLabel(
      chemicalAnalysisForm,
      "Поиск зарегистрированной пробы",
    );
    await React.act(async () => {
      setNativeInputValue(registeredSampleSearch, "ЛП-2026-017");
      registeredSampleSearch.dispatchEvent(
        new dom.window.Event("input", { bubbles: true }),
      );
    });
    await waitFor(React, () =>
      chemicalAnalysisRequests.some(
        (request) => request.sampleQuery === "ЛП-2026-017",
      )
    );
    const sampleSelect = findControlByLabel(
      chemicalAnalysisForm,
      "Код лабораторной пробы",
      "select",
    );
    const sampleOptionLabels = Array.from(sampleSelect.querySelectorAll("option"))
      .slice(1)
      .map((option) => option.textContent);
    assert.equal(sampleOptionLabels.length, 2);
    assert.notEqual(sampleOptionLabels[0], sampleOptionLabels[1]);
    assert.match(sampleOptionLabels[0], /отбор 29\.07\.2026/u);
    assert.match(sampleOptionLabels[1], /регистрация 21\.06\.2026/u);
    await React.act(async () => {
      setNativeInputValue(sampleSelect, "sample-registration-1");
      sampleSelect.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
    });
    await React.act(async () => {
      setNativeInputValue(registeredSampleSearch, "другая");
      registeredSampleSearch.dispatchEvent(
        new dom.window.Event("input", { bubbles: true }),
      );
    });
    await waitFor(React, () =>
      chemicalAnalysisRequests.some(
        (request) => request.sampleQuery === "другая",
      )
    );
    const preservedSampleSelect = findControlByLabel(
      chemicalAnalysisForm,
      "Код лабораторной пробы",
      "select",
    );
    assert.equal(preservedSampleSelect.value, "sample-registration-1");
    assert.equal(
      Array.from(preservedSampleSelect.options).some(
        (option) => option.value === "sample-registration-1",
      ),
      true,
    );
    await React.act(async () => {
      for (const [label, value] of Object.entries({
        "Дата хим. анализа": "",
        "Лаборант": "",
        "Номер партии": "П-43",
      })) {
        const input = findControlByLabel(chemicalAnalysisForm, label);
        setNativeInputValue(input, value);
        input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
      }
    });
    await React.act(async () => {
      chemicalAnalysisForm.dispatchEvent(
        new dom.window.Event("submit", { bubbles: true, cancelable: true }),
      );
    });
    await waitFor(React, () => chemicalAnalysisSubmissions.length === 1);
    assert.deepEqual(chemicalAnalysisSubmissions[0], {
      sampleRegistrationId: "sample-registration-1",
      batchNumber: "П-43",
    });

    const chemicalAnalysisFilters = rootElement.querySelector(
      ".chemical-analysis-journal-filters",
    );
    assert.ok(chemicalAnalysisFilters);
    const chemicalSearchInput = findControlByLabel(
      chemicalAnalysisFilters,
      "Поиск",
    );
    await React.act(async () => {
      setNativeInputValue(chemicalSearchInput, "П-42");
      chemicalSearchInput.dispatchEvent(
        new dom.window.Event("input", { bubbles: true }),
      );
    });
    await waitFor(React, () =>
      chemicalAnalysisRequests.some((request) => request.query === "П-42")
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
