import type { RowDataPacket } from "mysql2/promise";

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

export function formatNmouSeedCounts(counts: NmouSeedCounts) {
  return `поручений СД ${counts.boardAssignments} (документов ${counts.boardAssignmentDocuments}), марок ${counts.productBrands}, `
    + `сырья ${counts.rawMaterials}, событий журнала импорта ${counts.auditEvents}`;
}
