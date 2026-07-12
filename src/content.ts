import type { AccountType } from "./contracts/accounts";

export type NavigationItem = {
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
  referencePreview:
    "/Users/artemiz/.codex/generated_images/019edad9-6b9e-7f22-96f4-69e15e644aed/ig_047c9b30a9c8b2c9016a33f67fc18081919a778fdad4532cfe.png",
  authTitle: "Выбор доступа",
  authLead: "Выберите роль для проверки интерфейса.",
  authLoading: "Проверяем вход.",
  sessionError: "Не удалось войти.",
};

export const accountTypeLabels: Record<AccountType, string> = {
  admin: "Администратор",
  business_owner: "Владелец бизнеса",
  worker: "Работник",
  dispatcher: "Диспетчер",
};

export const authOptions: AuthOption[] = [
  {
    accountType: "business_owner",
    label: "Владелец бизнеса",
    description: "Открывает обзор и журнал диспетчерских регистраций.",
    scope: "business access",
  },
  {
    accountType: "worker",
    label: "Работник",
    description: "Видит только свои рабочие действия.",
    scope: "form access",
  },
  {
    accountType: "dispatcher",
    label: "Диспетчер",
    description: "Выбирает одну из диспетчерских форм и отправляет регистрацию.",
    scope: "dispatcher form",
  },
  {
    accountType: "admin",
    label: "Администратор",
    description: "Просматривает кабинеты и БД.",
    scope: "platform access",
  },
];

export const navigationItemsByAccountType: Record<AccountType, NavigationItem[]> = {
  admin: [
    {
      label: "Просмотр аккаунта",
      description: "Режимы рабочих кабинетов",
      state: "active",
    },
    {
      label: "Учётные записи",
      description: "Логины, пароли и создание доступов",
      state: "pending",
    },
    {
      label: "БД",
      description: "Таблицы и строки сервера",
      state: "pending",
    },
  ],
  business_owner: [
    {
      label: "Обзор",
      description: "Статусы по участкам",
      state: "active",
    },
    {
      label: "Диспетчерская",
      description: "Регистрации, фильтры и счётчики",
      state: "pending",
    },
  ],
  worker: [
    {
      label: "Работа",
      description: "Рабочие формы отдельно",
      state: "active",
    },
  ],
  dispatcher: [
    {
      label: "Форма",
      description: "Выбор и отправка регистрации",
      state: "active",
    },
  ],
};
