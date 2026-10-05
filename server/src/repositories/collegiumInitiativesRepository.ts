import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import type { DatabasePool } from "../db/pool.js";
import {
  collegiumInitiativesNavigationItem,
  collegiumReferenceKinds,
  type CollegiumInitiative,
  type CollegiumInitiativeRevision,
  type CollegiumPerson,
  type CollegiumReference,
  type CollegiumReferenceKind,
} from "../contracts/collegiumInitiatives.js";
import { CollegiumInitiativeError } from "../domain/collegiumInitiative.js";

type InitiativeRow = RowDataPacket & {
  id: string;
  number: string;
  status: CollegiumInitiative["status"];
  revision: number;
  created_by_user_id: string;
  payload: string | object;
  created_at: Date | string;
  updated_at: Date | string;
};

type RevisionRow = RowDataPacket & {
  revision: number;
  payload: string | object;
  created_at: Date | string;
};

type ReferenceRow = RowDataPacket & {
  kind: CollegiumReferenceKind;
  code: string;
  label: string;
};

type PersonRow = RowDataPacket & {
  user_id: string;
  display_name: string;
  position_name: string;
  navigation_items: unknown;
};

type SequenceRow = RowDataPacket & { last_value: number };

export type CollegiumNumberKind = "initiative" | "meeting";

export type CollegiumInitiativeRevisionInput = Omit<
  CollegiumInitiativeRevision,
  "createdAt"
> & { id: string; createdAt: Date };

/** Mutations must run inside the application's audited transaction. */
export function createCollegiumInitiativesRepository(pool: DatabasePool) {
  async function people(userId?: string, lock = false): Promise<CollegiumPerson[]> {
    const [rows] = await pool.query<PersonRow[]>(`
      select users.id as user_id, users.display_name, positions.display_name as position_name,
        positions.navigation_items
      from app_users users
      join account_accesses accesses on accesses.user_id = users.id
      join account_positions positions on json_contains(
        coalesce(accesses.position_codes, json_array(accesses.position_code)),
        json_quote(positions.id)
      )
      where users.status = 'active' and accesses.is_active = 1
        and accesses.scope_kind = 'organization'
        ${userId === undefined ? "" : "and users.id = ?"}
      order by users.display_name, users.id, positions.sort_order, positions.id
      ${lock ? "for update" : ""}`, userId === undefined ? [] : [userId]);
    const byUser = new Map<string, CollegiumPerson>();
    for (const row of rows) {
      const hasTab = readJsonList(row.navigation_items)
        .includes(collegiumInitiativesNavigationItem);
      const current = byUser.get(row.user_id);
      if (current === undefined) {
        byUser.set(row.user_id, {
          id: `account:${row.user_id}`,
          displayName: row.display_name,
          position: row.position_name,
          hasInitiativesTab: hasTab,
        });
        continue;
      }
      if (!current.position.split(" / ").includes(row.position_name)) {
        current.position += ` / ${row.position_name}`;
      }
      current.hasInitiativesTab ||= hasTab;
    }
    return [...byUser.values()];
  }

  return {
    async listReference(): Promise<CollegiumReference> {
      const [rows] = await pool.query<ReferenceRow[]>(
        `select kind, code, label from collegium_initiative_reference
         where is_active = 1 order by kind, sort_order, code`,
      );
      const reference = Object.fromEntries(
        collegiumReferenceKinds.map((kind) => [kind, []]),
      ) as unknown as CollegiumReference;
      for (const row of rows) {
        reference[row.kind]?.push({ code: row.code, label: row.label });
      }
      return reference;
    },

    listPeople() {
      return people();
    },

    /** Active account with its current positions; `lock` keeps it during the write. */
    async readPerson(accountId: string, lock = false) {
      if (!accountId.startsWith("account:")) return undefined;
      return (await people(accountId.slice("account:".length), lock))[0];
    },

    /** Year counter of a number series; runs in the caller's transaction. */
    async nextNumber(kind: CollegiumNumberKind, year: number) {
      await pool.query(
        `insert ignore into collegium_number_sequences (kind, year, last_value)
         values (?, ?, 0)`,
        [kind, year],
      );
      const [rows] = await pool.query<SequenceRow[]>(
        `select last_value from collegium_number_sequences
         where kind = ? and year = ? for update`,
        [kind, year],
      );
      const next = Number(rows[0]?.last_value ?? 0) + 1;
      await pool.query(
        `update collegium_number_sequences set last_value = ?
         where kind = ? and year = ?`,
        [next, kind, year],
      );
      return next;
    },

    async list(): Promise<CollegiumInitiative[]> {
      const [rows] = await pool.query<InitiativeRow[]>(
        `select id, number, status, revision, created_by_user_id, payload,
          created_at, updated_at
         from collegium_initiatives
         order by created_at desc, sequence_id desc`,
      );
      return rows.map(mapInitiative);
    },

    async read(id: string, lock = false) {
      const [rows] = await pool.query<InitiativeRow[]>(
        `select id, number, status, revision, created_by_user_id, payload,
          created_at, updated_at
         from collegium_initiatives where id = ? ${lock ? "for update" : ""}`,
        [id],
      );
      return rows[0] === undefined ? undefined : mapInitiative(rows[0]);
    },

    async insert(initiative: CollegiumInitiative) {
      await pool.query(
        `insert into collegium_initiatives
          (id, number, status, revision, created_by_user_id, payload, created_at, updated_at)
         values (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          initiative.id,
          initiative.number,
          initiative.status,
          initiative.revision,
          initiative.createdByUserId,
          JSON.stringify(initiative.card),
          new Date(initiative.createdAt),
          new Date(initiative.updatedAt),
        ],
      );
    },

    /** Optimistic lock: the stored revision must be the one the client edited. */
    async update(initiative: CollegiumInitiative, expectedRevision: number) {
      const [result] = await pool.query<ResultSetHeader>(
        `update collegium_initiatives
         set status = ?, revision = ?, payload = ?, updated_at = ?
         where id = ? and revision = ?`,
        [
          initiative.status,
          initiative.revision,
          JSON.stringify(initiative.card),
          new Date(initiative.updatedAt),
          initiative.id,
          expectedRevision,
        ],
      );
      if (result.affectedRows !== 1) {
        throw new CollegiumInitiativeError(
          "Инициатива уже изменена. Обновите карточку.",
          409,
        );
      }
    },

    async insertRevision(initiativeId: string, revision: CollegiumInitiativeRevisionInput) {
      const { id, createdAt, ...payload } = revision;
      await pool.query(
        `insert into collegium_initiative_revisions
          (id, initiative_id, revision, payload, created_at)
         values (?, ?, ?, ?, ?)`,
        [id, initiativeId, revision.revision, JSON.stringify(payload), createdAt],
      );
    },

    async listRevisions(initiativeId: string): Promise<CollegiumInitiativeRevision[]> {
      const [rows] = await pool.query<RevisionRow[]>(
        `select revision, payload, created_at from collegium_initiative_revisions
         where initiative_id = ? order by revision desc`,
        [initiativeId],
      );
      return rows.map((row) => ({
        ...readJson<Omit<CollegiumInitiativeRevision, "createdAt">>(row.payload),
        revision: Number(row.revision),
        createdAt: toIsoString(row.created_at),
      }));
    },
  };
}

export type CollegiumInitiativesRepository = ReturnType<
  typeof createCollegiumInitiativesRepository
>;

function mapInitiative(row: InitiativeRow): CollegiumInitiative {
  return {
    id: row.id,
    number: row.number,
    status: row.status,
    revision: Number(row.revision),
    card: readJson(row.payload),
    createdByUserId: row.created_by_user_id,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}

function readJson<T>(value: string | object): T {
  return (typeof value === "string" ? JSON.parse(value) : value) as T;
}

function readJsonList(value: unknown): string[] {
  const parsed = typeof value === "string" ? JSON.parse(value) as unknown : value;
  return Array.isArray(parsed)
    ? parsed.filter((item): item is string => typeof item === "string")
    : [];
}

function toIsoString(value: Date | string) {
  return (value instanceof Date ? value : new Date(value)).toISOString();
}
