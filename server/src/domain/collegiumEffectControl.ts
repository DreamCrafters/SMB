import {
  collegiumSignerRoles,
  type CollegiumConfirmedEffect,
  type CollegiumEffectControlRow,
  type CollegiumEffectFact,
  type CollegiumEffectSnapshot,
  type CollegiumEffectStatus,
  type CollegiumInitiative,
  type CollegiumInitiativeWorkflow,
  type CollegiumSignerRole,
} from "../contracts/collegiumInitiatives.js";
import { calculateCollegiumEconomics, fromKopecks, toKopecks } from "./collegiumEconomics.js";
import { collegiumMainEffectId, listCollegiumPlannedEffects } from "./collegiumPassport.js";

/** Полная доля, базисные пункты; совместные эффекты (срез 10б) задают меньшую. */
export const collegiumFullShareBp = 10_000;

/** Аккаунт, подписывающий эффект в роли, по текущей карточке и назначениям. */
export function readCollegiumSignerAccount(initiative: CollegiumInitiative, role: CollegiumSignerRole) {
  return role === "controller"
    ? initiative.card.effectControllerId
    : initiative.workflow.verifiers?.financialId ?? "";
}

export function readCollegiumSignerRole(initiative: CollegiumInitiative, accountId: string): CollegiumSignerRole | undefined {
  return collegiumSignerRoles.find((role) => {
    const signer = readCollegiumSignerAccount(initiative, role);
    return signer !== "" && signer === accountId;
  });
}

/** Доля инициативы в эффекте, базисные пункты: из группы или целиком. */
export function readCollegiumEffectShareBp(initiative: CollegiumInitiative, effectId: string) {
  return initiative.workflow.effectShares?.[effectId]?.shareBp ?? collegiumFullShareBp;
}

/** Подпись действительна: на последней версии факта и от текущего держателя роли. */
function validVerdict(initiative: CollegiumInitiative, fact: CollegiumEffectFact, role: CollegiumSignerRole) {
  const verdict = fact.verdicts[role];
  return verdict !== undefined &&
    verdict.factVersion === fact.version &&
    verdict.byAccountId === readCollegiumSignerAccount(initiative, role)
    ? verdict
    : undefined;
}

export function readCollegiumEffectStatus(initiative: CollegiumInitiative, fact: CollegiumEffectFact | undefined): CollegiumEffectStatus {
  if (fact === undefined) return "not_checked";
  const verdicts = collegiumSignerRoles.map((role) => validVerdict(initiative, fact, role));
  if (verdicts.some((verdict) => verdict?.verdict === "not_confirmed")) return "not_confirmed";
  return verdicts.every((verdict) => verdict?.verdict === "confirmed") ? "confirmed" : "in_review";
}

/** План эффекта, ₽ в год: описанный эффект или годовой эффект неявного `main`. */
function plannedAnnualKopecks(initiative: CollegiumInitiative, effectId: string) {
  if (effectId === collegiumMainEffectId) {
    const annual = calculateCollegiumEconomics(initiative.card).economics.annualEffect;
    return annual === "" ? undefined : toKopecks(annual);
  }
  const effect = initiative.card.passport?.effects.find((item) => item.id === effectId);
  return effect === undefined ? undefined : toKopecks(effect.annualAmount);
}

function tenths(numerator: bigint, denominator: bigint) {
  const negative = numerator < 0n;
  const absolute = negative ? -numerator : numerator;
  const scaled = (absolute * 20n + denominator) / (2n * denominator);
  return `${negative && scaled !== 0n ? "-" : ""}${scaled / 10n}.${scaled % 10n}`;
}

/** Строки ТЗ 11.1: план, факт, отклонение и статус верификации по эффектам. */
export function buildCollegiumEffectControlRows(initiative: CollegiumInitiative): CollegiumEffectControlRow[] {
  return listCollegiumPlannedEffects(initiative).map(({ id, label }) => {
    const planned = plannedAnnualKopecks(initiative, id);
    const fact = initiative.workflow.effectFacts?.[id];
    const deviation = fact === undefined || planned === undefined ? undefined : toKopecks(fact.actualAmount) - planned;
    return {
      effectId: id,
      label,
      plannedAnnual: planned === undefined ? "" : fromKopecks(planned),
      ...(fact === undefined ? {} : { fact }),
      status: readCollegiumEffectStatus(initiative, fact),
      deviationAmount: deviation === undefined ? "" : fromKopecks(deviation),
      deviationPercent: deviation === undefined || planned === undefined || planned === 0n ? "" : tenths(deviation * 100n, planned),
    };
  });
}

/**
 * Что мешает решению по эффекту: у каждого эффекта факт и две подписи текущих
 * держателей ролей разными аккаунтами на последней версии факта.
 */
export function listCollegiumVerdictGaps(initiative: CollegiumInitiative) {
  const gaps: string[] = [];
  const controller = readCollegiumSignerAccount(initiative, "controller");
  const financial = readCollegiumSignerAccount(initiative, "financial");
  if (financial === "") gaps.push("Не назначен финансовый верификатор");
  if (controller !== "" && controller === financial) {
    gaps.push("Контролёр эффекта и финансовый верификатор должны быть разными людьми");
  }
  for (const row of buildCollegiumEffectControlRows(initiative)) {
    if (row.fact === undefined) {
      gaps.push(`${row.label}: не внесён факт`);
    } else if (collegiumSignerRoles.some((role) => validVerdict(initiative, row.fact!, role) === undefined)) {
      gaps.push(`${row.label}: нужны подписи контролёра эффекта и финансового верификатора`);
    }
  }
  return gaps;
}

/** Снимок подтверждения: дальнейшие правки долей и фактов его не меняют. */
export function buildCollegiumConfirmedEffects(initiative: CollegiumInitiative): CollegiumConfirmedEffect[] {
  return buildCollegiumEffectControlRows(initiative).map((row) => ({
    effectId: row.effectId,
    label: row.label,
    plannedAnnual: row.plannedAnnual,
    actualAmount: row.fact?.actualAmount ?? "0.00",
    status: row.status === "confirmed" ? "confirmed" : "not_confirmed",
    shareBp: readCollegiumEffectShareBp(initiative, row.effectId),
    verdicts: row.fact?.verdicts ?? {},
  }));
}

/** Доля суммы с округлением вниз, чтобы сумма долей не превысила целое. */
function share(kopecks: bigint, shareBp: number) {
  return (kopecks * BigInt(shareBp)) / BigInt(collegiumFullShareBp);
}

/**
 * Подтверждённый эффект инициативы, копейки: по снимку подтверждения, для
 * подтверждённых до среза 10 — прежняя сумма результата; `undefined` — не
 * подтверждался.
 */
export function readCollegiumConfirmedKopecks(initiative: CollegiumInitiative): bigint | undefined {
  const confirmation = initiative.workflow.effectConfirmation;
  if (confirmation === undefined) return undefined;
  if (confirmation.effects === undefined) return toKopecks(confirmation.result.actualEffectAmount ?? "");
  return confirmation.effects
    .filter((effect) => effect.status === "confirmed")
    .reduce((sum, effect) => sum + share(toKopecks(effect.actualAmount), effect.shareBp), 0n);
}

/** Плановый эффект инициативы, копейки в год: сумма планов эффектов × доля. */
export function readCollegiumPlannedKopecks(initiative: CollegiumInitiative): bigint | undefined {
  const amounts = listCollegiumPlannedEffects(initiative).map(({ id }) => ({
    amount: plannedAnnualKopecks(initiative, id),
    shareBp: readCollegiumEffectShareBp(initiative, id),
  }));
  if (amounts.every(({ amount }) => amount === undefined)) return undefined;
  return amounts.reduce<bigint>((sum, { amount, shareBp }) => sum + share(amount ?? 0n, shareBp), 0n);
}

export function snapshotCollegiumEffectControl(workflow: CollegiumInitiativeWorkflow): CollegiumEffectSnapshot | undefined {
  const { effectFacts, verifiers, verification, effectConfirmation, effectOutcome, effectShares } = workflow;
  if ([effectFacts, verifiers, verification, effectConfirmation, effectOutcome, effectShares].every((value) => value === undefined)) {
    return undefined;
  }
  return {
    ...(effectShares === undefined ? {} : { effectShares }),
    ...(effectFacts === undefined ? {} : { effectFacts }),
    ...(verifiers === undefined ? {} : { verifiers }),
    ...(verification === undefined ? {} : { verification }),
    ...(effectConfirmation === undefined ? {} : { effectConfirmation }),
    ...(effectOutcome === undefined ? {} : { effectOutcome }),
  };
}
