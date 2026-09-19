import type { DirectorAssignment } from "../contracts/directorAssignments.js";
import { readCalendarDate } from "./calendarDate.js";

const dayMs = 86_400_000;
const shortAssignmentDays = [3, 2, 1];
const longAssignmentDays = [7, 3, 2, 1];
export const directorReminderPollMs = 60_000;
export const directorReminderLeaseSeconds = 900;
export type DirectorReminderDelivery = {
  assignmentId: string;
  occurrenceDate: string;
  daysBefore: number;
  userId: string;
  channel: "email" | "max";
};

export function directorAssignmentReminderDays(assignment: DirectorAssignment, today: string): number | undefined {
  if (assignment.needsClarification || !["in_progress", "revision_requested"].includes(assignment.status)) return;
  if (![assignment.assignedOn, assignment.currentOccurrenceDate, today].every(value => readCalendarDate(value))) return;
  if (assignment.assignedOn > today) return;
  const due = Date.parse(`${assignment.currentOccurrenceDate}T00:00:00Z`);
  const duration = Math.round((due - Date.parse(`${assignment.assignedOn}T00:00:00Z`)) / dayMs) + 1;
  const daysBefore = Math.round((due - Date.parse(`${today}T00:00:00Z`)) / dayMs);
  if (duration > 0 && (duration <= 10 ? shortAssignmentDays : longAssignmentDays).includes(daysBefore)) return daysBefore;
}

export function buildDirectorAssignmentReminder(assignment: DirectorAssignment, daysBefore: number) {
  return {
    subject: `Напоминание о поручении №${assignment.number}`,
    text: [
      `Приближается срок выполнения поручения №${assignment.number}.`,
      `До срока: ${daysBefore} ${daysBefore === 1 ? "день" : daysBefore < 5 ? "дня" : "дней"}.`,
      `Дата постановки: ${assignment.assignedOn.split("-").reverse().join(".")}`,
      `Суть поручения: ${assignment.summary}`,
      `Срок выполнения: ${assignment.currentOccurrenceDate.split("-").reverse().join(".")}`,
    ].join("\n"),
  };
}
