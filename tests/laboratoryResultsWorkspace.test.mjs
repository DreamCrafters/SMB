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
  const kilnJournalCorrections = [];
  const kilnJournalRequests = [];
  let kilnPersonnelOptionsRequests = 0;
  let kilnDraftRequests = 0;
  let resolveKilnDraft;
  const kilnDraftReady = new Promise((resolve) => {
    resolveKilnDraft = resolve;
  });
  let latestKilnRecord = {
    id: "kiln-record-last-created",
    recordDate: "2026-07-27",
    recordTime: "23:30",
    producedMaterial: "ШКИ-66",
    waterAbsorption: 4.1,
    temperatureBeforeCyclone: 848,
    temperatureBeforeFilter: 209,
    temperatureInFieldChamber: 117,
    temperatureAtRollback: 94,
    gasConsumptionPerHour: 319,
    vacuum: 14.2,
    pressure: 1.75,
    shiftSupervisor: "Задний З.З.",
    burnerOperator: "Поздний П.П.",
    laboratoryAssistant: "Последний Л.Л.",
    sievePass05: 0.65,
    bulkDensity: 1.22,
    kilnLoadBucketsPerHour: 13,
    createdAt: "2026-07-30T12:30:00.000Z",
  };
  const sampleRegistrationSubmissions = [];
  const sampleRegistrationCorrections = [];
  const sampleRegistrationRequests = [];
  let sampleRegistrationDraftRequests = 0;
  let sampleRegistrationLocationRequests = 0;
  let sampleRegistrationLocationsDelay;
  let sampleRegistrationSamplingLocations = [
    "Опытная площадка",
    "Архивная площадка",
    " СКЛАД   СЫРЬЯ ",
  ];
  const chemicalAnalysisSubmissions = [];
  const chemicalAnalysisCorrections = [];
  const chemicalAnalysisRequests = [];
  let chemicalAnalysisDraftRequests = 0;
  const chemicalAnalysisProtocolRequests = [];
  const unshapedProductSampleSubmissions = [];
  const unshapedProductSampleCorrections = [];
  const unshapedProductSampleRequests = [];
  let unshapedProductSampleDraftRequests = 0;
  const rawMaterialQualitySubmissions = [];
  const rawMaterialQualityCorrections = [];
  const rawMaterialQualityRequests = [];
  let rawMaterialQualityDraftRequests = 0;
  let rawMaterialQualityOptionsRequests = 0;
  const rawMaterialQualityRecord = {
    id: "raw-quality-1",
    recordDate: "2026-08-04",
    laboratoryAssistant: "Иванова А.А.",
    shiftSupervisor: "Петров П.П.",
    shift: "day",
    clayBrand: "Глина ДН-2",
    clayMoisture: "8,4",
    clayGrainComposition: "0–2 мм",
    disintegratorNumber: "1",
    temperMoisture: "1,2",
    temperGrainComposition: "0–3 мм",
    temperSieveResidue1: "0,1",
    temperSieveResidue2: "0,3",
    temperSieveResidue3: "0,5",
    temperSievePass05: "12,6",
    temperBrand: "Шамот ШКИ-44",
    temperBulkDensity: "1,18",
    slipMixerNumber: "3",
    slipTemperature: "28",
    slipDensity: "1,64",
    runnerNumber: "2",
    chargeChamottePercentage: "70",
    chargeClayPercentage: "30",
    chargeResidue0063: "4,1",
    chargeMoisture: "6,8",
    elutriationCoefficient: "0,83",
    recommendationRecipient: "batch_operator",
    recommendationText: "Снизить подачу глины.",
    createdAt: "2026-08-04T08:30:00.000Z",
  };
  const greenProductQualitySubmissions = [];
  const greenProductQualityCorrections = [];
  const greenProductQualityRequests = [];
  let greenProductQualityDraftRequests = 0;
  let greenProductQualityOptionsRequests = 0;
  const greenProductQualityWagons = [
    {
      id: "wagon-1",
      number: "В-01",
      loadingDate: "2026-08-04",
      productBrand: "ШКУ-32",
      setter: "Иванов И.И.",
      pressOperator: "Петров П.П.",
    },
    {
      id: "wagon-2",
      number: "В-02",
      loadingDate: "2026-08-05",
      productBrand: "ШКИ-66",
      setter: "Садчик с вагона",
      pressOperator: "Прессовщик с вагона",
    },
    {
      id: "wagon-3",
      number: "В-03",
      loadingDate: "2026-08-03",
      productBrand: "ШКИ-66",
      setter: "Другой садчик",
      pressOperator: "Другой прессовщик",
    },
  ];
  const greenProductQualityRecord = {
    id: "green-quality-1",
    recordDate: "2026-08-04",
    pressNumber: "3",
    productBrand: "ШКИ-66",
    setter: "Иванов И.И.",
    pressOperator: "Петров П.П.",
    wagonIds: ["wagon-2", "wagon-3"],
    wagons: greenProductQualityWagons.filter((wagon) =>
      ["wagon-2", "wagon-3"].includes(wagon.id)
    ),
    lengthFirst: "230",
    lengthSecond: "231",
    widthFirst: "114",
    widthSecond: "114",
    heightFirst: "64",
    heightSecond: "64",
    weight: "3,4",
    mechanicalStrength: "42,5",
    density: "2,11",
    pressOperatorRecommendations: "Проверить давление прессования.",
    createdAt: "2026-08-04T09:30:00.000Z",
  };
  const protocolPreview = {
    opener: {},
    document: { title: "" },
    location: { href: "" },
    close() {},
  };
  dom.window.open = () => protocolPreview;

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
        return jsonResponse({ labels: ["ША-22", "ШКИ-66"] });
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
      if (
        url.pathname ===
          "/api/laboratory/rotary-kiln-2-personnel-options"
      ) {
        kilnPersonnelOptionsRequests += 1;
        return jsonResponse({
          shiftSupervisors: ["Орлов О.О.", "Петров П.П."],
          burnerOperators: ["Павлов П.П.", "Сидоров С.С."],
        });
      }
      if (url.pathname === "/api/laboratory/rotary-kiln-2-draft") {
        kilnDraftRequests += 1;
        await kilnDraftReady;
        return jsonResponse({
          previousRecord: latestKilnRecord,
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
            temperatureAtRollback: 95,
            gasConsumptionPerHour: 318,
            vacuum: 14,
            pressure: 1.7,
            shiftSupervisor: "Кузнецов К.К.",
            burnerOperator: "Смирнов С.С.",
            laboratoryAssistant: "Иванова А.А.",
            bulkDensity: 1.24,
            createdAt: "2026-07-28T20:30:00.000Z",
          }, latestKilnRecord],
          averageBulkDensity: 1.2,
        });
      }
      if (
        url.pathname.startsWith(
          "/api/laboratory/rotary-kiln-2-journal/",
        ) &&
        init.method === "PATCH"
      ) {
        const submission = JSON.parse(String(init.body));
        kilnJournalCorrections.push(submission);
        const recordId = url.pathname.split("/").at(-1);
        if (recordId === latestKilnRecord.id) {
          latestKilnRecord = {
            id: recordId,
            ...submission,
            createdAt: latestKilnRecord.createdAt,
          };
        }
        return jsonResponse({
          record: {
            id: recordId,
            ...submission,
            createdAt: recordId === latestKilnRecord.id
              ? latestKilnRecord.createdAt
              : "2026-07-29T08:30:00.000Z",
          },
        });
      }
      if (url.pathname === "/api/laboratory/sample-registration-locations") {
        sampleRegistrationLocationRequests += 1;
        const responseDelay = sampleRegistrationLocationsDelay;
        sampleRegistrationLocationsDelay = undefined;
        const samplingLocations = [...sampleRegistrationSamplingLocations];
        if (responseDelay !== undefined) await responseDelay;
        return jsonResponse({
          samplingLocations,
          laboratoryAssistants: [
            "Петрова П.П.",
            "Иванова А.А.",
          ],
        });
      }
      if (url.pathname === "/api/laboratory/sample-registration-draft") {
        sampleRegistrationDraftRequests += 1;
        const sampleNumber = sampleRegistrationDraftRequests === 1
          ? "18"
          : "27";
        return jsonResponse({
          sampleNumber,
          laboratorySampleCode: `.${sampleNumber}`,
        });
      }
      if (url.pathname === "/api/laboratory/sample-registration-journal") {
        if (init.method === "POST") {
          const submission = JSON.parse(String(init.body));
          sampleRegistrationSubmissions.push(submission);
          sampleRegistrationSamplingLocations = [
            submission.samplingLocation,
            ...sampleRegistrationSamplingLocations.filter(
              (location) =>
                location.trim().toLocaleLowerCase("ru-RU") !==
                  submission.samplingLocation.trim().toLocaleLowerCase(
                    "ru-RU",
                  ),
            ),
          ];
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
            samplingLocation: "Опытная площадка",
            laboratoryAnalysisNumber: "42",
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
      if (
        url.pathname ===
          "/api/laboratory/sample-registration-journal/sample-registration-1" &&
        init.method === "PATCH"
      ) {
        const submission = JSON.parse(String(init.body));
        sampleRegistrationCorrections.push(submission);
        return jsonResponse({
          record: {
            id: "sample-registration-1",
            ...submission,
            createdAt: "2026-07-30T08:30:00.000Z",
          },
        });
      }
      if (
        url.pathname ===
          "/api/laboratory/chemical-analysis-journal/protocol.pdf"
      ) {
        chemicalAnalysisProtocolRequests.push(
          Object.fromEntries(url.searchParams),
        );
        return new Response(new Uint8Array([37, 80, 68, 70, 45]), {
          headers: {
            "Content-Type": "application/pdf",
            "Content-Disposition":
              "inline; filename=\"protocol.pdf\"; filename*=UTF-8''%D0%9F%D1%80%D0%BE%D1%82%D0%BE%D0%BA%D0%BE%D0%BB.pdf",
          },
        });
      }
      if (url.pathname === "/api/laboratory/chemical-analysis-draft") {
        chemicalAnalysisDraftRequests += 1;
        return jsonResponse({
          laboratoryAnalysisNumber:
            chemicalAnalysisDraftRequests === 1 ? "43" : "44",
          laboratoryAssistants: [
            "Петрова П.П.",
            "Иванова А.А.",
          ],
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
              sampleDate: "2026-07-29",
              registrationDate: "2026-07-30",
              createdAt: "2026-07-31T08:30:00.000Z",
            },
          }, 201);
        }
        chemicalAnalysisRequests.push(Object.fromEntries(url.searchParams));
        if (
          url.searchParams.get("sampleQuery") === ".18" &&
          chemicalAnalysisCorrections.length === 0
        ) {
          return jsonResponse({
            error: {
              code: "server_error",
              message: "Временная ошибка загрузки проб.",
            },
          }, 503);
        }
        const sampleQuery = url.searchParams.get("sampleQuery");
        const sampleOptions = (sampleQuery === "другая"
          ? [{
              sampleSource: "unshaped_product",
              sampleId: "unshaped-sample-19",
              laboratorySampleCode: ".19",
              sampleNumber: "19",
              sampleName: "ШКИ-66",
              sampleDate: "2026-06-20",
            }]
          : sampleQuery === "много"
            ? Array.from({ length: 12 }, (_, index) => ({
                sampleSource: "sample_registration",
                sampleId: `overflow-sample-${index + 1}`,
                laboratorySampleCode: `ЛП-ПЕРЕПОЛНЕНИЕ-${index + 1}`,
                sampleNumber: String(index + 1),
                sampleName: `Проба для прокрутки ${index + 1}`,
                sampleDate: "2026-07-29",
                registrationDate: "2026-07-30",
              }))
          : [{
              sampleSource: "sample_registration",
              sampleId: "sample-registration-1",
              laboratorySampleCode: "ЛП-2026-017",
              sampleNumber: "17-А",
              sampleName: "Шамот молотый",
              sampleDate: "2026-07-29",
              registrationDate: "2026-07-30",
            }, {
              sampleSource: "unshaped_product",
              sampleId: "unshaped-sample-19",
              laboratorySampleCode: ".19",
              sampleNumber: "19",
              sampleName: "ШКИ-66",
              sampleDate: "2026-06-20",
            }]).filter((sample) =>
              chemicalAnalysisSubmissions.length === 0 ||
              sample.sampleSource !== "sample_registration" ||
              sample.sampleId !== "sample-registration-1"
            );
        return jsonResponse({
          records: [{
            id: "chemical-analysis-1",
            sampleSource: "unshaped_product",
            sampleId: "unshaped-sample-18",
            laboratorySampleCode: ".18",
            sampleNumber: "18",
            sampleName: "Мертель МШ-28",
            sampleDate: "2026-07-29",
            laboratoryAnalysisNumber: "42",
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
      if (
        url.pathname ===
          "/api/laboratory/chemical-analysis-journal/chemical-analysis-1" &&
        init.method === "PATCH"
      ) {
        const submission = JSON.parse(String(init.body));
        chemicalAnalysisCorrections.push(submission);
        return jsonResponse({
          record: {
            id: "chemical-analysis-1",
            ...submission,
            laboratorySampleCode: ".18",
            sampleNumber: "18",
            sampleName: "Мертель МШ-28",
            sampleDate: "2026-07-29",
            createdAt: "2026-07-30T08:30:00.000Z",
          },
        });
      }
      if (url.pathname === "/api/laboratory/unshaped-product-sample-draft") {
        unshapedProductSampleDraftRequests += 1;
        const sampleNumber = unshapedProductSampleDraftRequests === 1
          ? "19"
          : "20";
        return jsonResponse({
          sampleNumber,
          sampleCode: `.${sampleNumber}`,
          sampleDate: "2026-08-05",
          sampledBy: "Иванова А.А.",
        });
      }
      if (
        url.pathname ===
          "/api/laboratory/unshaped-product-sample-journal"
      ) {
        if (init.method === "POST") {
          const submission = JSON.parse(String(init.body));
          unshapedProductSampleSubmissions.push(submission);
          return jsonResponse({
            record: {
              id: "unshaped-sample-created",
              ...submission,
              createdAt: "2026-08-05T08:30:00.000Z",
            },
          }, 201);
        }
        unshapedProductSampleRequests.push(Object.fromEntries(url.searchParams));
        return jsonResponse({
          records: [{
            id: "unshaped-sample-1",
            sampleNumber: "18",
            sampleDate: "2026-08-04",
            sampledBy: "Иванова А.А.",
            batchNumber: "55",
            sampleCode: ".18",
            productName: "ШКИ-66",
            batchMass: "20 т",
            chemicalAnalysisNumber: "43",
            moisture: "0,8",
            grainComposition: "0–3 мм",
            fireResistance: "1710 °C",
            suitability: "no",
            notes: "Повторить отбор",
            createdAt: "2026-08-04T08:30:00.000Z",
          }],
        });
      }
      if (
        url.pathname ===
          "/api/laboratory/unshaped-product-sample-journal/unshaped-sample-1" &&
        init.method === "PATCH"
      ) {
        const submission = JSON.parse(String(init.body));
        unshapedProductSampleCorrections.push(submission);
        return jsonResponse({
          record: {
            id: "unshaped-sample-1",
            ...submission,
            chemicalAnalysisNumber: "43",
            createdAt: "2026-08-04T08:30:00.000Z",
          },
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
      if (url.pathname === "/api/laboratory/raw-material-quality-draft") {
        rawMaterialQualityDraftRequests += 1;
        return jsonResponse({ recordDate: "2026-08-05" });
      }
      if (url.pathname === "/api/laboratory/raw-material-quality-options") {
        rawMaterialQualityOptionsRequests += 1;
        return jsonResponse({
          options: {
            laboratoryAssistants: ["Иванова А.А."],
            shiftSupervisors: ["Петров П.П."],
            clayBrands: ["Глина ДН-2"],
            temperBrands: ["Шамот ШКИ-44"],
            slipMixerNumbers: ["3"],
            runnerNumbers: ["2"],
          },
        });
      }
      if (
        url.pathname.startsWith("/api/laboratory/raw-material-quality-journal/") &&
        init.method === "PATCH"
      ) {
        const submission = JSON.parse(String(init.body));
        rawMaterialQualityCorrections.push(submission);
        return jsonResponse({
          record: {
            id: url.pathname.split("/").at(-1),
            ...submission,
            createdAt: rawMaterialQualityRecord.createdAt,
          },
        });
      }
      if (url.pathname === "/api/laboratory/raw-material-quality-journal") {
        if (init.method === "POST") {
          const submission = JSON.parse(String(init.body));
          rawMaterialQualitySubmissions.push(submission);
          return jsonResponse({
            record: {
              id: "raw-quality-created",
              ...submission,
              createdAt: "2026-08-05T08:30:00.000Z",
            },
          }, 201);
        }
        rawMaterialQualityRequests.push(Object.fromEntries(url.searchParams));
        return jsonResponse({ records: [rawMaterialQualityRecord] });
      }
      if (url.pathname === "/api/laboratory/green-product-quality-draft") {
        greenProductQualityDraftRequests += 1;
        return jsonResponse({ recordDate: "2026-08-05" });
      }
      if (url.pathname === "/api/laboratory/green-product-quality-options") {
        greenProductQualityOptionsRequests += 1;
        return jsonResponse({
          options: {
            setters: ["Иванов И.И."],
            pressOperators: ["Петров П.П."],
            wagons: greenProductQualityWagons,
          },
        });
      }
      if (
        url.pathname.startsWith("/api/laboratory/green-product-quality-journal/") &&
        init.method === "PATCH"
      ) {
        const submission = JSON.parse(String(init.body));
        greenProductQualityCorrections.push(submission);
        return jsonResponse({
          record: {
            id: url.pathname.split("/").at(-1),
            ...submission,
            wagons: greenProductQualityWagons.filter((wagon) =>
              submission.wagonIds.includes(wagon.id)
            ),
            createdAt: greenProductQualityRecord.createdAt,
          },
        });
      }
      if (url.pathname === "/api/laboratory/green-product-quality-journal") {
        if (init.method === "POST") {
          const submission = JSON.parse(String(init.body));
          greenProductQualitySubmissions.push(submission);
          return jsonResponse({
            record: {
              id: "green-quality-created",
              ...submission,
              wagons: greenProductQualityWagons.filter((wagon) =>
                submission.wagonIds.includes(wagon.id)
              ),
              createdAt: "2026-08-05T09:30:00.000Z",
            },
          }, 201);
        }
        greenProductQualityRequests.push(Object.fromEntries(url.searchParams));
        return jsonResponse({ records: [greenProductQualityRecord] });
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
      "Пробы неформованной продукции",
    ]) {
      assert.equal(findTabByText(journalLabel), undefined);
    }
    const centralLabTab = findTabByText("ЦЗЛ (Центральная заводская лаборатория)");
    assert.ok(centralLabTab);
    const qualityControlTab = findTabByText("ОТК");
    assert.ok(qualityControlTab);
    await React.act(async () => centralLabTab.click());

    const kilnJournalTab = findTabByText("Журнал печи 2");
    assert.ok(kilnJournalTab);
    assert.ok(findTabByText("Регистрация проб"));
    assert.ok(findTabByText("Химические анализы"));
    assert.equal(findTabByText("Пробы неформованной продукции"), undefined);
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
    assert.equal(
      journalForm.querySelector(".production-brand-source-note")?.textContent
        ?.trim(),
      "Актуальный список марок хранится в Google Sheets: вкладка «Номенклатура», столбец «Наименование».",
    );
    for (const label of expectedJournalLabels) {
      assert.ok(findControlByLabel(journalForm, label));
    }
    for (const optionalLabel of [
      "t в полевой камере",
      "Проход ч/з сито 0,5",
      "Загрузка печи в ковшах в час",
    ]) {
      assert.equal(
        findControlByLabel(journalForm, optionalLabel).required,
        false,
      );
    }
    const incompleteKilnRow = Array.from(
      rootElement.querySelectorAll(".rotary-kiln-journal-table tbody tr"),
    ).find((row) => row.textContent?.includes("28.07.2026"));
    assert.ok(incompleteKilnRow);
    const incompleteKilnCells = incompleteKilnRow.querySelectorAll("td");
    assert.equal(incompleteKilnCells[6]?.textContent?.trim(), "—");
    assert.equal(incompleteKilnCells[14]?.textContent?.trim(), "—");
    assert.equal(incompleteKilnCells[16]?.textContent?.trim(), "—");
    await waitFor(React, () => kilnPersonnelOptionsRequests === 1);
    const shiftSupervisorInput = findControlByLabel(
      journalForm,
      "Мастер смены",
    );
    const burnerOperatorInput = findControlByLabel(
      journalForm,
      "Обжигальщик",
    );
    assert.ok(shiftSupervisorInput.list);
    assert.ok(burnerOperatorInput.list);
    assert.deepEqual(
      Array.from(shiftSupervisorInput.list.options, (option) => option.value),
      ["Орлов О.О.", "Петров П.П."],
    );
    assert.deepEqual(
      Array.from(burnerOperatorInput.list.options, (option) => option.value),
      ["Павлов П.П.", "Сидоров С.С."],
    );
    await waitFor(React, () => kilnDraftRequests === 1);
    const dateInput = findControlByLabel(journalForm, "Дата");
    await React.act(async () => {
      setNativeInputValue(dateInput, "2026-08-01");
      dateInput.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
      resolveKilnDraft();
    });
    await waitFor(React, () =>
      findControlByLabel(journalForm, "Мастер смены").value === "Задний З.З."
    );
    // Материал берётся из истории, а поля задачи 40 — из последней созданной записи.
    await waitFor(React, () =>
      findControlByLabel(journalForm, "Производимый материал").value === "ША-22"
    );
    assert.deepEqual(
      Object.fromEntries(
        [
          "Дата",
          "Время",
          "Мастер смены",
          "Обжигальщик",
          "Лаборант",
          "Проход ч/з сито 0,5",
          "Насыпной вес",
          "Загрузка печи в ковшах в час",
        ].map((label) => [label, findControlByLabel(journalForm, label).value]),
      ),
      {
        "Дата": "2026-08-01",
        "Время": "00:30",
        "Мастер смены": "Задний З.З.",
        "Обжигальщик": "Поздний П.П.",
        "Лаборант": "Последний Л.Л.",
        "Проход ч/з сито 0,5": "0.65",
        "Насыпной вес": "1.22",
        "Загрузка печи в ковшах в час": "13",
      },
    );
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

    const kilnMaterialEditLink = rootElement.querySelector(
      ".rotary-kiln-journal-table .rotary-kiln-edit-link",
    );
    assert.ok(kilnMaterialEditLink);
    assert.equal(kilnMaterialEditLink.textContent?.trim(), "ША-22");
    await React.act(async () => kilnMaterialEditLink.click());
    assert.match(journalForm.textContent, /Редактирование записи/u);
    assert.equal(findControlByLabel(journalForm, "Дата").value, "2026-07-29");
    assert.equal(
      findControlByLabel(journalForm, "Производимый материал").value,
      "ША-22",
    );
    const correctedBulkDensity = findControlByLabel(
      journalForm,
      "Насыпной вес",
    );
    await React.act(async () => {
      setNativeInputValue(correctedBulkDensity, "1.19");
      correctedBulkDensity.dispatchEvent(
        new dom.window.Event("input", { bubbles: true }),
      );
      for (const optionalLabel of [
        "t в полевой камере",
        "Проход ч/з сито 0,5",
        "Загрузка печи в ковшах в час",
      ]) {
        const input = findControlByLabel(journalForm, optionalLabel);
        setNativeInputValue(input, "");
        input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
      }
      journalForm.dispatchEvent(
        new dom.window.Event("submit", { bubbles: true, cancelable: true }),
      );
    });
    await waitFor(React, () => kilnJournalCorrections.length === 1);
    assert.deepEqual(kilnJournalCorrections[0], {
      recordDate: "2026-07-29",
      recordTime: "08:05",
      producedMaterial: "ША-22",
      waterAbsorption: 4.2,
      temperatureBeforeCyclone: 850,
      temperatureBeforeFilter: 210.5,
      temperatureAtRollback: 96,
      gasConsumptionPerHour: 320.4,
      vacuum: 14.5,
      pressure: 1.8,
      shiftSupervisor: "Петров П.П.",
      burnerOperator: "Сидоров С.С.",
      laboratoryAssistant: "Иванова А.А.",
      bulkDensity: 1.19,
      note: "Краткая остановка для осмотра.",
    });
    await waitFor(React, () =>
      journalForm.textContent.includes("Редактирование записи") === false
    );
    await waitFor(React, () => kilnDraftRequests === 2);

    const latestKilnEditLink = Array.from(
      rootElement.querySelectorAll(
        ".rotary-kiln-journal-table .rotary-kiln-edit-link",
      ),
    ).find((button) => button.textContent?.trim() === "ШКИ-66");
    assert.ok(latestKilnEditLink);
    await React.act(async () => latestKilnEditLink.click());
    const correctedLaboratoryAssistant = findControlByLabel(
      journalForm,
      "Лаборант",
    );
    await React.act(async () => {
      setNativeInputValue(correctedLaboratoryAssistant, "Исправленная И.И.");
      correctedLaboratoryAssistant.dispatchEvent(
        new dom.window.Event("input", { bubbles: true }),
      );
      journalForm.dispatchEvent(
        new dom.window.Event("submit", { bubbles: true, cancelable: true }),
      );
    });
    await waitFor(React, () => kilnJournalCorrections.length === 2);
    await waitFor(React, () =>
      journalForm.textContent.includes("Редактирование записи") === false &&
      findControlByLabel(journalForm, "Лаборант").value ===
        "Исправленная И.И." &&
      findControlByLabel(journalForm, "Время").value === "00:30"
    );
    assert.equal(findControlByLabel(journalForm, "Дата").value, "2026-07-27");

    const journalValues = {
      "Дата": "2026-07-29",
      "Время": "12:15",
      "Производимый материал": "ША-22",
      "Водопоглощение": "4.3",
      "t перед циклоном": "852",
      "t перед фильтром": "212",
      "t в полевой камере": "",
      "t на откатной": "97",
      "Расход газа в час": "321",
      "Разряжение": "14.6",
      "Давление": "1.9",
      "Мастер смены": "Ильин И.И.",
      "Обжигальщик": "Фомин Ф.Ф.",
      "Лаборант": "Иванова А.А.",
      "Проход ч/з сито 0,5": "",
      "Насыпной вес": "1.18",
      "Загрузка печи в ковшах в час": "",
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
      temperatureAtRollback: 97,
      gasConsumptionPerHour: 321,
      vacuum: 14.6,
      pressure: 1.9,
      shiftSupervisor: "Ильин И.И.",
      burnerOperator: "Фомин Ф.Ф.",
      laboratoryAssistant: "Иванова А.А.",
      bulkDensity: 1.18,
      note: "Работа без отклонений.",
    });
    // После сохранения поля задач 40 и 41 подставляются из новой записи.
    await waitFor(React, () =>
      findControlByLabel(journalForm, "Водопоглощение").value === "" &&
      findControlByLabel(journalForm, "Насыпной вес").value === "1.18" &&
      findControlByLabel(journalForm, "Время").value === "13:15"
    );
    assert.deepEqual(
      Object.fromEntries(
        [
          "Дата",
          "Время",
          "Производимый материал",
          "Мастер смены",
          "Обжигальщик",
          "Лаборант",
          "Проход ч/з сито 0,5",
          "Насыпной вес",
          "Загрузка печи в ковшах в час",
        ].map((label) => [label, findControlByLabel(journalForm, label).value]),
      ),
      {
        "Дата": "2026-07-29",
        "Время": "13:15",
        "Производимый материал": "ША-22",
        "Мастер смены": "Ильин И.И.",
        "Обжигальщик": "Фомин Ф.Ф.",
        "Лаборант": "Иванова А.А.",
        "Проход ч/з сито 0,5": "",
        "Насыпной вес": "1.18",
        "Загрузка печи в ковшах в час": "",
      },
    );
    assert.equal(shiftSupervisorInput.list.options[0]?.value, "Ильин И.И.");
    assert.equal(burnerOperatorInput.list.options[0]?.value, "Фомин Ф.Ф.");

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
    assert.ok(
      Array.from(
        rootElement.querySelectorAll(
          ".sample-registration-journal-table thead th",
        ),
      ).some((heading) => heading.textContent?.trim() === "№ Хим анализа"),
    );

    const sampleRegistrationForm = rootElement.querySelector(
      ".sample-registration-journal-form",
    );
    assert.ok(sampleRegistrationForm);
    const sampleNumberInput = findControlByLabel(
      sampleRegistrationForm,
      "№ пробы",
    );
    const laboratorySampleCodeInput = findControlByLabel(
      sampleRegistrationForm,
      "Код лабораторной пробы",
    );
    await waitFor(React, () =>
      sampleNumberInput.value === "18" &&
        laboratorySampleCodeInput.value === ".18"
    );
    assert.equal(sampleNumberInput.readOnly, false);
    assert.equal(laboratorySampleCodeInput.readOnly, false);
    assert.equal(
      findControlByLabel(sampleRegistrationForm, "Водопоглощение").required,
      false,
    );
    const samplingDateInput = findControlByLabel(
      sampleRegistrationForm,
      "Дата отбора",
    );
    const registrationDateInput = findControlByLabel(
      sampleRegistrationForm,
      "Дата регистрации",
    );
    await React.act(async () => {
      setNativeInputValue(samplingDateInput, "2026-08-01");
      samplingDateInput.dispatchEvent(
        new dom.window.Event("input", { bubbles: true }),
      );
    });
    assert.equal(registrationDateInput.value, "2026-08-01");
    await React.act(async () => {
      setNativeInputValue(registrationDateInput, "2026-08-02");
      registrationDateInput.dispatchEvent(
        new dom.window.Event("input", { bubbles: true }),
      );
    });
    assert.equal(samplingDateInput.value, "2026-08-01");
    await React.act(async () => {
      setNativeInputValue(samplingDateInput, "2026-08-03");
      samplingDateInput.dispatchEvent(
        new dom.window.Event("input", { bubbles: true }),
      );
    });
    assert.equal(registrationDateInput.value, "2026-08-03");
    await React.act(async () => {
      setNativeInputValue(sampleNumberInput, "25-А");
      sampleNumberInput.dispatchEvent(
        new dom.window.Event("input", { bubbles: true }),
      );
    });
    assert.equal(laboratorySampleCodeInput.value, ".25");
    await React.act(async () => {
      setNativeInputValue(laboratorySampleCodeInput, ".25-Р");
      laboratorySampleCodeInput.dispatchEvent(
        new dom.window.Event("input", { bubbles: true }),
      );
      setNativeInputValue(sampleNumberInput, "26-Б");
      sampleNumberInput.dispatchEvent(
        new dom.window.Event("input", { bubbles: true }),
      );
    });
    assert.equal(laboratorySampleCodeInput.value, ".25-Р");
    const samplingLocationInput = findControlByLabel(
      sampleRegistrationForm,
      "Место отбора пробы",
    );
    await waitFor(React, () =>
      samplingLocationInput.value === "Опытная площадка"
    );
    const samplingLaboratoryAssistantInput = findControlByLabel(
      sampleRegistrationForm,
      "Лаборант (отбор проб)",
    );
    const laboratoryAssistantListId =
      samplingLaboratoryAssistantInput.getAttribute("list");
    assert.ok(laboratoryAssistantListId);
    const laboratoryAssistantList = rootElement.querySelector(
      `#${laboratoryAssistantListId}`,
    );
    assert.ok(laboratoryAssistantList);
    assert.deepEqual(
      Array.from(laboratoryAssistantList.querySelectorAll("option")).map(
        (option) => option.value,
      ),
      ["Петрова П.П.", "Иванова А.А."],
    );
    const samplingLocationListId = samplingLocationInput.getAttribute("list");
    assert.ok(samplingLocationListId);
    const samplingLocationList = rootElement.querySelector(
      `#${samplingLocationListId}`,
    );
    assert.ok(samplingLocationList);
    assert.deepEqual(
      Array.from(samplingLocationList.querySelectorAll("option")).map(
        (option) => option.value,
      ),
      [
        "склад сырья",
        "материальный склад",
        "склад готовой продукции",
        "ОЦ сортировка",
        "ОЦ формовка",
        "ОЦ затарка",
        "ЦОШ",
        "ЦОШ затарка",
        "ЦОМ",
        "ЦПКУ",
        "Опытная площадка",
        "Архивная площадка",
      ],
    );
    const sampleRegistrationValues = {
      "Дата отбора": "2026-07-30",
      "Лаборант (отбор проб)": "Сидорова С.С.",
      "Наименование пробы": "Глина огнеупорная",
      "Дата регистрации": "2026-07-30",
      "Место отбора пробы": "Пункт контроля № 2",
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
      sampleNumber: "26-Б",
      laboratorySampleCode: ".25-Р",
      samplingDate: "2026-07-30",
      samplingLaboratoryAssistant: "Сидорова С.С.",
      sampleName: "Глина огнеупорная",
      registrationDate: "2026-07-30",
      samplingLocation: "Пункт контроля № 2",
    });
    await waitFor(React, () =>
      sampleNumberInput.value === "27" &&
        laboratorySampleCodeInput.value === ".27" &&
        samplingLaboratoryAssistantInput.value === "Сидорова С.С." &&
        samplingLocationInput.value === "Пункт контроля № 2"
    );
    assert.ok(
      Array.from(laboratoryAssistantList.querySelectorAll("option")).some(
        (option) => option.value === "Сидорова С.С.",
      ),
    );
    assert.ok(
      Array.from(samplingLocationList.querySelectorAll("option")).some(
        (option) => option.value === "Пункт контроля № 2",
      ),
    );

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
    assert.equal(sampleRegistrationLocationRequests, 1);

    const sampleCodeEditButton = rootElement.querySelector(
      ".sample-registration-journal-table .sample-registration-edit-link",
    );
    assert.ok(sampleCodeEditButton);
    await React.act(async () => sampleCodeEditButton.click());
    assert.equal(sampleNumberInput.value, "17-А");
    assert.equal(laboratorySampleCodeInput.value, "ЛП-2026-017");
    assert.equal(
      findControlByLabel(sampleRegistrationForm, "Наименование пробы").value,
      "Шамот молотый",
    );
    assert.ok(
      sampleRegistrationForm.textContent.includes("Редактирование пробы"),
    );
    assert.equal(
      findControlByLabel(sampleRegistrationForm, "Водопоглощение").required,
      false,
    );
    await React.act(async () => {
      const sampleNameInput = findControlByLabel(
        sampleRegistrationForm,
        "Наименование пробы",
      );
      setNativeInputValue(sampleNameInput, "Шамот исправленный");
      sampleNameInput.dispatchEvent(
        new dom.window.Event("input", { bubbles: true }),
      );
      sampleRegistrationForm.dispatchEvent(
        new dom.window.Event("submit", { bubbles: true, cancelable: true }),
      );
    });
    await waitFor(React, () => sampleRegistrationCorrections.length === 1);
    assert.deepEqual(sampleRegistrationCorrections[0], {
      sampleNumber: "17-А",
      laboratorySampleCode: "ЛП-2026-017",
      samplingDate: "2026-07-29",
      samplingLaboratoryAssistant: "Иванова А.А.",
      sampleName: "Шамот исправленный",
      registrationDate: "2026-07-29",
      samplingLocation: "Опытная площадка",
    });
    await waitFor(React, () =>
      sampleRegistrationForm.textContent.includes("Редактирование пробы") ===
        false && sampleNumberInput.value === "27" &&
        samplingLaboratoryAssistantInput.value === "Сидорова С.С." &&
        samplingLocationInput.value === "Пункт контроля № 2"
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
    await waitFor(React, () => chemicalAnalysisRequests.length > 0);

    let chemicalAnalysisForm = rootElement.querySelector(
      ".chemical-analysis-journal-form",
    );
    assert.ok(chemicalAnalysisForm);
    assert.equal(
      findControlByLabel(chemicalAnalysisForm, "Номер партии").required,
      false,
    );
    const laboratoryAnalysisNumberInput = findControlByLabel(
      chemicalAnalysisForm,
      "Номер лабораторного анализа",
    );
    await waitFor(React, () => laboratoryAnalysisNumberInput.value === "43");
    assert.equal(laboratoryAnalysisNumberInput.required, false);
    const chemicalAnalysisLaboratoryAssistantInput = findControlByLabel(
      chemicalAnalysisForm,
      "Лаборант",
    );
    assert.equal(
      chemicalAnalysisLaboratoryAssistantInput.value,
      "Иванова Анна",
    );
    const chemicalAnalysisLaboratoryAssistantListId =
      chemicalAnalysisLaboratoryAssistantInput.getAttribute("list");
    assert.ok(chemicalAnalysisLaboratoryAssistantListId);
    await waitFor(React, () =>
      Array.from(
        rootElement.querySelectorAll(
          `#${chemicalAnalysisLaboratoryAssistantListId} option`,
        ),
      ).some((option) => option.value === "Петрова П.П.")
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
    const chemicalAnalysisTotalNote = chemicalAnalysisForm.querySelector(
      ".chemical-analysis-total-note",
    );
    assert.ok(chemicalAnalysisTotalNote);
    const chemicalAnalysisTotalNoteStyle = dom.window.getComputedStyle(
      chemicalAnalysisTotalNote,
    );
    assert.equal(chemicalAnalysisTotalNoteStyle.color, "var(--brick)");
    assert.equal(chemicalAnalysisTotalNoteStyle.fontWeight, "800");
    assert.equal(
      chemicalAnalysisForm.textContent.includes(
        "Поиск пробы без химического анализа",
      ),
      false,
    );
    const sampleCodeInput = findControlByLabel(
      chemicalAnalysisForm,
      "Код лабораторной пробы",
      "input",
    );
    assert.equal(sampleCodeInput.getAttribute("role"), "combobox");
    await React.act(async () => {
      setNativeInputValue(sampleCodeInput, "много");
      sampleCodeInput.dispatchEvent(
        new dom.window.Event("input", { bubbles: true }),
      );
    });
    await waitFor(React, () =>
      chemicalAnalysisRequests.some(
        (request) => request.sampleQuery === "много",
      ) && chemicalAnalysisForm.querySelectorAll(
        ".chemical-analysis-sample-option",
      ).length === 12
    );
    const overflowSampleOptions = Array.from(
      chemicalAnalysisForm.querySelectorAll(
        ".chemical-analysis-sample-option",
      ),
    );
    const scrolledSampleOptions = [];
    for (const option of overflowSampleOptions) {
      option.scrollIntoView = (settings) => {
        scrolledSampleOptions.push({ id: option.id, settings });
      };
    }
    for (let index = 0; index < 10; index += 1) {
      await React.act(async () => {
        sampleCodeInput.focus();
        sampleCodeInput.dispatchEvent(
          new dom.window.KeyboardEvent("keydown", {
            bubbles: true,
            key: "ArrowDown",
          }),
        );
      });
    }
    assert.equal(
      sampleCodeInput.getAttribute("aria-activedescendant"),
      overflowSampleOptions[9].id,
    );
    assert.deepEqual(scrolledSampleOptions.at(-1), {
      id: overflowSampleOptions[9].id,
      settings: { block: "nearest" },
    });
    await React.act(async () => {
      sampleCodeInput.dispatchEvent(
        new dom.window.KeyboardEvent("keydown", {
          bubbles: true,
          key: "Escape",
        }),
      );
    });
    await React.act(async () => {
      setNativeInputValue(sampleCodeInput, "ЛП-2026-017");
      sampleCodeInput.dispatchEvent(
        new dom.window.Event("input", { bubbles: true }),
      );
    });
    await waitFor(React, () =>
      chemicalAnalysisRequests.some(
        (request) => request.sampleQuery === "ЛП-2026-017",
      )
    );
    const sampleOptionButtons = Array.from(
      chemicalAnalysisForm.querySelectorAll(
        ".chemical-analysis-sample-option",
      ),
    );
    const sampleOptionLabels = sampleOptionButtons.map(
      (option) => option.textContent,
    );
    assert.equal(sampleOptionLabels.length, 2);
    assert.notEqual(sampleOptionLabels[0], sampleOptionLabels[1]);
    assert.match(sampleOptionLabels[0], /Журнал отбора проб/u);
    assert.match(sampleOptionLabels[0], /дата пробы 29\.07\.2026/u);
    assert.match(sampleOptionLabels[1], /Неформованная продукция/u);
    assert.match(sampleOptionLabels[1], /\.19/u);
    await React.act(async () => {
      sampleCodeInput.focus();
      sampleCodeInput.dispatchEvent(
        new dom.window.KeyboardEvent("keydown", {
          bubbles: true,
          key: "ArrowDown",
        }),
      );
    });
    assert.equal(
      sampleCodeInput.getAttribute("aria-activedescendant"),
      sampleOptionButtons[0].id,
    );
    assert.equal(sampleOptionButtons[0].getAttribute("aria-selected"), "true");
    await React.act(async () => {
      sampleCodeInput.dispatchEvent(
        new dom.window.KeyboardEvent("keydown", {
          bubbles: true,
          key: "ArrowDown",
        }),
      );
    });
    assert.equal(
      sampleCodeInput.getAttribute("aria-activedescendant"),
      sampleOptionButtons[1].id,
    );
    await React.act(async () => {
      sampleCodeInput.dispatchEvent(
        new dom.window.KeyboardEvent("keydown", {
          bubbles: true,
          key: "ArrowUp",
        }),
      );
    });
    assert.equal(
      sampleCodeInput.getAttribute("aria-activedescendant"),
      sampleOptionButtons[0].id,
    );
    await React.act(async () => {
      sampleCodeInput.dispatchEvent(
        new dom.window.KeyboardEvent("keydown", {
          bubbles: true,
          key: "Enter",
        }),
      );
    });
    assert.equal(sampleCodeInput.value, "ЛП-2026-017");
    assert.equal(sampleCodeInput.getAttribute("aria-expanded"), "false");
    assert.equal(sampleCodeInput.getAttribute("aria-activedescendant"), null);
    assert.equal(dom.window.document.activeElement, sampleCodeInput);
    await React.act(async () => {
      setNativeInputValue(laboratoryAnalysisNumberInput, "47");
      laboratoryAnalysisNumberInput.dispatchEvent(
        new dom.window.Event("input", { bubbles: true }),
      );
      for (const [label, value] of Object.entries({
        "Дата хим. анализа": "",
        "Лаборант": "",
        "Номер партии": "",
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
      sampleSource: "sample_registration",
      sampleId: "sample-registration-1",
      laboratoryAnalysisNumber: "47",
    });
    await waitFor(React, () => laboratoryAnalysisNumberInput.value === "44");
    assert.equal(
      chemicalAnalysisLaboratoryAssistantInput.value,
      "Иванова Анна",
    );
    await waitFor(React, () => sampleCodeInput.value === "");

    await React.act(async () => {
      setNativeInputValue(sampleCodeInput, "другая");
      sampleCodeInput.dispatchEvent(
        new dom.window.Event("input", { bubbles: true }),
      );
    });
    await waitFor(React, () =>
      chemicalAnalysisRequests.some(
        (request) => request.sampleQuery === "другая",
      )
    );
    const unshapedSampleOption = Array.from(
      chemicalAnalysisForm.querySelectorAll(
        ".chemical-analysis-sample-option",
      ),
    ).find((option) => option.textContent?.includes(".19"));
    assert.ok(unshapedSampleOption);
    await React.act(async () => {
      sampleCodeInput.dispatchEvent(
        new dom.window.KeyboardEvent("keydown", {
          bubbles: true,
          key: "Escape",
        }),
      );
    });
    assert.equal(sampleCodeInput.getAttribute("aria-expanded"), "false");
    await React.act(async () => {
      sampleCodeInput.dispatchEvent(
        new dom.window.KeyboardEvent("keydown", {
          bubbles: true,
          key: "ArrowDown",
        }),
      );
    });
    assert.equal(
      sampleCodeInput.getAttribute("aria-activedescendant"),
      unshapedSampleOption.id,
    );
    await React.act(async () => {
      sampleCodeInput.dispatchEvent(
        new dom.window.KeyboardEvent("keydown", {
          bubbles: true,
          key: "Enter",
        }),
      );
    });
    assert.equal(sampleCodeInput.value, ".19");
    await React.act(async () => {
      const chemicalAnalysisDateInput = findControlByLabel(
        chemicalAnalysisForm,
        "Дата хим. анализа",
      );
      setNativeInputValue(chemicalAnalysisDateInput, "");
      chemicalAnalysisDateInput.dispatchEvent(
        new dom.window.Event("input", { bubbles: true }),
      );
      setNativeInputValue(
        chemicalAnalysisLaboratoryAssistantInput,
        "Сидорова С.С.",
      );
      chemicalAnalysisLaboratoryAssistantInput.dispatchEvent(
        new dom.window.Event("input", { bubbles: true }),
      );
    });
    await React.act(async () => {
      chemicalAnalysisForm.dispatchEvent(
        new dom.window.Event("submit", { bubbles: true, cancelable: true }),
      );
    });
    await waitFor(React, () => chemicalAnalysisSubmissions.length === 2);
    assert.deepEqual(chemicalAnalysisSubmissions[1], {
      sampleSource: "unshaped_product",
      sampleId: "unshaped-sample-19",
      laboratoryAnalysisNumber: "44",
      chemicalAnalysisLaboratoryAssistant: "Сидорова С.С.",
    });
    await waitFor(React, () =>
      chemicalAnalysisLaboratoryAssistantInput.value === "Сидорова С.С."
    );
    assert.equal(
      Array.from(
        rootElement.querySelectorAll(
          `#${chemicalAnalysisLaboratoryAssistantListId} option`,
        ),
      ).some((option) => option.value === "Сидорова С.С."),
      true,
    );

    const chemicalAnalysisEditButton = rootElement.querySelector(
      ".chemical-analysis-journal-table .chemical-analysis-edit-link",
    );
    assert.ok(chemicalAnalysisEditButton);
    await React.act(async () => chemicalAnalysisEditButton.click());
    await waitFor(React, () => sampleCodeInput.value === ".18");
    await waitFor(React, () =>
      chemicalAnalysisRequests.some(
        (request) => request.sampleQuery === ".18",
      )
    );
    await waitFor(React, () =>
      rootElement.textContent.includes("Временная ошибка загрузки проб.")
    );
    assert.equal(sampleCodeInput.value, ".18");
    assert.ok(
      chemicalAnalysisForm.textContent.includes("Редактирование анализа"),
    );
    assert.equal(
      findControlByLabel(
        chemicalAnalysisForm,
        "Номер лабораторного анализа",
      ).value,
      "42",
    );
    assert.equal(
      findControlByLabel(chemicalAnalysisForm, "Дата хим. анализа").value,
      "2026-07-30",
    );
    assert.equal(
      findControlByLabel(chemicalAnalysisForm, "Лаборант").value,
      "Петрова П.П.",
    );
    assert.equal(
      findControlByLabel(chemicalAnalysisForm, "Номер партии").value,
      "П-42",
    );
    assert.equal(
      findControlByLabel(chemicalAnalysisForm, "Al2O3").value,
      "31,4",
    );
    assert.equal(
      findControlByLabel(chemicalAnalysisForm, "Примечания").value,
      "Без отклонений.",
    );
    await React.act(async () => {
      const analysisNumberInput = findControlByLabel(
        chemicalAnalysisForm,
        "Номер лабораторного анализа",
      );
      setNativeInputValue(analysisNumberInput, "41");
      analysisNumberInput.dispatchEvent(
        new dom.window.Event("input", { bubbles: true }),
      );
      const batchNumberInput = findControlByLabel(
        chemicalAnalysisForm,
        "Номер партии",
      );
      setNativeInputValue(batchNumberInput, "");
      batchNumberInput.dispatchEvent(
        new dom.window.Event("input", { bubbles: true }),
      );
      const notesInput = findControlByLabel(
        chemicalAnalysisForm,
        "Примечания",
      );
      setNativeInputValue(notesInput, "Исправлено по журналу.");
      notesInput.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
      chemicalAnalysisForm.dispatchEvent(
        new dom.window.Event("submit", { bubbles: true, cancelable: true }),
      );
    });
    await waitFor(React, () => chemicalAnalysisCorrections.length === 1);
    assert.deepEqual(chemicalAnalysisCorrections[0], {
      sampleSource: "unshaped_product",
      sampleId: "unshaped-sample-18",
      laboratoryAnalysisNumber: "41",
      chemicalAnalysisDate: "2026-07-30",
      chemicalAnalysisLaboratoryAssistant: "Петрова П.П.",
      al2o3: "31,4",
      fe2o3: "2,1",
      sio2: "58,7",
      cao2: "< 0,1",
      p2o5: "0,03",
      lossOnIgnition: "4,2",
      moisture: "0,8",
      notes: "Исправлено по журналу.",
    });
    await waitFor(React, () =>
      chemicalAnalysisForm.textContent.includes("Редактирование анализа") ===
        false
    );
    assert.equal(
      findControlByLabel(chemicalAnalysisForm, "Лаборант").value,
      "Сидорова С.С.",
    );

    const kilnJournalTabForSession = Array.from(
      rootElement.querySelectorAll("button"),
    ).find(
      (button) => button.textContent?.trim() === "Журнал печи 2",
    );
    assert.ok(kilnJournalTabForSession);
    await React.act(async () => kilnJournalTabForSession.click());
    const reopenedChemicalAnalysisTab = Array.from(
      rootElement.querySelectorAll("button"),
    ).find(
      (button) => button.textContent?.trim() === "Химические анализы",
    );
    assert.ok(reopenedChemicalAnalysisTab);
    await React.act(async () => reopenedChemicalAnalysisTab.click());
    await waitFor(React, () =>
      rootElement.querySelector(".chemical-analysis-journal-form") !== null
    );
    chemicalAnalysisForm = rootElement.querySelector(
      ".chemical-analysis-journal-form",
    );
    assert.equal(
      findControlByLabel(chemicalAnalysisForm, "Лаборант").value,
      "Сидорова С.С.",
    );

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
    const printProtocolButton = Array.from(
      rootElement.querySelectorAll("button"),
    ).find((button) => button.textContent.includes("Распечатать Протокол"));
    assert.ok(printProtocolButton);
    await waitFor(React, () => !printProtocolButton.disabled);
    await React.act(async () => {
      printProtocolButton.dispatchEvent(
        new dom.window.MouseEvent("click", { bubbles: true }),
      );
    });
    await waitFor(React, () => chemicalAnalysisProtocolRequests.length === 1);
    assert.deepEqual(chemicalAnalysisProtocolRequests[0], { query: "П-42" });
    assert.match(protocolPreview.location.href, /^blob:/u);

    await React.act(async () => qualityControlTab.click());
    const unshapedSamplesTab = Array.from(
      rootElement.querySelectorAll("button"),
    ).find(
      (button) =>
        button.textContent?.trim() === "Пробы неформованной продукции",
    );
    assert.ok(unshapedSamplesTab);
    await React.act(async () => unshapedSamplesTab.click());
    await waitFor(React, () =>
      rootElement.querySelector(".unshaped-product-sample-form") !== null
    );

    const unshapedSampleForm = rootElement.querySelector(
      ".unshaped-product-sample-form",
    );
    assert.ok(unshapedSampleForm);
    const unshapedSampleNumber = findControlByLabel(
      unshapedSampleForm,
      "Номер пробы",
    );
    const unshapedSampleCode = findControlByLabel(
      unshapedSampleForm,
      "Код пробы",
    );
    await waitFor(React, () =>
      unshapedSampleNumber.value === "19" &&
        unshapedSampleCode.value === ".19"
    );
    assert.equal(
      findControlByLabel(unshapedSampleForm, "Дата").value,
      "2026-08-05",
    );
    assert.equal(
      findControlByLabel(unshapedSampleForm, "Кто брал пробы").value,
      "Иванова А.А.",
    );
    const chemicalNumber = findControlByLabel(
      unshapedSampleForm,
      "№ хим. анализа",
    );
    assert.equal(chemicalNumber.disabled, true);
    assert.match(chemicalNumber.placeholder, /после химанализа/u);
    const productName = findControlByLabel(
      unshapedSampleForm,
      "Наименование продукции",
    );
    assert.ok(productName.getAttribute("list"));
    assert.ok(Array.from(
      rootElement.querySelectorAll(`#${productName.getAttribute("list")} option`),
    ).some((option) => option.value === "ШКИ-66"));

    await React.act(async () => {
      for (const [label, value] of Object.entries({
        "№ партии": "56",
        "Наименование продукции": "ШКИ-66",
        "Масса партии": "20 т",
        "Влажность": "0,8",
        "Зерновой состав": "0–3 мм",
        "Огнеупорность": "1710 °C",
      })) {
        const input = findControlByLabel(unshapedSampleForm, label);
        setNativeInputValue(input, value);
        input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
      }
      const suitability = findControlByLabel(
        unshapedSampleForm,
        "Пригодность",
        "select",
      );
      setNativeInputValue(suitability, "yes");
      suitability.dispatchEvent(
        new dom.window.Event("change", { bubbles: true }),
      );
    });
    await React.act(async () => {
      unshapedSampleForm.dispatchEvent(
        new dom.window.Event("submit", { bubbles: true, cancelable: true }),
      );
    });
    await waitFor(React, () => unshapedProductSampleSubmissions.length === 1);
    assert.deepEqual(unshapedProductSampleSubmissions[0], {
      sampleNumber: "19",
      sampleDate: "2026-08-05",
      sampledBy: "Иванова А.А.",
      batchNumber: "56",
      sampleCode: ".19",
      productName: "ШКИ-66",
      batchMass: "20 т",
      moisture: "0,8",
      grainComposition: "0–3 мм",
      fireResistance: "1710 °C",
      suitability: "yes",
    });
    await waitFor(React, () => unshapedSampleNumber.value === "20");

    const rejectedRow = rootElement.querySelector(
      ".unshaped-product-sample-suitability-no",
    );
    assert.ok(rejectedRow);
    assert.match(
      styleElement.textContent,
      /\.unshaped-product-sample-suitability-no > td\s*\{[^}]*background:\s*var\(--brick-soft\)/u,
    );
    const unshapedEditButton = rootElement.querySelector(
      ".unshaped-product-sample-edit-link",
    );
    assert.ok(unshapedEditButton);
    await React.act(async () => unshapedEditButton.click());
    assert.equal(unshapedSampleNumber.value, "18");
    assert.equal(chemicalNumber.value, "43");
    assert.equal(chemicalNumber.disabled, true);
    await React.act(async () => {
      const suitability = findControlByLabel(
        unshapedSampleForm,
        "Пригодность",
        "select",
      );
      setNativeInputValue(suitability, "maybe");
      suitability.dispatchEvent(
        new dom.window.Event("change", { bubbles: true }),
      );
      unshapedSampleForm.dispatchEvent(
        new dom.window.Event("submit", { bubbles: true, cancelable: true }),
      );
    });
    await waitFor(React, () => unshapedProductSampleCorrections.length === 1);
    assert.equal(unshapedProductSampleCorrections[0].suitability, "maybe");
    assert.equal(
      Object.hasOwn(
        unshapedProductSampleCorrections[0],
        "chemicalAnalysisNumber",
      ),
      false,
    );
    assert.ok(unshapedProductSampleRequests.length > 0);

    const refractoryShopTab = findTabByText("ОЦ (Огнеупорный цех)");
    assert.ok(refractoryShopTab);
    await React.act(async () => refractoryShopTab.click());
    await waitFor(React, () =>
      rootElement.querySelector(".raw-material-quality-form") !== null
    );
    await waitFor(React, () =>
      rawMaterialQualityDraftRequests === 1 &&
        rawMaterialQualityOptionsRequests === 1 &&
        rawMaterialQualityRequests.length > 0
    );
    assert.ok(findTabByText(
      "Качество сырья и соблюдения технологии и качество сырцовой продукции",
    ));
    const rawQualityForm = rootElement.querySelector(
      ".raw-material-quality-form",
    );
    assert.ok(rawQualityForm);
    const runnersSection = Array.from(
      rawQualityForm.querySelectorAll(".sample-registration-journal-section"),
    ).find((section) => section.querySelector(":scope > h3")?.textContent === "Бегуны");
    assert.equal(
      runnersSection?.querySelector(".raw-material-quality-subsection h4")
        ?.textContent,
      "Состав шихты",
    );
    const rawQualityHeadings = Array.from(
      rootElement.querySelectorAll(".raw-material-quality-table th"),
    );
    assert.equal(
      rawQualityHeadings.find((heading) => heading.textContent === "Бегуны")
        ?.colSpan,
      8,
    );
    assert.equal(
      rawQualityHeadings.find(
        (heading) => heading.textContent === "Состав шихты",
      )?.colSpan,
      7,
    );
    assert.equal(
      findControlByLabel(rawQualityForm, "Дата").value,
      "2026-08-05",
    );
    const laboratoryAssistantInput = findControlByLabel(
      rawQualityForm,
      "Лаборант",
    );
    assert.deepEqual(
      Array.from(laboratoryAssistantInput.list.options, (option) => option.value),
      ["Иванова А.А."],
    );

    await React.act(async () => {
      for (const [label, value] of Object.entries({
        "Лаборант": "Новая Н.Н.",
        "Мастер смены": "Петров П.П.",
        "Марка глины": "Глина ДН-2",
        "Влажность глины": "8,4",
        "Зерновой состав глины": "0–2 мм",
        "Влажность отощителя": "1,2",
        "Зерновой состав отощителя": "0–3 мм",
        "Остаток на сите № 1": "0,1",
        "Остаток на сите № 2": "0,3",
        "Остаток на сите № 3": "0,5",
        "Проход ч/з 0,5": "12,6",
        "Марка отощителя": "Шамот ШКИ-44",
        "Насыпной вес": "1,18",
        "№ мешалки": "3",
        "Температура шликера": "28",
        "Плотность, гр/см³": "1,64",
        "№ бегунов": "2",
        "% шамота": "70",
        "% глины": "30",
        "Остаток 0,063": "4,1",
        "Влажность шихты": "6,8",
        "Коэффициент отмучивания": "0,83",
        "Текст рекомендации": "Снизить подачу глины.",
      })) {
        const input = findControlByLabel(rawQualityForm, label);
        setNativeInputValue(input, value);
        input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
      }
      for (const [label, value] of [
        ["Смена", "day"],
        ["Дезинтегратор №", "1"],
        ["Адрес рекомендации", "batch_operator"],
      ]) {
        const select = findControlByLabel(rawQualityForm, label, "select");
        setNativeInputValue(select, value);
        select.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
      }
      rawQualityForm.dispatchEvent(
        new dom.window.Event("submit", { bubbles: true, cancelable: true }),
      );
    });
    await waitFor(React, () => rawMaterialQualitySubmissions.length === 1);
    assert.equal(rawMaterialQualitySubmissions[0].recordDate, "2026-08-05");
    assert.equal(rawMaterialQualitySubmissions[0].laboratoryAssistant, "Новая Н.Н.");
    assert.equal(rawMaterialQualitySubmissions[0].recommendationRecipient, "batch_operator");
    assert.equal(rawMaterialQualitySubmissions[0].recommendationText, "Снизить подачу глины.");

    const rawQualityEditButton = rootElement.querySelector(
      ".raw-material-quality-edit-link",
    );
    assert.ok(rawQualityEditButton);
    await React.act(async () => rawQualityEditButton.click());
    assert.equal(
      findControlByLabel(rawQualityForm, "Марка глины").value,
      "Глина ДН-2",
    );
    await React.act(async () => {
      const recommendation = findControlByLabel(
        rawQualityForm,
        "Текст рекомендации",
      );
      setNativeInputValue(recommendation, "Увеличить время перемешивания.");
      recommendation.dispatchEvent(
        new dom.window.Event("input", { bubbles: true }),
      );
      rawQualityForm.dispatchEvent(
        new dom.window.Event("submit", { bubbles: true, cancelable: true }),
      );
    });
    await waitFor(React, () => rawMaterialQualityCorrections.length === 1);
    assert.equal(
      rawMaterialQualityCorrections[0].recommendationText,
      "Увеличить время перемешивания.",
    );

    const greenQualityTab = findTabByText("Качество сырцовой продукции");
    assert.ok(greenQualityTab);
    await React.act(async () => greenQualityTab.click());
    await waitFor(React, () =>
      rootElement.querySelector(".green-product-quality-form") !== null
    );
    await waitFor(React, () =>
      greenProductQualityDraftRequests === 1 &&
        greenProductQualityOptionsRequests === 1 &&
        greenProductQualityRequests.length > 0
    );
    const greenQualityForm = rootElement.querySelector(
      ".green-product-quality-form",
    );
    assert.equal(
      findControlByLabel(greenQualityForm, "Дата").value,
      "2026-08-05",
    );
    assert.deepEqual(
      Array.from(
        findControlByLabel(greenQualityForm, "№ пресса", "select").options,
        (option) => option.value,
      ),
      ["", "1", "2", "3", "4", "5", "6", "7", "8"],
    );

    await React.act(async () => {
      for (const [label, value] of Object.entries({
        "Марка изделия": "ШКИ-66",
        "Садчик": "Новый Н.Н.",
        "Прессовщик": "Петров П.П.",
        "Длина 1": "230",
        "Ширина 1": "114",
        "Высота 1": "64",
        "Вес": "3,4",
        "Механическая прочность": "42,5",
        "Плотность": "2,11",
        "Рекомендации прессовщику": "Проверить давление прессования.",
      })) {
        const input = findControlByLabel(greenQualityForm, label);
        setNativeInputValue(input, value);
        input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
      }
      const press = findControlByLabel(greenQualityForm, "№ пресса", "select");
      setNativeInputValue(press, "3");
      press.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
      const firstBrandCheckbox = greenQualityForm.querySelector(
        '.green-product-quality-wagons input[value="wagon-1"]',
      );
      const differentBrandCheckbox = greenQualityForm.querySelector(
        '.green-product-quality-wagons input[value="wagon-2"]',
      );
      firstBrandCheckbox.click();
      differentBrandCheckbox.click();
    });
    const differentBrandCheckbox = greenQualityForm.querySelector(
      '.green-product-quality-wagons input[value="wagon-2"]',
    );
    assert.equal(differentBrandCheckbox.checked, false);
    assert.match(
      greenQualityForm.textContent,
      /Выбраны вагоны с разными марками, выберите с одинаковыми/u,
    );
    await React.act(async () => {
      greenQualityForm.querySelector(
        '.green-product-quality-wagons input[value="wagon-1"]',
      ).click();
      for (const wagonId of ["wagon-2", "wagon-3"]) {
        greenQualityForm.querySelector(
          `.green-product-quality-wagons input[value="${wagonId}"]`,
        ).click();
      }
    });
    assert.equal(
      findControlByLabel(greenQualityForm, "Марка изделия").value,
      "ШКИ-66",
    );
    assert.equal(
      findControlByLabel(greenQualityForm, "Садчик").value,
      "Садчик с вагона",
    );
    assert.equal(
      findControlByLabel(greenQualityForm, "Прессовщик").value,
      "Прессовщик с вагона",
    );
    assert.equal(findControlByLabel(greenQualityForm, "Длина 2").value, "230");
    await React.act(async () => {
      const secondLength = findControlByLabel(greenQualityForm, "Длина 2");
      setNativeInputValue(secondLength, "231");
      secondLength.dispatchEvent(
        new dom.window.Event("input", { bubbles: true }),
      );
      const firstLength = findControlByLabel(greenQualityForm, "Длина 1");
      setNativeInputValue(firstLength, "232");
      firstLength.dispatchEvent(
        new dom.window.Event("input", { bubbles: true }),
      );
    });
    assert.equal(findControlByLabel(greenQualityForm, "Длина 2").value, "231");
    await React.act(async () => {
      greenQualityForm.dispatchEvent(
        new dom.window.Event("submit", { bubbles: true, cancelable: true }),
      );
    });
    await waitFor(React, () => greenProductQualitySubmissions.length === 1);
    assert.deepEqual(greenProductQualitySubmissions[0].wagonIds, [
      "wagon-2",
      "wagon-3",
    ]);
    assert.equal(greenProductQualitySubmissions[0].lengthFirst, "232");
    assert.equal(greenProductQualitySubmissions[0].lengthSecond, "231");
    assert.equal(
      greenProductQualitySubmissions[0].setter,
      "Садчик с вагона",
    );
    assert.equal(
      greenProductQualitySubmissions[0].pressOperator,
      "Прессовщик с вагона",
    );
    const greenQualityHeadings = Array.from(
      rootElement.querySelectorAll(".green-product-quality-table th"),
    );
    assert.equal(
      greenQualityHeadings.find(
        (heading) => heading.textContent === "Линейные размеры",
      )?.colSpan,
      6,
    );
    assert.match(
      rootElement.querySelector(".green-product-quality-table").textContent,
      /В-02; В-03/u,
    );
    const greenQualityEditButton = rootElement.querySelector(
      ".green-product-quality-edit-link",
    );
    assert.ok(greenQualityEditButton);
    await React.act(async () => greenQualityEditButton.click());
    assert.equal(
      findControlByLabel(greenQualityForm, "Марка изделия").value,
      "ШКИ-66",
    );
    await React.act(async () => {
      const recommendation = findControlByLabel(
        greenQualityForm,
        "Рекомендации прессовщику",
      );
      setNativeInputValue(recommendation, "Уменьшить давление.");
      recommendation.dispatchEvent(
        new dom.window.Event("input", { bubbles: true }),
      );
      greenQualityForm.dispatchEvent(
        new dom.window.Event("submit", { bubbles: true, cancelable: true }),
      );
    });
    await waitFor(React, () => greenProductQualityCorrections.length === 1);
    assert.equal(
      greenProductQualityCorrections[0].pressOperatorRecommendations,
      "Уменьшить давление.",
    );

    let resolveStaleSamplingLocations;
    sampleRegistrationLocationsDelay = new Promise((resolve) => {
      resolveStaleSamplingLocations = resolve;
    });
    const centralLaboratoryTab = Array.from(
      rootElement.querySelectorAll("button"),
    ).find((button) => button.textContent?.trim().startsWith("ЦЗЛ"));
    assert.ok(centralLaboratoryTab);
    await React.act(async () => centralLaboratoryTab.click());
    const reopenedSampleRegistrationTab = Array.from(
      rootElement.querySelectorAll("button"),
    ).find((button) => button.textContent?.trim() === "Регистрация проб");
    assert.ok(reopenedSampleRegistrationTab);
    await React.act(async () => reopenedSampleRegistrationTab.click());
    await waitFor(React, () =>
      rootElement.querySelector(".sample-registration-journal-form") !== null
    );
    const reopenedSampleRegistrationForm = rootElement.querySelector(
      ".sample-registration-journal-form",
    );
    assert.equal(
      findControlByLabel(
        reopenedSampleRegistrationForm,
        "Лаборант (отбор проб)",
      ).value,
      "Сидорова С.С.",
    );
    const reopenedSamplingLocationInput = findControlByLabel(
      reopenedSampleRegistrationForm,
      "Место отбора пробы",
    );
    await waitFor(React, () => sampleRegistrationLocationRequests === 3);
    assert.equal(reopenedSamplingLocationInput.value, "");
    await waitFor(React, () =>
      findControlByLabel(reopenedSampleRegistrationForm, "№ пробы").value ===
        "27"
    );
    await React.act(async () => {
      const sampleNameInput = findControlByLabel(
        reopenedSampleRegistrationForm,
        "Наименование пробы",
      );
      setNativeInputValue(sampleNameInput, "Экспресс-проба");
      sampleNameInput.dispatchEvent(
        new dom.window.Event("input", { bubbles: true }),
      );
      setNativeInputValue(reopenedSamplingLocationInput, "Экспресс-площадка");
      reopenedSamplingLocationInput.dispatchEvent(
        new dom.window.Event("input", { bubbles: true }),
      );
      reopenedSampleRegistrationForm.dispatchEvent(
        new dom.window.Event("submit", { bubbles: true, cancelable: true }),
      );
    });
    await waitFor(React, () =>
      sampleRegistrationSubmissions.length === 2 &&
        reopenedSamplingLocationInput.value === "Экспресс-площадка"
    );
    assert.ok(resolveStaleSamplingLocations);
    await React.act(async () => resolveStaleSamplingLocations());
    assert.equal(reopenedSamplingLocationInput.value, "Экспресс-площадка");
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
