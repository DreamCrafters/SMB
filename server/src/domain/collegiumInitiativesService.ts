import { randomUUID } from "node:crypto";
import {
  collegiumAttachmentFileTypes,
  collegiumAttachmentLimits,
  collegiumCommentKinds,
  collegiumInitiativeActionLabels,
  collegiumInitiativeFieldLabels,
  collegiumAssignableRoleLabels,
  collegiumAssignableRoles,
  collegiumInitiativeRoleFields,
  collegiumInitiativeStatusLabels,
  type CollegiumAssignableRole,
  type CollegiumAttachment,
  type CollegiumAttentionItem,
  type CollegiumBoardReport,
  type CollegiumDashboard,
  type CollegiumInitiativeRevision,
  type CollegiumEffectControl,
  type CollegiumEffectFactInput,
  type CollegiumEffectGroupFact,
  type CollegiumEffectGroupView,
  type CollegiumEffectFact,
  type CollegiumVerifierRole,
  collegiumSignerRoleLabels,
  collegiumVerifierRoleLabels,
  collegiumVerifierRoles,
  type CollegiumSettingsInput,
  type CollegiumCommentKind,
  type CollegiumInitiative,
  type CollegiumInitiativeCard,
  type CollegiumInitiativeComment,
  type CollegiumInitiativeAction,
  type CollegiumInitiativeDetailResponse,
  type CollegiumInitiativeFilters,
  type CollegiumInitiativeListResponse,
  type CollegiumInitiativePermissions,
  type CollegiumLinkedAssignment,
  type CollegiumPerson,
} from "../contracts/collegiumInitiatives.js";
import {
  isResultReporter,
  listAvailableCollegiumActions,
  listCollegiumAdmissionGaps,
  listCollegiumResultGaps,
  planCollegiumAction,
  readCollegiumActionRequest,
  readCollegiumResultInput,
  readCollegiumSummaryStatus,
} from "./collegiumInitiativeWorkflow.js";
import {
  assertCollegiumAttachmentRoom,
  detectCollegiumAttachmentType,
  readCollegiumAttachmentFileName,
  readCollegiumAttachmentLink,
} from "./collegiumAttachment.js";
import { recordCollegiumInitiativeEvent } from "./collegiumInitiativeEvents.js";
import { filterCollegiumInitiatives } from "./collegiumRegistry.js";
import { buildCollegiumBoardReport, readCollegiumQuarter } from "./collegiumBoardReport.js";
import { buildCollegiumDashboard } from "./collegiumDashboard.js";
import {
  buildCollegiumConfirmedEffects,
  buildCollegiumEffectControlRows,
  listCollegiumVerdictGaps,
  readCollegiumSignerRole,
  snapshotCollegiumEffectControl,
} from "./collegiumEffectControl.js";
import {
  calculateCollegiumEconomics,
  listCollegiumPassportGaps,
  listCollegiumPassportReasons,
  unsetCollegiumSettings,
} from "./collegiumEconomics.js";
import {
  canEditCollegiumPassport,
  collegiumMainEffectId,
  findCollegiumEffectDuplicates,
  listCollegiumPlannedEffects,
  readCollegiumPassportInput,
  readCollegiumSignedAmount,
} from "./collegiumPassport.js";
import {
  buildControlRoleNotifications,
  buildAssignmentCreatedNotification,
  buildHiddenRoleNotifications,
  buildOutcomeNotification,
  buildResultConfirmationNotification,
  buildReworkNotification,
  buildRoleAssignmentNotifications,
  buildSubmittedNotification,
  type CollegiumNotification,
  type CollegiumOutbox,
} from "./collegiumNotifications.js";
import type { DatabaseTransactionRunner } from "../db/transactionContext.js";
import type { AuditRepository } from "../repositories/auditRepository.js";
import type {
  CollegiumEffectGroupRecord,
  CollegiumEffectGroupsRepository,
} from "../repositories/collegiumEffectGroupsRepository.js";
import type { CollegiumInitiativesRepository } from "../repositories/collegiumInitiativesRepository.js";
import { hasProfileCapability, type ServerUserProfile } from "./auth.js";
import type { DirectorAssignment } from "../contracts/directorAssignments.js";
import { DirectorAssignmentError } from "./directorAssignment.js";
import {
  canEditCollegiumInitiative,
  canViewCollegiumInitiative,
  collegiumAccountId,
  listCollegiumRoleHolderIds,
  resolveCollegiumInitiativeAccess,
  collegiumInitiativePermissions,
  CollegiumInitiativeError,
  isOwnCollegiumInitiative,
  listChangedCollegiumFields,
  readCollegiumAmount,
  readCollegiumInitiativeCardInput,
  readCollegiumOptionalText,
} from "./collegiumInitiative.js";

const maxReasonLength = 500;
const maxCommentLength = 2000;
const maxDiscussionCommentLength = 4000;

/** Поручения реестра Коллегии, созданные из инициативы (порт к реестру). */
export type CollegiumLinkedAssignmentsSource = {
  listBySourceInitiative: (initiativeId: string) => Promise<DirectorAssignment[]>;
  listWithInitiativeLink: () => Promise<DirectorAssignment[]>;
};

const assignableStatuses: readonly CollegiumInitiative["status"][] = [
  "approved_pilot",
  "approved_implementation",
  "in_progress",
];

/** Роли контроля эффекта назначаются от решения Коллегии до проверки результата. */
const controlRoleStatuses: readonly CollegiumInitiative["status"][] = [
  "approved_pilot",
  "approved_implementation",
  "board_referral",
  "in_progress",
  "result_confirmation",
];

/** Роли не меняются на повестке (решение принимается по снимку) и после закрытия или отклонения. */
const roleFrozenStatuses: readonly CollegiumInitiative["status"][] = [
  "on_agenda",
  "in_discussion",
  "rejected",
  "closed",
];

/** До допуска роль можно очистить; дальше — только заменить. */
const roleClearableStatuses: readonly CollegiumInitiative["status"][] = [
  "draft",
  "preliminary_review",
  "rework",
];

/** После проверки эффекта контролёр не меняется: подтверждение опирается на его подпись. */
const effectCheckedStatuses: readonly CollegiumInitiative["status"][] = [
  "done_confirmed",
  "done_unconfirmed",
];

const conclusionStatuses: readonly CollegiumInitiative["status"][] = [
  ...controlRoleStatuses,
  "done_confirmed",
  "done_unconfirmed",
];

const maxFactTextLength = 4000;
const groupFinishedStatuses: readonly CollegiumInitiative["status"][] = [
  "done_confirmed",
  "done_unconfirmed",
  "closed",
  "rejected",
];
const factStatuses: readonly CollegiumInitiative["status"][] = ["in_progress", "result_confirmation"];
const maxGroupMembers = 10;

/** Доля в процентах до двух знаков → базисные пункты (0 < доля ≤ 100 %). */
function readSharePercent(value: unknown) {
  const text = typeof value === "string" ? value.trim().replace(",", ".") : "";
  const match = /^(\d{1,3})(?:\.(\d{1,2}))?$/u.exec(text);
  const shareBp = match === null ? 0 : Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
  if (shareBp <= 0 || shareBp > 10_000) {
    throw new CollegiumInitiativeError("Доля — от 0,01 до 100 %, до двух знаков после запятой.");
  }
  return shareBp;
}

function readFactInput(record: Record<string, unknown>): CollegiumEffectFactInput {
  const actualAmount = readCollegiumSignedAmount(record.actualAmount, "Фактический эффект в год");
  const period = readCollegiumOptionalText(record.period, 250, "Период");
  const sources = readCollegiumOptionalText(record.sources, 1000, "Источники");
  const calculation = readCollegiumOptionalText(record.calculation, maxFactTextLength, "Расчёт");
  if (actualAmount === "" || period === "" || sources === "") {
    throw new CollegiumInitiativeError("Укажите фактический эффект в год, период и источники.");
  }
  return { actualAmount, period, sources, calculation };
}

/** Копия факта группы у участника: своя версия, подписи начинаются заново. */
function copyGroupFact(fact: CollegiumEffectGroupFact, previous: CollegiumEffectFact | undefined): CollegiumEffectFact {
  return {
    actualAmount: fact.actualAmount,
    period: fact.period,
    sources: fact.sources,
    calculation: fact.calculation,
    version: (previous?.version ?? 0) + 1,
    recordedByUserId: fact.recordedByUserId,
    recordedByDisplayName: fact.recordedByDisplayName,
    recordedAt: fact.recordedAt,
    verdicts: {},
  };
}

function readControlBody(body: unknown, keys: readonly string[]) {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new CollegiumInitiativeError("Передайте данные.");
  }
  const record = body as Record<string, unknown>;
  if (Object.keys(record).some((key) => !["revision", ...keys].includes(key))) {
    throw new CollegiumInitiativeError("Запрос содержит неизвестные поля.");
  }
  return record;
}

/** Уведомления о смене статуса (ТЗ 12.1); отправляет их HTTP-слой после ответа. */
function buildActionNotifications(
  before: CollegiumInitiative,
  after: CollegiumInitiative,
  action: CollegiumInitiativeAction,
  actorUserId: string,
): CollegiumNotification[] {
  switch (action) {
    case "submit_for_review":
      return [
        buildSubmittedNotification(after, actorUserId),
        ...(before.workflow.submittedAt === undefined ? buildHiddenRoleNotifications(after, actorUserId) : []),
      ];
    case "return_for_rework":
      return [buildReworkNotification(after, actorUserId)];
    case "complete_work":
      return [buildResultConfirmationNotification(after, actorUserId)];
    case "confirm_effect":
      return [buildOutcomeNotification(after, "Эффект подтверждён", actorUserId)];
    case "reject_effect":
      return [buildOutcomeNotification(after, "Эффект признан неподтверждённым", actorUserId)];
    case "board_reject":
      return [buildOutcomeNotification(after, "Совет директоров отклонил инициативу", actorUserId)];
    case "close":
      return [buildOutcomeNotification(after, "Инициатива закрыта", actorUserId)];
    default:
      return [];
  }
}

export function createCollegiumInitiativesService({
  repository,
  assignments,
  settings,
  effectGroups,
  transaction,
  audit,
  now = () => new Date(),
}: {
  repository: CollegiumInitiativesRepository;
  assignments?: CollegiumLinkedAssignmentsSource;
  /** Пороги ТЗ 7.2; без источника условия порогов не срабатывают. */
  settings?: { readSettings(): Promise<CollegiumSettingsInput> };
  /** Совместные эффекты (срез 10б). */
  effectGroups?: CollegiumEffectGroupsRepository;
  transaction: DatabaseTransactionRunner;
  audit: AuditRepository;
  now?: () => Date;
}) {
  const today = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Moscow" }).format(now());
  const moscowYear = () => Number(
    new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Moscow", year: "numeric" })
      .format(now()),
  );

  const readSettings = () => settings?.readSettings() ?? Promise.resolve(unsetCollegiumSettings);

  /** Экономика, причины и пробелы паспорта по текущим справочникам и порогам. */
  async function evaluatePassport(initiative: CollegiumInitiative) {
    const [reference, moduleSettings] = await Promise.all([repository.listReference(), readSettings()]);
    const economics = calculateCollegiumEconomics(initiative.card, moduleSettings.discountRatePercent).economics;
    const reasons = listCollegiumPassportReasons(initiative, moduleSettings, reference);
    return { economics, reasons, gaps: listCollegiumPassportGaps(initiative, reasons, economics) };
  }

  async function findVisibleDuplicates(
    profile: ServerUserProfile,
    permissions: CollegiumInitiativePermissions,
    initiative: CollegiumInitiative,
  ) {
    if ((initiative.card.passport?.effects.length ?? 0) === 0) return [];
    const others = (await repository.list()).filter((other) =>
      canViewCollegiumInitiative(other, profile));
    return findCollegiumEffectDuplicates(initiative, others);
  }

  function buildEffectControl(
    initiative: CollegiumInitiative,
    profile: ServerUserProfile,
    permissions: CollegiumInitiativePermissions,
  ): CollegiumEffectControl {
    const accountId = collegiumAccountId(profile.userId);
    const signerRole = initiative.status === "result_confirmation" && permissions.canView
      ? readCollegiumSignerRole(initiative, accountId)
      : undefined;
    const verifierRole = collegiumVerifierRoles.find((role) =>
      initiative.workflow.verifiers?.[role === "technical" ? "technicalId" : "financialId"] === accountId);
    return {
      rows: buildCollegiumEffectControlRows(initiative),
      canRecordFacts: canRecordResult(initiative, profile, permissions),
      ...(signerRole === undefined ? {} : { signerRole }),
      canGroupEffects: canGroupEffects(initiative, profile, verifierRole),
      ...(verifierRole === undefined || !conclusionStatuses.includes(initiative.status) ? {} : { verifierRole }),
    };
  }

  /** Совместный эффект охватывает чужие инициативы, поэтому нужна вкладка, а не временная роль. */
  function canGroupEffects(
    initiative: CollegiumInitiative,
    profile: ServerUserProfile,
    verifierRole: CollegiumVerifierRole | undefined,
  ) {
    const global = collegiumInitiativePermissions(profile);
    return global.canView && (
      (global.canManage && controlRoleStatuses.includes(initiative.status)) ||
      verifierRole === "financial"
    );
  }

  /**
   * Роли, которые пользователь может сейчас назначить. Назначает член
   * Коллегии (глобальный `participate`, временная роль этого права не даёт).
   * Роли контроля после решения Коллегии не меняют текущие владелец и
   * исполнитель — иначе они сами выбирали бы проверяющего свой эффект.
   */
  function listAssignableRoles(
    initiative: CollegiumInitiative,
    profile: ServerUserProfile,
  ): CollegiumAssignableRole[] {
    const global = collegiumInitiativePermissions(profile);
    if (!global.canParticipate || roleFrozenStatuses.includes(initiative.status)) return [];
    const accountId = collegiumAccountId(profile.userId);
    const isDecided = controlRoleStatuses.includes(initiative.status) ||
      effectCheckedStatuses.includes(initiative.status);
    const mayChangeControl = global.canManage || !isDecided ||
      (initiative.card.ownerId !== accountId && initiative.card.executorId !== accountId);
    return collegiumAssignableRoles.filter((role) => {
      if (role === "ownerId" || role === "executorId" || role === "executionControllerId") return true;
      if (!mayChangeControl) return false;
      if (role === "effectControllerId") return !effectCheckedStatuses.includes(initiative.status);
      return controlRoleStatuses.includes(initiative.status);
    });
  }

  /** Изменение контроля эффекта: ревизия со снимком (ТЗ 16) и аудит в одной транзакции. */
  async function saveControlChange({
    profile,
    initiative,
    card = initiative.card,
    workflow,
    changedFields = [],
    reason,
    comment = "",
    summary,
    details,
  }: {
    profile: ServerUserProfile;
    initiative: CollegiumInitiative;
    card?: CollegiumInitiative["card"];
    workflow: CollegiumInitiative["workflow"];
    changedFields?: CollegiumInitiativeRevision["changedFields"];
    reason: string;
    comment?: string;
    summary: string;
    details?: Array<{ label: string; value: string }>;
  }) {
    const at = now();
    const updated: CollegiumInitiative = {
      ...initiative,
      card,
      workflow,
      revision: initiative.revision + 1,
      updatedAt: at.toISOString(),
    };
    await repository.update(updated, initiative.revision);
    const effectSnapshot = snapshotCollegiumEffectControl(workflow);
    await repository.insertRevision(initiative.id, {
      id: randomUUID(),
      revision: updated.revision,
      createdAt: at,
      authorDisplayName: profile.displayName,
      status: initiative.status,
      changedFields,
      reason,
      comment,
      card,
      ...(effectSnapshot === undefined ? {} : { effectSnapshot }),
    });
    await recordAudit(profile, "collegium_initiative.update", updated, `${summary}: инициатива ${updated.number}`, details);
    return updated;
  }

  async function lockForControl(profile: ServerUserProfile, id: string, revision: unknown) {
    const found = await requireInitiative(profile, id, true);
    if (found.initiative.revision !== revision) {
      throw new CollegiumInitiativeError("Инициатива уже изменена. Обновите карточку.", 409);
    }
    return found;
  }

  async function readEffectGroups(
    initiative: CollegiumInitiative,
    profile: ServerUserProfile,
    permissions: CollegiumInitiativePermissions,
  ): Promise<CollegiumEffectGroupView[]> {
    if (effectGroups === undefined) return [];
    const me = collegiumAccountId(profile.userId);
    // Совместный эффект ведут только аккаунты с вкладкой: группа охватывает чужие инициативы.
    const global = collegiumInitiativePermissions(profile);
    const groupIds = [...new Set(Object.values(initiative.workflow.effectShares ?? {}).map(({ groupId }) => groupId))];
    const views: CollegiumEffectGroupView[] = [];
    for (const groupId of groupIds) {
      const group = await effectGroups.readGroup(groupId);
      if (group === undefined) continue;
      const members = await Promise.all((await effectGroups.listMembers(groupId)).map(async (member) => {
        const other = member.initiativeId === initiative.id ? initiative : await repository.read(member.initiativeId);
        const visible = other !== undefined && canViewCollegiumInitiative(other, profile);
        return {
          initiativeId: visible ? member.initiativeId : "",
          number: visible ? other.number : "",
          title: visible ? other.card.title : "",
          effectId: member.effectId,
          effectLabel: visible ? listCollegiumPlannedEffects(other).find(({ id }) => id === member.effectId)?.label ?? "" : "",
          shareBp: member.shareBp,
        };
      }));
      views.push({
        id: group.id,
        revision: group.revision,
        ...(group.fact === undefined ? {} : { fact: group.fact }),
        members,
        canEditShares: global.canView &&
          (permissions.canManage || initiative.workflow.verifiers?.financialId === me),
        canRecordFact: factStatuses.includes(initiative.status) && global.canView &&
          (permissions.canManage || (permissions.canParticipate && isResultReporter(initiative, profile.userId))),
      });
    }
    return views;
  }

  function requireGroups() {
    if (effectGroups === undefined) throw new CollegiumInitiativeError("Совместные эффекты недоступны.", 503);
    return effectGroups;
  }

  /** Участники группы под блокировкой, по возрастанию id (порядок блокировок модуля). */
  async function lockGroupInitiatives(profile: ServerUserProfile, ids: Iterable<string>) {
    const locked = new Map<string, CollegiumInitiative>();
    for (const id of [...new Set(ids)].sort()) {
      locked.set(id, (await requireInitiative(profile, id, true)).initiative);
    }
    return locked;
  }

  function requirePassport(gaps: readonly string[]) {
    if (gaps.length > 0) {
      throw new CollegiumInitiativeError(`Нужен полный паспорт. Не заполнено: ${gaps.join("; ")}.`);
    }
  }

  function requireView(profile: ServerUserProfile) {
    const permissions = collegiumInitiativePermissions(profile);
    if (!permissions.canView) {
      throw new CollegiumInitiativeError("Инициативы Коллегии недоступны.", 403);
    }
    return permissions;
  }

  async function requireInitiative(
    profile: ServerUserProfile,
    id: string,
    lock = false,
  ) {
    const initiative = await repository.read(id, lock);
    const access = initiative === undefined
      ? undefined
      : resolveCollegiumInitiativeAccess(initiative, profile);
    if (initiative === undefined || access === undefined || !access.visible) {
      // Аккаунт без вкладки и без роли в этой карточке получает прежний ответ.
      requireView(profile);
      throw new CollegiumInitiativeError("Инициатива недоступна.", 404);
    }
    return { initiative, permissions: access.permissions, global: access.global };
  }

  /**
   * Назначенные люди — действующие аккаунты организации. Строки аккаунтов
   * блокируются до записи, чтобы архивирование не прошло между проверкой и
   * сохранением. Поле, которое уже хранило этот же id, не перепроверяется:
   * правка заголовка не должна ломаться из-за ушедшего контролёра.
   */
  async function verifyPeople(
    card: CollegiumInitiativeCard,
    previous: CollegiumInitiativeCard | undefined,
  ) {
    const fields = [...collegiumInitiativeRoleFields, "initiatorId"] as const;
    for (const field of fields) {
      const accountId = card[field];
      if (accountId === "" || previous?.[field] === accountId) continue;
      const person = await repository.readPerson(accountId, true);
      if (person === undefined) {
        throw new CollegiumInitiativeError(
          `«${collegiumInitiativeFieldLabels[field]}»: выберите действующую учётную запись.`,
        );
      }
    }
  }

  function recordAudit(
    profile: ServerUserProfile,
    action:
      | "collegium_initiative.create"
      | "collegium_initiative.update"
      | "collegium_initiative.transition"
      | "collegium_initiative.comment"
      | "collegium_initiative.comment_resolve"
      | "collegium_initiative.attachment_add"
      | "collegium_initiative.attachment_delete",
    initiative: CollegiumInitiative,
    summary: string,
    details: Array<{ label: string; value: string }> = [],
  ) {
    return audit.record({
      actor: {
        userId: profile.userId,
        accountId: profile.activeAccess.accountId,
        displayName: profile.displayName,
        positionDisplayName: profile.activeAccess.positionDisplayName,
      },
      category: "data_change",
      action,
      summary,
      details: [{ label: "Инициатива", value: initiative.card.title }, ...details],
      targetType: "collegium_initiative",
      targetId: initiative.id,
    });
  }

  async function readRolePeople(card: CollegiumInitiativeCard, lock = false) {
    const people = new Map<string, CollegiumPerson | undefined>();
    for (const field of collegiumInitiativeRoleFields) {
      const accountId = card[field];
      if (accountId !== "" && !people.has(accountId)) {
        people.set(accountId, await repository.readPerson(accountId, lock));
      }
    }
    return people;
  }

  /**
   * Автор и владелец прикладывают материалы, пока идея не вынесена в повестку;
   * секретарь — в любой момент до закрытия.
   */
  function canAttach(
    initiative: CollegiumInitiative,
    profile: ServerUserProfile,
    permissions: CollegiumInitiativePermissions,
  ) {
    if (initiative.status === "closed") return false;
    if (permissions.canManage) return true;
    return permissions.canParticipate &&
      isOwnCollegiumInitiative(initiative, profile.userId) &&
      ["draft", "preliminary_review", "rework", "ready", "needs_elaboration"].includes(initiative.status);
  }

  async function requireAttachRights(profile: ServerUserProfile, id: string, lock: boolean) {
    const found = await requireInitiative(profile, id, lock);
    if (!canAttach(found.initiative, profile, found.permissions)) {
      throw new CollegiumInitiativeError("Прикладывать материалы к этой инициативе нельзя.", 403);
    }
    return found;
  }

  const assertAttachmentRoom = (id: string, addedBytes: number) =>
    assertCollegiumAttachmentRoom(repository, { type: "initiative", id }, addedBytes);

  async function listLinkedAssignments(initiativeId: string): Promise<CollegiumLinkedAssignment[]> {
    const linked = await assignments?.listBySourceInitiative(initiativeId) ?? [];
    return linked.map((assignment) => ({
      id: assignment.id,
      number: assignment.number,
      summary: assignment.summary,
      status: assignment.status,
      deadline: assignment.currentOccurrenceDate,
      completedOn: assignment.completedOn,
      responsibleName: assignment.responsible?.fullName ?? "",
      isOverdue: assignment.status !== "completed" && assignment.currentOccurrenceDate < today(),
    }));
  }

  /**
   * Подтверждать эффект нельзя тому, кто после допуска хоть раз был
   * исполнителем или владельцем: исполнитель не подтверждает свой эффект.
   */
  async function assertIndependentConfirmer(initiative: CollegiumInitiative, userId: string) {
    return assertIndependentAccount(initiative, collegiumAccountId(userId));
  }

  async function assertIndependentAccount(initiative: CollegiumInitiative, accountId: string) {
    const revisions = await repository.listRevisions(initiative.id);
    const admittedAt = Math.min(
      ...revisions.filter((revision) => revision.event?.action === "admit").map((revision) => revision.revision),
    );
    const cards = [
      initiative.card,
      ...revisions.filter((revision) => revision.revision >= admittedAt).map((revision) => revision.card),
    ];
    if (cards.some((card) => card.executorId === accountId || card.ownerId === accountId)) {
      throw new CollegiumInitiativeError("Исполнитель или владелец не подтверждает собственный эффект.", 403);
    }
  }

  async function assertReadyForClosure(initiative: CollegiumInitiative) {
    const gaps = listCollegiumResultGaps(initiative.workflow.result);
    const open = (await listLinkedAssignments(initiative.id)).filter((assignment) => assignment.status !== "completed");
    if (open.length > 0) {
      gaps.unshift(`Незавершённые поручения: ${open.map((assignment) => assignment.number).join(", ")}`);
    }
    if (gaps.length > 0) {
      throw new CollegiumInitiativeError(`Нельзя подтвердить эффект или закрыть: ${gaps.join("; ")}.`, 409);
    }
  }

  /**
   * Видимый пользователю реестр с применёнными фильтрами ТЗ 13.2. Просрочка
   * берётся из связанных поручений реестра Коллегии, заседания — из повесток.
   */
  async function loadRegistry(
    profile: ServerUserProfile,
    filters: CollegiumInitiativeFilters,
  ) {
    const [initiatives, people, reference, meetings, linked, moduleSettings, commentMatches] = await Promise.all([
      repository.list(),
      repository.listPeople(),
      repository.listReference(),
      repository.listMeetings(),
      assignments?.listWithInitiativeLink() ?? Promise.resolve([]),
      readSettings(),
      filters.query === undefined
        ? Promise.resolve([] as string[])
        : repository.findInitiativeIdsByCommentText(filters.query),
    ]);
    const names = new Map(people.map((person) => [person.id, person.displayName]));
    const overdueIds = new Set(linked
      .filter((assignment) =>
        assignment.status !== "completed" && assignment.currentOccurrenceDate < today())
      .map((assignment) => assignment.sourceInitiativeId ?? ""));
    const meetingInitiativeIds = new Map(meetings.map((meeting) => [
      meeting.id,
      new Set(meeting.items.filter((item) => item.removedAt === undefined).map((item) => item.initiativeId)),
    ]));
    const visible = initiatives.filter((initiative) =>
      canViewCollegiumInitiative(initiative, profile));
    const passportRequiredIds = new Set(visible
      .filter((initiative) => listCollegiumPassportReasons(initiative, moduleSettings, reference).length > 0)
      .map((initiative) => initiative.id));
    return {
      passportRequiredIds,
      initiatives: filterCollegiumInitiatives(visible, filters, {
        overdueIds,
        passportRequiredIds,
        meetingInitiativeIds,
        commentMatchIds: new Set(commentMatches),
        name: (accountId) => names.get(accountId) ?? "",
        userId: profile.userId,
      }),
      people,
      reference,
      meetings,
      overdueIds,
      linked,
      name: (accountId: string) => names.get(accountId) ?? "",
    };
  }

  async function readDetail(
    profile: ServerUserProfile,
    id: string,
  ): Promise<CollegiumInitiativeDetailResponse> {
    const { initiative, permissions, global } = await requireInitiative(profile, id);
    const [revisions, comments, attachments, people, linkedAssignments, passport] = await Promise.all([
      repository.listRevisions(id),
      repository.listComments(id),
      repository.listAttachments({ type: "initiative", id }),
      readRolePeople(initiative.card),
      listLinkedAssignments(id),
      evaluatePassport(initiative),
    ]);
    return {
      initiative,
      revisions,
      comments,
      attachments,
      canEdit: canEditCollegiumInitiative(initiative, profile, permissions),
      canAttach: canAttach(initiative, profile, permissions),
      canComment: permissions.canParticipate && initiative.status !== "closed",
      canResolveComments: canResolveComments(initiative, profile, permissions),
      actions: listAvailableCollegiumActions(initiative, profile.userId, permissions),
      missingAdmissionFields: listCollegiumAdmissionGaps(initiative.card, people),
      linkedAssignments,
      summaryStatus: readCollegiumSummaryStatus(initiative, linkedAssignments),
      canCreateAssignments: assignableStatuses.includes(initiative.status) &&
        global.canView &&
        hasProfileCapability(profile, "business.manage_collegium_assignments") &&
        (initiative.status !== "approved_pilot" || passport.gaps.length === 0),
      canRecordResult: canRecordResult(initiative, profile, permissions),
      economics: passport.economics,
      passportReasons: passport.reasons,
      passportGaps: passport.gaps,
      canEditPassport: canEditCollegiumPassport(initiative, profile, permissions),
      effectDuplicates: await findVisibleDuplicates(profile, permissions, initiative),
      effectControl: buildEffectControl(initiative, profile, permissions),
      effectGroups: await readEffectGroups(initiative, profile, permissions),
      assignableRoles: listAssignableRoles(initiative, profile),
    };
  }

  function canRecordResult(
    initiative: CollegiumInitiative,
    profile: ServerUserProfile,
    permissions: CollegiumInitiativePermissions,
  ) {
    return ["in_progress", "result_confirmation"].includes(initiative.status) &&
      (permissions.canManage || (permissions.canParticipate && isResultReporter(initiative, profile.userId)));
  }

  function canResolveComments(
    initiative: CollegiumInitiative,
    profile: ServerUserProfile,
    permissions: CollegiumInitiativePermissions,
  ) {
    return permissions.canManage ||
      (permissions.canParticipate && isOwnCollegiumInitiative(initiative, profile.userId));
  }

  return {
    async list(
      profile: ServerUserProfile,
      filters: CollegiumInitiativeFilters = {},
    ): Promise<CollegiumInitiativeListResponse> {
      const permissions = collegiumInitiativePermissions(profile);
      const registry = await loadRegistry(profile, filters);
      if (!permissions.canView) {
        // Без вкладки реестр — только инициативы, где у аккаунта временная роль:
        // ни справочника всех сотрудников, ни заседаний ему не отдаём.
        const assigned = (await repository.list()).filter((initiative) =>
          canViewCollegiumInitiative(initiative, profile));
        if (assigned.length === 0) requireView(profile);
        const mentioned = new Set(assigned.flatMap((initiative) => [
          initiative.card.initiatorId,
          ...listCollegiumRoleHolderIds(initiative),
          initiative.workflow.rework?.responsibleId ?? "",
        ]));
        registry.people = registry.people.filter((person) => mentioned.has(person.id));
        registry.meetings = [];
      }
      return {
        // The registry is a projection: the full passport is read with the card.
        initiatives: registry.initiatives.map(({ card: { passport: _passport, ...card }, ...initiative }) => ({
          ...initiative,
          card,
        })),
        people: registry.people,
        reference: registry.reference,
        permissions,
        meetings: registry.meetings
          .filter((meeting) => meeting.status !== "cancelled")
          .map((meeting) => ({ id: meeting.id, number: meeting.number, meetingDate: meeting.meetingDate })),
        overdueIds: registry.initiatives
          .filter((initiative) => registry.overdueIds.has(initiative.id))
          .map((initiative) => initiative.id),
        passportRequiredIds: registry.initiatives
          .filter((initiative) => registry.passportRequiredIds.has(initiative.id))
          .map((initiative) => initiative.id),
      };
    },

    /**
     * Есть ли у аккаунта без вкладки инициатива, открытая ему временной ролью:
     * по ответу профиль получает пункт меню раздела.
     */
    async hasAssignedInitiatives(profile: ServerUserProfile) {
      if (collegiumInitiativePermissions(profile).canView) return false;
      return (await repository.list()).some((initiative) => canViewCollegiumInitiative(initiative, profile));
    },

    /** Адресаты уведомлений по capability (для доставки после ответа). */
    listUserIdsWithCapability(capability: string) {
      return repository.listUserIdsWithCapability(capability);
    },

    /** Уведомление о поручении из инициативы; HTTP-ветка реестра вызывает после сохранения. */
    async assignmentCreatedNotifications(
      profile: ServerUserProfile,
      initiativeId: string,
      assignmentNumber: string,
    ): Promise<CollegiumNotification[]> {
      const initiative = await repository.read(initiativeId);
      return initiative === undefined
        ? []
        : [buildAssignmentCreatedNotification(initiative, assignmentNumber, profile.userId)];
    },

    /** Карточка для печатной формы с именами людей. */
    async printCard(profile: ServerUserProfile, id: string) {
      const detail = await readDetail(profile, id);
      const names = new Map((await repository.listPeople()).map((person) => [person.id, person.displayName]));
      return { detail, name: (accountId: string) => names.get(accountId) ?? "" };
    },

    /**
     * «Требует моего действия»: только то, что сервер сейчас разрешит этому
     * пользователю, включая проверку независимости при подтверждении эффекта.
     */
    async attention(profile: ServerUserProfile): Promise<CollegiumAttentionItem[]> {
      const [initiatives, linked] = await Promise.all([
        repository.list(),
        assignments?.listWithInitiativeLink() ?? Promise.resolve([]),
      ]);
      const accountId = collegiumAccountId(profile.userId);
      const overdue = new Set(linked
        .filter((assignment) => assignment.status !== "completed" && assignment.currentOccurrenceDate < today())
        .map((assignment) => assignment.sourceInitiativeId ?? ""));
      const items: CollegiumAttentionItem[] = [];
      let hasVisible = false;
      for (const initiative of initiatives) {
        // Права считаются на каждую инициативу: временная роль действует только в своей.
        const { visible, permissions } = resolveCollegiumInitiativeAccess(initiative, profile);
        if (!visible) continue;
        hasVisible = true;
        const actions = listAvailableCollegiumActions(initiative, profile.userId, permissions);
        const add = (reason: string) => items.push({
          initiativeId: initiative.id,
          number: initiative.number,
          title: initiative.card.title,
          reason,
        });
        const rework = initiative.workflow.rework;
        if (initiative.status === "draft" && actions.includes("submit_for_review") && isOwnCollegiumInitiative(initiative, profile.userId)) {
          add("Черновик: дополните и отправьте на оценку");
        } else if (initiative.status === "rework" && rework !== undefined && rework.responsibleId === accountId) {
          add(`Доработка до ${rework.dueDate.split("-").reverse().join(".")}`);
        } else if (initiative.status === "preliminary_review" && actions.includes("admit")) {
          add("Ждёт допуска к рассмотрению Коллегией");
        } else if (initiative.status === "ready" && permissions.canManage) {
          add("Готова: включите в повестку заседания");
        } else if (initiative.status === "board_referral" && actions.includes("board_approve")) {
          add("Внесите решение Совета директоров");
        } else if (initiative.status === "result_confirmation" && actions.includes("confirm_effect")) {
          try {
            await assertIndependentConfirmer(initiative, profile.userId);
            const role = readCollegiumSignerRole(initiative, accountId)!;
            const unsigned = buildCollegiumEffectControlRows(initiative).some((row) =>
              row.fact !== undefined &&
              row.fact.recordedByUserId !== profile.userId &&
              (row.fact.verdicts[role]?.factVersion !== row.fact.version || row.fact.verdicts[role]?.byAccountId !== accountId));
            if (unsigned) add("Подпишите факты по эффекту");
            else if (listCollegiumVerdictGaps(initiative).length === 0) add("Примите решение по эффекту");
          } catch (error) {
            if (!(error instanceof CollegiumInitiativeError)) throw error;
          }
        } else if (
          permissions.canManage &&
          (initiative.status === "in_progress" || initiative.status === "result_confirmation") &&
          (initiative.workflow.verifiers?.financialId ?? "") === ""
        ) {
          add("Назначьте финансового верификатора");
        } else if (
          initiative.status === "in_progress" &&
          overdue.has(initiative.id) &&
          (initiative.card.ownerId === accountId || initiative.card.executorId === accountId)
        ) {
          add("Просрочены поручения по инициативе");
        }
      }
      if (!hasVisible) requireView(profile);
      return items;
    },

    /** Дашборд Коллегии (ТЗ 13.1) по инициативам, видимым пользователю. */
    async dashboard(profile: ServerUserProfile): Promise<CollegiumDashboard> {
      requireView(profile);
      const [initiatives, meetings, linked, reference] = await Promise.all([
        repository.list(),
        repository.listMeetings(),
        assignments?.listWithInitiativeLink() ?? Promise.resolve([]),
        repository.listReference(),
      ]);
      return buildCollegiumDashboard({
        today: today(),
        reference,
        initiatives: initiatives.filter((initiative) => canViewCollegiumInitiative(initiative, profile)),
        meetings,
        assignments: linked,
      });
    },

    /** Квартальный отчёт для СД (ТЗ 13.3) по инициативам, видимым пользователю. */
    async boardReport(profile: ServerUserProfile, quarter: string | null): Promise<CollegiumBoardReport> {
      requireView(profile);
      const period = readCollegiumQuarter(quarter, today());
      const [all, linked, reference, moduleSettings] = await Promise.all([
        repository.list(),
        assignments?.listWithInitiativeLink() ?? Promise.resolve([]),
        repository.listReference(),
        readSettings(),
      ]);
      const visible = all.filter((initiative) => canViewCollegiumInitiative(initiative, profile));
      const revisions = new Map(await Promise.all(visible.map(async (initiative) =>
        [initiative.id, await repository.listRevisions(initiative.id)] as const)));
      return buildCollegiumBoardReport({
        period,
        today: today(),
        initiatives: visible,
        revisions,
        assignments: linked,
        settings: moduleSettings,
        reference,
      });
    },

    /** Тот же отфильтрованный реестр для выгрузок XLSX и PDF. */
    async exportRegistry(profile: ServerUserProfile, filters: CollegiumInitiativeFilters) {
      requireView(profile);
      return loadRegistry(profile, filters);
    },

    read(profile: ServerUserProfile, id: string) {
      return readDetail(profile, id);
    },

    async create(profile: ServerUserProfile, body: unknown, outbox?: CollegiumOutbox) {
      const permissions = requireView(profile);
      if (!permissions.canParticipate) {
        throw new CollegiumInitiativeError("Создавать инициативы может участник Коллегии.", 403);
      }
      const request = readSaveRequest(body);
      const reference = await repository.listReference();
      const card = readCollegiumInitiativeCardInput(request.card, reference);
      const ownAccountId = collegiumAccountId(profile.userId);
      // Only a secretary may register an idea on behalf of someone else.
      if (card.initiatorId === "" || !permissions.canManage) {
        card.initiatorId = ownAccountId;
      }

      return transaction.run(async () => {
        await verifyPeople(card, undefined);
        const createdAt = now();
        const sequence = await repository.nextNumber("initiative", moscowYear());
        const initiative: CollegiumInitiative = {
          id: randomUUID(),
          number: `И-${moscowYear()}-${String(sequence).padStart(4, "0")}`,
          status: "draft",
          revision: 1,
          card,
          workflow: {},
          createdByUserId: profile.userId,
          createdAt: createdAt.toISOString(),
          updatedAt: createdAt.toISOString(),
        };
        await repository.insert(initiative);
        outbox?.push(...buildRoleAssignmentNotifications(initiative, undefined, profile.userId));
        await repository.insertRevision(initiative.id, {
          id: randomUUID(),
          revision: 1,
          createdAt,
          authorDisplayName: profile.displayName,
          status: initiative.status,
          changedFields: [],
          reason: "Создание инициативы",
          comment: request.comment,
          card,
        });
        await recordAudit(
          profile,
          "collegium_initiative.create",
          initiative,
          `Создана инициатива ${initiative.number}`,
        );
        return initiative;
      });
    },

    async update(profile: ServerUserProfile, id: string, body: unknown, outbox?: CollegiumOutbox) {
      const request = readSaveRequest(body);
      if (request.revision === undefined) {
        throw new CollegiumInitiativeError("Передайте ревизию изменяемой карточки.");
      }
      const reference = await repository.listReference();

      return transaction.run(async () => {
        const { initiative, permissions, global } = await requireInitiative(profile, id, true);
        if (!canEditCollegiumInitiative(initiative, profile, permissions)) {
          throw new CollegiumInitiativeError("Эту инициативу сейчас нельзя изменить.", 403);
        }
        if (initiative.revision !== request.revision) {
          throw new CollegiumInitiativeError("Инициатива уже изменена. Обновите карточку.", 409);
        }
        const nextCard = readCollegiumInitiativeCardInput(request.card, reference, initiative.card);
        // The express card form never carries the passport; it is saved separately.
        if (initiative.card.passport !== undefined) nextCard.passport = initiative.card.passport;
        if (!permissions.canManage) {
          nextCard.initiatorId = initiative.card.initiatorId;
        } else if (nextCard.initiatorId === "") {
          nextCard.initiatorId = initiative.card.initiatorId;
        }
        // Временная роль не даёт права раздавать роли: их назначает член Коллегии.
        if (!global.canParticipate) {
          for (const field of collegiumInitiativeRoleFields) nextCard[field] = initiative.card[field];
        }
        const changedFields = listChangedCollegiumFields(initiative.card, nextCard);
        if (changedFields.length === 0) return initiative;
        if (initiative.status !== "draft" && request.reason === "") {
          throw new CollegiumInitiativeError("Укажите причину изменения.");
        }
        await verifyPeople(nextCard, initiative.card);

        const updatedAt = now();
        const updated: CollegiumInitiative = {
          ...initiative,
          card: nextCard,
          revision: initiative.revision + 1,
          updatedAt: updatedAt.toISOString(),
        };
        await repository.update(updated, initiative.revision);
        outbox?.push(...buildRoleAssignmentNotifications(updated, initiative.card, profile.userId));
        await repository.insertRevision(initiative.id, {
          id: randomUUID(),
          revision: updated.revision,
          createdAt: updatedAt,
          authorDisplayName: profile.displayName,
          status: initiative.status,
          changedFields,
          reason: request.reason,
          comment: request.comment,
          card: nextCard,
        });
        await recordAudit(
          profile,
          "collegium_initiative.update",
          updated,
          `Изменена инициатива ${updated.number}`,
          [{
            label: "Изменённые поля",
            value: changedFields.map((field) => collegiumInitiativeFieldLabels[field]).join(", "),
          }],
        );
        return updated;
      });
    },

    /**
     * Временные роли одной инициативы (`POST /:id/roles`): член Коллегии
     * назначает или заменяет переданные роли любому действующему сотруднику.
     * Инварианты независимости проверяются на итоговом состоянии; смена
     * проверяющего снимает его подписи и заключение.
     */
    async assignRoles(profile: ServerUserProfile, id: string, body: unknown, outbox?: CollegiumOutbox) {
      const record = readControlBody(body, [...collegiumAssignableRoles, "reason"]);
      const reason = readCollegiumOptionalText(record.reason, maxReasonLength, "Причина изменения");
      const requested = new Map<CollegiumAssignableRole, string>();
      for (const role of collegiumAssignableRoles) {
        if (record[role] === undefined) continue;
        const value = readCollegiumOptionalText(record[role], 120, "Роль");
        if (value !== "" && !/^account:[A-Za-z0-9_-]{1,100}$/u.test(value)) {
          throw new CollegiumInitiativeError("Выберите действующую учётную запись.");
        }
        requested.set(role, value);
      }
      return transaction.run(async () => {
        const { initiative } = await lockForControl(profile, id, record.revision);
        if (!collegiumInitiativePermissions(profile).canParticipate) {
          throw new CollegiumInitiativeError("Роли назначает член Коллегии.", 403);
        }
        const allowed = listAssignableRoles(initiative, profile);
        const current = (role: CollegiumAssignableRole) => role === "technicalId" || role === "financialId"
          ? initiative.workflow.verifiers?.[role] ?? ""
          : initiative.card[role];
        const changed = [...requested].filter(([role, value]) => value !== current(role));
        if (changed.length === 0) return initiative;
        for (const [role, value] of changed) {
          if (!allowed.includes(role)) {
            throw new CollegiumInitiativeError(
              `«${collegiumAssignableRoleLabels[role]}» сейчас назначить нельзя.`,
              roleFrozenStatuses.includes(initiative.status) ? 409 : 403,
            );
          }
          if (value === "" && role !== "technicalId" && !roleClearableStatuses.includes(initiative.status)) {
            throw new CollegiumInitiativeError(
              `«${collegiumAssignableRoleLabels[role]}»: после допуска роль заменяется, но не снимается.`,
            );
          }
        }
        if (initiative.status !== "draft" && reason === "") {
          throw new CollegiumInitiativeError("Укажите причину изменения.");
        }
        const next = (role: CollegiumAssignableRole) => requested.get(role) ?? current(role);
        const isChanged = (role: CollegiumAssignableRole) => changed.some(([changedRole]) => changedRole === role);
        // До допуска независимость проверяет фильтр допуска; дальше — каждое изменение.
        if (!roleClearableStatuses.includes(initiative.status)) {
          const doers = [next("ownerId"), next("executorId")];
          const checkers = [next("effectControllerId"), next("financialId")].filter((accountId) => accountId !== "");
          if (checkers.some((accountId) => doers.includes(accountId))) {
            throw new CollegiumInitiativeError("Владелец или исполнитель не проверяет собственный эффект.");
          }
          if (checkers.length === 2 && checkers[0] === checkers[1]) {
            throw new CollegiumInitiativeError("Контролёр эффекта и финансовый верификатор должны быть разными людьми.");
          }
        }
        const controlChanged = isChanged("effectControllerId") || isChanged("technicalId") || isChanged("financialId");
        if (controlChanged && controlRoleStatuses.includes(initiative.status)) {
          if (next("effectControllerId") === "" || next("financialId") === "") {
            throw new CollegiumInitiativeError("Назначьте контролёра эффекта и финансового верификатора.");
          }
          if (!collegiumInitiativePermissions(profile).canManage) {
            // Проверяющего выбирает тот, кто сам не был владельцем или исполнителем после допуска.
            await assertIndependentAccount(initiative, collegiumAccountId(profile.userId));
          }
        }
        // Блокировки: строка инициативы уже взята, затем изменённые аккаунты по id.
        const newAccounts = [...new Set(changed.map(([, value]) => value).filter((value) => value !== ""))].sort();
        const names = new Map<string, string>();
        for (const accountId of newAccounts) {
          const person = await repository.readPerson(accountId, true);
          if (person === undefined) {
            throw new CollegiumInitiativeError("Выберите действующую учётную запись.");
          }
          names.set(accountId, person.displayName);
        }
        for (const role of ["effectControllerId", "financialId"] as const) {
          if (isChanged(role) && next(role) !== "") await assertIndependentAccount(initiative, next(role));
        }

        const card = { ...initiative.card };
        for (const role of collegiumInitiativeRoleFields) card[role] = next(role);
        const workflow = { ...initiative.workflow };
        if (isChanged("technicalId") || isChanged("financialId")) {
          workflow.verifiers = {
            technicalId: next("technicalId"),
            financialId: next("financialId"),
            assignedByDisplayName: profile.displayName,
            assignedAt: now().toISOString(),
          };
        }
        if (workflow.verification !== undefined && (isChanged("technicalId") || isChanged("financialId"))) {
          const verification = { ...workflow.verification };
          if (isChanged("technicalId")) delete verification.technical;
          if (isChanged("financialId")) delete verification.financial;
          workflow.verification = verification;
        }
        if (workflow.effectFacts !== undefined && (isChanged("effectControllerId") || isChanged("financialId"))) {
          workflow.effectFacts = Object.fromEntries(Object.entries(workflow.effectFacts).map(([effectId, fact]) => {
            const verdicts = { ...fact.verdicts };
            if (isChanged("effectControllerId")) delete verdicts.controller;
            if (isChanged("financialId")) delete verdicts.financial;
            return [effectId, { ...fact, verdicts }];
          }));
        }
        const previousNames = new Map((await repository.listPeople()).map((person) => [person.id, person.displayName]));
        const personName = (accountId: string) =>
          accountId === "" ? "—" : names.get(accountId) ?? previousNames.get(accountId) ?? "—";
        const updated = await saveControlChange({
          profile,
          initiative,
          card,
          workflow,
          changedFields: collegiumInitiativeRoleFields.filter(isChanged),
          reason,
          summary: "Изменены роли",
          details: changed.map(([role, value]) => ({
            label: collegiumAssignableRoleLabels[role],
            value: `${personName(current(role))} → ${personName(value)}`,
          })),
        });
        outbox?.push(
          ...buildRoleAssignmentNotifications(updated, initiative.card, profile.userId),
          ...buildControlRoleNotifications(updated, {
            controller: "",
            technical: isChanged("technicalId") ? next("technicalId") : "",
            financial: isChanged("financialId") ? next("financialId") : "",
          }, profile.userId),
        );
        return updated;
      });
    },

    /** Заключение технического или финансового верификатора — только назначенного. */
    async recordConclusion(profile: ServerUserProfile, id: string, body: unknown) {
      const record = readControlBody(body, ["role", "text"]);
      if (!(collegiumVerifierRoles as readonly unknown[]).includes(record.role)) {
        throw new CollegiumInitiativeError("Выберите роль верификатора.");
      }
      const role = record.role as CollegiumVerifierRole;
      const text = readCollegiumOptionalText(record.text, maxFactTextLength, "Заключение");
      if (text === "") throw new CollegiumInitiativeError("Напишите заключение.");
      return transaction.run(async () => {
        const { initiative } = await lockForControl(profile, id, record.revision);
        const assigned = initiative.workflow.verifiers?.[role === "technical" ? "technicalId" : "financialId"] ?? "";
        if (assigned === "" || assigned !== collegiumAccountId(profile.userId)) {
          throw new CollegiumInitiativeError("Заключение вносит назначенный верификатор.", 403);
        }
        if (!conclusionStatuses.includes(initiative.status)) {
          throw new CollegiumInitiativeError("Заключение сейчас внести нельзя.", 409);
        }
        const signature = { byAccountId: assigned, byDisplayName: profile.displayName, at: now().toISOString() };
        return saveControlChange({
          profile,
          initiative,
          workflow: {
            ...initiative.workflow,
            verification: { ...initiative.workflow.verification, [role]: { ...signature, text } },
          },
          reason: `Заключение: ${collegiumVerifierRoleLabels[role].toLocaleLowerCase("ru-RU")}`,
          comment: text,
          summary: "Внесено заключение верификатора",
        });
      });
    },

    /** Факт по эффекту (ТЗ 11.1); новая версия снимает подписи. */
    async recordEffectFact(profile: ServerUserProfile, id: string, effectId: string, body: unknown) {
      const record = readControlBody(body, ["actualAmount", "period", "sources", "calculation"]);
      const input = readFactInput(record);
      return transaction.run(async () => {
        const { initiative, permissions } = await lockForControl(profile, id, record.revision);
        if (!canRecordResult(initiative, profile, permissions)) {
          throw new CollegiumInitiativeError("Факт вносят владелец, исполнитель или секретарь в ходе реализации.", 403);
        }
        const effect = listCollegiumPlannedEffects(initiative).find((item) => item.id === effectId);
        if (effect === undefined) throw new CollegiumInitiativeError("Плановый эффект не найден.", 404);
        if (initiative.workflow.effectShares?.[effectId] !== undefined) {
          throw new CollegiumInitiativeError("Факт совместного эффекта вносится один раз для всей группы.", 409);
        }
        const previous = initiative.workflow.effectFacts?.[effectId];
        const fact: CollegiumEffectFact = {
          ...input,
          version: (previous?.version ?? 0) + 1,
          recordedByUserId: profile.userId,
          recordedByDisplayName: profile.displayName,
          recordedAt: now().toISOString(),
          verdicts: {},
        };
        return saveControlChange({
          profile,
          initiative,
          workflow: { ...initiative.workflow, effectFacts: { ...initiative.workflow.effectFacts, [effectId]: fact } },
          reason: `Факт по эффекту: ${effect.label}`,
          summary: "Внесён факт по эффекту",
        });
      });
    },

    /** Подпись контролёра эффекта или финансового верификатора под версией факта. */
    async recordEffectVerdict(profile: ServerUserProfile, id: string, effectId: string, body: unknown) {
      const record = readControlBody(body, ["factVersion", "verdict", "comment"]);
      if (record.verdict !== "confirmed" && record.verdict !== "not_confirmed") {
        throw new CollegiumInitiativeError("Выберите: подтверждаю или не подтверждаю.");
      }
      const verdict = record.verdict;
      const comment = readCollegiumOptionalText(record.comment, maxCommentLength, "Комментарий");
      if (verdict === "not_confirmed" && comment === "") {
        throw new CollegiumInitiativeError("Поясните, почему эффект не подтверждён.");
      }
      return transaction.run(async () => {
        const { initiative, permissions } = await lockForControl(profile, id, record.revision);
        if (initiative.status !== "result_confirmation") {
          throw new CollegiumInitiativeError("Подписи ставятся на этапе подтверждения результата.", 409);
        }
        const accountId = collegiumAccountId(profile.userId);
        const role = permissions.canView ? readCollegiumSignerRole(initiative, accountId) : undefined;
        if (role === undefined) {
          throw new CollegiumInitiativeError("Подписывают контролёр эффекта и финансовый верификатор.", 403);
        }
        await assertIndependentConfirmer(initiative, profile.userId);
        const fact = initiative.workflow.effectFacts?.[effectId];
        if (fact === undefined) throw new CollegiumInitiativeError("По эффекту ещё нет факта.", 409);
        if (fact.version !== record.factVersion) {
          throw new CollegiumInitiativeError("Факт изменён. Обновите карточку и проверьте новую версию.", 409);
        }
        if (fact.recordedByUserId === profile.userId) {
          throw new CollegiumInitiativeError("Автор факта не подписывает его.", 403);
        }
        const signed: CollegiumEffectFact = {
          ...fact,
          verdicts: {
            ...fact.verdicts,
            [role]: { byAccountId: accountId, byDisplayName: profile.displayName, at: now().toISOString(), verdict, comment, factVersion: fact.version },
          },
        };
        return saveControlChange({
          profile,
          initiative,
          workflow: { ...initiative.workflow, effectFacts: { ...initiative.workflow.effectFacts, [effectId]: signed } },
          reason: `${collegiumSignerRoleLabels[role]}: ${verdict === "confirmed" ? "подтверждаю" : "не подтверждаю"}`,
          comment,
          summary: "Подпись под эффектом",
        });
      });
    },

    /**
     * Доли совместного эффекта (ТЗ 11.2) одной операцией: создать, изменить или
     * распустить группу. Ставит секретарь или общий финансовый верификатор всех
     * участников; сумма долей не больше 100 %, участники ещё не прошли проверку.
     */
    async saveEffectGroup(profile: ServerUserProfile, body: unknown) {
      // Группа охватывает чужие инициативы, поэтому временной роли недостаточно.
      requireView(profile);
      const groups = requireGroups();
      const record = readControlBody(body, ["groupId", "members"]);
      const requestedGroupId = readCollegiumOptionalText(record.groupId, 36, "Группа");
      if (!Array.isArray(record.members) || record.members.length > maxGroupMembers) {
        throw new CollegiumInitiativeError(`В совместном эффекте не больше ${maxGroupMembers} участников.`);
      }
      const keys = new Set<string>();
      const members = record.members.map((raw: unknown) => {
        if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
          throw new CollegiumInitiativeError("Проверьте участников совместного эффекта.");
        }
        const item = raw as Record<string, unknown>;
        const initiativeId = typeof item.initiativeId === "string" ? item.initiativeId : "";
        const effectId = typeof item.effectId === "string" ? item.effectId : "";
        if (!/^[A-Za-z0-9-]{1,100}$/u.test(initiativeId) || !/^[A-Za-z0-9-]{1,100}$/u.test(effectId) || effectId === collegiumMainEffectId) {
          throw new CollegiumInitiativeError("В совместный эффект входят описанные плановые эффекты.");
        }
        const key = `${initiativeId}:${effectId}`;
        if (keys.has(key)) throw new CollegiumInitiativeError("Эффект указан в группе дважды.");
        keys.add(key);
        return { initiativeId, effectId, shareBp: readSharePercent(item.sharePercent) };
      });
      if (members.length > 0 && new Set(members.map(({ initiativeId }) => initiativeId)).size < 2) {
        throw new CollegiumInitiativeError("Совместный эффект объединяет не меньше двух инициатив.");
      }
      if (members.reduce((sum, { shareBp }) => sum + shareBp, 0) > 10_000) {
        throw new CollegiumInitiativeError("Сумма долей совместного эффекта не может превышать 100 %.");
      }
      if (requestedGroupId === "" && members.length === 0) {
        throw new CollegiumInitiativeError("Укажите участников совместного эффекта.");
      }
      return transaction.run(async () => {
        const at = now();
        let group;
        if (requestedGroupId === "") {
          group = { id: randomUUID(), revision: 1 } as CollegiumEffectGroupRecord;
          await groups.insertGroup(group.id, profile.displayName, at);
        } else {
          group = await groups.readGroup(requestedGroupId, true);
          if (group === undefined) throw new CollegiumInitiativeError("Совместный эффект не найден.", 404);
          if (group.revision !== record.revision) {
            throw new CollegiumInitiativeError("Совместный эффект уже изменён. Обновите карточку.", 409);
          }
        }
        const groupId = group.id;
        const previous = await groups.listMembers(groupId, true);
        const locked = await lockGroupInitiatives(profile, [...previous, ...members].map(({ initiativeId }) => initiativeId));
        const me = collegiumAccountId(profile.userId);
        if (!collegiumInitiativePermissions(profile).canManage &&
          ![...locked.values()].every((initiative) => initiative.workflow.verifiers?.financialId === me)) {
          throw new CollegiumInitiativeError("Доли ставит секретарь или общий финансовый верификатор всех участников.", 403);
        }
        if ([...locked.values()].some((initiative) => groupFinishedStatuses.includes(initiative.status))) {
          throw new CollegiumInitiativeError("Участник уже прошёл проверку эффекта: доли меняются только после корректировки.", 409);
        }
        const isPrevious = (initiativeId: string, effectId: string) =>
          previous.some((item) => item.initiativeId === initiativeId && item.effectId === effectId);
        for (const member of members) {
          const initiative = locked.get(member.initiativeId)!;
          if (!(initiative.card.passport?.effects ?? []).some(({ id }) => id === member.effectId)) {
            throw new CollegiumInitiativeError(`${initiative.number}: плановый эффект не найден.`, 404);
          }
          const other = await groups.findGroupOf(member.initiativeId, member.effectId);
          if (other !== undefined && other !== groupId) {
            throw new CollegiumInitiativeError(`${initiative.number}: эффект уже входит в другой совместный эффект.`, 409);
          }
          if (!isPrevious(member.initiativeId, member.effectId) && initiative.workflow.effectFacts?.[member.effectId] !== undefined) {
            throw new CollegiumInitiativeError(`${initiative.number}: по эффекту уже внесён факт — внесите факт для группы.`, 409);
          }
        }
        if (members.length === 0) {
          await groups.deleteGroup(groupId);
        } else {
          await groups.replaceMembers(groupId, members);
          if (!await groups.updateGroup(groupId, group.revision, group.fact, profile.displayName, at)) {
            throw new CollegiumInitiativeError("Совместный эффект уже изменён. Обновите карточку.", 409);
          }
        }
        for (const [initiativeId, initiative] of locked) {
          const shares = { ...initiative.workflow.effectShares };
          for (const [effectId, entry] of Object.entries(shares)) {
            if (entry.groupId === groupId) delete shares[effectId];
          }
          const own = members.filter((member) => member.initiativeId === initiativeId);
          for (const member of own) shares[member.effectId] = { groupId, shareBp: member.shareBp };
          const facts = { ...initiative.workflow.effectFacts };
          // A changed share changes the counted effect: signatures start over.
          for (const effectId of new Set([...previous, ...members]
            .filter((member) => member.initiativeId === initiativeId)
            .map((member) => member.effectId))) {
            const joining = own.some((member) => member.effectId === effectId) && !isPrevious(initiativeId, effectId);
            if (joining && group.fact !== undefined) facts[effectId] = copyGroupFact(group.fact, facts[effectId]);
            else if (facts[effectId] !== undefined) facts[effectId] = { ...facts[effectId], verdicts: {} };
          }
          const workflow: CollegiumInitiative["workflow"] = { ...initiative.workflow, effectFacts: facts, effectShares: shares };
          if (Object.keys(shares).length === 0) delete workflow.effectShares;
          if (Object.keys(facts).length === 0) delete workflow.effectFacts;
          await saveControlChange({
            profile,
            initiative,
            workflow,
            reason: members.length === 0 ? "Совместный эффект распущен" : "Совместный эффект: доли участников",
            summary: "Изменён совместный эффект",
          });
        }
        return { groupId: members.length === 0 ? "" : groupId };
      });
    },

    /** Единственный факт совместного эффекта; копия у каждого участника, подписи заново. */
    async recordEffectGroupFact(profile: ServerUserProfile, groupId: string, body: unknown) {
      requireView(profile);
      const groups = requireGroups();
      const record = readControlBody(body, ["actualAmount", "period", "sources", "calculation"]);
      const input = readFactInput(record);
      return transaction.run(async () => {
        const group = await groups.readGroup(groupId, true);
        if (group === undefined) throw new CollegiumInitiativeError("Совместный эффект не найден.", 404);
        if (group.revision !== record.revision) {
          throw new CollegiumInitiativeError("Совместный эффект уже изменён. Обновите карточку.", 409);
        }
        const members = await groups.listMembers(groupId, true);
        const locked = await lockGroupInitiatives(profile, members.map(({ initiativeId }) => initiativeId));
        if ([...locked.values()].some((initiative) => !factStatuses.includes(initiative.status))) {
          throw new CollegiumInitiativeError("Факт совместного эффекта вносится, когда все участники в реализации или на подтверждении.", 409);
        }
        const permissions = collegiumInitiativePermissions(profile);
        if (!permissions.canManage && !(permissions.canParticipate &&
          [...locked.values()].some((initiative) => isResultReporter(initiative, profile.userId)))) {
          throw new CollegiumInitiativeError("Факт вносят владелец или исполнитель участника либо секретарь.", 403);
        }
        const at = now();
        const fact: CollegiumEffectGroupFact = {
          ...input,
          version: (group.fact?.version ?? 0) + 1,
          recordedByUserId: profile.userId,
          recordedByDisplayName: profile.displayName,
          recordedAt: at.toISOString(),
        };
        if (!await groups.updateGroup(groupId, group.revision, fact, profile.displayName, at)) {
          throw new CollegiumInitiativeError("Совместный эффект уже изменён. Обновите карточку.", 409);
        }
        for (const [initiativeId, initiative] of locked) {
          const facts = { ...initiative.workflow.effectFacts };
          for (const member of members.filter((item) => item.initiativeId === initiativeId)) {
            facts[member.effectId] = copyGroupFact(fact, facts[member.effectId]);
          }
          await saveControlChange({
            profile,
            initiative,
            workflow: { ...initiative.workflow, effectFacts: facts },
            reason: "Факт совместного эффекта",
            summary: "Внесён факт совместного эффекта",
          });
        }
        return { groupId };
      });
    },

    /** Полный паспорт (ТЗ 6.3): отдельная ревизия карточки с причиной и аудитом. */
    async savePassport(profile: ServerUserProfile, id: string, body: unknown) {
      const request = readSaveRequest(body, "passport");
      if (request.revision === undefined) {
        throw new CollegiumInitiativeError("Передайте ревизию изменяемой карточки.");
      }
      const reference = await repository.listReference();
      return transaction.run(async () => {
        const { initiative, permissions } = await requireInitiative(profile, id, true);
        if (!canEditCollegiumPassport(initiative, profile, permissions)) {
          throw new CollegiumInitiativeError("Паспорт этой инициативы сейчас нельзя изменить.", 403);
        }
        if (initiative.revision !== request.revision) {
          throw new CollegiumInitiativeError("Инициатива уже изменена. Обновите карточку.", 409);
        }
        const passport = readCollegiumPassportInput(request.passport, {
          reference,
          previous: initiative.card.passport,
        });
        // Facts belong to planned effects: a measured effect cannot vanish or hide behind a new one.
        const facts = initiative.workflow.effectFacts ?? {};
        const removed = (initiative.card.passport?.effects ?? [])
          .filter((effect) => facts[effect.id] !== undefined && !passport.effects.some((item) => item.id === effect.id));
        if (removed.length > 0) {
          throw new CollegiumInitiativeError("По удаляемому эффекту уже внесён факт.", 409);
        }
        const shares = initiative.workflow.effectShares ?? {};
        if (Object.keys(shares).some((effectId) => !passport.effects.some((item) => item.id === effectId))) {
          throw new CollegiumInitiativeError("Эффект входит в совместную группу: сначала исключите его из группы.", 409);
        }
        if ((initiative.card.passport?.effects.length ?? 0) === 0 && passport.effects.length > 0 &&
          facts[collegiumMainEffectId] !== undefined) {
          throw new CollegiumInitiativeError("По эффекту экспресс-карты уже внесён факт: описывать эффекты поздно.", 409);
        }
        // A possible double count is saved only with an explanation (ТЗ 11.2).
        const unexplained = (await findVisibleDuplicates(profile, permissions, { ...initiative, card: { ...initiative.card, passport } }))
          .filter((duplicate) =>
            passport.effects.find((effect) => effect.id === duplicate.effectId)?.notDuplicateExplanation === "");
        if (unexplained.length > 0) {
          const numbers = [...new Set(unexplained.map((duplicate) => duplicate.initiativeNumber))];
          throw new CollegiumInitiativeError(
            `Похожий эффект уже учтён в инициативах ${numbers.join(", ")}. Отметьте, почему это не дубль.`,
            409,
          );
        }
        if (JSON.stringify(initiative.card.passport ?? null) === JSON.stringify(passport)) return initiative;
        if (initiative.status !== "draft" && request.reason === "") {
          throw new CollegiumInitiativeError("Укажите причину изменения.");
        }
        const updatedAt = now();
        const card = { ...initiative.card, passport };
        const updated: CollegiumInitiative = {
          ...initiative,
          card,
          revision: initiative.revision + 1,
          updatedAt: updatedAt.toISOString(),
        };
        await repository.update(updated, initiative.revision);
        await repository.insertRevision(initiative.id, {
          id: randomUUID(),
          revision: updated.revision,
          createdAt: updatedAt,
          authorDisplayName: profile.displayName,
          status: initiative.status,
          changedFields: ["passport"],
          reason: request.reason,
          comment: request.comment,
          card,
        });
        await recordAudit(
          profile,
          "collegium_initiative.update",
          updated,
          `Изменён полный паспорт инициативы ${updated.number}`,
          [{ label: "Изменённые поля", value: "Полный паспорт" }],
        );
        return updated;
      });
    },

    async act(profile: ServerUserProfile, id: string, body: unknown, outbox?: CollegiumOutbox) {
      const request = readCollegiumActionRequest(body, today());
      return transaction.run(async () => {
        const { initiative, permissions } = await requireInitiative(profile, id, true);
        if (initiative.revision !== request.revision) {
          throw new CollegiumInitiativeError("Инициатива уже изменена. Обновите карточку.", 409);
        }
        const toStatus = planCollegiumAction(initiative, request.action, profile.userId, permissions);
        if (request.action === "admit") {
          const gaps = listCollegiumAdmissionGaps(
            initiative.card,
            await readRolePeople(initiative.card, true),
          );
          if (gaps.length > 0) {
            throw new CollegiumInitiativeError(
              `Не заполнены обязательные данные: ${gaps.join("; ")}.`,
            );
          }
        }
        if (request.action === "admit" || request.action === "board_approve") {
          requirePassport((await evaluatePassport(initiative)).gaps);
        }
        const changedAt = now();
        const workflow = { ...initiative.workflow };
        if (request.action === "submit_for_review" && workflow.submittedAt === undefined) {
          workflow.submittedAt = changedAt.toISOString();
        }
        if (request.action === "suspend" || request.action === "board_suspend") {
          workflow.suspendedFrom = initiative.status;
        }
        if (request.action === "confirm_effect" || request.action === "reject_effect") {
          await assertIndependentConfirmer(initiative, profile.userId);
          const gaps = listCollegiumVerdictGaps(initiative);
          if (gaps.length > 0) {
            throw new CollegiumInitiativeError(`Решение по эффекту пока нельзя принять: ${gaps.join("; ")}.`, 409);
          }
          const confirmed = buildCollegiumConfirmedEffects(initiative);
          const anyConfirmed = confirmed.some((effect) => effect.status === "confirmed");
          if (request.action === "confirm_effect" && !anyConfirmed) {
            throw new CollegiumInitiativeError("Ни один эффект не подтверждён подписями: признайте эффект неподтверждённым.", 409);
          }
          if (request.action === "reject_effect" && anyConfirmed) {
            throw new CollegiumInitiativeError("Есть подтверждённые подписями эффекты: подтвердите эффект инициативы.", 409);
          }
          await assertReadyForClosure(initiative);
          workflow.effectOutcome = request.action === "confirm_effect" ? "confirmed" : "unconfirmed";
          if (request.action === "confirm_effect") {
            workflow.effectConfirmation = {
              confirmedByDisplayName: profile.displayName,
              confirmedAt: changedAt.toISOString(),
              result: initiative.workflow.result!,
              effects: confirmed,
            };
          }
        }
        if (request.action === "close" && initiative.status === "done_confirmed") {
          await assertReadyForClosure(initiative);
        }
        if (request.action === "reopen_effect") {
          // The previous decision stays in the revision snapshot; signatures start over.
          delete workflow.effectConfirmation;
          delete workflow.effectOutcome;
          delete workflow.verification;
          if (workflow.effectFacts !== undefined) {
            workflow.effectFacts = Object.fromEntries(Object.entries(workflow.effectFacts)
              .map(([effectId, fact]) => [effectId, { ...fact, verdicts: {} }]));
          }
        }
        if (request.action === "resume") delete workflow.suspendedFrom;
        if (request.rework !== undefined) {
          const responsible = await repository.readPerson(request.rework.responsibleId, true);
          if (responsible === undefined) {
            throw new CollegiumInitiativeError("Ответственный за доработку должен быть действующей учётной записью.");
          }
          workflow.rework = {
            ...request.rework,
            requestedByDisplayName: profile.displayName,
            requestedAt: changedAt.toISOString(),
          };
          for (const remark of request.rework.remarks) {
            await repository.insertComment(initiative.id, {
              id: randomUUID(),
              kind: "remark",
              text: remark,
              authorUserId: profile.userId,
              authorDisplayName: profile.displayName,
              createdAt: changedAt.toISOString(),
            });
          }
        }
        const updated = await recordCollegiumInitiativeEvent({
          repository,
          profile,
          initiative,
          toStatus,
          workflow,
          action: request.action,
          reason: collegiumInitiativeActionLabels[request.action],
          comment: request.comment,
          at: changedAt,
        });
        await recordAudit(
          profile,
          "collegium_initiative.transition",
          updated,
          `${collegiumInitiativeActionLabels[request.action]}: инициатива ${updated.number}`,
          [
            { label: "Было", value: collegiumInitiativeStatusLabels[initiative.status] },
            { label: "Стало", value: collegiumInitiativeStatusLabels[toStatus] },
            ...(request.comment === "" ? [] : [{ label: "Комментарий", value: request.comment }]),
          ],
        );
        outbox?.push(...buildActionNotifications(initiative, updated, request.action, profile.userId));
        return updated;
      });
    },

    async comment(profile: ServerUserProfile, id: string, body: unknown) {
      const { kind, text } = readCommentRequest(body);
      return transaction.run(async () => {
        const { initiative, permissions } = await requireInitiative(profile, id, true);
        if (!permissions.canParticipate || initiative.status === "closed") {
          throw new CollegiumInitiativeError("Комментировать эту инициативу нельзя.", 403);
        }
        if (kind === "remark" && !permissions.canManage) {
          throw new CollegiumInitiativeError("Замечания оставляет секретарь или председатель.", 403);
        }
        const comment: CollegiumInitiativeComment = {
          id: randomUUID(),
          kind,
          text,
          authorUserId: profile.userId,
          authorDisplayName: profile.displayName,
          createdAt: now().toISOString(),
        };
        await repository.insertComment(initiative.id, comment);
        await recordAudit(
          profile,
          "collegium_initiative.comment",
          initiative,
          `Комментарий к инициативе ${initiative.number}`,
        );
        return comment;
      });
    },

    /**
     * Проверка до чтения тела: права, статус и лимиты по заявленному размеру,
     * чтобы чужой или лишний файл не загружался на сервер целиком.
     */
    async recordResult(profile: ServerUserProfile, id: string, body: unknown) {
      const revision = typeof body === "object" && body !== null && !Array.isArray(body)
        ? (body as Record<string, unknown>).revision
        : undefined;
      const result = readCollegiumResultInput(body, readCollegiumAmount);
      return transaction.run(async () => {
        const { initiative, permissions } = await requireInitiative(profile, id, true);
        if (initiative.revision !== revision) {
          throw new CollegiumInitiativeError("Инициатива уже изменена. Обновите карточку.", 409);
        }
        if (!canRecordResult(initiative, profile, permissions)) {
          throw new CollegiumInitiativeError("Фактический результат вносят владелец, исполнитель или секретарь в ходе реализации.", 403);
        }
        const at = now();
        const updated: CollegiumInitiative = {
          ...initiative,
          workflow: {
            ...initiative.workflow,
            result: { ...result, recordedByDisplayName: profile.displayName, recordedAt: at.toISOString() },
          },
          revision: initiative.revision + 1,
          updatedAt: at.toISOString(),
        };
        await repository.update(updated, initiative.revision);
        await repository.insertRevision(initiative.id, {
          id: randomUUID(),
          revision: updated.revision,
          createdAt: at,
          authorDisplayName: profile.displayName,
          status: initiative.status,
          changedFields: [],
          reason: "Внесён фактический результат",
          comment: result.description,
          card: initiative.card,
        });
        await recordAudit(profile, "collegium_initiative.update", updated, `Фактический результат инициативы ${updated.number}`);
        return updated;
      });
    },

    /**
     * Порт для реестра «Поручения Коллегии»: проверка и переход в реализацию.
     * Ошибки отдаются в формате реестра, чтобы его маршрут вернул тот же статус.
     */
    assignmentLinks: {
      async lockForAssignment(profile: ServerUserProfile, initiativeId: string) {
        try {
          // Поручение из инициативы создаёт аккаунт с вкладкой, а не держатель временной роли.
          requireView(profile);
          const { initiative } = await requireInitiative(profile, initiativeId, true);
          if (!assignableStatuses.includes(initiative.status)) {
            throw new CollegiumInitiativeError(
              "Поручения создаются по инициативам, одобренным к пилоту или внедрению.",
              409,
            );
          }
          if (initiative.status === "approved_pilot") {
            try {
              requirePassport((await evaluatePassport(initiative)).gaps);
            } catch (error) {
              if (error instanceof CollegiumInitiativeError) throw new CollegiumInitiativeError(error.message, 409);
              throw error;
            }
          }
        } catch (error) {
          if (error instanceof CollegiumInitiativeError) {
            throw new DirectorAssignmentError(error.message, error.status);
          }
          throw error;
        }
      },
      async recordAssignmentCreated(
        profile: ServerUserProfile,
        initiativeId: string,
        assignment: { id: string; number: string },
      ) {
        const initiative = await repository.read(initiativeId, true);
        if (initiative === undefined) throw new CollegiumInitiativeError("Инициатива не найдена.", 404);
        if (initiative.status === "in_progress") return;
        const updated = await recordCollegiumInitiativeEvent({
          repository,
          profile,
          initiative,
          toStatus: "in_progress",
          workflow: initiative.workflow,
          action: "assignment_created",
          reason: `Создано поручение ${assignment.number}`,
          comment: "",
          at: now(),
        });
        await recordAudit(
          profile,
          "collegium_initiative.transition",
          updated,
          `Инициатива ${updated.number} в реализации`,
          [{ label: "Поручение", value: assignment.number }],
        );
      },
    },

    async prepareFileUpload(
      profile: ServerUserProfile,
      id: string,
      rawFileName: string | null,
      declaredBytes: number,
    ) {
      const fileName = readCollegiumAttachmentFileName(rawFileName);
      await requireAttachRights(profile, id, false);
      if (Number.isFinite(declaredBytes) && declaredBytes > collegiumAttachmentLimits.maxFileBytes) {
        throw new CollegiumInitiativeError("Размер одного файла не должен превышать 7 МБ.", 413);
      }
      await assertAttachmentRoom(id, Number.isFinite(declaredBytes) ? declaredBytes : 0);
      return fileName;
    },

    async addFile(profile: ServerUserProfile, id: string, fileName: string, content: Buffer) {
      const fileType = detectCollegiumAttachmentType(fileName, content);
      return transaction.run(async () => {
        const { initiative } = await requireAttachRights(profile, id, true);
        await assertAttachmentRoom(id, content.length);
        const attachment: CollegiumAttachment = {
          id: randomUUID(),
          kind: "file",
          label: fileName,
          fileName,
          fileType,
          sizeBytes: content.length,
          createdByDisplayName: profile.displayName,
          createdAt: now().toISOString(),
        };
        await repository.insertAttachment(
          { type: "initiative", id },
          { ...attachment, createdByUserId: profile.userId },
          content,
        );
        await recordAudit(
          profile,
          "collegium_initiative.attachment_add",
          initiative,
          `Приложен файл к инициативе ${initiative.number}`,
          [{ label: "Файл", value: fileName }],
        );
        return attachment;
      });
    },

    async addLink(profile: ServerUserProfile, id: string, body: unknown) {
      const link = readCollegiumAttachmentLink(body);
      return transaction.run(async () => {
        const { initiative } = await requireAttachRights(profile, id, true);
        await assertAttachmentRoom(id, 0);
        const attachment: CollegiumAttachment = {
          id: randomUUID(),
          kind: "link",
          label: link.label,
          url: link.url,
          createdByDisplayName: profile.displayName,
          createdAt: now().toISOString(),
        };
        await repository.insertAttachment(
          { type: "initiative", id },
          { ...attachment, createdByUserId: profile.userId },
        );
        await recordAudit(
          profile,
          "collegium_initiative.attachment_add",
          initiative,
          `Приложена ссылка к инициативе ${initiative.number}`,
          [{ label: "Ссылка", value: link.label }],
        );
        return attachment;
      });
    },

    async readFile(profile: ServerUserProfile, id: string, attachmentId: string) {
      await requireInitiative(profile, id);
      const attachment = await repository.readAttachment({ type: "initiative", id }, attachmentId);
      if (attachment?.kind !== "file" || attachment.fileType === undefined) {
        throw new CollegiumInitiativeError("Файл не найден.", 404);
      }
      const content = await repository.readAttachmentContent(attachmentId);
      if (content === undefined) throw new CollegiumInitiativeError("Файл не найден.", 404);
      return {
        fileName: attachment.fileName ?? attachment.label,
        contentType: collegiumAttachmentFileTypes[attachment.fileType].contentType,
        content,
      };
    },

    async deleteAttachment(profile: ServerUserProfile, id: string, attachmentId: string) {
      return transaction.run(async () => {
        const { initiative } = await requireAttachRights(profile, id, true);
        const attachment = await repository.readAttachment({ type: "initiative", id }, attachmentId, true);
        if (attachment === undefined) throw new CollegiumInitiativeError("Материал не найден.", 404);
        await repository.deleteAttachment({ type: "initiative", id }, attachmentId, now(), profile.displayName);
        await recordAudit(
          profile,
          "collegium_initiative.attachment_delete",
          initiative,
          `Удалён материал инициативы ${initiative.number}`,
          [{ label: "Материал", value: attachment.label }],
        );
      });
    },

    async resolveComment(profile: ServerUserProfile, id: string, commentId: string) {
      return transaction.run(async () => {
        const { initiative, permissions } = await requireInitiative(profile, id, true);
        if (!canResolveComments(initiative, profile, permissions)) {
          throw new CollegiumInitiativeError("Отметить устранение может автор, владелец или секретарь.", 403);
        }
        const comment = await repository.readComment(id, commentId, true);
        if (comment === undefined) {
          throw new CollegiumInitiativeError("Комментарий не найден.", 404);
        }
        if (comment.kind === "comment") {
          throw new CollegiumInitiativeError("Устранёнными отмечаются только вопросы и замечания.");
        }
        const resolvedAt = now();
        if (!await repository.resolveComment(id, commentId, resolvedAt, profile.displayName)) {
          throw new CollegiumInitiativeError("Замечание уже отмечено устранённым.", 409);
        }
        await recordAudit(
          profile,
          "collegium_initiative.comment_resolve",
          initiative,
          `Отмечено устранение по инициативе ${initiative.number}`,
        );
        return {
          ...comment,
          resolvedAt: resolvedAt.toISOString(),
          resolvedByDisplayName: profile.displayName,
        };
      });
    },
  };
}

export type CollegiumInitiativesService = ReturnType<
  typeof createCollegiumInitiativesService
>;

function readCommentRequest(body: unknown): { kind: CollegiumCommentKind; text: string } {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new CollegiumInitiativeError("Передайте комментарий.");
  }
  const record = body as Record<string, unknown>;
  if (Object.keys(record).some((key) => key !== "kind" && key !== "text")) {
    throw new CollegiumInitiativeError("Запрос содержит неизвестные поля.");
  }
  if (!(collegiumCommentKinds as readonly unknown[]).includes(record.kind)) {
    throw new CollegiumInitiativeError("Выберите вид комментария.");
  }
  const text = readCollegiumOptionalText(record.text, maxDiscussionCommentLength, "Комментарий");
  if (text === "") throw new CollegiumInitiativeError("Напишите текст комментария.");
  return { kind: record.kind as CollegiumCommentKind, text };
}

function readSaveRequest(body: unknown, payloadKey: "card" | "passport" = "card") {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new CollegiumInitiativeError("Передайте карточку инициативы.");
  }
  const record = body as Record<string, unknown>;
  const unknownField = Object.keys(record).find(
    (key) => ![payloadKey, "revision", "reason", "comment"].includes(key),
  );
  if (unknownField !== undefined) {
    throw new CollegiumInitiativeError("Запрос содержит неизвестные поля.");
  }
  const revision = record.revision;
  if (
    revision !== undefined &&
    (typeof revision !== "number" || !Number.isInteger(revision) || revision < 1)
  ) {
    throw new CollegiumInitiativeError("Проверьте ревизию карточки.");
  }
  return {
    card: record.card,
    passport: record.passport,
    revision: revision as number | undefined,
    reason: readCollegiumOptionalText(record.reason, maxReasonLength, "Причина изменения"),
    comment: readCollegiumOptionalText(record.comment, maxCommentLength, "Комментарий"),
  };
}
