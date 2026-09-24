import { AsyncLocalStorage } from "node:async_hooks";
import type { AuditActorSnapshot, AuditEventDraft } from "./audit.js";

// One isolated context per HTTP request; background jobs have no impersonation.
const context = new AsyncLocalStorage<{ actor?: AuditActorSnapshot; target?: AuditActorSnapshot }>();

export function runWithAccountPreviewContext<T>(operation: () => T): T {
  return context.run({}, operation);
}

export function setAccountPreviewActor(actor: AuditActorSnapshot, target: AuditActorSnapshot) {
  const current = context.getStore();
  if (!current) throw new Error("Account preview requires a request context.");
  current.actor = actor;
  current.target = target;
}

export function annotateAccountPreviewAudit(event: AuditEventDraft): AuditEventDraft {
  const current = context.getStore();
  if (!current?.actor || !current.target) return event;
  return {
    ...event,
    actor: current.actor,
    summary: `От имени ${current.target.displayName}: ${event.summary}`,
    details: [
      { label: "Режим", value: "Действие администратора от имени аккаунта" },
      { label: "Аккаунт", value: current.target.accountId },
      { label: "Пользователь", value: current.target.userId },
      { label: "Имя пользователя", value: current.target.displayName },
      ...(event.details ?? []),
    ],
  };
}
