import type {
  CollegiumEffectGroupMember,
  CollegiumEffectGroupRecord,
  CollegiumEffectGroupsRepository,
} from "../../repositories/collegiumEffectGroupsRepository.js";

/** Группы совместных эффектов в памяти, с уникальностью (инициатива, эффект). */
export function createCollegiumEffectGroupsMemory() {
  const groups = new Map<string, CollegiumEffectGroupRecord>();
  const members = new Map<string, CollegiumEffectGroupMember[]>();
  const repository: CollegiumEffectGroupsRepository = {
    async readGroup(id) {
      const group = groups.get(id);
      return group === undefined ? undefined : structuredClone(group);
    },
    async insertGroup(id) {
      groups.set(id, { id, revision: 1 });
      members.set(id, []);
    },
    async updateGroup(id, revision, fact) {
      const group = groups.get(id);
      if (group === undefined || group.revision !== revision) return false;
      groups.set(id, { id, revision: revision + 1, ...(fact === undefined ? {} : { fact: structuredClone(fact) }) });
      return true;
    },
    async deleteGroup(id) {
      groups.delete(id);
      members.delete(id);
    },
    async listMembers(groupId) {
      return structuredClone(members.get(groupId) ?? []);
    },
    async findGroupOf(initiativeId, effectId) {
      return [...members].find(([, list]) =>
        list.some((member) => member.initiativeId === initiativeId && member.effectId === effectId))?.[0];
    },
    async replaceMembers(groupId, list) {
      for (const member of list) {
        const other = [...members].find(([id, items]) => id !== groupId &&
          items.some((item) => item.initiativeId === member.initiativeId && item.effectId === member.effectId));
        if (other !== undefined) throw Object.assign(new Error("Duplicate entry"), { code: "ER_DUP_ENTRY" });
      }
      members.set(groupId, structuredClone([...list]));
    },
  };
  return { repository, groups, members };
}
