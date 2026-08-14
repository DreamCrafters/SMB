/**
 * Вердикт осмотра вагона после обжига. Значение задаётся только журналом
 * `Осмотр вагонов` и переносится в текущее состояние вагона.
 */
export const refractoryWagonConditionValues = [
  "Можно эксплуатировать",
  "В ремонт",
] as const;

export type RefractoryWagonCondition =
  (typeof refractoryWagonConditionValues)[number];

/**
 * Поля вагона, которые вводит огнеупорный цех при садке. `Каталог вагонов`
 * регистрирует новый вагон только по номеру: `loadingDate` и `productBrand`
 * заполняются позже исправлением в `Обороте вагонов`, где оба обязательны.
 */
export type RefractoryWagonSubmission = {
  number: string;
  loadingDate: string | null;
  productBrand: string | null;
  pressDate: string | null;
  pieceCount: number | null;
  setter: string | null;
  pressOperator: string | null;
};

/**
 * Остальные поля записи производные: даты и бригады обжига/сортировки приходят
 * из подтверждённого отчёта печного отделения, состояние и дата одобрения —
 * из журнала осмотра.
 */
export type RefractoryWagonRecord = {
  id: string;
  number: string;
  loadingDate: string | null;
  productBrand: string | null;
  pressDate: string | null;
  pieceCount: number | null;
  setter: string | null;
  pressOperator: string | null;
  rawControlDate: string | null;
  firingOperator: string | null;
  firingDates: string[];
  sorter: string | null;
  sortingDate: string | null;
  postFiringCondition: string | null;
  serviceApprovalDate: string | null;
  createdAt: string;
};

export type RefractoryWagonInspectionSubmission = {
  wagonId: string;
  condition: RefractoryWagonCondition;
  approvalDate: string;
};

export type RefractoryWagonInspectionRecord =
  RefractoryWagonInspectionSubmission & {
    id: string;
    wagonNumber: string;
    sortingDate: string | null;
    inspectedByDisplayName: string;
    createdAt: string;
  };

/**
 * Вагон ждёт осмотра, если он рассортирован и по этой сортировке одобрения ещё
 * не было, либо если он стоит в ремонте и должен вернуться в эксплуатацию.
 */
export function isRefractoryWagonAwaitingInspection(
  wagon: Pick<
    RefractoryWagonRecord,
    "postFiringCondition" | "serviceApprovalDate" | "sortingDate"
  >,
) {
  if (wagon.postFiringCondition === "В ремонт") return true;
  if (wagon.sortingDate === null) return false;
  return wagon.serviceApprovalDate === null ||
    wagon.serviceApprovalDate < wagon.sortingDate;
}

/** Вагон в ремонте недоступен для новой садки, пока его не вернут осмотром. */
export function isRefractoryWagonAvailableForLoading(
  wagon: Pick<RefractoryWagonRecord, "postFiringCondition">,
) {
  return wagon.postFiringCondition !== "В ремонт";
}

/**
 * Одобренный вагон сразу заводит новую пустую строку в `Обороте вагонов`, а
 * старая остаётся историей завершённого цикла — поэтому один номер вагона
 * может быть представлен несколькими записями. Список от сервера уже
 * отсортирован по убыванию `sequence_id`, значит первая встреченная запись
 * номера и есть его текущий цикл.
 */
export function selectLatestWagonCycles(
  wagons: readonly RefractoryWagonRecord[],
): RefractoryWagonRecord[] {
  const seenNumbers = new Set<string>();
  const latestCycles: RefractoryWagonRecord[] = [];
  for (const wagon of wagons) {
    if (seenNumbers.has(wagon.number)) continue;
    seenNumbers.add(wagon.number);
    latestCycles.push(wagon);
  }
  return latestCycles;
}
