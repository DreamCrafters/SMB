import { randomUUID } from "node:crypto";
import type { BoardAssignmentDelegationsResponse, DirectorAssignment, DirectorAssignmentPdfRequest, DirectorAssignmentPermissions, PersonnelEmployee } from "../contracts/directorAssignments.js";
import type { DirectorAssignmentsRepository } from "../repositories/directorAssignmentsRepository.js";
import type { BoardAssignmentsRepository } from "../repositories/boardAssignmentsRepository.js";
import type { AuditRepository } from "../repositories/auditRepository.js";
import type { DatabaseTransactionRunner } from "../db/transactionContext.js";
import { hasProfileCapability, type ServerUserProfile } from "./auth.js";
import { canExecuteDirectorAssignment, directorWorkdays, DirectorAssignmentError, readDirectorAssignmentInput, readDirectorRecord, readDirectorText } from "./directorAssignment.js";
import { getBoardAssignmentOccurrenceOnOrAfter, getNextBoardAssignmentOccurrenceDate, isBoardAssignmentActiveOn, validateBoardAssignmentAction } from "./boardAssignment.js";

export function directorAssignmentPermissions(profile: ServerUserProfile): DirectorAssignmentPermissions {
  return {
    canView: hasProfileCapability(profile, "business.view_director_assignments"),
    canManage: hasProfileCapability(profile, "business.manage_director_assignments"),
    canExecute: hasProfileCapability(profile, "business.view_director_assignments") && !hasProfileCapability(profile, "business.manage_director_assignments"),
    canManagePersonnel: hasProfileCapability(profile, "business.manage_personnel"),
  };
}

export function createDirectorAssignmentsService({ repository, boardAssignments, transaction, audit, now = () => new Date() }: {
  repository: DirectorAssignmentsRepository;
  boardAssignments?: BoardAssignmentsRepository;
  transaction: DatabaseTransactionRunner;
  audit: AuditRepository;
  now?: () => Date;
}) {
  const today = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Moscow" }).format(now());
  const requirePermission = (allowed: boolean) => { if (!allowed) throw new DirectorAssignmentError("Недостаточно прав.", 403); };
  async function requireBoardSource(profile: ServerUserProfile, id: string, lock = false) {
    requirePermission(hasProfileCapability(profile, "business.view_board_assignments"));
    const source = lock ? await boardAssignments?.readByIdForUpdate(id) : await boardAssignments?.readById(id);
    if (!source || (hasProfileCapability(profile, "business.execute_board_assignments") && !isBoardAssignmentActiveOn(source, today()))) throw new DirectorAssignmentError("Исходное поручение недоступно.", 404);
    return source;
  }
  const recordAudit = (profile: ServerUserProfile, summary: string, targetId: string) => audit.record({
    actor: { userId: profile.userId, accountId: profile.activeAccess.accountId, displayName: profile.displayName, positionDisplayName: profile.activeAccess.positionDisplayName },
    category: "data_change", action: "data.update", targetType: "database_row", targetId, summary,
  });
  async function effectiveAssignment(assignment: DirectorAssignment) {
    // Account links are read live; renaming or relinking personnel never grants access by name.
    const employee = await repository.readAssignableEmployee(assignment.responsibleId, true);
    return { ...assignment, responsible: employee?.active ? employee : null };
  }
  async function requireAssignment(profile: ServerUserProfile, id: string, lock = false) {
    const permissions = directorAssignmentPermissions(profile);
    requirePermission(permissions.canView);
    const assignment = await repository.read(id, lock);
    if (!assignment || (!permissions.canManage && !canExecuteDirectorAssignment(await effectiveAssignment(assignment), profile.userId, today()))) {
      throw new DirectorAssignmentError("Поручение недоступно.", 404);
    }
    return assignment;
  }
  function comment(profile: ServerUserProfile, text: string, status: DirectorAssignment["status"]) {
    return { id: randomUUID(), userId: profile.userId, author: profile.displayName, text, status, createdAt: now().toISOString() };
  }
  async function resolveEmployees(responsibleId: string, coExecutorIds: string[]) {
    const ids = [...new Set([responsibleId, ...coExecutorIds])].sort();
    const found = new Map<string, PersonnelEmployee>();
    for (const id of ids) {
      if (!id.startsWith("account:")) throw new DirectorAssignmentError("Выберите действующую учётную запись сотрудника.");
      const employee = await repository.readAssignableEmployee(id, true);
      if (!employee?.active || !employee.userId) throw new DirectorAssignmentError("Выберите действующую учётную запись сотрудника.");
      found.set(id, employee);
    }
    const assignedUsers = [...found.values()].flatMap(employee => employee.userId ? [employee.userId] : []);
    if (new Set(assignedUsers).size !== assignedUsers.length) throw new DirectorAssignmentError("Один сотрудник не может быть указан среди исполнителей дважды.");
    return { responsible: found.get(responsibleId)!, coExecutors: coExecutorIds.map(id => found.get(id)!) };
  }
  return {
    async delegations(profile: ServerUserProfile, boardAssignmentId: string): Promise<BoardAssignmentDelegationsResponse> {
      const source = await requireBoardSource(profile, boardAssignmentId);
      const permissions = directorAssignmentPermissions(profile);
      const canAssign = permissions.canView && permissions.canManage && source.status !== "completed";
      const linkedAssignments = await repository.listByBoardAssignment(boardAssignmentId);
      const responsibleByComment = new Map<string, string>();
      for (const revision of await repository.listBoardAssignmentRevisions(boardAssignmentId)) {
        for (const comment of revision.comments) {
          if (!responsibleByComment.has(comment.id)) responsibleByComment.set(comment.id, revision.responsible?.fullName ?? "Не указан");
        }
      }
      const assignments = linkedAssignments.map(assignment => ({
        id: assignment.id, number: assignment.number, summary: assignment.summary,
        responsible: assignment.responsible, coExecutors: assignment.coExecutors,
        currentOccurrenceDate: assignment.currentOccurrenceDate, status: assignment.status,
        createdAt: assignment.createdAt, updatedAt: assignment.updatedAt,
        comments: assignment.comments.map(comment => ({ ...comment, responsibleDisplayName: responsibleByComment.get(comment.id) ?? assignment.responsible?.fullName ?? "Не указан" })),
      }));
      return { assignments, canAssign, employees: canAssign ? await repository.listAssignableEmployees() : [], today: today() };
    },
    async list(profile: ServerUserProfile) {
      const permissions = directorAssignmentPermissions(profile);
      requirePermission(permissions.canView);
      const employees = await repository.listAssignableEmployees();
      const assignments: DirectorAssignment[] = [];
      for (const assignment of await repository.list()) {
        if (permissions.canManage || canExecuteDirectorAssignment(await effectiveAssignment(assignment), profile.userId, today())) assignments.push(assignment);
      }
      const enriched = assignments.map(assignment => ({ ...assignment, durationWorkdays: directorWorkdays(assignment.assignedOn, assignment.currentOccurrenceDate), remainingWorkdays: directorWorkdays(assignment.completedOn || today(), assignment.currentOccurrenceDate) }));
      return { assignments: enriched, permissions, today: today(), employees: permissions.canManage ? employees.filter(e => e.active) : [] };
    },
    async exportSelection(profile: ServerUserProfile, value: unknown): Promise<{ mode: DirectorAssignmentPdfRequest["mode"]; assignments: DirectorAssignment[] }> {
      const permissions = directorAssignmentPermissions(profile);
      requirePermission(permissions.canView);
      const request = readDirectorRecord(value);
      if (Object.keys(request).some(key => !["mode", "source", "entries"].includes(key))) throw new DirectorAssignmentError("Неизвестные поля выгрузки.");
      if ((request.mode !== "register" && request.mode !== "assignment") || (request.source !== "current" && request.source !== "history")) throw new DirectorAssignmentError("Проверьте формат выгрузки.");
      if (!Array.isArray(request.entries) || !request.entries.length || (request.mode === "assignment" && request.entries.length !== 1)) throw new DirectorAssignmentError("Проверьте выбор поручений.");
      const entries = request.entries.map(value => {
        const entry = readDirectorRecord(value);
        if (Object.keys(entry).some(key => !["id", "revision"].includes(key)) || typeof entry.id !== "string" || !/^[a-zA-Z0-9-]{1,100}$/u.test(entry.id) || !Number.isSafeInteger(entry.revision) || Number(entry.revision) < 1) throw new DirectorAssignmentError("Проверьте выбор поручений.");
        return { id: entry.id, revision: entry.revision };
      });
      if (new Set(entries.map(entry => entry.id)).size !== entries.length) throw new DirectorAssignmentError("Проверьте выбор поручений.");
      if (request.source === "history") requirePermission(permissions.canManage);
      const snapshots = request.source === "history" ? new Map((await repository.listCompletions()).map(item => [item.id, item.assignment])) : null;
      const assignments: DirectorAssignment[] = [];
      for (const entry of entries) {
        const assignment = snapshots ? snapshots.get(entry.id) : await requireAssignment(profile, entry.id);
        if (!assignment) throw new DirectorAssignmentError("Поручение недоступно.", 404);
        if (assignment.revision !== entry.revision) throw new DirectorAssignmentError("Поручение изменилось. Обновите список перед выгрузкой.", 409);
        assignments.push(assignment);
      }
      return { mode: request.mode, assignments };
    },
    async personnel(profile: ServerUserProfile) {
      requirePermission(directorAssignmentPermissions(profile).canManagePersonnel);
      return { employees: await repository.listEmployees(), users: await repository.listUserOptions() };
    },
    async saveEmployee(profile: ServerUserProfile, value: unknown, id?: string) {
      requirePermission(directorAssignmentPermissions(profile).canManagePersonnel);
      const row = readDirectorRecord(value);
      if (Object.keys(row).some(key => !["revision", "fullName", "position", "department", "category", "userId", "active"].includes(key))) throw new DirectorAssignmentError("Неизвестные поля сотрудника.");
      if (!["АУП", "ИТР"].includes(String(row.category)) || typeof row.active !== "boolean") throw new DirectorAssignmentError("Проверьте категорию и состояние сотрудника.");
      return transaction.run(async () => {
        const previous = id ? await repository.readEmployee(id, true) : undefined;
        if (id && (!previous || previous.revision !== row.revision)) throw new DirectorAssignmentError("Сотрудник уже изменён. Обновите список.", 409);
        const employee: PersonnelEmployee = {
          id: id ?? randomUUID(), revision: (previous?.revision ?? 0) + 1,
          fullName: readDirectorText(row.fullName, true), position: readDirectorText(row.position, true),
          department: readDirectorText(row.department), category: row.category as PersonnelEmployee["category"],
          userId: row.userId === null ? null : readDirectorText(row.userId, true, 100), active: row.active as boolean,
        };
        try { await repository.saveEmployee(employee, !id); } catch (error) {
          if (typeof error === "object" && error !== null && "code" in error && error.code === "ER_DUP_ENTRY") throw new DirectorAssignmentError("Учётная запись уже связана с другим сотрудником.", 409);
          throw error;
        }
        await recordAudit(profile, "Изменён кадровый справочник", employee.id);
        return employee;
      });
    },
    read: requireAssignment,
    async save(profile: ServerUserProfile, value: unknown, id?: string) {
      const permissions = directorAssignmentPermissions(profile);
      requirePermission(permissions.canView && permissions.canManage);
      const envelope = readDirectorRecord(value);
      const input = readDirectorAssignmentInput(envelope.assignment);
      const changeComment = readDirectorText(envelope.comment, true, 4000);
      return transaction.run(async () => {
        const previous = id ? await requireAssignment(profile, id, true) : undefined;
        if (previous && (previous.status === "completed" || previous.revision !== envelope.revision)) throw new DirectorAssignmentError("Поручение завершено или уже изменено. Обновите список.", 409);
        if (previous && previous.sourceBoardAssignmentId !== input.sourceBoardAssignmentId) {
          throw new DirectorAssignmentError("Нельзя изменить исходное поручение СД у созданного перепоручения.", 409);
        }
        if (!previous && input.sourceBoardAssignmentId) {
          const source = await requireBoardSource(profile, input.sourceBoardAssignmentId, true);
          if (source.status === "completed") throw new DirectorAssignmentError("Завершённое поручение СД нельзя перепоручить.", 409);
        }
        const people = await resolveEmployees(input.responsibleId, input.coExecutorIds);
        const scheduleUnchanged = previous && previous.recurrence === input.recurrence && previous.activeFrom === input.activeFrom && previous.activeTo === input.activeTo;
        const accepted = previous ? (await repository.listCompletions()).filter(item => item.assignment.id === previous.id) : [];
        const lastAcceptedOn = accepted.flatMap(item => [item.assignment.completedOn, item.assignment.currentOccurrenceDate]).sort().at(-1);
        const afterLastAccepted = lastAcceptedOn ? new Date(Date.parse(`${lastAcceptedOn}T00:00:00Z`) + 86400000).toISOString().slice(0, 10) : input.activeFrom;
        const currentOccurrenceDate = getBoardAssignmentOccurrenceOnOrAfter({ ...input, targetDate: scheduleUnchanged ? previous.currentOccurrenceDate : afterLastAccepted });
        if (!currentOccurrenceDate) throw new DirectorAssignmentError("Период не содержит текущего или будущего исполнения.");
        const assignment: DirectorAssignment = {
          ...input, ...people, id: previous?.id ?? randomUUID(), number: previous?.number ?? "",
          revision: (previous?.revision ?? 0) + 1, status: previous?.status ?? "in_progress",
          currentOccurrenceDate, completedOn: previous?.completedOn ?? "",
          comments: [...(previous?.comments ?? []), comment(profile, changeComment, previous?.status ?? "in_progress")],
          documents: previous?.documents ?? [], createdAt: previous?.createdAt ?? now().toISOString(), updatedAt: now().toISOString(),
          postponedUntil: previous && previous.currentOccurrenceDate !== currentOccurrenceDate ? currentOccurrenceDate : previous?.postponedUntil ?? "",
          needsClarification: false, source: previous?.source ?? null,
        };
        const saved = previous ? await repository.update(assignment, previous) : await repository.create(assignment);
        await recordAudit(profile, previous ? "Изменено поручение генерального директора" : "Создано поручение генерального директора", saved.id);
        return saved;
      });
    },
    async action(profile: ServerUserProfile, id: string, value: unknown) {
      return transaction.run(async () => {
        const previous = await requireAssignment(profile, id, true);
        const permissions = directorAssignmentPermissions(profile);
        const row = readDirectorRecord(value);
        if (row.revision !== previous.revision) throw new DirectorAssignmentError("Поручение уже изменено. Обновите список.", 409);
        const canExecute = permissions.canExecute && canExecuteDirectorAssignment(await effectiveAssignment(previous), profile.userId, today());
        if (row.action === "record_progress") {
          requirePermission(canExecute);
          const text = readDirectorText(row.comment, true, 4000);
          const assignment = { ...previous, progress: text, revision: previous.revision + 1, updatedAt: now().toISOString(), comments: [...previous.comments, comment(profile, text, previous.status)] };
          await repository.update(assignment, previous);
          await recordAudit(profile, "Сохранён промежуточный результат поручения генерального директора", id);
          return assignment;
        }
        let status: DirectorAssignment["status"];
        let actionComment: string;
        if (row.action === "complete") {
          requirePermission(permissions.canManage || canExecute);
          if (previous.status === "completed") throw new DirectorAssignmentError("Поручение уже завершено.", 409);
          status = "completed";
          actionComment = readDirectorText(row.comment, true, 4000);
        } else {
          const validation = validateBoardAssignmentAction({ action: row.action, comment: row.comment }, previous.status, {
            canView: true, canCreate: permissions.canManage, canReview: permissions.canManage, canExecute,
          });
          if (!validation.ok) throw new DirectorAssignmentError(validation.errors.join(" "));
          status = validation.value.status;
          actionComment = validation.value.comment;
        }
        const assignment = { ...previous, status, revision: previous.revision + 1, updatedAt: now().toISOString(),
          comments: [...previous.comments, comment(profile, actionComment, status)] };
        if (status === "completed") {
          assignment.completedOn = today();
          assignment.needsClarification = false;
          await repository.addCompletion(assignment);
          // An early completion must advance beyond that occurrence, not only beyond today.
          const completedThrough = assignment.currentOccurrenceDate > assignment.completedOn ? assignment.currentOccurrenceDate : assignment.completedOn;
          const next = getNextBoardAssignmentOccurrenceDate({ ...assignment, completedOn: completedThrough });
          if (next) { assignment.needsClarification = previous.needsClarification; assignment.status = "in_progress"; assignment.currentOccurrenceDate = next; assignment.completedOn = ""; }
        }
        await repository.update(assignment, previous);
        await recordAudit(profile, "Изменён статус поручения генерального директора", id);
        return assignment;
      });
    },
    async completions(profile: ServerUserProfile) {
      const permissions = directorAssignmentPermissions(profile);
      requirePermission(permissions.canView && permissions.canManage);
      return (await repository.listCompletions()).map(item => ({ ...item, assignment: { ...item.assignment,
        durationWorkdays: directorWorkdays(item.assignment.assignedOn, item.assignment.currentOccurrenceDate),
        remainingWorkdays: directorWorkdays(item.assignment.completedOn, item.assignment.currentOccurrenceDate),
      } }));
    },
    async document(profile: ServerUserProfile, id: string, documentId: string) {
      const assignment = await requireAssignment(profile, id);
      if (!directorAssignmentPermissions(profile).canManage && !assignment.documents.some(document => document.id === documentId)) throw new DirectorAssignmentError("Документ недоступен.", 404);
      const document = await repository.readDocument(id, documentId);
      if (!document) throw new DirectorAssignmentError("Документ не найден.", 404);
      return document;
    },
    async changeDocument(profile: ServerUserProfile, id: string, document: { fileName: string; pdf: Buffer } | { removeId: string }) {
      const permissions = directorAssignmentPermissions(profile);
      requirePermission(permissions.canManage && permissions.canView);
      return transaction.run(async () => {
        const previous = await requireAssignment(profile, id, true);
        if (previous.status === "completed") throw new DirectorAssignmentError("Завершённое поручение нельзя менять.", 409);
        const assignment = { ...previous, documents: [...previous.documents], revision: previous.revision + 1, updatedAt: now().toISOString() };
        if ("removeId" in document) {
          if (!assignment.documents.some(item => item.id === document.removeId)) throw new DirectorAssignmentError("Документ не найден.", 404);
          assignment.documents = assignment.documents.filter(item => item.id !== document.removeId);
        } else {
          if (!document.fileName.toLowerCase().endsWith(".pdf") || document.fileName.length > 255 || /[\\/\r\n\u0000]/u.test(document.fileName) || document.pdf.length < 5 || document.pdf.length > 10_000_000 || document.pdf.subarray(0, 5).toString("ascii") !== "%PDF-") throw new DirectorAssignmentError("Выберите PDF размером до 10 МБ.");
          if (assignment.documents.length >= 5) throw new DirectorAssignmentError("Разрешено не более пяти PDF.");
          const documentId = randomUUID();
          await repository.addDocument(id, documentId, document.fileName, document.pdf);
          assignment.documents.push({ id: documentId, fileName: document.fileName, sizeBytes: document.pdf.length });
        }
        await repository.update(assignment, previous);
        await recordAudit(profile, "Изменены документы поручения генерального директора", id);
        return assignment;
      });
    },
  };
}

export type DirectorAssignmentsService = ReturnType<typeof createDirectorAssignmentsService>;
