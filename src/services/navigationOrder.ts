import {
  accountNavigationItems,
  navigationLabelMaxLength,
  type AccountNavigationItem,
  type NavigationLabels,
  type NavigationOrderResponse,
} from "../contracts";
import { buildDevAccessHeaders } from "./devAccessSessionStorage.js";
import {
  describeRemoteNetworkFailure,
  resolveApiEndpoint,
} from "./remoteServer.js";

const NAVIGATION_ORDER_PATH = "/api/navigation-order";
const ADMIN_NAVIGATION_ORDER_PATH = "/api/admin/navigation-order";

export type NavigationOrderResult =
  | {
      status: "ready";
      navigationOrder: AccountNavigationItem[];
      navigationLabels: NavigationLabels;
    }
  | { status: "error"; message: string };

type RequestOptions = {
  baseUrl?: string;
  signal?: AbortSignal;
};

export async function requestNavigationOrder(
  options: RequestOptions = {},
): Promise<NavigationOrderResult> {
  return requestOrder(NAVIGATION_ORDER_PATH, "GET", undefined, options);
}

export async function saveNavigationOrder(
  navigationOrder: AccountNavigationItem[],
  navigationLabels: NavigationLabels,
  options: RequestOptions = {},
): Promise<NavigationOrderResult> {
  return requestOrder(
    ADMIN_NAVIGATION_ORDER_PATH,
    "PUT",
    { navigationOrder, navigationLabels },
    options,
  );
}

async function requestOrder(
  path: string,
  method: "GET" | "PUT",
  body: NavigationOrderResponse | undefined,
  { baseUrl, signal }: RequestOptions,
): Promise<NavigationOrderResult> {
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
    const payload: unknown = await response.json();

    if (!response.ok) {
      return {
        status: "error",
        message: readErrorMessage(payload) ?? "Не удалось сохранить порядок вкладок.",
      };
    }

    const navigationOrder = readNavigationOrder(payload);

    return navigationOrder === undefined
      ? {
          status: "error",
          message: "Сервер вернул порядок вкладок в неподдерживаемом формате.",
        }
      : {
          status: "ready",
          navigationOrder,
          navigationLabels: readNavigationLabels(payload),
        };
  } catch (error) {
    return {
      status: "error",
      message: isAbortError(error)
        ? "Запрос порядка вкладок отменён."
        : describeRemoteNetworkFailure("Не удалось загрузить порядок вкладок.", {
            baseUrl,
          }),
    };
  }
}

function readNavigationOrder(value: unknown) {
  if (!isRecord(value) || !Array.isArray(value.navigationOrder)) {
    return undefined;
  }

  const order = value.navigationOrder;
  const catalog = new Set<AccountNavigationItem>(accountNavigationItems);

  if (
    order.length !== accountNavigationItems.length ||
    !order.every(
      (item): item is AccountNavigationItem =>
        typeof item === "string" && catalog.has(item as AccountNavigationItem),
    ) ||
    new Set(order).size !== order.length
  ) {
    return undefined;
  }

  return [...order];
}

/** Неизвестные вкладки и слишком длинные названия из ответа игнорируются. */
function readNavigationLabels(value: unknown): NavigationLabels {
  if (!isRecord(value) || !isRecord(value.navigationLabels)) return {};

  const catalog = new Set<string>(accountNavigationItems);
  const labels: NavigationLabels = {};

  for (const [item, label] of Object.entries(value.navigationLabels)) {
    if (!catalog.has(item) || typeof label !== "string") continue;

    const trimmed = label.trim();

    if (trimmed.length > 0 && trimmed.length <= navigationLabelMaxLength) {
      labels[item as AccountNavigationItem] = trimmed;
    }
  }

  return labels;
}

function readErrorMessage(value: unknown) {
  return isRecord(value) && isRecord(value.error) &&
    typeof value.error.message === "string"
    ? value.error.message
    : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}
