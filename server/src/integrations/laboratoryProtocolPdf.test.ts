import assert from "node:assert/strict";
import test from "node:test";
import type { LaboratoryProtocol } from "../domain/laboratoryProtocol.js";
import { renderLaboratoryProtocolPdf } from "./laboratoryProtocolPdf.js";

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
