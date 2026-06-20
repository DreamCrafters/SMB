import {
  getDispatcherFormDefinition,
  getDispatcherFormTitle,
  isDispatcherFormId,
  type DispatcherFormDefinition,
  type DispatcherFormField,
  type DispatcherFormId,
} from "./dispatcherForms.js";

export type DispatcherSubmissionStatus =
  | "received"
  | "queued"
  | "accepted"
  | "rejected";

export type DispatcherSubmissionPayload = Record<string, string>;

export type DispatcherSubmissionDraft = {
  businessAccountId: string;
  formId: DispatcherFormId;
  payload: DispatcherSubmissionPayload;
};

export type ValidatedDispatcherSubmissionDraft = {
  draft: DispatcherSubmissionDraft;
  summary: string;
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

export type DispatcherSubmissionRow = {
  id: string;
  business_account_id: string;
  form_id: string;
  payload: unknown;
  summary: string;
  status: DispatcherSubmissionStatus;
  submitted_by_account_id: string;
  submitted_at: Date | string;
  received_at: Date | string;
};

export type ValidationResult =
  | {
      ok: true;
      value: ValidatedDispatcherSubmissionDraft;
    }
  | {
      ok: false;
      errors: string[];
    };

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const monthPattern = /^\d{4}-\d{2}$/;
const dateTimeLocalPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const numberPattern = /^-?\d+(?:[,.]\d+)?$/;
const defaultTextMaxLength = 240;
const summaryFallback = "Запись без краткого описания";

export function validateDispatcherSubmissionDraft(input: unknown): ValidationResult {
  if (!isRecord(input) || Array.isArray(input)) {
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
  const formId = readFormId(input.formId, errors);
  const form =
    formId === undefined ? undefined : getDispatcherFormDefinition(formId);
  const payload = readPayload(input.payload, form, errors);

  if (errors.length > 0 || formId === undefined || form === undefined) {
    return {
      ok: false,
      errors,
    };
  }

  const draft = {
    businessAccountId: businessAccountId ?? "",
    formId,
    payload,
  };

  return {
    ok: true,
    value: {
      draft,
      summary: buildDispatcherSubmissionSummary(form, payload),
    },
  };
}

export function mapDispatcherSubmissionRow(
  row: DispatcherSubmissionRow,
): DispatcherSubmission {
  const formId = isDispatcherFormId(row.form_id) ? row.form_id : "equipment";
  const payload = readRowPayload(row.payload);
  const form = getDispatcherFormDefinition(formId);
  const summary =
    row.summary.trim().length > 0
      ? row.summary
      : form === undefined
        ? summaryFallback
        : buildDispatcherSubmissionSummary(form, payload);

  return {
    id: row.id,
    businessAccountId: row.business_account_id,
    formId,
    formTitle: getDispatcherFormTitle(formId),
    payload,
    summary,
    status: row.status,
    submittedByAccountId: row.submitted_by_account_id,
    submittedAt: toIsoString(row.submitted_at),
    receivedAt: toIsoString(row.received_at),
  };
}

function readFormId(value: unknown, errors: string[]) {
  if (!isDispatcherFormId(value)) {
    errors.push("formId must be a supported dispatcher form id.");
    return undefined;
  }

  return value;
}

function readPayload(
  value: unknown,
  form: DispatcherFormDefinition | undefined,
  errors: string[],
): DispatcherSubmissionPayload {
  if (!isRecord(value) || Array.isArray(value)) {
    errors.push("payload must be a JSON object.");
    return {};
  }

  if (form === undefined) {
    return {};
  }

  const allowedFieldNames = new Set(form.fields.map((field) => field.name));
  const unknownFieldNames = Object.keys(value).filter(
    (fieldName) => !allowedFieldNames.has(fieldName),
  );

  if (unknownFieldNames.length > 0) {
    errors.push(`payload contains unsupported fields: ${unknownFieldNames.join(", ")}.`);
  }

  const payload: DispatcherSubmissionPayload = {};

  for (const field of form.fields) {
    const fieldValue = readFieldValue(value[field.name], field, errors);

    if (fieldValue !== undefined) {
      payload[field.name] = fieldValue;
    }
  }

  return payload;
}

function readFieldValue(
  value: unknown,
  field: DispatcherFormField,
  errors: string[],
) {
  if (value === undefined || value === null) {
    if (field.required) {
      errors.push(`${field.name} is required.`);
    }

    return undefined;
  }

  if (typeof value !== "string") {
    errors.push(`${field.name} must be a string.`);
    return undefined;
  }

  const trimmed = value.trim();

  if (trimmed.length === 0) {
    if (field.required) {
      errors.push(`${field.name} is required.`);
    }

    return undefined;
  }

  const maxLength = field.maxLength ?? defaultTextMaxLength;

  if (trimmed.length > maxLength) {
    errors.push(`${field.name} must be ${maxLength} characters or less.`);
    return undefined;
  }

  if (field.type === "select") {
    if (field.options === undefined || !field.options.includes(trimmed)) {
      errors.push(`${field.name} must be one of the supported options.`);
      return undefined;
    }
  }

  if (field.type === "date" && !datePattern.test(trimmed)) {
    errors.push(`${field.name} must use YYYY-MM-DD format.`);
    return undefined;
  }

  if (field.type === "month" && !monthPattern.test(trimmed)) {
    errors.push(`${field.name} must use YYYY-MM format.`);
    return undefined;
  }

  if (
    field.type === "datetime-local" &&
    !dateTimeLocalPattern.test(trimmed)
  ) {
    errors.push(`${field.name} must use YYYY-MM-DDTHH:mm format.`);
    return undefined;
  }

  if (field.type === "number" && !numberPattern.test(trimmed)) {
    errors.push(`${field.name} must be a number.`);
    return undefined;
  }

  return trimmed;
}

function buildDispatcherSubmissionSummary(
  form: DispatcherFormDefinition,
  payload: DispatcherSubmissionPayload,
) {
  const values = form.summaryFields
    .map((fieldName) => {
      const field = form.fields.find((item) => item.name === fieldName);
      const value = payload[fieldName];

      if (value === undefined) {
        return undefined;
      }

      return field === undefined ? value : `${field.label}: ${value}`;
    })
    .filter((value): value is string => value !== undefined);

  if (values.length === 0) {
    return summaryFallback;
  }

  return values.join(" · ");
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

function readRowPayload(value: unknown): DispatcherSubmissionPayload {
  if (!isRecord(value) || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
}

function toIsoString(value: Date | string) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
