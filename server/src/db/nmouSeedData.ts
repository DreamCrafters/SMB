import type { RowDataPacket } from "mysql2/promise";
import { isAccountNavigationItem } from "../domain/auth.js";
import { filterInstanceNavigation, type InstanceNavigation } from "../domain/instanceAccess.js";

/**
 * Задача 147: early migrations imported NMOU business data — board protocol №369 with its
 * document, product brands and raw materials — together with their audit events. Every new
 * deployment runs the same migrations, so another organization's instance would start with
 * NMOU data. These rows are recognised by the system authors of those imports only.
 */
export const nmouSeedAuthors = {
  boardProtocol: "system-protocol-import",
  productBrands: "system-google-sheets-brand-import",
  rawMaterials: "system-google-sheets-raw-material-import",
} as const;

const seedAuditActors = Object.values(nmouSeedAuthors);

/** Order matters: documents before their assignments; restrictive foreign keys guard used rows. */
const seedSections = [
  {
    key: "boardAssignmentDocuments",
    from: "board_assignment_documents",
    // A document someone attached later keeps its assignment, and the restrictive key then rolls back.
    where: "uploaded_by_user_id = ? and assignment_id in (select id from board_assignments where created_by_user_id = ?)",
    params: [nmouSeedAuthors.boardProtocol, nmouSeedAuthors.boardProtocol],
  },
  { key: "boardAssignments", from: "board_assignments", where: "created_by_user_id = ?", params: [nmouSeedAuthors.boardProtocol] },
  { key: "productBrands", from: "product_brands", where: "submitted_by_user_id = ?", params: [nmouSeedAuthors.productBrands] },
  { key: "rawMaterials", from: "laboratory_raw_material_nomenclature", where: "submitted_by_user_id = ?", params: [nmouSeedAuthors.rawMaterials] },
  { key: "auditEvents", from: "user_audit_events", where: `actor_user_id in (${seedAuditActors.map(() => "?").join(", ")})`, params: seedAuditActors },
] as const;

export type NmouSeedCounts = Record<(typeof seedSections)[number]["key"], number>;

type Queryable = { query: (sql: string, params?: unknown[]) => Promise<unknown> };
type CountRow = RowDataPacket & { total: number | string };

export class NmouSeedCleanupRefusedError extends Error {}

async function count(database: Queryable, sql: string, params: readonly unknown[] = []) {
  const [rows] = await database.query(sql, [...params]) as [CountRow[]];
  return Number(rows[0]?.total ?? 0);
}

export async function countNmouSeedData(database: Queryable): Promise<NmouSeedCounts> {
  const counts = {} as NmouSeedCounts;
  for (const section of seedSections) {
    counts[section.key] = await count(database, `select count(*) as total from ${section.from} where ${section.where}`, section.params);
  }
  return counts;
}

/**
 * Only a new instance qualifies: nobody but the root administrator may exist yet, so the
 * command refuses on NMOU, where these rows are real history. Callers run it in one
 * transaction; a seed row that gained history is protected by its restrictive foreign keys.
 * Journals refer to brands and raw materials by name; without accounts nobody has written them.
 */
export async function clearNmouSeedData(database: Queryable): Promise<NmouSeedCounts> {
  const otherAccounts = await count(database, "select count(*) as total from app_users where is_root_admin = 0 for update");
  if (otherAccounts > 0) {
    throw new NmouSeedCleanupRefusedError(
      "Очистка выполняется только на новом экземпляре до создания учётных записей, кроме корневого администратора.",
    );
  }
  const counts = await countNmouSeedData(database);
  for (const section of seedSections) {
    if (counts[section.key] > 0) await database.query(`delete from ${section.from} where ${section.where}`, [...section.params]);
  }
  return counts;
}

type PositionRow = RowDataPacket & {
  id: string;
  display_name: string;
  account_type: string;
  navigation_items: unknown;
  admin_navigation_items: unknown;
};

function readItems(value: unknown): string[] {
  const parsed: unknown = typeof value === "string" ? JSON.parse(value) : value;
  return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
}

/**
 * Positions the migrations create for NMOU (laboratory assistant, dispatcher, economist…) that
 * have no section left in this instance. Positions with administrative sections and the
 * system administrator stay; an unrestricted instance has no such positions at all.
 */
export async function listAbsentSeedPositions(database: Queryable, instance: InstanceNavigation) {
  if (instance === undefined) return [];
  const [rows] = await database.query(
    "select id, display_name, account_type, navigation_items, admin_navigation_items from account_positions order by sort_order, id",
  ) as [PositionRow[]];
  return rows
    // Administrative sections always pass the instance filter, so any of them keeps the position.
    .filter((row) => row.account_type !== "admin" && readItems(row.admin_navigation_items).length === 0 &&
      filterInstanceNavigation(instance, readItems(row.navigation_items).filter(isAccountNavigationItem)).length === 0)
    .map((row) => ({ id: row.id, displayName: row.display_name }));
}

/** Runs after the account guard of `clearNmouSeedData`, in the same transaction: no account holds these positions. */
export async function clearAbsentSeedPositions(database: Queryable, instance: InstanceNavigation) {
  const positions = await listAbsentSeedPositions(database, instance);
  for (const position of positions) {
    await database.query("delete from account_positions where id = ?", [position.id]);
  }
  return positions.map(({ displayName }) => displayName);
}

export function formatNmouSeedCounts(counts: NmouSeedCounts) {
  return `поручений СД ${counts.boardAssignments} (документов ${counts.boardAssignmentDocuments}), марок ${counts.productBrands}, `
    + `сырья ${counts.rawMaterials}, событий журнала импорта ${counts.auditEvents}`;
}
