import type {
  DispatcherFormDefinition,
  DispatcherSubmission,
  DispatcherSubmissionPayload,
} from "../contracts";

export type DispatcherEquipmentDraftStorage = Pick<
  Storage,
  "getItem" | "setItem"
>;

type EquipmentDraftState = {
  version: 2;
  lastEquipment?: string;
  draftsByReportDate: Record<
    string,
    Record<string, DispatcherSubmissionPayload>
  >;
  reportPayloadsByReportDate: Record<
    string,
    Record<string, DispatcherSubmissionPayload>
  >;
};

const draftStorageKey = "smb-monitor.dispatcher-equipment-drafts.v2";
const equipmentDraftStateVersion = 2;
const dateFieldNames = new Set(["reportDate", "reportMonth"]);

export function readEquipmentOptions(form: DispatcherFormDefinition) {
  return form.fields.find((field) => field.name === "equipment")?.options ?? [];
}

export function readLastEquipmentOption({
  equipmentOptions,
  storage,
}: {
  equipmentOptions: readonly string[];
  storage: DispatcherEquipmentDraftStorage | undefined;
}) {
  const state = readEquipmentDraftState(storage);
  const equipment = state.lastEquipment;

  return equipment !== undefined && equipmentOptions.includes(equipment)
    ? equipment
    : undefined;
}

export function writeLastEquipmentOption({
  equipment,
  storage,
}: {
  equipment: string;
  storage: DispatcherEquipmentDraftStorage | undefined;
}) {
  if (equipment.length === 0) {
    return false;
  }

  const state = readEquipmentDraftState(storage);

  return writeEquipmentDraftState(storage, {
    ...state,
    lastEquipment: equipment,
  });
}

export function readEquipmentDraftPayload({
  equipment,
  form,
  reportDate,
  storage,
}: {
  equipment: string;
  form: DispatcherFormDefinition;
  reportDate: string;
  storage: DispatcherEquipmentDraftStorage | undefined;
}) {
  const draft = readDateScopedEquipmentPayload(
    readEquipmentDraftState(storage).draftsByReportDate,
    reportDate,
    equipment,
  );

  return draft === undefined
    ? {}
    : cleanEquipmentDraftPayload(draft, form);
}

export function readEquipmentReportEntryPayload({
  equipment,
  form,
  reportDate,
  storage,
}: {
  equipment: string;
  form: DispatcherFormDefinition;
  reportDate: string;
  storage: DispatcherEquipmentDraftStorage | undefined;
}) {
  const payload = readDateScopedEquipmentPayload(
    readEquipmentDraftState(storage)
      .reportPayloadsByReportDate,
    reportDate,
    equipment,
  );

  return payload === undefined
    ? {}
    : cleanEquipmentDraftPayload(payload, form);
}

export function writeEquipmentDraftPayload({
  equipment,
  form,
  payload,
  reportDate,
  storage,
}: {
  equipment: string;
  form: DispatcherFormDefinition;
  payload: DispatcherSubmissionPayload;
  reportDate: string;
  storage: DispatcherEquipmentDraftStorage | undefined;
}) {
  const reportDateKey = readReportDateStorageKey(reportDate);

  if (equipment.length === 0 || reportDateKey.length === 0) {
    return false;
  }

  const state = readEquipmentDraftState(storage);
  const currentDrafts = state.draftsByReportDate[reportDateKey] ?? {};

  return writeEquipmentDraftState(storage, {
    ...state,
    lastEquipment: equipment,
    draftsByReportDate: {
      ...state.draftsByReportDate,
      [reportDateKey]: {
        ...currentDrafts,
        [equipment]: cleanEquipmentDraftPayload(payload, form),
      },
    },
  });
}

export function writeEquipmentReportEntryPayload({
  equipment,
  form,
  payload,
  reportDate,
  storage,
}: {
  equipment: string;
  form: DispatcherFormDefinition;
  payload: DispatcherSubmissionPayload;
  reportDate: string;
  storage: DispatcherEquipmentDraftStorage | undefined;
}) {
  const reportDateKey = readReportDateStorageKey(reportDate);

  if (equipment.length === 0 || reportDateKey.length === 0) {
    return false;
  }

  const state = readEquipmentDraftState(storage);
  const currentReportPayloads =
    state.reportPayloadsByReportDate[reportDateKey] ?? {};

  return writeEquipmentDraftState(storage, {
    ...state,
    lastEquipment: equipment,
    reportPayloadsByReportDate: {
      ...state.reportPayloadsByReportDate,
      [reportDateKey]: {
        ...currentReportPayloads,
        [equipment]: cleanEquipmentDraftPayload(payload, form),
      },
    },
  });
}

export function buildEquipmentFormPayload({
  equipment,
  form,
  savedDraft,
  todayDate,
}: {
  equipment: string;
  form: DispatcherFormDefinition;
  savedDraft: DispatcherSubmissionPayload;
  todayDate: string;
}) {
  const payload: DispatcherSubmissionPayload = {};

  for (const field of form.fields) {
    if (field.name === "reportDate") {
      payload[field.name] = todayDate;
      continue;
    }

    if (field.name === "equipment") {
      payload[field.name] = equipment;
      continue;
    }

    payload[field.name] = savedDraft[field.name] ?? "";
  }

  return payload;
}

export function buildEquipmentReportPayloads({
  equipmentOptions,
  form,
  reportDate,
  storage,
}: {
  equipmentOptions: readonly string[];
  form: DispatcherFormDefinition;
  reportDate: string;
  storage: DispatcherEquipmentDraftStorage | undefined;
}) {
  const state = readEquipmentDraftState(storage);
  const reportPayloadsByEquipment =
    state.reportPayloadsByReportDate[readReportDateStorageKey(reportDate)] ?? {};
  const payloads: DispatcherSubmissionPayload[] = [];

  for (const equipment of equipmentOptions) {
    const savedDraft = reportPayloadsByEquipment[equipment];

    if (savedDraft === undefined || !hasEquipmentReportData(savedDraft)) {
      continue;
    }

    payloads.push(
      buildEquipmentFormPayload({
        equipment,
        form,
        savedDraft,
        todayDate: reportDate,
      }),
    );
  }

  return payloads;
}

export function buildEquipmentCompletionMap(
  submissions: readonly DispatcherSubmission[],
  reportDate: string,
) {
  const completionMap = new Map<string, DispatcherSubmission>();

  if (reportDate.length === 0) {
    return completionMap;
  }

  for (const submission of submissions) {
    if (submission.formId !== "equipment") {
      continue;
    }

    const equipment = submission.payload.equipment?.trim();

    if (
      equipment === undefined ||
      equipment.length === 0 ||
      !isSameReportDate(submission.payload.reportDate, reportDate)
    ) {
      continue;
    }

    const currentSubmission = completionMap.get(equipment);

    if (
      currentSubmission === undefined ||
      submission.receivedAt > currentSubmission.receivedAt
    ) {
      completionMap.set(equipment, submission);
    }
  }

  return completionMap;
}

export function hasEquipmentReportData(payload: DispatcherSubmissionPayload) {
  return [
    payload.productionTons,
    payload.downtimeReason,
    payload.downtimeHours,
    payload.note,
  ].some((value) => value !== undefined && value.trim().length > 0);
}

export function isEquipmentReportEntryDirty({
  currentPayload,
  form,
  reportPayload,
}: {
  currentPayload: DispatcherSubmissionPayload;
  form: DispatcherFormDefinition;
  reportPayload: DispatcherSubmissionPayload;
}) {
  if (!hasEquipmentReportData(reportPayload)) {
    return false;
  }

  const currentCleanPayload = cleanEquipmentDraftPayload(currentPayload, form);
  const reportCleanPayload = cleanEquipmentDraftPayload(reportPayload, form);

  for (const field of form.fields) {
    if (field.name === "equipment" || dateFieldNames.has(field.name)) {
      continue;
    }

    if (
      (currentCleanPayload[field.name] ?? "") !==
      (reportCleanPayload[field.name] ?? "")
    ) {
      return true;
    }
  }

  return false;
}

export function formatReportDateForPayload(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  return match === null ? value : `${match[3]}.${match[2]}.${match[1]}`;
}

export function formatReportDateForDisplay(value: string) {
  return formatReportDateForPayload(value);
}

function readEquipmentDraftState(
  storage: DispatcherEquipmentDraftStorage | undefined,
): EquipmentDraftState {
  if (storage === undefined) {
    return createEmptyEquipmentDraftState();
  }

  let rawValue: string | null;

  try {
    rawValue = storage.getItem(draftStorageKey);
  } catch {
    return createEmptyEquipmentDraftState();
  }

  if (rawValue === null) {
    return createEmptyEquipmentDraftState();
  }

  try {
    return parseEquipmentDraftState(JSON.parse(rawValue));
  } catch {
    return createEmptyEquipmentDraftState();
  }
}

function writeEquipmentDraftState(
  storage: DispatcherEquipmentDraftStorage | undefined,
  state: EquipmentDraftState,
) {
  if (storage === undefined) {
    return false;
  }

  try {
    storage.setItem(draftStorageKey, JSON.stringify(state));

    return true;
  } catch {
    return false;
  }
}

function parseEquipmentDraftState(value: unknown): EquipmentDraftState {
  if (!isRecord(value)) {
    return createEmptyEquipmentDraftState();
  }

  const isCurrentState = value.version === equipmentDraftStateVersion;
  const todayDateKey = readCurrentReportDateStorageKey();
  const draftsByReportDate = readDraftsByReportDate(value.draftsByReportDate);
  const storedReportPayloadsByReportDate = readDraftsByReportDate(
    value.reportPayloadsByReportDate,
  );
  const reportPayloadsByReportDate = isCurrentState
    ? storedReportPayloadsByReportDate
    : {};
  const legacyDraftsByEquipment = readDraftsByEquipment(
    value.draftsByEquipment,
  );
  const legacyReportPayloadsByEquipment = readDraftsByEquipment(
    value.reportPayloadsByEquipment,
  );

  if (
    Object.keys(legacyDraftsByEquipment).length > 0 &&
    draftsByReportDate[todayDateKey] === undefined
  ) {
    draftsByReportDate[todayDateKey] = legacyDraftsByEquipment;
  }

  if (!isCurrentState) {
    for (const [reportDate, reportPayloadsByEquipment] of Object.entries(
      storedReportPayloadsByReportDate,
    )) {
      draftsByReportDate[reportDate] = {
        ...reportPayloadsByEquipment,
        ...(draftsByReportDate[reportDate] ?? {}),
      };
    }
  }

  if (
    Object.keys(legacyReportPayloadsByEquipment).length > 0 &&
    draftsByReportDate[todayDateKey] === undefined
  ) {
    draftsByReportDate[todayDateKey] = legacyReportPayloadsByEquipment;
  }

  return {
    version: equipmentDraftStateVersion,
    lastEquipment:
      typeof value.lastEquipment === "string" ? value.lastEquipment : undefined,
    draftsByReportDate,
    reportPayloadsByReportDate,
  };
}

function readDateScopedEquipmentPayload(
  payloadsByReportDate: Record<
    string,
    Record<string, DispatcherSubmissionPayload>
  >,
  reportDate: string,
  equipment: string,
) {
  const reportDateKey = readReportDateStorageKey(reportDate);

  if (reportDateKey.length === 0) {
    return undefined;
  }

  return payloadsByReportDate[reportDateKey]?.[equipment];
}

function readDraftsByReportDate(value: unknown) {
  const draftsByReportDate: Record<
    string,
    Record<string, DispatcherSubmissionPayload>
  > = {};

  if (!isRecord(value)) {
    return draftsByReportDate;
  }

  for (const [reportDate, drafts] of Object.entries(value)) {
    const reportDateKey = readReportDateStorageKey(reportDate);

    if (reportDateKey.length === 0) {
      continue;
    }

    draftsByReportDate[reportDateKey] = readDraftsByEquipment(drafts);
  }

  return draftsByReportDate;
}

function readDraftsByEquipment(value: unknown) {
  const draftsByEquipment: Record<string, DispatcherSubmissionPayload> = {};

  if (!isRecord(value)) {
    return draftsByEquipment;
  }

  for (const [equipment, draft] of Object.entries(value)) {
    if (!isRecord(draft)) {
      continue;
    }

    const payload: DispatcherSubmissionPayload = {};

    for (const [fieldName, fieldValue] of Object.entries(draft)) {
      if (typeof fieldValue === "string") {
        payload[fieldName] = fieldValue;
      }
    }

    draftsByEquipment[equipment] = payload;
  }

  return draftsByEquipment;
}

function cleanEquipmentDraftPayload(
  payload: DispatcherSubmissionPayload,
  form: DispatcherFormDefinition,
) {
  const fieldNames = new Set(form.fields.map((field) => field.name));
  const cleanedPayload: DispatcherSubmissionPayload = {};

  for (const [fieldName, value] of Object.entries(payload)) {
    if (
      fieldName === "equipment" ||
      dateFieldNames.has(fieldName) ||
      !fieldNames.has(fieldName)
    ) {
      continue;
    }

    cleanedPayload[fieldName] = value;
  }

  return cleanedPayload;
}

function isSameReportDate(payloadDate: string | undefined, reportDate: string) {
  if (payloadDate === undefined) {
    return false;
  }

  return (
    payloadDate === reportDate ||
    payloadDate === formatReportDateForPayload(reportDate)
  );
}

function readReportDateStorageKey(value: string) {
  const trimmedValue = value.trim();
  const scriptMatch = /^(\d{2})\.(\d{2})\.(\d{4})/.exec(trimmedValue);

  if (scriptMatch !== null) {
    return `${scriptMatch[3]}-${scriptMatch[2]}-${scriptMatch[1]}`;
  }

  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})/.exec(trimmedValue);

  if (isoMatch !== null) {
    return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  }

  return trimmedValue;
}

function readCurrentReportDateStorageKey() {
  const date = new Date();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${date.getFullYear()}-${month}-${day}`;
}

function createEmptyEquipmentDraftState(): EquipmentDraftState {
  return {
    version: equipmentDraftStateVersion,
    draftsByReportDate: {},
    reportPayloadsByReportDate: {},
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
