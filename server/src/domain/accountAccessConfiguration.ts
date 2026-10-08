import {
  collegiumInitiativeAccessLevels,
  collegiumInitiativesNavigationItem,
  isCollegiumInitiativeAccess,
  resolveCollegiumInitiativeCapabilities,
  type CollegiumInitiativeAccess,
} from "../contracts/collegiumInitiatives.js";
import { assignmentInboxNavigationItem, assignmentInboxSourceCapabilities, assignmentInboxSources, isAssignmentInboxAccess, type AssignmentInboxAccess } from "../contracts/directorAssignments.js";
import {
  isRailwayWagonRole,
  isRailwayWagonAccess,
  readRailwayWagonAccessRoles,
  resolveRailwayWagonRoles,
  railwayWagonAccessLevels,
  railwayWagonRoleCapabilities,
  railwayWagonRoles,
  type RailwayWagonAccess,
} from "../contracts/railwayWagons.js";
import type {
  AccountCapability,
  AccountNavigationItem,
  AccountPosition,
  AccountType,
} from "./auth.js";

export const boardAssignmentAccessLevels = [
  "none",
  "view",
  "create",
  "review",
] as const;

export type BoardAssignmentAccess =
  (typeof boardAssignmentAccessLevels)[number];

export const accountTypeByPosition: Record<AccountPosition, AccountType> = {
  administrator: "admin",
  business_owner: "business_owner",
  board_chair: "business_owner",
  board_deputy_chair: "business_owner",
  board_assignment_reviewer: "business_owner",
  board_member: "business_owner",
  general_director: "business_owner",
  economist: "business_owner",
  laboratory_assistant: "business_owner",
  worker: "worker",
  dispatcher: "dispatcher",
};

export const defaultPositionByAccountType: Record<AccountType, AccountPosition> = {
  admin: "administrator",
  business_owner: "business_owner",
  worker: "worker",
  dispatcher: "dispatcher",
};

export const navigationItemsByAccountType: Record<
  AccountType,
  AccountNavigationItem[]
> = {
  admin: [
    "admin.account_preview",
    "admin.accounts",
    "admin.navigation",
    "admin.database",
    "admin.user_actions",
  ],
  business_owner: ["business.overview", "business.dispatcher", "business.work"],
  worker: [],
  dispatcher: ["business.dispatcher_form"],
};

export const nonAdminNavigationItems: AccountNavigationItem[] = [
  "business.overview",
  "business.dispatcher",
  "business.work",
  "business.user_actions",
  "business.production_plan",
  "business.refractory_shop",
  "business.laboratory_results",
  "business.laboratory_review",
  "business.assignments",
  "business.board_assignments",
  "business.director_assignments",
  "business.collegium_assignments",
  "business.collegium_initiatives",
  "business.personnel",
  "business.warehouse_1c",
  "business.railway_wagons",
  "business.settings",
  "business.dispatcher_form",
];

export type PositionAccessDefinition = {
  accountType: AccountType;
  navigationItems: AccountNavigationItem[];
  capabilities: AccountCapability[];
};

/** Объединяет доступы нескольких должностей в один server-owned кабинет. */
export function combinePositionAccessDefinitions(
  definitions: readonly PositionAccessDefinition[],
) {
  if (definitions.length === 0) {
    throw new Error("At least one position is required.");
  }

  const accountType = definitions.some(({ accountType }) => accountType === "admin")
    ? "admin"
    : definitions.some(({ accountType }) => accountType === "dispatcher")
      ? "dispatcher"
      : definitions.some(({ accountType }) => accountType === "business_owner")
        ? "business_owner"
        : "worker";

  return {
    accountType,
    navigationItems: Array.from(new Set(
      definitions.flatMap(({ navigationItems }) => navigationItems),
    )),
    capabilities: Array.from(new Set(
      definitions.flatMap(({ capabilities }) => capabilities),
    )),
  } satisfies PositionAccessDefinition;
}

/**
 * Админские разделы, которые главный администратор выдаёт должности отдельной
 * группой (набор хранится в `account_positions.admin_navigation_items`).
 */
export const delegableAdminNavigationItems: readonly AccountNavigationItem[] = [
  "admin.accounts",
  "admin.user_actions",
  "admin.account_preview",
  "admin.database",
  "admin.navigation",
];

/** Набор разделов из хранилища или запроса: только известные, без повторов, в каталожном порядке. */
export function readAdminNavigationItems(value: unknown): AccountNavigationItem[] {
  const parsed = typeof value === "string" ? safelyParseJsonArray(value) : value;
  if (!Array.isArray(parsed)) return [];
  return delegableAdminNavigationItems.filter((item) => parsed.includes(item));
}

/** Строгая проверка набора из запроса: массив известных разделов без повторов. */
export function validateAdminNavigationItems(value: unknown): AccountNavigationItem[] | undefined {
  if (!Array.isArray(value)) return undefined;
  if (new Set(value).size !== value.length) return undefined;
  if (!value.every((item) => delegableAdminNavigationItems.includes(item as AccountNavigationItem))) {
    return undefined;
  }
  return readAdminNavigationItems(value);
}

function safelyParseJsonArray(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return [];
  }
}

const capabilitiesByNavigationItem: Record<
  AccountNavigationItem,
  AccountCapability[]
> = {
  "admin.account_preview": [],
  "admin.accounts": ["platform.manage_users", "platform.manage_access", "platform.manage_table_layouts"],
  "admin.navigation": ["platform.manage_navigation_order"],
  "admin.database": ["platform.manage_analytics_database"],
  "admin.user_actions": ["platform.view_audit"],
  "business.overview": [
    "business.view_all_statistics",
    "business.view_notifications",
    "business.view_dispatcher_feed",
  ],
  "business.dispatcher": ["business.view_dispatcher_feed"],
  "business.work": [
    "business.submit_forms",
    "business.view_notifications",
    "business.view_own_submissions",
  ],
  "business.user_actions": ["business.view_user_actions"],
  "business.production_plan": ["business.manage_production_plan"],
  "business.refractory_shop": ["business.submit_refractory_reports"],
  "business.laboratory_results": ["business.manage_laboratory_results"],
  "business.laboratory_review": ["business.view_laboratory_results"],
  "business.board_assignments": ["business.view_board_assignments"],
  // Registry tabs are sending and control only; execution comes from «Поручения» sources.
  "business.director_assignments": ["business.view_director_assignments", "business.manage_director_assignments"],
  "business.collegium_assignments": ["business.view_collegium_assignments", "business.manage_collegium_assignments"],
  // The level inside the tab adds the higher initiative rights cumulatively.
  "business.collegium_initiatives": ["business.view_collegium_initiatives"],
  "business.assignments": [],
  "business.personnel": ["business.manage_personnel"],
  "business.warehouse_1c": ["business.view_warehouse_1c"],
  "business.railway_wagons": ["business.view_railway_wagons"],
  "business.settings": ["business.manage_notification_settings"],
  "business.dispatcher_form": [
    "business.submit_dispatcher_forms",
    "business.view_dispatcher_feed",
    "business.review_refractory_reports",
  ],
};

export function resolveCapabilitiesForNavigation(
  navigationItems: AccountNavigationItem[],
) {
  return Array.from(
    new Set(navigationItems.flatMap((item) => capabilitiesByNavigationItem[item])),
  );
}

/** Each selected source of «Поручения» grants its registry's view and execute rights. */
function resolveAssignmentInboxCapabilities(
  access: AssignmentInboxAccess,
  navigationItems: readonly AccountNavigationItem[],
): AccountCapability[] {
  if (access === "none" || !navigationItems.includes(assignmentInboxNavigationItem)) return [];
  return access.flatMap((source) => [...assignmentInboxSourceCapabilities[source]]);
}

/**
 * Уровни вкладок, которые не выводятся из списка вкладок. Уровень инициатив
 * Коллегии обязателен: пропущенное значение молча понизило бы председателя до
 * просмотра при любой правке должности.
 */
export type PositionAccessLevels = {
  collegiumInitiativeAccess: CollegiumInitiativeAccess;
  boardAssignmentAccess?: BoardAssignmentAccess;
  /** Админские разделы, выданные должности главным администратором. */
  adminNavigationItems?: readonly AccountNavigationItem[];
  showOverviewVisitors?: boolean;
  canReviewRawMaterialWarehouse?: boolean;
  railwayWagonAccess?: RailwayWagonAccess;
};

export function resolveCapabilitiesForPosition(
  position: AccountPosition,
  navigationItems: AccountNavigationItem[],
  assignmentInboxAccess: AssignmentInboxAccess,
  {
    collegiumInitiativeAccess,
    boardAssignmentAccess = getDefaultBoardAssignmentAccess(position),
    adminNavigationItems = [],
    showOverviewVisitors = true,
    canReviewRawMaterialWarehouse = false,
    railwayWagonAccess = "view",
  }: PositionAccessLevels,
) {
  const resolvedNavigationItems =
    position === defaultPositionByAccountType.admin
      ? Array.from(new Set(navigationItems))
      : resolveNavigationForPosition(navigationItems, adminNavigationItems);
  const navigationCapabilities = resolveCapabilitiesForNavigation(
    resolvedNavigationItems,
  );
  const capabilities = canReviewRawMaterialWarehouse &&
      resolvedNavigationItems.includes("business.laboratory_results")
    ? navigationCapabilities.filter(
        (capability) => capability !== "business.manage_laboratory_results",
      )
    : navigationCapabilities;

  const boardCapabilities: AccountCapability[] =
    !resolvedNavigationItems.includes("business.board_assignments")
      ? []
      : boardAssignmentAccess === "review"
          ? [
              "business.create_board_assignments",
              "business.review_board_assignments",
            ]
          : boardAssignmentAccess === "create"
            ? ["business.create_board_assignments"]
            : [];

  const overviewVisitorsCapabilities: AccountCapability[] =
    showOverviewVisitors &&
      resolvedNavigationItems.includes("business.overview")
      ? ["business.view_overview_visitors"]
      : [];

  const rawMaterialWarehouseCapabilities: AccountCapability[] =
    canReviewRawMaterialWarehouse &&
      resolvedNavigationItems.includes("business.laboratory_results")
      ? ["business.review_raw_material_warehouse"]
      : [];

  const railwayWagonCapabilities: AccountCapability[] =
    !resolvedNavigationItems.includes("business.railway_wagons")
      ? []
      : readRailwayWagonAccessRoles(railwayWagonAccess).map(
          (role) => railwayWagonRoleCapabilities[role] as AccountCapability,
        );

  const collegiumInitiativeCapabilities: AccountCapability[] =
    resolvedNavigationItems.includes(collegiumInitiativesNavigationItem)
      ? resolveCollegiumInitiativeCapabilities(
          collegiumInitiativeAccess === "none" ? "view" : collegiumInitiativeAccess,
        )
      : [];

  return Array.from(new Set([
    ...capabilities,
    ...boardCapabilities,
    ...resolveAssignmentInboxCapabilities(assignmentInboxAccess, resolvedNavigationItems),
    ...overviewVisitorsCapabilities,
    ...rawMaterialWarehouseCapabilities,
    ...railwayWagonCapabilities,
    ...collegiumInitiativeCapabilities,
  ]));
}

/**
 * Роль в разделе «ЖД Вагоны» читается обратно из capability должности — так же,
 * как уровень доступа к поручениям Совета директоров.
 */
export function readRailwayWagonAccess(
  capabilities: AccountCapability[],
  navigationItems: AccountNavigationItem[],
): RailwayWagonAccess {
  if (!navigationItems.includes("business.railway_wagons")) {
    return "none";
  }
  const roles = resolveRailwayWagonRoles(capabilities);
  return roles.length > 1 ? roles : roles[0] ?? "view";
}

/**
 * Вкладки, внутри которых доступ делится на уровни. Галочка выдаёт саму вкладку,
 * уровень выбирается отдельно, поэтому один каталог нужен и форме должности, и
 * массовому переключателю доступа.
 */
export const navigationAccessLevelsByItem = {
  "business.assignments": assignmentInboxSources,
  "business.board_assignments": boardAssignmentAccessLevels,
  "business.railway_wagons": railwayWagonAccessLevels,
  "business.collegium_initiatives": collegiumInitiativeAccessLevels,
} as const satisfies Partial<
  Record<AccountNavigationItem, readonly string[]>
>;

export type NavigationAccessLevelItem =
  keyof typeof navigationAccessLevelsByItem;

export type NavigationAccessLevel = BoardAssignmentAccess | RailwayWagonAccess | AssignmentInboxAccess | CollegiumInitiativeAccess;

export function hasNavigationAccessLevels(
  navigationItem: AccountNavigationItem,
): navigationItem is NavigationAccessLevelItem {
  return navigationItem in navigationAccessLevelsByItem;
}

export function isNavigationAccessLevel(
  navigationItem: AccountNavigationItem,
  value: unknown,
): value is NavigationAccessLevel {
  if (navigationItem === "business.railway_wagons") {
    return isRailwayWagonAccess(value);
  }
  if (navigationItem === assignmentInboxNavigationItem) {
    // Задача 131: the tab alone shows the registers the position controls; sources are optional.
    return isAssignmentInboxAccess(value);
  }
  if (navigationItem === collegiumInitiativesNavigationItem) {
    return isCollegiumInitiativeAccess(value) && value !== "none";
  }
  return (
    hasNavigationAccessLevels(navigationItem) &&
    (navigationAccessLevelsByItem[navigationItem] as readonly string[])
      .includes(value as string)
  );
}

/**
 * Предпросмотр одной вкладки показывает её максимально: к правам самой вкладки
 * добавляются права всех её уровней, независимо от назначенных должности ролей.
 */
export function resolveMaximumCapabilitiesForNavigation(
  navigationItem: AccountNavigationItem,
): AccountCapability[] {
  const base = resolveCapabilitiesForNavigation([navigationItem]);

  if (navigationItem === assignmentInboxNavigationItem) {
    // Задача 131: the tab also views every register, so the fullest preview adds control
    // of all registries; board review keeps the whole board register readable.
    return Array.from(new Set([
      ...resolveAssignmentInboxCapabilities([...assignmentInboxSources], [navigationItem]),
      "business.manage_director_assignments",
      "business.manage_collegium_assignments",
      "business.create_board_assignments",
      "business.review_board_assignments",
    ]));
  }

  if (navigationItem === "business.board_assignments") {
    return Array.from(new Set([
      ...base,
      "business.create_board_assignments",
      "business.review_board_assignments",
    ]));
  }

  if (navigationItem === "business.railway_wagons") {
    return Array.from(new Set([
      ...base,
      ...railwayWagonRoles.map((role) => railwayWagonRoleCapabilities[role]),
    ])) as AccountCapability[];
  }

  if (navigationItem === collegiumInitiativesNavigationItem) {
    return resolveCollegiumInitiativeCapabilities("chair");
  }

  if (navigationItem === "business.overview") {
    return Array.from(new Set([...base, "business.view_overview_visitors"]));
  }

  if (navigationItem === "business.laboratory_results") {
    return Array.from(new Set([
      ...base,
      "business.review_raw_material_warehouse",
    ]));
  }

  return base;
}

/**
 * Предпросмотр вкладки глазами одной роли: к правам вкладки добавляются права
 * выбранного уровня. Неизвестный уровень остаётся без добавки, а не роняет
 * запрос — цель предпросмотра приходит извне.
 */
export function resolveCapabilitiesForNavigationLevel(
  navigationItem: AccountNavigationItem,
  level: string,
): AccountCapability[] {
  const base = resolveCapabilitiesForNavigation([navigationItem]);

  if (navigationItem === assignmentInboxNavigationItem) {
    // Tab preview looks through one source at a time.
    return isAssignmentInboxAccess([level]) ? resolveAssignmentInboxCapabilities([level] as AssignmentInboxAccess, [navigationItem]) : base;
  }

  if (!isNavigationAccessLevel(navigationItem, level)) {
    return base;
  }

  if (navigationItem === "business.board_assignments") {
    return Array.from(new Set([
      ...base,
      ...(level === "review"
        ? ([
            "business.create_board_assignments",
            "business.review_board_assignments",
          ] as AccountCapability[])
        : level === "create"
            ? (["business.create_board_assignments"] as AccountCapability[])
            : []),
    ]));
  }

  if (navigationItem === collegiumInitiativesNavigationItem) {
    return resolveCollegiumInitiativeCapabilities(level as CollegiumInitiativeAccess);
  }

  if (navigationItem === "business.railway_wagons") {
    return isRailwayWagonRole(level)
      ? Array.from(new Set([
          ...base,
          railwayWagonRoleCapabilities[level],
        ])) as AccountCapability[]
      : base;
  }

  return base;
}

export function readRawMaterialWarehouseReviewAccess(
  capabilities: AccountCapability[],
) {
  return capabilities.includes("business.review_raw_material_warehouse");
}

/** Отдельный тумблер блока «Посетители» в Обзоре, поверх авто-вывода из вкладок. */
export function readOverviewVisitorsAccess(
  capabilities: AccountCapability[],
) {
  return capabilities.includes("business.view_overview_visitors");
}

export function resolveNavigationForPosition(
  navigationItems: AccountNavigationItem[],
  adminNavigationItems: readonly AccountNavigationItem[],
) {
  const workingNavigationItems = navigationItems.filter((item) =>
    nonAdminNavigationItems.includes(item),
  );

  return Array.from(new Set([
    ...workingNavigationItems,
    ...readAdminNavigationItems(adminNavigationItems),
  ]));
}

export function isBoardAssignmentAccess(
  value: unknown,
): value is BoardAssignmentAccess {
  return boardAssignmentAccessLevels.includes(value as BoardAssignmentAccess);
}

export function readBoardAssignmentAccess(
  capabilities: AccountCapability[],
  navigationItems: AccountNavigationItem[],
): BoardAssignmentAccess {
  if (!navigationItems.includes("business.board_assignments")) {
    return "none";
  }
  if (capabilities.includes("business.review_board_assignments")) {
    return "review";
  }
  if (capabilities.includes("business.create_board_assignments")) {
    return "create";
  }
  return "view";
}

function getDefaultBoardAssignmentAccess(
  position: AccountPosition,
): BoardAssignmentAccess {
  if (
    position === "board_chair" ||
    position === "board_deputy_chair" ||
    position === "board_assignment_reviewer"
  ) {
    return "review";
  }
  if (position === "board_member") {
    return "create";
  }
  return "view";
}

export function isAdminNavigationItem(item: AccountNavigationItem) {
  return navigationItemsByAccountType.admin.includes(item);
}

export function hasAdminNavigationItems(
  navigationItems: AccountNavigationItem[],
) {
  return navigationItems.some(isAdminNavigationItem);
}

export function hasSameAdminNavigationItems(
  left: AccountNavigationItem[],
  right: AccountNavigationItem[],
) {
  const leftItems = new Set(left.filter(isAdminNavigationItem));
  const rightItems = new Set(right.filter(isAdminNavigationItem));

  return (
    leftItems.size === rightItems.size &&
    Array.from(leftItems).every((item) => rightItems.has(item))
  );
}

export function validatePositionNavigationItems(
  navigationItems: AccountNavigationItem[],
) {
  const allowed = new Set(nonAdminNavigationItems);

  return navigationItems.every((item) => allowed.has(item));
}
