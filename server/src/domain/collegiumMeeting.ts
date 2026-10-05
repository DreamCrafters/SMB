import {
  collegiumDecisionLabels,
  collegiumMeetingDecisions,
  collegiumMeetingDecisionsRequiringComment,
  collegiumMeetingFormatLabels,
  collegiumMeetingFormats,
  type CollegiumItemDecision,
  type CollegiumMeeting,
  type CollegiumMeetingDecision,
  type CollegiumMeetingDetailsInput,
  type CollegiumMeetingFormat,
} from "../contracts/collegiumInitiatives.js";
import { CollegiumInitiativeError, readCollegiumOptionalText } from "./collegiumInitiative.js";
import { readReworkRequest } from "./collegiumInitiativeWorkflow.js";

const maxPeople = 60;
const maxResponsible = 10;
const maxDurationMinutes = 240;
const maxProtocolLength = 60_000;
const accountPattern = /^account:[A-Za-z0-9_-]{1,100}$/u;

export function readCollegiumMeetingDetails(input: unknown): CollegiumMeetingDetailsInput {
  const record = readRecord(input, "Передайте реквизиты заседания.");
  rejectUnknown(record, [
    "meetingDate",
    "meetingTime",
    "format",
    "location",
    "participantIds",
    "absentIds",
    "quorumNote",
  ]);
  const meetingDate = readCollegiumOptionalText(record.meetingDate, 10, "Дата заседания");
  if (!isCalendarDate(meetingDate)) {
    throw new CollegiumInitiativeError("Укажите дату заседания.");
  }
  const meetingTime = readCollegiumOptionalText(record.meetingTime, 5, "Время заседания");
  if (!/^([01]\d|2[0-3]):[0-5]\d$/u.test(meetingTime)) {
    throw new CollegiumInitiativeError("Укажите время заседания в формате ЧЧ:ММ.");
  }
  if (!(collegiumMeetingFormats as readonly unknown[]).includes(record.format)) {
    throw new CollegiumInitiativeError("Выберите формат заседания.");
  }
  const participantIds = readAccountList(record.participantIds, maxPeople, "Участники");
  const absentIds = readAccountList(record.absentIds, maxPeople, "Отсутствующие");
  if (absentIds.some((id) => participantIds.includes(id))) {
    throw new CollegiumInitiativeError("Один человек не может быть и участником, и отсутствующим.");
  }
  return {
    meetingDate,
    meetingTime,
    format: record.format as CollegiumMeetingFormat,
    location: readCollegiumOptionalText(record.location, 500, "Место или ссылка на ВКС"),
    participantIds,
    absentIds,
    quorumNote: readCollegiumOptionalText(record.quorumNote, 500, "Кворум"),
  };
}

export function readCollegiumAgendaItemRequest(input: unknown) {
  const record = readRecord(input, "Передайте вопрос повестки.");
  rejectUnknown(record, ["revision", "initiativeId", "speakerId", "participantIds", "durationMinutes"]);
  const initiativeId = readCollegiumOptionalText(record.initiativeId, 100, "Инициатива");
  if (initiativeId === "") throw new CollegiumInitiativeError("Выберите инициативу.");
  const speakerId = readCollegiumOptionalText(record.speakerId, 120, "Докладчик");
  if (speakerId !== "" && !accountPattern.test(speakerId)) {
    throw new CollegiumInitiativeError("Выберите докладчика из учётных записей.");
  }
  const durationMinutes = record.durationMinutes ?? 15;
  if (
    typeof durationMinutes !== "number" ||
    !Number.isInteger(durationMinutes) ||
    durationMinutes < 1 ||
    durationMinutes > maxDurationMinutes
  ) {
    throw new CollegiumInitiativeError(`Регламент вопроса — от 1 до ${maxDurationMinutes} минут.`);
  }
  return {
    revision: readRevision(record.revision),
    initiativeId,
    speakerId,
    participantIds: readAccountList(record.participantIds, maxPeople, "Участники вопроса"),
    durationMinutes,
  };
}

/** Проект решения вопроса; инициатива меняется только при утверждении протокола. */
export function readCollegiumItemDecision(input: unknown, today: string): CollegiumItemDecision {
  const record = readRecord(input, "Передайте решение.");
  rejectUnknown(record, [
    "decision",
    "comment",
    "responsibleIds",
    "dueDate",
    "kpi",
    "dissent",
    "rework",
  ]);
  if (!(collegiumMeetingDecisions as readonly unknown[]).includes(record.decision)) {
    throw new CollegiumInitiativeError("Выберите решение Коллегии.");
  }
  const decision = record.decision as CollegiumMeetingDecision;
  const comment = readCollegiumOptionalText(record.comment, 2000, "Комментарий к решению");
  if (collegiumMeetingDecisionsRequiringComment.includes(decision) && comment === "") {
    throw new CollegiumInitiativeError("Укажите комментарий к решению.");
  }
  const dueDate = readCollegiumOptionalText(record.dueDate, 10, "Срок");
  if (dueDate !== "" && !isCalendarDate(dueDate)) {
    throw new CollegiumInitiativeError("Проверьте срок.");
  }
  if (decision !== "return_for_rework" && record.rework !== undefined) {
    throw new CollegiumInitiativeError("Запрос доработки передаётся только с решением о доработке.");
  }
  return {
    decision,
    comment,
    responsibleIds: readAccountList(record.responsibleIds, maxResponsible, "Ответственные"),
    dueDate,
    kpi: readCollegiumOptionalText(record.kpi, 1000, "KPI"),
    dissent: readCollegiumOptionalText(record.dissent, 2000, "Особые мнения"),
    ...(decision === "return_for_rework" ? { rework: readReworkRequest(record.rework, today) } : {}),
  };
}

export function readCollegiumProtocolText(input: unknown) {
  const record = readRecord(input, "Передайте текст протокола.");
  rejectUnknown(record, ["revision", "text"]);
  const text = typeof record.text === "string" ? record.text.replace(/\r\n/gu, "\n").trim() : "";
  if (text === "") throw new CollegiumInitiativeError("Текст протокола не может быть пустым.");
  if (text.length > maxProtocolLength) {
    throw new CollegiumInitiativeError("Протокол слишком длинный.");
  }
  return { revision: readRevision(record.revision), text };
}

export function readCollegiumRevisionRequest(input: unknown, allowComment = false) {
  const record = readRecord(input, "Передайте ревизию заседания.");
  rejectUnknown(record, allowComment ? ["revision", "comment"] : ["revision"]);
  return {
    revision: readRevision(record.revision),
    comment: readCollegiumOptionalText(record.comment, 2000, "Комментарий"),
  };
}

export function readCollegiumMeetingRevision(input: unknown) {
  return readRevision(readRecord(input, "Передайте ревизию заседания.").revision);
}

/**
 * Проект протокола из структурированных данных заседания. Секретарь может
 * отредактировать текст, но решения применяются из вопросов повестки.
 */
export function buildCollegiumProtocolDraft(
  meeting: CollegiumMeeting,
  name: (accountId: string) => string,
) {
  const people = (ids: readonly string[]) =>
    ids.length === 0 ? "—" : ids.map((id) => name(id) || "учётная запись недоступна").join(", ");
  const items = meeting.items.filter((item) => item.removedAt === undefined);
  const lines = [
    `ПРОТОКОЛ заседания Коллегии № ${meeting.number}`,
    "",
    `Дата и время: ${formatDate(meeting.meetingDate)} ${meeting.meetingTime}`,
    `Формат: ${collegiumMeetingFormatLabels[meeting.format]}${meeting.location === "" ? "" : `, ${meeting.location}`}`,
    `Присутствовали: ${people(meeting.participantIds)}`,
    `Отсутствовали: ${people(meeting.absentIds)}`,
    `Кворум: ${meeting.quorumNote || "—"}`,
    "",
    "ПОВЕСТКА",
    ...items.map((item, index) =>
      `${index + 1}. ${item.initiativeNumber} «${item.snapshot.card.title}»` +
        (item.speakerId === "" ? "" : `, докладчик — ${people([item.speakerId])}`)),
    "",
    "РЕШЕНИЯ",
  ];
  items.forEach((item, index) => {
    const decision = item.decision;
    lines.push(`${index + 1}. По вопросу «${item.snapshot.card.title}» (${item.initiativeNumber}):`);
    if (decision === undefined) {
      lines.push("   Решение не принято.");
      return;
    }
    lines.push(`   Решение: ${collegiumDecisionLabels[decision.decision]}.`);
    if (decision.comment !== "") lines.push(`   ${decision.comment}`);
    if (decision.responsibleIds.length > 0) lines.push(`   Ответственные: ${people(decision.responsibleIds)}.`);
    if (decision.dueDate !== "") lines.push(`   Срок: ${formatDate(decision.dueDate)}.`);
    if (decision.kpi !== "") lines.push(`   KPI: ${decision.kpi}.`);
    if (decision.rework !== undefined) {
      lines.push(`   Замечания: ${decision.rework.remarks.join("; ")}.`);
      lines.push(`   Доработать до ${formatDate(decision.rework.dueDate)}, ответственный — ${people([decision.rework.responsibleId])}.`);
    }
    if (decision.dissent !== "") lines.push(`   Особые мнения и разногласия: ${decision.dissent}`);
  });
  return lines.join("\n");
}

function readAccountList(value: unknown, maxItems: number, label: string) {
  const list = value ?? [];
  if (
    !Array.isArray(list) ||
    !list.every((item) => typeof item === "string" && accountPattern.test(item)) ||
    new Set(list).size !== list.length ||
    list.length > maxItems
  ) {
    throw new CollegiumInitiativeError(`Проверьте список «${label}».`);
  }
  return list as string[];
}

function readRevision(value: unknown) {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    throw new CollegiumInitiativeError("Передайте ревизию заседания.");
  }
  return value;
}

function readRecord(input: unknown, message: string) {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new CollegiumInitiativeError(message);
  }
  return input as Record<string, unknown>;
}

function rejectUnknown(record: Record<string, unknown>, allowed: readonly string[]) {
  if (Object.keys(record).some((key) => !allowed.includes(key))) {
    throw new CollegiumInitiativeError("Запрос содержит неизвестные поля.");
  }
}

function isCalendarDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function formatDate(value: string) {
  const [year, month, day] = value.split("-");
  return `${day}.${month}.${year}`;
}
