import type { AccountNavigationItem } from "./accounts.js";

export type NavigationOrderResponse = {
  navigationOrder: AccountNavigationItem[];
};

export type SaveNavigationOrderRequest = NavigationOrderResponse;
