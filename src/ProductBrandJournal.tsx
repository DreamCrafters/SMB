import { useEffect, useState, type FormEvent } from "react";
import {
  productBrandFields,
  type ProductBrandRecord,
  type ProductBrandSubmission,
} from "./contracts";
import { LoadingIndicator } from "./LoadingIndicator";
import {
  correctProductBrand,
  requestProductBrandJournal,
  submitProductBrand,
} from "./services/productBrandJournal";
import { readShortUserMessage } from "./services/userFacingMessages";

type ShowToast = (title: string, body: string) => void;
type FormState = Record<keyof ProductBrandSubmission, string>;
type HistoryState =
  | { status: "loading"; records: ProductBrandRecord[] }
  | { status: "ready"; records: ProductBrandRecord[] }
  | { status: "error"; message: string; records: ProductBrandRecord[] };

export function ProductBrandJournal({
  isAdminPreviewMode,
  onBrandSaved,
  onShowToast,
}: {
  isAdminPreviewMode: boolean;
  onBrandSaved: () => void;
  onShowToast: ShowToast;
}) {
  const [form, setForm] = useState<FormState>(createEmptyForm);
  const [query, setQuery] = useState("");
  const [history, setHistory] = useState<HistoryState>({
    status: "loading",
    records: [],
  });
  const [editingRecordId, setEditingRecordId] = useState<string>();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formMessage, setFormMessage] = useState("");
  const [refreshVersion, setRefreshVersion] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setHistory((current) => ({ status: "loading", records: current.records }));
    requestProductBrandJournal(
      query.trim() === "" ? {} : { query: query.trim() },
      { signal: controller.signal },
    ).then((result) => {
      if (controller.signal.aborted) return;
      setHistory((current) => result.status === "ready"
        ? { status: "ready", records: result.records }
        : {
            status: "error",
            message: readShortUserMessage(
              result.message,
              "Не удалось загрузить журнал марок.",
            ),
            records: current.records,
          });
    });
    return () => controller.abort();
  }, [query, refreshVersion]);

  function updateField(field: keyof FormState, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
    setFormMessage("");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isAdminPreviewMode) return;

    const submission = buildSubmission(form);
    if (submission === undefined) {
      setFormMessage("Введите наименование марки.");
      return;
    }

    setIsSubmitting(true);
    setFormMessage("Сохраняем марку…");
    const result = editingRecordId === undefined
      ? await submitProductBrand(submission)
      : await correctProductBrand(editingRecordId, submission);
    setIsSubmitting(false);

    if (result.status === "error") {
      setFormMessage(readShortUserMessage(
        result.message,
        "Не удалось сохранить марку.",
      ));
      return;
    }

    const wasEditing = editingRecordId !== undefined;
    setEditingRecordId(undefined);
    setForm(createEmptyForm());
    setFormMessage("");
    setRefreshVersion((value) => value + 1);
    onBrandSaved();
    onShowToast(
      wasEditing ? "Марка исправлена" : "Марка добавлена",
      result.record.name,
    );
  }

  function editRecord(record: ProductBrandRecord) {
    setEditingRecordId(record.id);
    setForm(Object.fromEntries(
      productBrandFields.map((field) => [field.id, record[field.id]]),
    ) as FormState);
    setFormMessage("");
  }

  function cancelEditing() {
    setEditingRecordId(undefined);
    setForm(createEmptyForm());
    setFormMessage("");
  }

  return (
    <div className="product-brand-journal">
      <form
        className="laboratory-form product-brand-journal-form"
        onSubmit={submit}
      >
        <div className="sample-registration-journal-heading">
          <span className="eyebrow">Лаборатория</span>
          <h2>Журнал марок</h2>
          {editingRecordId === undefined
            ? <p>Наименование обязательно, остальные характеристики можно дополнять позднее.</p>
            : <p>{`Редактирование марки «${form.name}»`}</p>}
        </div>

        <div className="laboratory-form-grid product-brand-journal-form-grid">
          {productBrandFields.map((field) => (
            <label
              className={field.kind === "long_text" ? "laboratory-form-wide" : undefined}
              key={field.id}
            >
              <span>{field.label}</span>
              {field.kind === "long_text" ? (
                <textarea
                  disabled={isAdminPreviewMode || isSubmitting}
                  maxLength={field.maxLength}
                  value={form[field.id]}
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    updateField(field.id, value);
                  }}
                />
              ) : (
                <input
                  disabled={isAdminPreviewMode || isSubmitting}
                  maxLength={field.maxLength}
                  required={field.id === "name"}
                  value={form[field.id]}
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    updateField(field.id, value);
                  }}
                />
              )}
            </label>
          ))}
        </div>

        <div className="laboratory-form-actions">
          <button
            className="primary-button"
            disabled={isAdminPreviewMode || isSubmitting}
            type="submit"
          >
            {isSubmitting
              ? <LoadingIndicator label="Сохраняем…" variant="button" />
              : editingRecordId === undefined
                ? "Добавить марку"
                : "Сохранить изменения"}
          </button>
          {editingRecordId === undefined ? null : (
            <button
              className="secondary-button"
              disabled={isSubmitting}
              type="button"
              onClick={cancelEditing}
            >
              Отменить
            </button>
          )}
          {isAdminPreviewMode
            ? <small>В режиме просмотра сохранение отключено.</small>
            : null}
          {formMessage === "" ? null : (
            <span className="form-message" role="status">{formMessage}</span>
          )}
        </div>
      </form>

      <section className="laboratory-history product-brand-journal-history">
        <div className="laboratory-history-heading">
          <div>
            <span className="eyebrow">История</span>
            <h2>Журнал марок</h2>
          </div>
          <div className="laboratory-filters product-brand-journal-filters">
            <label>
              <span>Поиск</span>
              <input
                maxLength={120}
                placeholder="Наименование или характеристика"
                value={query}
                onChange={(event) => {
                  const value = event.currentTarget.value;
                  setQuery(value);
                }}
              />
            </label>
          </div>
        </div>
        {history.status === "loading"
          ? <LoadingIndicator label="Загружаем марки…" variant="inline" />
          : history.status === "error"
            ? <p className="form-message is-error" role="alert">{history.message}</p>
            : null}
        <ProductBrandJournalTable
          records={history.records}
          onEditRecord={isAdminPreviewMode ? undefined : editRecord}
        />
      </section>
    </div>
  );
}

function ProductBrandJournalTable({
  records,
  onEditRecord,
}: {
  records: ProductBrandRecord[];
  onEditRecord?: (record: ProductBrandRecord) => void;
}) {
  if (records.length === 0) {
    return <p className="laboratory-empty-note">По выбранному поиску марок нет.</p>;
  }

  return (
    <div className="table-scroll laboratory-table-scroll history-table-scroll">
      <table className="data-table laboratory-results-table product-brand-journal-table">
        <thead>
          <tr>
            {productBrandFields.map((field) => (
              <th key={field.id}>{field.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {records.map((record) => (
            <tr key={record.id}>
              {productBrandFields.map((field) => (
                <td key={field.id}>
                  {field.id === "name" && onEditRecord !== undefined ? (
                    <button
                      className="board-assignment-link product-brand-edit-link"
                      type="button"
                      onClick={() => onEditRecord(record)}
                    >
                      {record.name}
                    </button>
                  ) : record[field.id] === "" ? "—" : record[field.id]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function createEmptyForm(): FormState {
  return Object.fromEntries(
    productBrandFields.map((field) => [field.id, ""]),
  ) as FormState;
}

function buildSubmission(form: FormState): ProductBrandSubmission | undefined {
  const submission = Object.fromEntries(
    productBrandFields.map((field) => [field.id, form[field.id].trim()]),
  ) as ProductBrandSubmission;
  return submission.name === "" ? undefined : submission;
}
