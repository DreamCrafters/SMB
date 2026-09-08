import type {
  AccountNavigationItem,
  AccountPosition,
  AccountType,
  BoardAssignmentAccess,
} from "./contracts/accounts";
import type { RailwayWagonAccess } from "./contracts/railwayWagons";

export type NavigationItem = {
  id: AccountNavigationItem;
  label: string;
  description: string;
  state: "active" | "locked" | "pending";
};

export type AuthOption = {
  accountType: AccountType;
  label: string;
  description: string;
  scope: string;
};

/**
 * Уровень внутри вкладки «Поручения Совета директоров». Сама вкладка выдаётся
 * галочкой, поэтому подпись уровня короткая и не повторяет название вкладки.
 */
export const boardAssignmentAccessOptions: ReadonlyArray<{
  id: Exclude<BoardAssignmentAccess, "none">;
  label: string;
}> = [
  { id: "view", label: "Только просмотр" },
  { id: "create", label: "Просмотр и создание поручений" },
  { id: "execute", label: "Исполнение и отправка на проверку" },
  { id: "review", label: "Создание, приёмка и возврат на доработку" },
];

/**
 * Роль должности в разделе «ЖД Вагоны»: этапы заявки заполняют разные
 * должности, поэтому у вкладки есть ещё и уровень.
 */
export const railwayWagonAccessOptions: ReadonlyArray<{
  id: Exclude<RailwayWagonAccess, "none">;
  label: string;
}> = [
  { id: "view", label: "Только просмотр" },
  { id: "sales", label: "Менеджер по продажам" },
  { id: "carrier", label: "Сотрудник по работе с РЖД" },
  { id: "logistics", label: "Директор по логистике" },
  { id: "dispatcher", label: "Диспетчер" },
];

/**
 * Вкладки, где доступ делится на уровни: галочка выдаёт саму вкладку, а
 * выпадающий список рядом — уровень внутри неё. Каталог общий для формы
 * должности и массового переключателя доступа.
 */
export const navigationAccessLevels: Partial<Record<AccountNavigationItem, {
  title: string;
  options: ReadonlyArray<{ id: string; label: string }>;
}>> = {
  "business.board_assignments": {
    title: "Уровень доступа",
    options: boardAssignmentAccessOptions,
  },
  "business.railway_wagons": {
    title: "Роль в разделе",
    options: railwayWagonAccessOptions,
  },
};

export const shellCopy = {
  productName: "НМОУ Вектор",
  visualDirection: "Industrial Finance Operations",
  authTitle: "Выбор доступа",
  authLead: "Выберите должность для проверки интерфейса.",
  authLoading: "Проверяем вход.",
  sessionError: "Не удалось войти.",
};

export const accountTypeLabels: Record<AccountType, string> = {
  admin: "Администратор",
  business_owner: "Владелец бизнеса",
  worker: "Работник",
  dispatcher: "Диспетчер",
};

export const accountPositionLabels: Record<string, string> = {
  administrator: "Администратор",
  business_owner: "Владелец бизнеса",
  board_chair: "Председатель совета директоров",
  board_deputy_chair: "Заместитель председателя Совета директоров",
  board_assignment_reviewer: "Член Совета директоров с правом приёмки поручений",
  board_member: "Член совета директоров",
  general_director: "Генеральный директор",
  economist: "Экономист",
  laboratory_assistant: "Лаборант",
  worker: "Работник",
  dispatcher: "Диспетчер",
};

export const authOptions: AuthOption[] = [
  {
    accountType: "business_owner",
    label: "Владелец бизнеса",
    description: "Открывает обзор и журнал диспетчерских регистраций.",
    scope: "Руководитель",
  },
  {
    accountType: "worker",
    label: "Работник",
    description: "Видит только свои рабочие действия.",
    scope: "Работник",
  },
  {
    accountType: "dispatcher",
    label: "Диспетчер",
    description: "Выбирает одну из диспетчерских форм и отправляет регистрацию.",
    scope: "Диспетчер",
  },
  {
    accountType: "admin",
    label: "Администратор",
    description: "Просматривает кабинеты и БД.",
    scope: "Администратор",
  },
];

export const navigationItemsByAccountType: Record<AccountType, NavigationItem[]> = {
  admin: [
    {
      id: "admin.account_preview",
      label: "Предпросмотр",
      description: "Аккаунты и рабочие вкладки",
      state: "active",
    },
    {
      id: "admin.accounts",
      label: "Учётные записи",
      description: "Логины, пароли и создание доступов",
      state: "pending",
    },
    {
      id: "admin.navigation",
      label: "Вкладки",
      description: "Порядок вкладок в левой панели",
      state: "pending",
    },
    {
      id: "admin.user_actions",
      label: "Действия пользователей",
      description: "Входы, формы, изменения и просмотры",
      state: "pending",
    },
    {
      id: "admin.database",
      label: "БД",
      description: "Таблицы и строки сервера",
      state: "pending",
    },
  ],
  business_owner: [
    {
      id: "business.overview",
      label: "Обзор",
      description: "Статусы по участкам",
      state: "active",
    },
    {
      id: "business.dispatcher",
      label: "Диспетчерская",
      description: "Регистрации, фильтры и счётчики",
      state: "pending",
    },
    {
      id: "business.work",
      label: "Работа",
      description: "Рабочие формы отдельно",
      state: "active",
    },
    {
      id: "business.production_plan",
      label: "План выработки",
      description: "Месячный план по рабочим дням",
      state: "active",
    },
    {
      id: "business.refractory_shop",
      label: "Огнеупорный цех",
      description: "Три сменные таблицы ОЦ",
      state: "active",
    },
    {
      id: "business.laboratory_results",
      label: "Результаты испытаний",
      description: "Банки и лабораторные журналы",
      state: "active",
    },
    {
      id: "business.laboratory_review",
      label: "Лаборатория",
      description: "Просмотр результатов испытаний",
      state: "active",
    },
    {
      id: "business.board_assignments",
      label: "Поручения Совета директоров",
      description: "Постановка, исполнение и приёмка поручений",
      state: "active",
    },
    {
      id: "business.warehouse_1c",
      label: "Склад 1С",
      description: "Остатки и движение по складу из 1С",
      state: "active",
    },
    {
      id: "business.railway_wagons",
      label: "ЖД Вагоны",
      description: "Заявки на вагоны и движение по маршруту",
      state: "active",
    },
    {
      id: "business.settings",
      label: "Настройки",
      description: "Способы получения сообщений",
      state: "active",
    },
    {
      id: "business.user_actions",
      label: "Действия пользователей",
      description: "Действия сотрудников бизнеса",
      state: "pending",
    },
  ],
  worker: [],
  dispatcher: [
    {
      id: "business.dispatcher_form",
      label: "Форма",
      description: "Выбор и отправка регистрации",
      state: "active",
    },
  ],
};

export const nonAdminNavigationItems: NavigationItem[] = [
  ...navigationItemsByAccountType.business_owner,
  ...navigationItemsByAccountType.dispatcher,
];

export const defaultNavigationOrder: AccountNavigationItem[] = [
  ...nonAdminNavigationItems.map(({ id }) => id),
  ...navigationItemsByAccountType.admin.map(({ id }) => id),
];
