import assert from "node:assert/strict";
import test from "node:test";
import type { DirectorAssignment, DirectorAssignmentInput, PersonnelEmployee } from "../contracts/directorAssignments.js";
import type { DirectorAssignmentsRepository } from "../repositories/directorAssignmentsRepository.js";
import type { ServerUserProfile } from "./auth.js";
import { createDirectorAssignmentsService } from "./directorAssignmentsService.js";

function fixture() {
  let records = new Map<string, DirectorAssignment>();
  let completions: DirectorAssignment[] = [];
  let auditFails = false;
  const employee: PersonnelEmployee = { id: "person", revision: 1, fullName: "Исполнитель", position: "Инженер", department: "", category: "ИТР", userId: "worker", active: true };
  const repository = {
    list: async () => structuredClone([...records.values()]),
    read: async (id: string) => structuredClone(records.get(id)),
    listEmployees: async () => [structuredClone(employee)],
    readEmployee: async () => structuredClone(employee),
    create: async (record: DirectorAssignment) => { record.number = "1"; records.set(record.id, structuredClone(record)); return structuredClone(record); },
    update: async (record: DirectorAssignment) => { records.set(record.id, structuredClone(record)); return structuredClone(record); },
    addCompletion: async (record: DirectorAssignment) => { completions.push(structuredClone(record)); },
    listCompletions: async () => completions.map((assignment, index) => ({ id: String(index), assignment: structuredClone(assignment) })),
  } as unknown as DirectorAssignmentsRepository;
  const service = createDirectorAssignmentsService({
    repository,
    now: () => new Date("2026-09-14T10:00:00Z"),
    transaction: { async run(operation) { const before = structuredClone(records); const oldCompletions = structuredClone(completions); try { return await operation(); } catch (error) { records = before; completions = oldCompletions; throw error; } } },
    audit: { async record() { if (auditFails) throw new Error("audit unavailable"); }, async listReport() { throw new Error("unused"); } },
  });
  const profile = (userId: string, manager = false): ServerUserProfile => ({
    userId, displayName: userId, accountType: "business_owner", receivedAt: "2026-09-14T00:00:00Z",
    activeAccess: { accountId: userId, accountType: "business_owner", position: "worker", positionDisplayName: "Сотрудник", displayName: userId, scope: { kind: "organization" }, issuedAt: "2026-09-14T00:00:00Z", navigationItems: ["business.director_assignments"], capabilities: ["business.view_director_assignments", ...(manager ? ["business.manage_director_assignments" as const] : [])] },
  });
  const input: DirectorAssignmentInput = { assignedOn: "2026-09-01", kind: "Поручение", summary: "Представить отчёт", department: "", project: "", responsibleId: employee.id, coExecutorIds: [], recurrence: "monthly", activeFrom: "2026-09-01", activeTo: "2026-12-31", urgency: "", importance: "", note: "", progress: "", incomingNumber: "", sourceBoardAssignmentId: null };
  return { service, employee, profile, input, failAudit() { auditFails = true; } };
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
