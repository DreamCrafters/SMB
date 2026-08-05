import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  laboratoryGreenProductQualityPressNumberValues,
  type LaboratoryGreenProductQualityOptions,
  type LaboratoryGreenProductQualityRecord,
  type LaboratoryGreenProductQualitySubmission,
} from "./contracts";
import { LaboratoryGreenProductQualityTable } from "./LaboratoryJournalTables";
import { LoadingIndicator } from "./LoadingIndicator";
import { ProductBrandPicker } from "./ProductBrandPicker";
import {
  correctLaboratoryGreenProductQualityRecord,
  requestLaboratoryGreenProductQualityDraft,
  requestLaboratoryGreenProductQualityJournal,
  requestLaboratoryGreenProductQualityOptions,
  submitLaboratoryGreenProductQualityRecord,
} from "./services/laboratoryGreenProductQualityJournal";
import { readShortUserMessage } from "./services/userFacingMessages";
import { useProductionBrands } from "./useProductionBrands";

type ShowToast = (title: string, body: string) => void;
type FormState = {
  [Field in keyof LaboratoryGreenProductQualitySubmission]:
    LaboratoryGreenProductQualitySubmission[Field] extends string[]
      ? string[]
      : string;
};
type HistoryState =
  | { status: "loading"; records: LaboratoryGreenProductQualityRecord[] }
  | { status: "ready"; records: LaboratoryGreenProductQualityRecord[] }
  | {
      status: "error";
      message: string;
      records: LaboratoryGreenProductQualityRecord[];
    };

const emptyOptions: LaboratoryGreenProductQualityOptions = {
  setters: [],
  pressOperators: [],
  wagons: [],
};

const dimensionPairs = [
  { label: "Длина", first: "lengthFirst", second: "lengthSecond" },
  { label: "Ширина", first: "widthFirst", second: "widthSecond" },
  { label: "Высота", first: "heightFirst", second: "heightSecond" },
] as const;

type DimensionFirstField = (typeof dimensionPairs)[number]["first"];
type DimensionSecondField = (typeof dimensionPairs)[number]["second"];
type TextField = Exclude<keyof FormState, "wagonIds">;

export function LaboratoryGreenProductQualityJournal({
  isAdminPreviewMode,
  onShowToast,
}: {
  isAdminPreviewMode: boolean;
  onShowToast: ShowToast;
}) {
  const [form, setForm] = useState<FormState>(createEmptyForm);
  const [options, setOptions] = useState(emptyOptions);
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
  const mirroredSecondFields = useRef<Record<DimensionSecondField, boolean>>({
    lengthSecond: true,
    widthSecond: true,
    heightSecond: true,
  });
  const { labels: productBrands, loadState: productBrandsLoadState } =
    useProductionBrands({ creationDisabled: true });

  useEffect(() => {
    if (isAdminPreviewMode || editingRecordId !== undefined) return;
    const controller = new AbortController();
    requestLaboratoryGreenProductQualityDraft({ signal: controller.signal })
      .then((result) => {
        if (controller.signal.aborted) return;
        if (result.status === "ready") {
          setForm((current) => current.recordDate === ""
            ? { ...current, recordDate: result.recordDate }
            : current);
          return;
        }
        setFormMessage((current) => current === ""
          ? readShortUserMessage(result.message, "Не удалось загрузить текущую дату.")
          : current);
      });
    return () => controller.abort();
  }, [editingRecordId, isAdminPreviewMode, refreshVersion]);

  useEffect(() => {
    if (isAdminPreviewMode) return;
    const controller = new AbortController();
    requestLaboratoryGreenProductQualityOptions({ signal: controller.signal })
      .then((result) => {
        if (controller.signal.aborted) return;
        if (result.status === "ready") setOptions(result.options);
        else setFormMessage((current) => current === ""
          ? readShortUserMessage(result.message, "Не удалось загрузить списки журнала.")
          : current);
      });
    return () => controller.abort();
  }, [isAdminPreviewMode, refreshVersion]);

  useEffect(() => {
    const controller = new AbortController();
    setHistory((current) => ({ status: "loading", records: current.records }));
    requestLaboratoryGreenProductQualityJournal(
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
              "Не удалось загрузить журнал качества сырцовой продукции.",
            ),
            records: current.records,
          });
    });
    return () => controller.abort();
  }, [dateFrom, dateTo, query, refreshVersion]);

  function updateTextField(field: TextField, value: string) {
    const pair = dimensionPairs.find((item) => item.first === field);
    setForm((current) => pair !== undefined &&
        mirroredSecondFields.current[pair.second]
      ? { ...current, [field]: value, [pair.second]: value }
      : { ...current, [field]: value });
    setFormMessage("");
  }

  function updateSecondDimension(field: DimensionSecondField, value: string) {
    mirroredSecondFields.current[field] = false;
    setForm((current) => ({ ...current, [field]: value }));
    setFormMessage("");
  }

  function toggleWagon(id: string, checked: boolean) {
    setForm((current) => ({
      ...current,
      wagonIds: checked
        ? [...current.wagonIds, id]
        : current.wagonIds.filter((wagonId) => wagonId !== id),
    }));
    setFormMessage("");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isAdminPreviewMode) return;
    const submission = buildSubmission(form);
    if (submission === undefined) {
      setFormMessage("Заполните все поля и выберите хотя бы один вагон.");
      return;
    }

    setIsSubmitting(true);
    setFormMessage("Сохраняем запись…");
    const result = editingRecordId === undefined
      ? await submitLaboratoryGreenProductQualityRecord(submission)
      : await correctLaboratoryGreenProductQualityRecord(
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
    setOptions((current) => ({
      ...current,
      setters: addOption(current.setters, result.record.setter),
      pressOperators: addOption(
        current.pressOperators,
        result.record.pressOperator,
      ),
    }));
    resetForm();
    setRefreshVersion((value) => value + 1);
    onShowToast(
      wasEditing ? "Запись исправлена" : "Запись сохранена",
      `${result.record.recordDate} · пресс № ${result.record.pressNumber}.`,
    );
  }

  function editRecord(record: LaboratoryGreenProductQualityRecord) {
    setEditingRecordId(record.id);
    setForm({
      recordDate: record.recordDate,
      pressNumber: record.pressNumber,
      productBrand: record.productBrand,
      setter: record.setter,
      pressOperator: record.pressOperator,
      wagonIds: record.wagonIds,
      lengthFirst: record.lengthFirst,
      lengthSecond: record.lengthSecond,
      widthFirst: record.widthFirst,
      widthSecond: record.widthSecond,
      heightFirst: record.heightFirst,
      heightSecond: record.heightSecond,
      weight: record.weight,
      mechanicalStrength: record.mechanicalStrength,
      density: record.density,
      pressOperatorRecommendations: record.pressOperatorRecommendations,
    });
    for (const pair of dimensionPairs) {
      mirroredSecondFields.current[pair.second] =
        record[pair.first] === record[pair.second];
    }
    setFormMessage("");
  }

  function resetForm() {
    setEditingRecordId(undefined);
    setForm(createEmptyForm());
    mirroredSecondFields.current = {
      lengthSecond: true,
      widthSecond: true,
      heightSecond: true,
    };
  }

  return (
    <div className="green-product-quality-journal">
      <form className="laboratory-form green-product-quality-form" onSubmit={submit}>
        <div className="sample-registration-journal-heading">
          <span className="eyebrow">Лаборатория · ОЦ</span>
          <h2>Журнал контроля качества сырцовой продукции</h2>
          {editingRecordId === undefined
            ? null
            : <p>{`Редактирование записи от ${form.recordDate}`}</p>}
        </div>

        <section className="sample-registration-journal-section">
          <h3>Общие сведения</h3>
          <div className="laboratory-form-grid green-product-quality-form-grid">
            <label>
              <span>Дата</span>
              <input
                required
                type="date"
                value={form.recordDate}
                onChange={(event) => {
                  const value = event.currentTarget.value;
                  updateTextField("recordDate", value);
                }}
              />
            </label>
            <label>
              <span>№ пресса</span>
              <select
                required
                value={form.pressNumber}
                onChange={(event) => {
                  const value = event.currentTarget.value;
                  updateTextField("pressNumber", value);
                }}
              >
                <option value="">Выберите пресс</option>
                {laboratoryGreenProductQualityPressNumberValues.map((value) => (
                  <option key={value} value={value}>{value}</option>
                ))}
              </select>
            </label>
            <label>
              <span>Марка изделия</span>
              <ProductBrandPicker
                ariaLabel="Марка изделия"
                labels={productBrands}
                name="productBrand"
                value={form.productBrand}
                onChange={(value) => updateTextField("productBrand", value)}
              />
            </label>
            {renderOptionField(
              "Садчик",
              "setter",
              form.setter,
              options.setters,
              updateTextField,
            )}
            {renderOptionField(
              "Прессовщик",
              "pressOperator",
              form.pressOperator,
              options.pressOperators,
              updateTextField,
            )}
            <fieldset className="laboratory-form-wide green-product-quality-wagons">
              <legend>№№ вагонов</legend>
              {options.wagons.length === 0 ? (
                <p className="laboratory-empty-note">
                  Вагоны появятся после добавления записей в журнале вагонов.
                </p>
              ) : (
                <div className="green-product-quality-wagon-options">
                  {options.wagons.map((wagon) => (
                    <label key={wagon.id}>
                      <input
                        checked={form.wagonIds.includes(wagon.id)}
                        type="checkbox"
                        value={wagon.id}
                        onChange={(event) => {
                          const checked = event.currentTarget.checked;
                          toggleWagon(wagon.id, checked);
                        }}
                      />
                      <span>{wagon.number}</span>
                    </label>
                  ))}
                </div>
              )}
              {form.wagonIds.length > 0 ? (
                <p className="green-product-quality-wagon-summary">
                  {options.wagons
                    .filter((wagon) => form.wagonIds.includes(wagon.id))
                    .map((wagon) => wagon.number)
                    .join("; ")}
                </p>
              ) : null}
            </fieldset>
          </div>
        </section>

        <section className="sample-registration-journal-section">
          <h3>Линейные размеры</h3>
          <div className="green-product-quality-dimensions">
            {dimensionPairs.map((pair) => (
              <div className="green-product-quality-dimension-pair" key={pair.label}>
                <h4>{pair.label}</h4>
                <div className="laboratory-form-grid">
                  {renderMeasurementField(
                    `${pair.label} 1`,
                    pair.first,
                    form[pair.first],
                    updateTextField,
                  )}
                  {renderMeasurementField(
                    `${pair.label} 2`,
                    pair.second,
                    form[pair.second],
                    updateSecondDimension,
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="sample-registration-journal-section">
          <h3>Показатели качества</h3>
          <div className="laboratory-form-grid green-product-quality-form-grid">
            {renderMeasurementField("Вес", "weight", form.weight, updateTextField)}
            {renderMeasurementField(
              "Механическая прочность",
              "mechanicalStrength",
              form.mechanicalStrength,
              updateTextField,
            )}
            {renderMeasurementField("Плотность", "density", form.density, updateTextField)}
            <label className="laboratory-form-wide">
              <span>Рекомендации прессовщику</span>
              <textarea
                required
                maxLength={2000}
                value={form.pressOperatorRecommendations}
                onChange={(event) => {
                  const value = event.currentTarget.value;
                  updateTextField("pressOperatorRecommendations", value);
                }}
              />
            </label>
          </div>
        </section>

        {productBrandsLoadState.status === "loading" ? (
          <LoadingIndicator label="Загружаем номенклатуру…" variant="inline" />
        ) : productBrandsLoadState.status === "error" ? (
          <p className="form-message is-error" role="alert">
            {productBrandsLoadState.message}
          </p>
        ) : null}
        <div className="form-actions">
          <button
            disabled={
              isSubmitting ||
              isAdminPreviewMode ||
              productBrandsLoadState.status !== "ready"
            }
            type="submit"
          >
            {isSubmitting ? (
              <LoadingIndicator label="Сохраняем…" variant="button" />
            ) : editingRecordId === undefined ? "Сохранить" : "Сохранить исправление"}
          </button>
          {editingRecordId === undefined ? null : (
            <button
              className="secondary-button"
              disabled={isSubmitting}
              type="button"
              onClick={resetForm}
            >
              Отмена
            </button>
          )}
        </div>
        {formMessage ? (
          <p className={`form-message${formMessage.includes("Не удалось") ? " is-error" : ""}`}>
            {formMessage}
          </p>
        ) : null}
      </form>

      <section className="laboratory-history green-product-quality-history">
        <div className="laboratory-history-heading">
          <div>
            <span className="eyebrow">История</span>
            <h2>Контроль качества сырцовой продукции</h2>
          </div>
          <div className="laboratory-filters green-product-quality-filters">
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
                placeholder="Марка, вагон или сотрудник"
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
        <LaboratoryGreenProductQualityTable
          records={history.records}
          onEditRecord={isAdminPreviewMode ? undefined : editRecord}
        />
      </section>

      <datalist id="green-product-quality-setter-options">
        {options.setters.map((value) => <option key={value} value={value} />)}
      </datalist>
      <datalist id="green-product-quality-press-operator-options">
        {options.pressOperators.map((value) => <option key={value} value={value} />)}
      </datalist>
    </div>
  );
}

function renderOptionField(
  label: string,
  field: "setter" | "pressOperator",
  value: string,
  options: string[],
  update: (field: TextField, value: string) => void,
) {
  const listId = field === "setter"
    ? "green-product-quality-setter-options"
    : "green-product-quality-press-operator-options";
  return (
    <label key={field}>
      <span>{label}</span>
      <input
        required
        list={listId}
        maxLength={120}
        value={value}
        onChange={(event) => {
          const nextValue = event.currentTarget.value;
          update(field, nextValue);
        }}
      />
    </label>
  );
}

function renderMeasurementField<Field extends TextField>(
  label: string,
  field: Field,
  value: string,
  update: (field: Field, value: string) => void,
) {
  return (
    <label key={field}>
      <span>{label}</span>
      <input
        required
        inputMode="decimal"
        maxLength={40}
        value={value}
        onChange={(event) => {
          const nextValue = event.currentTarget.value;
          update(field, nextValue);
        }}
      />
    </label>
  );
}

function createEmptyForm(): FormState {
  return {
    recordDate: "",
    pressNumber: "",
    productBrand: "",
    setter: "",
    pressOperator: "",
    wagonIds: [],
    lengthFirst: "",
    lengthSecond: "",
    widthFirst: "",
    widthSecond: "",
    heightFirst: "",
    heightSecond: "",
    weight: "",
    mechanicalStrength: "",
    density: "",
    pressOperatorRecommendations: "",
  };
}

function buildSubmission(
  form: FormState,
): LaboratoryGreenProductQualitySubmission | undefined {
  const normalized = {
    ...form,
    recordDate: form.recordDate.trim(),
    pressNumber: form.pressNumber.trim(),
    productBrand: form.productBrand.trim(),
    setter: form.setter.trim(),
    pressOperator: form.pressOperator.trim(),
    wagonIds: [...new Set(form.wagonIds)],
    lengthFirst: form.lengthFirst.trim(),
    lengthSecond: form.lengthSecond.trim(),
    widthFirst: form.widthFirst.trim(),
    widthSecond: form.widthSecond.trim(),
    heightFirst: form.heightFirst.trim(),
    heightSecond: form.heightSecond.trim(),
    weight: form.weight.trim(),
    mechanicalStrength: form.mechanicalStrength.trim(),
    density: form.density.trim(),
    pressOperatorRecommendations: form.pressOperatorRecommendations.trim(),
  };
  if (
    normalized.recordDate === "" ||
    normalized.productBrand === "" ||
    normalized.setter === "" ||
    normalized.pressOperator === "" ||
    normalized.pressOperatorRecommendations === "" ||
    normalized.wagonIds.length === 0 ||
    !laboratoryGreenProductQualityPressNumberValues.includes(
      normalized.pressNumber as LaboratoryGreenProductQualitySubmission["pressNumber"],
    ) ||
    [
      normalized.lengthFirst,
      normalized.lengthSecond,
      normalized.widthFirst,
      normalized.widthSecond,
      normalized.heightFirst,
      normalized.heightSecond,
      normalized.weight,
      normalized.mechanicalStrength,
      normalized.density,
    ].some((value) => !/^\d+(?:[.,]\d+)?$/u.test(value))
  ) {
    return undefined;
  }
  return normalized as LaboratoryGreenProductQualitySubmission;
}

function addOption(values: string[], value: string) {
  return [value, ...values.filter((item) => item !== value)];
}
