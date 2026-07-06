import type {
  DispatcherFormId,
  DispatcherSubmission,
  DispatcherSubmissionPayload,
} from "../contracts";

export type DispatcherFeedGroup = "equipment" | "incidents" | "visitors";

export type EquipmentSummaryRow = {
  equipment: string;
  productionTons: number;
  downtimeHours: number;
  downtimeReasons: {
    reason: string;
    hours: number;
  }[];
};

export type IncidentSummaryRow = {
  incidentNumber: string;
  status: "open" | "closed";
  openedAt: string;
  closedAt?: string;
  location?: string;
  incidentType?: string;
  criticality?: string;
  description?: string;
  approvedBy?: string;
};

export type VisitorVisitRow = {
  entryId: string;
  fio: string;
  organization?: string;
  whom?: string;
  entryAt: string;
  exitAt?: string;
};

export type OpenVisitorOption = {
  entryId: string;
  label: string;
  fio: string;
  organization?: string;
  whom?: string;
  entryAt: string;
};

type DateRange = {
  dateFrom?: string;
  dateTo?: string;
};

export type OpenVisitorEntry = {
  submission: DispatcherSubmission;
  key: string;
  entryAt: string;
};

export function readDispatcherGroupFormIds(
  group: DispatcherFeedGroup,
): readonly DispatcherFormId[] {
  switch (group) {
    case "equipment":
      return ["equipment"];
    case "incidents":
      return ["incident", "incident_close"];
    case "visitors":
      return ["visitor", "visitor_exit"];
  }
}

export function buildEquipmentSummaryRows(
  submissions: DispatcherSubmission[],
  range: DateRange,
): EquipmentSummaryRow[] {
  const rowsByEquipment = new Map<
    string,
    {
      productionTons: number;
      downtimeHours: number;
      downtimeReasons: Map<string, number>;
    }
  >();

  for (const submission of submissions) {
    if (submission.formId !== "equipment") {
      continue;
    }

    const reportDate = readPayloadDate(submission.payload.reportDate);

    if (reportDate === undefined || !isDateInRange(reportDate, range)) {
      continue;
    }

    const equipment = submission.payload.equipment?.trim();

    if (equipment === undefined || equipment.length === 0) {
      continue;
    }

    const row =
      rowsByEquipment.get(equipment) ??
      {
        productionTons: 0,
        downtimeHours: 0,
        downtimeReasons: new Map<string, number>(),
      };
    const productionTons = readNumber(submission.payload.productionTons) ?? 0;
    const downtimeHours = readNumber(submission.payload.downtimeHours) ?? 0;
    const downtimeReason = submission.payload.downtimeReason?.trim();

    row.productionTons += productionTons;
    row.downtimeHours += downtimeHours;

    if (
      downtimeReason !== undefined &&
      downtimeReason.length > 0 &&
      downtimeHours > 0
    ) {
      row.downtimeReasons.set(
        downtimeReason,
        (row.downtimeReasons.get(downtimeReason) ?? 0) + downtimeHours,
      );
    }

    rowsByEquipment.set(equipment, row);
  }

  return [...rowsByEquipment.entries()]
    .map(([equipment, row]) => ({
      equipment,
      productionTons: row.productionTons,
      downtimeHours: row.downtimeHours,
      downtimeReasons: [...row.downtimeReasons.entries()]
        .map(([reason, hours]) => ({ reason, hours }))
        .sort((left, right) => right.hours - left.hours),
    }))
    .sort((left, right) => left.equipment.localeCompare(right.equipment, "ru"));
}

export function buildIncidentSummaryRows(
  submissions: DispatcherSubmission[],
  range: DateRange,
): IncidentSummaryRow[] {
  const openings = submissions
    .filter((submission) => submission.formId === "incident")
    .sort(compareSubmissionsAscending);
  const closuresByNumber = new Map<string, DispatcherSubmission>();

  for (const closure of submissions
    .filter((submission) => submission.formId === "incident_close")
    .sort(compareSubmissionsAscending)) {
    const incidentNumber = closure.payload.incidentNumber?.trim();

    if (incidentNumber !== undefined && incidentNumber.length > 0) {
      closuresByNumber.set(incidentNumber, closure);
    }
  }

  const start = range.dateFrom === undefined ? undefined : readDateStart(range.dateFrom);
  const end = range.dateTo === undefined ? undefined : readDateEnd(range.dateTo);

  return openings
    .map((opening) => {
      const incidentNumber =
        opening.payload.incidentNumber?.trim() || opening.id;
      const closure = closuresByNumber.get(incidentNumber);
      const openedAt = readPayloadDateTime(opening.payload.datetime);
      const closedAt =
        closure === undefined
          ? undefined
          : readPayloadDateTime(closure.payload.closureDateTime);
      const status: IncidentSummaryRow["status"] =
        closure === undefined ? "open" : "closed";

      return {
        incidentNumber,
        status,
        openedAt: opening.payload.datetime ?? opening.receivedAt,
        closedAt: closure?.payload.closureDateTime,
        location: opening.payload.location,
        incidentType: opening.payload.incidentType,
        criticality: opening.payload.criticality,
        description: opening.payload.description,
        approvedBy: closure?.payload.approvedBy,
        openedAtTime: openedAt ?? readTimestamp(opening.receivedAt),
        closedAtTime: closedAt ?? readOptionalTimestamp(closure?.receivedAt),
      };
    })
    .filter((row) => {
      const openedAt = row.openedAtTime;
      const closedAt = row.closedAtTime;

      if (end !== undefined && openedAt !== undefined && openedAt > end) {
        return false;
      }

      if (start !== undefined && closedAt !== undefined && closedAt < start) {
        return false;
      }

      return true;
    })
    .sort((left, right) => (right.openedAtTime ?? 0) - (left.openedAtTime ?? 0))
    .map(({ openedAtTime: _openedAtTime, closedAtTime: _closedAtTime, ...row }) => row);
}

export function buildVisitorVisitRows(
  submissions: DispatcherSubmission[],
  date: string,
): VisitorVisitRow[] {
  const entries = submissions
    .filter((submission) => submission.formId === "visitor")
    .sort(compareSubmissionsAscending);
  const exits = submissions
    .filter((submission) => submission.formId === "visitor_exit")
    .sort(compareSubmissionsAscending);
  const exitsByEntryId = new Map<string, DispatcherSubmission>();

  for (const exit of exits) {
    const entryId = exit.payload.visitorEntryId;

    if (entryId !== undefined && entryId.length > 0) {
      exitsByEntryId.set(entryId, exit);
    }
  }

  const usedLegacyExitIds = new Set<string>();

  return entries
    .filter((entry) => readPayloadDate(entry.payload.entryAt) === date)
    .map((entry) => {
      const key = buildVisitorKey(entry.payload);
      const exit =
        exitsByEntryId.get(entry.id) ??
        exits.find((item) => {
          if (usedLegacyExitIds.has(item.id)) {
            return false;
          }

          return (
            item.payload.visitorEntryId === undefined &&
            buildVisitorKey(item.payload) === key &&
            (readPayloadDateTime(item.payload.exitAt) ?? readTimestamp(item.receivedAt)) >=
              (readPayloadDateTime(entry.payload.entryAt) ??
                readTimestamp(entry.receivedAt))
          );
        });

      if (exit !== undefined) {
        usedLegacyExitIds.add(exit.id);
      }

      return {
        entryId: entry.id,
        fio: entry.payload.fio ?? "Посетитель без ФИО",
        organization: entry.payload.organization,
        whom: entry.payload.whom,
        entryAt: entry.payload.entryAt ?? entry.receivedAt,
        exitAt: exit?.payload.exitAt,
      };
    })
    .sort((left, right) => left.entryAt.localeCompare(right.entryAt));
}

export function buildOpenVisitorOptions(
  submissions: DispatcherSubmission[],
  businessAccountId?: string,
  entryDate?: string,
): OpenVisitorOption[] {
  return buildOpenVisitorEntries(submissions, businessAccountId, entryDate)
    .map(({ submission }) => ({
      entryId: submission.id,
      label: formatOpenVisitorLabel(submission.payload),
      fio: submission.payload.fio ?? "",
      organization: submission.payload.organization,
      whom: submission.payload.whom,
      entryAt: submission.payload.entryAt ?? submission.receivedAt,
    }))
    .sort((left, right) => right.entryAt.localeCompare(left.entryAt));
}

export function findOpenVisitorByEntryPayload(
  submissions: DispatcherSubmission[],
  payload: DispatcherSubmissionPayload,
  businessAccountId?: string,
) {
  const visitorKey = buildVisitorKey(payload);

  return buildOpenVisitorEntries(submissions, businessAccountId).find(
    (entry) => entry.key === visitorKey,
  );
}

export function findOpenVisitorByEntryId(
  submissions: DispatcherSubmission[],
  visitorEntryId: string | undefined,
  businessAccountId?: string,
  entryDate?: string,
) {
  if (visitorEntryId === undefined || visitorEntryId.trim().length === 0) {
    return undefined;
  }

  return buildOpenVisitorEntries(submissions, businessAccountId, entryDate).find(
    (entry) => entry.submission.id === visitorEntryId,
  );
}

function buildOpenVisitorEntries(
  submissions: DispatcherSubmission[],
  businessAccountId?: string,
  entryDate?: string,
): OpenVisitorEntry[] {
  const openEntries: OpenVisitorEntry[] = [];

  for (const submission of submissions
    .filter(
      (item) =>
        businessAccountId === undefined ||
        item.businessAccountId === businessAccountId,
    )
    .filter((item) => item.formId === "visitor" || item.formId === "visitor_exit")
    .sort(compareSubmissionsAscending)) {
    if (submission.formId === "visitor") {
      const visitorEntryAt = submission.payload.entryAt ?? submission.receivedAt;

      if (
        entryDate !== undefined &&
        readPayloadDate(visitorEntryAt) !== entryDate
      ) {
        continue;
      }

      openEntries.push({
        submission,
        key: buildVisitorKey(submission.payload),
        entryAt: visitorEntryAt,
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

function formatOpenVisitorLabel(payload: DispatcherSubmissionPayload) {
  const parts = [
    payload.fio,
    payload.organization,
    payload.entryAt === undefined ? undefined : `вход ${payload.entryAt}`,
  ].filter((value): value is string => value !== undefined && value.length > 0);

  return parts.join(" · ");
}

function buildVisitorKey(payload: DispatcherSubmissionPayload) {
  return [payload.fio, payload.organization]
    .map((value) => value?.trim().toLocaleLowerCase("ru-RU") ?? "")
    .join("|");
}

function isDateInRange(value: string, range: DateRange) {
  if (range.dateFrom !== undefined && value < range.dateFrom) {
    return false;
  }

  if (range.dateTo !== undefined && value > range.dateTo) {
    return false;
  }

  return true;
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

function readPayloadDateTime(value: string | undefined) {
  if (value === undefined) {
    return undefined;
  }

  const scriptMatch =
    /^(\d{2})\.(\d{2})\.(\d{4})(?:\s+(\d{2}):(\d{2}))?/.exec(value);

  if (scriptMatch !== null) {
    return new Date(
      Number(scriptMatch[3]),
      Number(scriptMatch[2]) - 1,
      Number(scriptMatch[1]),
      Number(scriptMatch[4] ?? "0"),
      Number(scriptMatch[5] ?? "0"),
    ).getTime();
  }

  const isoTimestamp = Date.parse(value);

  return Number.isNaN(isoTimestamp) ? undefined : isoTimestamp;
}

function readDateStart(value: string) {
  return new Date(`${value}T00:00:00`).getTime();
}

function readDateEnd(value: string) {
  return new Date(`${value}T23:59:59.999`).getTime();
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

function readOptionalTimestamp(value: string | undefined) {
  return value === undefined ? undefined : readTimestamp(value);
}

function readNumber(value: string | undefined) {
  if (value === undefined || value.trim().length === 0) {
    return undefined;
  }

  const numberValue = Number(value);

  return Number.isFinite(numberValue) ? numberValue : undefined;
}
