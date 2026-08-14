import { useEffect, useRef, useState, type FormEvent } from "react";
import {
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
  isAdminPreviewMode,
  onShowToast,
}: {
  brandLabels: string[];
  defaultLoadingDate: string;
  isAdminPreviewMode: boolean;
  onShowToast: ShowToast;
}) {
  const [wagons, setWagons] = useState<RefractoryWagonRecord[]>([]);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">(
    isAdminPreviewMode ? "ready" : "loading",
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
  const hasSuccessfulMutation = useRef(false);

  useEffect(() => {
    if (isAdminPreviewMode) return;
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
  }, [isAdminPreviewMode]);

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
    setWagons((current) => current.map((wagon) => wagon.id === result.wagon.id
      ? result.wagon
      : wagon));
    resetForm();
    setMessage("Исправление вагона сохранено.");
    onShowToast(
      "Вагон исправлен",
      `${result.wagon.number} обновлён без изменения внутренней связи.`,
      "success",
    );
  }

  function editWagon(wagon: RefractoryWagonRecord) {
    setEditingWagonId(wagon.id);
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
  const sortedWagonNumbers = selectLatestWagonCycles(wagons)
    .map((wagon) => wagon.number)
    .sort((first, second) =>
      first.localeCompare(second, "ru", { numeric: true })
    );

  return (
    <section
      className="refractory-wagon-journal"
      aria-label="Журнал оборота вагонов"
    >
      {isAdminPreviewMode ? (
        <p className="form-status form-status-local">
          В режиме предпросмотра журнал оборота вагонов не загружается.
        </p>
      ) : (
        <form className="refractory-wagon-form" onSubmit={handleSubmit}>
          <fieldset disabled={isSubmitting}>
            <legend>
              {editingWagonId === undefined ? "Садка на вагоны" : "Исправление вагона"}
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
                  <option value="">Выберите вагон из каталога</option>
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
              {isSubmitting ? "Сохраняем…" : "Сохранить исправление"}
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
      )}

      {loadState === "loading" ? (
        <LoadingIndicator label="Загружаем вагоны…" variant="panel" />
      ) : loadState === "ready" && wagons.length === 0 ? (
        <p className="laboratory-empty-note">В журнале пока нет вагонов.</p>
      ) : loadState === "ready" ? (
        <div className="refractory-table-wrap refractory-table-wrap-full-height">
          <table className="refractory-input-table refractory-wagon-table">
            <thead>
              <tr>
                <th>№ вагона</th>
                <th>Дата садки</th>
                <th>Марка</th>
                <th>Дата пресса</th>
                <th>Кол-во шт.</th>
                <th>Садчик</th>
                <th>Прессовщик</th>
                <th>Дата контроля сырца</th>
                <th>Обжигальщик</th>
                <th>Даты обжига</th>
                <th>Сортировщик</th>
                <th>Дата сортировки</th>
                <th>Состояние вагона после обжига</th>
                <th>Дата осмотра</th>
              </tr>
            </thead>
            <tbody>
              {wagons.map((wagon) => (
                <tr key={wagon.id}>
                  <td>
                    <button
                      className="board-assignment-link refractory-wagon-edit-link"
                      type="button"
                      onClick={() => editWagon(wagon)}
                    >
                      {wagon.number}
                    </button>
                  </td>
                  <td>{formatDate(wagon.loadingDate)}</td>
                  <td>{wagon.productBrand ?? "—"}</td>
                  <td>{formatDate(wagon.pressDate)}</td>
                  <td>{wagon.pieceCount === null ? "—" : wagon.pieceCount}</td>
                  <td>{wagon.setter ?? "—"}</td>
                  <td>{wagon.pressOperator ?? "—"}</td>
                  <td>{formatDate(wagon.rawControlDate)}</td>
                  <td>{wagon.firingOperator ?? "—"}</td>
                  <td>{formatDates(wagon.firingDates)}</td>
                  <td>{wagon.sorter ?? "—"}</td>
                  <td>{formatDate(wagon.sortingDate)}</td>
                  <td>{wagon.postFiringCondition ?? "—"}</td>
                  <td>{formatDate(wagon.serviceApprovalDate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
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
