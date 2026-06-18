import type { AccountType } from "./contracts/accounts";

export type NavigationItem = {
  label: string;
  description: string;
  state: "active" | "locked" | "pending";
};

export type AccountShellPanel = {
  accountType: AccountType;
  label: string;
  scope: string;
  serverDependency: string;
  emptyState: string;
  availableAfterServer: string[];
};

export type StatusPanel = {
  label: string;
  state: "waiting" | "empty" | "locked";
  detail: string;
};

export const shellCopy = {
  productName: "SMB Monitor",
  visualDirection: "Industrial Finance Operations",
  referencePreview:
    "/Users/artemiz/.codex/generated_images/019edad9-6b9e-7f22-96f4-69e15e644aed/ig_047c9b30a9c8b2c9016a33f67fc18081919a778fdad4532cfe.png",
  serverStatus: "Серверный профиль не подключён",
  serverStatusDetail:
    "Интерфейс показывает только структуру. Бизнес-данные, права и аналитика должны прийти из backend access/profile.",
  accountSelectorLabel: "Бизнес-аккаунт",
  accountSelectorPlaceholder: "Будет выбран из серверного ответа",
  accountTypeLabel: "Тип аккаунта выдаёт сервер",
  workspaceTitle: "Операционный контур",
  workspaceLead:
    "Каркас подготовлен для KPI, форм, подтверждений, уведомлений и администрирования без клиентских бизнес-фикстур.",
};

export const navigationItems: NavigationItem[] = [
  {
    label: "Обзор",
    description: "Панель бизнеса после ответа сервера",
    state: "active",
  },
  {
    label: "Формы",
    description: "Рабочие отправки и черновики",
    state: "pending",
  },
  {
    label: "Очередь",
    description: "Подтверждения и отклонения",
    state: "pending",
  },
  {
    label: "Аудит",
    description: "История действий и просмотров",
    state: "locked",
  },
  {
    label: "Настройки",
    description: "Доступно только по правам сервера",
    state: "locked",
  },
];

export const accountShellPanels: AccountShellPanel[] = [
  {
    accountType: "admin",
    label: "Администратор",
    scope: "Платформа",
    serverDependency: "platform access",
    emptyState: "Ожидаем серверные права для управления платформой.",
    availableAfterServer: [
      "бизнес-аккаунты",
      "пользователи",
      "интеграции",
      "аудит",
    ],
  },
  {
    accountType: "business_owner",
    label: "Владелец бизнеса",
    scope: "Выбранный бизнес",
    serverDependency: "business access",
    emptyState: "Ожидаем выбор бизнеса и разрешённую аналитику.",
    availableAfterServer: [
      "общая статистика",
      "отделы",
      "периоды",
      "уведомления",
    ],
  },
  {
    accountType: "worker",
    label: "Работник",
    scope: "Отдел или должность",
    serverDependency: "department access",
    emptyState: "Ожидаем доступные формы и рабочие уведомления.",
    availableAfterServer: [
      "формы",
      "отправки",
      "статусы",
      "уведомления",
    ],
  },
];

export const statusPanels: StatusPanel[] = [
  {
    label: "Профиль доступа",
    state: "waiting",
    detail: "GET access/profile",
  },
  {
    label: "Бизнес-данные",
    state: "empty",
    detail: "не загружены на клиент",
  },
  {
    label: "Защищённые действия",
    state: "locked",
    detail: "проверяются сервером",
  },
];
