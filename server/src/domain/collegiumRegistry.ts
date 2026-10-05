import {
  collegiumInitiativeFilterKeys,
  collegiumInitiativeStages,
  collegiumInitiativeStageStatuses,
  collegiumInitiativeStatuses,
  type CollegiumInitiative,
  type CollegiumInitiativeFilters,
  type CollegiumInitiativeStage,
  type CollegiumInitiativeStatus,
} from "../contracts/collegiumInitiatives.js";
import { CollegiumInitiativeError, readCollegiumAmount } from "./collegiumInitiative.js";

const maxTextFilterLength = 120;
const accountPattern = /^account:[A-Za-z0-9_-]{1,100}$/u;
const idPattern = /^[A-Za-z0-9-]{1,100}$/u;

/** Фильтры реестра из query-параметров; неверное значение — ошибка, а не пропуск. */
export function readCollegiumInitiativeFilters(params: URLSearchParams): CollegiumInitiativeFilters {
  const filters: CollegiumInitiativeFilters = {};
  const unknown = [...params.keys()].find(
    (key) => !(collegiumInitiativeFilterKeys as readonly string[]).includes(key),
  );
  if (unknown !== undefined) throw new CollegiumInitiativeError("Неизвестный фильтр реестра.");
  const read = (key: (typeof collegiumInitiativeFilterKeys)[number]) => {
    const value = params.get(key)?.trim() ?? "";
    if (value.length > maxTextFilterLength) {
      throw new CollegiumInitiativeError("Значение фильтра слишком длинное.");
    }
    return value;
  };
  for (const key of ["query", "risk", "directionCode", "effectTypeCode"] as const) {
    const value = read(key);
    if (value !== "") filters[key] = value;
  }
  for (const key of ["createdFrom", "createdTo"] as const) {
    const value = read(key);
    if (value === "") continue;
    if (!isCalendarDate(value)) throw new CollegiumInitiativeError("Проверьте период реестра.");
    filters[key] = value;
  }
  if (filters.createdFrom !== undefined && filters.createdTo !== undefined && filters.createdFrom > filters.createdTo) {
    throw new CollegiumInitiativeError("Начало периода позже конца.");
  }
  for (const key of ["initiatorId", "ownerId", "executorId", "controllerId"] as const) {
    const value = read(key);
    if (value === "") continue;
    if (!accountPattern.test(value)) throw new CollegiumInitiativeError("Проверьте фильтр по людям.");
    filters[key] = value;
  }
  for (const key of ["costMin", "costMax", "plannedEffectMin", "plannedEffectMax", "actualEffectMin", "actualEffectMax"] as const) {
    const value = read(key);
    if (value !== "") filters[key] = readCollegiumAmount(value);
  }
  const status = read("status");
  if (status !== "") {
    if (!(collegiumInitiativeStatuses as readonly string[]).includes(status)) {
      throw new CollegiumInitiativeError("Неизвестный статус.");
    }
    filters.status = status as CollegiumInitiativeStatus;
  }
  const stage = read("stage");
  if (stage !== "") {
    if (!(collegiumInitiativeStages as readonly string[]).includes(stage)) {
      throw new CollegiumInitiativeError("Неизвестная стадия.");
    }
    filters.stage = stage as CollegiumInitiativeStage;
  }
  const meetingId = read("meetingId");
  if (meetingId !== "") {
    if (!idPattern.test(meetingId)) throw new CollegiumInitiativeError("Проверьте фильтр по заседанию.");
    filters.meetingId = meetingId;
  }
  for (const key of ["boardDecision", "overdue", "mine"] as const) {
    const value = read(key);
    if (value === "") continue;
    if (value !== "yes") throw new CollegiumInitiativeError("Проверьте фильтры реестра.");
    filters[key] = "yes";
  }
  return filters;
}

export type CollegiumRegistryContext = {
  overdueIds: ReadonlySet<string>;
  /** Инициативы, бывавшие в повестке заседания, по id заседания. */
  meetingInitiativeIds: ReadonlyMap<string, ReadonlySet<string>>;
  /** Инициативы, где текст запроса найден в комментариях. */
  commentMatchIds: ReadonlySet<string>;
  name: (accountId: string) => string;
  userId: string;
};

export function filterCollegiumInitiatives(
  initiatives: readonly CollegiumInitiative[],
  filters: CollegiumInitiativeFilters,
  context: CollegiumRegistryContext,
): CollegiumInitiative[] {
  const query = normalize(filters.query);
  const risk = normalize(filters.risk);
  return initiatives.filter((initiative) => {
    const { card } = initiative;
    const createdOn = initiative.createdAt.slice(0, 10);
    if (filters.createdFrom !== undefined && createdOn < filters.createdFrom) return false;
    if (filters.createdTo !== undefined && createdOn > filters.createdTo) return false;
    if (filters.initiatorId !== undefined && card.initiatorId !== filters.initiatorId) return false;
    if (filters.ownerId !== undefined && card.ownerId !== filters.ownerId) return false;
    if (filters.executorId !== undefined && card.executorId !== filters.executorId) return false;
    if (
      filters.controllerId !== undefined &&
      card.executionControllerId !== filters.controllerId &&
      card.effectControllerId !== filters.controllerId
    ) return false;
    if (filters.directionCode !== undefined && card.directionCode !== filters.directionCode) return false;
    if (filters.status !== undefined && initiative.status !== filters.status) return false;
    if (
      filters.stage !== undefined &&
      !collegiumInitiativeStageStatuses[filters.stage].includes(initiative.status)
    ) return false;
    if (filters.effectTypeCode !== undefined && !card.effectTypeCodes.includes(filters.effectTypeCode)) return false;
    if (!inRange(card.oneTimeCostAmount, filters.costMin, filters.costMax)) return false;
    if (!inRange(card.expectedEffectAmount, filters.plannedEffectMin, filters.plannedEffectMax)) return false;
    if (!inRange(
      initiative.workflow.result?.actualEffectAmount ?? "",
      filters.actualEffectMin,
      filters.actualEffectMax,
    )) return false;
    if (
      filters.meetingId !== undefined &&
      !(context.meetingInitiativeIds.get(filters.meetingId)?.has(initiative.id) ?? false)
    ) return false;
    if (
      filters.boardDecision === "yes" &&
      initiative.status !== "board_referral" &&
      initiative.workflow.lastDecision?.decision !== "board_materials"
    ) return false;
    if (filters.overdue === "yes" && !context.overdueIds.has(initiative.id)) return false;
    if (filters.mine === "yes") {
      const accountId = `account:${context.userId}`;
      const roles = [card.initiatorId, card.ownerId, card.executorId, card.executionControllerId, card.effectControllerId];
      if (initiative.createdByUserId !== context.userId && !roles.includes(accountId)) return false;
    }
    if (risk !== "" && !card.risks.some((item) => normalize(item).includes(risk))) return false;
    if (query !== "") {
      const haystack = [
        initiative.number,
        card.title,
        card.problem,
        card.solution,
        context.name(card.initiatorId),
      ].map(normalize);
      if (!haystack.some((value) => value.includes(query)) && !context.commentMatchIds.has(initiative.id)) {
        return false;
      }
    }
    return true;
  });
}

/** An amount filter excludes cards where the amount is not filled. */
function inRange(value: string, min: string | undefined, max: string | undefined) {
  if (min === undefined && max === undefined) return true;
  if (value === "") return false;
  const amount = Number(value);
  return (min === undefined || amount >= Number(min)) && (max === undefined || amount <= Number(max));
}

function normalize(value: string | undefined) {
  return (value ?? "").trim().toLocaleLowerCase("ru-RU");
}

function isCalendarDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
