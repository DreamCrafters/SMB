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

export type DispatcherSubmissionRow = {
  id: string;
  business_account_id: string;
  period: string;
  metric_code: string;
  raw_value: string;
  comment: string | null;
  status: DispatcherSubmissionStatus;
  submitted_by_account_id: string;
  submitted_at: Date | string;
  received_at: Date | string;
};

export type ValidationResult =
  | {
      ok: true;
      draft: DispatcherSubmissionDraft;
    }
  | {
      ok: false;
      errors: string[];
    };

const periodPattern = /^\d{4}-\d{2}$/;

export function validateDispatcherSubmissionDraft(input: unknown): ValidationResult {
  if (!isRecord(input)) {
    return {
      ok: false,
      errors: ["Payload must be a JSON object."],
    };
  }

  const errors: string[] = [];
  const businessAccountId = readRequiredString(
    input.businessAccountId,
    "businessAccountId",
    120,
    errors,
  );
  const period = readRequiredString(input.period, "period", 20, errors);
  const metricCode = readRequiredString(input.metricCode, "metricCode", 120, errors);
  const rawValue = readRequiredString(input.rawValue, "rawValue", 120, errors);
  const comment = readOptionalString(input.comment, "comment", 2_000, errors);

  if (period !== undefined && !periodPattern.test(period)) {
    errors.push("period must use YYYY-MM format.");
  }

  if (errors.length > 0) {
    return {
      ok: false,
      errors,
    };
  }

  return {
    ok: true,
    draft: {
      businessAccountId: businessAccountId ?? "",
      period: period ?? "",
      metricCode: metricCode ?? "",
      rawValue: rawValue ?? "",
      comment,
    },
  };
}

export function mapDispatcherSubmissionRow(
  row: DispatcherSubmissionRow,
): DispatcherSubmission {
  return {
    id: row.id,
    businessAccountId: row.business_account_id,
    period: row.period,
    metricCode: row.metric_code,
    rawValue: row.raw_value,
    comment: row.comment ?? undefined,
    status: row.status,
    submittedByAccountId: row.submitted_by_account_id,
    submittedAt: toIsoString(row.submitted_at),
    receivedAt: toIsoString(row.received_at),
  };
}

function readRequiredString(
  value: unknown,
  fieldName: string,
  maxLength: number,
  errors: string[],
) {
  if (typeof value !== "string") {
    errors.push(`${fieldName} must be a string.`);
    return undefined;
  }

  const trimmed = value.trim();

  if (trimmed.length === 0) {
    errors.push(`${fieldName} is required.`);
    return undefined;
  }

  if (trimmed.length > maxLength) {
    errors.push(`${fieldName} must be ${maxLength} characters or less.`);
    return undefined;
  }

  return trimmed;
}

function readOptionalString(
  value: unknown,
  fieldName: string,
  maxLength: number,
  errors: string[],
) {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value !== "string") {
    errors.push(`${fieldName} must be a string when provided.`);
    return undefined;
  }

  const trimmed = value.trim();

  if (trimmed.length === 0) {
    return undefined;
  }

  if (trimmed.length > maxLength) {
    errors.push(`${fieldName} must be ${maxLength} characters or less.`);
    return undefined;
  }

  return trimmed;
}

function toIsoString(value: Date | string) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
