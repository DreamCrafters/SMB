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

test("laboratory review filters every journal by date and nomenclature", async () => {
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
  const referenceRequests = [];
  const resultRequests = [];
  const sampleRegistrationRequests = [];
  const chemicalAnalysisRequests = [];
  const unshapedProductSampleRequests = [];
  const formedProductSampleRequests = [];
  const verificationRequests = [];
  const kilnJournalRequests = [];
  const rawMaterialQualityRequests = [];
  const greenProductQualityRequests = [];

  try {
    const { LaboratoryReviewWorkspace } = await vite.ssrLoadModule(
      "/src/LaboratoryReview.tsx",
    );
    globalThis.fetch = async (input) => {
      const url = new URL(String(input), "http://127.0.0.1:5173/");

      if (url.pathname === "/api/laboratory/reference") {
        referenceRequests.push(url.pathname);
        return jsonResponse({
          reference: {
            indicators: [{ id: "al2o3", label: "Al2O3", standard: "ГОСТ 1" }],
            incomingTestProfiles: [],
            finishedProductTypes: [],
          },
        });
      }
      if (url.pathname === "/api/laboratory/results") {
        resultRequests.push({
          section: url.searchParams.get("section"),
          dateFrom: url.searchParams.get("dateFrom"),
          dateTo: url.searchParams.get("dateTo"),
          name: url.searchParams.get("name"),
        });
        return jsonResponse({
          results: [
            {
              id: "laboratory-result-incoming",
              section: "incoming",
              analysisDate: "2026-07-20",
              materialLabel: "Глина марки ГИМ-2",
              samples: [{
                sampleIdentifier: "Вагон 12345",
                values: { al2o3: "31,4" },
              }],
              laboratoryAssistantDisplayName: "Иванова Анна",
              createdAt: "2026-07-20T08:30:00.000Z",
            },
            {
              id: "laboratory-result-finished",
              section: "finished_product",
              analysisDate: "2026-07-22",
              materialLabel: "Неформованные изделия",
              productBrand: "ШКИ-66",
              values: { al2o3: "44,1" },
              laboratoryAssistantDisplayName: "Иванова Анна",
              createdAt: "2026-07-22T08:30:00.000Z",
            },
          ],
        });
      }
      if (url.pathname === "/api/laboratory/sample-registration-journal") {
        sampleRegistrationRequests.push(readJournalFilters(url));
        return jsonResponse({
          records: [{
            id: "sample-registration-1",
            sampleNumber: "17-А",
            laboratorySampleCode: "ЛП-2026-017",
            samplingDate: "2026-07-20",
            samplingLaboratoryAssistant: "Иванова А.А.",
            sampleName: "Глина марки ГИМ-2",
            registrationDate: "2026-07-20",
            samplingLocation: "Склад сырья",
            createdAt: "2026-07-20T08:30:00.000Z",
          }],
        });
      }
      if (url.pathname === "/api/laboratory/chemical-analysis-journal") {
        chemicalAnalysisRequests.push(readJournalFilters(url));
        return jsonResponse({
          records: [{
            id: "chemical-analysis-1",
            sampleSource: "sample_registration",
            sampleId: "sample-registration-1",
            laboratorySampleCode: "ЛП-2026-017",
            sampleNumber: "17-А",
            sampleName: "Глина марки ГИМ-2",
            sampleDate: "2026-07-20",
            registrationDate: "2026-07-20",
            batchNumber: "П-42",
            chemicalAnalysisDate: "2026-07-21",
            createdAt: "2026-07-21T08:30:00.000Z",
          }],
          sampleOptions: [],
        });
      }
      if (url.pathname === "/api/laboratory/rotary-kiln-2-journal") {
        kilnJournalRequests.push(readJournalFilters(url));
        return jsonResponse({
          records: [{
            id: "kiln-record-1",
            recordDate: "2026-07-22",
            recordTime: "08:30",
            producedMaterial: "ША-22",
            waterAbsorption: 6.1,
            temperatureBeforeCyclone: 940,
            temperatureBeforeFilter: 320,
            temperatureInFieldChamber: 1180,
            temperatureAtRollback: 260,
            gasConsumptionPerHour: 1450,
            vacuum: 12,
            pressure: 3,
            shiftSupervisor: "Сидоров С.С.",
            burnerOperator: "Кузнецов К.К.",
            laboratoryAssistant: "Иванова Анна",
            sievePass05: 88,
            bulkDensity: 1.16,
            kilnLoadBucketsPerHour: 24,
            createdAt: "2026-07-22T08:30:00.000Z",
          }],
          averageBulkDensity: 1.16,
        });
      }
      if (
        url.pathname ===
          "/api/laboratory/unshaped-product-sample-journal"
      ) {
        unshapedProductSampleRequests.push(readJournalFilters(url));
        return jsonResponse({
          records: [{
            id: "unshaped-sample-1",
            sampleNumber: "18",
            sampleDate: "2026-07-23",
            sampledBy: "Иванова А.А.",
            batchNumber: "55",
            sampleCode: ".18",
            productName: "ШКИ-66",
            batchMass: "20 т",
            moisture: "0,8",
            grainComposition: "0–3 мм",
            fireResistance: "1710 °C",
            suitability: "yes",
            createdAt: "2026-07-23T08:30:00.000Z",
          }],
        });
      }
      if (url.pathname === "/api/laboratory/formed-product-sample-journal") {
        formedProductSampleRequests.push(readJournalFilters(url));
        return jsonResponse({
          records: [{
            id: "formed-sample-1",
            sortingDate: "2026-07-24",
            wagonNumber: "214",
            productBrand: "ШКИ-66",
            moldingDate: "2026-07-20",
            createdAt: "2026-07-24T08:30:00.000Z",
          }],
        });
      }
      if (url.pathname === "/api/laboratory/verification-journal") {
        verificationRequests.push(readJournalFilters(url));
        return jsonResponse({
          records: [{
            id: "verification-1",
            verificationDate: "2026-07-24",
            productName: "ШКИ-66",
            samplingLocation: "Склад сырья",
            sampleCode: "26.19",
            createdAt: "2026-07-24T08:30:00.000Z",
          }],
        });
      }
      if (url.pathname === "/api/laboratory/raw-material-quality-journal") {
        rawMaterialQualityRequests.push(readJournalFilters(url));
        return jsonResponse({
          records: [{
            id: "raw-quality-1",
            recordDate: "2026-07-24",
            laboratoryAssistant: "Иванова А.А.",
            shiftSupervisor: "Петров П.П.",
            shift: "day",
            clayMeasurements: [{
              measurementNumber: 1,
              clayBrand: "Глина ДН-2",
              disintegratorNumber: "1",
              moisture: "8,4",
              sieveResidue3: "0,2",
              sievePass05: "97,5",
            }],
            temperMeasurements: [{
              measurementNumber: 1,
              temperBrand: "Шамот ШКИ-44",
              ballMillNumber: "2",
              sieveResidue3: "0,5",
              sieveResidue2: "0,3",
              sieveResidue1: "0,1",
              sievePass05: "12,6",
            }],
            slipMeasurements: [
              { measurementNumber: 1, mixerNumber: "3", temperature: "28", density: "1,64" },
            ],
            runnerMeasurements: [{
              runnerNumber: "2",
              chamottePercentage: "70",
              clayPercentage: "30",
              residue0063: "4,1",
              moisture: "6,8",
              isReserve: false,
            }],
            elutriationCoefficient: "0,83",
            recommendationRecipient: "batch_operator",
            recommendationText: "Снизить подачу глины.",
            createdAt: "2026-07-24T08:30:00.000Z",
          }],
        });
      }
      if (url.pathname === "/api/laboratory/green-product-quality-journal") {
        greenProductQualityRequests.push(readJournalFilters(url));
        return jsonResponse({
          records: [{
            id: "green-quality-1",
            recordDate: "2026-07-25",
            pressNumber: "3",
            productBrand: "ШКИ-66",
            pressDate: "2026-07-24",
            setter: "Иванов И.И.",
            pressOperator: "Петров П.П.",
            loadingDate: "2026-07-25",
            pieceCount: 480,
            wagonIds: ["wagon-1", "wagon-2"],
            wagons: [
              { id: "wagon-1", number: "В-01" },
              { id: "wagon-2", number: "В-02" },
            ],
            measurements: [
              {
                measurementNumber: 1,
                lengthFirst: "230",
                lengthSecond: "231",
                widthFirst: "114",
                widthSecond: "114",
                heightFirst: "64",
                heightSecond: "64",
                weight: "3,4",
                mechanicalStrength: "42,5",
                density: "2,11",
              },
            ],
            pressOperatorRecommendations: "Проверить давление.",
            createdAt: "2026-07-25T08:30:00.000Z",
          }],
        });
      }
      throw new Error(`Unexpected request: ${url.pathname}`);
    };

    const container = dom.window.document.querySelector("#root");
    const root = createRoot(container);
    await React.act(async () => {
      root.render(
        React.createElement(LaboratoryReviewWorkspace, {
          isAdminPreviewMode: false,
          onShowToast: () => {},
        }),
      );
    });
    await waitFor(React, () => kilnJournalRequests.length > 0);

    // The journals hide behind the CZL button, like on the laboratory assistant tab.
    const readViewTabs = () =>
      Array.from(
        container.querySelectorAll(".laboratory-section-tabs button"),
      ).map((button) => button.textContent);
    assert.deepEqual(readViewTabs(), [
      "Все испытания",
      "ЦЗЛ (Центральная заводская лаборатория)",
      "ОТК",
      "ОЦ (Огнеупорный цех)",
    ]);
    assert.equal(
      container.querySelectorAll("[role=\"tablist\"]").length,
      1,
      "The nested row stays closed until the CZL group is opened.",
    );

    // Journals keep different table formats, so every matching one gets its own table.
    assert.deepEqual(readJournalTitles(container), [
      "Журнал регистрации отбора проб",
      "Журнал химических анализов",
      "Журнал контроля параметров обжига вращающейся печи 2",
      "Пробы неформованной продукции",
      "Регистрация проб готовой формованной продукции (кирпича)",
      "Верификации",
      "Журнал контроля качества сырья и соблюдения технологии",
      "Журнал контроля качества сырцовой продукции",
    ]);

    // Входящий и выходящий контроль убраны у всех, кто просматривает анализы.
    assert.deepEqual(resultRequests, []);
    assert.deepEqual(referenceRequests, []);

    assert.equal(
      container.querySelector(".laboratory-review-filters .laboratory-filters"),
      null,
      "Filter inputs stay hidden until a filter button is pressed.",
    );

    await React.act(async () => {
      findButtonByText(container, "По дате испытаний").dispatchEvent(
        new dom.window.MouseEvent("click", { bubbles: true }),
      );
    });
    const dateFromInput = findInputByLabel(container, "С даты");
    await React.act(async () => {
      setNativeInputValue(dateFromInput, "2026-07-21");
      dateFromInput.dispatchEvent(
        new dom.window.Event("input", { bubbles: true }),
      );
    });
    await waitFor(React, () =>
      kilnJournalRequests.at(-1)?.dateFrom === "2026-07-21"
    );
    assert.equal(sampleRegistrationRequests.at(-1)?.dateFrom, "2026-07-21");
    assert.equal(chemicalAnalysisRequests.at(-1)?.dateFrom, "2026-07-21");
    assert.equal(unshapedProductSampleRequests.at(-1)?.dateFrom, "2026-07-21");
    assert.equal(formedProductSampleRequests.at(-1)?.dateFrom, "2026-07-21");
    assert.equal(verificationRequests.at(-1)?.dateFrom, "2026-07-21");
    assert.equal(rawMaterialQualityRequests.at(-1)?.dateFrom, "2026-07-21");
    assert.equal(greenProductQualityRequests.at(-1)?.dateFrom, "2026-07-21");

    // Only journals with a nomenclature can answer the name filter.
    await React.act(async () => {
      findButtonByText(container, "По наименованию (номенклатуре)")
        .dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
    });
    const nameInput = findInputByLabel(container, "Наименование");
    await React.act(async () => {
      setNativeInputValue(nameInput, "ШКИ");
      nameInput.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    });
    await waitFor(React, () =>
      chemicalAnalysisRequests.at(-1)?.name === "ШКИ"
    );

    assert.deepEqual(sampleRegistrationRequests.at(-1), {
      dateFrom: "2026-07-21",
      dateTo: null,
      name: "ШКИ",
    });
    assert.deepEqual(formedProductSampleRequests.at(-1), {
      dateFrom: "2026-07-21",
      dateTo: null,
      name: "ШКИ",
    });
    assert.deepEqual(verificationRequests.at(-1), {
      dateFrom: "2026-07-21",
      dateTo: null,
      name: "ШКИ",
    });
    assert.deepEqual(rawMaterialQualityRequests.at(-1), {
      dateFrom: "2026-07-21",
      dateTo: null,
      name: "ШКИ",
    });
    assert.deepEqual(greenProductQualityRequests.at(-1), {
      dateFrom: "2026-07-21",
      dateTo: null,
      name: "ШКИ",
    });
    assert.deepEqual(readJournalTitles(container), [
      "Журнал регистрации отбора проб",
      "Журнал химических анализов",
      "Пробы неформованной продукции",
      "Регистрация проб готовой формованной продукции (кирпича)",
      "Верификации",
      "Журнал контроля качества сырья и соблюдения технологии",
      "Журнал контроля качества сырцовой продукции",
    ]);
    assert.equal(
      container.querySelector(".sample-registration-edit-link"),
      null,
      "Management review must keep sample registrations read-only.",
    );
    assert.equal(
      container.querySelector(".chemical-analysis-edit-link"),
      null,
      "Management review must keep chemical analyses read-only.",
    );
    assert.equal(
      container.querySelector(".unshaped-product-sample-edit-link"),
      null,
      "Management review must keep unshaped samples read-only.",
    );
    assert.equal(
      container.querySelector(".raw-material-quality-edit-link"),
      null,
      "Management review must keep quality records read-only.",
    );
    assert.equal(
      container.querySelector(".green-product-quality-edit-link"),
      null,
      "Management review must keep green product quality records read-only.",
    );
    assert.match(
      container.querySelector(".laboratory-review-excluded-note")?.textContent
        ?? "",
      /не содержит наименования \(номенклатуры\)/u,
    );

    // Switching a filter off must drop its value from the next request.
    await React.act(async () => {
      findButtonByText(container, "По дате испытаний").dispatchEvent(
        new dom.window.MouseEvent("click", { bubbles: true }),
      );
    });
    await waitFor(React, () =>
      sampleRegistrationRequests.at(-1)?.dateFrom === null
    );
    assert.equal(sampleRegistrationRequests.at(-1)?.name, "ШКИ");

    // A single journal can be searched on its own, once the CZL group is opened.
    await React.act(async () => {
      findButtonByText(container, "По наименованию (номенклатуре)")
        .dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
    });
    await React.act(async () => {
      findButtonByText(container, "ЦЗЛ (Центральная заводская лаборатория)")
        .dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
    });
    assert.deepEqual(readViewTabs(), [
      "Все испытания",
      "ЦЗЛ (Центральная заводская лаборатория)",
      "ОТК",
      "ОЦ (Огнеупорный цех)",
      "Химические анализы",
      "Журнал печи 2",
    ]);
    await React.act(async () => {
      findButtonByText(container, "Журнал печи 2").dispatchEvent(
        new dom.window.MouseEvent("click", { bubbles: true }),
      );
    });
    await waitFor(React, () => readJournalTitles(container).length === 1);
    assert.deepEqual(readJournalTitles(container), [
      "Журнал контроля параметров обжига вращающейся печи 2",
    ]);
    assert.equal(
      container.querySelector(".laboratory-review-excluded-note"),
      null,
    );
    // Руководитель видит тот же столбец материала, что и лаборант.
    assert.ok(
      Array.from(container.querySelectorAll("th")).some(
        (heading) => heading.textContent === "Производимый материал",
      ),
    );
    assert.match(container.textContent, /ША-22/u);
    assert.equal(
      container.querySelector(".rotary-kiln-edit-link"),
      null,
      "Management review must keep kiln records read-only.",
    );

    assert.equal(
      container.querySelector("form"),
      null,
      "Review tab must not expose any data entry form.",
    );
    await React.act(async () => {
      findButtonByText(container, "ОТК").dispatchEvent(
        new dom.window.MouseEvent("click", { bubbles: true }),
      );
    });
    await waitFor(React, () => readJournalTitles(container).length === 1);
    assert.deepEqual(readViewTabs(), [
      "Все испытания",
      "ЦЗЛ (Центральная заводская лаборатория)",
      "ОТК",
      "ОЦ (Огнеупорный цех)",
      "Пробы неформованной продукции",
      "Регистрация проб формованной продукции (кирпича)",
      "Верификации",
      "Регистрация проб",
    ]);
    assert.deepEqual(readJournalTitles(container), [
      "Пробы неформованной продукции",
    ]);
    assert.equal(
      container.querySelector(".unshaped-product-sample-edit-link"),
      null,
      "Management review must keep quality control samples read-only.",
    );
    assert.equal(container.querySelector("form"), null);
    await React.act(async () => {
      findButtonByText(container, "ОЦ (Огнеупорный цех)").dispatchEvent(
        new dom.window.MouseEvent("click", { bubbles: true }),
      );
    });
    await waitFor(React, () => readJournalTitles(container).length === 1);
    assert.deepEqual(readJournalTitles(container), [
      "Журнал контроля качества сырья и соблюдения технологии",
    ]);
    await React.act(async () => {
      container.querySelector(".raw-material-quality-expand-toggle")?.click();
    });
    assert.match(container.textContent, /Шамот ШКИ-44/u);
    assert.equal(container.querySelector("form"), null);
    assert.ok(findButtonByText(container, "Качество сырцовой продукции"));
    await React.act(async () => {
      findButtonByText(container, "Качество сырцовой продукции").dispatchEvent(
        new dom.window.MouseEvent("click", { bubbles: true }),
      );
    });
    await waitFor(React, () => readJournalTitles(container)[0] ===
      "Журнал контроля качества сырцовой продукции");
    assert.match(container.textContent, /В-01; В-02/u);
    assert.equal(container.querySelector(".green-product-quality-edit-link"), null);
    assert.equal(container.querySelector("form"), null);
    assert.deepEqual(
      resultRequests,
      [],
      "No filter may bring the removed control sections back into the review.",
    );

    await React.act(async () => root.unmount());
  } finally {
    globalThis.fetch = previousFetch;
    await vite.close();
    restoreDomGlobals(previousGlobals);
    dom.window.close();
  }
});

function readJournalFilters(url) {
  return {
    dateFrom: url.searchParams.get("dateFrom"),
    dateTo: url.searchParams.get("dateTo"),
    name: url.searchParams.get("name"),
  };
}

function readJournalSections(root) {
  return Array.from(root.querySelectorAll(".laboratory-review-journal"));
}

function readJournalTitles(root) {
  return readJournalSections(root).map(
    (section) => section.querySelector("h2")?.textContent,
  );
}

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function findButtonByText(root, text) {
  const button = Array.from(root.querySelectorAll("button")).find(
    (item) => item.textContent === text,
  );
  assert.ok(button, `Expected button labelled ${text}`);
  return button;
}

function findInputByLabel(root, labelText) {
  const label = Array.from(root.querySelectorAll("label")).find(
    (item) => item.querySelector(":scope > span")?.textContent === labelText,
  );
  const input = label?.querySelector("input");
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
  assert.fail("Timed out waiting for laboratory review state.");
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
