import { readAssignmentInboxAccess } from "../contracts/directorAssignments.js";
import { readCollegiumInitiativeAccess } from "../contracts/collegiumInitiatives.js";
import {
  readBoardAssignmentAccess,
  readOverviewVisitorsAccess,
  readRailwayWagonAccess,
} from "../domain/accountAccessConfiguration.js";
import {
  applyInstanceAccess,
  filterInstanceNavigation,
  isInstanceNavigationItem,
  mergeInstanceNavigationOrder,
  type InstanceNavigation,
} from "../domain/instanceAccess.js";
import type { AccountNavigationItem } from "../domain/auth.js";
import type { AccountsRepository, AdminAccountSummary, AdminPositionSummary } from "./accountsRepository.js";
import type { NavigationOrderRepository, NavigationSettings } from "./navigationOrderRepository.js";

/**
 * Задача 147: what an instance of another organization sees of positions and accounts.
 * Rows may still store sections that are absent here (positions seeded by migrations); every
 * read drops them together with their rights and the levels derived from them. Writes pass
 * through: requests are validated against the instance catalog before they reach the storage.
 */
export function createInstanceAccountsView(
  accounts: AccountsRepository,
  instance: InstanceNavigation,
): AccountsRepository {
  if (instance === undefined) return accounts;

  const viewAccount = (account: AdminAccountSummary) => applyInstanceAccess(instance, account);
  const viewPosition = (stored: AdminPositionSummary): AdminPositionSummary => {
    const position = applyInstanceAccess(instance, stored);
    const { capabilities, navigationItems } = position;
    return {
      ...position,
      boardAssignmentAccess: readBoardAssignmentAccess(capabilities, navigationItems),
      railwayWagonAccess: readRailwayWagonAccess(capabilities, navigationItems),
      assignmentInboxAccess: readAssignmentInboxAccess(capabilities, navigationItems),
      collegiumInitiativeAccess: readCollegiumInitiativeAccess(capabilities, navigationItems),
      showOverviewVisitors: readOverviewVisitorsAccess(capabilities),
    };
  };

  return {
    ...accounts,
    listAccounts: async () => (await accounts.listAccounts()).map(viewAccount),
    createAccount: async (...args) => viewAccount(await accounts.createAccount(...args)),
    setAccountNavigation: async (...args) => {
      const account = await accounts.setAccountNavigation(...args);
      return account === undefined ? undefined : viewAccount(account);
    },
    setAccountPosition: async (...args) => {
      const change = await accounts.setAccountPosition(...args);
      return change === undefined
        ? undefined
        : { previous: viewAccount(change.previous), updated: viewAccount(change.updated) };
    },
    listPositions: async () => (await accounts.listPositions()).map(viewPosition),
    createPosition: async (...args) => viewPosition(await accounts.createPosition(...args)),
    updatePosition: async (...args) => {
      const position = await accounts.updatePosition(...args);
      return position === undefined ? undefined : viewPosition(position);
    },
  };
}

/**
 * The menu order of an instance is the complete sequence of its own sections: that is also
 * the catalog the client builds its section lists from. Absent sections keep their stored
 * places and names behind the saved order, so the storage stays valid for the whole code base.
 */
export function createInstanceNavigationOrderView(
  navigationOrder: NavigationOrderRepository,
  instance: InstanceNavigation,
): NavigationOrderRepository {
  if (instance === undefined) return navigationOrder;

  const view = (settings: NavigationSettings): NavigationSettings => ({
    navigationOrder: filterInstanceNavigation(instance, settings.navigationOrder),
    navigationLabels: Object.fromEntries(
      Object.entries(settings.navigationLabels).filter(([item]) => isInstanceNavigationItem(instance, item as AccountNavigationItem)),
    ),
  });

  return {
    read: async () => view(await navigationOrder.read()),
    async set(settings) {
      const stored = await navigationOrder.read();
      const change = await navigationOrder.set({
        navigationOrder: mergeInstanceNavigationOrder(instance, settings.navigationOrder, stored.navigationOrder),
        navigationLabels: {
          ...Object.fromEntries(
            Object.entries(stored.navigationLabels).filter(([item]) => !isInstanceNavigationItem(instance, item as AccountNavigationItem)),
          ),
          ...settings.navigationLabels,
        },
      });
      return { previous: view(change.previous), updated: view(change.updated) };
    },
  };
}
