import type { RowDataPacket } from "mysql2/promise";
import type {
  RailwayEtsngOption,
  RailwaySecuringMethodOption,
  RailwayStationOption,
} from "../contracts/railwayWagons.js";
import type { DatabasePool } from "../db/pool.js";

/**
 * Справочник РЖД задачи 106: 11 676 станций и 4 704 кода ЕТСНГ. Список такого
 * размера в браузер не отдаётся — поля ищут по подстроке на сервере, а ответ
 * ограничен. Крепления (8 строк) отдаются целиком обычным списком.
 */
export type RailwayReferenceRepository = {
  searchStations: (query: string) => Promise<RailwayStationOption[]>;
  searchEtsngCodes: (query: string) => Promise<RailwayEtsngOption[]>;
  listSecuringMethods: () => Promise<RailwaySecuringMethodOption[]>;
  resolveStation: (name: string) => Promise<RailwayStationOption | undefined>;
  resolveEtsngCodes: (
    codes: readonly string[],
  ) => Promise<Map<string, RailwayEtsngOption>>;
  resolveSecuringMethods: (names: readonly string[]) => Promise<Set<string>>;
};

type StationRow = { name: string; road: string | null } & RowDataPacket;
type EtsngRow = { code: string; name: string } & RowDataPacket;
type SecuringRow = { name: string; description: string | null } & RowDataPacket;

export const railwayReferenceSearchLimit = 25;

export function createRailwayReferenceRepository(
  pool: DatabasePool,
): RailwayReferenceRepository {
  return {
    async searchStations(query) {
      const pattern = buildLikePattern(query);
      if (pattern === undefined) return [];

      const [rows] = await pool.query<StationRow[]>(
        `select name, road
        from railway_stations
        where name like ? escape '!'
        order by
          case when name like ? escape '!' then 0 else 1 end,
          name asc
        limit ${railwayReferenceSearchLimit}`,
        [`%${pattern}%`, `${pattern}%`],
      );

      return rows.map((row) => ({ name: row.name, road: row.road }));
    },

    /** Код ищется и по номеру, и по наименованию — так просит техзадание. */
    async searchEtsngCodes(query) {
      const pattern = buildLikePattern(query);
      if (pattern === undefined) return [];

      const [rows] = await pool.query<EtsngRow[]>(
        `select code, name
        from railway_etsng_codes
        where code like ? escape '!' or name like ? escape '!'
        order by
          case when code like ? escape '!' then 0 else 1 end,
          code asc
        limit ${railwayReferenceSearchLimit}`,
        [`%${pattern}%`, `%${pattern}%`, `${pattern}%`],
      );

      return rows.map((row) => ({ code: row.code, name: row.name }));
    },

    async listSecuringMethods() {
      const [rows] = await pool.query<SecuringRow[]>(
        `select name, description from railway_securing_methods order by sequence_id asc`,
      );

      return rows.map((row) => ({
        name: row.name,
        description: row.description,
      }));
    },

    async resolveStation(name) {
      const [rows] = await pool.query<StationRow[]>(
        `select name, road from railway_stations where name = ? limit 1`,
        [name],
      );
      const row = rows[0];

      return row === undefined
        ? undefined
        : { name: row.name, road: row.road };
    },

    async resolveEtsngCodes(codes) {
      const resolved = new Map<string, RailwayEtsngOption>();
      if (codes.length === 0) return resolved;

      const [rows] = await pool.query<EtsngRow[]>(
        `select code, name
        from railway_etsng_codes
        where code in (${codes.map(() => "?").join(", ")})`,
        [...codes],
      );

      for (const row of rows) {
        resolved.set(row.code, { code: row.code, name: row.name });
      }

      return resolved;
    },

    async resolveSecuringMethods(names) {
      const resolved = new Set<string>();
      if (names.length === 0) return resolved;

      const [rows] = await pool.query<SecuringRow[]>(
        `select name, description
        from railway_securing_methods
        where name in (${names.map(() => "?").join(", ")})`,
        [...names],
      );

      for (const row of rows) {
        resolved.add(row.name);
      }

      return resolved;
    },
  };
}

/** `%`, `_` и сам escape-символ из ввода не должны работать как шаблон. */
function buildLikePattern(query: string) {
  const normalized = query.trim().replace(/\s+/gu, " ");
  if (normalized.length === 0) return undefined;

  return normalized.replace(/[!%_]/gu, (character) => `!${character}`);
}
