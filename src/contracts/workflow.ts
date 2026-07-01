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

export type DispatcherFormId =
  | "equipment"
  | "incident"
  | "incident_close"
  | "visitor"
  | "gas_oc"
  | "gas_cosh";

export type DispatcherFormFieldType =
  | "text"
  | "number"
  | "integer"
  | "date"
  | "month"
  | "datetime-local"
  | "select"
  | "textarea";

export type DispatcherFormField = {
  name: string;
  label: string;
  type: DispatcherFormFieldType;
  required: boolean;
  options?: string[];
  maxLength?: number;
};

export type DispatcherFormDefinition = {
  id: DispatcherFormId;
  title: string;
  sheetName: string;
  fields: DispatcherFormField[];
};

export type DispatcherSubmissionPayload = Record<string, string>;

export type DispatcherSubmissionDraft = {
  businessAccountId: string;
  formId: DispatcherFormId;
  payload: DispatcherSubmissionPayload;
};

export type DispatcherSubmission = {
  id: string;
  businessAccountId: string;
  formId: DispatcherFormId;
  formTitle: string;
  payload: DispatcherSubmissionPayload;
  summary: string;
  status: DispatcherSubmissionStatus;
  submittedByAccountId: string;
  submittedAt: string;
  receivedAt: string;
};

export type DispatcherFormsResponse = {
  forms: DispatcherFormDefinition[];
};

export type DispatcherSubmissionResponse = {
  submission: DispatcherSubmission;
};

export type DispatcherFeedSummaryItem = {
  formId: DispatcherFormId;
  formTitle: string;
  count: number;
};

export type DispatcherFeedSummary = {
  total: number;
  byForm: DispatcherFeedSummaryItem[];
};

export type DispatcherFeedResponse = {
  submissions: DispatcherSubmission[];
  receivedAt: string;
  summary: DispatcherFeedSummary;
};
