import { ManagedTable } from "./ManagedTable";
import { TableHeader, TableCell } from "./TableCell";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  refractoryWagonConditionValues,
  type RefractoryWagonFleetRecord,
  type RefractoryWagonRecord,
} from "./contracts/refractoryWagons";
import { LoadingIndicator } from "./LoadingIndicator";
import { requestRefractoryWagons, submitRefractoryWagon } from "./services/refractoryWagons";
import { readShortUserMessage } from "./services/userFacingMessages";
import type { ShowToast } from "./services/toastStack";

/**
 * Каталог — единственное место, где регистрируют новый физический вагон по
 * номеру. Остальные его поля заполняет исправлением журнал `Оборот вагонов`,
 * а счётчик обжига и текущее состояние всегда считает и подтягивает сервер.
 * Дата на борту, дата кап. и загрузка — снимок ведомости `Учёт вагонов`.
 * `readOnly` — руководительский раздел `Производство` (задача 145): та же
 * таблица без регистрации вагона; сервер открывает ему только чтение.
 * Поиск и список состояний (задача 149) отбирают уже загруженные строки.
 */
export function RefractoryWagonCatalog({
  onShowToast,
  readOnly = false,
}: {
  onShowToast: ShowToast;
  readOnly?: boolean;
}) {
  const [wagons, setWagons] = useState<RefractoryWagonRecord[]>([]);
  const [fleet, setFleet] = useState<RefractoryWagonFleetRecord[]>([]);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [message, setMessage] = useState("");
  const [number, setNumber] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formMessage, setFormMessage] = useState("");
  const [hasFormError, setHasFormError] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [conditionFilter, setConditionFilter] = useState(allConditionsFilter);
  const hasSuccessfulMutation = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    setLoadState("loading");
    requestRefractoryWagons({ signal: controller.signal }).then((result) => {
      if (controller.signal.aborted) return;
      if (result.status === "ready") {
        setFleet(result.fleet);
        if (hasSuccessfulMutation.current) {
          setWagons((current) => {
            const currentIds = new Set(current.map((wagon) => wagon.id));
            return [
              ...current,
              ...result.wagons.filter((wagon) => !currentIds.has(wagon.id)),
            ];
          });
        } else {
          setWagons(result.wagons);
        }
        setLoadState("ready");
        return;
      }
      setLoadState("error");
      setMessage(
        readShortUserMessage(result.message, "Не удалось загрузить каталог вагонов."),
      );
    });
    return () => controller.abort();
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;
    const trimmedNumber = number.trim();
    if (trimmedNumber.length === 0) {
      setHasFormError(true);
      setFormMessage("Укажите номер вагона.");
      return;
    }
    setIsSubmitting(true);
    setHasFormError(false);
    setFormMessage("Добавляем вагон.");
    const result = await submitRefractoryWagon({
      number: trimmedNumber,
      loadingDate: null,
      productBrand: null,
      pressDate: null,
      pieceCount: null,
      setter: null,
      pressOperator: null,
    });
    setIsSubmitting(false);
    if (result.status === "error") {
      setHasFormError(true);
      setFormMessage(
        readShortUserMessage(result.message, "Не удалось добавить вагон."),
      );
      return;
    }
    hasSuccessfulMutation.current = true;
    setWagons((current) => [result.wagon, ...current]);
    setNumber("");
    setFormMessage("");
    onShowToast(
      "Вагон добавлен",
      `${result.wagon.number} теперь доступен в журнале «Оборот вагонов/Садка».`,
      "success",
    );
  }

  const fleetByNumber = new Map(fleet.map((record) => [record.number, record]));
  const catalogRows = summarizeWagonsByNumber(wagons)
    .sort((first, second) =>
      first.number.localeCompare(second.number, "ru", { numeric: true })
    )
    .map((wagon): WagonCatalogRow => {
      const fleetRecord = fleetByNumber.get(wagon.number);
      return {
        ...wagon,
        onBoardDate: fleetRecord?.onBoardDate == null
          ? null
          : formatDate(fleetRecord.onBoardDate),
        capitalRepairPeriod: fleetRecord?.capitalRepairPeriod ?? null,
        load: fleetRecord?.load ?? null,
      };
    });
  const conditionOptions = buildConditionFilterOptions(catalogRows);
  // Состояние, которого после обновления каталога уже нет, не должно прятать
  // всю таблицу невидимым для пользователя отбором.
  const activeConditionFilter = conditionOptions.some(
      (option) => option.value === conditionFilter,
    )
    ? conditionFilter
    : allConditionsFilter;
  const visibleRows = filterCatalogRows(
    catalogRows,
    searchQuery,
    activeConditionFilter,
  );
  const fleetAsOfDate = fleet.map((record) => record.asOfDate).sort().at(-1);

  return (
    <section className="refractory-wagon-catalog" aria-label="Каталог вагонов">
      {readOnly ? null : (
      <form className="refractory-wagon-form" onSubmit={handleSubmit}>
        <fieldset disabled={isSubmitting}>
          <legend>Новый вагон</legend>
          <div className="refractory-field-grid">
            <label className="refractory-field">
              <span>№ вагона</span>
              <input
                name="wagonNumber"
                required
                value={number}
                onChange={(event) => setNumber(event.currentTarget.value)}
              />
            </label>
          </div>
          <p className="laboratory-empty-note">
            Дата садки, марка и остальные поля заполняются исправлением в
            журнале «Оборот вагонов/Садка» после регистрации номера.
          </p>
        </fieldset>
        <div className="refractory-form-actions">
          <button className="primary-button" disabled={isSubmitting} type="submit">
            {isSubmitting ? "Сохраняем…" : "Добавить вагон"}
          </button>
          {formMessage.length > 0 ? (
            <p className={`form-status${hasFormError ? " form-status-error" : ""}`}>
              {formMessage}
            </p>
          ) : null}
        </div>
      </form>
      )}

      {loadState === "loading" ? (
        <LoadingIndicator label="Загружаем каталог вагонов…" variant="panel" />
      ) : loadState === "error" ? (
        <p className="form-status form-status-error">{message}</p>
      ) : catalogRows.length === 0 ? (
        <p className="laboratory-empty-note">В каталоге пока нет вагонов.</p>
      ) : (
        <>
          <div className="laboratory-filters refractory-wagon-catalog-filters">
            <label>
              <span>Поиск</span>
              <input
                maxLength={120}
                placeholder="Номер, дата, загрузка, состояние"
                type="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.currentTarget.value)}
              />
            </label>
            <label>
              <span>Текущее состояние</span>
              <select
                value={activeConditionFilter}
                onChange={(event) =>
                  setConditionFilter(event.currentTarget.value)}
              >
                <option value={allConditionsFilter}>Все</option>
                {conditionOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p className="laboratory-empty-note" aria-live="polite">
            {visibleRows.length === 0
              ? "Нет вагонов по выбранным условиям."
              : `Показано вагонов: ${visibleRows.length} из ${catalogRows.length}.`}
          </p>
          {visibleRows.length === 0 ? null : (
            <>
              {fleetAsOfDate === undefined ? null : (
                <p className="laboratory-empty-note">
                  Дата на борту, дата кап. и загрузка — по учёту на{" "}
                  {formatDate(fleetAsOfDate)}.
                </p>
              )}
              <div className="refractory-table-wrap history-table-scroll">
                <ManagedTable tableId="refractory.catalog" className="refractory-input-table refractory-wagon-catalog-table">
                  <thead>
                    <tr>
                      <TableHeader>Номер вагона</TableHeader>
                      <TableHeader>Дата на борту</TableHeader>
                      <TableHeader>Дата кап.</TableHeader>
                      <TableHeader>Загрузка</TableHeader>
                      <TableHeader>Счётчик обжига</TableHeader>
                      <TableHeader>Текущее состояние</TableHeader>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleRows.map((row) => (
                      <tr key={row.number}>
                        <TableCell>{row.number}</TableCell>
                        <TableCell>{row.onBoardDate ?? "—"}</TableCell>
                        <TableCell>{row.capitalRepairPeriod ?? "—"}</TableCell>
                        <TableCell>{row.load ?? "—"}</TableCell>
                        <TableCell>{row.firingCount}</TableCell>
                        <TableCell>{row.currentCondition ?? "—"}</TableCell>
                      </tr>
                    ))}
                  </tbody>
                </ManagedTable>
              </div>
            </>
          )}
        </>
      )}
    </section>
  );
}

function formatDate(value: string) {
  const [year, month, day] = value.split("-");
  return `${day}.${month}.${year}`;
}

const allConditionsFilter = "";
const missingConditionFilter = "none";
/** Префикс отделяет состояние из данных от служебных значений списка. */
const conditionFilterPrefix = "value:";

/** Строка каталога в том виде, в каком её показывает и ищет таблица. */
type WagonCatalogRow = WagonCatalogSummary & {
  onBoardDate: string | null;
  capitalRepairPeriod: string | null;
  load: string | null;
};

/**
 * Список состояний: вердикты осмотра из контракта, затем иные значения,
 * встретившиеся в данных, и вагоны без состояния.
 */
function buildConditionFilterOptions(rows: readonly WagonCatalogRow[]) {
  const knownConditions: readonly string[] = refractoryWagonConditionValues;
  const otherConditions = [...new Set(
    rows.flatMap((row) =>
      row.currentCondition === null ||
        knownConditions.includes(row.currentCondition)
        ? []
        : [row.currentCondition]
    ),
  )].sort((first, second) => first.localeCompare(second, "ru"));

  return [
    ...[...knownConditions, ...otherConditions].map((condition) => ({
      value: `${conditionFilterPrefix}${condition}`,
      label: condition,
    })),
    { value: missingConditionFilter, label: "Не указано" },
  ];
}

/** Поиск идёт по показанному содержимому строки; прочерки пустых ячеек не ищутся. */
function filterCatalogRows(
  rows: readonly WagonCatalogRow[],
  searchQuery: string,
  conditionFilter: string,
) {
  const query = normalizeSearchText(searchQuery);

  return rows.filter((row) => {
    if (
      conditionFilter === missingConditionFilter
        ? row.currentCondition !== null
        : conditionFilter !== allConditionsFilter &&
          `${conditionFilterPrefix}${row.currentCondition ?? ""}` !==
            conditionFilter
    ) {
      return false;
    }

    return query === "" || [
      row.number,
      row.onBoardDate,
      row.capitalRepairPeriod,
      row.load,
      String(row.firingCount),
      row.currentCondition,
    ].some((value) =>
      value !== null && normalizeSearchText(value).includes(query)
    );
  });
}

function normalizeSearchText(value: string) {
  return value.trim().replace(/\s+/gu, " ").toLocaleLowerCase("ru-RU");
}

type WagonCatalogSummary = {
  number: string;
  firingCount: number;
  currentCondition: string | null;
};

/**
 * Одобренный вагон заводит новую пустую строку в `Обороте вагонов`, поэтому
 * список записей содержит несколько циклов на один физический номер.
 * Каталог сворачивает их в одну строку на номер: счётчик обжига суммирует
 * все циклы, а текущее состояние берёт самый новый (записи от сервера
 * упорядочены по убыванию `sequence_id`, значит первая встреченная запись
 * номера и есть его текущий цикл).
 */
function summarizeWagonsByNumber(
  wagons: RefractoryWagonRecord[],
): WagonCatalogSummary[] {
  const summaryByNumber = new Map<string, WagonCatalogSummary>();
  for (const wagon of wagons) {
    const existing = summaryByNumber.get(wagon.number);
    if (existing === undefined) {
      summaryByNumber.set(wagon.number, {
        number: wagon.number,
        firingCount: wagon.firingDates.length,
        currentCondition: wagon.postFiringCondition,
      });
    } else {
      existing.firingCount += wagon.firingDates.length;
    }
  }
  return [...summaryByNumber.values()];
}
