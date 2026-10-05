import {
  collegiumInitiativesApiPath,
  collegiumMeetingsApiPath,
  type CollegiumAttachment,
  type CollegiumCommentKind,
  type CollegiumInitiative,
  type CollegiumInitiativeActionRequest,
  type CollegiumInitiativeComment,
  type CollegiumInitiativeDetailResponse,
  type CollegiumInitiativeListResponse,
  type CollegiumInitiativeResultInput,
  type CollegiumInitiativeSaveRequest,
  type CollegiumMeeting,
  type CollegiumMeetingDetailResponse,
  type CollegiumMeetingListResponse,
} from "../contracts/collegiumInitiatives.js";
import {
  assignmentRegistries,
  type DirectorAssignment,
  type DirectorAssignmentInput,
} from "../../server/src/contracts/directorAssignments.js";
import { buildDevAccessHeaders } from "./devAccessSessionStorage.js";
import { describeRemoteNetworkFailure, resolveApiEndpoint } from "./remoteServer.js";

/** Граница запросов модуля «Инициативы Коллегии»: данные и права — только с сервера. */
export class CollegiumInitiativesRequestError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "CollegiumInitiativesRequestError";
  }
}

async function request<T>(
  path: string,
  method: "GET" | "POST" | "PATCH" | "DELETE",
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(resolveApiEndpoint(path, path, {}), {
      method,
      credentials: "include",
      signal,
      headers: buildDevAccessHeaders({
        Accept: "application/json",
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      }),
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new CollegiumInitiativesRequestError(
      describeRemoteNetworkFailure("Не удалось связаться с сервером.", {}),
      0,
    );
  }
  const payload: unknown = await response.json().catch(() => undefined);
  if (!response.ok) {
    const message = isRecord(payload) && isRecord(payload.error) &&
        typeof payload.error.message === "string"
      ? payload.error.message
      : "Не удалось выполнить действие.";
    throw new CollegiumInitiativesRequestError(message, response.status);
  }
  return payload as T;
}

export function requestCollegiumInitiatives(signal?: AbortSignal) {
  return request<CollegiumInitiativeListResponse>(
    collegiumInitiativesApiPath,
    "GET",
    undefined,
    signal,
  );
}

export function requestCollegiumInitiative(id: string, signal?: AbortSignal) {
  return request<CollegiumInitiativeDetailResponse>(
    `${collegiumInitiativesApiPath}/${encodeURIComponent(id)}`,
    "GET",
    undefined,
    signal,
  );
}

export async function saveCollegiumInitiative(
  id: string | undefined,
  body: CollegiumInitiativeSaveRequest,
) {
  const result = await request<{ initiative: CollegiumInitiative }>(
    id === undefined
      ? collegiumInitiativesApiPath
      : `${collegiumInitiativesApiPath}/${encodeURIComponent(id)}`,
    id === undefined ? "POST" : "PATCH",
    body,
  );
  return result.initiative;
}

export async function actOnCollegiumInitiative(
  id: string,
  body: CollegiumInitiativeActionRequest,
) {
  const result = await request<{ initiative: CollegiumInitiative }>(
    `${collegiumInitiativesApiPath}/${encodeURIComponent(id)}/actions`,
    "POST",
    body,
  );
  return result.initiative;
}

export async function commentCollegiumInitiative(
  id: string,
  body: { kind: CollegiumCommentKind; text: string },
) {
  const result = await request<{ comment: CollegiumInitiativeComment }>(
    `${collegiumInitiativesApiPath}/${encodeURIComponent(id)}/comments`,
    "POST",
    body,
  );
  return result.comment;
}

export async function resolveCollegiumInitiativeComment(id: string, commentId: string) {
  const result = await request<{ comment: CollegiumInitiativeComment }>(
    `${collegiumInitiativesApiPath}/${encodeURIComponent(id)}/comments/${encodeURIComponent(commentId)}/resolve`,
    "POST",
    {},
  );
  return result.comment;
}

/** Вложения инициативы или заседания: владелец задаётся базовым путём API. */
export type CollegiumAttachmentsApi = {
  upload: (file: File) => Promise<CollegiumAttachment>;
  addLink: (link: { url: string; label: string }) => Promise<CollegiumAttachment>;
  download: (attachmentId: string) => Promise<Blob>;
  remove: (attachmentId: string) => Promise<void>;
};

export function createCollegiumAttachmentsApi(ownerPath: string): CollegiumAttachmentsApi {
  const base = `${ownerPath}/attachments`;
  const itemPath = (attachmentId: string) => `${base}/${encodeURIComponent(attachmentId)}`;
  return {
    async upload(file) {
      const path = `${base}?fileName=${encodeURIComponent(file.name)}`;
      let response: Response;
      try {
        response = await fetch(resolveApiEndpoint(path, path, {}), {
          method: "POST",
          credentials: "include",
          headers: buildDevAccessHeaders({
            Accept: "application/json",
            "Content-Type": "application/octet-stream",
          }),
          body: file,
        });
      } catch {
        throw new CollegiumInitiativesRequestError(
          describeRemoteNetworkFailure("Не удалось связаться с сервером.", {}),
          0,
        );
      }
      const payload: unknown = await response.json().catch(() => undefined);
      if (!response.ok) throw readRequestError(payload, response.status, "Не удалось загрузить файл.");
      return (payload as { attachment: CollegiumAttachment }).attachment;
    },
    async addLink(link) {
      const result = await request<{ attachment: CollegiumAttachment }>(`${base}/links`, "POST", link);
      return result.attachment;
    },
    async download(attachmentId) {
      const path = itemPath(attachmentId);
      const response = await fetch(resolveApiEndpoint(path, path, {}), {
        credentials: "include",
        headers: buildDevAccessHeaders({}),
      });
      if (!response.ok) {
        const payload: unknown = await response.json().catch(() => undefined);
        throw readRequestError(payload, response.status, "Не удалось открыть файл.");
      }
      return response.blob();
    },
    async remove(attachmentId) {
      await request<{ ok: true }>(itemPath(attachmentId), "DELETE");
    },
  };
}

export function collegiumInitiativeAttachmentsApi(id: string) {
  return createCollegiumAttachmentsApi(`${collegiumInitiativesApiPath}/${encodeURIComponent(id)}`);
}

export function collegiumMeetingAttachmentsApi(id: string) {
  return createCollegiumAttachmentsApi(`${collegiumMeetingsApiPath}/${encodeURIComponent(id)}`);
}

export function requestCollegiumMeetings(signal?: AbortSignal) {
  return request<CollegiumMeetingListResponse>(collegiumMeetingsApiPath, "GET", undefined, signal);
}

export function requestCollegiumMeeting(id: string, signal?: AbortSignal) {
  return request<CollegiumMeetingDetailResponse>(
    `${collegiumMeetingsApiPath}/${encodeURIComponent(id)}`,
    "GET",
    undefined,
    signal,
  );
}

/** Изменение заседания: путь действия относительно заседания и тело с ревизией. */
export async function sendCollegiumMeetingRequest(
  id: string | undefined,
  action: string,
  method: "POST" | "PATCH",
  body: unknown,
) {
  const base = id === undefined
    ? collegiumMeetingsApiPath
    : `${collegiumMeetingsApiPath}/${encodeURIComponent(id)}`;
  const result = await request<{ meeting: CollegiumMeeting }>(
    action === "" ? base : `${base}/${action}`,
    method,
    body,
  );
  return result.meeting;
}

export async function recordCollegiumInitiativeResult(
  id: string,
  body: CollegiumInitiativeResultInput & { revision: number },
) {
  const result = await request<{ initiative: CollegiumInitiative }>(
    `${collegiumInitiativesApiPath}/${encodeURIComponent(id)}/result`,
    "POST",
    body,
  );
  return result.initiative;
}

/** Поручение создаётся в реестре Коллегии; сервер связывает его с инициативой. */
export async function createCollegiumAssignmentFromInitiative(
  assignment: DirectorAssignmentInput,
  comment: string,
) {
  const result = await request<{ assignment: DirectorAssignment }>(
    assignmentRegistries.collegium.apiPath,
    "POST",
    { assignment, comment },
  );
  return result.assignment;
}

function readRequestError(payload: unknown, status: number, fallback: string) {
  return new CollegiumInitiativesRequestError(
    isRecord(payload) && isRecord(payload.error) && typeof payload.error.message === "string"
      ? payload.error.message
      : fallback,
    status,
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
