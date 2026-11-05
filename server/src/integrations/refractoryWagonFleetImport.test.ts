import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { parseCsvRows } from "./googleSheetsReference.js";
import {
  applyRefractoryWagonFleetImport,
  countRefractoryWagonFleetChanges,
  previewRefractoryWagonFleetImport,
  refractoryWagonFleetAsOfDate,
  type RefractoryWagonFleetEntry,
} from "./refractoryWagonFleetImport.js";

const header = ["Номер вагона", "Дата на борту", "Дата кап.", "Загрузка", "Исправен"];
const actor = { userId: "system-test", accountId: "system-test", displayName: "Перенос" };

function entry(overrides: Partial<RefractoryWagonFleetEntry> = {}): RefractoryWagonFleetEntry {
  return {
    number: "39",
    onBoardDate: null,
    capitalRepairPeriod: "02.10.2026",
    load: "ШБ 5б/к",
    asOfDate: "2026-10-28",
    serviceable: true,
    ...overrides,
  };
}

function fakeRepositories(states: Record<string, { asOfDate: string | null }>) {
  const calls = {
    created: [] as string[],
    saved: [] as Array<Record<string, unknown>>,
    inspections: [] as Array<Record<string, unknown>>,
  };
  return {
    calls,
    wagons: {
      async readFleetState(number: string) {
        return states[number];
      },
      async create(input: { wagon: { number: string } }) {
        calls.created.push(input.wagon.number);
        return {} as never;
      },
      async saveFleetRecord(record: { number: string }) {
        calls.saved.push(record);
        return `cycle-${record.number}`;
      },
    },
    inspections: {
      async create(input: Record<string, unknown>) {
        calls.inspections.push(input);
        return undefined;
      },
    },
  };
}

test("the wagon fleet source file is complete and valid", async () => {
  const csv = await readFile(
    new URL(`../../assets/refractory-wagon-fleet/${refractoryWagonFleetAsOfDate}.csv`, import.meta.url),
    "utf8",
  );
  const { entries, warnings } = previewRefractoryWagonFleetImport(
    parseCsvRows(csv),
    refractoryWagonFleetAsOfDate,
  );
  const byNumber = new Map(entries.map((wagon) => [wagon.number, wagon]));

  assert.deepEqual(warnings, []);
  assert.equal(entries.length, 125);
  assert.deepEqual(
    entries.filter((wagon) => !wagon.serviceable).map((wagon) => wagon.number),
    ["123", "52", "35", "50", "20", "42", "145", "72", "164", "148", "51", "228", "153", "49"],
  );
  // Правки ведомости: опечатка года и две строки одного номера.
  assert.equal(byNumber.get("124")?.capitalRepairPeriod, "05.10.2026");
  assert.deepEqual(byNumber.get("30"), entry({
    number: "30",
    onBoardDate: "2026-08-07",
    capitalRepairPeriod: "01.2025",
  }));
  assert.equal(byNumber.get("103")?.capitalRepairPeriod, null);
  assert.equal(byNumber.get("82")?.capitalRepairPeriod, "до 12.2024");
  assert.equal(byNumber.get("34А")?.load, "ШБ 8б/к");
  assert.ok(byNumber.has("188А"));
});

test("the wagon fleet preview maps empty cells and the serviceable flag", () => {
  const { entries, warnings } = previewRefractoryWagonFleetImport([
    header,
    ["5А", "", "", "", ""],
    ["52", "2026-08-07", "до 12.2024", "ШЦУ 1", "нет"],
    ["", "", "", "", ""],
  ], "2026-10-28");

  assert.deepEqual(warnings, []);
  assert.deepEqual(entries, [
    entry({ number: "5А", capitalRepairPeriod: null, load: null }),
    entry({
      number: "52",
      onBoardDate: "2026-08-07",
      capitalRepairPeriod: "до 12.2024",
      load: "ШЦУ 1",
      serviceable: false,
    }),
  ]);
});

test("the wagon fleet preview reports invalid rows instead of importing them", () => {
  const { entries, warnings } = previewRefractoryWagonFleetImport([
    header,
    ["5A", "", "", "", ""],
    ["6", "07.08.2026", "", "", ""],
    ["7", "", "мар.-25", "", ""],
    ["8", "", "", "", "да"],
    ["9", "", "", "x".repeat(121), ""],
    ["10", "", "", "", ""],
    ["10", "", "", "", ""],
  ], "2026-10-28");

  assert.deepEqual(entries.map((wagon) => wagon.number), ["10"]);
  assert.deepEqual(warnings, [
    { number: "5A", messages: ["Проверьте номер вагона."] },
    { number: "6", messages: ["Проверьте дату на борту."] },
    { number: "7", messages: ["Проверьте дату кап."] },
    { number: "8", messages: ["Проверьте поле «Исправен»."] },
    { number: "9", messages: ["Слишком длинная загрузка."] },
    { number: "10", messages: ["Номер встречается дважды."] },
  ]);
});

test("the wagon fleet preview refuses an unexpected table", () => {
  const { entries, warnings } = previewRefractoryWagonFleetImport(
    [["Номер", "Дата"], ["39", "2026-10-02"]],
    "2026-10-28",
  );

  assert.deepEqual(entries, []);
  assert.deepEqual(warnings, [{ number: "—", messages: ["Неожиданные колонки ведомости."] }]);
});

test("the wagon fleet import registers new numbers and fills existing ones", async () => {
  const { calls, wagons, inspections } = fakeRepositories({ "39": { asOfDate: null } });

  const result = await applyRefractoryWagonFleetImport({
    wagons: wagons as never,
    inspections: inspections as never,
    entries: [entry(), entry({ number: "61" })],
    actor,
  });

  assert.deepEqual(result, { created: 1, updated: 1, skipped: 0, underRepair: 0 });
  assert.deepEqual(calls.created, ["61"]);
  assert.deepEqual(calls.saved.map((record) => record.number), ["39", "61"]);
  assert.ok(calls.saved.every((record) => !("serviceable" in record)));
  assert.deepEqual(calls.inspections, []);
});

test("the wagon fleet import sends a broken wagon to repair through an inspection", async () => {
  const { calls, wagons, inspections } = fakeRepositories({});

  const result = await applyRefractoryWagonFleetImport({
    wagons: wagons as never,
    inspections: inspections as never,
    entries: [entry({ number: "123", load: null, serviceable: false })],
    actor,
  });

  assert.equal(result.underRepair, 1);
  assert.deepEqual(calls.inspections, [{
    inspection: { wagonId: "cycle-123", condition: "В ремонт", approvalDate: "2026-10-28" },
    inspectedByUserId: "system-test",
    inspectedByAccountId: "system-test",
    inspectedByDisplayName: "Перенос",
    fromFleetImport: true,
  }]);
});

test("a repeated wagon fleet import changes nothing, even for a wagon back from repair", async () => {
  const { calls, wagons, inspections } = fakeRepositories({
    "123": { asOfDate: "2026-10-28" },
  });
  const entries = [entry({ number: "123", serviceable: false })];

  const result = await applyRefractoryWagonFleetImport({
    wagons: wagons as never,
    inspections: inspections as never,
    entries,
    actor,
  });

  assert.deepEqual(result, { created: 0, updated: 0, skipped: 1, underRepair: 0 });
  assert.deepEqual(calls, { created: [], saved: [], inspections: [] });
});

test("the wagon fleet dry run only counts what the import would do", async () => {
  const { calls, wagons } = fakeRepositories({
    "39": { asOfDate: null },
    "61": { asOfDate: "2026-10-28" },
  });

  assert.deepEqual(
    await countRefractoryWagonFleetChanges(wagons, [
      entry(),
      entry({ number: "61" }),
      entry({ number: "78" }),
    ]),
    { created: 1, updated: 1, skipped: 1 },
  );
  assert.deepEqual(calls, { created: [], saved: [], inspections: [] });
});
