import {
  getDispatcherFormDefinition,
  type DispatcherFormField,
} from "../domain/dispatcherForms.js";
import type { DispatcherSubmission } from "../domain/dispatcherSubmission.js";

export type NotificationRecipientGroups = {
  incidentAndEquipment: string[];
  mechanicalDowntime: string[];
  electricalDowntime: string[];
  visitors: string[];
};

export type EquipmentReportNotificationStatus = "created" | "updated";

export function readDispatcherNotificationRecipients(
  submission: DispatcherSubmission,
  recipients: NotificationRecipientGroups,
) {
  if (isVisitorForm(submission.formId)) {
    return dedupeValues(recipients.visitors);
  }

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

export function readEquipmentReportNotificationRecipients(
  submissions: readonly DispatcherSubmission[],
  recipients: NotificationRecipientGroups,
) {
  const values = [...recipients.incidentAndEquipment];
  const notificationText = submissions
    .map(readSpecializedNotificationText)
    .join(" ");

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

  if (submission.formId === "visitor") {
    return `${prefix}Вход посетителя${readVisitorNameSuffix(submission)}`;
  }

  if (submission.formId === "visitor_exit") {
    return `${prefix}Выход посетителя${readVisitorNameSuffix(submission)}`;
  }

  return `${prefix}${submission.formTitle}`;
}

export function buildEquipmentReportNotificationSubject(
  submissions: readonly DispatcherSubmission[],
  subjectPrefix: string,
  status: EquipmentReportNotificationStatus,
) {
  const prefix = subjectPrefix.length > 0 ? `[${subjectPrefix}] ` : "";
  const reportDate = readEquipmentReportDate(submissions);

  return `${prefix}${
    status === "updated"
      ? "Отчет по оборудованию изменен"
      : "Отчет по оборудованию"
  }${reportDate.length === 0 ? "" : ` за ${reportDate}`}`;
}

export function buildDispatcherNotificationText(
  submission: DispatcherSubmission,
) {
  if (submission.formId === "incident") {
    return buildIncidentOpeningNotificationText(submission);
  }

  if (submission.formId === "incident_close") {
    return buildIncidentClosureNotificationText(submission);
  }

  if (submission.formId === "visitor") {
    return buildVisitorEntryNotificationText(submission);
  }

  if (submission.formId === "visitor_exit") {
    return buildVisitorExitNotificationText(submission);
  }

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

export function buildEquipmentReportNotificationText(
  submissions: readonly DispatcherSubmission[],
  status: EquipmentReportNotificationStatus,
) {
  const reportDate = readEquipmentReportDate(submissions);
  const header =
    status === "updated"
      ? "Отчет по оборудованию изменен!"
      : "Отчет по оборудованию!";
  const lines = [
    header,
    ...(reportDate.length === 0 ? [] : [`Дата отчета: ${reportDate}`]),
    `Позиций в отчете: ${submissions.length}`,
    "",
    ...submissions
      .slice()
      .sort((left, right) =>
        readEquipmentName(left).localeCompare(readEquipmentName(right), "ru"),
      )
      .flatMap((submission) => buildEquipmentReportLines(submission)),
  ];

  return lines.join("\n");
}

function isIncidentForm(formId: DispatcherSubmission["formId"]) {
  return formId === "incident" || formId === "incident_close";
}

function isVisitorForm(formId: DispatcherSubmission["formId"]) {
  return formId === "visitor" || formId === "visitor_exit";
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

function buildIncidentOpeningNotificationText(submission: DispatcherSubmission) {
  return [
    "Новый инцидент!",
    `Дата и время инцидента: ${readPayloadValue(submission, "datetime")}`,
    `Место (цех/участок): ${readPayloadValue(submission, "location")}`,
    `Тип инцидента: ${readPayloadValue(submission, "incidentType")}`,
    `Описание: ${readPayloadValue(submission, "description")}`,
    `Критичность: ${readPayloadValue(submission, "criticality")}`,
    `Ответственный за регистрацию: ${readPayloadValue(submission, "responsible")}`,
    `Оперативные меры: ${readPayloadValue(submission, "immediateActions")}`,
    `Статус: ${readPayloadValue(submission, "incidentStatus")}`,
    `Номер инцидента: ${readIncidentNumber(submission)}`,
  ].join("\n");
}

function buildIncidentClosureNotificationText(submission: DispatcherSubmission) {
  return [
    "Инцидент закрыт!",
    `Номер инцидента: ${readIncidentNumber(submission)}`,
    `Корневые причины: ${readPayloadValue(submission, "rootCauses")}`,
    `Предотвращающие меры: ${readPayloadValue(submission, "preventiveMeasures")}`,
    `Дата и время закрытия: ${readPayloadValue(submission, "closureDateTime")}`,
    `Затраты (убытки), руб: ${readPayloadValue(submission, "costs")}`,
    `Кто утвердил закрытие: ${readPayloadValue(submission, "approvedBy")}`,
    `Примечание: ${readPayloadValue(submission, "closureNote")}`,
    `Статус: ${readPayloadValue(submission, "incidentStatus")}`,
  ].join("\n");
}

function buildEquipmentReportLines(submission: DispatcherSubmission) {
  let line = `${readEquipmentName(submission)}: выработка ${readPayloadValue(
    submission,
    "productionTons",
    "0",
  )} т; простой ${readPayloadValue(submission, "downtimeHours", "0")} ч`;
  const downtimeReason = submission.payload.downtimeReason?.trim();
  const note = submission.payload.note?.trim();

  if (downtimeReason !== undefined && downtimeReason.length > 0) {
    line += `; причина: ${downtimeReason}`;
  }

  if (note !== undefined && note.length > 0) {
    line += `; примечание: ${note}`;
  }

  return [line];
}

function buildVisitorEntryNotificationText(submission: DispatcherSubmission) {
  return [
    "Посетитель вошел!",
    `ФИО посетителя: ${readPayloadValue(submission, "fio")}`,
    ...buildOptionalPayloadLine(submission, "position", "Должность"),
    ...buildOptionalPayloadLine(submission, "organization", "Организация"),
    ...buildOptionalPayloadLine(submission, "purpose", "Цель визита"),
    ...buildOptionalPayloadLine(submission, "whom", "Кого посещает"),
    `Время входа: ${readPayloadValue(submission, "entryAt", submission.receivedAt)}`,
    ...buildOptionalPayloadLine(submission, "note", "Примечание"),
  ].join("\n");
}

function buildVisitorExitNotificationText(submission: DispatcherSubmission) {
  return [
    "Посетитель вышел!",
    `ФИО посетителя: ${readPayloadValue(submission, "fio")}`,
    ...buildOptionalPayloadLine(submission, "position", "Должность"),
    ...buildOptionalPayloadLine(submission, "organization", "Организация"),
    ...buildOptionalPayloadLine(submission, "purpose", "Цель визита"),
    ...buildOptionalPayloadLine(submission, "whom", "Кого посещал"),
    `Время входа: ${readPayloadValue(submission, "entryAt")}`,
    `Время выхода: ${readPayloadValue(
      submission,
      "exitAt",
      submission.receivedAt,
    )}`,
  ].join("\n");
}

function readEquipmentReportDate(submissions: readonly DispatcherSubmission[]) {
  return submissions[0]?.payload.reportDate?.trim() ?? "";
}

function readEquipmentName(submission: DispatcherSubmission) {
  return submission.payload.equipment?.trim() ?? "Оборудование";
}

function readPayloadValue(
  submission: DispatcherSubmission,
  fieldName: string,
  fallback = "",
) {
  const value = submission.payload[fieldName]?.trim();

  return value === undefined || value.length === 0 ? fallback : value;
}

function buildOptionalPayloadLine(
  submission: DispatcherSubmission,
  fieldName: string,
  label: string,
) {
  const value = readPayloadValue(submission, fieldName);

  return value.length === 0 ? [] : [`${label}: ${value}`];
}

function readVisitorNameSuffix(submission: DispatcherSubmission) {
  const fio = readPayloadValue(submission, "fio");

  return fio.length === 0 ? "" : `: ${fio}`;
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
