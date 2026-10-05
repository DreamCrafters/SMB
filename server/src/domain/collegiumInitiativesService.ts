import { randomUUID } from "node:crypto";
import {
  collegiumInitiativeFieldLabels,
  collegiumInitiativeRoleFields,
  type CollegiumInitiative,
  type CollegiumInitiativeCard,
  type CollegiumInitiativeDetailResponse,
  type CollegiumInitiativeListResponse,
} from "../contracts/collegiumInitiatives.js";
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
  listChangedCollegiumFields,
  readCollegiumInitiativeCardInput,
  readCollegiumOptionalText,
} from "./collegiumInitiative.js";

const maxReasonLength = 500;
const maxCommentLength = 2000;

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
    action: "collegium_initiative.create" | "collegium_initiative.update",
    initiative: CollegiumInitiative,
    changedFields: readonly string[],
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
      summary: action === "collegium_initiative.create"
        ? `Создана инициатива ${initiative.number}`
        : `Изменена инициатива ${initiative.number}`,
      details: [
        { label: "Инициатива", value: initiative.card.title },
        ...(changedFields.length === 0
          ? []
          : [{ label: "Изменённые поля", value: changedFields.join(", ") }]),
      ],
      targetType: "collegium_initiative",
      targetId: initiative.id,
    });
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
      return {
        initiative,
        revisions: await repository.listRevisions(id),
        canEdit: canEditCollegiumInitiative(initiative, profile, permissions),
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
        await recordAudit(profile, "collegium_initiative.create", initiative, []);
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
          changedFields.map((field) => collegiumInitiativeFieldLabels[field]),
        );
        return updated;
      });
    },
  };
}

export type CollegiumInitiativesService = ReturnType<
  typeof createCollegiumInitiativesService
>;

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
