export const boardAssignmentStatuses = [
  "in_progress",
  "under_review",
  "revision_requested",
  "completed",
] as const;

export type BoardAssignmentStatus =
  (typeof boardAssignmentStatuses)[number];

export const boardAssignmentRecurrences = [
  "daily",
  "weekly",
  "monthly",
  "yearly",
  "once",
] as const;

export type BoardAssignmentRecurrence =
  (typeof boardAssignmentRecurrences)[number];

export const boardAssignmentActions = [
  "submit_for_review",
  "return_for_revision",
  "complete",
] as const;

export type BoardAssignmentAction =
  (typeof boardAssignmentActions)[number];

export type BoardAssignmentPermissions = {
  canView: boolean;
  canCreate: boolean;
  canExecute: boolean;
  canReview: boolean;
};

export type BoardAssignmentComment = {
  id: string;
  authorDisplayName: string;
  comment: string;
  statusAfter: BoardAssignmentStatus;
  createdAt: string;
};

export const maxBoardAssignmentDocuments = 5;
export const maxBoardAssignmentDocumentBytes = 10_000_000;

export type BoardAssignmentDocument = {
  id: string;
  fileName: string;
  sizeBytes: number;
  uploadedAt: string;
};

export type BoardAssignmentSummary = {
  id: string;
  meetingDate: string;
  protocolNumber: string;
  decisionNumber: string;
  summary: string;
  coExecutors: string[];
  dueDate: string;
  recurrence: BoardAssignmentRecurrence;
  activeFrom: string;
  activeTo: string;
  currentOccurrenceDate: string;
  status: BoardAssignmentStatus;
  createdByDisplayName: string;
  createdAt: string;
  updatedAt: string;
};

export type BoardAssignment = BoardAssignmentSummary & {
  details: string;
  documents?: BoardAssignmentDocument[];
  sourceMaterial?: {
    key: string;
    fileName: string;
  };
  comments: BoardAssignmentComment[];
};

export type BoardAssignmentCompletionSummary = {
  id: string;
  assignmentId: string;
  occurrenceDate: string;
  completedByDisplayName: string;
  completedAt: string;
  assignment: BoardAssignmentSummary;
};

export type BoardAssignmentCompletion = Omit<
  BoardAssignmentCompletionSummary,
  "assignment"
> & {
  assignment: BoardAssignment;
};

export type BoardAssignmentFilters = {
  status?: BoardAssignmentStatus;
  meetingDateFrom?: string;
  meetingDateTo?: string;
  query?: string;
};

export type BoardAssignmentCreateInput = {
  meetingDate: string;
  protocolNumber: string;
  decisionNumber: string;
  summary: string;
  details: string;
  coExecutors: string[];
  recurrence: BoardAssignmentRecurrence;
  activeFrom: string;
  activeTo: string;
  comment?: string;
};

export type BoardAssignmentUpdateInput =
  Omit<BoardAssignmentCreateInput, "comment"> & {
    comment: string;
    expectedUpdatedAt: string;
  };

export type BoardAssignmentActionInput = {
  action: BoardAssignmentAction;
  comment: string;
};
