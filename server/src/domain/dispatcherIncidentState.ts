import type {
  DispatcherSubmission,
  ValidatedDispatcherSubmissionDraft,
} from "./dispatcherSubmission.js";

export type IncidentStateValidationResult =
  | {
      ok: true;
      value: ValidatedDispatcherSubmissionDraft;
    }
  | {
      ok: false;
      errors: string[];
    };

type OpenIncidentEntry = {
  submission: DispatcherSubmission;
  incidentNumber: string;
};

export function applyIncidentStateRules(
  value: ValidatedDispatcherSubmissionDraft,
  history: DispatcherSubmission[],
): IncidentStateValidationResult {
  if (value.draft.formId !== "incident_close") {
    return {
      ok: true,
      value,
    };
  }

  const incidentNumber = value.draft.payload.incidentNumber?.trim();
  const openIncident = buildOpenIncidentEntries(
    history,
    value.draft.businessAccountId,
  ).find((entry) => entry.incidentNumber === incidentNumber);

  if (openIncident === undefined) {
    return {
      ok: false,
      errors: ["incident closure requires an open incident."],
    };
  }

  return {
    ok: true,
    value,
  };
}

function buildOpenIncidentEntries(
  submissions: DispatcherSubmission[],
  businessAccountId: string,
) {
  const openEntries: OpenIncidentEntry[] = [];

  for (const submission of submissions
    .filter((item) => item.businessAccountId === businessAccountId)
    .filter((item) => item.formId === "incident" || item.formId === "incident_close")
    .sort(compareSubmissionsAscending)) {
    if (submission.formId === "incident") {
      openEntries.push({
        submission,
        incidentNumber: readIncidentNumber(submission),
      });
      continue;
    }

    const incidentNumber = submission.payload.incidentNumber?.trim();

    if (incidentNumber === undefined || incidentNumber.length === 0) {
      continue;
    }

    const index = openEntries.findIndex(
      (entry) => entry.incidentNumber === incidentNumber,
    );

    if (index >= 0) {
      openEntries.splice(index, 1);
    }
  }

  return openEntries;
}

function readIncidentNumber(submission: DispatcherSubmission) {
  return submission.payload.incidentNumber?.trim() || submission.id;
}

function compareSubmissionsAscending(
  left: DispatcherSubmission,
  right: DispatcherSubmission,
) {
  const timestampDelta =
    readTimestamp(left.receivedAt) - readTimestamp(right.receivedAt);

  if (timestampDelta !== 0) {
    return timestampDelta;
  }

  return readIncidentLifecycleRank(left) - readIncidentLifecycleRank(right);
}

function readIncidentLifecycleRank(submission: DispatcherSubmission) {
  if (submission.formId === "incident") {
    return 0;
  }

  if (submission.formId === "incident_close") {
    return 1;
  }

  return 0;
}

function readTimestamp(value: string) {
  const timestamp = Date.parse(value);

  return Number.isNaN(timestamp) ? 0 : timestamp;
}
