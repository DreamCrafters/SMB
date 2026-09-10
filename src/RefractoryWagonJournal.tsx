import { ManagedTable } from "./ManagedTable";
import { TableHeader, TableCell } from "./TableCell";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  isRefractoryWagonAvailableForLoading,
  isRefractoryWagonLoadingComplete,
  selectLatestWagonCycles,
  type RefractoryWagonRecord,
} from "./contracts/refractoryWagons";
import { mergeLaboratoryJournalOptions } from "./laboratoryJournalOptions";
import { LoadingIndicator } from "./LoadingIndicator";
import { ProductBrandPicker } from "./ProductBrandPicker";
import {
  correctRefractoryWagon,
  requestRefractoryWagons,
} from "./services/refractoryWagons";
import { readShortUserMessage } from "./services/userFacingMessages";
import type { ShowToast } from "./services/toastStack";

export function RefractoryWagonJournal({
  brandLabels,
  defaultLoadingDate,
  onShowToast,
}: {
  brandLabels: string[];
  defaultLoadingDate: string;
  onShowToast: ShowToast;
}) {
  const [wagons, setWagons] = useState<RefractoryWagonRecord[]>([]);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [number, setNumber] = useState("");
  const [loadingDate, setLoadingDate] = useState(defaultLoadingDate);
  const [productBrand, setProductBrand] = useState("");
  const [pressDate, setPressDate] = useState("");
  const [pieceCount, setPieceCount] = useState("");
  const [setter, setSetter] = useState("");
  const [pressOperator, setPressOperator] = useState("");
  const [message, setMessage] = useState("");
  const [hasError, setHasError] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingWagonId, setEditingWagonId] = useState<string>();
  // Задача 91: в форме два входа — садка вагона из списка первого этапа и
  // исправление уже заполненной записи кликом по номеру в таблице.
  const [isLoadingStage, setIsLoadingStage] = useState(false);
  const hasSuccessfulMutation = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    setLoadState("loading");
    requestRefractoryWagons({ signal: controller.signal }).then((result) => {
      if (controller.signal.aborted) return;
      if (result.status === "ready") {
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
      } else {
        setLoadState("error");
        setHasError(true);
        setMessage(
          readShortUserMessage(result.message, "Не удалось загрузить вагоны."),
        );
      }
    });
    return () => controller.abort();
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;
    const pieceCountText = pieceCount.trim();
    if (pieceCountText.length > 0 && !/^\d+$/u.test(pieceCountText)) {
      setHasError(true);
      setMessage("Кол-во шт. указывается целым неотрицательным числом.");
      return;
    }
    if (editingWagonId === undefined) {
      setHasError(true);
      setMessage("Выберите вагон из каталога.");
      return;
    }
    const submission = {
      number: number.trim(),
      loadingDate,
      productBrand: productBrand.trim(),
      pressDate: pressDate.length > 0 ? pressDate : null,
      pieceCount: pieceCountText.length > 0 ? Number(pieceCountText) : null,
      setter: setter.trim() || null,
      pressOperator: pressOperator.trim() || null,
    };
    if (
      submission.number.length === 0 ||
      submission.loadingDate.length === 0 ||
      submission.productBrand.length === 0
    ) {
      setHasError(true);
      setMessage("Заполните номер вагона, дату садки и марку.");
      return;
    }
    setIsSubmitting(true);
    setHasError(false);
    setMessage("Сохраняем вагон.");
    const result = await correctRefractoryWagon(editingWagonId, submission);
    setIsSubmitting(false);
    if (result.status === "error") {
      setHasError(true);
      setMessage(readShortUserMessage(result.message, "Не удалось сохранить вагон."));
      return;
    }
    hasSuccessfulMutation.current = true;
    const wasCorrection = isCorrection;
    setWagons((current) => current.map((wagon) => wagon.id === result.wagon.id
      ? result.wagon
      : wagon));
    resetForm();
    setMessage(wasCorrection
      ? "Исправление вагона сохранено."
      : "Садка вагона сохранена.");
    onShowToast(
      wasCorrection ? "Вагон исправлен" : "Садка сохранена",
      `${result.wagon.number} обновлён без изменения внутренней связи.`,
      "success",
    );
  }

  function editWagon(wagon: RefractoryWagonRecord) {
    setEditingWagonId(wagon.id);
    setIsLoadingStage(!isRefractoryWagonLoadingComplete(wagon));
    setNumber(wagon.number);
    setLoadingDate(wagon.loadingDate ?? "");
    setProductBrand(wagon.productBrand ?? "");
    setPressDate(wagon.pressDate ?? "");
    setPieceCount(wagon.pieceCount === null ? "" : String(wagon.pieceCount));
    setSetter(wagon.setter ?? "");
    setPressOperator(wagon.pressOperator ?? "");
    setHasError(false);
    setMessage("");
  }

  function resetForm() {
    setEditingWagonId(undefined);
    setIsLoadingStage(false);
    setNumber("");
    setLoadingDate(defaultLoadingDate);
    setProductBrand("");
    setPressDate("");
    setPieceCount("");
    setSetter("");
    setPressOperator("");
  }

  const setterOptions = collectWagonOptions(wagons, (wagon) => wagon.setter);
  const pressOperatorOptions = collectWagonOptions(
    wagons,
    (wagon) => wagon.pressOperator,
  );
  // Один номер вагона теперь может встречаться в нескольких строках истории
  // (по одной на цикл), поэтому список для выбора берёт только текущий цикл.
  // Первый этап конвейера видит из них годные вагоны без садки (задача 91);
  // исправление любой другой строки открывается кликом по номеру в таблице.
  const loadingStageNumbers = selectLatestWagonCycles(wagons)
    .filter(isRefractoryWagonAvailableForLoading)
    .map((wagon) => wagon.number);
  // Исправляемая строка может относиться к давно пройденному циклу, но её
  // номер обязан остаться видимым в поле, иначе выбор выглядит потерянным.
  const sortedWagonNumbers = [
    ...new Set(number === "" ? loadingStageNumbers : [
      ...loadingStageNumbers,
      number,
    ]),
  ].sort((first, second) =>
    first.localeCompare(second, "ru", { numeric: true })
  );
  const isCorrection = editingWagonId !== undefined && !isLoadingStage;

  return (
    <section
      className="refractory-wagon-journal"
      aria-label="Журнал оборота вагонов"
    >
      <form className="refractory-wagon-form" onSubmit={handleSubmit}>
        <fieldset disabled={isSubmitting}>
          <legend>
            {isCorrection ? "Исправление вагона" : "Садка на вагоны"}
          </legend>
          <div className="refractory-field-grid">
            <label className="refractory-field">
              <span>№ вагона</span>
              <select
                name="wagonNumber"
                required
                value={number}
                onChange={(event) => {
                  const selectedNumber = event.currentTarget.value;
                  const selectedWagon = wagons.find(
                    (wagon) => wagon.number === selectedNumber,
                  );
                  if (selectedWagon !== undefined) editWagon(selectedWagon);
                }}
              >
                <option value="">Выберите вагон под садку</option>
                {sortedWagonNumbers.map((wagonNumber) => (
                  <option key={wagonNumber} value={wagonNumber}>
                    {wagonNumber}
                  </option>
                ))}
              </select>
            </label>
            <label className="refractory-field">
              <span>Дата садки</span>
              <input
                name="wagonLoadingDate"
                required
                type="date"
                value={loadingDate}
                onChange={(event) => setLoadingDate(event.currentTarget.value)}
              />
            </label>
            <label className="refractory-field">
              <span>Марка</span>
              <ProductBrandPicker
                ariaLabel="Марка вагона"
                labels={brandLabels}
                name="wagonProductBrand"
                value={productBrand}
                onChange={setProductBrand}
              />
            </label>
            <label className="refractory-field">
              <span>Дата пресса</span>
              <input
                name="wagonPressDate"
                type="date"
                value={pressDate}
                onChange={(event) => setPressDate(event.currentTarget.value)}
              />
            </label>
            <label className="refractory-field">
              <span>Кол-во шт.</span>
              <input
                inputMode="numeric"
                min={0}
                name="wagonPieceCount"
                step={1}
                type="number"
                value={pieceCount}
                onChange={(event) => setPieceCount(event.currentTarget.value)}
              />
            </label>
            <label className="refractory-field">
              <span>Садчик</span>
              <input
                list="refractory-wagon-setter-options"
                maxLength={120}
                name="wagonSetter"
                value={setter}
                onChange={(event) => setSetter(event.currentTarget.value)}
              />
            </label>
            <label className="refractory-field">
              <span>Прессовщик</span>
              <input
                list="refractory-wagon-press-operator-options"
                maxLength={120}
                name="wagonPressOperator"
                value={pressOperator}
                onChange={(event) => setPressOperator(event.currentTarget.value)}
              />
            </label>
          </div>
          <p className="laboratory-empty-note">
            В списке — годные вагоны, ожидающие садки. Вагон уходит на
            контроль сырца только после того, как заполнены дата садки,
            садчик, дата пресса и прессовщик; исправить уже заполненную
            запись можно кликом по номеру в таблице ниже.
          </p>
          <p className="laboratory-empty-note">
            Обжигальщик, сортировщик и даты обжига и сортировки приходят из
            подтверждённого отчёта печного отделения, а состояние вагона и
            дата одобрения — из журнала осмотра вагонов.
          </p>
        </fieldset>
        <div className="refractory-form-actions">
          <button
            className="primary-button"
            disabled={isSubmitting || editingWagonId === undefined}
            type="submit"
          >
            {isSubmitting
              ? "Сохраняем…"
              : isCorrection
                ? "Сохранить исправление"
                : "Сохранить садку"}
          </button>
          {editingWagonId === undefined ? null : (
            <button
              className="secondary-button"
              disabled={isSubmitting}
              type="button"
              onClick={() => resetForm()}
            >
              Отмена
            </button>
          )}
          {message.length > 0 ? (
            <p className={`form-status${hasError ? " form-status-error" : ""}`}>
              {message}
            </p>
          ) : null}
        </div>
      </form>

      {loadState === "loading" ? (
        <LoadingIndicator label="Загружаем вагоны…" variant="panel" />
      ) : loadState === "ready" && wagons.length === 0 ? (
        <p className="laboratory-empty-note">В журнале пока нет вагонов.</p>
      ) : loadState === "ready" ? (
        <div className="refractory-table-wrap refractory-table-wrap-full-height">
          <ManagedTable tableId="refractory.wagons" className="refractory-input-table refractory-wagon-table">
            <thead>
              <tr>
                <TableHeader>№ вагона</TableHeader>
                <TableHeader>Дата садки</TableHeader>
                <TableHeader>Марка</TableHeader>
                <TableHeader>Дата пресса</TableHeader>
                <TableHeader>Кол-во шт.</TableHeader>
                <TableHeader>Садчик</TableHeader>
                <TableHeader>Прессовщик</TableHeader>
                <TableHeader>Дата контроля сырца</TableHeader>
                <TableHeader>Обжигальщик</TableHeader>
                <TableHeader>Даты обжига</TableHeader>
                <TableHeader>Сортировщик</TableHeader>
                <TableHeader>Дата сортировки</TableHeader>
                <TableHeader>Состояние вагона после обжига</TableHeader>
                <TableHeader>Дата осмотра</TableHeader>
              </tr>
            </thead>
            <tbody>
              {wagons.map((wagon) => (
                <tr key={wagon.id}>
                  <TableCell>
                    <button
                      className="board-assignment-link refractory-wagon-edit-link"
                      type="button"
                      onClick={() => editWagon(wagon)}
                    >
                      {wagon.number}
                    </button>
                  </TableCell>
                  <TableCell>{formatDate(wagon.loadingDate)}</TableCell>
                  <TableCell>{wagon.productBrand ?? "—"}</TableCell>
                  <TableCell>{formatDate(wagon.pressDate)}</TableCell>
                  <TableCell>{wagon.pieceCount === null ? "—" : wagon.pieceCount}</TableCell>
                  <TableCell>{wagon.setter ?? "—"}</TableCell>
                  <TableCell>{wagon.pressOperator ?? "—"}</TableCell>
                  <TableCell>{formatDate(wagon.rawControlDate)}</TableCell>
                  <TableCell>{wagon.firingOperator ?? "—"}</TableCell>
                  <TableCell>{formatDates(wagon.firingDates)}</TableCell>
                  <TableCell>{wagon.sorter ?? "—"}</TableCell>
                  <TableCell>{formatDate(wagon.sortingDate)}</TableCell>
                  <TableCell>{wagon.postFiringCondition ?? "—"}</TableCell>
                  <TableCell>{formatDate(wagon.serviceApprovalDate)}</TableCell>
                </tr>
              ))}
            </tbody>
          </ManagedTable>
        </div>
      ) : null}
      <datalist id="refractory-wagon-setter-options">
        {setterOptions.map((value) => <option key={value} value={value} />)}
      </datalist>
      <datalist id="refractory-wagon-press-operator-options">
        {pressOperatorOptions.map((value) => (
          <option key={value} value={value} />
        ))}
      </datalist>
    </section>
  );
}

function collectWagonOptions(
  wagons: RefractoryWagonRecord[],
  read: (wagon: RefractoryWagonRecord) => string | null,
) {
  return mergeLaboratoryJournalOptions(
    [],
    wagons.flatMap((wagon) => {
      const value = read(wagon);
      return value === null ? [] : [value];
    }),
  );
}

function formatDate(value: string | null) {
  if (value === null) return "—";
  const [year, month, day] = value.split("-");
  return `${day}.${month}.${year}`;
}

function formatDates(values: string[]) {
  return values.length === 0
    ? "—"
    : values.map((value) => formatDate(value)).join("; ");
}
