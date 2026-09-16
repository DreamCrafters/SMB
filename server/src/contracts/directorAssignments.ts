import type { BoardAssignmentRecurrence, BoardAssignmentStatus } from "./assignmentStates.js";

export const directorAssignmentAccessLevels = ["none", "send", "receive"] as const;
export type DirectorAssignmentAccess = (typeof directorAssignmentAccessLevels)[number];
export const directorAssignmentAccessOptions = [
  { id: "send", label: "Отправка и контроль исполнения" },
  { id: "receive", label: "Получение и выполнение" },
] as const;
export function readDirectorAssignmentAccess(capabilities: readonly string[], navigation: readonly string[]): DirectorAssignmentAccess {
  if (!navigation.includes("business.director_assignments")) return "none";
  return capabilities.includes("business.manage_director_assignments") ? "send" : "receive";
}

export type PersonnelEmployee = {
  id: string;
  revision: number;
  fullName: string;
  position: string;
  department: string;
  category: "АУП" | "ИТР" | "";
  userId: string | null;
  active: boolean;
};

export type DirectorAssignmentInput = {
  assignedOn: string;
  kind: "Поручение" | "Задача" | "Распоряжение" | "Приказ";
  summary: string;
  department: string;
  project: string;
  responsibleId: string;
  coExecutorIds: string[];
  recurrence: BoardAssignmentRecurrence;
  activeFrom: string;
  activeTo: string;
  urgency: string;
  importance: string;
  note: string;
  progress: string;
  incomingNumber: string;
  sourceBoardAssignmentId: string | null;
};

export type DirectorAssignmentComment = {
  id: string;
  author: string;
  userId: string;
  text: string;
  createdAt: string;
  status: BoardAssignmentStatus;
};

export type DirectorAssignmentDocument = {
  id: string;
  fileName: string;
  sizeBytes: number;
};

export type DirectorAssignment = DirectorAssignmentInput & {
  id: string;
  number: string;
  revision: number;
  status: BoardAssignmentStatus;
  currentOccurrenceDate: string;
  completedOn: string;
  responsible: PersonnelEmployee | null;
  coExecutors: PersonnelEmployee[];
  comments: DirectorAssignmentComment[];
  documents: DirectorAssignmentDocument[];
  createdAt: string;
  updatedAt: string;
  needsClarification: boolean;
  postponedUntil: string;
  durationWorkdays?: number;
  remainingWorkdays?: number;
  source: null | {
    key: string;
    originalStatus: string;
    originalDueDate: string;
    postponedUntil: string;
    values: string[];
  };
};

export type DirectorAssignmentPermissions = {
  canView: boolean;
  canManage: boolean;
  canExecute: boolean;
  canManagePersonnel: boolean;
};

export type BoardAssignmentDelegation = Pick<DirectorAssignment,
  "id" | "number" | "summary" | "responsible" | "coExecutors" | "currentOccurrenceDate" | "status" | "createdAt" | "updatedAt"
> & { comments: Array<DirectorAssignmentComment & { responsibleDisplayName: string }> };

export type BoardAssignmentDelegationsResponse = {
  assignments: BoardAssignmentDelegation[];
  canAssign: boolean;
  employees: PersonnelEmployee[];
  today: string;
};
