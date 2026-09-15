import assert from "node:assert/strict";
import test from "node:test";
import type { DatabasePool } from "../db/pool.js";
import { createDirectorAssignmentsRepository } from "./directorAssignmentsRepository.js";

test("assignment roster includes accounts without personnel and deduplicates explicit links and positions", async () => {
  const personnel = [
    { id: "person-a", fullName: "Одинаковое имя", position: "Инженер", active: true, userId: "a" },
    { id: "person-unlinked", fullName: "Одинаковое имя", position: "Сотрудник", active: true, userId: null },
  ];
  const userRows = [
    { user_id: "a", full_name: "Одинаковое имя", position_name: "Инженер" },
    { user_id: "b", full_name: "Второй сотрудник", position_name: "Экономист" },
    { user_id: "b", full_name: "Второй сотрудник", position_name: "Аналитик" },
  ];
  const calls: string[] = [];
  const pool = { async query(sql: string, parameters: string[] = []) {
    calls.push(sql);
    return [sql.includes("from personnel_employees")
      ? personnel.map(employee => ({ payload: JSON.stringify(employee) }))
      : userRows.filter(row => !parameters.length || row.user_id === parameters[0]), []];
  } } as unknown as DatabasePool;
  const repository = createDirectorAssignmentsRepository(pool);
  const roster = await repository.listAssignableEmployees();
  assert.equal(roster.length, 3);
  assert.equal(roster.filter(employee => employee.userId === "a").length, 1);
  assert.equal(roster.find(employee => employee.id === "account:b")?.position, "Экономист / Аналитик");
  assert.ok(roster.some(employee => employee.id === "person-unlinked"));
  assert.equal((await repository.readAssignableEmployee("account:b", true))?.userId, "b");
  assert.match(calls.at(-1)!, /for update/u);
  assert.equal(await repository.readAssignableEmployee("account:missing", true), undefined);
});
