import type {
  CollegiumBoardReport,
  CollegiumInitiative,
  CollegiumInitiativeRevision,
  CollegiumInitiativeStatus,
  CollegiumReference,
  CollegiumSettingsInput,
} from "../contracts/collegiumInitiatives.js";
import type { DirectorAssignment } from "../contracts/directorAssignments.js";
import { collegiumPlannedEffectStatuses } from "./collegiumDashboard.js";
import { fromKopecks } from "./collegiumEconomics.js";
import {
  buildCollegiumEffectControlRows,
  readCollegiumConfirmedKopecks,
  readCollegiumPlannedKopecks,
} from "./collegiumEffectControl.js";
import { CollegiumInitiativeError } from "./collegiumInitiative.js";

const topLimit = 10;
const deviationLimit = 20;
const activeStatuses: readonly CollegiumInitiativeStatus[] = [
  "preliminary_review", "rework", "ready", "on_agenda", "in_discussion", "needs_elaboration",
  "approved_pilot", "approved_implementation", "board_referral", "in_progress", "result_confirmation",
];

function moscowDate(iso: string) {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Moscow" }).format(new Date(iso));
}

/** Квартал `ГГГГ-QN` с границами по Москве; пусто — текущий квартал. */
export function readCollegiumQuarter(value: string | null, today: string) {
  const text = (value ?? "").trim();
  const match = /^(\d{4})-Q([1-4])$/u.exec(text === "" ? `${today.slice(0, 4)}-Q${Math.floor((Number(today.slice(5, 7)) - 1) / 3) + 1}` : text);
  if (match === null || Number(match[1]) < 2000) {
    throw new CollegiumInitiativeError("Квартал указывается как ГГГГ-QN, например 2026-Q4.");
  }
  const year = Number(match[1]);
  const quarter = Number(match[2]);
  const firstMonth = (quarter - 1) * 3 + 1;
  const end = new Date(Date.UTC(year, firstMonth + 2, 0));
  return {
    quarter: `${year}-Q${quarter}`,
    from: `${year}-${String(firstMonth).padStart(2, "0")}-01`,
    to: end.toISOString().slice(0, 10),
  };
}

function normalizeImportance(value: string) {
  return value.trim().replace(/\s+/gu, " ").toLocaleLowerCase("ru-RU");
}

/**
 * Состояние инициативы на дату по ревизиям: статус и карточка последней
 * ревизии, контроль эффекта — последний снимок; подтверждения до среза 10
 * берутся из текущего состояния по дате подтверждения.
 */
function stateAt(
  initiative: CollegiumInitiative,
  revisions: readonly CollegiumInitiativeRevision[],
  asOf: string,
): CollegiumInitiative | undefined {
  const past = revisions
    .filter((revision) => moscowDate(revision.createdAt) <= asOf)
    .sort((left, right) => left.revision - right.revision);
  const last = past.at(-1);
  if (last === undefined) return undefined;
  const snapshot = past.filter((revision) => revision.effectSnapshot !== undefined).at(-1)?.effectSnapshot ?? {};
  const legacy = initiative.workflow.effectConfirmation;
  const workflow: CollegiumInitiative["workflow"] = { ...snapshot };
  if (workflow.effectConfirmation === undefined && legacy !== undefined && legacy.effects === undefined &&
    moscowDate(legacy.confirmedAt) <= asOf) {
    workflow.effectConfirmation = legacy;
  }
  return { ...initiative, status: last.status, card: last.card, workflow };
}

function ref(initiative: CollegiumInitiative) {
  return { id: initiative.id, number: initiative.number, title: initiative.card.title };
}

/** Квартальный отчёт для СД (ТЗ 13.3) по инициативам, видимым пользователю. */
export function buildCollegiumBoardReport({
  period,
  today,
  initiatives,
  revisions,
  assignments,
  settings,
  reference,
}: {
  period: { quarter: string; from: string; to: string };
  today: string;
  initiatives: readonly CollegiumInitiative[];
  revisions: ReadonlyMap<string, readonly CollegiumInitiativeRevision[]>;
  assignments: readonly DirectorAssignment[];
  settings: CollegiumSettingsInput;
  reference: CollegiumReference;
}): CollegiumBoardReport {
  const asOf = period.to < today ? period.to : today;
  const states = initiatives
    .map((initiative) => stateAt(initiative, revisions.get(initiative.id) ?? [], asOf))
    .filter((state): state is CollegiumInitiative => state !== undefined && state.status !== "draft");
  const inQuarter = (toStatuses: readonly CollegiumInitiativeStatus[]) => new Set(initiatives.flatMap((initiative) =>
    (revisions.get(initiative.id) ?? []).some((revision) =>
      revision.event !== undefined &&
      toStatuses.includes(revision.event.toStatus) &&
      moscowDate(revision.createdAt) >= period.from &&
      moscowDate(revision.createdAt) <= period.to)
      ? [initiative.id]
      : [])).size;

  let planned = 0n;
  let confirmed = 0n;
  const implemented: Array<{ state: CollegiumInitiative; amount: bigint }> = [];
  for (const state of states) {
    if (collegiumPlannedEffectStatuses.includes(state.status)) planned += readCollegiumPlannedKopecks(state) ?? 0n;
    const amount = readCollegiumConfirmedKopecks(state);
    if (amount !== undefined) {
      confirmed += amount;
      if (amount > 0n) implemented.push({ state, amount });
    }
  }

  const deviations = states.flatMap((state) => buildCollegiumEffectControlRows(state)
    .filter((row) => row.fact !== undefined && row.deviationAmount.startsWith("-"))
    .map((row) => ({
      ...ref(state),
      effectLabel: row.label,
      plannedAnnual: row.plannedAnnual,
      actualAmount: row.fact!.actualAmount,
      deviationAmount: row.deviationAmount,
      deviationPercent: row.deviationPercent,
    })))
    .sort((left, right) => Number(left.deviationAmount) - Number(right.deviationAmount))
    .slice(0, deviationLimit);

  const severity = (code: string) => reference.risk_level.findIndex((level) => level.code === code);
  const keyRisks = states
    .filter((state) => activeStatuses.includes(state.status))
    .flatMap((state) => state.card.risks.map((risk) => ({
      ...ref(state),
      risk: risk.text,
      levelLabel: reference.risk_level.find((level) => level.code === risk.levelCode)?.label ?? risk.levelLabel,
      severity: severity(risk.levelCode),
    })))
    .sort((left, right) => right.severity - left.severity)
    .slice(0, topLimit)
    .map(({ severity: _severity, ...risk }) => risk);

  const numbers = new Map(states.map((state) => [state.id, state.number]));
  const critical = new Set(settings.criticalImportance.map(normalizeImportance));
  const overdueAssignments = assignments
    .filter((assignment) =>
      numbers.has(assignment.sourceInitiativeId ?? "") &&
      assignment.currentOccurrenceDate < asOf &&
      (assignment.status !== "completed" || (assignment.completedOn ?? "") > asOf))
    .map((assignment) => ({
      initiativeNumber: numbers.get(assignment.sourceInitiativeId ?? "")!,
      number: assignment.number,
      summary: assignment.summary,
      deadline: assignment.currentOccurrenceDate,
      importance: assignment.importance,
      critical: critical.size === 0 || critical.has(normalizeImportance(assignment.importance)),
    }))
    .sort((left, right) => Number(right.critical) - Number(left.critical) || left.deadline.localeCompare(right.deadline));

  return {
    quarter: period.quarter,
    from: period.from,
    to: period.to,
    generatedOn: today,
    asOf,
    total: states.length,
    approved: inQuarter(["approved_pilot", "approved_implementation"]),
    implemented: inQuarter(["done_confirmed"]),
    rejected: inQuarter(["rejected"]),
    suspended: inQuarter(["suspended"]),
    plannedEffect: fromKopecks(planned),
    confirmedEffect: fromKopecks(confirmed),
    keyImplemented: implemented
      .sort((left, right) => (right.amount > left.amount ? 1 : right.amount < left.amount ? -1 : 0))
      .slice(0, topLimit)
      .map(({ state, amount }) => ({ ...ref(state), confirmedEffect: fromKopecks(amount) })),
    deviations,
    boardDecisions: states.filter((state) => state.status === "board_referral").map(ref),
    keyRisks,
    overdueAssignments,
  };
}
