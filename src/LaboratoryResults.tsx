import { useEffect, useMemo, useState, type FormEvent } from "react";
import type {
  LaboratoryIndicatorId,
  LaboratoryIndicatorReference,
  LaboratoryMaterialReference,
  LaboratoryReference,
  LaboratoryResult,
  LaboratorySection,
  ServerUserProfile,
} from "./contracts";
import { LoadingIndicator } from "./LoadingIndicator";
import { ProductBrandPicker } from "./ProductBrandPicker";
import {
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

type FormState = {
  analysisDate: string;
  materialLabel: string;
  productBrand: string;
  sampleIdentifier: string;
  documentType: "" | "Сертификат на отгруженную продукцию";
  documentNumber: string;
  transportType: "" | "ЖД" | "Автотранспорт грузовой" | "Легковой автотранспорт";
  samplingMethod: string;
  documentIndicators: string;
  values: Partial<Record<LaboratoryIndicatorId, string>>;
};

const sectionLabels: Record<LaboratorySection, string> = {
  incoming: "Входящий контроль",
  finished_product: "Контроль готовой продукции",
};

const incomingPurpose = "Определение химического состава и свойств";

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

  const materials = referenceState.status === "ready"
    ? readSectionMaterials(referenceState.reference, section)
    : [];
  const selectedMaterial = materials.find(
    (material) => material.label === form.materialLabel,
  );
  const historyIndicators = useMemo(
    () => mergeIndicatorReferences(materials, historyState.results),
    [historyState.results, materials],
  );

  function selectSection(nextSection: LaboratorySection) {
    setSection(nextSection);
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

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isAdminPreviewMode) return;

    const validationMessage = validateForm(
      section,
      form,
      selectedMaterial,
      productBrands,
    );
    if (validationMessage !== undefined) {
      setFormMessage(validationMessage);
      return;
    }
    if (selectedMaterial === undefined) return;

    const values = Object.fromEntries(
      selectedMaterial.indicators.map((indicator) => [
        indicator.id,
        form.values[indicator.id]?.trim() ?? "",
      ]),
    );
    const submission = section === "incoming"
      ? {
          section,
          analysisDate: form.analysisDate,
          materialLabel: selectedMaterial.label,
          sampleIdentifier: form.sampleIdentifier.trim(),
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
          values,
        } as const
      : {
          section,
          analysisDate: form.analysisDate,
          materialLabel: selectedMaterial.label,
          productBrand: form.productBrand.trim(),
          values,
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
          <p>Состав показателей загружается из вкладки Google Sheets «Лаборатория».</p>
        </div>
      </header>

      <div className="laboratory-section-tabs" role="tablist" aria-label="Раздел контроля">
        {(Object.keys(sectionLabels) as LaboratorySection[]).map((item) => (
          <button
            aria-selected={section === item}
            className={section === item ? "is-active" : ""}
            key={item}
            role="tab"
            type="button"
            onClick={() => selectSection(item)}
          >
            {sectionLabels[item]}
          </button>
        ))}
      </div>

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
            <label>
              <span>{section === "incoming" ? "Наименование материала" : "Вид готовой продукции"}</span>
              <select
                required
                value={form.materialLabel}
                onChange={(event) => {
                  const value = event.currentTarget.value;
                  selectMaterial(value);
                }}
              >
                <option value="">Выберите</option>
                {materials.map((material) => (
                  <option key={material.label} value={material.label}>{material.label}</option>
                ))}
              </select>
            </label>
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
            <label>
              <span>Лаборант</span>
              <input disabled readOnly value={profile.displayName} />
            </label>
          </div>

          {selectedMaterial === undefined ? (
            <p className="laboratory-empty-note">Выберите материал, чтобы увидеть показатели испытаний.</p>
          ) : (
            <div className="laboratory-indicator-grid">
              {selectedMaterial.indicators.map((indicator) => (
                <label key={indicator.id}>
                  <span>{indicator.label}</span>
                  <input
                    required
                    maxLength={120}
                    inputMode={indicator.id === "grain_composition" ? "text" : "decimal"}
                    value={form.values[indicator.id] ?? ""}
                    onChange={(event) => {
                      const value = event.currentTarget.value;
                      updateIndicator(indicator.id, value);
                    }}
                  />
                  {indicator.standard === undefined ? null : <small>{indicator.standard}</small>}
                </label>
              ))}
            </div>
          )}

          <div className="laboratory-form-actions">
            <button
              className="primary-button"
              disabled={
                isAdminPreviewMode ||
                isSubmitting ||
                selectedMaterial === undefined
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
                <span>Материал</span>
                <select value={materialFilter} onChange={(event) => {
                  const value = event.currentTarget.value;
                  setMaterialFilter(value);
                }}>
                  <option value="">Все материалы</option>
                  {materials.map((material) => (
                    <option key={material.label} value={material.label}>{material.label}</option>
                  ))}
                </select>
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
        />
      </section>
    </main>
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
      <label className="laboratory-field-wide">
        <span>Цель</span>
        <input disabled readOnly value={incomingPurpose} />
      </label>
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
      <label className="laboratory-field-wide">
        <span>Номер пробы, идентификатор транспорта</span>
        <input required maxLength={120} value={form.sampleIdentifier} onChange={(event) => {
          const value = event.currentTarget.value;
          updateFormField("sampleIdentifier", value);
        }} />
      </label>
    </>
  );
}

function LaboratoryResultsTable({
  section,
  results,
  indicators,
}: {
  section: LaboratorySection;
  results: LaboratoryResult[];
  indicators: LaboratoryIndicatorReference[];
}) {
  if (results.length === 0) {
    return <p className="laboratory-empty-note">По выбранным фильтрам результатов нет.</p>;
  }

  return (
    <div className="table-scroll laboratory-table-scroll">
      <table className="data-table laboratory-results-table">
        <thead>
          <tr>
            <th>Дата анализа</th>
            <th>{section === "incoming" ? "Материал" : "Вид продукции"}</th>
            <th>{section === "incoming" ? "Номер пробы / транспорт" : "Марка"}</th>
            {indicators.map((indicator) => <th key={indicator.id}>{indicator.label}</th>)}
            <th>Лаборант</th>
          </tr>
        </thead>
        <tbody>
          {results.map((result) => (
            <tr key={result.id}>
              <td>{formatDate(result.analysisDate)}</td>
              <td>{result.materialLabel}</td>
              <td>{result.section === "incoming" ? result.sampleIdentifier : result.productBrand}</td>
              {indicators.map((indicator) => (
                <td key={indicator.id}>{result.values[indicator.id] ?? "—"}</td>
              ))}
              <td>{result.laboratoryAssistantDisplayName}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function createEmptyForm(): FormState {
  return {
    analysisDate: formatLocalCalendarDate(new Date()),
    materialLabel: "",
    productBrand: "",
    sampleIdentifier: "",
    documentType: "",
    documentNumber: "",
    transportType: "",
    samplingMethod: "",
    documentIndicators: "",
    values: {},
  };
}

function formatLocalCalendarDate(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(
    value.getDate(),
  ).padStart(2, "0")}`;
}

function readSectionMaterials(reference: LaboratoryReference, section: LaboratorySection) {
  return section === "incoming"
    ? reference.incomingMaterials
    : reference.finishedProductTypes;
}

function mergeIndicatorReferences(
  materials: LaboratoryMaterialReference[],
  results: LaboratoryResult[],
) {
  const byId = new Map<LaboratoryIndicatorId, LaboratoryIndicatorReference>();
  for (const material of materials) {
    for (const indicator of material.indicators) {
      if (!byId.has(indicator.id)) byId.set(indicator.id, indicator);
    }
  }
  for (const result of results) {
    for (const id of Object.keys(result.values) as LaboratoryIndicatorId[]) {
      if (!byId.has(id)) {
        byId.set(id, { id, label: laboratoryIndicatorLabels[id] });
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
  material: LaboratoryMaterialReference | undefined,
  productBrands: readonly string[],
) {
  if (form.analysisDate === "") return "Укажите дату анализа.";
  if (material === undefined) return "Выберите материал из справочника лаборатории.";
  if (section === "incoming" && form.sampleIdentifier.trim() === "") {
    return "Укажите номер пробы или идентификатор транспорта.";
  }
  if (section === "finished_product") {
    const brandKey = normalizeProductBrandKey(form.productBrand);
    if (brandKey === "") return "Выберите марку готовой продукции.";
    if (!productBrands.some((label) => normalizeProductBrandKey(label) === brandKey)) {
      return "Выберите марку из справочника номенклатуры.";
    }
  }
  const missing = material.indicators.find(
    (indicator) => (form.values[indicator.id] ?? "").trim() === "",
  );
  return missing === undefined ? undefined : `Заполните показатель «${missing.label}».`;
}

function formatDate(value: string) {
  const [year, month, day] = value.split("-");
  return year && month && day ? `${day}.${month}.${year}` : value;
}
