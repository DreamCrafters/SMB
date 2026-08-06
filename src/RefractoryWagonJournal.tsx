import { useEffect, useState, type FormEvent } from "react";
import type { RefractoryWagonRecord } from "./contracts/refractoryWagons";
import { LoadingIndicator } from "./LoadingIndicator";
import { ProductBrandPicker } from "./ProductBrandPicker";
import {
  correctRefractoryWagon,
  requestRefractoryWagons,
  submitRefractoryWagon,
} from "./services/refractoryWagons";
import { readShortUserMessage } from "./services/userFacingMessages";

type ShowToast = (title: string, message: string) => void;

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
  const [message, setMessage] = useState("");
  const [hasError, setHasError] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingWagonId, setEditingWagonId] = useState<string>();

  useEffect(() => {
    if (isAdminPreviewMode) return;
    const controller = new AbortController();
    setLoadState("loading");
    requestRefractoryWagons({ signal: controller.signal }).then((result) => {
      if (controller.signal.aborted) return;
      if (result.status === "ready") {
        setWagons(result.wagons);
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
    const submission = {
      number: number.trim(),
      loadingDate,
      productBrand: productBrand.trim(),
    };
    if (Object.values(submission).some((value) => value.length === 0)) {
      setHasError(true);
      setMessage("Заполните номер вагона, дату садки и марку.");
      return;
    }
    setIsSubmitting(true);
    setHasError(false);
    setMessage("Сохраняем вагон.");
    const result = editingWagonId === undefined
      ? await submitRefractoryWagon(submission)
      : await correctRefractoryWagon(editingWagonId, submission);
    setIsSubmitting(false);
    if (result.status === "error") {
      setHasError(true);
      setMessage(readShortUserMessage(result.message, "Не удалось сохранить вагон."));
      return;
    }
    const wasEditing = editingWagonId !== undefined;
    setWagons((current) => wasEditing
      ? current.map((wagon) => wagon.id === result.wagon.id
        ? result.wagon
        : wagon)
      : [result.wagon, ...current]);
    resetForm();
    setMessage(wasEditing
      ? "Исправление вагона сохранено."
      : "Вагон добавлен в журнал.");
    onShowToast(
      wasEditing ? "Вагон исправлен" : "Вагон добавлен",
      wasEditing
        ? `${result.wagon.number} обновлён без изменения внутренней связи.`
        : `${result.wagon.number} теперь доступен в журнале контроля качества сырца.`,
    );
  }

  function editWagon(wagon: RefractoryWagonRecord) {
    setEditingWagonId(wagon.id);
    setNumber(wagon.number);
    setLoadingDate(wagon.loadingDate ?? "");
    setProductBrand(wagon.productBrand ?? "");
    setHasError(false);
    setMessage("");
  }

  function resetForm() {
    setEditingWagonId(undefined);
    setNumber("");
    setLoadingDate(defaultLoadingDate);
    setProductBrand("");
  }

  return (
    <section className="refractory-wagon-journal" aria-label="Журнал вагонов">
      {isAdminPreviewMode ? (
        <p className="form-status form-status-local">
          В режиме предпросмотра журнал вагонов не загружается.
        </p>
      ) : (
        <form className="refractory-wagon-form" onSubmit={handleSubmit}>
          <fieldset disabled={isSubmitting}>
            <legend>
              {editingWagonId === undefined ? "Новый вагон" : "Исправление вагона"}
            </legend>
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
            </div>
          </fieldset>
          <div className="refractory-form-actions">
            <button className="primary-button" disabled={isSubmitting} type="submit">
              {isSubmitting
                ? "Сохраняем…"
                : editingWagonId === undefined
                  ? "Добавить вагон"
                  : "Сохранить исправление"}
            </button>
            {editingWagonId === undefined ? null : (
              <button
                className="secondary-button"
                disabled={isSubmitting}
                type="button"
                onClick={resetForm}
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
        <div className="refractory-table-wrap">
          <table className="refractory-input-table refractory-wagon-table">
            <thead>
              <tr>
                <th>№ вагона</th>
                <th>Дата садки</th>
                <th>Марка</th>
                <th>Дата контроля сырца</th>
                <th>Даты обжига</th>
                <th>Дата сортировки</th>
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
                  <td>{formatDate(wagon.rawControlDate)}</td>
                  <td>{formatDates(wagon.firingDates)}</td>
                  <td>{formatDate(wagon.sortingDate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
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
