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
      sampleSource: "sample_registration" as const,
      sampleId: "sample-registration-1",
      laboratorySampleCode: "ЛП-2026-017",
      sampleNumber: "17-А",
      sampleName: "Шамот молотый",
      sampleDate: "2026-07-29",
      registrationDate: "2026-07-30",
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
  const title = definition.content[0] as { text: string };
  const samples = definition.content[1] as {
    table: { body: Array<Array<{ text: string }>> };
  };
  const batchAndDate = definition.content[2] as {
    table: { body: Array<Array<{ text: string }>> };
  };
  const laboratoryRepresentative = definition.content[5] as {
    table: { body: Array<Array<{ text: string }>> };
  };
  const recordsTable = definition.content[6] as {
    table: {
      headerRows: number;
      body: Array<Array<{ text?: string; colSpan?: number; rowSpan?: number }>>;
    };
  };

  assert.equal(definition.pageOrientation, "portrait");
  assert.equal(title.text, "ПРОТОКОЛ ОТБОРА ПРОБ");
  assert.deepEqual(samples.table.body[0]?.map((cell) => cell.text), [
    "Направляем Вам для испытаний пробы",
    "17-А (Шамот молотый)",
  ]);
  assert.deepEqual(batchAndDate.table.body[0]?.map((cell) => cell.text), [
    "отобранные от партии №",
    "П-42",
    "",
    "30.07.2026 г.",
  ]);
  assert.equal(
    laboratoryRepresentative.table.body[0]?.[2]?.text,
    "Петрова П.П.",
  );
  assert.equal(recordsTable.table.headerRows, 3);
  assert.deepEqual(
    recordsTable.table.body[0]?.map((cell) => cell.text ?? ""),
    [
      "Код лабораторной пробы",
      "№ анализа",
      "Результаты испытаний",
      "",
      "",
      "",
      "",
    ],
  );
  assert.deepEqual(
    recordsTable.table.body[1]?.map((cell) => cell.text ?? ""),
    [
      "",
      "",
      "Массовая доля в прокаленном веществе, %",
      "",
      "Массовая доля изменения массы при прокаливании, %",
      "Огнеупорность, °C",
      "Прочие показатели",
    ],
  );
  assert.deepEqual(
    recordsTable.table.body[2]?.map((cell) => cell.text ?? ""),
    ["", "", "Al₂O₃", "Fe₂O₃", "", "", ""],
  );
  assert.deepEqual(recordsTable.table.body[3]?.map((cell) => cell.text), [
    "ЛП-2026-017",
    "43",
    "31,4",
    "2,1",
    "4,2",
    "",
    "SiO₂: 58,7; CaO₂: < 0,1; P₂O₅: 0,03; Влажность: 0,8; Примечание: Без отклонений.",
  ]);
  assert.equal(recordsTable.table.body.length, 13);

  const pdf = await renderLaboratoryChemicalAnalysisProtocolPdf(input);

  assert.equal(pdf.subarray(0, 5).toString("ascii"), "%PDF-");
  assert.ok(pdf.length > 15_000);
  assert.match(pdf.toString("latin1"), /\/FontFile2/u);
});

test("chemical analysis protocol keeps optional blanks and long filtered selections stable", () => {
  const records = Array.from({ length: 11 }, (_, index) => ({
    id: `chemical-analysis-${index + 1}`,
    sampleSource: "sample_registration" as const,
    sampleId: `sample-registration-${index % 2}`,
    laboratorySampleCode: `ЛП-2026-${String(index + 1).padStart(3, "0")}`,
    sampleNumber: index % 2 === 0 ? "17-А" : "18-Б",
    sampleName: index % 2 === 0 ? "Шамот молотый" : "Глина ГИМ-2",
    sampleDate: "2026-07-29",
    registrationDate: "2026-07-30",
    createdAt: "2026-07-30T08:30:00.000Z",
  }));

  const definition = buildLaboratoryChemicalAnalysisProtocolDocument({
    records,
    filters: {},
    generatedAt: new Date("2026-08-04T08:30:00.000Z"),
  });
  const samples = definition.content[1] as {
    table: { body: Array<Array<{ text: string }>> };
  };
  const batchAndDate = definition.content[2] as {
    table: { body: Array<Array<{ text: string }>> };
  };
  const laboratoryRepresentative = definition.content[5] as {
    table: { body: Array<Array<{ text: string }>> };
  };
  const recordsTable = definition.content[6] as {
    table: { body: Array<Array<{ text?: string }>> };
  };

  assert.equal(
    samples.table.body[0]?.[1]?.text,
    "17-А (Шамот молотый), 18-Б (Глина ГИМ-2)",
  );
  assert.equal(batchAndDate.table.body[0]?.[1]?.text, " ");
  assert.equal(batchAndDate.table.body[0]?.[3]?.text, "04.08.2026 г.");
  assert.equal(laboratoryRepresentative.table.body[0]?.[2]?.text, " ");
  assert.equal(recordsTable.table.body.length, 14);
  assert.deepEqual(recordsTable.table.body[3]?.map((cell) => cell.text), [
    "ЛП-2026-001",
    "",
    "",
    "",
    "",
    "",
    "",
  ]);
});
