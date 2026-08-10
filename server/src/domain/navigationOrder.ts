import {
  accountNavigationItems,
  isAccountNavigationItem,
  type AccountNavigationItem,
} from "./auth.js";

export const defaultNavigationOrder: AccountNavigationItem[] = [
  "business.overview",
  "business.dispatcher",
  "business.work",
  "business.production_plan",
  "business.refractory_shop",
  "business.laboratory_results",
  "business.laboratory_review",
  "business.board_assignments",
  "business.settings",
  "business.user_actions",
  "business.dispatcher_form",
  "admin.account_preview",
  "admin.accounts",
  "admin.navigation",
  "admin.user_actions",
  "admin.database",
];

export function validateNavigationOrder(value: unknown):
  | { ok: true; value: AccountNavigationItem[] }
  | { ok: false; errors: string[] } {
  if (
    typeof value !== "object" ||
    value === null ||
    !("navigationOrder" in value) ||
    !Array.isArray(value.navigationOrder)
  ) {
    return { ok: false, errors: ["Передайте полный порядок вкладок."] };
  }

  const order = value.navigationOrder;
  if (
    order.length !== accountNavigationItems.length ||
    !order.every(isAccountNavigationItem) ||
    new Set(order).size !== order.length
  ) {
    return {
      ok: false,
      errors: ["Порядок должен содержать каждую доступную вкладку ровно один раз."],
    };
  }

  return { ok: true, value: [...order] };
}

export function reconcileNavigationOrder(value: unknown) {
  const stored = Array.isArray(value) ? value : [];
  const seen = new Set<AccountNavigationItem>();
  const knownStoredItems = stored.flatMap((item) => {
    if (!isAccountNavigationItem(item) || seen.has(item)) return [];
    seen.add(item);
    return [item];
  });

  return [
    ...knownStoredItems,
    ...defaultNavigationOrder.filter((item) => !seen.has(item)),
  ];
}
