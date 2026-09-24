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
  const employee: PersonnelEmployee = { id: "account:worker", revision: 1, fullName: "Исполнитель", position: "Инженер", department: "", category: "ИТР", userId: "worker", active: true };
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
  return { service, employee, profile, input, board, boardLocks: () => boardLocks, markUnclear(id: string) { records.get(id)!.needsClarification = true; }, makeLegacy(id: string) { records.get(id)!.responsibleId = "person-legacy"; }, failAudit() { auditFails = true; } };
}

test("responsible executor can complete a one-time assignment directly with an immutable history entry", async () => {
  const { service, profile, input } = fixture();
  const manager = profile("director", true);
  const record = await service.save(manager, { assignment: { ...input, recurrence: "once", activeTo: input.activeFrom }, comment: "Создано" });
  const completed = await service.action(profile("worker"), record.id, { action: "complete", comment: "  Выполнено  ", revision: 1 });
  assert.equal(completed.status, "completed");
  assert.equal(completed.completedOn, "2026-09-14");
  assert.equal(completed.revision, 2);
  assert.deepEqual(completed.comments.at(-1), { id: completed.comments.at(-1)!.id, userId: "worker", author: "worker", text: "Выполнено", status: "completed", createdAt: "2026-09-14T10:00:00.000Z" });
  const snapshot = (await service.completions(manager))[0].assignment;
  assert.equal(snapshot.status, "completed");
  assert.equal(snapshot.completedOn, "2026-09-14");
  assert.deepEqual(snapshot.comments, completed.comments);
  assert.equal(snapshot.currentOccurrenceDate, "2026-09-01");
  assert.equal((await service.list(profile("worker"))).assignments.length, 0);
});

for (const actor of ["worker", "director", "assistant"]) {
  for (const initialStatus of ["in_progress", "revision_requested", "under_review"]) {
    if (actor === "worker" && initialStatus === "under_review") continue;
    test(`${actor} directly completes ${initialStatus} and advances a recurring assignment once`, async () => {
      const { service, profile, input } = fixture();
      const manager = profile("director", true);
      let record = await service.save(manager, { assignment: input, comment: "Создано" });
      if (initialStatus !== "in_progress") record = await service.action(profile("worker"), record.id, { action: "submit_for_review", comment: "Проверить", revision: record.revision });
      if (initialStatus === "revision_requested") record = await service.action(manager, record.id, { action: "return_for_revision", comment: "Исправить", revision: record.revision });
      const completed = await service.action(profile(actor, actor !== "worker"), record.id, { action: "complete", comment: "Готово", revision: record.revision });
      assert.equal(completed.status, "in_progress");
      assert.equal(completed.currentOccurrenceDate, "2026-10-01");
      assert.equal(completed.completedOn, "");
      assert.equal((await service.list(profile("worker"))).assignments.length, 1);
      assert.deepEqual((await service.list(profile("worker"))).executableAssignmentIds, []);
      const history = await service.completions(manager);
      assert.equal(history.length, 1);
      assert.equal(history[0].assignment.status, "completed");
      assert.equal(history[0].assignment.currentOccurrenceDate, "2026-09-01");
      assert.equal(history[0].assignment.comments.at(-1)?.userId, actor);
      await assert.rejects(service.action(manager, record.id, { action: "complete", comment: "Повтор", revision: record.revision }), /изменено/u);
      assert.equal((await service.completions(manager)).length, 1);
    });
  }
}

test("early manager completion advances past the completed occurrence without duplicating a period", async () => {
  const { service, profile, input } = fixture();
  const manager = profile("director", true);
  const record = await service.save(manager, { assignment: input, comment: "Создано" });
  const first = await service.action(manager, record.id, { action: "complete", comment: "Сентябрь готов", revision: 1 });
  assert.equal(first.currentOccurrenceDate, "2026-10-01");
  const early = await service.action(manager, record.id, { action: "complete", comment: "Октябрь готов досрочно", revision: first.revision });
  assert.equal(early.currentOccurrenceDate, "2026-11-01");
  const history = await service.completions(manager);
  assert.deepEqual(history.map(item => item.assignment.currentOccurrenceDate), ["2026-09-01", "2026-10-01"]);
  assert.deepEqual(history.map(item => item.assignment.completedOn), ["2026-09-14", "2026-09-14"]);
  const edited = await service.save(manager, { assignment: { ...input, activeTo: "2027-01-01" }, comment: "Продлить период", revision: early.revision }, record.id);
  assert.equal(edited.currentOccurrenceDate, "2026-11-01");
  assert.deepEqual(await service.completions(manager), history);
});

test("direct completion enforces visibility, active account links, comments and revision without partial writes", async () => {
  const { service, profile, input, employee } = fixture();
  const manager = profile("director", true);
  const record = await service.save(manager, { assignment: { ...input, recurrence: "once", activeTo: input.activeFrom }, comment: "Создано" });
  const action = { action: "complete", comment: "Готово", revision: 1 };
  await assert.rejects(service.action(profile("other"), record.id, action), /недоступно/u);
  const noAccess = profile("director", true);
  noAccess.activeAccess.capabilities = [];
  await assert.rejects(service.action(noAccess, record.id, action), /прав/u);
  for (const comment of ["", "  ", null, 42, "а".repeat(4001)]) await assert.rejects(service.action(profile("worker"), record.id, { ...action, comment }), /заполнение/u);
  await assert.rejects(service.action(manager, record.id, { ...action, revision: 0 }), /изменено/u);
  employee.active = false;
  await assert.rejects(service.action(profile("worker"), record.id, action), /недоступно/u);
  employee.active = true;
  assert.equal((await service.read(manager, record.id)).revision, 1);
  assert.equal((await service.completions(manager)).length, 0);
  const completed = await service.action(manager, record.id, action);
  await assert.rejects(service.action(manager, record.id, { ...action, revision: completed.revision }), /уже завершено/u);
  assert.equal((await service.completions(manager)).length, 1);
});

test("executor cannot directly complete a future assignment or one already submitted for review", async () => {
  const { service, profile, input } = fixture();
  const manager = profile("director", true);
  const future = await service.save(manager, { assignment: { ...input, activeFrom: "2026-10-01" }, comment: "Создано" });
  await assert.rejects(service.action(profile("worker"), future.id, { action: "complete", comment: "Готово", revision: 1 }), /недоступно/u);
  const record = await service.save(manager, { assignment: input, comment: "Создано" });
  await service.action(profile("worker"), record.id, { action: "submit_for_review", comment: "Проверить", revision: 1 });
  await assert.rejects(service.action(profile("worker"), record.id, { action: "complete", comment: "Готово", revision: 2 }), /недоступно/u);
  assert.equal((await service.completions(manager)).length, 0);
});

test("direct completion rolls back both current assignment and snapshot when audit fails", async () => {
  const { service, profile, input, failAudit } = fixture();
  const manager = profile("director", true);
  const record = await service.save(manager, { assignment: input, comment: "Создано" });
  failAudit();
  await assert.rejects(service.action(profile("worker"), record.id, { action: "complete", comment: "Готово", revision: 1 }), /audit/u);
  assert.equal((await service.read(manager, record.id)).revision, 1);
  assert.equal((await service.read(manager, record.id)).status, "in_progress");
  assert.equal((await service.completions(manager)).length, 0);
});

test("own assignment remains visible after submission; another employee cannot read or mutate it", async () => {
  const { service, profile, input } = fixture();
  const record = await service.save(profile("director", true), { assignment: input, comment: "Создано" });
  assert.equal((await service.list(profile("worker"))).assignments.length, 1);
  assert.equal((await service.list(profile("other"))).assignments.length, 0);
  await assert.rejects(service.read(profile("other"), record.id), /недоступно/u);
  await assert.rejects(service.action(profile("other"), record.id, { action: "submit_for_review", comment: "Готово", revision: 1 }), /недоступно/u);
  await service.action(profile("worker"), record.id, { action: "submit_for_review", comment: "Готово", revision: 1 });
  assert.equal((await service.list(profile("worker"))).assignments.length, 1);
  assert.equal((await service.read(profile("worker"), record.id)).status, "under_review");
  assert.deepEqual((await service.list(profile("worker"))).executableAssignmentIds, []);
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

test("the responsible account cannot also be a co-executor", async () => {
  const { service, profile, input } = fixture();
  await assert.rejects(service.save(profile("sender", true), { assignment: { ...input, coExecutorIds: ["account:worker"] }, comment: "Создано" }), /уже участвует/u);
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
  assert.equal((await service.list(profile("worker"))).assignments.length, 1);
  assert.deepEqual((await service.list(profile("worker"))).executableAssignmentIds, []);
  await assert.rejects(service.action(manager, record.id, { action: "complete", comment: "Повтор", revision: 2 }), /изменено/u);
});

test("personnel relinking immediately revokes the former executor's access", async () => {
  const { service, profile, input, employee, makeLegacy } = fixture();
  const record = await service.save(profile("director", true), { assignment: input, comment: "Создано" });
  makeLegacy(record.id);
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

 test("new assignments reject personnel IDs for responsible and coexecutors", async () => {
  const { service, profile, input } = fixture();
  const sender = profile("sender", true);
  await assert.rejects(service.save(sender, { assignment: { ...input, responsibleId: "person-imported" }, comment: "Назначено" }), /учётную запись/u);
  await assert.rejects(service.save(sender, { assignment: { ...input, coExecutorIds: ["person-imported"] }, comment: "Назначено" }), /учётную запись/u);
 });

test("PDF selection preserves requested rows and rejects stale or inaccessible assignments", async () => {
  const { service, profile, input } = fixture();
  const manager = profile("director", true);
  const first = await service.save(manager, { assignment: input, comment: "Создано" });
  const second = await service.save(manager, { assignment: { ...input, summary: "Второе поручение" }, comment: "Создано" });
  const request = { mode: "register", source: "current", entries: [{ id: second.id, revision: 1 }] };
  assert.deepEqual((await service.exportSelection(manager, request)).assignments.map(row => row.summary), ["Второе поручение"]);
  await assert.rejects(service.exportSelection(profile("other"), request), /недоступно/u);
  await assert.rejects(service.exportSelection(manager, { ...request, entries: [{ id: first.id, revision: 2 }] }), /Обновите/u);
  await assert.rejects(service.exportSelection(manager, { ...request, entries: [] }), /выбор/u);
  await assert.rejects(service.exportSelection(manager, { ...request, summary: "Подмена" }), /поля/u);
});

test("PDF history uses completion IDs and immutable data after the next occurrence changes", async () => {
  const { service, profile, input } = fixture();
  const manager = profile("director", true);
  const record = await service.save(manager, { assignment: input, comment: "Создано" });
  const review = await service.action(profile("worker"), record.id, { action: "submit_for_review", comment: "Готово", revision: 1 });
  await service.action(manager, record.id, { action: "complete", comment: "Принято", revision: review.revision });
  const [snapshot] = await service.completions(manager);
  const current = await service.read(manager, record.id);
  await service.save(manager, { assignment: { ...input, summary: "Изменённое поручение" }, revision: current.revision, comment: "Изменено" }, record.id);
  const request = { mode: "assignment", source: "history", entries: [{ id: snapshot.id, revision: snapshot.assignment.revision }] };
  const printed = await service.exportSelection(manager, request);
  assert.equal(printed.assignments[0].summary, "Представить отчёт");
  assert.equal(printed.assignments[0].status, "completed");
  await assert.rejects(service.exportSelection(profile("worker"), request), /прав/u);
  await assert.rejects(service.exportSelection(manager, { ...request, entries: [{ id: record.id, revision: 1 }] }), /недоступно/u);
  await assert.rejects(service.exportSelection(manager, { ...request, entries: [...request.entries, ...request.entries] }), /выбор/u);
});

for (const recurring of [false, true]) {
  test(`completion clears clarification in the accepted snapshot (recurring: ${recurring})`, async () => {
    const { service, profile, input, markUnclear } = fixture();
    const manager = profile("director", true);
    const record = await service.save(manager, { assignment: recurring ? input : { ...input, recurrence: "once", activeTo: input.activeFrom }, comment: "Создано" });
    markUnclear(record.id);
    const result = await service.action(manager, record.id, { action: "complete", comment: "Выполнено", revision: 1 });
    assert.equal((await service.completions(manager))[0].assignment.needsClarification, false);
    assert.equal(result.needsClarification, recurring);
    assert.equal(result.status, recurring ? "in_progress" : "completed");
  });
}

test("combined mode executes own assignments without allowing execution for others", async () => {
  const { service, profile, input } = fixture();
  const manager = profile("worker", true);
  manager.activeAccess.capabilities.push("business.execute_director_assignments");
  const record = await service.save(manager, { assignment: input, comment: "Создано" });
  const list = await service.list(manager);
  assert.equal(list.permissions.canManage, true);
  assert.equal(list.permissions.canExecute, true);
  assert.deepEqual(list.executableAssignmentIds, [record.id]);
  const outsider = profile("other", true);
  outsider.activeAccess.capabilities.push("business.execute_director_assignments");
  assert.deepEqual((await service.list(outsider)).executableAssignmentIds, []);
  await assert.rejects(service.action(outsider, record.id, { action: "record_progress", comment: "Результат", revision: 1 }));
  await assert.rejects(service.action(profile("worker", true), record.id, { action: "record_progress", comment: "Результат", revision: 1 }));
  await service.action(manager, record.id, { action: "record_progress", comment: "Результат", revision: 1 });
  const submitted = await service.action(manager, record.id, { action: "submit_for_review", comment: "Готово", revision: 2 });
  assert.equal(submitted.status, "under_review");
});

test("responsible account sees an assigned future deadline without receiving early execution rights", async () => {
  const { service, profile, input } = fixture();
  const assignment = { ...input, recurrence: "once", activeFrom: "2026-09-25", activeTo: "2026-09-25" } as DirectorAssignmentInput;
  const record = await service.save(profile("director", true), { assignment, comment: "Назначено" });
  const list = await service.list(profile("worker"));
  assert.deepEqual(list.assignments.map(item => item.id), [record.id]);
  assert.deepEqual(list.executableAssignmentIds, []);
  assert.equal((await service.read(profile("worker"), record.id)).id, record.id);
  assert.deepEqual((await service.list(profile("other"))).assignments, []);
  await assert.rejects(service.read(profile("other"), record.id), /недоступно/u);
  await assert.rejects(service.action(profile("worker"), record.id, { action: "record_progress", comment: "Готово", revision: 1 }));
});

test("clarification does not hide an explicitly assigned task or allow execution", async () => {
  const { service, profile, input, markUnclear, employee } = fixture();
  const record = await service.save(profile("director", true), { assignment: input, comment: "Назначено" });
  markUnclear(record.id);
  const list = await service.list(profile("worker"));
  assert.equal(list.assignments[0].needsClarification, true);
  assert.deepEqual(list.executableAssignmentIds, []);
  await assert.rejects(service.action(profile("worker"), record.id, { action: "complete", comment: "Готово", revision: 1 }));
  employee.active = false;
  assert.deepEqual((await service.list(profile("worker"))).assignments, []);
  await assert.rejects(service.read(profile("worker"), record.id), /недоступно/u);
});
