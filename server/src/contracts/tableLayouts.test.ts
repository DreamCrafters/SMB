import assert from "node:assert/strict";
import test from "node:test";
import { validateTableLayout, reconcileTableWidths, tableDefinitions, isTableColumnId } from "./tableLayouts.js";

test("column widths are saved by identity even when an optional column disappears", () => {
  const result = validateTableLayout({ tableId: "warehouse.stock", revision: 0,
    widths: { nomenclature: 240, closingQuantity: 120 } });
  assert.equal(result.ok, true);
  assert.deepEqual(reconcileTableWidths("warehouse.stock", {
    nomenclature: 240, removed: 100, closingQuantity: -1,
  }), { nomenclature: 240 });
});

test("layout writes reject unknown tables, columns, CSS and unbounded values", () => {
  for (const patch of [
    { tableId: "unknown" }, { revision: -1 }, { revision: 0.5 },
    { widths: { wrong: 150 } }, { widths: { nomenclature: "100px" } },
    { widths: { nomenclature: 1 } }, { widths: { nomenclature: 10000 } },
    { widths: { nomenclature: 100.5 } }, { widths: [] },
    { widths: JSON.parse('{"__proto__": 100}') },
  ]) {
    assert.equal(validateTableLayout({ tableId: "warehouse.stock", revision: 0,
      widths: {}, ...patch }).ok, false, JSON.stringify(patch));
  }
});


test("table catalog has unique valid semantic columns", () => {
  for (const tableId of Object.keys(tableDefinitions) as Array<keyof typeof tableDefinitions>) {
    const columns: readonly string[] = tableDefinitions[tableId].columns;
    assert.equal(new Set(columns).size, columns.length, tableId);
    assert.ok(columns.every((column) => isTableColumnId(tableId, column)), tableId);
  }
});
