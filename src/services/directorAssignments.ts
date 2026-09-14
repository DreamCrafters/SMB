import type { DirectorAssignment, DirectorAssignmentPermissions, PersonnelEmployee } from "../../server/src/contracts/directorAssignments";
import { buildDevAccessHeaders } from "./devAccessSessionStorage";
import { resolveApiEndpoint } from "./remoteServer";

export type DirectorAssignmentListResponse = { assignments: DirectorAssignment[]; employees: PersonnelEmployee[]; permissions: DirectorAssignmentPermissions; today: string };
export type PersonnelResponse = { employees: PersonnelEmployee[]; users: Array<{ id: string; displayName: string; login: string }> };

export async function directorRequest<T>(path: string, method = "GET", body?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(resolveApiEndpoint(path, path, {}), {
    method, credentials: "include", signal,
    headers: buildDevAccessHeaders({ Accept: "application/json", ...(body === undefined ? {} : { "Content-Type": "application/json" }) }),
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(typeof payload?.error?.message === "string" ? payload.error.message : "Не удалось выполнить действие.");
  return payload as T;
}

export async function directorDocument(assignmentId: string, file: File | string) {
  const path = `/api/director-assignments/${encodeURIComponent(assignmentId)}/documents${typeof file === "string" ? `/${encodeURIComponent(file)}` : `?fileName=${encodeURIComponent(file.name)}`}`;
  const response = await fetch(resolveApiEndpoint(path, path, {}), {
    method: typeof file === "string" ? "GET" : "POST", credentials: "include",
    headers: buildDevAccessHeaders(typeof file === "string" ? {} : { "Content-Type": "application/pdf" }),
    ...(typeof file === "string" ? {} : { body: file }),
  });
  if (!response.ok) {
    const payload = await response.json();
    throw new Error(payload?.error?.message ?? "Не удалось открыть документ.");
  }
  return typeof file === "string" ? response.blob() : undefined;
}
