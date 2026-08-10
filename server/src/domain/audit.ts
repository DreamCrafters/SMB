import { dispatcherForms, type DispatcherFormId } from "./dispatcherForms.js";
import {
  hasProfileCapability,
  type AccountNavigationItem,
  type ServerUserProfile,
} from "./auth.js";
import {
  auditEventCategories,
  type AuditEventAction,
  type AuditEventCategory,
  type AuditEventOutcome,
  type AuditTargetType,
} from "../contracts/audit.js";

export {
  auditEventActions,
  auditEventCategories,
  auditTargetTypes,
} from "../contracts/audit.js";
export type {
  AuditEventAction,
  AuditEventCategory,
  AuditEventOutcome,
  AuditTargetType,
} from "../contracts/audit.js";

export type AuditEventDetail = {
  label: string;
  value: string;
};

export type AuditActorSnapshot = {
  userId: string;
  accountId: string;
  displayName: string;
  positionDisplayName: string;
  login?: string;
};

export type AuditEventDraft = {
  actor: AuditActorSnapshot;
  category: AuditEventCategory;
  action: AuditEventAction;
  outcome?: AuditEventOutcome;
  summary: string;
  details?: AuditEventDetail[];
  targetType?: AuditTargetType;
  targetId?: string;
  occurredAt?: Date;
};

export type AuditScreen = {
  id: string;
  title: string;
};

const navigationScreens: readonly AuditScreen[] = [
  { id: "admin.account_preview", title: "Предпросмотр" },
  { id: "admin.accounts", title: "Учётные записи" },
  { id: "admin.navigation", title: "Вкладки" },
  { id: "admin.database", title: "БД" },
  { id: "admin.user_actions", title: "Действия пользователей" },
  { id: "business.overview", title: "Обзор" },
  { id: "business.dispatcher", title: "Диспетчерская" },
  { id: "business.work", title: "Работа" },
  { id: "business.production_plan", title: "План выработки" },
  { id: "business.refractory_shop", title: "Огнеупорный цех" },
  { id: "business.laboratory_results", title: "Результаты испытаний" },
  { id: "business.laboratory_review", title: "Лаборатория" },
  { id: "business.settings", title: "Настройки" },
  { id: "business.board_assignments", title: "Поручения Совета директоров" },
  { id: "business.user_actions", title: "Действия пользователей" },
  { id: "business.dispatcher_form", title: "Выбор диспетчерской формы" },
];

const dispatcherFormScreens: readonly AuditScreen[] = [
  ...dispatcherForms.map((form) => ({
    id: `dispatcher.form.${form.id}`,
    title: `Форма: ${form.title}`,
  })),
  {
    id: "dispatcher.refractory_review",
    title: "Подтверждение таблиц огнеупорного цеха",
  },
];

const auditScreenById = new Map(
  [...navigationScreens, ...dispatcherFormScreens].map((screen) => [
    screen.id,
    screen,
  ]),
);

const requiredNavigationByScreenId = new Map<string, AccountNavigationItem>([
  ...navigationScreens.map(
    (screen) => [screen.id, screen.id as AccountNavigationItem] as const,
  ),
  ...dispatcherFormScreens.map(
    (screen) => [screen.id, "business.dispatcher_form"] as const,
  ),
]);

const adminPreviewScreenIds = new Set([
  ...navigationScreens
    .filter((screen) => screen.id.startsWith("business."))
    .map((screen) => screen.id),
  ...dispatcherFormScreens.map((screen) => screen.id),
]);

export function buildAuditActor(
  profile: ServerUserProfile,
  login?: string,
): AuditActorSnapshot {
  return {
    userId: profile.userId,
    accountId: profile.activeAccess.accountId,
    displayName: profile.displayName,
    positionDisplayName: profile.activeAccess.positionDisplayName,
    ...(login === undefined || login.trim().length === 0
      ? {}
      : { login: login.trim() }),
  };
}

export function resolveAuditWindowStart(now = new Date()) {
  const dayOfMonth = now.getUTCDate();
  const result = new Date(now.getTime());

  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() - 3);

  const lastDayOfTargetMonth = new Date(
    Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0),
  ).getUTCDate();

  result.setUTCDate(Math.min(dayOfMonth, lastDayOfTargetMonth));

  return result;
}

export function buildDispatcherSubmissionAuditDetails(
  formId: DispatcherFormId,
  payload: Record<string, string>,
): AuditEventDetail[] {
  const form = dispatcherForms.find((item) => item.id === formId);

  if (form === undefined) {
    return [];
  }

  const formDetails = form.fields.flatMap((field) => {
    const value = payload[field.name];

    return typeof value === "string" && value.length > 0
      ? [{ label: field.label, value }]
      : [];
  });

  if (formId !== "production") {
    return formDetails;
  }

  const dynamicDetails = Object.entries(payload).flatMap(
    ([fieldName, value]) => {
      const match = /^(forming|sorting|unformed|chamotte)(Brand|Fact)([1-9]\d?)$/u.exec(
        fieldName,
      );

      if (match === null || Number(match[3]) > 50 || value.length === 0) {
        return [];
      }

      const section = {
        forming: "Формовка",
        sorting: "Сортировка",
        unformed: "Неформованная продукция",
        chamotte: "Цех обжига шамота",
      }[match[1]];
      const metric = match[2] === "Brand" ? "Марка" : "Факт";

      return [{ label: `${section} — ${metric} ${match[3]}`, value }];
    },
  );

  return [...formDetails, ...dynamicDetails];
}

export function readAuditScreen(value: unknown): AuditScreen | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  return auditScreenById.get(value);
}

export function canProfileViewAuditScreen(
  profile: ServerUserProfile,
  screen: AuditScreen,
) {
  const requiredNavigation = requiredNavigationByScreenId.get(screen.id);

  if (
    requiredNavigation !== undefined &&
    profile.activeAccess.navigationItems.includes(requiredNavigation)
  ) {
    return true;
  }

  return (
    adminPreviewScreenIds.has(screen.id) &&
    profile.activeAccess.navigationItems.includes("admin.account_preview") &&
    hasProfileCapability(profile, "platform.manage_users")
  );
}

export function isAuditEventCategory(
  value: unknown,
): value is AuditEventCategory {
  return auditEventCategories.includes(value as AuditEventCategory);
}
