import { useEffect, useRef, useState, type FormEvent } from "react";
import type { RefractoryWagonRecord } from "./contracts/refractoryWagons";
import { LoadingIndicator } from "./LoadingIndicator";
import { requestRefractoryWagons, submitRefractoryWagon } from "./services/refractoryWagons";
import { readShortUserMessage } from "./services/userFacingMessages";
import type { ShowToast } from "./services/toastStack";

/**
 * Каталог — единственное место, где регистрируют новый физический вагон по
 * номеру. Остальные его поля заполняет исправлением журнал `Оборот вагонов`,
 * а счётчик обжига и текущее состояние всегда считает и подтягивает сервер.
 */
export function RefractoryWagonCatalog({
  isAdminPreviewMode,
  onShowToast,
}: {
  isAdminPreviewMode: boolean;
  onShowToast: ShowToast;
}) {
  const [wagons, setWagons] = useState<RefractoryWagonRecord[]>([]);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">(
    isAdminPreviewMode ? "ready" : "loading",
  );
  const [message, setMessage] = useState("");
  const [number, setNumber] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formMessage, setFormMessage] = useState("");
  const [hasFormError, setHasFormError] = useState(false);
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
        return;
      }
      setLoadState("error");
      setMessage(
        readShortUserMessage(result.message, "Не удалось загрузить каталог вагонов."),
      );
    });
    return () => controller.abort();
  }, [isAdminPreviewMode]);

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
      `${result.wagon.number} теперь доступен в журнале «Оборот вагонов».`,
      "success",
    );
  }

  const sortedWagons = summarizeWagonsByNumber(wagons).sort((first, second) =>
    first.number.localeCompare(second.number, "ru", { numeric: true })
  );

  return (
    <section className="refractory-wagon-catalog" aria-label="Каталог вагонов">
      {isAdminPreviewMode ? (
        <p className="form-status form-status-local">
          В режиме предпросмотра каталог вагонов не загружается.
        </p>
      ) : (
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
              журнале «Оборот вагонов» после регистрации номера.
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

      {isAdminPreviewMode ? null : loadState === "loading" ? (
        <LoadingIndicator label="Загружаем каталог вагонов…" variant="panel" />
      ) : loadState === "error" ? (
        <p className="form-status form-status-error">{message}</p>
      ) : sortedWagons.length === 0 ? (
        <p className="laboratory-empty-note">В каталоге пока нет вагонов.</p>
      ) : (
        <div className="refractory-table-wrap refractory-table-wrap-full-height">
          <table className="refractory-input-table refractory-wagon-catalog-table">
            <thead>
              <tr>
                <th>Номер вагона</th>
                <th>Счётчик обжига</th>
                <th>Текущее состояние</th>
              </tr>
            </thead>
            <tbody>
              {sortedWagons.map((wagon) => (
                <tr key={wagon.number}>
                  <td>{wagon.number}</td>
                  <td>{wagon.firingCount}</td>
                  <td>{wagon.currentCondition ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
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
