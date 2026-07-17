import type {
  DispatcherSubmission,
  DispatcherSubmissionPayload,
  ValidatedDispatcherSubmissionDraft,
} from "./dispatcherSubmission.js";

export type VisitorStateValidationResult =
  | {
      ok: true;
      value: ValidatedDispatcherSubmissionDraft;
    }
  | {
      ok: false;
      errors: string[];
    };

type OpenVisitorEntry = {
  submission: DispatcherSubmission;
  key: string;
};

export function applyVisitorStateRules(
  value: ValidatedDispatcherSubmissionDraft,
  history: DispatcherSubmission[],
  today: Date = new Date(),
): VisitorStateValidationResult {
  if (value.draft.formId !== "visitor" && value.draft.formId !== "visitor_exit") {
    return {
      ok: true,
      value,
    };
  }

  const openVisitors = buildOpenVisitorEntries(history);

  if (value.draft.formId === "visitor") {
    const duplicate = openVisitors.find(
      (entry) => entry.key === buildVisitorKey(value.draft.payload),
    );

    if (duplicate !== undefined) {
      return {
        ok: false,
        errors: ["visitor is already inside and has no exit time."],
      };
    }

    return {
      ok: true,
      value,
    };
  }

  const visitorEntryId = value.draft.payload.visitorEntryId;
  const todayDate = formatDateValueFromDate(today);
  const openVisitor = openVisitors.find(
    (entry) =>
      entry.submission.id === visitorEntryId &&
      readVisitorEntryDate(entry.submission) === todayDate,
  );

  if (openVisitor === undefined) {
    return {
      ok: false,
      errors: ["visitor exit requires an open visitor entry from today."],
    };
  }

  return {
    ok: true,
    value: {
      ...value,
      draft: {
        ...value.draft,
        payload: enrichVisitorExitPayload(
          value.draft.payload,
          openVisitor.submission,
        ),
      },
    },
  };
}

function buildOpenVisitorEntries(
  submissions: DispatcherSubmission[],
) {
  const openEntries: OpenVisitorEntry[] = [];

  for (const submission of submissions
    .filter((item) => item.formId === "visitor" || item.formId === "visitor_exit")
    .sort(compareSubmissionsAscending)) {
    if (submission.formId === "visitor") {
      openEntries.push({
        submission,
        key: buildVisitorKey(submission.payload),
      });
      continue;
    }

    const visitorEntryId = submission.payload.visitorEntryId;
    const index =
      visitorEntryId !== undefined
        ? openEntries.findIndex((entry) => entry.submission.id === visitorEntryId)
        : openEntries.findIndex(
            (entry) => entry.key === buildVisitorKey(submission.payload),
          );

    if (index >= 0) {
      openEntries.splice(index, 1);
    }
  }

  return openEntries;
}

function enrichVisitorExitPayload(
  payload: DispatcherSubmissionPayload,
  entry: DispatcherSubmission,
) {
  return {
    ...payload,
    fio: entry.payload.fio ?? "",
    organization: entry.payload.organization ?? "",
    position: entry.payload.position ?? "",
    purpose: entry.payload.purpose ?? "",
    whom: entry.payload.whom ?? "",
    entryAt: entry.payload.entryAt ?? entry.receivedAt,
  };
}

function buildVisitorKey(payload: DispatcherSubmissionPayload) {
  return [payload.fio, payload.organization]
    .map((value) => value?.trim().toLocaleLowerCase("ru-RU") ?? "")
    .join("|");
}

function readVisitorEntryDate(submission: DispatcherSubmission) {
  return (
    readPayloadDate(submission.payload.entryAt) ??
    readPayloadDate(submission.receivedAt)
  );
}

function readPayloadDate(value: string | undefined) {
  if (value === undefined) {
    return undefined;
  }

  const scriptMatch = /^(\d{2})\.(\d{2})\.(\d{4})/.exec(value);

  if (scriptMatch !== null) {
    return `${scriptMatch[3]}-${scriptMatch[2]}-${scriptMatch[1]}`;
  }

  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);

  if (isoMatch !== null) {
    return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  }

  return undefined;
}

function formatDateValueFromDate(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(
    2,
    "0",
  )}-${String(value.getDate()).padStart(2, "0")}`;
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

  return readVisitorLifecycleRank(left) - readVisitorLifecycleRank(right);
}

function readVisitorLifecycleRank(submission: DispatcherSubmission) {
  if (submission.formId === "visitor") {
    return 0;
  }

  if (submission.formId === "visitor_exit") {
    return 1;
  }

  return 0;
}

function readTimestamp(value: string) {
  const timestamp = Date.parse(value);

  return Number.isNaN(timestamp) ? 0 : timestamp;
}
