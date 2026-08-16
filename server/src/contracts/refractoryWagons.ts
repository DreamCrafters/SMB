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
 * Задача 91: этапы вагона идут строго по порядку — садка, контроль сырца,
 * обжиг/сортировка, осмотр. Вагон появляется в списке выбора следующего этапа
 * только тогда, когда заполнены все значения предыдущего, поэтому каждому
 * этапу нужны две проверки: «этап пройден» и «вагон доступен для этапа».
 */
function isFilled(value: string | null) {
  return value !== null && value.trim().length > 0;
}

/** Вагон в ремонте выведен из оборота и ждёт только возвращающего осмотра. */
export function isRefractoryWagonUnderRepair(
  wagon: Pick<RefractoryWagonRecord, "postFiringCondition">,
) {
  return wagon.postFiringCondition === "В ремонт";
}

/** Этап 1 «Садка»: дата садки, садчик, дата пресса, прессовщик. */
export function isRefractoryWagonLoadingComplete(
  wagon: Pick<
    RefractoryWagonRecord,
    "loadingDate" | "setter" | "pressDate" | "pressOperator"
  >,
) {
  return isFilled(wagon.loadingDate) && isFilled(wagon.setter) &&
    isFilled(wagon.pressDate) && isFilled(wagon.pressOperator);
}

/**
 * Этап 2 «Контроль сырца»: дата приходит из журнала контроля качества
 * сырцовой продукции, поэтому непустая дата и означает пройденный этап.
 */
export function isRefractoryWagonRawControlComplete(
  wagon: Pick<RefractoryWagonRecord, "rawControlDate">,
) {
  return isFilled(wagon.rawControlDate);
}

/** Этап 3 «Обжиг/Сортировка»: обжигальщик, дата обжига, сортировщик, дата сортировки. */
export function isRefractoryWagonFiringComplete(
  wagon: Pick<
    RefractoryWagonRecord,
    "firingOperator" | "firingDates" | "sorter" | "sortingDate"
  >,
) {
  return isFilled(wagon.firingOperator) && wagon.firingDates.length > 0 &&
    isFilled(wagon.sorter) && isFilled(wagon.sortingDate);
}

/** Садка доступна годному вагону, у которого текущий цикл ещё не начат. */
export function isRefractoryWagonAvailableForLoading(
  wagon: Pick<
    RefractoryWagonRecord,
    "postFiringCondition" | "loadingDate" | "setter" | "pressDate" | "pressOperator"
  >,
) {
  return !isRefractoryWagonUnderRepair(wagon) &&
    !isRefractoryWagonLoadingComplete(wagon);
}

/** Контроль сырца доступен вагону с полностью заполненной садкой. */
export function isRefractoryWagonAvailableForRawControl(
  wagon: Pick<
    RefractoryWagonRecord,
    | "postFiringCondition"
    | "loadingDate"
    | "setter"
    | "pressDate"
    | "pressOperator"
    | "rawControlDate"
  >,
) {
  return !isRefractoryWagonUnderRepair(wagon) &&
    isRefractoryWagonLoadingComplete(wagon) &&
    !isRefractoryWagonRawControlComplete(wagon);
}

/** Обжиг и сортировка доступны вагону, прошедшему контроль сырца. */
export function isRefractoryWagonAvailableForFiring(
  wagon: Pick<
    RefractoryWagonRecord,
    | "postFiringCondition"
    | "rawControlDate"
    | "firingOperator"
    | "firingDates"
    | "sorter"
    | "sortingDate"
  >,
) {
  return !isRefractoryWagonUnderRepair(wagon) &&
    isRefractoryWagonRawControlComplete(wagon) &&
    !isRefractoryWagonFiringComplete(wagon);
}

/**
 * Осмотр доступен вагону с полностью заполненным обжигом и сортировкой, по
 * которой одобрения ещё не было. Вагон в ремонте ждёт осмотра всегда: это
 * единственный путь вернуть его в эксплуатацию, и он лежит вне обычного цикла.
 */
export function isRefractoryWagonAwaitingInspection(
  wagon: Pick<
    RefractoryWagonRecord,
    | "postFiringCondition"
    | "serviceApprovalDate"
    | "firingOperator"
    | "firingDates"
    | "sorter"
    | "sortingDate"
  >,
) {
  if (isRefractoryWagonUnderRepair(wagon)) return true;
  if (!isRefractoryWagonFiringComplete(wagon)) return false;
  if (wagon.sortingDate === null) return false;
  return wagon.serviceApprovalDate === null ||
    wagon.serviceApprovalDate < wagon.sortingDate;
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
