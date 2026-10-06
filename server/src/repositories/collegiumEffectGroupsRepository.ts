import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import type { DatabasePool } from "../db/pool.js";
import type { CollegiumEffectGroupFact } from "../contracts/collegiumInitiatives.js";

type GroupRow = RowDataPacket & {
  id: string;
  revision: number;
  fact: string | object | null;
};

type MemberRow = RowDataPacket & {
  group_id: string;
  initiative_id: string;
  effect_id: string;
  share_bp: number;
};

export type CollegiumEffectGroupRecord = {
  id: string;
  revision: number;
  fact?: CollegiumEffectGroupFact;
};

export type CollegiumEffectGroupMember = {
  initiativeId: string;
  effectId: string;
  shareBp: number;
};

function mapGroup(row: GroupRow): CollegiumEffectGroupRecord {
  const fact = row.fact === null ? undefined : typeof row.fact === "string" ? JSON.parse(row.fact) as CollegiumEffectGroupFact : row.fact as CollegiumEffectGroupFact;
  return { id: row.id, revision: Number(row.revision), ...(fact === undefined ? {} : { fact }) };
}

function mapMember(row: MemberRow): CollegiumEffectGroupMember {
  return { initiativeId: row.initiative_id, effectId: row.effect_id, shareBp: Number(row.share_bp) };
}

/**
 * Совместные эффекты (ТЗ 11.2). Порядок блокировок: строка группы → участники
 * (блокирующее чтение) → инициативы по id; операции над одной инициативой
 * группу не блокируют.
 */
export function createCollegiumEffectGroupsRepository(pool: DatabasePool) {
  return {
    async readGroup(id: string, lock = false) {
      const [rows] = await pool.query<GroupRow[]>(
        `select id, revision, fact from collegium_effect_groups where id = ?${lock ? " for update" : ""}`,
        [id],
      );
      return rows[0] === undefined ? undefined : mapGroup(rows[0]);
    },

    async insertGroup(id: string, displayName: string, at: Date) {
      await pool.query(
        `insert into collegium_effect_groups (id, revision, fact, updated_by_display_name, updated_at)
         values (?, 1, null, ?, ?)`,
        [id, displayName, at],
      );
    },

    /** Новая ревизия группы; `false` — ревизия уже сменилась. */
    async updateGroup(id: string, revision: number, fact: CollegiumEffectGroupFact | undefined, displayName: string, at: Date) {
      const [result] = await pool.query<ResultSetHeader>(
        `update collegium_effect_groups
         set revision = revision + 1, fact = ?, updated_by_display_name = ?, updated_at = ?
         where id = ? and revision = ?`,
        [fact === undefined ? null : JSON.stringify(fact), displayName, at, id, revision],
      );
      return result.affectedRows === 1;
    },

    async deleteGroup(id: string) {
      await pool.query(`delete from collegium_effect_group_members where group_id = ?`, [id]);
      await pool.query(`delete from collegium_effect_groups where id = ?`, [id]);
    },

    async listMembers(groupId: string, lock = false) {
      const [rows] = await pool.query<MemberRow[]>(
        `select group_id, initiative_id, effect_id, share_bp from collegium_effect_group_members
         where group_id = ? order by initiative_id, effect_id${lock ? " for update" : ""}`,
        [groupId],
      );
      return rows.map(mapMember);
    },

    async findGroupOf(initiativeId: string, effectId: string): Promise<string | undefined> {
      const [rows] = await pool.query<MemberRow[]>(
        `select group_id, initiative_id, effect_id, share_bp from collegium_effect_group_members
         where initiative_id = ? and effect_id = ? for update`,
        [initiativeId, effectId],
      );
      return rows[0]?.group_id;
    },

    async replaceMembers(groupId: string, members: readonly CollegiumEffectGroupMember[]) {
      await pool.query(`delete from collegium_effect_group_members where group_id = ?`, [groupId]);
      for (const member of members) {
        await pool.query(
          `insert into collegium_effect_group_members (group_id, initiative_id, effect_id, share_bp)
           values (?, ?, ?, ?)`,
          [groupId, member.initiativeId, member.effectId, member.shareBp],
        );
      }
    },
  };
}

export type CollegiumEffectGroupsRepository = ReturnType<typeof createCollegiumEffectGroupsRepository>;
