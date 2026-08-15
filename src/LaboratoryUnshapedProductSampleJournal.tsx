import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  buildLaboratoryUnshapedProductSampleCodeDraft,
  laboratoryUnshapedProductSampleFields,
  laboratoryUnshapedProductSampleSuitabilityLabels,
  laboratoryUnshapedProductSampleSuitabilityValues,
  type LaboratorySampleRegistrationTransmissionOption,
  type LaboratoryUnshapedProductSampleRecord,
  type LaboratoryUnshapedProductSampleSubmission,
  type ServerUserProfile,
} from "./contracts";
import { LaboratoryUnshapedProductSampleTable } from "./LaboratoryJournalTables";
import { LoadingIndicator } from "./LoadingIndicator";
import { ProductBrandPicker } from "./ProductBrandPicker";
import { SampleRegistrationTransmissionPicker } from "./SampleRegistrationTransmissionPicker";
import {
  correctLaboratoryUnshapedProductSampleRecord,
  requestLaboratoryUnshapedProductSampleDraft,
  requestLaboratoryUnshapedProductSampleJournal,
  submitLaboratoryUnshapedProductSampleRecord,
} from "./services/laboratoryUnshapedProductSampleJournal";
import { readShortUserMessage } from "./services/userFacingMessages";
import type { ShowToast } from "./services/toastStack";
import { useProductionBrands } from "./useProductionBrands";

type FormState = Record<
  Exclude<
    keyof LaboratoryUnshapedProductSampleSubmission,
    "sourceSampleRegistrationId"
  >,
  string
>;
type HistoryState =
  | { status: "loading"; records: LaboratoryUnshapedProductSampleRecord[] }
  | { status: "ready"; records: LaboratoryUnshapedProductSampleRecord[] }
  | {
      status: "error";
      message: string;
      records: LaboratoryUnshapedProductSampleRecord[];
    };

export function LaboratoryUnshapedProductSampleJournal({
  profile,
  isAdminPreviewMode,
  onShowToast,
}: {
  profile: ServerUserProfile;
  isAdminPreviewMode: boolean;
  onShowToast: ShowToast;
}) {
  const [form, setForm] = useState(createEmptyForm);
  const [chemicalAnalysisNumber, setChemicalAnalysisNumber] = useState("");
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
  const isSampleCodeAuto = useRef(true);
  const sampleCodeYear = useRef<number | undefined>(undefined);
  const { labels: productNames, loadState: productNamesLoadState } =
    useProductionBrands();

  useEffect(() => {
    if (isAdminPreviewMode || editingRecordId !== undefined) return;
    const controller = new AbortController();
    requestLaboratoryUnshapedProductSampleDraft({
      signal: controller.signal,
    }).then((result) => {
      if (controller.signal.aborted) return;
      if (result.status === "ready") {
        sampleCodeYear.current = result.currentYear;
        setForm((current) => {
          const sampleNumber = current.sampleNumber === ""
            ? result.sampleNumber
            : current.sampleNumber;
          return {
            ...current,
            sampleNumber,
            sampleCode: isSampleCodeAuto.current && current.sampleCode === ""
              ? current.sampleNumber === ""
                ? result.sampleCode
                : buildLaboratoryUnshapedProductSampleCodeDraft(
                    sampleNumber,
                    result.currentYear,
                  )
              : current.sampleCode,
            sampleDate: current.sampleDate === ""
              ? result.sampleDate
              : current.sampleDate,
            sampledBy: current.sampledBy === ""
              ? result.sampledBy || profile.displayName
              : current.sampledBy,
          };
        });
        return;
      }
      setFormMessage((current) => current === ""
        ? readShortUserMessage(
            result.message,
            "Не удалось загрузить заготовку пробы.",
          )
        : current);
    });
    return () => controller.abort();
  }, [editingRecordId, isAdminPreviewMode, profile.displayName, refreshVersion]);

  useEffect(() => {
    const controller = new AbortController();
    setHistory((current) => ({ status: "loading", records: current.records }));
    requestLaboratoryUnshapedProductSampleJournal(
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
              "Не удалось загрузить журнал проб неформованной продукции.",
            ),
            records: current.records,
          });
    });
    return () => controller.abort();
  }, [dateFrom, dateTo, query, refreshVersion]);

  function updateField(field: keyof FormState, value: string) {
    if (field === "sampleCode") isSampleCodeAuto.current = false;
    setForm((current) => {
      if (field !== "sampleNumber") return { ...current, [field]: value };
      const currentYear = sampleCodeYear.current;
      return {
        ...current,
        sampleNumber: value,
        ...(isSampleCodeAuto.current && currentYear !== undefined
          ? {
              sampleCode: buildLaboratoryUnshapedProductSampleCodeDraft(
                value,
                currentYear,
              ),
            }
          : {}),
      };
    });
    setFormMessage("");
  }

  function selectTransmission(
    option: LaboratorySampleRegistrationTransmissionOption | undefined,
  ) {
    setSourceSampleRegistrationId(option?.id);
    if (option === undefined) return;
    if (option.sampleNumber !== "") isSampleCodeAuto.current = false;
    setForm((current) => ({
      ...current,
      sampleNumber: current.sampleNumber === ""
        ? option.sampleNumber
        : current.sampleNumber,
      sampleDate: current.sampleDate === ""
        ? option.samplingDate
        : current.sampleDate,
      sampledBy: current.sampledBy === ""
        ? option.samplingLaboratoryAssistant
        : current.sampledBy,
      sampleCode: current.sampleCode === ""
        ? option.laboratorySampleCode
        : current.sampleCode,
      productName: current.productName === ""
        ? option.sampleName
        : current.productName,
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
      ? await submitLaboratoryUnshapedProductSampleRecord(submission)
      : await correctLaboratoryUnshapedProductSampleRecord(
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
      `${result.record.sampleNumber} · ${result.record.sampleCode}.`,
      "success",
    );
  }

  function editRecord(record: LaboratoryUnshapedProductSampleRecord) {
    isSampleCodeAuto.current = false;
    setEditingRecordId(record.id);
    setChemicalAnalysisNumber(record.chemicalAnalysisNumber ?? "");
    setForm({
      sampleNumber: record.sampleNumber,
      sampleDate: record.sampleDate,
      sampledBy: record.sampledBy,
      batchNumber: record.batchNumber,
      sampleCode: record.sampleCode,
      productName: record.productName,
      batchMass: record.batchMass,
      moisture: record.moisture,
      grainComposition: record.grainComposition,
      fireResistance: record.fireResistance,
      suitability: record.suitability,
      notes: record.notes ?? "",
    });
    setFormMessage("");
  }

  function resetForm() {
    isSampleCodeAuto.current = true;
    setEditingRecordId(undefined);
    setChemicalAnalysisNumber("");
    setSourceSampleRegistrationId(undefined);
    setForm(createEmptyForm());
  }

  return (
    <div className="unshaped-product-sample-journal">
      <form
        className="laboratory-form unshaped-product-sample-form"
        onSubmit={submit}
      >
        <div className="sample-registration-journal-heading">
          <span className="eyebrow">Лаборатория · ЦЗЛ</span>
          <h2>Пробы неформованной продукции</h2>
          {editingRecordId === undefined
            ? null
            : <p>Редактирование пробы {form.sampleCode}</p>}
        </div>

        {editingRecordId === undefined
          ? (
              <SampleRegistrationTransmissionPicker
                disabled={isAdminPreviewMode}
                target="unshaped_product_sample"
                onSelect={selectTransmission}
              />
            )
          : null}

        <section className="sample-registration-journal-section">
          <h3>Регистрация пробы</h3>
          <div className="laboratory-form-grid unshaped-product-sample-form-grid">
            {laboratoryUnshapedProductSampleFields.map((field) => {
              if (field.id === "sampleNumber") {
                return (
                  <label key={field.id}>
                    <span>{field.label}</span>
                    <input
                      disabled
                      placeholder="Присваивается в Регистрации проб"
                      value={form.sampleNumber}
                    />
                  </label>
                );
              }
              if (field.id === "chemicalAnalysisNumber") {
                return (
                  <label key={field.id}>
                    <span>{field.label}</span>
                    <input
                      disabled
                      placeholder="Проставится после химанализа"
                      value={chemicalAnalysisNumber}
                    />
                  </label>
                );
              }
              if (field.id === "productName") {
                return (
                  <label key={field.id}>
                    <span>{field.label}</span>
                    <ProductBrandPicker
                      ariaLabel={field.label}
                      disabled={isAdminPreviewMode || productNamesLoadState.status !== "ready"}
                      labels={productNames}
                      name={field.id}
                      value={form.productName}
                      onChange={(value) => updateField("productName", value)}
                    />
                  </label>
                );
              }
              if (field.id === "suitability") {
                return (
                  <label key={field.id}>
                    <span>{field.label}</span>
                    <select
                      required
                      value={form.suitability}
                      onChange={(event) => {
                        const value = event.currentTarget.value;
                        updateField("suitability", value);
                      }}
                    >
                      <option value="">Выберите значение</option>
                      {laboratoryUnshapedProductSampleSuitabilityValues.map(
                        (value) => (
                          <option key={value} value={value}>
                            {laboratoryUnshapedProductSampleSuitabilityLabels[value]}
                          </option>
                        ),
                      )}
                    </select>
                  </label>
                );
              }
              if (field.id === "notes") {
                return (
                  <label className="laboratory-form-wide" key={field.id}>
                    <span>{field.label}</span>
                    <textarea
                      maxLength={2000}
                      value={form.notes}
                      onChange={(event) => {
                        const value = event.currentTarget.value;
                        updateField("notes", value);
                      }}
                    />
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
          {formMessage === ""
            ? null
            : <span className="form-message" role="status">{formMessage}</span>}
        </div>
      </form>

      <section className="laboratory-history unshaped-product-sample-history">
        <div className="laboratory-history-heading">
          <div>
            <span className="eyebrow">История</span>
            <h2>Пробы неформованной продукции</h2>
          </div>
          <div className="laboratory-filters unshaped-product-sample-filters">
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
                placeholder="Номер, код, партия или продукция"
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
        <LaboratoryUnshapedProductSampleTable
          records={history.records}
          onEditRecord={isAdminPreviewMode ? undefined : editRecord}
        />
      </section>
    </div>
  );
}

function createEmptyForm(): FormState {
  return {
    sampleNumber: "",
    sampleDate: "",
    sampledBy: "",
    batchNumber: "",
    sampleCode: "",
    productName: "",
    batchMass: "",
    moisture: "",
    grainComposition: "",
    fireResistance: "",
    suitability: "",
    notes: "",
  };
}

function buildFormRecord(
  form: FormState,
  sourceSampleRegistrationId: string | undefined,
): LaboratoryUnshapedProductSampleSubmission | undefined {
  const requiredFields = [
    "sampleNumber",
    "sampleDate",
    "sampledBy",
    "batchNumber",
    "sampleCode",
    "productName",
    "batchMass",
    "moisture",
    "grainComposition",
    "fireResistance",
    "suitability",
  ] as const;
  if (requiredFields.some((field) => form[field].trim() === "")) {
    return undefined;
  }
  if (!laboratoryUnshapedProductSampleSuitabilityValues.includes(
    form.suitability as LaboratoryUnshapedProductSampleSubmission["suitability"],
  )) {
    return undefined;
  }

  return {
    sampleNumber: form.sampleNumber.trim(),
    sampleDate: form.sampleDate,
    sampledBy: form.sampledBy.trim(),
    batchNumber: form.batchNumber.trim(),
    sampleCode: form.sampleCode.trim(),
    productName: form.productName.trim(),
    batchMass: form.batchMass.trim(),
    moisture: form.moisture.trim(),
    grainComposition: form.grainComposition.trim(),
    fireResistance: form.fireResistance.trim(),
    suitability:
      form.suitability as LaboratoryUnshapedProductSampleSubmission["suitability"],
    ...(form.notes.trim() === "" ? {} : { notes: form.notes.trim() }),
    ...(sourceSampleRegistrationId === undefined
      ? {}
      : { sourceSampleRegistrationId }),
  };
}
