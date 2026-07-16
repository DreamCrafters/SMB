import type {
  AccountNavigationItem,
  AccountPosition,
  AccountType,
} from "./contracts/accounts";

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
  board_member: "Член совета директоров",
  general_director: "Генеральный директор",
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
      label: "Просмотр аккаунта",
      description: "Режимы рабочих кабинетов",
      state: "active",
    },
    {
      id: "admin.accounts",
      label: "Учётные записи",
      description: "Логины, пароли и создание доступов",
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
