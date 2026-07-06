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
  lastEquipment?: string;
  draftsByEquipment: Record<string, DispatcherSubmissionPayload>;
};

const draftStorageKeyPrefix = "smb-monitor.dispatcher-equipment-drafts.v1";
const dateFieldNames = new Set(["reportDate", "reportMonth"]);

export function readEquipmentOptions(form: DispatcherFormDefinition) {
  return form.fields.find((field) => field.name === "equipment")?.options ?? [];
}

export function readLastEquipmentOption({
  businessAccountId,
  equipmentOptions,
  storage,
}: {
  businessAccountId: string;
  equipmentOptions: readonly string[];
  storage: DispatcherEquipmentDraftStorage | undefined;
}) {
  const state = readEquipmentDraftState(storage, businessAccountId);
  const equipment = state.lastEquipment;

  return equipment !== undefined && equipmentOptions.includes(equipment)
    ? equipment
    : undefined;
}

export function writeLastEquipmentOption({
  businessAccountId,
  equipment,
  storage,
}: {
  businessAccountId: string;
  equipment: string;
  storage: DispatcherEquipmentDraftStorage | undefined;
}) {
  if (equipment.length === 0) {
    return false;
  }

  const state = readEquipmentDraftState(storage, businessAccountId);

  return writeEquipmentDraftState(storage, businessAccountId, {
    ...state,
    lastEquipment: equipment,
  });
}

export function readEquipmentDraftPayload({
  businessAccountId,
  equipment,
  form,
  storage,
}: {
  businessAccountId: string;
  equipment: string;
  form: DispatcherFormDefinition;
  storage: DispatcherEquipmentDraftStorage | undefined;
}) {
  const draft = readEquipmentDraftState(storage, businessAccountId)
    .draftsByEquipment[equipment];

  return draft === undefined
    ? {}
    : cleanEquipmentDraftPayload(draft, form);
}

export function writeEquipmentDraftPayload({
  businessAccountId,
  equipment,
  form,
  payload,
  storage,
}: {
  businessAccountId: string;
  equipment: string;
  form: DispatcherFormDefinition;
  payload: DispatcherSubmissionPayload;
  storage: DispatcherEquipmentDraftStorage | undefined;
}) {
  if (equipment.length === 0) {
    return false;
  }

  const state = readEquipmentDraftState(storage, businessAccountId);

  return writeEquipmentDraftState(storage, businessAccountId, {
    ...state,
    lastEquipment: equipment,
    draftsByEquipment: {
      ...state.draftsByEquipment,
      [equipment]: cleanEquipmentDraftPayload(payload, form),
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

export function buildEquipmentSwitchPayload({
  equipment,
  form,
  previousPayload,
  targetSavedDraft,
  todayDate,
}: {
  equipment: string;
  form: DispatcherFormDefinition;
  previousPayload: DispatcherSubmissionPayload;
  targetSavedDraft: DispatcherSubmissionPayload;
  todayDate: string;
}) {
  return buildEquipmentFormPayload({
    equipment,
    form,
    savedDraft: hasEquipmentReportData(previousPayload)
      ? previousPayload
      : targetSavedDraft,
    todayDate: previousPayload.reportDate ?? todayDate,
  });
}

export function buildEquipmentReportPayloads({
  businessAccountId,
  currentPayload,
  equipmentOptions,
  form,
  reportDate,
  storage,
}: {
  businessAccountId: string;
  currentPayload: DispatcherSubmissionPayload;
  equipmentOptions: readonly string[];
  form: DispatcherFormDefinition;
  reportDate: string;
  storage: DispatcherEquipmentDraftStorage | undefined;
}) {
  const state = readEquipmentDraftState(storage, businessAccountId);
  const payloads: DispatcherSubmissionPayload[] = [];

  for (const equipment of equipmentOptions) {
    const savedDraft =
      equipment === currentPayload.equipment
        ? {
            ...state.draftsByEquipment[equipment],
            ...cleanEquipmentDraftPayload(currentPayload, form),
          }
        : state.draftsByEquipment[equipment];

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

export function formatReportDateForPayload(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  return match === null ? value : `${match[3]}.${match[2]}.${match[1]}`;
}

export function formatReportDateForDisplay(value: string) {
  return formatReportDateForPayload(value);
}

function readEquipmentDraftState(
  storage: DispatcherEquipmentDraftStorage | undefined,
  businessAccountId: string,
): EquipmentDraftState {
  if (storage === undefined) {
    return createEmptyEquipmentDraftState();
  }

  let rawValue: string | null;

  try {
    rawValue = storage.getItem(buildEquipmentDraftStorageKey(businessAccountId));
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
  businessAccountId: string,
  state: EquipmentDraftState,
) {
  if (storage === undefined) {
    return false;
  }

  try {
    storage.setItem(
      buildEquipmentDraftStorageKey(businessAccountId),
      JSON.stringify(state),
    );

    return true;
  } catch {
    return false;
  }
}

function parseEquipmentDraftState(value: unknown): EquipmentDraftState {
  if (!isRecord(value)) {
    return createEmptyEquipmentDraftState();
  }

  return {
    lastEquipment:
      typeof value.lastEquipment === "string" ? value.lastEquipment : undefined,
    draftsByEquipment: readDraftsByEquipment(value.draftsByEquipment),
  };
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

function buildEquipmentDraftStorageKey(businessAccountId: string) {
  return `${draftStorageKeyPrefix}.${businessAccountId}`;
}

function createEmptyEquipmentDraftState(): EquipmentDraftState {
  return {
    draftsByEquipment: {},
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
