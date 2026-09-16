import type { BoardAssignment, BoardAssignmentsRepository } from "../repositories/boardAssignmentsRepository.js";
import assert from "node:assert/strict";
import test from "node:test";
import type { DirectorAssignment, DirectorAssignmentInput, PersonnelEmployee } from "../contracts/directorAssignments.js";
import type { DirectorAssignmentsRepository } from "../repositories/directorAssignmentsRepository.js";
import type { ServerUserProfile } from "./auth.js";
import { createDirectorAssignmentsService } from "./directorAssignmentsService.js";

function fixture() {
  let records = new Map<string, DirectorAssignment>();
  let completions: DirectorAssignment[] = [];
  let revisions: DirectorAssignment[] = [];
  let boardLocks = 0;
  const board = { id: "board-parent", summary: "Исходное поручение", details: "Полное содержание поручения", status: "in_progress", recurrence: "once", activeFrom: "2026-09-01", activeTo: "2026-09-01", currentOccurrenceDate: "2026-09-01" } as BoardAssignment;
  let auditFails = false;
  const employee: PersonnelEmployee = { id: "person", revision: 1, fullName: "Исполнитель", position: "Инженер", department: "", category: "ИТР", userId: "worker", active: true };
  const repository = {
    list: async () => structuredClone([...records.values()]),
    listByBoardAssignment: async (id: string) => structuredClone([...records.values()].filter(record => record.sourceBoardAssignmentId === id)),
    listBoardAssignmentRevisions: async (id: string) => structuredClone(revisions.filter(record => record.sourceBoardAssignmentId === id)),
    read: async (id: string) => structuredClone(records.get(id)),
    listEmployees: async () => [structuredClone(employee)],
    listAssignableEmployees: async () => [structuredClone(employee)],
    readAssignableEmployee: async () => structuredClone(employee),
    readEmployee: async () => structuredClone(employee),
    create: async (record: DirectorAssignment) => { record.number = "1"; records.set(record.id, structuredClone(record)); return structuredClone(record); },
    update: async (record: DirectorAssignment, previous: DirectorAssignment) => { revisions.push(structuredClone(previous)); records.set(record.id, structuredClone(record)); return structuredClone(record); },
    addCompletion: async (record: DirectorAssignment) => { completions.push(structuredClone(record)); },
    listCompletions: async () => completions.map((assignment, index) => ({ id: String(index), assignment: structuredClone(assignment) })),
  } as unknown as DirectorAssignmentsRepository;
  const service = createDirectorAssignmentsService({
    repository,
    boardAssignments: {
      readById: async (id: string) => id === board.id ? structuredClone(board) : undefined,
      readByIdForUpdate: async (id: string) => { boardLocks++; return id === board.id ? structuredClone(board) : undefined; },
    } as unknown as BoardAssignmentsRepository,
    now: () => new Date("2026-09-14T10:00:00Z"),
    transaction: { async run(operation) { const before = structuredClone(records); const oldCompletions = structuredClone(completions); const oldRevisions = structuredClone(revisions); try { return await operation(); } catch (error) { records = before; completions = oldCompletions; revisions = oldRevisions; throw error; } } },
    audit: { async record() { if (auditFails) throw new Error("audit unavailable"); }, async listReport() { throw new Error("unused"); } },
  });
  const profile = (userId: string, manager = false): ServerUserProfile => ({
    userId, displayName: userId, accountType: "business_owner", receivedAt: "2026-09-14T00:00:00Z",
    activeAccess: { accountId: userId, accountType: "business_owner", position: "worker", positionDisplayName: "Сотрудник", displayName: userId, scope: { kind: "organization" }, issuedAt: "2026-09-14T00:00:00Z", navigationItems: ["business.director_assignments"], capabilities: ["business.view_director_assignments", ...(manager ? ["business.manage_director_assignments" as const] : [])] },
  });
  const input: DirectorAssignmentInput = { assignedOn: "2026-09-01", kind: "Поручение", summary: "Представить отчёт", department: "", project: "", responsibleId: employee.id, coExecutorIds: [], recurrence: "monthly", activeFrom: "2026-09-01", activeTo: "2026-12-31", urgency: "", importance: "", note: "", progress: "", incomingNumber: "", sourceBoardAssignmentId: null };
  return { service, employee, profile, input, board, boardLocks: () => boardLocks, failAudit() { auditFails = true; } };
}

test("own assignment is visible only until submission; another employee cannot read or mutate it", async () => {
  const { service, profile, input } = fixture();
  const record = await service.save(profile("director", true), { assignment: input, comment: "Создано" });
  assert.equal((await service.list(profile("worker"))).assignments.length, 1);
  assert.equal((await service.list(profile("other"))).assignments.length, 0);
  await assert.rejects(service.read(profile("other"), record.id), /недоступно/u);
  await assert.rejects(service.action(profile("other"), record.id, { action: "submit_for_review", comment: "Готово", revision: 1 }), /недоступно/u);
  await service.action(profile("worker"), record.id, { action: "submit_for_review", comment: "Готово", revision: 1 });
  assert.equal((await service.list(profile("worker"))).assignments.length, 0);
  await assert.rejects(service.read(profile("worker"), record.id), /недоступно/u);
});

test("assignment directly addressed to an account survives linking that account to personnel", async () => {
  const { service, profile, input, employee } = fixture();
  employee.id = "account:worker";
  const record = await service.save(profile("sender", true), { assignment: { ...input, responsibleId: employee.id }, comment: "Создано" });
  employee.id = "new-personnel-entry";
  assert.equal((await service.list(profile("worker"))).assignments[0]?.id, record.id);
  assert.equal((await service.list(profile("other"))).assignments.length, 0);
  await service.action(profile("worker"), record.id, { action: "submit_for_review", revision: record.revision, comment: "Готово" });
});

test("account and personnel aliases of the same user cannot be responsible and co-executor", async () => {
  const { service, profile, input } = fixture();
  await assert.rejects(service.save(profile("sender", true), { assignment: { ...input, coExecutorIds: ["account:worker"] }, comment: "Создано" }), /дважды/u);
});

test("accepted period is immutable and editing the next period does not rewind the schedule", async () => {
  const { service, profile, input } = fixture();
  const manager = profile("director", true);
  const record = await service.save(manager, { assignment: input, comment: "Создано" });
  await service.action(profile("worker"), record.id, { action: "submit_for_review", comment: "Готово", revision: 1 });
  const accepted = await service.action(manager, record.id, { action: "complete", comment: "Принято", revision: 2 });
  assert.equal(accepted.currentOccurrenceDate, "2026-10-01");
  const updated = await service.save(manager, { assignment: { ...input, note: "Уточнение" }, comment: "Поправка", revision: 3 }, record.id);
  assert.equal(updated.currentOccurrenceDate, "2026-10-01");
  const history = await service.completions(manager);
  assert.equal(history.length, 1);
  assert.equal(history[0].assignment.note, "");
  assert.equal(history[0].assignment.currentOccurrenceDate, "2026-09-01");
  assert.equal((await service.list(profile("worker"))).assignments.length, 0);
  await assert.rejects(service.action(manager, record.id, { action: "complete", comment: "Повтор", revision: 2 }), /изменено/u);
});

test("personnel relinking immediately revokes the former executor's access", async () => {
  const { service, profile, input, employee } = fixture();
  const record = await service.save(profile("director", true), { assignment: input, comment: "Создано" });
  employee.userId = "replacement";
  await assert.rejects(service.action(profile("worker"), record.id, { action: "submit_for_review", comment: "Готово", revision: 1 }), /недоступно/u);
  assert.equal((await service.list(profile("replacement"))).assignments.length, 1);
});

test("audit failure rolls back the assignment and completion changes", async () => {
  const { service, profile, input, failAudit } = fixture();
  const manager = profile("director", true);
  const record = await service.save(manager, { assignment: input, comment: "Создано" });
  await service.action(profile("worker"), record.id, { action: "submit_for_review", comment: "Готово", revision: 1 });
  failAudit();
  await assert.rejects(service.action(manager, record.id, { action: "complete", comment: "Принято", revision: 2 }), /audit/u);
  assert.equal((await service.read(manager, record.id)).status, "under_review");
  assert.equal((await service.completions(manager)).length, 0);
});

test("multiple delegations retain independent execution histories under one board assignment", async () => {
  const { service, profile, input, board, boardLocks } = fixture();
  const sender = profile("sender", true);
  sender.activeAccess.capabilities.push("business.view_board_assignments", "business.execute_board_assignments");
  const childInput = { ...input, recurrence: "once", activeTo: input.activeFrom, sourceBoardAssignmentId: board.id };
  const first = await service.save(sender, { assignment: { ...childInput, summary: "Отредактированное содержание" }, comment: "Назначено первое" });
  const second = await service.save(sender, { assignment: childInput, comment: "Назначено второе" });
  assert.notEqual(first.id, second.id);
  assert.equal(boardLocks(), 2);
  await service.action(profile("worker"), first.id, { action: "submit_for_review", revision: 1, comment: "Готово" });
  await service.action(sender, first.id, { action: "return_for_revision", revision: 2, comment: "Дополнить" });
  await service.action(profile("worker"), first.id, { action: "submit_for_review", revision: 3, comment: "Исправлено" });
  await service.action(sender, first.id, { action: "complete", revision: 4, comment: "Принято" });
  const observer = profile("board-viewer");
  observer.activeAccess.capabilities = ["business.view_board_assignments"];
  const history = await service.delegations(observer, board.id);
  assert.equal(history.canAssign, false);
  assert.deepEqual(history.employees, []);
  assert.equal(history.assignments.length, 2);
  assert.deepEqual(history.assignments.find(row => row.id === first.id)?.comments.map(comment => comment.status), ["in_progress", "under_review", "revision_requested", "under_review", "completed"]);
  assert.equal(history.assignments.find(row => row.id === second.id)?.status, "in_progress");
  assert.equal(board.status, "in_progress");
  assert.equal(board.details, "Полное содержание поручения");
});

test("delegation history respects source visibility and the original link cannot be changed", async () => {
  const { service, profile, input, board } = fixture();
  const sender = profile("sender", true);
  sender.activeAccess.capabilities.push("business.view_board_assignments", "business.execute_board_assignments");
  const assignment = { ...input, sourceBoardAssignmentId: board.id };
  const child = await service.save(sender, { assignment, comment: "Назначено" });
  await assert.rejects(service.delegations(profile("worker"), board.id), /прав/u);
  await assert.rejects(service.delegations(sender, "unknown"), /недоступно/u);
  await assert.rejects(service.save(sender, { assignment: { ...assignment, sourceBoardAssignmentId: null }, revision: 1, comment: "Удалить связь" }, child.id), /Нельзя изменить/u);
  board.status = "under_review";
  await assert.rejects(service.delegations(sender, board.id), /недоступно/u);
  await assert.rejects(service.save(sender, { assignment, comment: "Ещё одно" }), /недоступно/u);
  // An existing child's work remains independent after the parent leaves the executor's queue.
  await service.save(sender, { assignment: { ...assignment, note: "Уточнение" }, revision: 1, comment: "Уточнено" }, child.id);
  board.status = "completed";
  sender.activeAccess.capabilities = sender.activeAccess.capabilities.filter(capability => capability !== "business.execute_board_assignments");
  assert.equal((await service.delegations(sender, board.id)).canAssign, false);
  await assert.rejects(service.save(sender, { assignment, comment: "Новое" }), /Завершённое/u);
});

test("delegation history preserves the responsible name at the time of assignment", async () => {
  const { service, profile, input, board, employee } = fixture();
  const sender = profile("sender", true);
  sender.activeAccess.capabilities.push("business.view_board_assignments");
  const assignment = { ...input, sourceBoardAssignmentId: board.id };
  const child = await service.save(sender, { assignment, comment: "Назначено" });
  employee.fullName = "Новое имя сотрудника";
  await service.save(sender, { assignment, revision: 1, comment: "Уточнены сведения" }, child.id);
  const history = await service.delegations(sender, board.id);
  assert.deepEqual(history.assignments[0].comments.map(comment => comment.responsibleDisplayName), ["Исполнитель", "Новое имя сотрудника"]);
});
