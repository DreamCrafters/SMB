import { isAdminDatabaseLayoutColumn } from "./adminDatabaseRepository.js";
import type { RowDataPacket } from "mysql2/promise";
import type { DatabasePool } from "../db/pool.js";
import { isTableId, reconcileTableWidths, type TableLayout } from "../contracts/tableLayouts.js";

export class TableLayoutConflictError extends Error {
  constructor() {
    super("Другой администратор изменил ширины. Загрузите актуальные настройки и повторите изменение.");
    this.name = "TableLayoutConflictError";
  }
}
export type TableLayoutsRepository = {
  read: () => Promise<TableLayout[]>;
  /** Must run inside the same database transaction as the audit write. */
  set: (layout: TableLayout) => Promise<{ previous: TableLayout; updated: TableLayout }>;
};
type LayoutRow = RowDataPacket & { table_id: string; revision: number; widths: unknown };

export function createTableLayoutsRepository(pool: DatabasePool): TableLayoutsRepository {
  return {
    async read() {
      const [rows] = await pool.query<LayoutRow[]>("select table_id, revision, widths from app_table_layouts");
      return rows.flatMap((row) => {
        const layout = readLayout(row);
        return layout === undefined ? [] : [layout];
      });
    },
    async set(layout) {
      // Seed the lockable row even for two concurrent first-time editors.
      await pool.query(`insert into app_table_layouts (table_id, revision, widths)
        values (?, 0, '{}') on duplicate key update table_id = values(table_id)`, [layout.tableId]);
      const [rows] = await pool.query<LayoutRow[]>(`select table_id, revision, widths
        from app_table_layouts where table_id = ? for update`, [layout.tableId]);
      const previous = rows[0] === undefined ? undefined : readLayout(rows[0]);
      if (previous === undefined || previous.revision !== layout.revision) throw new TableLayoutConflictError();
      const updated = { ...layout, revision: previous.revision + 1 };
      await pool.query(`update app_table_layouts set widths = ?, revision = ?,
        updated_at = current_timestamp(3) where table_id = ?`,
      [JSON.stringify(updated.widths), updated.revision, updated.tableId]);
      return { previous, updated };
    },
  };
}
function readLayout(row: LayoutRow): TableLayout | undefined {
  if (!isTableId(row.table_id)) return undefined;
  let widths = row.widths;
  if (typeof widths === "string") {
    try { widths = JSON.parse(widths) as unknown; } catch { widths = {}; }
  }
  const knownWidths = reconcileTableWidths(row.table_id, widths);
  return { tableId: row.table_id, revision: Number(row.revision), widths: row.table_id === "admin.database"
    ? Object.fromEntries(Object.entries(knownWidths).filter(([id]) => isAdminDatabaseLayoutColumn(id)))
    : knownWidths };

}
