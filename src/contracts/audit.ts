export {
  auditEventActions,
  auditEventCategories,
  auditTargetTypes,
} from "../../server/src/contracts/audit.js";
export type {
  AuditEventAction,
  AuditEventCategory,
  AuditTargetType,
} from "../../server/src/contracts/audit.js";

import type {
  AuditEventAction,
  AuditEventCategory,
  AuditTargetType,
} from "../../server/src/contracts/audit.js";

export type AuditEventDetail = {
  label: string;
  value: string;
};

export type AuditActor = {
  userId: string;
  accountId: string;
  displayName: string;
  positionDisplayName: string;
  login?: string;
};

export type UserActivityEvent = {
  id: string;
  actor: AuditActor;
  category: AuditEventCategory;
  action: AuditEventAction;
  outcome: "success" | "failure";
  summary: string;
  details: AuditEventDetail[];
  targetType?: AuditTargetType;
  targetId?: string;
  occurredAt: string;
};

export type UserActivityActor = AuditActor & {
  login: string;
  status: "active" | "suspended" | "archived";
  lastEventAt?: string;
};

export type UserActivityReportResponse = {
  events: UserActivityEvent[];
  actors: UserActivityActor[];
  summary: {
    total: number;
    byCategory: Array<{
      category: AuditEventCategory;
      count: number;
    }>;
  };
  window: {
    from: string;
    to: string;
  };
  limit: number;
  offset: number;
};
