import { assignmentRegistries, type AssignmentRegistryId, type DirectorAssignment, type DirectorAssignmentInput } from "../contracts/directorAssignments.js";
import { isBoardAssignmentActiveOn, isBoardAssignmentRecurrence } from "./boardAssignment.js";
import { readCalendarDate } from "./calendarDate.js";

export class DirectorAssignmentError extends Error {
  constructor(message: string, public readonly status = 400) { super(message); }
}

const protocolFields = ["meetingDate", "protocolNumber", "decisionNumber"] as const;

export function readDirectorAssignmentInput(value: unknown, registryId: AssignmentRegistryId = "director"): DirectorAssignmentInput {
  const registry = assignmentRegistries[registryId];
  const row = readDirectorRecord(value);
  const fields: string[] = ["assignedOn", "kind", "summary", "department", "project", "responsibleId", "coExecutorIds", "recurrence", "activeFrom", "activeTo", "urgency", "importance", "note", "progress", "incomingNumber", "sourceBoardAssignmentId", ...(registry.hasProtocol ? protocolFields : [])];
  if (Object.keys(row).some(key => !fields.includes(key))) throw new DirectorAssignmentError("Неизвестные поля поручения.");
  const text = (key: string, required = false, max = 300) => readDirectorText(row[key], required, max);
  const assignedOn = text("assignedOn", true, 10);
  const activeFrom = text("activeFrom", true, 10);
  const activeTo = text("activeTo", true, 10);
  if (![assignedOn, activeFrom, activeTo].every(date => readCalendarDate(date)) || activeFrom > activeTo) throw new DirectorAssignmentError("Проверьте даты поручения.");
  const kind = text("kind", true);
  if (!["Поручение", "Задача", "Распоряжение", "Приказ"].includes(kind)) throw new DirectorAssignmentError("Выберите вид поручения.");
  if (!isBoardAssignmentRecurrence(row.recurrence)) throw new DirectorAssignmentError("Выберите повторение.");
  if (row.recurrence === "once" && activeFrom !== activeTo) throw new DirectorAssignmentError("Для разового поручения укажите одну дату исполнения.");
  if (!Array.isArray(row.coExecutorIds) || row.coExecutorIds.length > 30) throw new DirectorAssignmentError("Проверьте соисполнителей.");
  const responsibleId = text("responsibleId", true, 100);
  const coExecutorIds = [...new Set(row.coExecutorIds.map(id => readDirectorText(id, true, 100)))];
  if (coExecutorIds.includes(responsibleId)) throw new DirectorAssignmentError("Ответственный уже участвует в поручении.");
  if (!registry.canLinkBoardAssignment && row.sourceBoardAssignmentId !== null) throw new DirectorAssignmentError("Связь с поручением Совета директоров здесь недоступна.");
  const protocol = registry.hasProtocol ? {
    meetingDate: text("meetingDate", false, 10),
    protocolNumber: text("protocolNumber", false, 100),
    decisionNumber: text("decisionNumber", false, 100),
  } : {};
  if (protocol.meetingDate && !readCalendarDate(protocol.meetingDate)) throw new DirectorAssignmentError("Проверьте дату заседания.");
  return {
    assignedOn, activeFrom, activeTo, kind: kind as DirectorAssignmentInput["kind"],
    summary: text("summary", true, 20000), department: text("department"), project: text("project"),
    responsibleId, coExecutorIds, recurrence: row.recurrence,
    urgency: text("urgency", false, 100), importance: text("importance", false, 100),
    note: text("note", false, 4000), progress: text("progress", false, 4000), incomingNumber: text("incomingNumber", false, 100),
    sourceBoardAssignmentId: row.sourceBoardAssignmentId === null ? null : text("sourceBoardAssignmentId", true, 100),
    ...protocol,
  };
}

/** Spreadsheet NETWORKDAYS semantics: inclusive weekdays, without a holiday calendar. */
export function directorWorkdays(from: string, to: string): number | undefined {
  if (!readCalendarDate(from) || !readCalendarDate(to)) return undefined;
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  const minimum = Math.min(start, end);
  const days = Math.round(Math.abs(end - start) / 86400000) + 1;
  let count = Math.floor(days / 7) * 5;
  const firstDay = new Date(minimum).getUTCDay();
  for (let i = 0; i < days % 7; i++) if (![0, 6].includes((firstDay + i) % 7)) count++;
  return count * (end < start ? -1 : 1);
}

export function readDirectorRecord(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new DirectorAssignmentError("Передайте поля формы.");
  return value as Record<string, unknown>;
}

export function readDirectorText(value: unknown, required = false, max = 300): string {
  if (typeof value !== "string" || value.trim().length > max || (required && !value.trim())) throw new DirectorAssignmentError("Проверьте заполнение полей.");
  return value.trim();
}

export function canViewDirectorAssignment(assignment: DirectorAssignment, userId: string) {
  return assignment.status !== "completed" && assignment.responsible?.userId === userId;
}

/**
 * Without a direct completion, the executor must be able to report before the deadline:
 * work opens on the assignment date, not on the due date of the current occurrence.
 */
export function canExecuteDirectorAssignment(
  assignment: DirectorAssignment,
  userId: string,
  today: string,
) {
  return !assignment.needsClarification
    && assignment.responsible?.userId === userId
    && assignment.assignedOn <= today
    && isBoardAssignmentActiveOn(assignment, assignment.currentOccurrenceDate);
}
