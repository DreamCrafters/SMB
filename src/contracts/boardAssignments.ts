export const boardAssignmentStatuses = [
  "in_progress",
  "under_review",
  "revision_requested",
  "completed",
] as const;

export type BoardAssignmentStatus =
  (typeof boardAssignmentStatuses)[number];

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

export type BoardAssignmentSummary = {
  id: string;
  meetingDate: string;
  protocolNumber: string;
  decisionNumber: string;
  summary: string;
  coExecutors: string[];
  dueDate: string;
  status: BoardAssignmentStatus;
  createdByDisplayName: string;
  createdAt: string;
  updatedAt: string;
};

export type BoardAssignment = BoardAssignmentSummary & {
  details: string;
  sourceMaterial?: {
    key: string;
    fileName: string;
  };
  comments: BoardAssignmentComment[];
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
  dueDate: string;
  comment?: string;
};

export type BoardAssignmentActionInput = {
  action: BoardAssignmentAction;
  comment: string;
};
