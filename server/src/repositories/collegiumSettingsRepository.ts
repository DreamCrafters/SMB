import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import type { DatabasePool } from "../db/pool.js";
import type {
  CollegiumReferenceKind,
  CollegiumSettings,
  CollegiumSettingsInput,
} from "../contracts/collegiumInitiatives.js";
import { readCollegiumReference } from "./collegiumInitiativesRepository.js";

type SettingsRow = RowDataPacket & {
  revision: number;
  payload: string | object;
  updated_by_display_name: string;
  updated_at: Date | string;
};

type OrderRow = RowDataPacket & { code: string; sort_order: number };

const emptySettings: CollegiumSettingsInput = {
  oneTimeCostThreshold: "",
  capexThreshold: "",
  paybackNormMonths: "",
  discountRatePercent: "",
  criticalImportance: [],
};

function readText(value: unknown) {
  return typeof value === "string" ? value : "";
}

/** Сохранённые настройки; неизвестные или повреждённые поля читаются как «не задано». */
export function readCollegiumSettingsPayload(payload: unknown): CollegiumSettingsInput {
  const source = typeof payload === "object" && payload !== null ? payload as Record<string, unknown> : {};
  return {
    oneTimeCostThreshold: readText(source.oneTimeCostThreshold),
    capexThreshold: readText(source.capexThreshold),
    paybackNormMonths: readText(source.paybackNormMonths),
    discountRatePercent: readText(source.discountRatePercent),
    criticalImportance: Array.isArray(source.criticalImportance)
      ? source.criticalImportance.filter((item): item is string => typeof item === "string")
      : emptySettings.criticalImportance,
  };
}

export function createCollegiumSettingsRepository(pool: DatabasePool) {
  return {
    listReference(lock = false) {
      return readCollegiumReference(pool, lock);
    },

    async readSettings(lock = false): Promise<CollegiumSettings> {
      const [rows] = await pool.query<SettingsRow[]>(
        `select revision, payload, updated_by_display_name, updated_at
         from collegium_initiative_settings where id = 1${lock ? " for update" : ""}`,
      );
      const row = rows[0];
      if (row === undefined) {
        return { ...emptySettings, revision: 0, updatedByDisplayName: "", updatedAt: "" };
      }
      const payload = typeof row.payload === "string" ? JSON.parse(row.payload) as unknown : row.payload;
      return {
        ...readCollegiumSettingsPayload(payload),
        revision: Number(row.revision),
        updatedByDisplayName: row.updated_by_display_name,
        updatedAt: new Date(row.updated_at).toISOString(),
      };
    },

    /** Оптимистичная блокировка: `false`, если ревизия уже сменилась. */
    async updateSettings(revision: number, settings: CollegiumSettingsInput, displayName: string, at: Date) {
      const [result] = await pool.query<ResultSetHeader>(
        `update collegium_initiative_settings
         set revision = revision + 1, payload = ?, updated_by_display_name = ?, updated_at = ?
         where id = 1 and revision = ?`,
        [JSON.stringify(settings), displayName, at, revision],
      );
      return result.affectedRows === 1;
    },

    async insertReference(kind: CollegiumReferenceKind, code: string, label: string, unit: string) {
      const [rows] = await pool.query<OrderRow[]>(
        `select code, sort_order from collegium_initiative_reference
         where kind = ? order by sort_order desc limit 1 for update`,
        [kind],
      );
      await pool.query(
        `insert into collegium_initiative_reference (kind, code, label, sort_order, unit)
         values (?, ?, ?, ?, ?)`,
        [kind, code, label, rows.length === 0 ? 0 : Number(rows[0].sort_order) + 1, unit],
      );
    },

    async updateReference(
      kind: CollegiumReferenceKind,
      code: string,
      fields: { label: string; unit: string; archived: boolean; significant: boolean },
    ) {
      await pool.query(
        `update collegium_initiative_reference
         set label = ?, unit = ?, is_active = ?, is_significant = ?
         where kind = ? and code = ?`,
        [fields.label, fields.unit, fields.archived ? 0 : 1, fields.significant ? 1 : 0, kind, code],
      );
    },

    /** Переставляет значения вида в заданном порядке кодов. */
    async reorderReference(kind: CollegiumReferenceKind, codes: readonly string[]) {
      for (const [index, code] of codes.entries()) {
        await pool.query(
          `update collegium_initiative_reference set sort_order = ? where kind = ? and code = ?`,
          [index, kind, code],
        );
      }
    },
  };
}

export type CollegiumSettingsRepository = ReturnType<typeof createCollegiumSettingsRepository>;
