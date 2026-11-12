import {
  nonAdminNavigationItems,
  resolveMaximumCapabilitiesForNavigation,
} from "./accountAccessConfiguration.js";
import {
  isAccountNavigationItem,
  type AccountCapability,
  type AccountNavigationItem,
  type ServerUserProfile,
} from "./auth.js";

/**
 * Задача 147: an instance of another organization carries only the platform — the working
 * sections listed in `SMB_INSTANCE_NAVIGATION`. Every other section (the NMOU laboratory,
 * wagons, shop, dispatcher forms…) does not exist there: it is absent from menus and
 * catalogs, cannot be granted to a position, and its capabilities are stripped from every
 * profile, so its API answers 403. `undefined` is the unrestricted NMOU instance.
 */
export type InstanceNavigation = readonly AccountNavigationItem[] | undefined;

export class InstanceNavigationConfigError extends Error {}

/** Parses the env list; an unknown or administrative item is a configuration error, not a silent skip. */
export function readInstanceNavigation(value: string | undefined): InstanceNavigation {
  const items = (value ?? "").split(",").map((item) => item.trim()).filter((item) => item.length > 0);
  if (items.length === 0) {
    // A value of commas or spaces is a typo, and reading it as "every section" would open the NMOU modules.
    if ((value ?? "").trim().length > 0) {
      throw new InstanceNavigationConfigError("SMB_INSTANCE_NAVIGATION задан, но не содержит ни одного раздела.");
    }
    return undefined;
  }
  const working = new Set<string>(nonAdminNavigationItems);
  const unknown = items.filter((item) => !isAccountNavigationItem(item) || !working.has(item));
  if (unknown.length > 0) {
    throw new InstanceNavigationConfigError(
      `SMB_INSTANCE_NAVIGATION содержит неизвестные рабочие разделы: ${unknown.join(", ")}.`,
    );
  }
  return [...new Set(items)] as AccountNavigationItem[];
}

export function isInstanceRestricted(instance: InstanceNavigation): instance is readonly AccountNavigationItem[] {
  return instance !== undefined;
}

/** Administrative sections belong to the platform and exist in every instance. */
export function isInstanceNavigationItem(instance: InstanceNavigation, item: AccountNavigationItem) {
  return instance === undefined || !nonAdminNavigationItems.includes(item) || instance.includes(item);
}

export function hasInstanceNavigationItem(instance: InstanceNavigation, items: readonly AccountNavigationItem[]) {
  return instance === undefined || items.some((item) => instance.includes(item));
}

export function filterInstanceNavigation<Item extends AccountNavigationItem>(
  instance: InstanceNavigation,
  items: readonly Item[],
): Item[] {
  return instance === undefined ? [...items] : items.filter((item) => isInstanceNavigationItem(instance, item));
}

/**
 * Capabilities that only absent sections could grant. A capability shared with a present
 * section (the dispatcher feed of «Обзор» and «Диспетчерская») stays.
 */
const absentCapabilitiesByInstance = new WeakMap<readonly AccountNavigationItem[], ReadonlySet<AccountCapability>>();

function readAbsentCapabilities(instance: readonly AccountNavigationItem[]): ReadonlySet<AccountCapability> {
  // The instance list is one array for the life of the process; every request asks for the same set.
  const cached = absentCapabilitiesByInstance.get(instance);
  if (cached !== undefined) return cached;
  const granted = (items: readonly AccountNavigationItem[]) =>
    new Set(items.flatMap((item) => resolveMaximumCapabilitiesForNavigation(item)));
  const present = granted(nonAdminNavigationItems.filter((item) => instance.includes(item)));
  const absent = new Set([...granted(nonAdminNavigationItems.filter((item) => !instance.includes(item)))]
    .filter((capability) => !present.has(capability)));
  absentCapabilitiesByInstance.set(instance, absent);
  return absent;
}

export function filterInstanceCapabilities(
  instance: InstanceNavigation,
  capabilities: readonly AccountCapability[],
): AccountCapability[] {
  if (instance === undefined) return [...capabilities];
  const absent = readAbsentCapabilities(instance);
  return capabilities.filter((capability) => !absent.has(capability));
}

type InstanceAccess = { navigationItems: AccountNavigationItem[]; capabilities: AccountCapability[] };

/** Stored positions and accounts may still list absent sections (migration defaults); views drop them. */
export function applyInstanceAccess<Access extends InstanceAccess>(instance: InstanceNavigation, access: Access): Access {
  if (instance === undefined) return access;
  return {
    ...access,
    navigationItems: filterInstanceNavigation(instance, access.navigationItems),
    capabilities: filterInstanceCapabilities(instance, access.capabilities),
  };
}

/** The single gate of every request: a session never carries a section or right of an absent module. */
export function applyInstanceProfile(instance: InstanceNavigation, profile: ServerUserProfile): ServerUserProfile {
  return instance === undefined ? profile : { ...profile, activeAccess: applyInstanceAccess(instance, profile.activeAccess) };
}

/**
 * The stored menu order covers every section of the code base. An instance shows and saves
 * only its own sections; the absent ones keep their stored places after them.
 */
export function mergeInstanceNavigationOrder(
  instance: InstanceNavigation,
  saved: readonly AccountNavigationItem[],
  stored: readonly AccountNavigationItem[],
): AccountNavigationItem[] {
  if (instance === undefined) return [...saved];
  return [...saved, ...stored.filter((item) => !isInstanceNavigationItem(instance, item))];
}

/** API of the platform itself: sign-in, profile, administration, journal, menu, table layouts, own notifications. */
const coreApiPrefixes = [
  "/api/auth/", "/api/access/", "/api/dev/", "/api/admin/", "/api/audit/", "/api/navigation-order",
  "/api/table-layouts", "/api/login-notifications", "/api/notification-settings", "/api/notification-email",
] as const;

const dispatcherSections: AccountNavigationItem[] = ["business.dispatcher_form", "business.dispatcher", "business.overview", "business.work"];
const productionSections: AccountNavigationItem[] = [
  "business.refractory_shop", "business.laboratory_results", "business.laboratory_review", "business.production", "business.production_plan",
];

/** API of each module and the sections it serves; a module is present when one of its sections is. */
const moduleApi: ReadonlyArray<{ prefixes: readonly string[]; sections: readonly AccountNavigationItem[] }> = [
  { prefixes: ["/api/director-assignments"], sections: ["business.director_assignments", "business.assignments"] },
  { prefixes: ["/api/collegium-assignments"], sections: ["business.collegium_assignments", "business.assignments"] },
  // Delegations of a board assignment are read from the director registry as well.
  { prefixes: ["/api/board-assignment"], sections: ["business.board_assignments", "business.director_assignments", "business.assignments"] },
  { prefixes: ["/api/personnel"], sections: ["business.personnel"] },
  { prefixes: ["/api/collegium-initiatives", "/api/collegium-meetings", "/api/collegium-settings", "/api/collegium-effect-groups"], sections: ["business.collegium_initiatives"] },
  { prefixes: ["/api/business/overview"], sections: ["business.overview"] },
  { prefixes: ["/api/dispatcher/", "/api/admin/database/imports/"], sections: dispatcherSections },
  { prefixes: ["/api/laboratory/", "/api/refractory-", "/api/production-plans", "/api/production-brands"], sections: [...productionSections, ...dispatcherSections] },
  { prefixes: ["/api/railway-"], sections: ["business.railway_wagons"] },
  { prefixes: ["/api/warehouse-1c", "/api/upload-report"], sections: ["business.warehouse_1c"] },
];

/**
 * In an instance of another organization the API of an absent module does not exist: no
 * capability, preview right or administrator reaches it. A path that belongs to no known
 * module is refused there as well, so a new module stays out until it is listed here.
 */
export function isInstanceApiPath(instance: InstanceNavigation, pathname: string) {
  if (instance === undefined || !pathname.startsWith("/api/")) return true;
  const owner = moduleApi.find(({ prefixes }) => prefixes.some((prefix) => pathname.startsWith(prefix)));
  if (owner !== undefined) return owner.sections.some((section) => instance.includes(section));
  return coreApiPrefixes.some((prefix) => pathname.startsWith(prefix));
}
