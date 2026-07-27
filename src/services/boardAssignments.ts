import {
  boardAssignmentRecurrences,
  boardAssignmentStatuses,
  type BoardAssignment,
  type BoardAssignmentActionInput,
  type BoardAssignmentCompletion,
  type BoardAssignmentCompletionSummary,
  type BoardAssignmentCreateInput,
  type BoardAssignmentFilters,
  type BoardAssignmentPermissions,
  type BoardAssignmentStatus,
  type BoardAssignmentSummary,
  type BoardAssignmentUpdateInput,
} from "../contracts/boardAssignments.js";
import { buildDevAccessHeaders } from "./devAccessSessionStorage.js";
import {
  resolveApiEndpoint,
  type RemoteServerErrorCode,
} from "./remoteServer.js";
import { readShortUserMessage } from "./userFacingMessages.js";

const assignmentsPath = "/api/board-assignments";
const completionsPath = "/api/board-assignment-completions";
const materialsPath = "/api/board-assignment-materials";

type RequestOptions = {
  baseUrl?: string;
  signal?: AbortSignal;
};

type ErrorResult = {
  status: "error";
  message: string;
  code?: RemoteServerErrorCode;
};

export type BoardAssignmentsResult =
  | {
      status: "ready";
      assignments: BoardAssignmentSummary[];
      permissions: BoardAssignmentPermissions;
    }
  | ErrorResult;

export type BoardAssignmentResult =
  | {
      status: "ready";
      assignment: BoardAssignment;
      permissions: BoardAssignmentPermissions;
    }
  | ErrorResult;

export type BoardAssignmentCompletionsResult =
  | {
      status: "ready";
      completions: BoardAssignmentCompletionSummary[];
      permissions: BoardAssignmentPermissions;
    }
  | ErrorResult;

export type BoardAssignmentCompletionResult =
  | {
      status: "ready";
      completion: BoardAssignmentCompletion;
      permissions: BoardAssignmentPermissions;
    }
  | ErrorResult;

export type BoardAssignmentMaterialResult =
  | {
      status: "ready";
      blob: Blob;
      fileName: string;
    }
  | ErrorResult;

export async function requestBoardAssignments(
  filters: BoardAssignmentFilters = {},
  options: RequestOptions = {},
): Promise<BoardAssignmentsResult> {
  const params = new URLSearchParams();
  if (filters.status !== undefined) params.set("status", filters.status);
  if (filters.meetingDateFrom !== undefined) {
    params.set("meetingDateFrom", filters.meetingDateFrom);
  }
  if (filters.meetingDateTo !== undefined) {
    params.set("meetingDateTo", filters.meetingDateTo);
  }
  if (filters.query !== undefined) params.set("query", filters.query);

  const suffix = params.size === 0 ? "" : `?${params.toString()}`;
  const result = await requestJson(
    `${assignmentsPath}${suffix}`,
    "GET",
    undefined,
    options,
  );
  if (result.status === "error") return result;

  if (
    !isRecord(result.payload) ||
    !Array.isArray(result.payload.assignments) ||
    !result.payload.assignments.every(isBoardAssignmentSummary) ||
    !isBoardAssignmentPermissions(result.payload.permissions)
  ) {
    return invalidResponse("Не удалось загрузить реестр поручений.");
  }

  return {
    status: "ready",
    assignments: result.payload.assignments,
    permissions: result.payload.permissions,
  };
}

export async function requestBoardAssignment(
  assignmentId: string,
  options: RequestOptions = {},
): Promise<BoardAssignmentResult> {
  return requestAssignmentJson(
    `${assignmentsPath}/${encodeURIComponent(assignmentId)}`,
    "GET",
    undefined,
    options,
  );
}

export async function createBoardAssignment(
  request: BoardAssignmentCreateInput,
  options: RequestOptions = {},
): Promise<BoardAssignmentResult> {
  return requestAssignmentJson(assignmentsPath, "POST", request, options);
}

export async function updateBoardAssignment(
  assignmentId: string,
  request: BoardAssignmentUpdateInput,
  options: RequestOptions = {},
): Promise<BoardAssignmentResult> {
  return requestAssignmentJson(
    `${assignmentsPath}/${encodeURIComponent(assignmentId)}`,
    "PATCH",
    request,
    options,
  );
}

export async function applyBoardAssignmentAction(
  assignmentId: string,
  request: BoardAssignmentActionInput,
  options: RequestOptions = {},
): Promise<BoardAssignmentResult> {
  return requestAssignmentJson(
    `${assignmentsPath}/${encodeURIComponent(assignmentId)}/action`,
    "POST",
    request,
    options,
  );
}

export async function requestBoardAssignmentMaterial(
  material: { key: string; fileName: string },
  { baseUrl, signal }: RequestOptions = {},
): Promise<BoardAssignmentMaterialResult> {
  const path = `${materialsPath}/${encodeURIComponent(material.key)}`;
  const endpoint = resolveApiEndpoint(path, path, { baseUrl });

  try {
    const response = await fetch(endpoint, {
      method: "GET",
      headers: buildDevAccessHeaders({ Accept: "application/pdf" }),
      credentials: "include",
      signal,
    });
    if (!response.ok) {
      return readRemoteError(
        await readJson(response),
        "Не удалось открыть дополнительный материал.",
      );
    }
    if (!(response.headers.get("content-type") ?? "").startsWith(
      "application/pdf",
    )) {
      return invalidResponse("Не удалось открыть дополнительный материал.");
    }

    return {
      status: "ready",
      blob: await response.blob(),
      fileName:
        readDownloadFilename(response.headers.get("content-disposition")) ??
        material.fileName,
    };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return { status: "error", message: "Загрузка материала отменена." };
    }

    return {
      status: "error",
      code: "network_error",
      message: "Не удалось открыть дополнительный материал.",
    };
  }
}

export async function requestBoardAssignmentCompletions(
  filters: Omit<BoardAssignmentFilters, "status"> = {},
  options: RequestOptions = {},
): Promise<BoardAssignmentCompletionsResult> {
  const params = new URLSearchParams();
  if (filters.meetingDateFrom !== undefined) {
    params.set("meetingDateFrom", filters.meetingDateFrom);
  }
  if (filters.meetingDateTo !== undefined) {
    params.set("meetingDateTo", filters.meetingDateTo);
  }
  if (filters.query !== undefined) params.set("query", filters.query);

  const suffix = params.size === 0 ? "" : `?${params.toString()}`;
  const result = await requestJson(
    `${completionsPath}${suffix}`,
    "GET",
    undefined,
    options,
  );
  if (result.status === "error") return result;
  if (
    !isRecord(result.payload) ||
    !Array.isArray(result.payload.completions) ||
    !result.payload.completions.every(isBoardAssignmentCompletionSummary) ||
    !isBoardAssignmentPermissions(result.payload.permissions)
  ) {
    return invalidResponse("Не удалось загрузить историю выполнений.");
  }

  return {
    status: "ready",
    completions: result.payload.completions,
    permissions: result.payload.permissions,
  };
}

export async function requestBoardAssignmentCompletion(
  completionId: string,
  options: RequestOptions = {},
): Promise<BoardAssignmentCompletionResult> {
  const result = await requestJson(
    `${completionsPath}/${encodeURIComponent(completionId)}`,
    "GET",
    undefined,
    options,
  );
  if (result.status === "error") return result;
  if (
    !isRecord(result.payload) ||
    !isBoardAssignmentCompletion(result.payload.completion) ||
    !isBoardAssignmentPermissions(result.payload.permissions)
  ) {
    return invalidResponse("Не удалось загрузить выполненное поручение.");
  }

  return {
    status: "ready",
    completion: result.payload.completion,
    permissions: result.payload.permissions,
  };
}

async function requestAssignmentJson(
  path: string,
  method: "GET" | "POST" | "PATCH",
  body:
    | BoardAssignmentCreateInput
    | BoardAssignmentUpdateInput
    | BoardAssignmentActionInput
    | undefined,
  options: RequestOptions,
): Promise<BoardAssignmentResult> {
  const result = await requestJson(path, method, body, options);
  if (result.status === "error") return result;

  if (
    !isRecord(result.payload) ||
    !isBoardAssignment(result.payload.assignment) ||
    !isBoardAssignmentPermissions(result.payload.permissions)
  ) {
    return invalidResponse("Не удалось загрузить поручение.");
  }

  return {
    status: "ready",
    assignment: result.payload.assignment,
    permissions: result.payload.permissions,
  };
}

async function requestJson(
  path: string,
  method: "GET" | "POST" | "PATCH",
  body:
    | BoardAssignmentCreateInput
    | BoardAssignmentUpdateInput
    | BoardAssignmentActionInput
    | undefined,
  { baseUrl, signal }: RequestOptions,
): Promise<{ status: "ready"; payload: unknown } | ErrorResult> {
  const endpoint = resolveApiEndpoint(path, path, { baseUrl });

  try {
    const response = await fetch(endpoint, {
      method,
      headers: buildDevAccessHeaders({
        Accept: "application/json",
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      }),
      credentials: "include",
      signal,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const payload = await readJson(response);
    if (!response.ok) {
      return readRemoteError(
        payload,
        "Не удалось обработать поручения Совета директоров.",
      );
    }

    return { status: "ready", payload };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return { status: "error", message: "Запрос поручений отменён." };
    }

    return {
      status: "error",
      code: "network_error",
      message: "Не удалось загрузить поручения Совета директоров.",
    };
  }
}

function isBoardAssignment(value: unknown): value is BoardAssignment {
  if (!isRecord(value) || !isBoardAssignmentSummary(value)) {
    return false;
  }

  const record = value as BoardAssignmentSummary & Record<string, unknown>;

  return (
    typeof record.details === "string" &&
    (
      record.sourceMaterial === undefined ||
      (
        isRecord(record.sourceMaterial) &&
        typeof record.sourceMaterial.key === "string" &&
        typeof record.sourceMaterial.fileName === "string"
      )
    ) &&
    Array.isArray(record.comments) &&
    record.comments.every((comment: unknown) =>
      isRecord(comment) &&
      typeof comment.id === "string" &&
      typeof comment.authorDisplayName === "string" &&
      typeof comment.comment === "string" &&
      isBoardAssignmentStatus(comment.statusAfter) &&
      typeof comment.createdAt === "string"
    )
  );
}

function isBoardAssignmentSummary(
  value: unknown,
): value is BoardAssignmentSummary {
  return isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.meetingDate === "string" &&
    typeof value.protocolNumber === "string" &&
    typeof value.decisionNumber === "string" &&
    typeof value.summary === "string" &&
    Array.isArray(value.coExecutors) &&
    value.coExecutors.every((item) => typeof item === "string") &&
    typeof value.dueDate === "string" &&
    boardAssignmentRecurrences.includes(
      value.recurrence as (typeof boardAssignmentRecurrences)[number],
    ) &&
    typeof value.activeFrom === "string" &&
    typeof value.activeTo === "string" &&
    typeof value.currentOccurrenceDate === "string" &&
    isBoardAssignmentStatus(value.status) &&
    typeof value.createdByDisplayName === "string" &&
    typeof value.createdAt === "string" &&
    typeof value.updatedAt === "string";
}

function isBoardAssignmentCompletionSummary(
  value: unknown,
): value is BoardAssignmentCompletionSummary {
  return isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.assignmentId === "string" &&
    typeof value.occurrenceDate === "string" &&
    typeof value.completedByDisplayName === "string" &&
    typeof value.completedAt === "string" &&
    isBoardAssignmentSummary(value.assignment);
}

function isBoardAssignmentCompletion(
  value: unknown,
): value is BoardAssignmentCompletion {
  return isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.assignmentId === "string" &&
    typeof value.occurrenceDate === "string" &&
    typeof value.completedByDisplayName === "string" &&
    typeof value.completedAt === "string" &&
    isBoardAssignment(value.assignment);
}

function isBoardAssignmentPermissions(
  value: unknown,
): value is BoardAssignmentPermissions {
  return isRecord(value) &&
    typeof value.canView === "boolean" &&
    typeof value.canCreate === "boolean" &&
    typeof value.canExecute === "boolean" &&
    typeof value.canReview === "boolean";
}

function isBoardAssignmentStatus(
  value: unknown,
): value is BoardAssignmentStatus {
  return boardAssignmentStatuses.includes(value as BoardAssignmentStatus);
}

async function readJson(response: Response) {
  try {
    return await response.json() as unknown;
  } catch {
    return undefined;
  }
}

function readRemoteError(
  payload: unknown,
  fallbackMessage: string,
): ErrorResult {
  if (
    isRecord(payload) &&
    isRecord(payload.error) &&
    typeof payload.error.message === "string"
  ) {
    return {
      status: "error",
      message: readShortUserMessage(payload.error.message, fallbackMessage),
      ...(typeof payload.error.code === "string"
        ? { code: payload.error.code as RemoteServerErrorCode }
        : {}),
    };
  }

  return { status: "error", message: fallbackMessage };
}

function invalidResponse(message: string): ErrorResult {
  return { status: "error", code: "invalid_response", message };
}

function readDownloadFilename(header: string | null) {
  if (header === null) return undefined;

  const encoded = /filename\*=UTF-8''([^;]+)/iu.exec(header)?.[1];
  if (encoded !== undefined) {
    try {
      return decodeURIComponent(encoded);
    } catch {
      return undefined;
    }
  }

  return /filename="([^"]+)"/iu.exec(header)?.[1];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
