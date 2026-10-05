import { randomUUID } from "node:crypto";
import {
  collegiumAgendaEventLabels,
  collegiumAttachmentFileTypes,
  collegiumAttachmentLimits,
  collegiumDecisionLabels,
  collegiumInitiativeStatusLabels,
  collegiumMeetingDecisionStatuses,
  type CollegiumAttachment,
  type CollegiumInitiative,
  type CollegiumMeeting,
  type CollegiumMeetingDetailResponse,
  type CollegiumMeetingItem,
  type CollegiumMeetingListResponse,
} from "../contracts/collegiumInitiatives.js";
import type { DatabaseTransactionRunner } from "../db/transactionContext.js";
import type { AuditRepository } from "../repositories/auditRepository.js";
import type { CollegiumInitiativesRepository } from "../repositories/collegiumInitiativesRepository.js";
import type { ServerUserProfile } from "./auth.js";
import {
  assertCollegiumAttachmentRoom,
  detectCollegiumAttachmentType,
  readCollegiumAttachmentFileName,
  readCollegiumAttachmentLink,
} from "./collegiumAttachment.js";
import { collegiumInitiativePermissions, CollegiumInitiativeError } from "./collegiumInitiative.js";
import { recordCollegiumInitiativeEvent } from "./collegiumInitiativeEvents.js";
import { listCollegiumAdmissionGaps } from "./collegiumInitiativeWorkflow.js";
import {
  buildCollegiumProtocolDraft,
  maxCollegiumProtocolLength,
  readCollegiumAgendaItemRequest,
  readCollegiumItemDecision,
  readCollegiumMeetingDetails,
  readCollegiumMeetingRevision,
  readCollegiumProtocolText,
  readCollegiumRevisionRequest,
} from "./collegiumMeeting.js";

type MeetingAuditAction =
  | "collegium_meeting.create"
  | "collegium_meeting.update"
  | "collegium_meeting.agenda"
  | "collegium_meeting.decision"
  | "collegium_meeting.protocol_update"
  | "collegium_meeting.protocol_approve"
  | "collegium_meeting.cancel"
  | "collegium_meeting.attachment_add"
  | "collegium_meeting.attachment_delete";

/**
 * Заседания Коллегии. Порядок блокировок: заседание → инициативы (по id) →
 * аккаунты. Решения вопросов — проекты; к инициативам их применяет только
 * утверждение протокола председателем одной транзакцией.
 */
export function createCollegiumMeetingsService({
  repository,
  transaction,
  audit,
  now = () => new Date(),
}: {
  repository: CollegiumInitiativesRepository;
  transaction: DatabaseTransactionRunner;
  audit: AuditRepository;
  now?: () => Date;
}) {
  const today = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Moscow" }).format(now());
  const moscowYear = () => Number(
    new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Moscow", year: "numeric" }).format(now()),
  );

  function requireView(profile: ServerUserProfile) {
    const permissions = collegiumInitiativePermissions(profile);
    if (!permissions.canView) {
      throw new CollegiumInitiativeError("Заседания Коллегии недоступны.", 403);
    }
    return permissions;
  }

  function requireManage(profile: ServerUserProfile) {
    const permissions = requireView(profile);
    if (!permissions.canManage) {
      throw new CollegiumInitiativeError("Заседания ведёт секретарь или председатель Коллегии.", 403);
    }
    return permissions;
  }

  async function requireMeeting(profile: ServerUserProfile, id: string, lock = false) {
    requireView(profile);
    const meeting = await repository.readMeeting(id, lock);
    if (meeting === undefined) throw new CollegiumInitiativeError("Заседание не найдено.", 404);
    return meeting;
  }

  /** Изменяемое заседание: секретарь, нужная ревизия и статус «Запланировано». */
  async function requirePlannedMeeting(profile: ServerUserProfile, id: string, revision: number) {
    requireManage(profile);
    const meeting = await requireMeeting(profile, id, true);
    if (meeting.revision !== revision) {
      throw new CollegiumInitiativeError("Заседание уже изменено. Обновите страницу.", 409);
    }
    if (meeting.status !== "planned") {
      throw new CollegiumInitiativeError("Утверждённое или отменённое заседание не меняется.", 409);
    }
    return meeting;
  }

  function findItem(meeting: CollegiumMeeting, itemId: string) {
    const item = meeting.items.find((entry) => entry.id === itemId && entry.removedAt === undefined);
    if (item === undefined) throw new CollegiumInitiativeError("Вопрос повестки не найден.", 404);
    return item;
  }

  async function lockAgendaInitiative(item: CollegiumMeetingItem) {
    const initiative = await repository.read(item.initiativeId, true);
    if (initiative === undefined) throw new CollegiumInitiativeError("Инициатива не найдена.", 404);
    return initiative;
  }

  function nextAgendaVersion(meeting: CollegiumMeeting) {
    return { agendaVersion: (meeting.agendaVersion ?? 0) + 1 };
  }

  async function saveMeeting(meeting: CollegiumMeeting, changes: Partial<CollegiumMeeting>) {
    const updated: CollegiumMeeting = {
      ...meeting,
      ...changes,
      revision: meeting.revision + 1,
      updatedAt: now().toISOString(),
    };
    await repository.updateMeeting(updated, meeting.revision);
    return updated;
  }

  function recordAudit(
    profile: ServerUserProfile,
    action: MeetingAuditAction,
    meeting: CollegiumMeeting,
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
      details: [{ label: "Заседание", value: meeting.number }, ...details],
      targetType: "collegium_meeting",
      targetId: meeting.id,
    });
  }

  async function verifyPeople(ids: readonly string[]) {
    for (const id of [...new Set(ids)].sort()) {
      if (await repository.readPerson(id, true) === undefined) {
        throw new CollegiumInitiativeError("В заседании указаны только действующие учётные записи.");
      }
    }
  }

  async function namesOf() {
    const people = await repository.listPeople();
    const names = new Map(people.map((person) => [person.id, person.displayName]));
    return { people, name: (id: string) => names.get(id) ?? "" };
  }

  /** Возвращает инициативу вопроса в «Готова к рассмотрению» при снятии или отмене. */
  async function releaseInitiative(
    profile: ServerUserProfile,
    item: CollegiumMeetingItem,
    action: "remove_from_agenda" | "meeting_cancelled",
    comment: string,
    at: Date,
  ) {
    const initiative = await lockAgendaInitiative(item);
    if (initiative.status !== "on_agenda" && initiative.status !== "in_discussion") return;
    const { agenda: _agenda, ...workflow } = initiative.workflow;
    await recordCollegiumInitiativeEvent({
      repository,
      profile,
      initiative,
      toStatus: "ready",
      workflow,
      action,
      reason: collegiumAgendaEventLabels[action],
      comment,
      at,
    });
  }

  return {
    async list(profile: ServerUserProfile): Promise<CollegiumMeetingListResponse> {
      const permissions = requireView(profile);
      const meetings = await repository.listMeetings();
      return {
        meetings: meetings.map((meeting) => ({
          id: meeting.id,
          number: meeting.number,
          status: meeting.status,
          meetingDate: meeting.meetingDate,
          meetingTime: meeting.meetingTime,
          format: meeting.format,
          updatedAt: meeting.updatedAt,
          itemCount: meeting.items.filter((item) => item.removedAt === undefined).length,
        })),
        permissions,
      };
    },

    async read(profile: ServerUserProfile, id: string): Promise<CollegiumMeetingDetailResponse> {
      const permissions = requireView(profile);
      const meeting = await requireMeeting(profile, id);
      const [attachments, people, initiatives] = await Promise.all([
        repository.listAttachments({ type: "meeting", id }),
        repository.listPeople(),
        permissions.canManage && meeting.status === "planned" ? repository.list() : Promise.resolve([]),
      ]);
      return {
        meeting,
        attachments,
        people,
        readyInitiatives: initiatives
          .filter((initiative) => initiative.status === "ready")
          .map((initiative) => ({
            id: initiative.id,
            number: initiative.number,
            revision: initiative.revision,
            title: initiative.card.title,
          })),
        canManage: permissions.canManage,
        canApprove: permissions.canApprove,
      };
    },

    async create(profile: ServerUserProfile, body: unknown) {
      requireManage(profile);
      const details = readCollegiumMeetingDetails(body);
      return transaction.run(async () => {
        await verifyPeople([...details.participantIds, ...details.absentIds]);
        const createdAt = now().toISOString();
        const sequence = await repository.nextNumber("meeting", moscowYear());
        const meeting: CollegiumMeeting = {
          ...details,
          id: randomUUID(),
          number: `КЗ-${moscowYear()}-${String(sequence).padStart(2, "0")}`,
          status: "planned",
          revision: 1,
          items: [],
          protocol: { text: "" },
          createdByDisplayName: profile.displayName,
          createdAt,
          updatedAt: createdAt,
        };
        await repository.insertMeeting(meeting);
        await recordAudit(profile, "collegium_meeting.create", meeting, `Создано заседание ${meeting.number}`);
        return meeting;
      });
    },

    async updateDetails(profile: ServerUserProfile, id: string, body: unknown) {
      const record = typeof body === "object" && body !== null && !Array.isArray(body)
        ? body as Record<string, unknown>
        : {};
      const { revision, ...detailsInput } = record;
      const details = readCollegiumMeetingDetails(detailsInput);
      const expected = readCollegiumMeetingRevision({ revision });
      return transaction.run(async () => {
        const meeting = await requirePlannedMeeting(profile, id, expected);
        await verifyPeople([...details.participantIds, ...details.absentIds]);
        const updated = await saveMeeting(meeting, { ...details, ...nextAgendaVersion(meeting) });
        await recordAudit(profile, "collegium_meeting.update", updated, `Изменены реквизиты заседания ${meeting.number}`);
        return updated;
      });
    },

    async addItem(profile: ServerUserProfile, id: string, body: unknown) {
      const request = readCollegiumAgendaItemRequest(body);
      return transaction.run(async () => {
        const meeting = await requirePlannedMeeting(profile, id, request.revision);
        const initiative = await repository.read(request.initiativeId, true);
        if (initiative === undefined || initiative.status !== "ready") {
          throw new CollegiumInitiativeError("В повестку включаются только инициативы «Готова к рассмотрению».", 409);
        }
        const people = new Map<string, Awaited<ReturnType<typeof repository.readPerson>>>();
        for (const accountId of [
          initiative.card.ownerId,
          initiative.card.executorId,
          initiative.card.executionControllerId,
          initiative.card.effectControllerId,
        ]) {
          if (accountId !== "" && !people.has(accountId)) {
            people.set(accountId, await repository.readPerson(accountId, true));
          }
        }
        const gaps = listCollegiumAdmissionGaps(initiative.card, people);
        if (gaps.length > 0) {
          throw new CollegiumInitiativeError(`Не заполнены обязательные данные: ${gaps.join("; ")}.`);
        }
        await verifyPeople([request.speakerId, ...request.participantIds].filter(Boolean));
        const item: CollegiumMeetingItem = {
          id: randomUUID(),
          order: meeting.items.filter((entry) => entry.removedAt === undefined).length + 1,
          initiativeId: initiative.id,
          initiativeNumber: initiative.number,
          snapshot: { revision: initiative.revision, card: initiative.card },
          speakerId: request.speakerId,
          participantIds: request.participantIds,
          durationMinutes: request.durationMinutes,
        };
        const updated = await saveMeeting(meeting, {
          items: [...meeting.items, item],
          ...nextAgendaVersion(meeting),
        });
        await recordCollegiumInitiativeEvent({
          repository,
          profile,
          initiative,
          toStatus: "on_agenda",
          workflow: {
            ...initiative.workflow,
            agenda: { meetingId: meeting.id, meetingNumber: meeting.number, itemId: item.id },
          },
          action: "add_to_agenda",
          reason: `${collegiumAgendaEventLabels.add_to_agenda}: ${meeting.number}`,
          comment: "",
          at: now(),
        });
        await recordAudit(
          profile,
          "collegium_meeting.agenda",
          updated,
          `В повестку ${meeting.number} включена инициатива ${initiative.number}`,
        );
        return updated;
      });
    },

    async removeItem(profile: ServerUserProfile, id: string, itemId: string, body: unknown) {
      const { revision, comment } = readCollegiumRevisionRequest(body, true);
      return transaction.run(async () => {
        const meeting = await requirePlannedMeeting(profile, id, revision);
        const item = findItem(meeting, itemId);
        const at = now();
        let order = 0;
        const items = meeting.items.map((entry) => {
          if (entry.id === item.id) {
            return { ...entry, removedAt: at.toISOString(), removedByDisplayName: profile.displayName };
          }
          return entry.removedAt === undefined ? { ...entry, order: ++order } : entry;
        });
        const updated = await saveMeeting(meeting, { items, ...nextAgendaVersion(meeting) });
        await releaseInitiative(profile, item, "remove_from_agenda", comment, at);
        await recordAudit(
          profile,
          "collegium_meeting.agenda",
          updated,
          `С повестки ${meeting.number} снята инициатива ${item.initiativeNumber}`,
        );
        return updated;
      });
    },

    async startDiscussion(profile: ServerUserProfile, id: string, itemId: string, body: unknown) {
      const revision = readCollegiumMeetingRevision(body);
      return transaction.run(async () => {
        const meeting = await requirePlannedMeeting(profile, id, revision);
        const item = findItem(meeting, itemId);
        const initiative = await lockAgendaInitiative(item);
        if (initiative.status !== "on_agenda") {
          throw new CollegiumInitiativeError("Обсуждение по этому вопросу уже начато.", 409);
        }
        const at = now();
        const updated = await saveMeeting(meeting, {
          items: meeting.items.map((entry) =>
            entry.id === item.id ? { ...entry, discussionStartedAt: at.toISOString() } : entry),
        });
        await recordCollegiumInitiativeEvent({
          repository,
          profile,
          initiative,
          toStatus: "in_discussion",
          workflow: initiative.workflow,
          action: "start_discussion",
          reason: `${collegiumAgendaEventLabels.start_discussion}: ${meeting.number}`,
          comment: "",
          at,
        });
        await recordAudit(
          profile,
          "collegium_meeting.agenda",
          updated,
          `Начато обсуждение инициативы ${item.initiativeNumber}`,
        );
        return updated;
      });
    },

    async setDecision(profile: ServerUserProfile, id: string, itemId: string, body: unknown) {
      const record = typeof body === "object" && body !== null && !Array.isArray(body)
        ? body as Record<string, unknown>
        : {};
      const { revision, ...decisionInput } = record;
      const expected = readCollegiumMeetingRevision({ revision });
      const decision = readCollegiumItemDecision(decisionInput, today());
      return transaction.run(async () => {
        const meeting = await requirePlannedMeeting(profile, id, expected);
        const item = findItem(meeting, itemId);
        if (item.discussionStartedAt === undefined) {
          throw new CollegiumInitiativeError("Сначала начните обсуждение вопроса.", 409);
        }
        await verifyPeople([...decision.responsibleIds, decision.rework?.responsibleId ?? ""].filter(Boolean));
        const updated = await saveMeeting(meeting, {
          items: meeting.items.map((entry) => entry.id === item.id ? { ...entry, decision } : entry),
          ...nextAgendaVersion(meeting),
        });
        await recordAudit(
          profile,
          "collegium_meeting.decision",
          updated,
          `Проект решения по инициативе ${item.initiativeNumber}`,
          [{ label: "Решение", value: collegiumDecisionLabels[decision.decision] }],
        );
        return updated;
      });
    },

    async generateProtocol(profile: ServerUserProfile, id: string, body: unknown) {
      const revision = readCollegiumMeetingRevision(body);
      return transaction.run(async () => {
        const meeting = await requirePlannedMeeting(profile, id, revision);
        const { name } = await namesOf();
        const text = buildCollegiumProtocolDraft(meeting, name);
        if (text.length > maxCollegiumProtocolLength) {
          throw new CollegiumInitiativeError("Проект протокола слишком длинный: сократите повестку или решения.", 409);
        }
        const updated = await saveMeeting(meeting, {
          protocol: { text, agendaVersion: meeting.agendaVersion ?? 0 },
        });
        await recordAudit(profile, "collegium_meeting.protocol_update", updated, `Сформирован проект протокола ${meeting.number}`);
        return updated;
      });
    },

    async updateProtocol(profile: ServerUserProfile, id: string, body: unknown) {
      const { revision, text } = readCollegiumProtocolText(body);
      return transaction.run(async () => {
        const meeting = await requirePlannedMeeting(profile, id, revision);
        const updated = await saveMeeting(meeting, {
          protocol: { ...meeting.protocol, text },
        });
        await recordAudit(profile, "collegium_meeting.protocol_update", updated, `Изменён проект протокола ${meeting.number}`);
        return updated;
      });
    },

    /**
     * Утверждение: блокирует заседание, затем инициативы по id, применяет все
     * решения с событиями истории и только потом фиксирует номер протокола.
     */
    async approveProtocol(profile: ServerUserProfile, id: string, body: unknown) {
      const revision = readCollegiumMeetingRevision(body);
      if (!collegiumInitiativePermissions(profile).canApprove) {
        throw new CollegiumInitiativeError("Протокол утверждает председатель Коллегии.", 403);
      }
      return transaction.run(async () => {
        const meeting = await requirePlannedMeeting(profile, id, revision);
        const items = meeting.items.filter((item) => item.removedAt === undefined);
        if (items.length === 0) {
          throw new CollegiumInitiativeError("В повестке нет вопросов.", 409);
        }
        const undecided = items.filter((item) => item.decision === undefined);
        if (undecided.length > 0) {
          throw new CollegiumInitiativeError(
            `Нет решения по вопросам: ${undecided.map((item) => item.initiativeNumber).join(", ")}.`,
            409,
          );
        }
        if (meeting.protocol.text.trim() === "") {
          throw new CollegiumInitiativeError("Сформируйте проект протокола.", 409);
        }
        // A draft built before the agenda or a decision changed would contradict
        // the decisions applied below.
        if (meeting.protocol.agendaVersion !== (meeting.agendaVersion ?? 0)) {
          throw new CollegiumInitiativeError(
            "После формирования проекта изменились повестка или решения. Сформируйте проект протокола заново.",
            409,
          );
        }
        const at = now();
        const ordered = [...items].sort((left, right) => left.initiativeId.localeCompare(right.initiativeId));
        const initiatives = new Map<string, CollegiumInitiative>();
        for (const item of ordered) {
          const initiative = await lockAgendaInitiative(item);
          if (initiative.status !== "in_discussion") {
            throw new CollegiumInitiativeError(
              `Инициатива ${item.initiativeNumber} сейчас «${collegiumInitiativeStatusLabels[initiative.status]}», а не «На обсуждении».`,
              409,
            );
          }
          initiatives.set(item.id, initiative);
        }
        for (const item of items) {
          const decision = item.decision!;
          const initiative = initiatives.get(item.id)!;
          const toStatus = collegiumMeetingDecisionStatuses[decision.decision];
          const { agenda: _agenda, ...workflow } = initiative.workflow;
          await recordCollegiumInitiativeEvent({
            repository,
            profile,
            initiative,
            toStatus,
            workflow: {
              ...workflow,
              ...(toStatus === "suspended" ? { suspendedFrom: "ready" as const } : {}),
              ...(decision.rework === undefined
                ? {}
                : {
                    rework: {
                      ...decision.rework,
                      requestedByDisplayName: profile.displayName,
                      requestedAt: at.toISOString(),
                    },
                  }),
              lastDecision: {
                meetingId: meeting.id,
                meetingNumber: meeting.number,
                meetingDate: meeting.meetingDate,
                protocolNumber: meeting.number,
                itemOrder: item.order,
                decision: decision.decision,
              },
            },
            action: "meeting_decision",
            reason: `${collegiumDecisionLabels[decision.decision]} (протокол ${meeting.number}, вопрос ${item.order})`,
            comment: decision.comment,
            at,
          });
          for (const remark of decision.rework?.remarks ?? []) {
            await repository.insertComment(initiative.id, {
              id: randomUUID(),
              kind: "remark",
              text: remark,
              authorUserId: profile.userId,
              authorDisplayName: profile.displayName,
              createdAt: at.toISOString(),
            });
          }
        }
        const updated = await saveMeeting(meeting, {
          status: "approved",
          protocol: {
            text: meeting.protocol.text,
            number: meeting.number,
            approvedAt: at.toISOString(),
            approvedByDisplayName: profile.displayName,
          },
        });
        await recordAudit(
          profile,
          "collegium_meeting.protocol_approve",
          updated,
          `Утверждён протокол ${meeting.number}`,
          [{ label: "Вопросов", value: String(items.length) }],
        );
        return updated;
      });
    },

    async cancel(profile: ServerUserProfile, id: string, body: unknown) {
      const { revision, comment } = readCollegiumRevisionRequest(body, true);
      if (comment === "") throw new CollegiumInitiativeError("Укажите причину отмены заседания.");
      return transaction.run(async () => {
        const meeting = await requirePlannedMeeting(profile, id, revision);
        const at = now();
        const items = meeting.items
          .filter((item) => item.removedAt === undefined)
          .sort((left, right) => left.initiativeId.localeCompare(right.initiativeId));
        const updated = await saveMeeting(meeting, { status: "cancelled", cancelComment: comment });
        for (const item of items) {
          await releaseInitiative(profile, item, "meeting_cancelled", comment, at);
        }
        await recordAudit(profile, "collegium_meeting.cancel", updated, `Отменено заседание ${meeting.number}`, [
          { label: "Причина", value: comment },
        ]);
        return updated;
      });
    },

    async prepareFileUpload(
      profile: ServerUserProfile,
      id: string,
      rawFileName: string | null,
      declaredBytes: number,
    ) {
      const fileName = readCollegiumAttachmentFileName(rawFileName);
      requireManage(profile);
      const meeting = await requireMeeting(profile, id);
      if (meeting.status !== "planned") {
        throw new CollegiumInitiativeError("Материалы меняются только до утверждения протокола.", 409);
      }
      if (Number.isFinite(declaredBytes) && declaredBytes > collegiumAttachmentLimits.maxFileBytes) {
        throw new CollegiumInitiativeError("Размер одного файла не должен превышать 7 МБ.", 413);
      }
      await assertCollegiumAttachmentRoom(
        repository,
        { type: "meeting", id },
        Number.isFinite(declaredBytes) ? declaredBytes : 0,
      );
      return fileName;
    },

    async addFile(profile: ServerUserProfile, id: string, fileName: string, content: Buffer) {
      const fileType = detectCollegiumAttachmentType(fileName, content);
      return transaction.run(async () => {
        requireManage(profile);
        const meeting = await requireMeeting(profile, id, true);
        if (meeting.status !== "planned") {
          throw new CollegiumInitiativeError("Материалы меняются только до утверждения протокола.", 409);
        }
        await assertCollegiumAttachmentRoom(repository, { type: "meeting", id }, content.length);
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
          { type: "meeting", id },
          { ...attachment, createdByUserId: profile.userId },
          content,
        );
        await recordAudit(profile, "collegium_meeting.attachment_add", meeting, `Приложен файл к заседанию ${meeting.number}`, [
          { label: "Файл", value: fileName },
        ]);
        return attachment;
      });
    },

    async addLink(profile: ServerUserProfile, id: string, body: unknown) {
      const link = readCollegiumAttachmentLink(body);
      return transaction.run(async () => {
        requireManage(profile);
        const meeting = await requireMeeting(profile, id, true);
        if (meeting.status !== "planned") {
          throw new CollegiumInitiativeError("Материалы меняются только до утверждения протокола.", 409);
        }
        await assertCollegiumAttachmentRoom(repository, { type: "meeting", id }, 0);
        const attachment: CollegiumAttachment = {
          id: randomUUID(),
          kind: "link",
          label: link.label,
          url: link.url,
          createdByDisplayName: profile.displayName,
          createdAt: now().toISOString(),
        };
        await repository.insertAttachment(
          { type: "meeting", id },
          { ...attachment, createdByUserId: profile.userId },
        );
        await recordAudit(profile, "collegium_meeting.attachment_add", meeting, `Приложена ссылка к заседанию ${meeting.number}`, [
          { label: "Ссылка", value: link.label },
        ]);
        return attachment;
      });
    },

    async readFile(profile: ServerUserProfile, id: string, attachmentId: string) {
      await requireMeeting(profile, id);
      const attachment = await repository.readAttachment({ type: "meeting", id }, attachmentId);
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
        requireManage(profile);
        const meeting = await requireMeeting(profile, id, true);
        if (meeting.status !== "planned") {
          throw new CollegiumInitiativeError("Материалы меняются только до утверждения протокола.", 409);
        }
        const attachment = await repository.readAttachment({ type: "meeting", id }, attachmentId, true);
        if (attachment === undefined) throw new CollegiumInitiativeError("Материал не найден.", 404);
        await repository.deleteAttachment({ type: "meeting", id }, attachmentId, now(), profile.displayName);
        await recordAudit(profile, "collegium_meeting.attachment_delete", meeting, `Удалён материал заседания ${meeting.number}`, [
          { label: "Материал", value: attachment.label },
        ]);
      });
    },
  };
}

export type CollegiumMeetingsService = ReturnType<typeof createCollegiumMeetingsService>;
