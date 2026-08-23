import type { RowDataPacket } from "mysql2/promise";
import type { DatabasePool } from "../db/pool.js";
import {
  defaultNavigationOrder,
  reconcileNavigationLabels,
  reconcileNavigationOrder,
  type NavigationLabels,
} from "../domain/navigationOrder.js";
import type { AccountNavigationItem } from "../domain/auth.js";

export type NavigationSettings = {
  navigationOrder: AccountNavigationItem[];
  navigationLabels: NavigationLabels;
};

export type NavigationOrderChange = {
  previous: NavigationSettings;
  updated: NavigationSettings;
};

export type NavigationOrderRepository = {
  read: () => Promise<NavigationSettings>;
  set: (settings: NavigationSettings) => Promise<NavigationOrderChange>;
};

type NavigationOrderRow = RowDataPacket & {
  navigation_order: unknown;
  navigation_labels: unknown;
};

const settingKey = "left_rail";

export function createNavigationOrderRepository(
  pool: DatabasePool,
): NavigationOrderRepository {
  async function readStoredSettings(forUpdate = false): Promise<NavigationSettings> {
    const [rows] = await pool.query<NavigationOrderRow[]>(`
      select navigation_order, navigation_labels
      from app_navigation_settings
      where setting_key = ?
      ${forUpdate ? "for update" : ""}
    `, [settingKey]);
    const row = rows[0];

    return row === undefined
      ? { navigationOrder: [...defaultNavigationOrder], navigationLabels: {} }
      : {
          navigationOrder: reconcileNavigationOrder(readJson(row.navigation_order)),
          navigationLabels: reconcileNavigationLabels(
            readJson(row.navigation_labels),
          ),
        };
  }

  return {
    read: () => readStoredSettings(),
    async set(settings) {
      const previous = await readStoredSettings(true);
      await pool.query(`
        insert into app_navigation_settings (
          setting_key, navigation_order, navigation_labels
        ) values (?, ?, ?)
        on duplicate key update
          navigation_order = values(navigation_order),
          navigation_labels = values(navigation_labels),
          updated_at = current_timestamp(3)
      `, [
        settingKey,
        JSON.stringify(settings.navigationOrder),
        JSON.stringify(settings.navigationLabels),
      ]);

      return {
        previous,
        updated: {
          navigationOrder: [...settings.navigationOrder],
          navigationLabels: { ...settings.navigationLabels },
        },
      };
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
