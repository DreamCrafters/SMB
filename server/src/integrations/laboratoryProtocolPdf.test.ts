import assert from "node:assert/strict";
import test from "node:test";
import type { LaboratoryProtocol } from "../domain/laboratoryProtocol.js";
import {
  buildLaboratoryChemicalAnalysisProtocolDocument,
  renderLaboratoryChemicalAnalysisProtocolPdf,
  renderLaboratoryProtocolPdf,
} from "./laboratoryProtocolPdf.js";

test("laboratory protocol renderer creates a PDF with embedded Cyrillic fonts", async () => {
  const protocol: LaboratoryProtocol = {
    resultId: "result-1",
    protocolDate: "22.07.2026",
    testDate: "21.07.2026",
    objectName: "Глина марки ГИМ-2",
    purpose: "Определение химического состава и свойств",
    protocolNote: "Исследования завершены.",
    optionalFields: [
      { label: "Способ доставки", value: "ЖД" },
      { label: "НД на отбор образцов", value: "ГОСТ 2642.0-2014" },
    ],
    sampleGroups: [{
      identifier: "Вагон 12345",
      rows: [
        {
          indicatorId: "al2o3",
          indicatorLabel: "Массовая доля Al₂O₃, %",
          standard: "ГОСТ 2642.4-2016, п.7.1",
          value: "31,4",
          note: "",
        },
        {
          indicatorId: "moisture",
          indicatorLabel: "Массовая доля влаги, %",
          standard: "ГОСТ 2642.1-2016",
          value: "0,8",
          note: "",
        },
      ],
    }],
    laboratoryAssistantDisplayName: "Иванова А.А.",
  };

  const pdf = await renderLaboratoryProtocolPdf(protocol);

  assert.equal(pdf.subarray(0, 5).toString("ascii"), "%PDF-");
  assert.ok(pdf.length > 15_000);
  assert.match(pdf.toString("latin1"), /\/FontFile2/u);
});

test("chemical analysis protocol renderer creates a printable PDF for filtered records", async () => {
  const input = {
    records: [{
      id: "chemical-analysis-1",
      sampleRegistrationId: "sample-registration-1",
      laboratorySampleCode: "ЛП-2026-017",
      sampleNumber: "17-А",
      sampleName: "Шамот молотый",
      laboratoryAnalysisNumber: "43",
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
    filters: {
      dateFrom: "2026-07-01",
      dateTo: "2026-07-31",
      query: "П-42",
    },
    generatedAt: new Date("2026-08-04T08:30:00.000Z"),
  };
  const definition = buildLaboratoryChemicalAnalysisProtocolDocument(input);
  const heading = definition.content[0] as {
    stack: Array<{ text: string }>;
  };
  const title = definition.content[1] as { text: string };
  const metadata = definition.content[2] as {
    table: { body: Array<Array<{ text: string }>> };
  };
  const recordsTable = definition.content[3] as {
    table: {
      body: Array<Array<string | { text: string }>>;
    };
  };

  assert.equal(heading.stack[0]?.text, "АО «Новомосковскогнеупор»");
  assert.equal(title.text, "ПРОТОКОЛ ОТБОРА ПРОБ ОТ 04.08.2026");
  assert.deepEqual(
    metadata.table.body.map((row) => row.map((cell) => cell.text)),
    [
      ["Период анализа:", "01.07.2026 — 31.07.2026"],
      ["Поиск:", "П-42"],
      ["Количество позиций:", "1"],
    ],
  );
  assert.deepEqual(
    recordsTable.table.body[0]?.map((cell) =>
      typeof cell === "string" ? cell : cell.text
    ),
    [
      "Код лабораторной пробы",
      "№ пробы",
      "Наименование пробы",
      "Номер лабораторного анализа",
      "Дата хим. анализа",
      "Лаборант",
      "Номер партии",
      "Al2O3",
      "Fe2O3",
      "SiO2",
      "CaO2",
      "P2O5",
      "ппп",
      "Влажность",
      "Примечания",
    ],
  );
  assert.deepEqual(recordsTable.table.body[1], [
    "ЛП-2026-017",
    "17-А",
    "Шамот молотый",
    "43",
    "30.07.2026",
    "Петрова П.П.",
    "П-42",
    "31,4",
    "2,1",
    "58,7",
    "< 0,1",
    "0,03",
    "4,2",
    "0,8",
    "Без отклонений.",
  ]);

  const pdf = await renderLaboratoryChemicalAnalysisProtocolPdf(input);

  assert.equal(pdf.subarray(0, 5).toString("ascii"), "%PDF-");
  assert.ok(pdf.length > 15_000);
  assert.match(pdf.toString("latin1"), /\/FontFile2/u);
});
