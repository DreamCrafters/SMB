import assert from "node:assert/strict";
import test from "node:test";
import type { DatabasePool } from "../db/pool.js";
import { createDirectorAssignmentsRepository } from "./directorAssignmentsRepository.js";

test("assignment roster contains only real accounts and deduplicates positions", async () => {
  const personnel = [
    { id: "person-a", fullName: "Одинаковое имя", position: "Инженер", active: true, userId: "a" },
    { id: "person-unlinked", fullName: "Одинаковое имя", position: "Сотрудник", active: true, userId: null },
  ];
  const userRows = [
    { user_id: "a", full_name: "Одинаковое имя", position_name: "Инженер", navigation_items: '["business.director_assignments"]', capabilities: '["business.view_director_assignments"]' },
    { user_id: "b", full_name: "Второй сотрудник", position_name: "Экономист", navigation_items: ["business.director_assignments"], capabilities: ["business.view_director_assignments", "business.manage_director_assignments"] },
    { user_id: "b", full_name: "Второй сотрудник", position_name: "Аналитик", navigation_items: [], capabilities: [] },
  ];
  const calls: string[] = [];
  const pool = { async query(sql: string, parameters: string[] = []) {
    calls.push(sql);
    return [sql.includes("from personnel_employees")
      ? personnel.filter(employee => !parameters.length || employee.id === parameters[0]).map(employee => ({ payload: JSON.stringify(employee) }))
      : userRows.filter(row => !parameters.length || row.user_id === parameters[0]), []];
  } } as unknown as DatabasePool;
  const repository = createDirectorAssignmentsRepository(pool, "director");
  const roster = await repository.listAssignableEmployees();
  // A send-only controller cannot execute, so it is not a valid responsible account.
  assert.deepEqual(roster.map(employee => [employee.userId, employee.canReceive]), [["a", true], ["b", false]]);
  assert.equal(roster.length, 2);
  assert.equal(roster.filter(employee => employee.userId === "a").length, 1);
  assert.equal(roster.find(employee => employee.id === "account:b")?.position, "Экономист / Аналитик");
  assert.ok(roster.every(employee => employee.id.startsWith("account:")));
  assert.ok(!calls.some(sql => sql.includes("from personnel_employees")));
  assert.equal((await repository.readAssignableEmployee("account:b", true))?.userId, "b");
  assert.match(calls.at(-1)!, /for update/u);
  assert.equal(await repository.readAssignableEmployee("account:missing", true), undefined);
  assert.equal(await repository.readAssignableEmployee("person-unlinked", true), undefined);
  assert.equal((await repository.readAssignableEmployee("person-a", true))?.id, "account:a");
  userRows.splice(0, 1);
  assert.equal(await repository.readAssignableEmployee("person-a", true), undefined);
});

test("reminder delivery claim uses an atomic expiring lease and completion checks its owner", async () => {
  const calls: Array<{ sql: string; parameters: unknown[] }> = [];
  let affectedRows = 1;
  const repository = createDirectorAssignmentsRepository({ async query(sql: string, parameters: unknown[]) {
    calls.push({ sql, parameters }); return [{ affectedRows }, []];
  } } as unknown as DatabasePool, "director");
  const delivery = { assignmentId: "assignment", occurrenceDate: "2026-09-30", daysBefore: 3, userId: "worker", channel: "email" as const };
  assert.equal(await repository.claimReminder(delivery, "token-1"), true);
  assert.match(calls[0].sql, /insert ignore/u);
  assert.match(calls[1].sql, /delivered_at is null and \(lease_until is null or lease_until <= utc_timestamp\(3\)\)/u);
  assert.deepEqual(calls[1].parameters, ["token-1", 900, "assignment", "2026-09-30", 3, "worker", "email"]);
  affectedRows = 0;
  assert.equal(await repository.claimReminder(delivery, "token-2"), false);
  await repository.completeReminder(delivery, "token-1");
  assert.match(calls.at(-1)!.sql, /and channel = \? and claim_token = \?/u);
  assert.deepEqual(calls.at(-1)!.parameters, ["assignment", "2026-09-30", 3, "worker", "email", "token-1"]);
});

for (const status of ["completed", "in_progress", "under_review", "revision_requested"]) {
  test(`stored ${status} assignments expose consistent clarification across all readers`, async () => {
    const stored = { id: "legacy", status, needsClarification: true, source: { values: ["Original source"] } };
    for (const value of [stored, JSON.stringify(stored)]) {
      const repository = createDirectorAssignmentsRepository({ async query() {
        return [[{ id: "snapshot", payload: value }], []];
      } } as unknown as DatabasePool, "director");
      const results = [
        ...(await repository.list()),
        (await repository.read("legacy"))!,
        ...(await repository.listByBoardAssignment("board")),
        ...(await repository.listBoardAssignmentRevisions("board")),
        ...(await repository.listCompletions()).map(item => item.assignment),
      ];
      for (const assignment of results) {
        assert.equal(assignment.needsClarification, status !== "completed");
        assert.deepEqual(assignment.source, stored.source);
      }
      assert.equal(stored.needsClarification, true, "immutable stored history is not rewritten");
    }
  });
}

test("collegium repository touches only collegium tables and numbers records with its own prefix", async () => {
  const calls: Array<{ sql: string; parameters: unknown[] }> = [];
  const repository = createDirectorAssignmentsRepository({ async query(sql: string, parameters: unknown[] = []) {
    calls.push({ sql, parameters });
    return [sql.startsWith("insert into collegium_assignments") ? { insertId: 7, affectedRows: 1 } : sql.startsWith("update") ? { affectedRows: 1 } : [], []];
  } } as unknown as DatabasePool, "collegium");
  const assignment = { id: "c-1", number: "", revision: 1, assignedOn: "2026-09-01", source: null } as unknown as Parameters<typeof repository.create>[0];
  await repository.create(assignment);
  assert.equal(assignment.number, "К-7");
  await repository.update({ ...assignment, revision: 2 }, assignment);
  await repository.addCompletion(assignment);
  await repository.list();
  await repository.read("c-1");
  await repository.listCompletions();
  await repository.addDocument("c-1", "d-1", "file.pdf", Buffer.from("%PDF-"));
  await repository.readDocument("c-1", "d-1");
  await repository.claimReminder({ assignmentId: "c-1", occurrenceDate: "2026-09-30", daysBefore: 1, userId: "u", channel: "max" }, "t");
  await repository.listManagerUserIds();
  const sql = calls.map(call => call.sql).join("\n");
  assert.doesNotMatch(sql, /director_assignment/u);
  assert.match(sql, /collegium_assignment_history/u);
  assert.match(sql, /collegium_assignment_documents/u);
  assert.match(sql, /collegium_assignment_reminder_deliveries/u);
  assert.deepEqual(calls.at(-1)!.parameters, ["business.collegium_assignments", "business.manage_collegium_assignments"]);
});
