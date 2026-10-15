import type { RowDataPacket } from "mysql2/promise";
import type { DatabasePool } from "../db/pool.js";
import { assignmentInboxNavigationItem } from "../contracts/directorAssignments.js";

export type AssignableAccount = {
  userId: string;
  fullName: string;
  /** Names of all current positions, joined with « / ». */
  position: string;
  /** The «Поручения» tab plus view and execute of the registry over the union of positions. */
  canReceive: boolean;
};

function jsonList(value: unknown): string[] {
  const parsed = typeof value === "string" ? JSON.parse(value) as unknown : value;
  return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
}

/**
 * Active organization accounts that may be named as responsible in an assignment
 * registry. `lock` must be used only inside a transaction that already holds the
 * assignment row: positions are scanned through json_contains.
 */
export async function readAssignableAccounts(
  pool: DatabasePool,
  registry: { viewCapability: string; executeCapability: string },
  { userId, lock = false }: { userId?: string; lock?: boolean } = {},
): Promise<AssignableAccount[]> {
  const [rows] = await pool.query<(RowDataPacket & { user_id: string; full_name: string; position_name: string; navigation_items?: unknown; capabilities?: unknown })[]>(`
    select users.id as user_id, users.display_name as full_name, positions.display_name as position_name,
      positions.navigation_items, positions.capabilities
    from app_users users
    join account_accesses accesses on accesses.user_id = users.id
    join account_positions positions on json_contains(coalesce(accesses.position_codes, json_array(accesses.position_code)), json_quote(positions.id))
    where users.status = 'active' and accesses.is_active = 1 and accesses.scope_kind = 'organization'
      ${userId === undefined ? "" : "and users.id = ?"}
    order by users.display_name, users.id, positions.sort_order, positions.id
    ${lock ? "for update" : ""}`, userId === undefined ? [] : [userId]);
  const accounts = new Map<string, AssignableAccount>();
  const access = new Map<string, Set<string>>();
  for (const row of rows) {
    const granted = access.get(row.user_id) ?? new Set<string>();
    for (const value of [...jsonList(row.navigation_items), ...jsonList(row.capabilities)]) granted.add(value);
    access.set(row.user_id, granted);
    const current = accounts.get(row.user_id);
    if (current) {
      if (!current.position.split(" / ").includes(row.position_name)) current.position += ` / ${row.position_name}`;
    } else accounts.set(row.user_id, { userId: row.user_id, fullName: row.full_name, position: row.position_name, canReceive: false });
  }
  // Same rule as the registry's canExecute over the union of the account's positions.
  for (const account of accounts.values()) {
    const granted = access.get(account.userId)!;
    account.canReceive = granted.has(assignmentInboxNavigationItem) && granted.has(registry.viewCapability) && granted.has(registry.executeCapability);
  }
  return [...accounts.values()];
}
