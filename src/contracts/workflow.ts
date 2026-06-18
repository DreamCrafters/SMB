export type DataEntryStatus =
  | "draft"
  | "submitted"
  | "needs_correction"
  | "confirmed"
  | "rejected";

export type ConfirmationStatus =
  | "waiting"
  | "approved"
  | "rejected"
  | "needs_correction";

export type DispatcherSubmissionStatus =
  | "received"
  | "queued"
  | "accepted"
  | "rejected";

export type DispatcherSubmissionDraft = {
  businessAccountId: string;
  period: string;
  metricCode: string;
  rawValue: string;
  comment?: string;
};

export type DispatcherSubmission = DispatcherSubmissionDraft & {
  id: string;
  status: DispatcherSubmissionStatus;
  submittedByAccountId: string;
  submittedAt: string;
  receivedAt: string;
};

export type DispatcherSubmissionResponse = {
  submission: DispatcherSubmission;
};

export type DispatcherFeedResponse = {
  submissions: DispatcherSubmission[];
  receivedAt: string;
};
