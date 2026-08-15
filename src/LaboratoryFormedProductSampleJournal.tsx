import { useEffect, useState, type FormEvent } from "react";
import type {
  LaboratoryFormedProductSampleRecord,
  LaboratoryFormedProductSampleSubmission,
  LaboratorySampleRegistrationTransmissionOption,
} from "./contracts";
import { LaboratoryFormedProductSampleTable } from "./LaboratoryJournalTables";
import { LoadingIndicator } from "./LoadingIndicator";
import { ProductBrandPicker } from "./ProductBrandPicker";
import { SampleRegistrationTransmissionPicker } from "./SampleRegistrationTransmissionPicker";
import {
  correctLaboratoryFormedProductSampleRecord,
  requestLaboratoryFormedProductSampleJournal,
  requestLaboratoryFormedProductSampleWagonLookup,
  submitLaboratoryFormedProductSampleRecord,
} from "./services/laboratoryFormedProductSampleJournal";
import { readShortUserMessage } from "./services/userFacingMessages";
import type { ShowToast } from "./services/toastStack";
import { useProductionBrands } from "./useProductionBrands";

type FormState = {
  sortingDate: string;
  wagonNumber: string;
  sampleCode: string;
  productBrand: string;
};
/**
 * Доработка задачи 64 вернула трансляцию из Регистрации проб рядом с
 * вагонным путём задачи 79 — ровно один источник провенанса на запись.
 */
type SourceMode = "wagon" | "transmission";
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
  const [sourceMode, setSourceMode] = useState<SourceMode>("wagon");
  const [sourceSampleRegistrationId, setSourceSampleRegistrationId] =
    useState<string>();
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
  const { labels: productNames, loadState: productNamesLoadState } =
    useProductionBrands();

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
    if (sourceMode !== "wagon") {
      setWagonLookup({ status: "idle" });
      return;
    }
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
  }, [sourceMode, form.wagonNumber, form.sortingDate]);

  function updateField(field: keyof FormState, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
    setFormMessage("");
  }

  function selectTransmission(
    option: LaboratorySampleRegistrationTransmissionOption | undefined,
  ) {
    setSourceSampleRegistrationId(option?.id);
    setSourceMode(option === undefined ? "wagon" : "transmission");
    if (option === undefined) return;
    setForm((current) => ({
      ...current,
      sortingDate: current.sortingDate === ""
        ? option.samplingDate
        : current.sortingDate,
      sampleCode: current.sampleCode === ""
        ? option.laboratorySampleCode
        : current.sampleCode,
      productBrand: current.productBrand === ""
        ? option.sampleName
        : current.productBrand,
    }));
    setFormMessage("");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isAdminPreviewMode) return;

    const submission = buildFormRecord(
      form,
      sourceMode,
      sourceSampleRegistrationId,
    );
    if (
      submission === undefined ||
      (sourceMode === "wagon" && wagonLookup.status !== "ready")
    ) {
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
      `${result.record.wagonNumber ?? result.record.sampleCode ?? "—"} · ${result.record.productBrand}.`,
      "success",
    );
  }

  function editRecord(record: LaboratoryFormedProductSampleRecord) {
    const mode: SourceMode = record.wagonNumber === null
      ? "transmission"
      : "wagon";
    setSourceMode(mode);
    setSourceSampleRegistrationId(undefined);
    setEditingRecordId(record.id);
    setForm({
      sortingDate: record.sortingDate,
      wagonNumber: record.wagonNumber ?? "",
      sampleCode: record.sampleCode ?? "",
      productBrand: mode === "transmission" ? record.productBrand : "",
    });
    setFormMessage("");
  }

  function resetForm() {
    setEditingRecordId(undefined);
    setSourceMode("wagon");
    setSourceSampleRegistrationId(undefined);
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
            : <p>Редактирование пробы {form.wagonNumber || form.sampleCode}</p>}
        </div>

        {editingRecordId === undefined
          ? (
              <SampleRegistrationTransmissionPicker
                disabled={isAdminPreviewMode}
                target="formed_product_sample"
                onSelect={selectTransmission}
              />
            )
          : null}

        <section className="sample-registration-journal-section">
          <h3>Регистрация пробы</h3>
          <div className="laboratory-form-grid">
            <label>
              <span>Дата сортировки</span>
              <input
                required
                type="date"
                value={form.sortingDate}
                onChange={(event) => {
                  const value = event.currentTarget.value;
                  updateField("sortingDate", value);
                }}
              />
            </label>
            {sourceMode === "wagon"
              ? (
                  <>
                    <label>
                      <span>№ вагона</span>
                      <input
                        required
                        maxLength={120}
                        type="text"
                        value={form.wagonNumber}
                        onChange={(event) => {
                          const value = event.currentTarget.value;
                          updateField("wagonNumber", value);
                        }}
                      />
                    </label>
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
                  </>
                )
              : (
                  <>
                    <label>
                      <span>Код пробы</span>
                      <input
                        required
                        maxLength={120}
                        type="text"
                        value={form.sampleCode}
                        onChange={(event) => {
                          const value = event.currentTarget.value;
                          updateField("sampleCode", value);
                        }}
                      />
                    </label>
                    <label>
                      <span>Марка изделия</span>
                      <ProductBrandPicker
                        ariaLabel="Марка изделия"
                        disabled={isAdminPreviewMode ||
                          productNamesLoadState.status !== "ready"}
                        labels={productNames}
                        name="productBrand"
                        value={form.productBrand}
                        onChange={(value) => updateField("productBrand", value)}
                      />
                    </label>
                  </>
                )}
          </div>
          {sourceMode === "wagon" && wagonLookup.status === "loading"
            ? <LoadingIndicator label="Ищем вагон…" variant="inline" />
            : sourceMode === "wagon" && wagonLookup.status === "error"
              ? (
                  <p className="form-message is-error" role="alert">
                    {wagonLookup.message}
                  </p>
                )
              : null}
          {sourceMode === "transmission" &&
              productNamesLoadState.status === "error"
            ? (
                <p className="form-message is-error" role="alert">
                  {productNamesLoadState.message}
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
              (sourceMode === "wagon" && wagonLookup.status !== "ready")
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
                placeholder="Номер вагона, код пробы или марка"
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
    sampleCode: "",
    productBrand: "",
  };
}

function buildFormRecord(
  form: FormState,
  sourceMode: SourceMode,
  sourceSampleRegistrationId: string | undefined,
): LaboratoryFormedProductSampleSubmission | undefined {
  const sortingDate = form.sortingDate;
  if (sortingDate === "") return undefined;

  if (sourceMode === "wagon") {
    const wagonNumber = form.wagonNumber.trim();
    if (wagonNumber === "") return undefined;
    return { sortingDate, wagonNumber };
  }

  const sampleCode = form.sampleCode.trim();
  const productBrand = form.productBrand.trim();
  if (sampleCode === "" || productBrand === "") return undefined;
  return {
    sortingDate,
    sampleCode,
    productBrand,
    ...(sourceSampleRegistrationId === undefined
      ? {}
      : { sourceSampleRegistrationId }),
  };
}
