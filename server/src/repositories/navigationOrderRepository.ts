import type { RowDataPacket } from "mysql2/promise";
import type { DatabasePool } from "../db/pool.js";
import {
  defaultNavigationOrder,
  reconcileNavigationOrder,
} from "../domain/navigationOrder.js";
import type { AccountNavigationItem } from "../domain/auth.js";

export type NavigationOrderChange = {
  previous: AccountNavigationItem[];
  updated: AccountNavigationItem[];
};

export type NavigationOrderRepository = {
  read: () => Promise<AccountNavigationItem[]>;
  set: (navigationOrder: AccountNavigationItem[]) => Promise<NavigationOrderChange>;
};

type NavigationOrderRow = RowDataPacket & {
  navigation_order: unknown;
};

const settingKey = "left_rail";

export function createNavigationOrderRepository(
  pool: DatabasePool,
): NavigationOrderRepository {
  async function readStoredOrder(forUpdate = false) {
    const [rows] = await pool.query<NavigationOrderRow[]>(`
      select navigation_order
      from app_navigation_settings
      where setting_key = ?
      ${forUpdate ? "for update" : ""}
    `, [settingKey]);

    return rows[0] === undefined
      ? [...defaultNavigationOrder]
      : reconcileNavigationOrder(readJson(rows[0].navigation_order));
  }

  return {
    read: () => readStoredOrder(),
    async set(navigationOrder) {
      const previous = await readStoredOrder(true);
      await pool.query(`
        insert into app_navigation_settings (
          setting_key, navigation_order
        ) values (?, ?)
        on duplicate key update
          navigation_order = values(navigation_order),
          updated_at = current_timestamp(3)
      `, [settingKey, JSON.stringify(navigationOrder)]);

      return { previous, updated: [...navigationOrder] };
    },
  };
}

function readJson(value: unknown) {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
}
