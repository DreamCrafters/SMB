import { validateTableLayout, type TableLayout, type TableLayoutsResponse } from "../../server/src/contracts/tableLayouts.js";
import { buildDevAccessHeaders } from "./devAccessSessionStorage.js";
import { resolveApiEndpoint } from "./remoteServer.js";

export class TableLayoutRequestError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}
async function request(method: "GET" | "PUT", body?: TableLayout, signal?: AbortSignal): Promise<unknown> {
  const path = "/api/table-layouts";
  const response = await fetch(resolveApiEndpoint(path, path, {}), {
    method, credentials: "include", signal,
    headers: buildDevAccessHeaders({ Accept: "application/json", ...(body ? { "Content-Type": "application/json" } : {}) }),
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const payload = await response.json();
  if (!response.ok) throw new TableLayoutRequestError(
    typeof payload?.error?.message === "string" ? payload.error.message : "Не удалось сохранить ширины колонок.", response.status);
  return payload;
}
export async function requestTableLayouts(signal?: AbortSignal): Promise<TableLayoutsResponse> {
  const payload = await request("GET", undefined, signal);
  if (typeof payload !== "object" || payload === null || !("layouts" in payload)
    || !Array.isArray(payload.layouts) || !("canManage" in payload) || typeof payload.canManage !== "boolean") {
    throw new Error("Некорректный ответ настроек таблиц.");
  }
  const layouts = payload.layouts.map(validateTableLayout);
  if (layouts.some((layout) => !layout.ok)) throw new Error("Некорректные настройки таблиц.");
  return { layouts: layouts.flatMap((layout) => layout.ok ? [layout.value] : []), canManage: payload.canManage };
}
export async function saveTableLayout(layout: TableLayout) {
  const result = validateTableLayout(await request("PUT", layout));
  if (!result.ok) throw new Error(result.message);
  return result.value;
}
