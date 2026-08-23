import { useEffect, useId, useState, type FormEvent } from "react";
import {
  laboratorySampleRegistrationSamplingLocations,
  laboratoryVerificationFields,
  type LaboratorySampleRegistrationTransmissionOption,
  type LaboratoryVerificationRecord,
  type LaboratoryVerificationSubmission,
} from "./contracts";
import { LaboratoryVerificationTable } from "./LaboratoryJournalTables";
import { LoadingIndicator } from "./LoadingIndicator";
import { ProductBrandPicker } from "./ProductBrandPicker";
import { SampleRegistrationTransmissionPicker } from "./SampleRegistrationTransmissionPicker";
import {
  correctLaboratoryVerificationRecord,
  requestLaboratoryVerificationJournal,
  submitLaboratoryVerificationRecord,
} from "./services/laboratoryVerificationJournal";
import { readShortUserMessage } from "./services/userFacingMessages";
import type { ShowToast } from "./services/toastStack";
import { useRawMaterialNomenclature } from "./useRawMaterialNomenclature";

type FormState = Record<
  Exclude<keyof LaboratoryVerificationSubmission, "sourceSampleRegistrationId">,
  string
>;
type HistoryState =
  | { status: "loading"; records: LaboratoryVerificationRecord[] }
  | { status: "ready"; records: LaboratoryVerificationRecord[] }
  | {
      status: "error";
      message: string;
      records: LaboratoryVerificationRecord[];
    };

export function LaboratoryVerificationJournal({
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
  const [sourceSampleRegistrationId, setSourceSampleRegistrationId] =
    useState<string>();
  /**
   * Доработка задачи 95: наименование продукции выбирается из `Номенклатура →
   * Сырьё`, а не из журнала марок.
   */
  const { labels: productNames, loadState: productNamesLoadState } =
    useRawMaterialNomenclature();
  const samplingLocationListId =
    `verification-sampling-locations-${useId().replaceAll(":", "")}`;

  useEffect(() => {
    const controller = new AbortController();
    setHistory((current) => ({ status: "loading", records: current.records }));
    requestLaboratoryVerificationJournal(
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
              "Не удалось загрузить журнал верификаций.",
            ),
            records: current.records,
          });
    });
    return () => controller.abort();
  }, [dateFrom, dateTo, query, refreshVersion]);

  function updateField(field: keyof FormState, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
    setFormMessage("");
  }

  function selectTransmission(
    option: LaboratorySampleRegistrationTransmissionOption | undefined,
  ) {
    setSourceSampleRegistrationId(option?.id);
    if (option === undefined) return;
    setForm((current) => ({
      ...current,
      verificationDate: current.verificationDate === ""
        ? option.samplingDate
        : current.verificationDate,
      productName: current.productName === ""
        ? option.sampleName
        : current.productName,
      samplingLocation: current.samplingLocation === ""
        ? option.samplingLocation
        : current.samplingLocation,
      sampleCode: current.sampleCode === ""
        ? option.laboratorySampleCode
        : current.sampleCode,
    }));
    setFormMessage("");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isAdminPreviewMode) return;

    const submission = buildFormRecord(form, sourceSampleRegistrationId);
    if (submission === undefined) {
      setFormMessage("Заполните все обязательные поля.");
      return;
    }

    setIsSubmitting(true);
    setFormMessage("Сохраняем запись…");
    const result = editingRecordId === undefined
      ? await submitLaboratoryVerificationRecord(submission)
      : await correctLaboratoryVerificationRecord(editingRecordId, submission);
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
      wasEditing ? "Запись исправлена" : "Запись сохранена",
      `${result.record.sampleCode} · ${result.record.productName}.`,
      "success",
    );
  }

  function editRecord(record: LaboratoryVerificationRecord) {
    setEditingRecordId(record.id);
    setForm({
      verificationDate: record.verificationDate,
      productName: record.productName,
      samplingLocation: record.samplingLocation,
      sampleCode: record.sampleCode,
    });
    setFormMessage("");
  }

  function resetForm() {
    setEditingRecordId(undefined);
    setSourceSampleRegistrationId(undefined);
    setForm(createEmptyForm());
  }

  return (
    <div className="verification-journal">
      <form className="laboratory-form verification-form" onSubmit={submit}>
        <div className="sample-registration-journal-heading">
          <span className="eyebrow">Лаборатория · ОТК</span>
          <h2>Верификации</h2>
          {editingRecordId === undefined
            ? null
            : <p>Редактирование записи {form.sampleCode}</p>}
        </div>

        {editingRecordId === undefined
          ? (
              <SampleRegistrationTransmissionPicker
                disabled={isAdminPreviewMode}
                target="verification"
                onSelect={selectTransmission}
              />
            )
          : null}

        <section className="sample-registration-journal-section">
          <h3>Регистрация записи</h3>
          <div className="laboratory-form-grid">
            {laboratoryVerificationFields.map((field) => {
              if (field.id === "productName") {
                return (
                  <label key={field.id}>
                    <span>{field.label}</span>
                    <ProductBrandPicker
                      ariaLabel={field.label}
                      disabled={isAdminPreviewMode ||
                        productNamesLoadState.status !== "ready"}
                      labels={productNames}
                      name={field.id}
                      placeholder="Поиск сырья"
                      value={form.productName}
                      onChange={(value) => updateField("productName", value)}
                    />
                  </label>
                );
              }
              if (field.id === "samplingLocation") {
                return (
                  <label key={field.id}>
                    <span>{field.label}</span>
                    <input
                      required
                      list={samplingLocationListId}
                      maxLength={120}
                      placeholder="Выберите или введите новое место"
                      value={form.samplingLocation}
                      onChange={(event) => {
                        const value = event.currentTarget.value;
                        updateField("samplingLocation", value);
                      }}
                    />
                    <datalist id={samplingLocationListId}>
                      {laboratorySampleRegistrationSamplingLocations.map(
                        (location) => <option key={location} value={location} />,
                      )}
                    </datalist>
                  </label>
                );
              }
              return (
                <label key={field.id}>
                  <span>{field.label}</span>
                  <input
                    required
                    maxLength={field.kind === "text" ? 120 : undefined}
                    type={field.kind === "date" ? "date" : "text"}
                    value={form[field.id]}
                    onChange={(event) => {
                      const value = event.currentTarget.value;
                      updateField(field.id, value);
                    }}
                  />
                </label>
              );
            })}
          </div>
          {productNamesLoadState.status === "error"
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
              productNamesLoadState.status !== "ready"
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

      <section className="laboratory-history verification-history">
        <div className="laboratory-history-heading">
          <div>
            <span className="eyebrow">История</span>
            <h2>Верификации</h2>
          </div>
          <div className="laboratory-filters verification-filters">
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
                placeholder="Код пробы, продукция или место"
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
        <LaboratoryVerificationTable
          records={history.records}
          onEditRecord={isAdminPreviewMode ? undefined : editRecord}
        />
      </section>
    </div>
  );
}

function createEmptyForm(): FormState {
  return {
    verificationDate: "",
    productName: "",
    samplingLocation: "",
    sampleCode: "",
  };
}

function buildFormRecord(
  form: FormState,
  sourceSampleRegistrationId: string | undefined,
): LaboratoryVerificationSubmission | undefined {
  const requiredFields = [
    "verificationDate",
    "productName",
    "samplingLocation",
    "sampleCode",
  ] as const;
  if (requiredFields.some((field) => form[field].trim() === "")) {
    return undefined;
  }

  return {
    verificationDate: form.verificationDate,
    productName: form.productName.trim(),
    samplingLocation: form.samplingLocation.trim(),
    sampleCode: form.sampleCode.trim(),
    ...(sourceSampleRegistrationId === undefined
      ? {}
      : { sourceSampleRegistrationId }),
  };
}
