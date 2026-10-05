import assert from "node:assert/strict";
import test from "node:test";
import type { CollegiumInitiative, CollegiumMeeting } from "../contracts/collegiumInitiatives.js";
import { readXlsxWorkbook } from "./xlsxWorkbook.js";
import {
  buildCollegiumRegistryXlsx,
  renderCollegiumDashboardPdf,
  renderCollegiumProtocolPdf,
  renderCollegiumRegistryPdf,
} from "./collegiumInitiativesExport.js";

const initiative = {
  id: "i-1",
  number: "И-2026-0001",
  status: "in_progress",
  revision: 4,
  createdByUserId: "author",
  createdAt: "2026-10-05T09:00:00.000Z",
  updatedAt: "2026-10-06T09:00:00.000Z",
  workflow: {
    lastDecision: { meetingId: "m", meetingNumber: "КЗ-2026-01", meetingDate: "2026-10-12", protocolNumber: "КЗ-2026-01", itemOrder: 1, decision: "pilot" },
  },
  card: {
    title: "Снизить потери", initiatorId: "account:author", directionCode: "production", directionLabel: "Производство",
    effectTypeCodes: [], effectTypeLabels: ["Экономия затрат"], problem: "", baselineValue: "", baselinePeriod: "",
    baselineSource: "", solution: "", changeScope: "", expectedEffectAmount: "1200000.50", expectedEffectPeriod: "год",
    expectedEffectKind: "", effectMethod: "", oneTimeCostAmount: "0.00", oneTimeCostVat: "", oneTimeCostSource: "",
    recurringCostAmount: "", recurringCostPeriod: "", internalResources: "", ownerId: "account:owner", executorId: "",
    executionControllerId: "", effectControllerId: "", plannedStart: "", plannedResult: "2027-02-01",
    kpiCriterion: "Потери ≤ 1,5 %", kpiSource: "", risks: [], requestedDecision: "pilot",
  },
} as CollegiumInitiative;
const name = (id: string) => ({ "account:author": "Иванова А.А.", "account:owner": "Петров П.П." })[id] ?? "";

test("registry XLSX keeps amounts numeric and shows decisions and overdue", () => {
  const [sheet] = readXlsxWorkbook(buildCollegiumRegistryXlsx([initiative], name, new Set(["i-1"])));
  const header = sheet.rows[0].map((cell) => cell?.text);
  const row = sheet.rows[1];
  const value = (label: string) => row[header.indexOf(label)];
  assert.equal(value("Номер")?.text, "И-2026-0001");
  assert.equal(value("Статус")?.text, "В реализации");
  assert.equal(value("Владелец")?.text, "Петров П.П.");
  assert.equal(value("Ожидаемый эффект, ₽")?.number, 1200000.5);
  assert.equal(value("Разовые затраты, ₽")?.number, 0);
  assert.equal(value("Решение Коллегии")?.text, "Провести пилот, протокол № КЗ-2026-01 от 12.10.2026");
  assert.equal(value("Просрочка поручений")?.text, "да");
  assert.equal(value("Плановый результат")?.text, "01.02.2027");
});

test("registry and protocol PDFs render", async () => {
  const registry = await renderCollegiumRegistryPdf([initiative], name, new Set());
  assert.equal(registry.subarray(0, 5).toString("latin1"), "%PDF-");
  const protocol = await renderCollegiumProtocolPdf({
    id: "m", number: "КЗ-2026-01", status: "planned", revision: 1, meetingDate: "2026-10-12", meetingTime: "10:00",
    format: "in_person", location: "", participantIds: [], absentIds: [], quorumNote: "", items: [],
    protocol: { text: "ПРОТОКОЛ\\nРешения" }, createdByDisplayName: "x", createdAt: "", updatedAt: "",
  } as CollegiumMeeting);
  assert.equal(protocol.subarray(0, 5).toString("latin1"), "%PDF-");
});

test("dashboard summary PDF renders with every section", async () => {
  const ref = { id: "i", number: "И-2026-0001", title: "Идея" };
  const summary = await renderCollegiumDashboardPdf({
    generatedOn: "2026-10-05", total: 1, statusCounts: [{ status: "in_progress", count: 1 }],
    awaitingReview: 0, rework: 1, reworkOverdue: 1, inPilot: 0, inImplementation: 1, overdueAssignments: 2,
    plannedEffect: "1000.00", confirmedEffect: "0.00",
    effectByDirection: [{ directionLabel: "Сырьё", planned: "1000.00", confirmed: "0.00" }],
    nextMeeting: { id: "m", number: "КЗ-2026-01", meetingDate: "2026-10-12", meetingTime: "10:00", items: [ref] },
    unconfirmed: [ref], boardDecisions: [ref],
    topByEffect: [{ ...ref, expectedEffect: "1000.00", status: "in_progress" }],
    topRisks: [{ ...ref, risk: "Рост цен", expectedEffect: "1000.00" }],
  });
  assert.equal(summary.subarray(0, 5).toString("latin1"), "%PDF-");
});
