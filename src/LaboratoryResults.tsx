import { useEffect, useMemo, useState, type FormEvent } from "react";
import type {
  LaboratoryIndicatorId,
  LaboratoryIndicatorReference,
  LaboratoryProductTypeReference,
  LaboratoryReference,
  LaboratoryResult,
  LaboratorySection,
  ServerUserProfile,
} from "./contracts";
import { LoadingIndicator } from "./LoadingIndicator";
import { LaboratoryBanksPanel } from "./LaboratoryBanksPanel";
import { ProductBrandPicker } from "./ProductBrandPicker";
import {
  requestLaboratoryProtocolPdf,
  requestLaboratoryReference,
  requestLaboratoryResults,
  submitLaboratoryResult,
} from "./services/laboratoryResults";
import { readShortUserMessage } from "./services/userFacingMessages";
import {
  normalizeProductBrandKey,
  useProductionBrands,
} from "./useProductionBrands";

type ShowToast = (title: string, message: string) => void;

type ReferenceState =
  | { status: "loading" }
  | { status: "ready"; reference: LaboratoryReference }
  | { status: "error"; message: string };

type HistoryState =
  | { status: "loading"; results: LaboratoryResult[] }
  | { status: "ready"; results: LaboratoryResult[] }
  | { status: "error"; message: string; results: LaboratoryResult[] };

type IncomingSampleFormState = {
  key: number;
  sampleIdentifier: string;
  values: Partial<Record<LaboratoryIndicatorId, string>>;
};

type FormState = {
  analysisDate: string;
  materialLabel: string;
  productBrand: string;
  purpose: string;
  protocolNote: string;
  documentType: "" | "Сертификат на отгруженную продукцию";
  documentNumber: string;
  transportType: "" | "ЖД" | "Автотранспорт грузовой" | "Легковой автотранспорт";
  samplingMethod: string;
  documentIndicators: string;
  samples: IncomingSampleFormState[];
  values: Partial<Record<LaboratoryIndicatorId, string>>;
};

const sectionLabels: Record<LaboratorySection, string> = {
  incoming: "Входящий контроль",
  finished_product: "Контроль готовой продукции",
};

const incomingPurpose = "Определение химического состава и свойств";
const maxIncomingSamples = 100;
let nextSampleKey = 1;

export function LaboratoryResultsWorkspace({
  profile,
  isAdminPreviewMode,
  onShowToast,
}: {
  profile: ServerUserProfile;
  isAdminPreviewMode: boolean;
  onShowToast: ShowToast;
}) {
  const [section, setSection] = useState<LaboratorySection>("incoming");
  const [isBanksOpen, setIsBanksOpen] = useState(false);
  const [referenceState, setReferenceState] = useState<ReferenceState>({
    status: "loading",
  });
  const [historyState, setHistoryState] = useState<HistoryState>({
    status: "loading",
    results: [],
  });
  const [form, setForm] = useState<FormState>(createEmptyForm);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [materialFilter, setMaterialFilter] = useState("");
  const [brandFilter, setBrandFilter] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formMessage, setFormMessage] = useState("");
  const [refreshVersion, setRefreshVersion] = useState(0);
  const { labels: productBrands, loadState: productBrandsLoadState } =
    useProductionBrands({ creationDisabled: true });

  useEffect(() => {
    const controller = new AbortController();
    setReferenceState({ status: "loading" });
    requestLaboratoryReference({ signal: controller.signal }).then((result) => {
      if (controller.signal.aborted) return;
      setReferenceState(
        result.status === "ready"
          ? { status: "ready", reference: result.reference }
          : {
              status: "error",
              message: readShortUserMessage(
                result.message,
                "Не удалось загрузить справочник лаборатории.",
              ),
            },
      );
    });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setHistoryState((current) => ({
      status: "loading",
      results: current.results,
    }));
    requestLaboratoryResults(
      {
        section,
        ...(dateFrom === "" ? {} : { dateFrom }),
        ...(dateTo === "" ? {} : { dateTo }),
        ...(section === "incoming" && materialFilter !== ""
          ? { materialLabel: materialFilter }
          : {}),
        ...(section === "finished_product" && brandFilter !== ""
          ? { productBrand: brandFilter }
          : {}),
      },
      { signal: controller.signal },
    ).then((result) => {
      if (controller.signal.aborted) return;
      setHistoryState((current) =>
        result.status === "ready"
          ? { status: "ready", results: result.results }
          : {
              status: "error",
              message: readShortUserMessage(
                result.message,
                "Не удалось загрузить результаты испытаний.",
              ),
              results: current.results,
            },
      );
    });
    return () => controller.abort();
  }, [brandFilter, dateFrom, dateTo, materialFilter, refreshVersion, section]);

  const productTypes = referenceState.status === "ready"
    ? referenceState.reference.finishedProductTypes
    : [];
  const availableIndicators = referenceState.status === "ready"
    ? referenceState.reference.indicators
    : [];
  const selectedProductType = section === "finished_product"
    ? productTypes.find((productType) => productType.label === form.materialLabel)
    : undefined;
  const historyIndicators = useMemo(
    () => mergeIndicatorReferences(availableIndicators, historyState.results),
    [availableIndicators, historyState.results],
  );

  function selectSection(nextSection: LaboratorySection) {
    setSection(nextSection);
    setIsBanksOpen(false);
    setForm(createEmptyForm());
    setFormMessage("");
    setMaterialFilter("");
    setBrandFilter("");
  }

  function updateFormField<Key extends keyof FormState>(
    key: Key,
    value: FormState[Key],
  ) {
    setForm((current) => ({ ...current, [key]: value }));
    setFormMessage("");
  }

  function selectMaterial(value: string) {
    setForm((current) => ({
      ...current,
      materialLabel: value,
      values: {},
    }));
    setFormMessage("");
  }

  function updateIndicator(id: LaboratoryIndicatorId, value: string) {
    setForm((current) => ({
      ...current,
      values: { ...current.values, [id]: value },
    }));
    setFormMessage("");
  }

  function addIncomingSample() {
    setForm((current) => current.samples.length >= maxIncomingSamples
      ? current
      : { ...current, samples: [...current.samples, createEmptySample()] });
    setFormMessage("");
  }

  function removeIncomingSample(key: number) {
    setForm((current) => current.samples.length <= 1
      ? current
      : {
          ...current,
          samples: current.samples.filter((sample) => sample.key !== key),
        });
    setFormMessage("");
  }

  function updateIncomingSampleIdentifier(key: number, value: string) {
    setForm((current) => ({
      ...current,
      samples: current.samples.map((sample) => sample.key === key
        ? { ...sample, sampleIdentifier: value }
        : sample),
    }));
    setFormMessage("");
  }

  function updateIncomingSampleIndicator(
    key: number,
    id: LaboratoryIndicatorId,
    value: string,
  ) {
    setForm((current) => ({
      ...current,
      samples: current.samples.map((sample) => sample.key === key
        ? { ...sample, values: { ...sample.values, [id]: value } }
        : sample),
    }));
    setFormMessage("");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isAdminPreviewMode) return;

    const validationMessage = validateForm(
      section,
      form,
      selectedProductType,
      availableIndicators,
      productBrands,
    );
    if (validationMessage !== undefined) {
      setFormMessage(validationMessage);
      return;
    }
    const submission = section === "incoming"
      ? {
          section,
          analysisDate: form.analysisDate,
          materialLabel: form.materialLabel.trim(),
          purpose: form.purpose.trim(),
          protocolNote: form.protocolNote.trim(),
          ...(form.documentType === "" ? {} : { documentType: form.documentType }),
          ...(form.documentNumber.trim() === ""
            ? {}
            : { documentNumber: form.documentNumber.trim() }),
          ...(form.transportType === "" ? {} : { transportType: form.transportType }),
          ...(form.samplingMethod.trim() === ""
            ? {}
            : { samplingMethod: form.samplingMethod.trim() }),
          ...(form.documentIndicators.trim() === ""
            ? {}
            : { documentIndicators: form.documentIndicators.trim() }),
          samples: form.samples.map((sample) => ({
            sampleIdentifier: sample.sampleIdentifier.trim(),
            values: readEnteredIndicatorValues(
              availableIndicators,
              sample.values,
            ),
          })),
        } as const
      : {
          section,
          analysisDate: form.analysisDate,
          materialLabel: selectedProductType?.label ?? form.materialLabel,
          productBrand: form.productBrand.trim(),
          purpose: form.purpose.trim(),
          protocolNote: form.protocolNote.trim(),
          values: readEnteredIndicatorValues(
            availableIndicators,
            form.values,
          ),
        } as const;

    setIsSubmitting(true);
    setFormMessage("Сохраняем результат…");
    const result = await submitLaboratoryResult(submission);
    setIsSubmitting(false);

    if (result.status === "error") {
      setFormMessage(
        readShortUserMessage(result.message, "Не удалось сохранить результат."),
      );
      return;
    }

    setForm((current) => ({
      ...createEmptyForm(),
      analysisDate: current.analysisDate,
      materialLabel: current.materialLabel,
      productBrand: section === "finished_product" ? "" : current.productBrand,
    }));
    setFormMessage("");
    setRefreshVersion((value) => value + 1);
    onShowToast(
      "Результат сохранён",
      `${sectionLabels[section]} · ${result.result.materialLabel}.`,
    );
  }

  return (
    <main className="workspace laboratory-workspace">
      <header className="workspace-heading laboratory-heading">
        <div>
          <span className="eyebrow">Лаборатория</span>
          <h1>Результаты испытаний</h1>
        </div>
      </header>

      <div className="laboratory-section-tabs" role="tablist" aria-label="Раздел контроля">
        {(Object.keys(sectionLabels) as LaboratorySection[]).map((item) => (
          <button
            aria-selected={!isBanksOpen && section === item}
            className={!isBanksOpen && section === item ? "is-active" : ""}
            key={item}
            role="tab"
            type="button"
            onClick={() => selectSection(item)}
          >
            {sectionLabels[item]}
          </button>
        ))}
        <button
          aria-selected={isBanksOpen}
          className={isBanksOpen ? "is-active" : ""}
          role="tab"
          type="button"
          onClick={() => {
            setIsBanksOpen(true);
            setFormMessage("");
          }}
        >
          Банки
        </button>
      </div>

      {isBanksOpen ? (
        <LaboratoryBanksPanel
          isAdminPreviewMode={isAdminPreviewMode}
          onShowToast={onShowToast}
        />
      ) : (
        <>
      {referenceState.status === "loading" ? (
        <LoadingIndicator label="Загружаем справочник лаборатории…" />
      ) : referenceState.status === "error" ? (
        <p className="form-message is-error" role="alert">{referenceState.message}</p>
      ) : (
        <form className="laboratory-form" onSubmit={submit}>
          <div className="laboratory-form-grid">
            <label>
              <span>Дата анализа</span>
              <input
                required
                type="date"
                value={form.analysisDate}
                onChange={(event) => {
                  const value = event.currentTarget.value;
                  updateFormField("analysisDate", value);
                }}
              />
            </label>
            {section === "incoming" ? (
              <label>
                <span>Объект испытаний</span>
                <input
                  required
                  maxLength={120}
                  value={form.materialLabel}
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    updateFormField("materialLabel", value);
                  }}
                />
              </label>
            ) : (
              <label>
                <span>Вид готовой продукции</span>
                <select
                  required
                  value={form.materialLabel}
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    selectMaterial(value);
                  }}
                >
                  <option value="">Выберите</option>
                  {productTypes.map((productType) => (
                    <option key={productType.label} value={productType.label}>
                      {productType.label}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {section === "incoming" ? (
              <IncomingContextFields form={form} updateFormField={updateFormField} />
            ) : (
              <label>
                <span>Марка</span>
                <ProductBrandPicker
                  disabled={productBrandsLoadState.status !== "ready"}
                  labels={productBrands}
                  name="productBrand"
                  value={form.productBrand}
                  onChange={(value) => updateFormField("productBrand", value)}
                />
              </label>
            )}
            <ProtocolValueFields form={form} updateFormField={updateFormField} />
            <label>
              <span>Лаборант</span>
              <input disabled readOnly value={profile.displayName} />
            </label>
          </div>

          {section === "incoming" ? (
            <IncomingSamplesEditor
              indicators={availableIndicators}
              samples={form.samples}
              onAdd={addIncomingSample}
              onRemove={removeIncomingSample}
              onIdentifierChange={updateIncomingSampleIdentifier}
              onIndicatorChange={updateIncomingSampleIndicator}
            />
          ) : (
            <div className="laboratory-indicators">
              <div className="laboratory-indicator-heading">
                <p>Заполните хотя бы один показатель.</p>
              </div>
              <LaboratoryIndicatorFields
                indicators={availableIndicators}
                values={form.values}
                onChange={updateIndicator}
              />
            </div>
          )}

          <div className="laboratory-form-actions">
            <button
              className="primary-button"
              disabled={
                isAdminPreviewMode ||
                isSubmitting ||
                (section === "finished_product" && selectedProductType === undefined)
              }
              type="submit"
            >
              {isSubmitting ? (
                <LoadingIndicator label="Сохраняем…" variant="button" />
              ) : "Внести данные"}
            </button>
            {isAdminPreviewMode ? (
              <small>В режиме просмотра сохранение отключено.</small>
            ) : null}
            {formMessage === "" ? null : (
              <span className="form-message" role="status">{formMessage}</span>
            )}
          </div>
        </form>
      )}

      <section className="laboratory-history" aria-labelledby="laboratory-history-title">
        <div className="laboratory-history-heading">
          <div>
            <span className="eyebrow">История</span>
            <h2 id="laboratory-history-title">{sectionLabels[section]}</h2>
          </div>
          <div className="laboratory-filters">
            <label>
              <span>С даты</span>
              <input type="date" value={dateFrom} onChange={(event) => {
                const value = event.currentTarget.value;
                setDateFrom(value);
              }} />
            </label>
            <label>
              <span>По дату</span>
              <input type="date" value={dateTo} onChange={(event) => {
                const value = event.currentTarget.value;
                setDateTo(value);
              }} />
            </label>
            {section === "incoming" ? (
              <label>
                <span>Объект испытаний</span>
                <input
                  maxLength={120}
                  placeholder="Введите объект испытаний"
                  value={materialFilter}
                  onChange={(event) => {
                  const value = event.currentTarget.value;
                  setMaterialFilter(value);
                }} />
              </label>
            ) : (
              <label>
                <span>Марка</span>
                <ProductBrandPicker
                  labels={productBrands}
                  name="laboratoryBrandFilter"
                  value={brandFilter}
                  onChange={setBrandFilter}
                />
              </label>
            )}
          </div>
        </div>
        {historyState.status === "loading" ? (
          <LoadingIndicator label="Загружаем результаты…" variant="inline" />
        ) : historyState.status === "error" ? (
          <p className="form-message is-error" role="alert">{historyState.message}</p>
        ) : null}
        <LaboratoryResultsTable
          section={section}
          results={historyState.results}
          indicators={historyIndicators}
          isAdminPreviewMode={isAdminPreviewMode}
          onShowToast={onShowToast}
        />
      </section>
        </>
      )}
    </main>
  );
}

function IncomingSamplesEditor({
  indicators,
  samples,
  onAdd,
  onRemove,
  onIdentifierChange,
  onIndicatorChange,
}: {
  indicators: LaboratoryIndicatorReference[];
  samples: IncomingSampleFormState[];
  onAdd: () => void;
  onRemove: (key: number) => void;
  onIdentifierChange: (key: number, value: string) => void;
  onIndicatorChange: (
    key: number,
    id: LaboratoryIndicatorId,
    value: string,
  ) => void;
}) {
  return (
    <div className="laboratory-samples">
      {samples.map((sample, index) => (
        <section className="laboratory-sample-card" key={sample.key}>
          <div className="laboratory-sample-heading">
            <div>
              <span className="eyebrow">Результаты испытаний</span>
              <h2>Проба {index + 1}</h2>
            </div>
            {samples.length > 1 ? (
              <button
                className="secondary-button"
                type="button"
                onClick={() => onRemove(sample.key)}
              >
                Убрать пробу
              </button>
            ) : null}
          </div>
          <label className="laboratory-sample-identifier">
            <span>Номер пробы, идентификатор транспорта</span>
            <input
              required
              maxLength={120}
              value={sample.sampleIdentifier}
              onChange={(event) => {
                const value = event.currentTarget.value;
                onIdentifierChange(sample.key, value);
              }}
            />
          </label>
          <p className="laboratory-sample-note">
            Заполните хотя бы один показатель этой пробы.
          </p>
          <LaboratoryIndicatorFields
            indicators={indicators}
            values={sample.values}
            onChange={(id, value) => onIndicatorChange(sample.key, id, value)}
          />
        </section>
      ))}
      <button
        className="secondary-button laboratory-add-sample"
        disabled={samples.length >= maxIncomingSamples}
        type="button"
        onClick={onAdd}
      >
        Добавить пробу
      </button>
    </div>
  );
}

function LaboratoryIndicatorFields({
  indicators,
  values,
  onChange,
}: {
  indicators: LaboratoryIndicatorReference[];
  values: Partial<Record<LaboratoryIndicatorId, string>>;
  onChange: (id: LaboratoryIndicatorId, value: string) => void;
}) {
  return (
    <div className="laboratory-indicator-grid">
      {indicators.map((indicator) => (
        <label key={indicator.id}>
          <span>{indicator.label}</span>
          <input
            maxLength={120}
            inputMode={indicator.id === "grain_composition" ? "text" : "decimal"}
            value={values[indicator.id] ?? ""}
            onChange={(event) => {
              const value = event.currentTarget.value;
              onChange(indicator.id, value);
            }}
          />
          {indicator.standard === undefined ? null : <small>{indicator.standard}</small>}
        </label>
      ))}
    </div>
  );
}

function IncomingContextFields({
  form,
  updateFormField,
}: {
  form: FormState;
  updateFormField: <Key extends keyof FormState>(key: Key, value: FormState[Key]) => void;
}) {
  return (
    <>
      <label>
        <span>Документ на объект</span>
        <select value={form.documentType} onChange={(event) => {
          const value = event.currentTarget.value as FormState["documentType"];
          updateFormField("documentType", value);
        }}>
          <option value="">Не указан</option>
          <option value="Сертификат на отгруженную продукцию">Сертификат на отгруженную продукцию</option>
        </select>
      </label>
      <label>
        <span>Номер документа</span>
        <input maxLength={120} value={form.documentNumber} onChange={(event) => {
          const value = event.currentTarget.value;
          updateFormField("documentNumber", value);
        }} />
      </label>
      <label>
        <span>Вид транспорта</span>
        <select value={form.transportType} onChange={(event) => {
          const value = event.currentTarget.value as FormState["transportType"];
          updateFormField("transportType", value);
        }}>
          <option value="">Не указан</option>
          <option value="ЖД">ЖД</option>
          <option value="Автотранспорт грузовой">Автотранспорт грузовой</option>
          <option value="Легковой автотранспорт">Легковой автотранспорт</option>
        </select>
      </label>
      <label>
        <span>Способ отбора пробы</span>
        <input maxLength={2000} value={form.samplingMethod} onChange={(event) => {
          const value = event.currentTarget.value;
          updateFormField("samplingMethod", value);
        }} />
      </label>
      <label className="laboratory-field-wide">
        <span>Показатели по документу</span>
        <textarea maxLength={2000} value={form.documentIndicators} onChange={(event) => {
          const value = event.currentTarget.value;
          updateFormField("documentIndicators", value);
        }} />
      </label>
    </>
  );
}

function ProtocolValueFields({
  form,
  updateFormField,
}: {
  form: FormState;
  updateFormField: <Key extends keyof FormState>(key: Key, value: FormState[Key]) => void;
}) {
  return (
    <>
      <label className="laboratory-field-wide">
        <span>Цель испытаний</span>
        <input required maxLength={2000} value={form.purpose} onChange={(event) => {
          const value = event.currentTarget.value;
          updateFormField("purpose", value);
        }} />
      </label>
      <label className="laboratory-field-wide">
        <span>Примечание к протоколу</span>
        <textarea required maxLength={2000} value={form.protocolNote} onChange={(event) => {
          const value = event.currentTarget.value;
          updateFormField("protocolNote", value);
        }} />
      </label>
    </>
  );
}

function LaboratoryResultsTable({
  section,
  results,
  indicators,
  isAdminPreviewMode,
  onShowToast,
}: {
  section: LaboratorySection;
  results: LaboratoryResult[];
  indicators: LaboratoryIndicatorReference[];
  isAdminPreviewMode: boolean;
  onShowToast: ShowToast;
}) {
  if (results.length === 0) {
    return <p className="laboratory-empty-note">По выбранным фильтрам результатов нет.</p>;
  }
  const historyRows: Array<{
    key: string;
    result: LaboratoryResult;
    identifier: string;
    values: Partial<Record<LaboratoryIndicatorId, string>>;
    protocolRowSpan: number;
  }> = [];
  for (const result of results) {
    if (result.section === "incoming") {
      result.samples.forEach((sample, index) => historyRows.push({
        key: `${result.id}:${index}`,
        result,
        identifier: sample.sampleIdentifier,
        values: sample.values,
        protocolRowSpan: index === 0 ? result.samples.length : 0,
      }));
    } else {
      historyRows.push({
        key: result.id,
        result,
        identifier: result.productBrand,
        values: result.values,
        protocolRowSpan: 1,
      });
    }
  }

  return (
    <div className="table-scroll laboratory-table-scroll">
      <table className="data-table laboratory-results-table">
        <thead>
          <tr>
            <th>Дата анализа</th>
            <th>{section === "incoming" ? "Объект испытаний" : "Вид продукции"}</th>
            <th>{section === "incoming" ? "Номер пробы / транспорт" : "Марка"}</th>
            {indicators.map((indicator) => <th key={indicator.id}>{indicator.label}</th>)}
            <th>Лаборант</th>
            <th>Протокол</th>
          </tr>
        </thead>
        <tbody>
          {historyRows.map((row) => (
            <tr key={row.key}>
              <td>{formatDate(row.result.analysisDate)}</td>
              <td>{row.result.materialLabel}</td>
              <td>{row.identifier}</td>
              {indicators.map((indicator) => (
                <td key={indicator.id}>{row.values[indicator.id] ?? "—"}</td>
              ))}
              <td>{row.result.laboratoryAssistantDisplayName}</td>
              {row.protocolRowSpan > 0 ? (
                <td className="laboratory-protocol-cell" rowSpan={row.protocolRowSpan}>
                  <LaboratoryProtocolActions
                    disabled={isAdminPreviewMode}
                    result={row.result}
                    onShowToast={onShowToast}
                  />
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LaboratoryProtocolActions({
  disabled,
  result,
  onShowToast,
}: {
  disabled: boolean;
  result: LaboratoryResult;
  onShowToast: ShowToast;
}) {
  const [isOpeningProtocol, setIsOpeningProtocol] = useState(false);

  async function openProtocol() {
    if (disabled || isOpeningProtocol) return;
    const previewWindow = window.open("", "_blank");
    if (previewWindow !== null) {
      previewWindow.opener = null;
      previewWindow.document.title = "Формируем протокол…";
    }
    setIsOpeningProtocol(true);
    const response = await requestLaboratoryProtocolPdf(result.id);
    setIsOpeningProtocol(false);

    if (response.status === "error") {
      previewWindow?.close();
      onShowToast(
        "Протокол не сформирован",
        readShortUserMessage(
          response.message,
          "Не удалось сформировать протокол испытаний.",
        ),
      );
      return;
    }

    const objectUrl = URL.createObjectURL(response.blob);
    if (previewWindow !== null) {
      previewWindow.location.href = objectUrl;
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
      return;
    }

    const link = document.createElement("a");
    link.href = objectUrl;
    link.target = "_blank";
    link.rel = "noopener";
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
  }

  return (
    <div className="laboratory-protocol-actions">
      <button
        className="secondary-button"
        disabled={disabled || isOpeningProtocol}
        type="button"
        onClick={() => void openProtocol()}
      >
        {isOpeningProtocol ? "Открываем…" : "Открыть PDF"}
      </button>
    </div>
  );
}

function createEmptyForm(): FormState {
  return {
    analysisDate: formatLocalCalendarDate(new Date()),
    materialLabel: "",
    productBrand: "",
    purpose: incomingPurpose,
    protocolNote: "",
    documentType: "",
    documentNumber: "",
    transportType: "",
    samplingMethod: "",
    documentIndicators: "",
    samples: [createEmptySample()],
    values: {},
  };
}

function createEmptySample(): IncomingSampleFormState {
  return {
    key: nextSampleKey++,
    sampleIdentifier: "",
    values: {},
  };
}

function formatLocalCalendarDate(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(
    value.getDate(),
  ).padStart(2, "0")}`;
}

function mergeIndicatorReferences(
  indicators: LaboratoryIndicatorReference[],
  results: LaboratoryResult[],
) {
  const byId = new Map(
    indicators.map((indicator) => [indicator.id, indicator]),
  );
  for (const result of results) {
    const valueSets = result.section === "incoming"
      ? result.samples.map((sample) => sample.values)
      : [result.values];
    for (const values of valueSets) {
      for (const id of Object.keys(values) as LaboratoryIndicatorId[]) {
        if (!byId.has(id)) {
          byId.set(id, { id, label: laboratoryIndicatorLabels[id] });
        }
      }
    }
  }
  return Array.from(byId.values());
}

const laboratoryIndicatorLabels: Record<LaboratoryIndicatorId, string> = {
  al2o3: "Al2O3",
  fe2o3: "Fe2O3",
  sio2: "SiO2",
  cao2: "CaO2",
  p2o5: "P2O5",
  loss_on_ignition: "ппп",
  moisture: "Влажность",
  bulk_density: "Насыпной вес",
  water_absorption: "Водопоглощение",
  strength: "Прочность",
  grain_composition: "Зерновой состав",
};

function validateForm(
  section: LaboratorySection,
  form: FormState,
  productType: LaboratoryProductTypeReference | undefined,
  indicators: LaboratoryIndicatorReference[],
  productBrands: readonly string[],
) {
  if (form.analysisDate === "") return "Укажите дату анализа.";
  if (form.purpose.trim() === "") return "Укажите цель испытаний.";
  if (form.protocolNote.trim() === "") return "Укажите примечание к протоколу.";
  if (section === "incoming") {
    if (form.materialLabel.trim() === "") return "Укажите объект испытаний.";
    if (form.samples.length === 0) return "Добавьте хотя бы одну пробу.";
    for (const [index, sample] of form.samples.entries()) {
      if (sample.sampleIdentifier.trim() === "") {
        return `Проба ${index + 1}: укажите номер пробы или идентификатор транспорта.`;
      }
      const hasValue = indicators.some(
        (indicator) => (sample.values[indicator.id] ?? "").trim() !== "",
      );
      if (!hasValue) {
        return `Проба ${index + 1}: заполните хотя бы один показатель испытаний.`;
      }
    }
    return undefined;
  }
  if (productType === undefined) {
    return "Выберите вид готовой продукции из справочника лаборатории.";
  }
  if (section === "finished_product") {
    const brandKey = normalizeProductBrandKey(form.productBrand);
    if (brandKey === "") return "Выберите марку готовой продукции.";
    if (!productBrands.some((label) => normalizeProductBrandKey(label) === brandKey)) {
      return "Выберите марку из справочника номенклатуры.";
    }
  }
  const hasValue = indicators.some(
    (indicator) => (form.values[indicator.id] ?? "").trim() !== "",
  );
  return hasValue ? undefined : "Заполните хотя бы один показатель испытаний.";
}

function readEnteredIndicatorValues(
  indicators: LaboratoryIndicatorReference[],
  values: Partial<Record<LaboratoryIndicatorId, string>>,
) {
  return Object.fromEntries(
    indicators.flatMap((indicator) => {
      const value = values[indicator.id]?.trim() ?? "";
      return value === "" ? [] : [[indicator.id, value]];
    }),
  );
}

function formatDate(value: string) {
  const [year, month, day] = value.split("-");
  return year && month && day ? `${day}.${month}.${year}` : value;
}
