import {
  collegiumInitiativesApiPath,
  type CollegiumAttachment,
  type CollegiumCommentKind,
  type CollegiumInitiative,
  type CollegiumInitiativeActionRequest,
  type CollegiumInitiativeComment,
  type CollegiumInitiativeDetailResponse,
  type CollegiumInitiativeListResponse,
  type CollegiumInitiativeSaveRequest,
} from "../contracts/collegiumInitiatives.js";
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

function attachmentsPath(id: string, attachmentId?: string) {
  const base = `${collegiumInitiativesApiPath}/${encodeURIComponent(id)}/attachments`;
  return attachmentId === undefined ? base : `${base}/${encodeURIComponent(attachmentId)}`;
}

export async function uploadCollegiumAttachment(id: string, file: File) {
  const path = `${attachmentsPath(id)}?fileName=${encodeURIComponent(file.name)}`;
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
  if (!response.ok) {
    throw new CollegiumInitiativesRequestError(
      isRecord(payload) && isRecord(payload.error) && typeof payload.error.message === "string"
        ? payload.error.message
        : "Не удалось загрузить файл.",
      response.status,
    );
  }
  return (payload as { attachment: CollegiumAttachment }).attachment;
}

export async function addCollegiumAttachmentLink(id: string, link: { url: string; label: string }) {
  const result = await request<{ attachment: CollegiumAttachment }>(
    `${attachmentsPath(id)}/links`,
    "POST",
    link,
  );
  return result.attachment;
}

export async function downloadCollegiumAttachment(id: string, attachmentId: string) {
  const path = attachmentsPath(id, attachmentId);
  const response = await fetch(resolveApiEndpoint(path, path, {}), {
    credentials: "include",
    headers: buildDevAccessHeaders({}),
  });
  if (!response.ok) {
    const payload: unknown = await response.json().catch(() => undefined);
    throw new CollegiumInitiativesRequestError(
      isRecord(payload) && isRecord(payload.error) && typeof payload.error.message === "string"
        ? payload.error.message
        : "Не удалось открыть файл.",
      response.status,
    );
  }
  return response.blob();
}

export async function deleteCollegiumAttachment(id: string, attachmentId: string) {
  await request<{ ok: true }>(attachmentsPath(id, attachmentId), "DELETE");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
