import { snapshotCollegiumEffectControl } from "./collegiumEffectControl.js";
import { randomUUID } from "node:crypto";
import type {
  CollegiumInitiative,
  CollegiumInitiativeEvent,
  CollegiumInitiativeStatus,
  CollegiumInitiativeWorkflow,
} from "../contracts/collegiumInitiatives.js";
import type { CollegiumInitiativesRepository } from "../repositories/collegiumInitiativesRepository.js";
import type { ServerUserProfile } from "./auth.js";

/**
 * Смена статуса инициативы: новая ревизия по оптимистичной блокировке и
 * событие в append-only истории. Вызывается внутри транзакции после
 * блокировки строки; аудит пишет вызывающий сервис.
 */
export async function recordCollegiumInitiativeEvent({
  repository,
  profile,
  initiative,
  toStatus,
  workflow,
  action,
  reason,
  comment,
  at,
}: {
  repository: CollegiumInitiativesRepository;
  profile: ServerUserProfile;
  initiative: CollegiumInitiative;
  toStatus: CollegiumInitiativeStatus;
  workflow: CollegiumInitiativeWorkflow;
  action: CollegiumInitiativeEvent["action"];
  reason: string;
  comment: string;
  at: Date;
}) {
  const effectSnapshot = snapshotCollegiumEffectControl(workflow);
  const updated: CollegiumInitiative = {
    ...initiative,
    status: toStatus,
    workflow,
    revision: initiative.revision + 1,
    updatedAt: at.toISOString(),
  };
  await repository.update(updated, initiative.revision);
  await repository.insertRevision(initiative.id, {
    id: randomUUID(),
    revision: updated.revision,
    createdAt: at,
    authorDisplayName: profile.displayName,
    status: toStatus,
    changedFields: [],
    reason,
    comment,
    card: initiative.card,
    event: { action, fromStatus: initiative.status, toStatus },
    ...(effectSnapshot === undefined ? {} : { effectSnapshot }),
  });
  return updated;
}
