import type { AccountNavigationItem } from "./accounts.js";

/**
 * Переименование разделов левой панели: хранится только отличие от названия по
 * умолчанию, поэтому пустое значение возвращает разделу исходное имя.
 */
export type NavigationLabels = Partial<Record<AccountNavigationItem, string>>;

export const navigationLabelMaxLength = 60;

export type NavigationOrderResponse = {
  navigationOrder: AccountNavigationItem[];
  navigationLabels: NavigationLabels;
};

export type SaveNavigationOrderRequest = NavigationOrderResponse;
