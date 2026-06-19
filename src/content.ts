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
  state: "loading" | "ready" | "waiting" | "empty" | "error" | "locked";
  detail: string;
};

export type RoleWorkspaceCopy = {
  eyebrow: string;
  title: string;
  lead: string;
  boundaryValue: string;
};

export const shellCopy = {
  productName: "SMB Monitor",
  visualDirection: "Industrial Finance Operations",
  referencePreview:
    "/Users/artemiz/.codex/generated_images/019edad9-6b9e-7f22-96f4-69e15e644aed/ig_047c9b30a9c8b2c9016a33f67fc18081919a778fdad4532cfe.png",
  serverStatus: "Серверный профиль не подключён",
  serverStatusDetail:
    "Интерфейс показывает только структуру. Бизнес-данные, права и аналитика должны прийти из backend access/profile.",
  accessProfileLoading: "Запрашиваем /api/access/profile",
  accessProfileReady: "Серверный профиль получен",
  accessProfileEmpty: "Профиль доступа пуст",
  accessProfileError: "Серверный профиль недоступен",
  accountSelectorLabel: "Бизнес-аккаунт",
  accountSelectorPlaceholder: "Будет выбран из серверного ответа",
  accountSelectorLoading: "Запрашиваем список бизнесов",
  accountSelectorEmpty: "Сервер не вернул доступные бизнесы",
  accountTypeLabel: "Тип аккаунта выдаёт сервер",
  authTitle: "Выбор серверного доступа",
  authLead:
    "Временное dev-окно авторизации. Кнопка создаёт серверную сессию, после чего интерфейс заново запрашивает /api/access/profile.",
  authLoading: "Проверяем текущую server session.",
  sessionError: "Не удалось обновить dev-сессию.",
  changeAccess: "Сменить доступ",
  workspaceTitle: "Операционный контур",
  workspaceLead:
    "Каркас подготовлен для KPI, форм, подтверждений, уведомлений и администрирования без клиентских бизнес-фикстур.",
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
    description: "Видит операционную статистику, очереди и бизнес-состояния.",
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
    description: "Заполняет диспетчерскую форму для серверной истории владельца.",
    scope: "dispatcher form",
  },
  {
    accountType: "admin",
    label: "Администратор",
    description: "Видит все рабочие зоны, логи, отладку и dev-состояния.",
    scope: "platform access",
  },
];

export const navigationItemsByAccountType: Record<AccountType, NavigationItem[]> = {
  admin: [
    {
      label: "Платформа",
      description: "Все бизнес-контуры и доступы",
      state: "active",
    },
    {
      label: "Пользователи",
      description: "Управление аккаунтами",
      state: "pending",
    },
    {
      label: "Логи",
      description: "Технические события",
      state: "pending",
    },
    {
      label: "Отладка",
      description: "Dev-функции сервера",
      state: "pending",
    },
  ],
  business_owner: [
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
      label: "Диспетчерская",
      description: "Live-история отправленных данных",
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
      description: "Диспетчерская отправка",
      state: "active",
    },
  ],
};

export const roleWorkspaceCopy: Record<AccountType, RoleWorkspaceCopy> = {
  admin: {
    eyebrow: "platform control",
    title: "Административная рабочая поверхность",
    lead:
      "Администратор видит все зоны продукта и технические dev-состояния, но реальные действия всё равно должны подтверждаться сервером.",
    boundaryValue: "platform server",
  },
  business_owner: {
    eyebrow: "business operations",
    title: "Операционный контур владельца",
    lead:
      "Владелец видит текущий shell мониторинга бизнеса: серверные статусы, очереди, KPI-заготовки и контекст бизнес-аккаунта.",
    boundaryValue: "business server",
  },
  worker: {
    eyebrow: "data entry",
    title: "Форма отправки данных",
    lead:
      "Работник видит только рабочую форму. Сохранение в базу будет серверным действием, когда появится production backend.",
    boundaryValue: "submit server",
  },
  dispatcher: {
    eyebrow: "dispatcher entry",
    title: "Диспетчерская форма",
    lead:
      "Диспетчер заполняет только форму. После подключения удалённого сервера запись уходит в БД и появляется в диспетчерской владельца.",
    boundaryValue: "remote DB",
  },
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
    label: "Диспетчерская",
    description: "Live-история отправок",
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
  {
    accountType: "dispatcher",
    label: "Диспетчер",
    scope: "Форма",
    serverDependency: "dispatcher access",
    emptyState: "Доступ только к диспетчерской форме и отправке на сервер.",
    availableAfterServer: ["форма", "отправка", "статус сервера"],
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
