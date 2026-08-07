import { useEffect, useState, type FormEvent } from "react";
import {
  productBrandFields,
  type ProductBrandRecord,
  type ProductBrandSubmission,
} from "./contracts";
import { LoadingIndicator } from "./LoadingIndicator";
import {
  correctProductBrand,
  deleteProductBrand,
  requestProductBrandDeletionImpact,
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
type DeletionDialogState = {
  source: ProductBrandRecord;
  usageCount: number;
  replacements: ProductBrandRecord[];
  replacementId: string;
  isDeleting: boolean;
  message: string;
};

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
  const [loadingDeletionId, setLoadingDeletionId] = useState<string>();
  const [deletionDialog, setDeletionDialog] =
    useState<DeletionDialogState>();

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

  async function prepareDeletion(record: ProductBrandRecord) {
    if (isAdminPreviewMode || loadingDeletionId !== undefined) return;
    setLoadingDeletionId(record.id);
    setFormMessage("");
    const impactResult = await requestProductBrandDeletionImpact(record.id);
    if (impactResult.status === "error") {
      setLoadingDeletionId(undefined);
      setFormMessage(readShortUserMessage(
        impactResult.message,
        "Не удалось проверить использование марки.",
      ));
      return;
    }

    let replacements: ProductBrandRecord[] = [];
    if (impactResult.impact.usageCount > 0) {
      const brandsResult = await requestProductBrandJournal();
      if (brandsResult.status === "error") {
        setLoadingDeletionId(undefined);
        setFormMessage(readShortUserMessage(
          brandsResult.message,
          "Не удалось загрузить марки для замены.",
        ));
        return;
      }
      replacements = brandsResult.records.filter((item) => item.id !== record.id);
    }

    setLoadingDeletionId(undefined);
    setDeletionDialog({
      source: record,
      usageCount: impactResult.impact.usageCount,
      replacements,
      replacementId: "",
      isDeleting: false,
      message: "",
    });
  }

  async function confirmDeletion() {
    const current = deletionDialog;
    if (current === undefined || current.isDeleting) return;
    if (current.usageCount > 0 && current.replacementId === "") {
      setDeletionDialog({ ...current, message: "Выберите марку для замены." });
      return;
    }
    setDeletionDialog({ ...current, isDeleting: true, message: "" });
    const result = await deleteProductBrand(
      current.source.id,
      current.replacementId === "" ? undefined : current.replacementId,
    );
    if (result.status === "error") {
      setDeletionDialog({
        ...current,
        isDeleting: false,
        message: readShortUserMessage(
          result.message,
          "Не удалось удалить марку.",
        ),
      });
      return;
    }

    if (editingRecordId === current.source.id) cancelEditing();
    setDeletionDialog(undefined);
    setRefreshVersion((value) => value + 1);
    onBrandSaved();
    onShowToast(
      result.deletion.replacementName === undefined
        ? "Марка удалена"
        : "Марки объединены",
      result.deletion.replacementName === undefined
        ? result.deletion.sourceName
        : `${result.deletion.sourceName} → ${result.deletion.replacementName}`,
    );
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
          onDeleteRecord={isAdminPreviewMode ? undefined : prepareDeletion}
          loadingDeletionId={loadingDeletionId}
        />
      </section>
      {deletionDialog === undefined ? null : (
        <ProductBrandDeleteDialog
          state={deletionDialog}
          onCancel={() => {
            if (!deletionDialog.isDeleting) setDeletionDialog(undefined);
          }}
          onConfirm={confirmDeletion}
          onReplacementChange={(replacementId) => {
            setDeletionDialog((current) => current === undefined
              ? current
              : { ...current, replacementId, message: "" });
          }}
        />
      )}
    </div>
  );
}

function ProductBrandJournalTable({
  records,
  onEditRecord,
  onDeleteRecord,
  loadingDeletionId,
}: {
  records: ProductBrandRecord[];
  onEditRecord?: (record: ProductBrandRecord) => void;
  onDeleteRecord?: (record: ProductBrandRecord) => void;
  loadingDeletionId?: string;
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
            {onDeleteRecord === undefined ? null : <th>Действия</th>}
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
              {onDeleteRecord === undefined ? null : (
                <td className="product-brand-journal-actions">
                  <button
                    aria-label={`Удалить марку ${record.name}`}
                    className="secondary-button secondary-button-danger product-brand-delete-button"
                    disabled={loadingDeletionId !== undefined}
                    type="button"
                    onClick={() => onDeleteRecord(record)}
                  >
                    {loadingDeletionId === record.id ? "Проверяем…" : "Удалить"}
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ProductBrandDeleteDialog({
  state,
  onCancel,
  onConfirm,
  onReplacementChange,
}: {
  state: DeletionDialogState;
  onCancel: () => void;
  onConfirm: () => void;
  onReplacementChange: (replacementId: string) => void;
}) {
  const titleId = "product-brand-delete-title";
  const hasUsage = state.usageCount > 0;

  return (
    <div
      className="admin-db-modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !state.isDeleting) onCancel();
      }}
    >
      <section
        aria-labelledby={titleId}
        aria-modal="true"
        className="admin-db-editor admin-db-clear-dialog product-brand-delete-dialog"
        role="dialog"
      >
        <div className="admin-db-clear-copy">
          <span>{hasUsage ? "Объединение марок" : "Удаление марки"}</span>
          <strong id={titleId}>Удалить «{state.source.name}»?</strong>
          {hasUsage ? (
            <p>
              {`Марка используется в ${formatUsageCount(state.usageCount)}. `}
              Выберите другое наименование: все текущие записи будут перенесены на него,
              а исходная марка исчезнет из списка.
            </p>
          ) : (
            <p>Марка не используется в журналах и будет удалена из списка.</p>
          )}
        </div>
        {hasUsage ? (
          <label className="admin-db-editor-field">
            <span>Марка для замены</span>
            <select
              disabled={state.isDeleting}
              value={state.replacementId}
              onChange={(event) => {
                const replacementId = event.currentTarget.value;
                onReplacementChange(replacementId);
              }}
            >
              <option value="">Выберите существующую марку</option>
              {state.replacements.map((record) => (
                <option key={record.id} value={record.id}>{record.name}</option>
              ))}
            </select>
          </label>
        ) : null}
        {state.message === "" ? null : (
          <p className="form-message is-error" role="alert">{state.message}</p>
        )}
        <div className="admin-db-actions">
          <button
            className="secondary-button"
            disabled={state.isDeleting}
            type="button"
            onClick={onCancel}
          >
            Отмена
          </button>
          <button
            className="secondary-button secondary-button-danger"
            disabled={state.isDeleting || (hasUsage && state.replacementId === "")}
            type="button"
            onClick={onConfirm}
          >
            {state.isDeleting
              ? <LoadingIndicator label="Удаляем…" variant="button" />
              : hasUsage ? "Объединить и удалить" : "Удалить марку"}
          </button>
        </div>
      </section>
    </div>
  );
}

function formatUsageCount(value: number) {
  const lastTwo = value % 100;
  const last = value % 10;
  const noun = lastTwo >= 11 && lastTwo <= 14
    ? "записях"
    : last === 1
      ? "записи"
      : "записях";
  return `${value} ${noun}`;
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
