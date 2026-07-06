import {
  getDispatcherFormDefinition,
  type DispatcherFormField,
} from "../domain/dispatcherForms.js";
import type { DispatcherSubmission } from "../domain/dispatcherSubmission.js";

export type NotificationRecipientGroups = {
  incidentAndEquipment: string[];
  mechanicalDowntime: string[];
  electricalDowntime: string[];
};

export function readDispatcherNotificationRecipients(
  submission: DispatcherSubmission,
  recipients: NotificationRecipientGroups,
) {
  if (submission.formId !== "equipment" && !isIncidentForm(submission.formId)) {
    return [];
  }

  const values = [...recipients.incidentAndEquipment];
  const notificationText = readSpecializedNotificationText(submission);

  if (isMechanicalDowntimeReason(notificationText)) {
    values.push(...recipients.mechanicalDowntime);
  }

  if (isElectricalDowntimeReason(notificationText)) {
    values.push(...recipients.electricalDowntime);
  }

  return dedupeValues(values);
}

export function buildDispatcherNotificationSubject(
  submission: DispatcherSubmission,
  subjectPrefix: string,
) {
  const prefix = subjectPrefix.length > 0 ? `[${subjectPrefix}] ` : "";

  if (submission.formId === "incident") {
    return `${prefix}Открытие инцидента ${readIncidentNumber(submission)}`;
  }

  if (submission.formId === "incident_close") {
    return `${prefix}Закрытие инцидента ${readIncidentNumber(submission)}`;
  }

  if (submission.formId === "equipment") {
    const equipment = submission.payload.equipment?.trim();

    return `${prefix}Отчет по оборудованию${
      equipment === undefined || equipment.length === 0 ? "" : `: ${equipment}`
    }`;
  }

  return `${prefix}${submission.formTitle}`;
}

export function buildDispatcherNotificationText(
  submission: DispatcherSubmission,
) {
  const form = getDispatcherFormDefinition(submission.formId);
  const payloadLines = Object.entries(submission.payload).map(([key, value]) => {
    const field = form?.fields.find((item) => item.name === key);

    return `${readFieldLabel(field, key)}: ${value}`;
  });

  return [
    `Форма: ${submission.formTitle}`,
    `Статус: ${submission.status}`,
    `Бизнес-аккаунт: ${submission.businessAccountId}`,
    `Кратко: ${submission.summary}`,
    `Получено: ${submission.receivedAt}`,
    "",
    "Данные:",
    ...payloadLines,
  ].join("\n");
}

function isIncidentForm(formId: DispatcherSubmission["formId"]) {
  return formId === "incident" || formId === "incident_close";
}

function isMechanicalDowntimeReason(value: string) {
  return normalizeRussianText(value).includes("мех");
}

function isElectricalDowntimeReason(value: string) {
  return normalizeRussianText(value).includes("эл");
}

function readSpecializedNotificationText(submission: DispatcherSubmission) {
  return [
    submission.payload.downtimeReason,
    submission.payload.incidentType,
    submission.payload.description,
    submission.payload.rootCauses,
    submission.payload.preventiveMeasures,
    submission.payload.note,
    submission.payload.closureNote,
    submission.summary,
  ]
    .filter((value): value is string => value !== undefined)
    .join(" ");
}

function readIncidentNumber(submission: DispatcherSubmission) {
  const incidentNumber = submission.payload.incidentNumber?.trim();

  return incidentNumber === undefined || incidentNumber.length === 0
    ? submission.id
    : incidentNumber;
}

function readFieldLabel(field: DispatcherFormField | undefined, fallback: string) {
  return field?.label ?? fallback;
}

function dedupeValues(values: readonly string[]) {
  const result: string[] = [];
  const seen = new Set<string>();

  for (const value of values) {
    const trimmed = value.trim();
    const normalizedValue = trimmed.toLocaleLowerCase("en-US");

    if (normalizedValue.length === 0 || seen.has(normalizedValue)) {
      continue;
    }

    seen.add(normalizedValue);
    result.push(trimmed);
  }

  return result;
}

function normalizeRussianText(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("ru-RU");
}
