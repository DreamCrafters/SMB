import { randomUUID } from "node:crypto";
import {
  collegiumAttachmentFileTypes,
  collegiumAttachmentLimits,
  collegiumCommentKinds,
  collegiumInitiativeActionLabels,
  collegiumInitiativeFieldLabels,
  collegiumInitiativeRoleFields,
  collegiumInitiativeStatusLabels,
  type CollegiumAttachment,
  type CollegiumCommentKind,
  type CollegiumInitiative,
  type CollegiumInitiativeCard,
  type CollegiumInitiativeComment,
  type CollegiumInitiativeDetailResponse,
  type CollegiumInitiativeListResponse,
  type CollegiumInitiativePermissions,
  type CollegiumPerson,
} from "../contracts/collegiumInitiatives.js";
import {
  listAvailableCollegiumActions,
  listCollegiumAdmissionGaps,
  planCollegiumAction,
  readCollegiumActionRequest,
} from "./collegiumInitiativeWorkflow.js";
import {
  assertCollegiumAttachmentRoom,
  detectCollegiumAttachmentType,
  readCollegiumAttachmentFileName,
  readCollegiumAttachmentLink,
} from "./collegiumAttachment.js";
import { recordCollegiumInitiativeEvent } from "./collegiumInitiativeEvents.js";
import type { DatabaseTransactionRunner } from "../db/transactionContext.js";
import type { AuditRepository } from "../repositories/auditRepository.js";
import type { CollegiumInitiativesRepository } from "../repositories/collegiumInitiativesRepository.js";
import type { ServerUserProfile } from "./auth.js";
import {
  canEditCollegiumInitiative,
  canViewCollegiumInitiative,
  collegiumAccountId,
  collegiumInitiativePermissions,
  CollegiumInitiativeError,
  isOwnCollegiumInitiative,
  listChangedCollegiumFields,
  readCollegiumInitiativeCardInput,
  readCollegiumOptionalText,
} from "./collegiumInitiative.js";

const maxReasonLength = 500;
const maxCommentLength = 2000;
const maxDiscussionCommentLength = 4000;

export function createCollegiumInitiativesService({
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
    new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Moscow", year: "numeric" })
      .format(now()),
  );

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
    const permissions = requireView(profile);
    const initiative = await repository.read(id, lock);
    if (
      initiative === undefined ||
      !canViewCollegiumInitiative(initiative, profile, permissions)
    ) {
      throw new CollegiumInitiativeError("Инициатива недоступна.", 404);
    }
    return { initiative, permissions };
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

  function canResolveComments(
    initiative: CollegiumInitiative,
    profile: ServerUserProfile,
    permissions: CollegiumInitiativePermissions,
  ) {
    return permissions.canManage ||
      (permissions.canParticipate && isOwnCollegiumInitiative(initiative, profile.userId));
  }

  return {
    async list(profile: ServerUserProfile): Promise<CollegiumInitiativeListResponse> {
      const permissions = requireView(profile);
      const [initiatives, people, reference] = await Promise.all([
        repository.list(),
        repository.listPeople(),
        repository.listReference(),
      ]);
      return {
        initiatives: initiatives.filter((initiative) =>
          canViewCollegiumInitiative(initiative, profile, permissions)),
        people,
        reference,
        permissions,
      };
    },

    async read(
      profile: ServerUserProfile,
      id: string,
    ): Promise<CollegiumInitiativeDetailResponse> {
      const { initiative, permissions } = await requireInitiative(profile, id);
      const [revisions, comments, attachments, people] = await Promise.all([
        repository.listRevisions(id),
        repository.listComments(id),
        repository.listAttachments({ type: "initiative", id }),
        readRolePeople(initiative.card),
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
      };
    },

    async create(profile: ServerUserProfile, body: unknown) {
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

    async update(profile: ServerUserProfile, id: string, body: unknown) {
      const request = readSaveRequest(body);
      if (request.revision === undefined) {
        throw new CollegiumInitiativeError("Передайте ревизию изменяемой карточки.");
      }
      const reference = await repository.listReference();
      const nextCard = readCollegiumInitiativeCardInput(request.card, reference);

      return transaction.run(async () => {
        const { initiative, permissions } = await requireInitiative(profile, id, true);
        if (!canEditCollegiumInitiative(initiative, profile, permissions)) {
          throw new CollegiumInitiativeError("Эту инициативу сейчас нельзя изменить.", 403);
        }
        if (initiative.revision !== request.revision) {
          throw new CollegiumInitiativeError("Инициатива уже изменена. Обновите карточку.", 409);
        }
        if (!permissions.canManage) {
          nextCard.initiatorId = initiative.card.initiatorId;
        } else if (nextCard.initiatorId === "") {
          nextCard.initiatorId = initiative.card.initiatorId;
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

    async act(profile: ServerUserProfile, id: string, body: unknown) {
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
        const changedAt = now();
        const workflow = { ...initiative.workflow };
        if (request.action === "suspend") workflow.suspendedFrom = initiative.status;
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
    async prepareFileUpload(
      profile: ServerUserProfile,
      id: string,
      rawFileName: string | null,
      declaredBytes: number,
    ) {
      const fileName = readCollegiumAttachmentFileName(rawFileName);
      await requireAttachRights(profile, id, false);
      if (Number.isFinite(declaredBytes) && declaredBytes > collegiumAttachmentLimits.maxFileBytes) {
        throw new CollegiumInitiativeError("Размер одного файла не должен превышать 10 МБ.", 413);
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

function readSaveRequest(body: unknown) {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new CollegiumInitiativeError("Передайте карточку инициативы.");
  }
  const record = body as Record<string, unknown>;
  const unknownField = Object.keys(record).find(
    (key) => !["card", "revision", "reason", "comment"].includes(key),
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
    revision: revision as number | undefined,
    reason: readCollegiumOptionalText(record.reason, maxReasonLength, "Причина изменения"),
    comment: readCollegiumOptionalText(record.comment, maxCommentLength, "Комментарий"),
  };
}
