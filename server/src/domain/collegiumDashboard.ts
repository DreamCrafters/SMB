import {
  collegiumInitiativeStatuses,
  type CollegiumDashboard,
  type CollegiumInitiative,
  type CollegiumInitiativeStatus,
  type CollegiumMeeting,
  type CollegiumReference,
} from "../contracts/collegiumInitiatives.js";
import { fromKopecks } from "./collegiumEconomics.js";
import { readCollegiumConfirmedKopecks, readCollegiumPlannedKopecks } from "./collegiumEffectControl.js";
import type { DirectorAssignment } from "../contracts/directorAssignments.js";

/** Одобренные и реализуемые: их ожидаемый эффект — плановый эффект портфеля. */
export const collegiumPlannedEffectStatuses: readonly CollegiumInitiativeStatus[] = [
  "approved_pilot",
  "approved_implementation",
  "in_progress",
  "result_confirmation",
  "done_confirmed",
  "done_unconfirmed",
];

const activeStatuses: readonly CollegiumInitiativeStatus[] = [
  "preliminary_review",
  "rework",
  "ready",
  "on_agenda",
  "in_discussion",
  "needs_elaboration",
  "approved_pilot",
  "approved_implementation",
  "board_referral",
  "in_progress",
  "result_confirmation",
];

const topLimit = 10;


function ref(initiative: CollegiumInitiative) {
  return { id: initiative.id, number: initiative.number, title: initiative.card.title };
}

/** Плановый эффект ₽ в год по эффектам с долями (одна функция для всех отчётов). */
function plannedOf(initiative: CollegiumInitiative) {
  return readCollegiumPlannedKopecks(initiative);
}

function compareEffect(left: CollegiumInitiative, right: CollegiumInitiative) {
  const difference = (plannedOf(right) ?? 0n) - (plannedOf(left) ?? 0n);
  return difference === 0n ? left.number.localeCompare(right.number) : difference > 0n ? 1 : -1;
}

export function buildCollegiumDashboard({
  today,
  initiatives,
  meetings,
  assignments,
  reference,
}: {
  today: string;
  initiatives: readonly CollegiumInitiative[];
  meetings: readonly CollegiumMeeting[];
  assignments: readonly DirectorAssignment[];
  reference: CollegiumReference;
}): CollegiumDashboard {
  const visibleIds = new Set(initiatives.map(({ id }) => id));
  const counts = new Map<CollegiumInitiativeStatus, number>();
  for (const initiative of initiatives) {
    counts.set(initiative.status, (counts.get(initiative.status) ?? 0) + 1);
  }
  const isPilot = (initiative: CollegiumInitiative) =>
    initiative.status === "approved_pilot" ||
    (initiative.status === "in_progress" && initiative.workflow.lastDecision?.decision === "pilot");

  let planned = 0n;
  let confirmed = 0n;
  const byDirection = new Map<string, { label: string; planned: bigint; confirmed: bigint }>();
  for (const initiative of initiatives) {
    // Group by code so a renamed direction stays one group; label is the current one.
    const code = initiative.card.directionCode;
    const entry = byDirection.get(code) ?? {
      label: code === ""
        ? "Без направления"
        : reference.direction.find((option) => option.code === code)?.label ?? initiative.card.directionLabel,
      planned: 0n,
      confirmed: 0n,
    };
    if (collegiumPlannedEffectStatuses.includes(initiative.status)) {
      const value = plannedOf(initiative) ?? 0n;
      planned += value;
      entry.planned += value;
    }
    const confirmedValue = readCollegiumConfirmedKopecks(initiative);
    if (confirmedValue !== undefined) {
      confirmed += confirmedValue;
      entry.confirmed += confirmedValue;
    }
    if (entry.planned > 0n || entry.confirmed > 0n) byDirection.set(code, entry);
  }

  const nextMeeting = meetings
    .filter((meeting) => meeting.status === "planned" && meeting.meetingDate >= today)
    .sort((left, right) =>
      `${left.meetingDate} ${left.meetingTime}`.localeCompare(`${right.meetingDate} ${right.meetingTime}`))[0];
  const byId = new Map(initiatives.map((initiative) => [initiative.id, initiative]));

  const active = initiatives.filter((initiative) => activeStatuses.includes(initiative.status));
  return {
    generatedOn: today,
    total: initiatives.length,
    statusCounts: collegiumInitiativeStatuses
      .filter((status) => (counts.get(status) ?? 0) > 0)
      .map((status) => ({ status, count: counts.get(status)! })),
    awaitingReview: counts.get("preliminary_review") ?? 0,
    rework: counts.get("rework") ?? 0,
    reworkOverdue: initiatives.filter((initiative) =>
      initiative.status === "rework" &&
      initiative.workflow.rework !== undefined &&
      initiative.workflow.rework.dueDate < today).length,
    inPilot: initiatives.filter(isPilot).length,
    inImplementation: initiatives.filter((initiative) =>
      (initiative.status === "approved_implementation" || initiative.status === "in_progress") &&
      !isPilot(initiative)).length,
    overdueAssignments: assignments.filter((assignment) =>
      visibleIds.has(assignment.sourceInitiativeId ?? "") &&
      assignment.status !== "completed" &&
      assignment.currentOccurrenceDate < today).length,
    plannedEffect: fromKopecks(planned),
    confirmedEffect: fromKopecks(confirmed),
    effectByDirection: [...byDirection]
      .sort(([, left], [, right]) => (right.planned > left.planned ? 1 : right.planned < left.planned ? -1 : 0))
      .map(([directionCode, entry]) => ({
        directionCode,
        directionLabel: entry.label,
        planned: fromKopecks(entry.planned),
        confirmed: fromKopecks(entry.confirmed),
      })),
    ...(nextMeeting === undefined
      ? {}
      : {
          nextMeeting: {
            id: nextMeeting.id,
            number: nextMeeting.number,
            meetingDate: nextMeeting.meetingDate,
            meetingTime: nextMeeting.meetingTime,
            items: nextMeeting.items
              .filter((item) => item.removedAt === undefined && byId.has(item.initiativeId))
              .map((item) => ({ id: item.initiativeId, number: item.initiativeNumber, title: item.snapshot.card.title })),
          },
        }),
    unconfirmed: initiatives.filter((initiative) => initiative.status === "done_unconfirmed").map(ref),
    boardDecisions: initiatives.filter((initiative) => initiative.status === "board_referral").map(ref),
    topByEffect: [...active]
      .filter((initiative) => plannedOf(initiative) !== undefined)
      .sort(compareEffect)
      .slice(0, topLimit)
      .map((initiative) => ({
        ...ref(initiative),
        expectedEffect: fromKopecks(plannedOf(initiative)!),
        status: initiative.status,
      })),
    // Severity is the position in the risk level list (last is highest); ties go to the larger stake.
    topRisks: [...active]
      .sort(compareEffect)
      .flatMap((initiative) => initiative.card.risks.map((risk) => ({
        ...ref(initiative),
        risk: risk.text,
        levelCode: risk.levelCode,
        levelLabel: reference.risk_level.find(({ code }) => code === risk.levelCode)?.label ?? risk.levelLabel,
        expectedEffect: plannedOf(initiative) === undefined ? "" : fromKopecks(plannedOf(initiative)!),
        severity: reference.risk_level.findIndex(({ code }) => code === risk.levelCode),
      })))
      .sort((left, right) => right.severity - left.severity)
      .map(({ severity: _severity, ...item }) => item)
      .slice(0, topLimit),
  };
}
