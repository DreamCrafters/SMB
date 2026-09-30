import type { BoardAssignment, BoardAssignmentsRepository } from "../repositories/boardAssignmentsRepository.js";
import assert from "node:assert/strict";
import test from "node:test";
import type { AssignmentRegistryId, DirectorAssignment, DirectorAssignmentInput, PersonnelEmployee } from "../contracts/directorAssignments.js";
import type { DirectorAssignmentsRepository } from "../repositories/directorAssignmentsRepository.js";
import type { ServerUserProfile } from "./auth.js";
import { createDirectorAssignmentsService } from "./directorAssignmentsService.js";

function fixture(registryId: AssignmentRegistryId = "director") {
  let records = new Map<string, DirectorAssignment>();
  let completions: DirectorAssignment[] = [];
  let revisions: DirectorAssignment[] = [];
  let boardLocks = 0;
  const board = { id: "board-parent", summary: "Исходное поручение", details: "Полное содержание поручения", status: "in_progress", recurrence: "once", activeFrom: "2026-09-01", activeTo: "2026-09-01", currentOccurrenceDate: "2026-09-01" } as BoardAssignment;
  let auditFails = false;
  const employee: PersonnelEmployee = { id: "account:worker", revision: 1, fullName: "Исполнитель", position: "Инженер", department: "", category: "ИТР", userId: "worker", active: true, canReceive: true };
  const repository = {
    registryId,
    list: async () => structuredClone([...records.values()]),
    listByBoardAssignment: async (id: string) => structuredClone([...records.values()].filter(record => record.sourceBoardAssignmentId === id)),
    listBoardAssignmentRevisions: async (id: string) => structuredClone(revisions.filter(record => record.sourceBoardAssignmentId === id)),
    read: async (id: string) => structuredClone(records.get(id)),
    listEmployees: async () => [structuredClone(employee)],
    listAssignableEmployees: async () => [structuredClone(employee)],
    readAssignableEmployee: async (id: string) => id && employee.active && employee.userId ? structuredClone(employee) : undefined,
    readEmployee: async (id: string) => id ? structuredClone(employee) : undefined,
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
    activeAccess: { accountId: userId, accountType: "business_owner", position: "worker", positionDisplayName: "Сотрудник", displayName: userId, scope: { kind: "organization" }, issuedAt: "2026-09-14T00:00:00Z",
      // A controller sends from the registry tab; an executor receives through «Поручения».
      navigationItems: [manager ? (registryId === "collegium" ? "business.collegium_assignments" : "business.director_assignments") : "business.assignments"],
      capabilities: registryId === "collegium"
        ? ["business.view_collegium_assignments", manager ? "business.manage_collegium_assignments" as const : "business.execute_collegium_assignments" as const]
        : ["business.view_director_assignments", manager ? "business.manage_director_assignments" as const : "business.execute_director_assignments" as const] },
  });
  const input: DirectorAssignmentInput = { assignedOn: "2026-09-01", kind: "Поручение", summary: "Представить отчёт", department: "", project: "", responsibleId: employee.id, coExecutorIds: [], recurrence: "monthly", activeFrom: "2026-09-01", activeTo: "2026-12-31", urgency: "", importance: "", note: "", progress: "", incomingNumber: "", sourceBoardAssignmentId: null,
    ...(registryId === "collegium" ? { meetingDate: "2026-09-10", protocolNumber: "7", decisionNumber: "2.1" } : {}) };
  return { service, employee, profile, input, board, boardLocks: () => boardLocks, markUnclear(id: string) { records.get(id)!.needsClarification = true; }, makeLegacy(id: string) { records.get(id)!.responsibleId = "person-legacy"; }, unassign(id: string) { records.get(id)!.responsibleId = ""; }, failAudit() { auditFails = true; } };
}

async function submitAndAccept(service: ReturnType<typeof fixture>["service"], manager: ServerUserProfile, executor: ServerUserProfile, record: DirectorAssignment, comment = "Принято") {
  const review = await service.action(executor, record.id, { action: "submit_for_review", comment: "Готово", revision: record.revision });
  return service.action(manager, record.id, { action: "complete", comment, revision: review.revision });
}

test("executor submits a one-time assignment and the controller accepts it with an immutable history entry", async () => {
  const { service, profile, input } = fixture();
  const manager = profile("director", true);
  const record = await service.save(manager, { assignment: { ...input, recurrence: "once", activeTo: input.activeFrom }, comment: "Создано" });
  const review = await service.action(profile("worker"), record.id, { action: "submit_for_review", comment: "  Выполнено  ", revision: 1 });
  assert.equal(review.status, "under_review");
  assert.equal(review.comments.at(-1)?.text, "Выполнено");
  const completed = await service.action(manager, record.id, { action: "complete", comment: "Принято", revision: review.revision });
  assert.equal(completed.status, "completed");
  assert.equal(completed.completedOn, "2026-09-14");
  assert.equal(completed.revision, 3);
  assert.deepEqual(completed.comments.at(-1), { id: completed.comments.at(-1)!.id, userId: "director", author: "director", text: "Принято", status: "completed", createdAt: "2026-09-14T10:00:00.000Z" });
  const snapshot = (await service.completions(manager))[0].assignment;
  assert.equal(snapshot.status, "completed");
  assert.equal(snapshot.completedOn, "2026-09-14");
  assert.deepEqual(snapshot.comments, completed.comments);
  assert.equal(snapshot.currentOccurrenceDate, "2026-09-01");
  assert.equal((await service.list(profile("worker"))).assignments.length, 0);
});

test("overview summary counts accepted periods for managers and is hidden from executors", async () => {
  const { service, profile, input } = fixture();
  const manager = profile("director", true);
  const record = await service.save(manager, { assignment: input, comment: "Создано" });
  await submitAndAccept(service, manager, profile("worker"), record);
  await service.save(manager, { assignment: { ...input, activeFrom: "2026-09-10", activeTo: "2026-09-10", recurrence: "once" }, comment: "Создано" });

  assert.deepEqual(await service.overviewSummary(manager, { monthStart: "2026-09-01", today: "2026-09-14" }), {
    total: 3,
    completed: 1,
    overdue: 1,
    month: { total: 2, completed: 1, overdue: 1 },
  });
  assert.equal(await service.overviewSummary(profile("worker"), { monthStart: "2026-09-01", today: "2026-09-14" }), undefined);
});

for (const actor of ["director", "assistant"]) {
  for (const resubmitted of [false, true]) {
    test(`${actor} accepts a ${resubmitted ? "resubmitted" : "submitted"} result and advances a recurring assignment once`, async () => {
      const { service, profile, input } = fixture();
      const manager = profile(actor, true);
      const worker = profile("worker");
      let record = await service.save(manager, { assignment: input, comment: "Создано" });
      record = await service.action(worker, record.id, { action: "submit_for_review", comment: "Проверить", revision: record.revision });
      if (resubmitted) {
        record = await service.action(manager, record.id, { action: "return_for_revision", comment: "Исправить", revision: record.revision });
        assert.equal(record.status, "revision_requested");
        record = await service.action(worker, record.id, { action: "submit_for_review", comment: "Исправлено", revision: record.revision });
      }
      const completed = await service.action(manager, record.id, { action: "complete", comment: "Готово", revision: record.revision });
      assert.equal(completed.status, "in_progress");
      assert.equal(completed.currentOccurrenceDate, "2026-10-01");
      assert.equal(completed.completedOn, "");
      assert.equal((await service.list(worker)).assignments.length, 1);
      // The next period opens for early reporting right away.
      assert.deepEqual((await service.list(worker)).executableAssignmentIds, [record.id]);
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

for (const status of ["in_progress", "revision_requested"] as const) {
  test(`controller cannot accept or return an assignment that is ${status} without a submitted result`, async () => {
    const { service, profile, input } = fixture();
    const manager = profile("director", true);
    let record = await service.save(manager, { assignment: input, comment: "Создано" });
    if (status === "revision_requested") {
      record = await service.action(profile("worker"), record.id, { action: "submit_for_review", comment: "Проверить", revision: record.revision });
      record = await service.action(manager, record.id, { action: "return_for_revision", comment: "Исправить", revision: record.revision });
    }
    for (const action of ["complete", "return_for_revision"]) {
      await assert.rejects(service.action(manager, record.id, { action, comment: "Решение", revision: record.revision }), /на проверке/u);
    }
    assert.equal((await service.read(manager, record.id)).status, status);
    assert.equal((await service.completions(manager)).length, 0);
  });
}

test("executor only reports: completing, returning and unknown actions are rejected", async () => {
  const { service, profile, input } = fixture();
  const manager = profile("director", true);
  const record = await service.save(manager, { assignment: input, comment: "Создано" });
  for (const action of ["complete", "return_for_revision"]) {
    await assert.rejects(service.action(profile("worker"), record.id, { action, comment: "Готово", revision: 1 }), /руководитель/u);
  }
  await assert.rejects(service.action(profile("worker"), record.id, { action: "archive", comment: "Готово", revision: 1 }), /действие/u);
  const review = await service.action(profile("worker"), record.id, { action: "submit_for_review", comment: "Готово", revision: 1 });
  await assert.rejects(service.action(profile("worker"), record.id, { action: "complete", comment: "Готово", revision: review.revision }), /недоступно/u);
  assert.equal((await service.completions(manager)).length, 0);
});

test("early submission and acceptance advance past the accepted occurrence without duplicating a period", async () => {
  const { service, profile, input } = fixture();
  const manager = profile("director", true);
  const record = await service.save(manager, { assignment: input, comment: "Создано" });
  const first = await submitAndAccept(service, manager, profile("worker"), record, "Сентябрь готов");
  assert.equal(first.currentOccurrenceDate, "2026-10-01");
  const early = await submitAndAccept(service, manager, profile("worker"), first, "Октябрь готов досрочно");
  assert.equal(early.currentOccurrenceDate, "2026-11-01");
  const history = await service.completions(manager);
  assert.deepEqual(history.map(item => item.assignment.currentOccurrenceDate), ["2026-09-01", "2026-10-01"]);
  assert.deepEqual(history.map(item => item.assignment.completedOn), ["2026-09-14", "2026-09-14"]);
  const edited = await service.save(manager, { assignment: { ...input, activeTo: "2027-01-01" }, comment: "Продлить период", revision: early.revision }, record.id);
  assert.equal(edited.currentOccurrenceDate, "2026-11-01");
  assert.deepEqual(await service.completions(manager), history);
});

test("a one-time assignment can be reported before its deadline but not before it is assigned", async () => {
  const { service, profile, input } = fixture();
  const manager = profile("director", true);
  const due = await service.save(manager, { assignment: { ...input, recurrence: "once", activeFrom: "2026-09-30", activeTo: "2026-09-30" }, comment: "Создано" });
  assert.deepEqual((await service.list(profile("worker"))).executableAssignmentIds, [due.id]);
  const review = await service.action(profile("worker"), due.id, { action: "submit_for_review", comment: "Сделано раньше срока", revision: 1 });
  const accepted = await service.action(manager, due.id, { action: "complete", comment: "Принято", revision: review.revision });
  assert.equal(accepted.status, "completed");
  assert.equal(accepted.completedOn, "2026-09-14");
  const future = await service.save(manager, { assignment: { ...input, assignedOn: "2026-09-20", recurrence: "once", activeFrom: "2026-09-30", activeTo: "2026-09-30" }, comment: "Создано" });
  await assert.rejects(service.action(profile("worker"), future.id, { action: "submit_for_review", comment: "Готово", revision: 1 }), /недоступно/u);
});

test("the responsible account must be able to receive assignments of this registry", async () => {
  const { service, profile, input, employee } = fixture();
  const manager = profile("director", true);
  employee.canReceive = false;
  await assert.rejects(service.save(manager, { assignment: input, comment: "Создано" }), /нет вкладки «Поручения» с реестром «Поручения генерального директора»/u);
  employee.canReceive = true;
  const record = await service.save(manager, { assignment: input, comment: "Создано" });
  employee.canReceive = false;
  // Editing other fields keeps an existing responsible; reassignment is checked again.
  const edited = await service.save(manager, { assignment: { ...input, note: "Уточнение" }, comment: "Поправка", revision: record.revision }, record.id);
  assert.equal(edited.note, "Уточнение");
});

test("a controller cannot accept or return an assignment where they are the responsible executor", async () => {
  const { service, profile, input } = fixture();
  const own = profile("worker", true);
  own.activeAccess.capabilities.push("business.execute_director_assignments");
  const record = await service.save(own, { assignment: input, comment: "Создано" });
  const review = await service.action(own, record.id, { action: "submit_for_review", comment: "Готово", revision: record.revision });
  for (const action of ["complete", "return_for_revision"]) {
    await assert.rejects(service.action(own, record.id, { action, comment: "Сам принял", revision: review.revision }), /другой руководитель/u);
  }
  const accepted = await service.action(profile("director", true), record.id, { action: "complete", comment: "Принято", revision: review.revision });
  assert.equal(accepted.currentOccurrenceDate, "2026-10-01");
});

test("review actions enforce visibility, active account links, comments and revision without partial writes", async () => {
  const { service, profile, input, employee } = fixture();
  const manager = profile("director", true);
  const record = await service.save(manager, { assignment: { ...input, recurrence: "once", activeTo: input.activeFrom }, comment: "Создано" });
  const action = { action: "submit_for_review", comment: "Готово", revision: 1 };
  await assert.rejects(service.action(profile("other"), record.id, action), /недоступно/u);
  const noAccess = profile("director", true);
  noAccess.activeAccess.capabilities = [];
  await assert.rejects(service.action(noAccess, record.id, action), /прав/u);
  for (const comment of ["", "  ", null, 42, "а".repeat(4001)]) await assert.rejects(service.action(profile("worker"), record.id, { ...action, comment }), /Комментарий/u);
  await assert.rejects(service.action(profile("worker"), record.id, { ...action, revision: 0 }), /изменено/u);
  employee.active = false;
  await assert.rejects(service.action(profile("worker"), record.id, action), /недоступно/u);
  employee.active = true;
  assert.equal((await service.read(manager, record.id)).revision, 1);
  const review = await service.action(profile("worker"), record.id, action);
  for (const comment of ["", "  "]) await assert.rejects(service.action(manager, record.id, { action: "complete", comment, revision: review.revision }), /Комментарий/u);
  assert.equal((await service.completions(manager)).length, 0);
  const completed = await service.action(manager, record.id, { action: "complete", comment: "Принято", revision: review.revision });
  await assert.rejects(service.action(manager, record.id, { action: "complete", comment: "Повтор", revision: completed.revision }), /уже завершено/u);
  assert.equal((await service.completions(manager)).length, 1);
});

test("executor cannot submit an assignment dated in the future or one already submitted for review", async () => {
  const { service, profile, input } = fixture();
  const manager = profile("director", true);
  const future = await service.save(manager, { assignment: { ...input, assignedOn: "2026-10-01", activeFrom: "2026-10-01" }, comment: "Создано" });
  await assert.rejects(service.action(profile("worker"), future.id, { action: "submit_for_review", comment: "Готово", revision: 1 }), /недоступно/u);
  const record = await service.save(manager, { assignment: input, comment: "Создано" });
  await service.action(profile("worker"), record.id, { action: "submit_for_review", comment: "Проверить", revision: 1 });
  await assert.rejects(service.action(profile("worker"), record.id, { action: "submit_for_review", comment: "Ещё раз", revision: 2 }), /недоступно/u);
  assert.equal((await service.completions(manager)).length, 0);
});

test("submission rolls back when audit fails", async () => {
  const { service, profile, input, failAudit } = fixture();
  const manager = profile("director", true);
  const record = await service.save(manager, { assignment: input, comment: "Создано" });
  failAudit();
  await assert.rejects(service.action(profile("worker"), record.id, { action: "submit_for_review", comment: "Готово", revision: 1 }), /audit/u);
  assert.equal((await service.read(manager, record.id)).revision, 1);
  assert.equal((await service.read(manager, record.id)).status, "in_progress");
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
  assert.deepEqual((await service.list(profile("worker"))).executableAssignmentIds, [record.id]);
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
  test(`acceptance clears clarification in the accepted snapshot (recurring: ${recurring})`, async () => {
    const { service, profile, input, markUnclear } = fixture();
    const manager = profile("director", true);
    const record = await service.save(manager, { assignment: recurring ? input : { ...input, recurrence: "once", activeTo: input.activeFrom }, comment: "Создано" });
    const review = await service.action(profile("worker"), record.id, { action: "submit_for_review", comment: "Готово", revision: 1 });
    markUnclear(record.id);
    const result = await service.action(manager, record.id, { action: "complete", comment: "Выполнено", revision: review.revision });
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
  assert.deepEqual(list.ownAssignmentIds, [record.id]);
  const outsider = profile("other", true);
  outsider.activeAccess.capabilities.push("business.execute_director_assignments");
  assert.deepEqual((await service.list(outsider)).executableAssignmentIds, []);
  assert.deepEqual((await service.list(outsider)).ownAssignmentIds, []);
  await assert.rejects(service.action(outsider, record.id, { action: "record_progress", comment: "Результат", revision: 1 }));
  await assert.rejects(service.action(profile("worker", true), record.id, { action: "record_progress", comment: "Результат", revision: 1 }));
  await service.action(manager, record.id, { action: "record_progress", comment: "Результат", revision: 1 });
  const submitted = await service.action(manager, record.id, { action: "submit_for_review", comment: "Готово", revision: 2 });
  assert.equal(submitted.status, "under_review");
});

test("responsible account sees an assignment dated in the future without receiving execution rights yet", async () => {
  const { service, profile, input } = fixture();
  const assignment = { ...input, assignedOn: "2026-09-20", recurrence: "once", activeFrom: "2026-09-25", activeTo: "2026-09-25" } as DirectorAssignmentInput;
  const record = await service.save(profile("director", true), { assignment, comment: "Назначено" });
  const list = await service.list(profile("worker"));
  assert.deepEqual(list.assignments.map(item => item.id), [record.id]);
  assert.deepEqual(list.ownAssignmentIds, [record.id]);
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
  await assert.rejects(service.action(profile("worker"), record.id, { action: "submit_for_review", comment: "Готово", revision: 1 }));
  employee.active = false;
  assert.deepEqual((await service.list(profile("worker"))).assignments, []);
  await assert.rejects(service.read(profile("worker"), record.id), /недоступно/u);
});

test("responsible account badges use live links rather than the saved name or user ID", async () => {
  const { service, profile, input, employee, makeLegacy, unassign } = fixture();
  const manager = profile("director", true);
  const record = await service.save(manager, { assignment: input, comment: "Создано" });
  const badge = async () => (await service.list(manager)).responsibleAccountLinks[record.id];
  assert.equal(await badge(), "linked");
  employee.active = false;
  assert.equal(await badge(), "unavailable");
  employee.active = true;
  makeLegacy(record.id);
  assert.equal(await badge(), "linked");
  employee.userId = null;
  assert.equal(await badge(), "unlinked");
  assert.deepEqual((await service.list(profile("worker"))).assignments, []);
  unassign(record.id);
  assert.equal(await badge(), "unlinked");
});

test("an unlinked named responsible gains visibility only after an explicit account assignment", async () => {
  const { service, profile, input, unassign, markUnclear } = fixture();
  const manager = profile("director", true);
  const record = await service.save(manager, { assignment: input, comment: "Создано" });
  unassign(record.id);
  markUnclear(record.id);
  assert.deepEqual((await service.list(profile("worker"))).assignments, []);
  assert.equal((await service.list(manager)).responsibleAccountLinks[record.id], "unlinked");
  await service.save(manager, { assignment: input, revision: 1, comment: "Выбран аккаунт ответственного" }, record.id);
  const received = await service.list(profile("worker"));
  assert.deepEqual(received.assignments.map(item => item.id), [record.id]);
  assert.equal(received.responsibleAccountLinks[record.id], "linked");
  assert.equal(received.assignments[0].needsClarification, false);
});

test("previewed permissions do not turn another account's tasks into the administrator's own tasks", async () => {
  const { applyAccountPreviewAccess } = await import("./accountPreview.js");
  const { service, profile, input } = fixture();
  const record = await service.save(profile("director", true), { assignment: input, comment: "Назначено" });
  const preview = applyAccountPreviewAccess(profile("admin"), {
    position: "worker", positionDisplayName: "Исполнитель",
    navigationItems: ["business.director_assignments"],
    capabilities: ["business.view_director_assignments", "business.manage_director_assignments", "business.execute_director_assignments"],
  });
  const result = await service.list(preview);
  assert.deepEqual(result.assignments.map(item => item.id), [record.id]);
  assert.deepEqual(result.ownAssignmentIds, []);
  assert.deepEqual(result.executableAssignmentIds, []);
});

test("collegium registry runs the same review cycle with its own capabilities and protocol fields", async () => {
  const { service, profile, input } = fixture("collegium");
  const chair = profile("chair", true);
  const record = await service.save(chair, { assignment: input, comment: "Создано" });
  assert.deepEqual([record.meetingDate, record.protocolNumber, record.decisionNumber], ["2026-09-10", "7", "2.1"]);
  assert.equal((await service.list(profile("worker"))).assignments.length, 1);
  const accepted = await submitAndAccept(service, chair, profile("worker"), record);
  assert.equal(accepted.currentOccurrenceDate, "2026-10-01");
  assert.equal((await service.completions(chair))[0].assignment.protocolNumber, "7");
  await assert.rejects(service.save(chair, { assignment: { ...input, meetingDate: "10.09.2026" }, comment: "Создано" }), /заседания/u);
});

test("registries do not share permissions or board links", async () => {
  const collegium = fixture("collegium");
  const director = fixture("director");
  // A director-assignment controller has no rights in the collegium registry, and vice versa.
  await assert.rejects(collegium.service.list(director.profile("director", true)), /прав/u);
  await assert.rejects(director.service.list(collegium.profile("chair", true)), /прав/u);
  const chair = collegium.profile("chair", true);
  chair.activeAccess.capabilities.push("business.view_board_assignments");
  await assert.rejects(collegium.service.save(chair, { assignment: { ...collegium.input, sourceBoardAssignmentId: collegium.board.id }, comment: "Создано" }), /Совета директоров/u);
  await assert.rejects(collegium.service.delegations(chair, collegium.board.id), /недоступно/u);
  const { meetingDate: _meetingDate, protocolNumber: _protocolNumber, decisionNumber: _decisionNumber, ...collegiumFields } = collegium.input;
  await assert.rejects(director.service.save(director.profile("director", true), { assignment: { ...director.input, protocolNumber: "7" }, comment: "Создано" }), /Неизвестные поля/u);
  await assert.rejects(collegium.service.save(chair, { assignment: collegiumFields, comment: "Создано" }), /заполнение/u);
});
