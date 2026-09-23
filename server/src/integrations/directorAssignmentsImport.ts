import { createHash } from "node:crypto";
import type { DirectorAssignment } from "../contracts/directorAssignments.js";
import { readCalendarDate } from "../domain/calendarDate.js";

export const directorAssignmentSourceId = "1mtV9dvXqPdQ7_kmPgxSfKUzyw2OJyzLe__Wkyz6qMGU";
function sourceId(value: string) { return createHash("sha256").update(value).digest("hex"); }
function sourceDate(value = "") {
  const match = /^(\d{2})\.(\d{2})\.(\d{4})(?:\s+(?:[01]\d|2[0-3]):[0-5]\d)?$/u.exec(value.trim());
  return match ? readCalendarDate(`${match[3]}-${match[2]}-${match[1]}`) ?? "" : "";
}

export function previewDirectorAssignmentImport(rows: string[][], timestamp: string) {
  if (rows[0]?.[0] !== "Номер задачи" || rows[0]?.[2] !== "Суть задачи" || rows[0]?.[13] !== "Статус") throw new Error("Изменилась структура исходного реестра.");
  const records: DirectorAssignment[] = [];
  const warnings: Array<{ number: string; messages: string[] }> = [];
  for (const row of rows.slice(1)) {
    if (!row[2]?.trim()) continue;
    const number = row[0]?.trim();
    const assignedOn = sourceDate(row[1]);
    if (!number || !assignedOn) throw new Error("В исходном поручении отсутствует номер или корректная дата постановки.");
    const key = `${directorAssignmentSourceId}:0:${number}:${assignedOn}`;
    if (records.some(record => record.source?.key === key)) throw new Error("В источнике повторяется номер поручения.");
    const messages: string[] = [];
    // Source names remain in source.values; only a human can choose a real account.
    const originalDueDate = sourceDate(row[7]);
    const postponedUntil = sourceDate(row[18]);
    const deadline = postponedUntil || originalDueDate;
    if (!deadline) messages.push("Не заполнен корректный срок исполнения.");
    const originalStatus = (row[13] ?? "").trim();
    const completedOn = sourceDate(row[11]);
    const completed = originalStatus.startsWith("Выполнено");
    if (!completed) messages.push("Выберите ответственного из учётных записей сайта.");
    if (!completed && !originalStatus.startsWith("Выполняется")) messages.push("Не определён исходный статус.");
    if (completed && !completedOn) messages.push("Не заполнена дата завершённого исполнения.");
    if (!completed && completedOn) messages.push("Дата исполнения противоречит исходному статусу.");
    records.push({
      id: sourceId(key), number, revision: 1, assignedOn, kind: "Поручение", summary: row[2],
      department: row[3] ?? "", project: row[4] ?? "", responsibleId: "", responsible: null, coExecutorIds: [], coExecutors: [],
      recurrence: "once", activeFrom: deadline, activeTo: deadline, currentOccurrenceDate: deadline,
      urgency: row[8] ?? "", importance: row[9] ?? "", progress: row[10] ?? "", completedOn,
      note: row[12] ?? "", status: completed ? "completed" : "in_progress", incomingNumber: row[14] ?? "",
      sourceBoardAssignmentId: null, comments: [], documents: [], createdAt: timestamp, updatedAt: timestamp,
      needsClarification: !completed && messages.length > 0, postponedUntil,
      source: { key, originalStatus, originalDueDate, postponedUntil, values: [...row] },
    });
    if (messages.length) warnings.push({ number, messages: [...new Set(messages)] });
  }
  return { records, warnings };
}
