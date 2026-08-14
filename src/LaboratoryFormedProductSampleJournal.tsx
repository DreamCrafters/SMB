import { useEffect, useState, type FormEvent } from "react";
import {
  laboratoryFormedProductSampleFields,
  type LaboratoryFormedProductSampleRecord,
} from "./contracts";
import { LaboratoryFormedProductSampleTable } from "./LaboratoryJournalTables";
import { LoadingIndicator } from "./LoadingIndicator";
import {
  correctLaboratoryFormedProductSampleRecord,
  requestLaboratoryFormedProductSampleJournal,
  requestLaboratoryFormedProductSampleWagonLookup,
  submitLaboratoryFormedProductSampleRecord,
} from "./services/laboratoryFormedProductSampleJournal";
import { readShortUserMessage } from "./services/userFacingMessages";
import type { ShowToast } from "./services/toastStack";

type FormState = { sortingDate: string; wagonNumber: string };
type HistoryState =
  | { status: "loading"; records: LaboratoryFormedProductSampleRecord[] }
  | { status: "ready"; records: LaboratoryFormedProductSampleRecord[] }
  | {
      status: "error";
      message: string;
      records: LaboratoryFormedProductSampleRecord[];
    };
type WagonLookupState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; productBrand: string; moldingDate: string }
  | { status: "error"; message: string };

export function LaboratoryFormedProductSampleJournal({
  isAdminPreviewMode,
  onShowToast,
}: {
  isAdminPreviewMode: boolean;
  onShowToast: ShowToast;
}) {
  const [form, setForm] = useState(createEmptyForm);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [query, setQuery] = useState("");
  const [history, setHistory] = useState<HistoryState>({
    status: "loading",
    records: [],
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formMessage, setFormMessage] = useState("");
  const [editingRecordId, setEditingRecordId] = useState<string>();
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [wagonLookup, setWagonLookup] = useState<WagonLookupState>({
    status: "idle",
  });

  useEffect(() => {
    const controller = new AbortController();
    setHistory((current) => ({ status: "loading", records: current.records }));
    requestLaboratoryFormedProductSampleJournal(
      {
        ...(dateFrom === "" ? {} : { dateFrom }),
        ...(dateTo === "" ? {} : { dateTo }),
        ...(query.trim() === "" ? {} : { query: query.trim() }),
      },
      { signal: controller.signal },
    ).then((result) => {
      if (controller.signal.aborted) return;
      setHistory((current) => result.status === "ready"
        ? { status: "ready", records: result.records }
        : {
            status: "error",
            message: readShortUserMessage(
              result.message,
              "Не удалось загрузить журнал регистрации проб формованной продукции.",
            ),
            records: current.records,
          });
    });
    return () => controller.abort();
  }, [dateFrom, dateTo, query, refreshVersion]);

  useEffect(() => {
    const wagonNumber = form.wagonNumber.trim();
    const sortingDate = form.sortingDate;
    if (wagonNumber === "" || sortingDate === "") {
      setWagonLookup({ status: "idle" });
      return;
    }
    const controller = new AbortController();
    setWagonLookup({ status: "loading" });
    requestLaboratoryFormedProductSampleWagonLookup(
      wagonNumber,
      sortingDate,
      { signal: controller.signal },
    ).then((result) => {
      if (controller.signal.aborted) return;
      setWagonLookup(result.status === "ready"
        ? {
            status: "ready",
            productBrand: result.productBrand,
            moldingDate: result.moldingDate,
          }
        : {
            status: "error",
            message: readShortUserMessage(
              result.message,
              "Вагон с таким номером и датой сортировки не найден.",
            ),
          });
    });
    return () => controller.abort();
  }, [form.wagonNumber, form.sortingDate]);

  function updateField(field: keyof FormState, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
    setFormMessage("");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isAdminPreviewMode) return;

    const submission = buildFormRecord(form);
    if (submission === undefined || wagonLookup.status !== "ready") {
      setFormMessage("Заполните все обязательные поля.");
      return;
    }

    setIsSubmitting(true);
    setFormMessage("Сохраняем запись…");
    const result = editingRecordId === undefined
      ? await submitLaboratoryFormedProductSampleRecord(submission)
      : await correctLaboratoryFormedProductSampleRecord(
          editingRecordId,
          submission,
        );
    setIsSubmitting(false);

    if (result.status === "error") {
      setFormMessage(readShortUserMessage(
        result.message,
        "Не удалось сохранить запись журнала.",
      ));
      return;
    }

    const wasEditing = editingRecordId !== undefined;
    resetForm();
    setRefreshVersion((value) => value + 1);
    onShowToast(
      wasEditing ? "Проба исправлена" : "Запись сохранена",
      `${result.record.wagonNumber ?? "—"} · ${result.record.productBrand}.`,
      "success",
    );
  }

  function editRecord(record: LaboratoryFormedProductSampleRecord) {
    setEditingRecordId(record.id);
    setForm({
      sortingDate: record.sortingDate,
      wagonNumber: record.wagonNumber ?? "",
    });
    setFormMessage("");
  }

  function resetForm() {
    setEditingRecordId(undefined);
    setForm(createEmptyForm());
  }

  return (
    <div className="formed-product-sample-journal">
      <form
        className="laboratory-form formed-product-sample-form"
        onSubmit={submit}
      >
        <div className="sample-registration-journal-heading">
          <span className="eyebrow">Лаборатория · ОТК</span>
          <h2>Регистрация проб готовой формованной продукции (кирпича)</h2>
          {editingRecordId === undefined
            ? null
            : <p>Редактирование пробы {form.wagonNumber}</p>}
        </div>

        <section className="sample-registration-journal-section">
          <h3>Регистрация пробы</h3>
          <div className="laboratory-form-grid">
            {laboratoryFormedProductSampleFields.map((field) => {
              if (!field.editable) return null;
              return (
                <label key={field.id}>
                  <span>{field.label}</span>
                  <input
                    required
                    maxLength={field.kind === "text" ? 120 : undefined}
                    type={field.kind === "date" ? "date" : "text"}
                    value={form[field.id as keyof FormState]}
                    onChange={(event) => {
                      const value = event.currentTarget.value;
                      updateField(field.id as keyof FormState, value);
                    }}
                  />
                </label>
              );
            })}
            <label>
              <span>Марка изделия</span>
              <input
                disabled
                placeholder="Определится по вагону и дате сортировки"
                value={wagonLookup.status === "ready"
                  ? wagonLookup.productBrand
                  : ""}
              />
            </label>
            <label>
              <span>Дата формовки</span>
              <input
                disabled
                placeholder="Определится по вагону и дате сортировки"
                value={wagonLookup.status === "ready"
                  ? wagonLookup.moldingDate
                  : ""}
              />
            </label>
          </div>
          {wagonLookup.status === "loading"
            ? <LoadingIndicator label="Ищем вагон…" variant="inline" />
            : wagonLookup.status === "error"
              ? (
                  <p className="form-message is-error" role="alert">
                    {wagonLookup.message}
                  </p>
                )
              : null}
        </section>

        <div className="laboratory-form-actions">
          <button
            className="primary-button"
            disabled={
              isAdminPreviewMode ||
              isSubmitting ||
              wagonLookup.status !== "ready"
            }
            type="submit"
          >
            {isSubmitting
              ? <LoadingIndicator label="Сохраняем…" variant="button" />
              : editingRecordId === undefined
                ? "Внести данные"
                : "Сохранить изменения"}
          </button>
          {editingRecordId === undefined
            ? null
            : (
                <button
                  className="secondary-button"
                  disabled={isSubmitting}
                  type="button"
                  onClick={() => {
                    resetForm();
                    setFormMessage("");
                    setRefreshVersion((value) => value + 1);
                  }}
                >
                  Отменить
                </button>
              )}
          {isAdminPreviewMode
            ? <small>В режиме просмотра сохранение отключено.</small>
            : null}
          {formMessage === ""
            ? null
            : <span className="form-message" role="status">{formMessage}</span>}
        </div>
      </form>

      <section className="laboratory-history formed-product-sample-history">
        <div className="laboratory-history-heading">
          <div>
            <span className="eyebrow">История</span>
            <h2>Пробы формованной продукции</h2>
          </div>
          <div className="laboratory-filters formed-product-sample-filters">
            <label>
              <span>Дата с</span>
              <input type="date" value={dateFrom} onChange={(event) => {
                const value = event.currentTarget.value;
                setDateFrom(value);
              }} />
            </label>
            <label>
              <span>Дата по</span>
              <input type="date" value={dateTo} onChange={(event) => {
                const value = event.currentTarget.value;
                setDateTo(value);
              }} />
            </label>
            <label>
              <span>Поиск</span>
              <input
                maxLength={120}
                placeholder="Номер вагона или марка"
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
          ? <LoadingIndicator label="Загружаем записи…" variant="inline" />
          : history.status === "error"
            ? <p className="form-message is-error" role="alert">{history.message}</p>
            : null}
        <LaboratoryFormedProductSampleTable
          records={history.records}
          onEditRecord={isAdminPreviewMode ? undefined : editRecord}
        />
      </section>
    </div>
  );
}

function createEmptyForm(): FormState {
  return {
    sortingDate: "",
    wagonNumber: "",
  };
}

function buildFormRecord(form: FormState) {
  const sortingDate = form.sortingDate;
  const wagonNumber = form.wagonNumber.trim();
  if (sortingDate === "" || wagonNumber === "") return undefined;

  return { sortingDate, wagonNumber };
}
