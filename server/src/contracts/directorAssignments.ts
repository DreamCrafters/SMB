import type { BoardAssignmentRecurrence, BoardAssignmentStatus } from "./assignmentStates.js";

/**
 * The «Поручения» tab collects everything the account executes. Each source grants the
 * registry's view and execute rights; sending and control come from the registry's own tab.
 */
export const assignmentInboxNavigationItem = "business.assignments";
export const assignmentInboxSources = ["director", "collegium", "board"] as const;
export type AssignmentInboxSource = (typeof assignmentInboxSources)[number];
/** Selected sources of the tab, or `none` without the tab. */
export type AssignmentInboxAccess = "none" | AssignmentInboxSource[];
export const assignmentInboxSourceOptions: ReadonlyArray<{ id: AssignmentInboxSource; label: string }> = [
  { id: "director", label: "Поручения генерального директора" },
  { id: "collegium", label: "Поручения Коллегии" },
  { id: "board", label: "Поручения Совета директоров — исполнение всех активных" },
];
export const assignmentInboxSourceCapabilities = {
  director: ["business.view_director_assignments", "business.execute_director_assignments"],
  collegium: ["business.view_collegium_assignments", "business.execute_collegium_assignments"],
  board: ["business.view_board_assignments", "business.execute_board_assignments"],
} as const satisfies Record<AssignmentInboxSource, readonly string[]>;

export function isAssignmentInboxAccess(value: unknown): value is AssignmentInboxAccess {
  return value === "none" || (Array.isArray(value) && value.length > 0 && value.length <= assignmentInboxSources.length
    && value.every(source => assignmentInboxSources.includes(source)) && new Set(value).size === value.length);
}

/**
 * Registry tabs of a position carry the creation and control rights but are not menu
 * sections: their work opens inside «Поручения», which any of them brings into the menu.
 */
export const assignmentRegistryNavigationItems = ["business.director_assignments", "business.collegium_assignments", "business.board_assignments"] as const;

export function isAssignmentRegistryNavigationItem(item: string) {
  return (assignmentRegistryNavigationItems as readonly string[]).includes(item);
}

export function hasAssignmentsSection(navigation: readonly string[]) {
  return navigation.includes(assignmentInboxNavigationItem) || navigation.some(isAssignmentRegistryNavigationItem);
}

/** Menu sections of a profile: registry tabs give way to «Поручения». */
export function readSectionNavigationItems<Item extends string>(navigation: readonly Item[]): Item[] {
  const sections = navigation.filter(item => !isAssignmentRegistryNavigationItem(item));
  return hasAssignmentsSection(navigation) && !sections.includes(assignmentInboxNavigationItem as Item)
    ? [...sections, assignmentInboxNavigationItem as Item]
    : sections;
}

/** Sources are read back from the execute capabilities; the view right alone is not a source. */
export function readAssignmentInboxAccess(capabilities: readonly string[], navigation: readonly string[]): AssignmentInboxAccess {
  if (!navigation.includes(assignmentInboxNavigationItem)) return "none";
  const sources = assignmentInboxSources.filter(source => capabilities.includes(assignmentInboxSourceCapabilities[source][1]));
  return sources.length ? sources : "none";
}

/**
 * Employee assignment registries share one workflow and differ only in these details.
 * Each registry keeps its own tables, capabilities, tab and notification type.
 */
export const assignmentRegistries = {
  director: {
    id: "director",
    navigationItem: "business.director_assignments",
    viewCapability: "business.view_director_assignments",
    manageCapability: "business.manage_director_assignments",
    executeCapability: "business.execute_director_assignments",
    notificationType: "general_director_assignments",
    apiPath: "/api/director-assignments",
    tableId: "director.assignments",
    title: "Поручения генерального директора",
    ownerGenitive: "генерального директора",
    managerTitle: "Генеральный директор",
    numberPrefix: "ГД",
    hasProtocol: false,
    canLinkBoardAssignment: true,
    canLinkInitiative: false,
  },
  collegium: {
    id: "collegium",
    navigationItem: "business.collegium_assignments",
    viewCapability: "business.view_collegium_assignments",
    manageCapability: "business.manage_collegium_assignments",
    executeCapability: "business.execute_collegium_assignments",
    notificationType: "collegium_assignments",
    apiPath: "/api/collegium-assignments",
    tableId: "collegium.assignments",
    title: "Поручения Коллегии",
    ownerGenitive: "Коллегии",
    managerTitle: "Председатель Коллегии",
    numberPrefix: "К",
    hasProtocol: true,
    canLinkBoardAssignment: false,
    // Задача 135: поручения из инициатив Коллегии ставятся только сюда.
    canLinkInitiative: true,
  },
} as const;
export type AssignmentRegistryId = keyof typeof assignmentRegistries;
export type AssignmentRegistry = (typeof assignmentRegistries)[AssignmentRegistryId];
export const assignmentRegistryIds = Object.keys(assignmentRegistries) as AssignmentRegistryId[];

/** Fails loudly instead of silently falling back to another registry's data. */
export function readAssignmentRegistry(registryId: unknown): AssignmentRegistry {
  if (!assignmentRegistryIds.includes(registryId as AssignmentRegistryId)) throw new Error("Unknown assignment registry.");
  return assignmentRegistries[registryId as AssignmentRegistryId];
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
  /** Account can receive and execute assignments of the current registry through its positions. */
  canReceive?: boolean;
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
  /** Initiative of the collegium module; immutable after creation, absent in director assignments. */
  sourceInitiativeId?: string | null;
  /** Collegium protocol reference; absent in director assignments. */
  meetingDate?: string;
  protocolNumber?: string;
  decisionNumber?: string;
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

export type DirectorAssignmentAccountLink = "linked" | "unlinked" | "unavailable";

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

export type DirectorAssignmentPdfRequest = {
  mode: "register" | "assignment";
  source: "current" | "history";
  entries: Array<{ id: string; revision: number }>;
};
