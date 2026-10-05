/**
 * Задача 135: модуль «Инициативы Коллегии». Проектная основа и решения —
 * `docs/collegium-initiatives.md`.
 */

export const collegiumInitiativesNavigationItem =
  "business.collegium_initiatives";

/**
 * Уровень вкладки — одно иерархическое значение, как у поручений СД:
 * старший уровень включает права младших, поэтому объединение должностей
 * даёт максимум, а уровень читается обратно по старшей capability.
 */
export const collegiumInitiativeAccessLevels = [
  "none",
  "view",
  "participant",
  "secretary",
  "chair",
] as const;

export type CollegiumInitiativeAccess =
  (typeof collegiumInitiativeAccessLevels)[number];

/** Подписи уровней для формы должности и журнала действий. */
export const collegiumInitiativeAccessOptions: ReadonlyArray<{
  id: Exclude<CollegiumInitiativeAccess, "none">;
  label: string;
}> = [
  { id: "view", label: "Только просмотр" },
  { id: "participant", label: "Участник: идеи и комментарии" },
  { id: "secretary", label: "Секретарь: оценка, повестка, протокол" },
  { id: "chair", label: "Председатель: допуск и утверждение протокола" },
];

export const collegiumInitiativeCapabilities = [
  "business.view_collegium_initiatives",
  "business.participate_collegium_initiatives",
  "business.manage_collegium_initiatives",
  "business.approve_collegium_initiatives",
] as const;

export type CollegiumInitiativeCapability =
  (typeof collegiumInitiativeCapabilities)[number];

const capabilityByLevel = {
  view: "business.view_collegium_initiatives",
  participant: "business.participate_collegium_initiatives",
  secretary: "business.manage_collegium_initiatives",
  chair: "business.approve_collegium_initiatives",
} as const satisfies Record<
  Exclude<CollegiumInitiativeAccess, "none">,
  CollegiumInitiativeCapability
>;

const rankedLevels = ["view", "participant", "secretary", "chair"] as const;

export function isCollegiumInitiativeAccess(
  value: unknown,
): value is CollegiumInitiativeAccess {
  return collegiumInitiativeAccessLevels.includes(
    value as CollegiumInitiativeAccess,
  );
}

/** Кумулятивный набор capability уровня: `chair` включает все младшие. */
export function resolveCollegiumInitiativeCapabilities(
  access: CollegiumInitiativeAccess,
): CollegiumInitiativeCapability[] {
  if (access === "none") return [];
  const rank = rankedLevels.indexOf(access);
  return rankedLevels
    .slice(0, rank + 1)
    .map((level) => capabilityByLevel[level]);
}

/** Уровень читается по старшей capability; без вкладки уровня нет. */
export function readCollegiumInitiativeAccess(
  capabilities: readonly string[],
  navigationItems: readonly string[],
): CollegiumInitiativeAccess {
  if (!navigationItems.includes(collegiumInitiativesNavigationItem)) {
    return "none";
  }
  for (const level of [...rankedLevels].reverse()) {
    if (capabilities.includes(capabilityByLevel[level])) return level;
  }
  return "view";
}

export const collegiumInitiativeStatuses = [
  "draft",
  "preliminary_review",
  "rework",
  "ready",
  "on_agenda",
  "in_discussion",
  "needs_elaboration",
  "approved_pilot",
  "approved_implementation",
  "board_referral",
  "in_progress",
  "result_confirmation",
  "done_confirmed",
  "done_unconfirmed",
  "suspended",
  "rejected",
  "closed",
] as const;

export type CollegiumInitiativeStatus =
  (typeof collegiumInitiativeStatuses)[number];

export const collegiumInitiativeStatusLabels: Record<
  CollegiumInitiativeStatus,
  string
> = {
  draft: "Черновик",
  preliminary_review: "На предварительной оценке",
  rework: "На доработке",
  ready: "Готова к рассмотрению",
  on_agenda: "В повестке Коллегии",
  in_discussion: "На обсуждении",
  needs_elaboration: "Требуется дополнительная проработка",
  approved_pilot: "Одобрена к пилоту",
  approved_implementation: "Одобрена к внедрению",
  board_referral: "Подлежит вынесению на СД",
  in_progress: "В реализации",
  result_confirmation: "На подтверждении результата",
  done_confirmed: "Реализована с подтверждённым эффектом",
  done_unconfirmed: "Реализована без подтверждённого эффекта",
  suspended: "Приостановлена",
  rejected: "Отклонена",
  closed: "Закрыта",
};

/** Стандартные решения на контрольных точках (ТЗ 5.2). */
export const collegiumDecisions = [
  "accept_elaboration",
  "return_for_rework",
  "pilot",
  "implement",
  "create_assignments",
  "suspend",
  "reject",
  "board_materials",
  "confirm_effect",
  "effect_unconfirmed",
  "close",
] as const;

export type CollegiumDecision = (typeof collegiumDecisions)[number];

export const collegiumDecisionLabels: Record<CollegiumDecision, string> = {
  accept_elaboration: "Принять к дальнейшей проработке",
  return_for_rework: "Вернуть на доработку",
  pilot: "Провести пилот",
  implement: "Утвердить внедрение",
  create_assignments: "Создать поручения",
  suspend: "Приостановить",
  reject: "Отклонить",
  board_materials: "Подготовить материалы для Совета директоров",
  confirm_effect: "Подтвердить эффект",
  effect_unconfirmed: "Признать эффект неподтверждённым",
  close: "Закрыть инициативу",
};

/** Что инициатор может запросить у Коллегии в карточке. */
export const collegiumRequestedDecisions = [
  "accept_elaboration",
  "pilot",
  "implement",
  "create_assignments",
  "board_materials",
] as const satisfies readonly CollegiumDecision[];

export type CollegiumRequestedDecision =
  (typeof collegiumRequestedDecisions)[number];

export const collegiumReferenceKinds = ["direction", "effect_type", "risk_level", "site", "kpi"] as const;
export type CollegiumReferenceKind = (typeof collegiumReferenceKinds)[number];

export const collegiumReferenceKindLabels: Record<CollegiumReferenceKind, string> = {
  direction: "Направления",
  effect_type: "Типы эффекта",
  risk_level: "Уровни риска",
  site: "Участки",
  kpi: "KPI и единицы измерения",
};

/**
 * Значение справочника. Архивное не предлагается в новых правках, но остаётся
 * в старых карточках; значимость — только у уровней риска, единица — у KPI.
 */
export type CollegiumReferenceOption = {
  code: string;
  label: string;
  archived?: boolean;
  significant?: boolean;
  unit?: string;
};

export type CollegiumReference = Record<
  CollegiumReferenceKind,
  CollegiumReferenceOption[]
>;

export const collegiumCostVatOptions = ["with_vat", "without_vat"] as const;
export type CollegiumCostVat = (typeof collegiumCostVatOptions)[number];
export const collegiumCostVatLabels: Record<CollegiumCostVat, string> = {
  with_vat: "с НДС",
  without_vat: "без НДС",
};

export const collegiumRecurringPeriods = ["month", "year"] as const;
export type CollegiumRecurringPeriod =
  (typeof collegiumRecurringPeriods)[number];
export const collegiumRecurringPeriodLabels: Record<
  CollegiumRecurringPeriod,
  string
> = {
  month: "в месяц",
  year: "в год",
};

export const collegiumInitiativeRoleFields = [
  "ownerId",
  "executorId",
  "executionControllerId",
  "effectControllerId",
] as const;

export type CollegiumInitiativeRoleField =
  (typeof collegiumInitiativeRoleFields)[number];

export const maxCollegiumInitiativeRisks = 3;

/** Период ожидаемого эффекта; прежний свободный текст остаётся только для показа. */
export const collegiumEffectPeriods = ["month", "quarter", "year", "one_time"] as const;
export type CollegiumEffectPeriod = (typeof collegiumEffectPeriods)[number];
export const collegiumEffectPeriodLabels: Record<CollegiumEffectPeriod, string> = {
  month: "в месяц",
  quarter: "в квартал",
  year: "в год",
  one_time: "разово",
};

export const collegiumYesNoOptions = ["yes", "no"] as const;
export type CollegiumYesNo = (typeof collegiumYesNoOptions)[number];
export const collegiumYesNoLabels: Record<CollegiumYesNo, string> = { yes: "да", no: "нет" };

/** Риск с уровнем из справочника `risk_level`; старые записи — без уровня. */
export type CollegiumRiskInput = { text: string; levelCode: string };
export type CollegiumRisk = CollegiumRiskInput & { levelLabel: string };

/**
 * Редактируемые поля экспресс-карты (ТЗ 6.2). Суммы — канонический текст
 * `1234.50` или пустая строка; люди — `account:<userId>` или пустая строка.
 */
export type CollegiumInitiativeCardInput = {
  title: string;
  initiatorId: string;
  directionCode: string;
  effectTypeCodes: string[];
  problem: string;
  baselineValue: string;
  baselinePeriod: string;
  baselineSource: string;
  solution: string;
  changeScope: string;
  expectedEffectAmount: string;
  /** Код `CollegiumEffectPeriod`; в старых карточках — свободный текст. */
  expectedEffectPeriod: string;
  expectedEffectKind: string;
  effectMethod: string;
  oneTimeCostAmount: string;
  oneTimeCostVat: CollegiumCostVat | "";
  oneTimeCostSource: string;
  recurringCostAmount: string;
  recurringCostPeriod: CollegiumRecurringPeriod | "";
  capexAmount: string;
  internalResources: string;
  ownerId: string;
  executorId: string;
  executionControllerId: string;
  effectControllerId: string;
  plannedStart: string;
  plannedResult: string;
  kpiCriterion: string;
  kpiSource: string;
  risks: CollegiumRiskInput[];
  requestedDecision: CollegiumRequestedDecision | "";
  /** Входы ТЗ 7.2: меняется технология, рецептура, спецификация или контроль качества. */
  changesTechnology: CollegiumYesNo | "";
  /** Новый продукт, рынок или ключевой клиент. */
  newProductOrMarket: CollegiumYesNo | "";
  boardDecisionRequired: CollegiumYesNo | "";
};

/** Текстовые разделы полного паспорта (ТЗ 6.3). */
export const collegiumPassportTextFields = [
  "alternatives",
  "requirements",
  "impacts",
  "dependencies",
  "pilotPlan",
  "pilotStopConditions",
  "requiredAssignments",
  "ceoPosition",
  "draftDecision",
] as const;
export type CollegiumPassportTextField = (typeof collegiumPassportTextFields)[number];

/** Неотрицательные суммы паспорта, ₽; прогноз и постоянные OPEX — в год. */
export const collegiumPassportAmountFields = [
  "revenueForecast",
  "marginalIncomeForecast",
  "costSavingForecast",
  "preventedLossForecast",
  "capex",
  "oneTimeOpex",
  "recurringOpex",
  "internalCosts",
  "workingCapital",
] as const;
export type CollegiumPassportAmountField = (typeof collegiumPassportAmountFields)[number];

/** Сценарии — чистый годовой эффект со знаком, ₽. */
export const collegiumPassportScenarioFields = [
  "scenarioConservative",
  "scenarioBase",
  "scenarioOptimistic",
] as const;
export type CollegiumPassportScenarioField = (typeof collegiumPassportScenarioFields)[number];

/** Показатели ТЗ 11.3, которые можно заменить ручным значением с пояснением. */
export const collegiumEconomicsOverrideFields = ["netAnnualEffect", "paybackMonths", "roiPercent", "npv"] as const;
export type CollegiumEconomicsOverrideField = (typeof collegiumEconomicsOverrideFields)[number];

export const collegiumEconomicsOverrideLabels: Record<CollegiumEconomicsOverrideField, string> = {
  netAnnualEffect: "Чистый годовой эффект, ₽",
  paybackMonths: "Срок окупаемости, мес.",
  roiPercent: "ROI, %",
  npv: "NPV, ₽",
};

export const maxCollegiumScheduleRows = 60;
export const maxCollegiumMilestones = 20;

export type CollegiumPassportScheduleRow = {
  /** `ГГГГ-ММ`. */
  month: string;
  /** Затраты месяца, ₽. */
  cost: string;
  /** Эффект месяца, ₽. */
  effect: string;
};

export type CollegiumPassport = Record<CollegiumPassportTextField, string> &
  Record<CollegiumPassportAmountField, string> &
  Record<CollegiumPassportScenarioField, string> & {
    schedule: CollegiumPassportScheduleRow[];
    milestones: Array<{ date: string; text: string }>;
    overrides: Partial<Record<CollegiumEconomicsOverrideField, { value: string; explanation: string }>>;
  };

export const collegiumPassportFieldLabels: Record<
  CollegiumPassportTextField | CollegiumPassportAmountField | CollegiumPassportScenarioField | "schedule" | "milestones",
  string
> = {
  alternatives: "Альтернативы, включая «ничего не делать»",
  requirements: "Договоры, закупки, согласования, разрешения, сертификация, испытания",
  impacts: "Влияние на ТБ, промышленную безопасность, экологию и качество",
  dependencies: "Зависимости от поставщиков, клиентов, оборудования, персонала, финансирования",
  pilotPlan: "План пилота",
  pilotStopConditions: "Стоп-условия пилота",
  requiredAssignments: "Необходимые поручения",
  ceoPosition: "Позиция генерального директора",
  draftDecision: "Проект решения Коллегии или Совета директоров",
  revenueForecast: "Прогноз выручки в год, ₽",
  marginalIncomeForecast: "Дополнительный маржинальный доход в год, ₽",
  costSavingForecast: "Экономия затрат в год, ₽",
  preventedLossForecast: "Предотвращённые потери в год, ₽",
  capex: "CAPEX, ₽",
  oneTimeOpex: "Разовые OPEX, ₽",
  recurringOpex: "Постоянные OPEX в год, ₽",
  internalCosts: "Внутренние затраты, ₽",
  workingCapital: "Потребность в оборотном капитале, ₽",
  scenarioConservative: "Консервативный сценарий: чистый эффект в год, ₽",
  scenarioBase: "Базовый сценарий: чистый эффект в год, ₽",
  scenarioOptimistic: "Оптимистичный сценарий: чистый эффект в год, ₽",
  schedule: "График затрат и эффекта по месяцам",
  milestones: "План внедрения с контрольными точками",
};

export type CollegiumPassportSaveRequest = {
  revision: number;
  passport: CollegiumPassport;
  reason?: string;
  comment?: string;
};

/** Снимок хранит и код, и подпись справочника, чтобы история не менялась. */
export type CollegiumInitiativeCard = Omit<CollegiumInitiativeCardInput, "risks"> & {
  directionLabel: string;
  effectTypeLabels: string[];
  risks: CollegiumRisk[];
  /** Полный паспорт (ТЗ 6.3); сохраняется отдельным запросом. */
  passport?: CollegiumPassport;
};

export type CollegiumPerson = {
  id: string;
  displayName: string;
  position: string;
  /** Действующий аккаунт с вкладкой инициатив. */
  hasInitiativesTab: boolean;
};

export type CollegiumInitiative = {
  id: string;
  number: string;
  status: CollegiumInitiativeStatus;
  revision: number;
  card: CollegiumInitiativeCard;
  workflow: CollegiumInitiativeWorkflow;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
};

export type CollegiumInitiativeRevision = {
  revision: number;
  createdAt: string;
  authorDisplayName: string;
  status: CollegiumInitiativeStatus;
  /** `passport` — изменён полный паспорт. */
  changedFields: Array<keyof CollegiumInitiativeCardInput | "passport">;
  reason: string;
  comment: string;
  card: CollegiumInitiativeCard;
  /** Смена статуса; правка карточки события не имеет. */
  event?: CollegiumInitiativeEvent;
};

export type CollegiumInitiativePermissions = {
  canView: boolean;
  canParticipate: boolean;
  canManage: boolean;
  canApprove: boolean;
};

export type CollegiumInitiativeListResponse = {
  initiatives: CollegiumInitiative[];
  people: CollegiumPerson[];
  reference: CollegiumReference;
  permissions: CollegiumInitiativePermissions;
  /** Заседания для фильтра «Заседание Коллегии». */
  meetings: Array<{ id: string; number: string; meetingDate: string }>;
  /** Инициативы с просроченными связанными поручениями. */
  overdueIds: string[];
  /** Инициативы, которым по ТЗ 7.2 нужен полный паспорт. */
  passportRequiredIds: string[];
};

/**
 * Расчёт по экспресс-карте (ТЗ 11.3). Суммы — рубли `1234.50` в год (чистый
 * эффект со знаком), пустая строка — не определено (нет периода или затрат).
 */
export type CollegiumEconomics = {
  annualEffect: string;
  annualRecurringCost: string;
  netAnnualEffect: string;
  oneTimeCosts: string;
  /** `not_paying` — чистый эффект ≤ 0 при разовых затратах; `none` — не определено. */
  paybackStatus: "payback" | "not_paying" | "none";
  /** Месяцев, один знак после запятой. */
  paybackMonths: string;
  /** Процентов, один знак после запятой, со знаком. */
  roiPercent: string;
  /** Расчёт по полному паспорту, если в нём есть прогноз эффекта. */
  source: "express" | "passport";
  /** NPV, ₽; пусто — не требуется или не задана ставка. */
  npv: string;
  /** Срок реализации или график длиннее 12 месяцев. */
  npvRequired: boolean;
  /** Ручные значения паспорта с пояснением; расчётные остаются выше. */
  overrides: CollegiumPassport["overrides"];
};

export const collegiumPassportReasonCodes = [
  "one_time_cost",
  "capex",
  "technology",
  "new_product",
  "significant_risk",
  "payback",
  "board_decision",
  "status",
] as const;
export type CollegiumPassportReasonCode = (typeof collegiumPassportReasonCodes)[number];

/** Причина, по которой инициативе нужен полный паспорт (ТЗ 7.2). */
export type CollegiumPassportReason = { code: CollegiumPassportReasonCode; label: string };

export type CollegiumInitiativeDetailResponse = {
  initiative: CollegiumInitiative;
  revisions: CollegiumInitiativeRevision[];
  comments: CollegiumInitiativeComment[];
  attachments: CollegiumAttachment[];
  canEdit: boolean;
  canAttach: boolean;
  canComment: boolean;
  canResolveComments: boolean;
  /** Действия маршрута, доступные этому пользователю сейчас. */
  actions: CollegiumInitiativeAction[];
  /** Подписи незаполненных полей фильтра допуска; пусто — карточка готова. */
  missingAdmissionFields: string[];
  linkedAssignments: CollegiumLinkedAssignment[];
  summaryStatus: CollegiumSummaryStatus;
  /** Право отправки реестра Коллегии и подходящий статус инициативы. */
  canCreateAssignments: boolean;
  canRecordResult: boolean;
  economics: CollegiumEconomics;
  /** Пусто — полный паспорт не требуется. */
  passportReasons: CollegiumPassportReason[];
  /** Незаполненные разделы паспорта по причинам; пусто — паспорт достаточен. */
  passportGaps: string[];
  canEditPassport: boolean;
};

export type CollegiumInitiativeSaveRequest = {
  card: CollegiumInitiativeCardInput;
  /** Ожидаемая ревизия при правке; без неё создаётся новая инициатива. */
  revision?: number;
  reason?: string;
  comment?: string;
};

/** Подписи полей для формы, истории правок и списка незаполненных. */
export const collegiumInitiativeFieldLabels: Record<
  keyof CollegiumInitiativeCardInput,
  string
> = {
  title: "Наименование идеи",
  initiatorId: "Инициатор",
  directionCode: "Направление",
  effectTypeCodes: "Тип эффекта",
  problem: "Описание проблемы / возможности",
  baselineValue: "Текущее состояние / базовая линия",
  baselinePeriod: "Период базовой линии",
  baselineSource: "Источник подтверждения",
  solution: "Предлагаемое решение",
  changeScope: "Что меняется",
  expectedEffectAmount: "Ожидаемый эффект, ₽",
  expectedEffectPeriod: "Период эффекта",
  expectedEffectKind: "Вид эффекта",
  effectMethod: "Методика расчёта",
  oneTimeCostAmount: "Разовые затраты, ₽",
  oneTimeCostVat: "НДС разовых затрат",
  oneTimeCostSource: "Источник финансирования",
  recurringCostAmount: "Постоянные затраты, ₽",
  recurringCostPeriod: "Период постоянных затрат",
  capexAmount: "CAPEX, ₽",
  internalResources: "Требуемые внутренние ресурсы",
  ownerId: "Владелец результата",
  executorId: "Предлагаемый исполнитель",
  executionControllerId: "Контролёр исполнения",
  effectControllerId: "Контролёр эффекта",
  plannedStart: "Плановая дата начала",
  plannedResult: "Плановая дата результата",
  kpiCriterion: "Критерий успеха",
  kpiSource: "Источник KPI",
  risks: "Топ-3 риска",
  requestedDecision: "Что требуется от Коллегии",
  changesTechnology: "Меняется технология, рецептура, спецификация или контроль качества",
  newProductOrMarket: "Новый продукт, рынок или ключевой клиент",
  boardDecisionRequired: "Требуется решение Совета директоров",
};

export const collegiumInitiativesApiPath = "/api/collegium-initiatives";

/** Действия маршрута среза 2; решения Коллегии применяются протоколом. */
export const collegiumInitiativeActions = [
  "submit_for_review",
  "admit",
  "return_for_rework",
  "suspend",
  "resume",
  "withdraw",
  "board_approve",
  "board_suspend",
  "board_reject",
  "complete_work",
  "confirm_effect",
  "reject_effect",
  "close",
] as const;

export type CollegiumInitiativeAction =
  (typeof collegiumInitiativeActions)[number];

export const collegiumInitiativeActionLabels: Record<
  CollegiumInitiativeAction,
  string
> = {
  submit_for_review: "Отправить на оценку",
  admit: "Допустить к рассмотрению",
  return_for_rework: "Вернуть на доработку",
  suspend: "Приостановить",
  resume: "Возобновить",
  withdraw: "Отозвать черновик",
  board_approve: "СД одобрил внедрение",
  board_suspend: "СД приостановил",
  board_reject: "СД отклонил",
  complete_work: "Работы завершены",
  confirm_effect: "Подтвердить эффект",
  reject_effect: "Эффект не подтверждён",
  close: "Закрыть инициативу",
};

/** Действия, для которых комментарий обязателен (ТЗ 5.2). */
export const collegiumActionsRequiringComment: readonly CollegiumInitiativeAction[] = [
  "return_for_rework",
  "suspend",
  "withdraw",
  "board_suspend",
  "board_reject",
  "reject_effect",
];

export type CollegiumReworkRequest = {
  remarks: string[];
  responsibleId: string;
  dueDate: string;
  readinessCriterion: string;
};

export type CollegiumInitiativeActionRequest = {
  action: CollegiumInitiativeAction;
  revision: number;
  comment?: string;
  rework?: CollegiumReworkRequest;
};

/** Служебное состояние маршрута, которое не входит в карточку. */
export type CollegiumInitiativeWorkflow = {
  /**
   * Первая отправка на оценку. До неё инициатива — личный черновик автора,
   * даже если её приостановили или отозвали.
   */
  submittedAt?: string;
  suspendedFrom?: CollegiumInitiativeStatus;
  result?: CollegiumInitiativeResult;
  /** Снимок фактического результата на момент подтверждения эффекта. */
  effectConfirmation?: {
    confirmedByDisplayName: string;
    confirmedAt: string;
    result: CollegiumInitiativeResult;
  };
  /** Текущий вопрос повестки, пока инициатива `on_agenda`/`in_discussion`. */
  agenda?: { meetingId: string; meetingNumber: string; itemId: string };
  lastDecision?: CollegiumInitiativeLastDecision;
  rework?: CollegiumReworkRequest & {
    requestedByDisplayName: string;
    requestedAt: string;
  };
};

export type CollegiumInitiativeEvent = {
  action: CollegiumInitiativeAction | CollegiumAgendaEvent;
  fromStatus: CollegiumInitiativeStatus;
  toStatus: CollegiumInitiativeStatus;
};

export const collegiumCommentKinds = ["comment", "question", "remark"] as const;
export type CollegiumCommentKind = (typeof collegiumCommentKinds)[number];
export const collegiumCommentKindLabels: Record<CollegiumCommentKind, string> = {
  comment: "Комментарий",
  question: "Вопрос автору",
  remark: "Замечание",
};

export type CollegiumInitiativeComment = {
  id: string;
  kind: CollegiumCommentKind;
  text: string;
  authorUserId: string;
  authorDisplayName: string;
  createdAt: string;
  resolvedAt?: string;
  resolvedByDisplayName?: string;
};

export const collegiumAttachmentLimits = {
  /**
   * mysql2 передаёт файл в SQL шестнадцатеричной строкой вдвое длиннее
   * содержимого: 7 МБ гарантированно укладываются в стандартный
   * `max_allowed_packet` MariaDB 16 МБ при записи и в синхронизации БД.
   */
  maxFileBytes: 7 * 1024 * 1024,
  maxOwnerBytes: 50 * 1024 * 1024,
  maxOwnerItems: 20,
  maxUrlLength: 2000,
  maxLabelLength: 250,
} as const;

export const collegiumAttachmentFileTypes = {
  pdf: { extensions: [".pdf"], contentType: "application/pdf", label: "PDF" },
  docx: {
    extensions: [".docx"],
    contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    label: "DOCX",
  },
  xlsx: {
    extensions: [".xlsx"],
    contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    label: "XLSX",
  },
  png: { extensions: [".png"], contentType: "image/png", label: "PNG" },
  jpeg: { extensions: [".jpg", ".jpeg"], contentType: "image/jpeg", label: "JPEG" },
} as const;

export type CollegiumAttachmentFileType = keyof typeof collegiumAttachmentFileTypes;

export type CollegiumAttachment = {
  id: string;
  kind: "file" | "link";
  label: string;
  fileName?: string;
  fileType?: CollegiumAttachmentFileType;
  sizeBytes?: number;
  url?: string;
  createdByDisplayName: string;
  createdAt: string;
};

/** События повестки в истории инициативы (срез 3). */
export const collegiumAgendaEvents = [
  "add_to_agenda",
  "remove_from_agenda",
  "start_discussion",
  "meeting_decision",
  "meeting_cancelled",
  "assignment_created",
] as const;

export type CollegiumAgendaEvent = (typeof collegiumAgendaEvents)[number];

export const collegiumAgendaEventLabels: Record<CollegiumAgendaEvent, string> = {
  add_to_agenda: "Включена в повестку",
  remove_from_agenda: "Снята с повестки",
  start_discussion: "Начато обсуждение",
  meeting_decision: "Решение Коллегии по протоколу",
  meeting_cancelled: "Заседание отменено",
  assignment_created: "Создано поручение Коллегии",
};

/** Решения, которые Коллегия принимает по вопросу повестки. */
export const collegiumMeetingDecisions = [
  "accept_elaboration",
  "return_for_rework",
  "pilot",
  "implement",
  "board_materials",
  "suspend",
  "reject",
] as const satisfies readonly CollegiumDecision[];

export type CollegiumMeetingDecision = (typeof collegiumMeetingDecisions)[number];

export const collegiumMeetingDecisionStatuses: Record<
  CollegiumMeetingDecision,
  CollegiumInitiativeStatus
> = {
  accept_elaboration: "needs_elaboration",
  return_for_rework: "rework",
  pilot: "approved_pilot",
  implement: "approved_implementation",
  board_materials: "board_referral",
  suspend: "suspended",
  reject: "rejected",
};

export const collegiumMeetingDecisionsRequiringComment: readonly CollegiumMeetingDecision[] = [
  "return_for_rework",
  "suspend",
  "reject",
];

export const collegiumMeetingFormats = ["in_person", "video", "mixed"] as const;
export type CollegiumMeetingFormat = (typeof collegiumMeetingFormats)[number];
export const collegiumMeetingFormatLabels: Record<CollegiumMeetingFormat, string> = {
  in_person: "Очно",
  video: "ВКС",
  mixed: "Смешанно",
};

export const collegiumMeetingStatuses = ["planned", "approved", "cancelled"] as const;
export type CollegiumMeetingStatus = (typeof collegiumMeetingStatuses)[number];
export const collegiumMeetingStatusLabels: Record<CollegiumMeetingStatus, string> = {
  planned: "Запланировано",
  approved: "Протокол утверждён",
  cancelled: "Отменено",
};

export type CollegiumMeetingDetailsInput = {
  meetingDate: string;
  meetingTime: string;
  format: CollegiumMeetingFormat;
  location: string;
  participantIds: string[];
  absentIds: string[];
  quorumNote: string;
};

export type CollegiumItemDecision = {
  decision: CollegiumMeetingDecision;
  comment: string;
  responsibleIds: string[];
  dueDate: string;
  kpi: string;
  dissent: string;
  rework?: CollegiumReworkRequest;
};

export type CollegiumMeetingItem = {
  id: string;
  order: number;
  initiativeId: string;
  initiativeNumber: string;
  /** «Версия для заседания»: карточка на момент включения в повестку. */
  snapshot: { revision: number; card: CollegiumInitiativeCard };
  speakerId: string;
  participantIds: string[];
  durationMinutes: number;
  discussionStartedAt?: string;
  decision?: CollegiumItemDecision;
  removedAt?: string;
  removedByDisplayName?: string;
};

export type CollegiumProtocol = {
  text: string;
  /** Версия повестки, по которой сформирован проект; утверждается только актуальный. */
  agendaVersion?: number;
  /** Номер протокола равен номеру заседания; присваивается при утверждении. */
  number?: string;
  approvedAt?: string;
  approvedByDisplayName?: string;
};

export type CollegiumMeeting = CollegiumMeetingDetailsInput & {
  id: string;
  number: string;
  status: CollegiumMeetingStatus;
  revision: number;
  items: CollegiumMeetingItem[];
  /** Растёт при любом изменении реквизитов, повестки или решений. */
  agendaVersion?: number;
  protocol: CollegiumProtocol;
  cancelComment?: string;
  createdByDisplayName: string;
  createdAt: string;
  updatedAt: string;
};

export type CollegiumMeetingListResponse = {
  meetings: Array<Pick<
    CollegiumMeeting,
    "id" | "number" | "status" | "meetingDate" | "meetingTime" | "format" | "updatedAt"
  > & { itemCount: number }>;
  permissions: CollegiumInitiativePermissions;
};

export type CollegiumMeetingDetailResponse = {
  meeting: CollegiumMeeting;
  attachments: CollegiumAttachment[];
  people: CollegiumPerson[];
  /** Инициативы, которые секретарь может включить в повестку. */
  readyInitiatives: Array<Pick<CollegiumInitiative, "id" | "number" | "revision"> & { title: string }>;
  canManage: boolean;
  canApprove: boolean;
};

/** Последнее решение Коллегии в инициативе — для предзаполнения поручений. */
export type CollegiumInitiativeLastDecision = {
  meetingId: string;
  meetingNumber: string;
  meetingDate: string;
  protocolNumber: string;
  itemOrder: number;
  decision: CollegiumMeetingDecision;
};

export const collegiumMeetingsApiPath = "/api/collegium-meetings";
export const collegiumSettingsApiPath = "/api/collegium-settings";

/**
 * Настройки модуля (ТЗ 14). Пустая строка или пустой список — «не задано»:
 * условие полного паспорта не срабатывает, NPV не считается, в отчёт СД идут
 * все просроченные поручения.
 */
export type CollegiumSettingsInput = {
  /** Порог разовых затрат для полного паспорта, ₽ (`1234.50`). */
  oneTimeCostThreshold: string;
  /** Порог CAPEX для полного паспорта, ₽. */
  capexThreshold: string;
  /** Норматив срока окупаемости, месяцев (`18` или `18.5`). */
  paybackNormMonths: string;
  /** Ставка дисконтирования для NPV, % годовых. */
  discountRatePercent: string;
  /** Значения «Важности» поручения, считающиеся критическими. */
  criticalImportance: string[];
};

export type CollegiumSettings = CollegiumSettingsInput & {
  revision: number;
  updatedByDisplayName: string;
  updatedAt: string;
};

export type CollegiumSettingsResponse = {
  settings: CollegiumSettings;
  /** Все значения, включая архивные. */
  reference: CollegiumReference;
  canEditReference: boolean;
  canEditSettings: boolean;
};

export type CollegiumReferenceCreateInput = {
  kind: CollegiumReferenceKind;
  label: string;
  unit?: string;
};

export type CollegiumReferenceUpdateInput = {
  label?: string;
  unit?: string;
  archived?: boolean;
  /** Сдвиг на одну позицию. */
  move?: "up" | "down";
  /** Значимость уровня риска; меняет только председатель. */
  significant?: boolean;
};

export const collegiumResultConclusions = ["achieved", "partial", "not_achieved"] as const;
export type CollegiumResultConclusion = (typeof collegiumResultConclusions)[number];
export const collegiumResultConclusionLabels: Record<CollegiumResultConclusion, string> = {
  achieved: "Достигнут",
  partial: "Частично достигнут",
  not_achieved: "Не достигнут",
};

export type CollegiumInitiativeResultInput = {
  description: string;
  actualEffectAmount: string;
  source: string;
  conclusion: CollegiumResultConclusion | "";
};

export type CollegiumInitiativeResult = CollegiumInitiativeResultInput & {
  recordedByDisplayName: string;
  recordedAt: string;
};

/** Поручение реестра Коллегии, созданное из инициативы (обратная связь, ТЗ 10.4). */
export type CollegiumLinkedAssignment = {
  id: string;
  number: string;
  summary: string;
  status: string;
  deadline: string;
  completedOn: string;
  responsibleName: string;
  isOverdue: boolean;
};

/** Сводный статус исполнения инициативы (ТЗ 10.4). */
export const collegiumSummaryStatuses = [
  "not_started",
  "in_preparation",
  "in_pilot",
  "in_implementation",
  "overdue",
  "awaiting_confirmation",
  "effect_confirmed",
  "effect_unconfirmed",
  "suspended",
  "closed",
] as const;
export type CollegiumSummaryStatus = (typeof collegiumSummaryStatuses)[number];
export const collegiumSummaryStatusLabels: Record<CollegiumSummaryStatus, string> = {
  not_started: "Не начата",
  in_preparation: "В подготовке",
  in_pilot: "В пилоте",
  in_implementation: "В реализации",
  overdue: "Просрочена",
  awaiting_confirmation: "Ожидает подтверждения",
  effect_confirmed: "Эффект подтверждён",
  effect_unconfirmed: "Эффект не подтверждён",
  suspended: "Приостановлена",
  closed: "Закрыта",
};

/** Стадии реестра (ТЗ 13.2): группы статусов для фильтра. */
export const collegiumInitiativeStages = [
  "preparation",
  "collegium",
  "implementation",
  "result",
  "suspended",
  "closed",
] as const;
export type CollegiumInitiativeStage = (typeof collegiumInitiativeStages)[number];
export const collegiumInitiativeStageLabels: Record<CollegiumInitiativeStage, string> = {
  preparation: "Подготовка",
  collegium: "Рассмотрение Коллегией и СД",
  implementation: "Пилот и внедрение",
  result: "Подтверждение результата",
  suspended: "Приостановлены",
  closed: "Отклонены и закрыты",
};
export const collegiumInitiativeStageStatuses: Record<
  CollegiumInitiativeStage,
  readonly CollegiumInitiativeStatus[]
> = {
  preparation: ["draft", "preliminary_review", "rework", "ready", "needs_elaboration"],
  collegium: ["on_agenda", "in_discussion", "board_referral"],
  implementation: ["approved_pilot", "approved_implementation", "in_progress"],
  result: ["result_confirmation", "done_confirmed", "done_unconfirmed"],
  suspended: ["suspended"],
  closed: ["rejected", "closed"],
};

/**
 * Фильтры реестра (ТЗ 13.2). Даты — `YYYY-MM-DD` по дате создания; суммы —
 * канонические рубли; люди — `account:<userId>`. Срок окупаемости и уровни
 * риска появятся с полным паспортом (очередь 3).
 */
export type CollegiumInitiativeFilters = {
  query?: string;
  createdFrom?: string;
  createdTo?: string;
  initiatorId?: string;
  ownerId?: string;
  executorId?: string;
  controllerId?: string;
  directionCode?: string;
  status?: CollegiumInitiativeStatus;
  stage?: CollegiumInitiativeStage;
  effectTypeCode?: string;
  costMin?: string;
  costMax?: string;
  plannedEffectMin?: string;
  plannedEffectMax?: string;
  actualEffectMin?: string;
  actualEffectMax?: string;
  meetingId?: string;
  boardDecision?: "yes";
  overdue?: "yes";
  risk?: string;
  riskLevelCode?: string;
  /** Окупаемость не больше N месяцев (неокупаемые и неопределённые не входят). */
  paybackMax?: string;
  passportRequired?: "yes";
  /** Где пользователь автор или в любой роли карточки. */
  mine?: "yes";
};

export const collegiumInitiativeFilterKeys = [
  "query",
  "createdFrom",
  "createdTo",
  "initiatorId",
  "ownerId",
  "executorId",
  "controllerId",
  "directionCode",
  "status",
  "stage",
  "effectTypeCode",
  "costMin",
  "costMax",
  "plannedEffectMin",
  "plannedEffectMax",
  "actualEffectMin",
  "actualEffectMax",
  "meetingId",
  "boardDecision",
  "overdue",
  "risk",
  "riskLevelCode",
  "paybackMax",
  "passportRequired",
  "mine",
] as const satisfies readonly (keyof CollegiumInitiativeFilters)[];

/** Пункт списка «Требует моего действия» (уведомление в интерфейсе, ТЗ 12.1). */
export type CollegiumAttentionItem = {
  initiativeId: string;
  number: string;
  title: string;
  reason: string;
};

type CollegiumInitiativeRef = { id: string; number: string; title: string };

/** Дашборд Коллегии (ТЗ 13.1); суммы — канонические рубли `1234.50`. */
export type CollegiumDashboard = {
  generatedOn: string;
  total: number;
  statusCounts: Array<{ status: CollegiumInitiativeStatus; count: number }>;
  awaitingReview: number;
  rework: number;
  reworkOverdue: number;
  inPilot: number;
  inImplementation: number;
  overdueAssignments: number;
  plannedEffect: string;
  confirmedEffect: string;
  effectByDirection: Array<{ directionCode: string; directionLabel: string; planned: string; confirmed: string }>;
  nextMeeting?: {
    id: string;
    number: string;
    meetingDate: string;
    meetingTime: string;
    items: CollegiumInitiativeRef[];
  };
  unconfirmed: CollegiumInitiativeRef[];
  boardDecisions: CollegiumInitiativeRef[];
  topByEffect: Array<CollegiumInitiativeRef & { expectedEffect: string; status: CollegiumInitiativeStatus }>;
  topRisks: Array<CollegiumInitiativeRef & { risk: string; levelCode: string; levelLabel: string; expectedEffect: string }>;
};
