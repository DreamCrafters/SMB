export const boardAssignmentStatuses = ["in_progress", "under_review", "revision_requested", "completed"] as const;
export type BoardAssignmentStatus = (typeof boardAssignmentStatuses)[number];
export const boardAssignmentRecurrences = ["daily", "weekly", "monthly", "yearly", "once"] as const;
export type BoardAssignmentRecurrence = (typeof boardAssignmentRecurrences)[number];
