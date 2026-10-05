import assert from "node:assert/strict";
import test from "node:test";
import {
  resolveCollegiumInitiativeCapabilities,
  type CollegiumInitiativeAccess,
  type CollegiumReference,
  type CollegiumReferenceKind,
  type CollegiumSettings,
  type CollegiumSettingsInput,
} from "../contracts/collegiumInitiatives.js";
import type { AuditEventDraft } from "./audit.js";
import type { ServerUserProfile } from "./auth.js";
import { CollegiumInitiativeError } from "./collegiumInitiative.js";
import { createCollegiumSettingsService, readCollegiumSettingsInput } from "./collegiumSettingsService.js";
import type { CollegiumSettingsRepository } from "../repositories/collegiumSettingsRepository.js";

function profile(userId: string, level: CollegiumInitiativeAccess): ServerUserProfile {
  return {
    userId,
    displayName: `Пользователь ${userId}`,
    accountType: "business_owner",
    activeAccess: {
      accountId: `access-${userId}`,
      accountType: "business_owner",
      position: "collegium",
      positionDisplayName: "Коллегия",
      displayName: `Пользователь ${userId}`,
      scope: { kind: "organization" },
      capabilities: resolveCollegiumInitiativeCapabilities(level),
      navigationItems: ["business.collegium_initiatives"],
      issuedAt: "2026-10-05T00:00:00.000Z",
    },
    receivedAt: "2026-10-05T00:00:00.000Z",
  };
}

type Row = { kind: CollegiumReferenceKind; code: string; label: string; active: boolean; significant: boolean; unit: string; order: number };

function setup() {
  const rows: Row[] = [
    { kind: "risk_level", code: "low", label: "Низкий", active: true, significant: false, unit: "", order: 0 },
    { kind: "risk_level", code: "high", label: "Высокий", active: true, significant: true, unit: "", order: 1 },
  ];
  let settings: CollegiumSettings = {
    oneTimeCostThreshold: "", capexThreshold: "", paybackNormMonths: "", discountRatePercent: "",
    criticalImportance: [], revision: 1, updatedByDisplayName: "", updatedAt: "",
  };
  const reference = (): CollegiumReference => {
    const result: CollegiumReference = { direction: [], effect_type: [], risk_level: [], site: [], kpi: [] };
    for (const row of [...rows].sort((left, right) => left.order - right.order)) {
      result[row.kind].push({
        code: row.code,
        label: row.label,
        ...(row.active ? {} : { archived: true }),
        ...(row.kind === "risk_level" ? { significant: row.significant } : {}),
        ...(row.kind === "kpi" ? { unit: row.unit } : {}),
      });
    }
    return result;
  };
  const repository: CollegiumSettingsRepository = {
    async listReference() { return reference(); },
    async readSettings() { return settings; },
    async updateSettings(revision: number, next: CollegiumSettingsInput, displayName: string) {
      if (revision !== settings.revision) return false;
      settings = { ...next, revision: revision + 1, updatedByDisplayName: displayName, updatedAt: "2026-10-05T09:00:00.000Z" };
      return true;
    },
    async insertReference(kind, code, label, unit) {
      rows.push({ kind, code, label, active: true, significant: false, unit, order: rows.filter((row) => row.kind === kind).length });
    },
    async updateReference(kind, code, fields) {
      const row = rows.find((item) => item.kind === kind && item.code === code)!;
      Object.assign(row, { label: fields.label, unit: fields.unit, active: !fields.archived, significant: fields.significant });
    },
    async reorderReference(kind, codes) {
      for (const [index, code] of codes.entries()) rows.find((row) => row.kind === kind && row.code === code)!.order = index;
    },
  };
  const events: AuditEventDraft[] = [];
  const service = createCollegiumSettingsService({
    repository,
    transaction: { async run<T>(operation: () => Promise<T>) { return operation(); } },
    audit: { async record(event: AuditEventDraft) { events.push(event); }, async listReport() { throw new Error("not used"); } },
    now: () => new Date("2026-10-05T09:00:00.000Z"),
  });
  return { service, events, rows };
}

const denied = (status: number) => (error: unknown) => error instanceof CollegiumInitiativeError && error.status === status;

test("settings input is validated and normalized", () => {
  assert.deepEqual(readCollegiumSettingsInput({
    oneTimeCostThreshold: "1 500 000,5", capexThreshold: "", paybackNormMonths: "18,0",
    discountRatePercent: "12.50", criticalImportance: [" Высокая ", "высокая", "", "Критическая"],
  }), {
    oneTimeCostThreshold: "1500000.50", capexThreshold: "", paybackNormMonths: "18",
    discountRatePercent: "12.5", criticalImportance: ["Высокая", "Критическая"],
  });
  assert.throws(() => readCollegiumSettingsInput({ paybackNormMonths: "0" }), CollegiumInitiativeError);
  assert.throws(() => readCollegiumSettingsInput({ discountRatePercent: "150" }), CollegiumInitiativeError);
  assert.throws(() => readCollegiumSettingsInput({ oneTimeCostThreshold: "-5" }), CollegiumInitiativeError);
});

test("only the chair changes thresholds, with a revision check and an audit diff", async () => {
  const { service, events } = setup();
  const body = { revision: 1, settings: { paybackNormMonths: "24", criticalImportance: ["Высокая"] } };
  await assert.rejects(service.read(profile("p", "participant")), denied(403));
  assert.equal((await service.read(profile("s", "secretary"))).canEditSettings, false);
  await assert.rejects(service.updateSettings(profile("s", "secretary"), body), denied(403));

  const saved = await service.updateSettings(profile("c", "chair"), body);
  assert.equal(saved.revision, 2);
  assert.equal(saved.paybackNormMonths, "24");
  assert.deepEqual(events[0].details, [
    { label: "Норматив окупаемости, мес.", value: "не задано → 24" },
    { label: "Критичная «Важность» поручений", value: "не задано → Высокая" },
  ]);
  await assert.rejects(service.updateSettings(profile("c", "chair"), body), denied(409));
});

test("the secretary maintains reference values; codes stay and values are archived", async () => {
  const { service, events, rows } = setup();
  const secretary = profile("s", "secretary");
  const reference = await service.createReference(secretary, { kind: "kpi", label: "Потери при выпуске", unit: "%" });
  const kpi = reference.kpi[0];
  assert.equal(kpi.unit, "%");
  await assert.rejects(service.createReference(secretary, { kind: "kpi", label: "потери при выпуске" }), denied(409));
  await assert.rejects(service.createReference(secretary, { kind: "status", label: "Х" }), denied(400));

  const archived = await service.updateReference(secretary, "kpi", kpi.code, { archived: true, label: "Потери выпуска" });
  assert.deepEqual(archived.kpi[0], { code: kpi.code, label: "Потери выпуска", archived: true, unit: "%" });
  assert.equal(rows.length, 3);

  const moved = await service.updateReference(secretary, "risk_level", "high", { move: "up" });
  assert.deepEqual(moved.risk_level.map(({ code }) => code), ["high", "low"]);
  // Significance changes the passport rule, so it is the chair's call.
  await assert.rejects(service.updateReference(secretary, "risk_level", "low", { significant: true }), denied(403));
  const significant = await service.updateReference(profile("c", "chair"), "risk_level", "low", { significant: true });
  assert.equal(significant.risk_level.find(({ code }) => code === "low")?.significant, true);
  await assert.rejects(service.updateReference(secretary, "kpi", kpi.code, { significant: true }), denied(400));
  await assert.rejects(service.updateReference(secretary, "kpi", "missing", { label: "Х" }), denied(404));
  assert.deepEqual(events.map(({ action }) => action), [
    "collegium_reference.create",
    "collegium_reference.update",
    "collegium_reference.update",
    "collegium_reference.update",
  ]);
});
