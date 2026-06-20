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
  productName: "SMB Monitor",
  visualDirection: "Industrial Finance Operations",
  referencePreview:
    "/Users/artemiz/.codex/generated_images/019edad9-6b9e-7f22-96f4-69e15e644aed/ig_047c9b30a9c8b2c9016a33f67fc18081919a778fdad4532cfe.png",
  authTitle: "Выбор серверного доступа",
  authLead:
    "Временное dev-окно авторизации. Кнопка создаёт серверную сессию, после чего интерфейс заново запрашивает /api/access/profile.",
  authLoading: "Проверяем текущую server session.",
  sessionError: "Не удалось обновить dev-сессию.",
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
    description: "Открывает пустой обзор и журнал диспетчерских регистраций.",
    scope: "business access",
  },
  {
    accountType: "worker",
    label: "Работник",
    description: "Видит только форму отправки данных и статус серверной записи.",
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
    description: "Видит серверные права текущего профиля доступа.",
    scope: "platform access",
  },
];

export const navigationItemsByAccountType: Record<AccountType, NavigationItem[]> = {
  admin: [
    {
      label: "Права",
      description: "Серверный профиль доступа",
      state: "active",
    },
  ],
  business_owner: [
    {
      label: "Обзор",
      description: "Пустая рабочая область",
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
      label: "Форма",
      description: "Отправка рабочих данных",
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
