import assert from "node:assert/strict";
import test from "node:test";
import { clearAbsentSeedPositions, clearNmouSeedData, countNmouSeedData, formatNmouSeedCounts, listAbsentSeedPositions, NmouSeedCleanupRefusedError } from "./nmouSeedData.js";

function fakeDatabase({ otherAccounts = 0, seed = 11 } = {}) {
  const queries: Array<{ sql: string; params: unknown[] }> = [];
  return {
    queries,
    async query(sql: string, params: unknown[] = []) {
      const normalized = sql.replace(/\s+/gu, " ").trim();
      queries.push({ sql: normalized, params });
      if (normalized.startsWith("select count(*) as total from app_users")) return [[{ total: otherAccounts }], []];
      if (normalized.startsWith("select count(*)")) return [[{ total: String(seed) }], []];
      return [{ affectedRows: seed }, []];
    },
  };
}

test("a new instance loses exactly the NMOU rows imported by migrations (задача 147)", async () => {
  const database = fakeDatabase();
  const deleted = await clearNmouSeedData(database);
  assert.deepEqual(deleted, { boardAssignmentDocuments: 11, boardAssignments: 11, productBrands: 11, rawMaterials: 11, auditEvents: 11 });
  const deletes = database.queries.filter((query) => query.sql.startsWith("delete"));
  assert.deepEqual(deletes.map((query) => query.sql.split(" where ")[0]), [
    "delete from board_assignment_documents",
    "delete from board_assignments",
    "delete from product_brands",
    "delete from laboratory_raw_material_nomenclature",
    "delete from user_audit_events",
  ]);
  // Only the system authors of the migration imports are matched, never real users.
  assert.deepEqual(deletes.map((query) => query.params), [
    ["system-protocol-import", "system-protocol-import"],
    ["system-protocol-import"],
    ["system-google-sheets-brand-import"],
    ["system-google-sheets-raw-material-import"],
    ["system-protocol-import", "system-google-sheets-brand-import", "system-google-sheets-raw-material-import"],
  ]);
  assert.match(database.queries[0].sql, /is_root_admin = 0 for update$/u);
  assert.equal(formatNmouSeedCounts(deleted), "поручений СД 11 (документов 11), марок 11, сырья 11, событий журнала импорта 11");
});

test("the cleanup refuses an instance that already has accounts besides root, without deleting", async () => {
  const database = fakeDatabase({ otherAccounts: 60 });
  await assert.rejects(clearNmouSeedData(database), NmouSeedCleanupRefusedError);
  assert.equal(database.queries.some((query) => query.sql.startsWith("delete")), false);
});

test("an already clean instance deletes nothing", async () => {
  const database = fakeDatabase({ seed: 0 });
  assert.deepEqual(await clearNmouSeedData(database), { boardAssignmentDocuments: 0, boardAssignments: 0, productBrands: 0, rawMaterials: 0, auditEvents: 0 });
  assert.equal(database.queries.some((query) => query.sql.startsWith("delete")), false);
  assert.equal((await countNmouSeedData(database)).boardAssignments, 0);
});

test("positions that keep no section of the instance are removed with the seed data", async () => {
  const rows = [
    { id: "administrator", display_name: "Администратор", account_type: "admin", navigation_items: '["admin.accounts"]', admin_navigation_items: "[]" },
    { id: "laboratory_assistant", display_name: "Лаборант", account_type: "business_owner", navigation_items: '["business.laboratory_results"]', admin_navigation_items: "[]" },
    { id: "worker", display_name: "Работник", account_type: "worker", navigation_items: "[]", admin_navigation_items: "[]" },
    { id: "board_chair", display_name: "Председатель", account_type: "business_owner", navigation_items: '["business.overview","business.board_assignments"]', admin_navigation_items: "[]" },
    { id: "delegate", display_name: "Делегат", account_type: "business_owner", navigation_items: ["business.overview", "admin.accounts"], admin_navigation_items: ["admin.accounts"] },
    // An administrative section listed without the separate grant still keeps the position.
    { id: "legacy-admin", display_name: "Старый админ", account_type: "business_owner", navigation_items: ["business.overview", "admin.database"], admin_navigation_items: [] },
  ];
  const deleted: unknown[] = [];
  const database = { async query(sql: string, params: unknown[] = []) {
    if (sql.startsWith("select")) return [rows, []];
    deleted.push(params[0]);
    return [{}, []];
  } };
  const instance = ["business.board_assignments", "business.settings"] as const;
  assert.deepEqual((await listAbsentSeedPositions(database, instance)).map(({ id }) => id), ["laboratory_assistant", "worker"]);
  assert.deepEqual(await clearAbsentSeedPositions(database, instance), ["Лаборант", "Работник"]);
  assert.deepEqual(deleted, ["laboratory_assistant", "worker"]);
  // The unrestricted NMOU instance never loses a position.
  assert.deepEqual(await clearAbsentSeedPositions(database, undefined), []);
  assert.equal(deleted.length, 2);
});
