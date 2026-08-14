import { useEffect, useState, type FormEvent } from "react";
import {
  laboratoryGreenProductQualityMeasurementFields,
  laboratoryGreenProductQualityPressNumberValues,
  type LaboratoryGreenProductQualityMeasurement,
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
import type { ShowToast } from "./services/toastStack";
import { useProductionBrands } from "./useProductionBrands";

type GeneralFormState = {
  recordDate: string;
  pressNumber: string;
  productBrand: string;
  pressDate: string;
  setter: string;
  pressOperator: string;
  loadingDate: string;
  pieceCount: string;
  wagonIds: string[];
};

/** Строка таблицы замеров; `mirrorSecond` — UI-состояние, в контракт не входит. */
type MeasurementRowState = {
  lengthFirst: string;
  lengthSecond: string;
  widthFirst: string;
  widthSecond: string;
  heightFirst: string;
  heightSecond: string;
  weight: string;
  mechanicalStrength: string;
  density: string;
  mirrorSecond: { length: boolean; width: boolean; height: boolean };
};

type MeasurementField = Exclude<keyof MeasurementRowState, "mirrorSecond">;

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
  { key: "length", label: "Длина", first: "lengthFirst", second: "lengthSecond" },
  { key: "width", label: "Ширина", first: "widthFirst", second: "widthSecond" },
  { key: "height", label: "Высота", first: "heightFirst", second: "heightSecond" },
] as const satisfies readonly {
  key: "height" | "length" | "width";
  label: string;
  first: MeasurementField;
  second: MeasurementField;
}[];

const wagonBrandMismatchMessage =
  "Выбраны вагоны с разными марками, выберите с одинаковыми.";

export function LaboratoryGreenProductQualityJournal({
  isAdminPreviewMode,
  onShowToast,
}: {
  isAdminPreviewMode: boolean;
  onShowToast: ShowToast;
}) {
  const [general, setGeneral] = useState<GeneralFormState>(createEmptyGeneralForm);
  const [measurementRows, setMeasurementRows] = useState<MeasurementRowState[]>([
    createEmptyMeasurementRow(),
  ]);
  const [recommendations, setRecommendations] = useState("");
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
  const [wagonBrandError, setWagonBrandError] = useState("");
  const [editingRecordId, setEditingRecordId] = useState<string>();
  const [refreshVersion, setRefreshVersion] = useState(0);
  const { labels: productBrands, loadState: productBrandsLoadState } =
    useProductionBrands();

  useEffect(() => {
    if (isAdminPreviewMode || editingRecordId !== undefined) return;
    const controller = new AbortController();
    requestLaboratoryGreenProductQualityDraft({ signal: controller.signal })
      .then((result) => {
        if (controller.signal.aborted) return;
        if (result.status === "ready") {
          setGeneral((current) => current.recordDate === ""
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

  function updateGeneral(field: keyof Omit<GeneralFormState, "wagonIds">, value: string) {
    setGeneral((current) => ({ ...current, [field]: value }));
    setFormMessage("");
  }

  function updateMeasurementField(
    index: number,
    field: MeasurementField,
    value: string,
  ) {
    setMeasurementRows((current) => current.map((row, rowIndex) => {
      if (rowIndex !== index) return row;
      const pair = dimensionPairs.find((item) => item.first === field);
      return pair !== undefined && row.mirrorSecond[pair.key]
        ? { ...row, [field]: value, [pair.second]: value }
        : { ...row, [field]: value };
    }));
    setFormMessage("");
  }

  function updateMeasurementSecondDimension(
    index: number,
    field: MeasurementField,
    value: string,
  ) {
    setMeasurementRows((current) => current.map((row, rowIndex) => {
      if (rowIndex !== index) return row;
      const pair = dimensionPairs.find((item) => item.second === field);
      return {
        ...row,
        [field]: value,
        mirrorSecond: pair === undefined
          ? row.mirrorSecond
          : { ...row.mirrorSecond, [pair.key]: false },
      };
    }));
    setFormMessage("");
  }

  function addMeasurementRow() {
    setMeasurementRows((current) => [...current, createEmptyMeasurementRow()]);
  }

  function removeMeasurementRow(index: number) {
    setMeasurementRows((current) => current.filter((_, rowIndex) => rowIndex !== index));
  }

  function toggleWagon(id: string, checked: boolean) {
    if (checked) {
      const selectedWagons = options.wagons.filter((wagon) =>
        general.wagonIds.includes(wagon.id) || wagon.id === id
      );
      const selectedBrands = new Set(
        selectedWagons
          .map((wagon) => normalizeProductBrand(wagon.productBrand))
          .filter((brand): brand is string => brand !== undefined),
      );
      if (selectedBrands.size > 1) {
        setWagonBrandError(wagonBrandMismatchMessage);
        return;
      }
    }

    setGeneral((current) => {
      const wagonIds = checked
        ? [...current.wagonIds, id]
        : current.wagonIds.filter((wagonId) => wagonId !== id);
      const latestSelectedWagon = options.wagons.reduce<
        (typeof options.wagons)[number] | undefined
      >((latest, wagon) => {
        if (!wagonIds.includes(wagon.id)) return latest;
        if (latest === undefined) return wagon;
        return (wagon.loadingDate ?? "") > (latest.loadingDate ?? "")
          ? wagon
          : latest;
      }, undefined);
      return {
        ...current,
        wagonIds,
        ...(latestSelectedWagon?.productBrand === null ||
            latestSelectedWagon?.productBrand === undefined
          ? {}
          : { productBrand: latestSelectedWagon.productBrand }),
        ...(latestSelectedWagon?.setter === null ||
            latestSelectedWagon?.setter === undefined
          ? {}
          : { setter: latestSelectedWagon.setter }),
        ...(latestSelectedWagon?.pressOperator === null ||
            latestSelectedWagon?.pressOperator === undefined
          ? {}
          : { pressOperator: latestSelectedWagon.pressOperator }),
        ...(latestSelectedWagon?.pressDate === null ||
            latestSelectedWagon?.pressDate === undefined
          ? {}
          : { pressDate: latestSelectedWagon.pressDate }),
        ...(latestSelectedWagon?.loadingDate === null ||
            latestSelectedWagon?.loadingDate === undefined
          ? {}
          : { loadingDate: latestSelectedWagon.loadingDate }),
        ...(latestSelectedWagon?.pieceCount === null ||
            latestSelectedWagon?.pieceCount === undefined
          ? {}
          : { pieceCount: String(latestSelectedWagon.pieceCount) }),
      };
    });
    setWagonBrandError("");
    setFormMessage("");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isAdminPreviewMode) return;
    const submission = buildSubmission({ general, measurementRows, recommendations });
    if (submission === undefined) {
      setFormMessage(
        "Заполните общие сведения, выберите хотя бы один вагон и заполните " +
          "хотя бы одну строку замеров целиком.",
      );
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
      "success",
    );
  }

  function editRecord(record: LaboratoryGreenProductQualityRecord) {
    setEditingRecordId(record.id);
    setGeneral({
      recordDate: record.recordDate,
      pressNumber: record.pressNumber,
      productBrand: record.productBrand,
      pressDate: record.pressDate ?? "",
      setter: record.setter,
      pressOperator: record.pressOperator,
      loadingDate: record.loadingDate ?? "",
      pieceCount: record.pieceCount === null ? "" : String(record.pieceCount),
      wagonIds: record.wagonIds,
    });
    setMeasurementRows(
      record.measurements.length === 0
        ? [createEmptyMeasurementRow()]
        : record.measurements.map(measurementRowFromRecord),
    );
    setRecommendations(record.pressOperatorRecommendations);
    setWagonBrandError("");
    setFormMessage("");
  }

  function resetForm() {
    setEditingRecordId(undefined);
    setGeneral(createEmptyGeneralForm());
    setMeasurementRows([createEmptyMeasurementRow()]);
    setRecommendations("");
    setWagonBrandError("");
  }

  return (
    <div className="green-product-quality-journal">
      <form className="laboratory-form green-product-quality-form" onSubmit={submit}>
        <div className="sample-registration-journal-heading">
          <span className="eyebrow">Лаборатория · ОЦ</span>
          <h2>Журнал контроля качества сырцовой продукции</h2>
          {editingRecordId === undefined
            ? null
            : <p>{`Редактирование записи от ${general.recordDate}`}</p>}
        </div>

        <section className="sample-registration-journal-section">
          <h3>Общие сведения</h3>
          <div className="laboratory-form-grid green-product-quality-form-grid">
            <label>
              <span>Дата</span>
              <input
                required
                type="date"
                value={general.recordDate}
                onChange={(event) => {
                  const value = event.currentTarget.value;
                  updateGeneral("recordDate", value);
                }}
              />
            </label>
            <label>
              <span>№ пресса</span>
              <select
                required
                value={general.pressNumber}
                onChange={(event) => {
                  const value = event.currentTarget.value;
                  updateGeneral("pressNumber", value);
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
                value={general.productBrand}
                onChange={(value) => updateGeneral("productBrand", value)}
              />
            </label>
            <label>
              <span>Дата пресса</span>
              <input
                type="date"
                value={general.pressDate}
                onChange={(event) => {
                  const value = event.currentTarget.value;
                  updateGeneral("pressDate", value);
                }}
              />
            </label>
            {renderOptionField(
              "Садчик",
              "setter",
              general.setter,
              updateGeneral,
            )}
            {renderOptionField(
              "Прессовщик",
              "pressOperator",
              general.pressOperator,
              updateGeneral,
            )}
            <label>
              <span>Дата садки</span>
              <input
                type="date"
                value={general.loadingDate}
                onChange={(event) => {
                  const value = event.currentTarget.value;
                  updateGeneral("loadingDate", value);
                }}
              />
            </label>
            <label>
              <span>Кол-во шт.</span>
              <input
                inputMode="numeric"
                min={0}
                step={1}
                type="number"
                value={general.pieceCount}
                onChange={(event) => {
                  const value = event.currentTarget.value;
                  updateGeneral("pieceCount", value);
                }}
              />
            </label>
            <div className="laboratory-form-wide green-product-quality-wagons-field">
              <fieldset className="green-product-quality-wagons">
                <legend>№№ вагонов</legend>
                {options.wagons.length === 0 ? (
                  <p className="laboratory-empty-note">
                    Вагоны появятся после добавления записей в журнале оборота вагонов.
                  </p>
                ) : (
                  <div className="green-product-quality-wagon-options">
                    {options.wagons.map((wagon) => (
                      <label key={wagon.id}>
                        <input
                          checked={general.wagonIds.includes(wagon.id)}
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
                ) }
                {general.wagonIds.length > 0 ? (
                  <p className="green-product-quality-wagon-summary">
                    {options.wagons
                      .filter((wagon) => general.wagonIds.includes(wagon.id))
                      .map((wagon) => wagon.number)
                      .join("; ")}
                  </p>
                ) : null}
              </fieldset>
              {wagonBrandError === "" ? null : (
                <p
                  className="form-message is-error green-product-quality-wagon-brand-error"
                  role="alert"
                >
                  {wagonBrandError}
                </p>
              )}
            </div>
          </div>
        </section>

        <section className="sample-registration-journal-section">
          <h3>Линейные размеры и показатели качества</h3>
          <div className="refractory-table-wrap refractory-table-wrap-full-height raw-material-quality-table-wrap">
            <table className="refractory-input-table raw-material-quality-measurement-table">
              <thead>
                <tr>
                  <th>№ Замера</th>
                  {laboratoryGreenProductQualityMeasurementFields.map((field) => (
                    <th key={field.id}>{field.label}</th>
                  ))}
                  <th />
                </tr>
              </thead>
              <tbody>
                {measurementRows.map((row, index) => (
                  <tr key={index}>
                    <td>{index + 1}</td>
                    {laboratoryGreenProductQualityMeasurementFields.map((field) => {
                      const pair = dimensionPairs.find((item) => item.second === field.id);
                      return (
                        <td key={field.id}>
                          <input
                            aria-label={`${field.label}, строка ${index + 1}`}
                            disabled={isSubmitting}
                            inputMode="decimal"
                            maxLength={40}
                            value={row[field.id]}
                            onChange={(event) => {
                              const value = event.currentTarget.value;
                              if (pair === undefined) {
                                updateMeasurementField(index, field.id, value);
                              } else {
                                updateMeasurementSecondDimension(index, field.id, value);
                              }
                            }}
                          />
                        </td>
                      );
                    })}
                    <td>
                      <button
                        aria-label="Удалить строку"
                        className="raw-material-quality-row-remove"
                        disabled={isSubmitting}
                        type="button"
                        onClick={() => removeMeasurementRow(index)}
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button
            className="secondary-button raw-material-quality-add-row"
            disabled={isSubmitting}
            type="button"
            onClick={addMeasurementRow}
          >
            Добавить строку
          </button>
        </section>

        <section className="sample-registration-journal-section">
          <h3>Рекомендации прессовщику</h3>
          <div className="laboratory-form-grid green-product-quality-form-grid">
            <label className="laboratory-form-wide">
              <span>Рекомендации прессовщику</span>
              <textarea
                required
                maxLength={2000}
                value={recommendations}
                onChange={(event) => {
                  const value = event.currentTarget.value;
                  setRecommendations(value);
                  setFormMessage("");
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
  update: (field: "setter" | "pressOperator", value: string) => void,
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

function createEmptyGeneralForm(): GeneralFormState {
  return {
    recordDate: "",
    pressNumber: "",
    productBrand: "",
    pressDate: "",
    setter: "",
    pressOperator: "",
    loadingDate: "",
    pieceCount: "",
    wagonIds: [],
  };
}

function createEmptyMeasurementRow(): MeasurementRowState {
  return {
    lengthFirst: "",
    lengthSecond: "",
    widthFirst: "",
    widthSecond: "",
    heightFirst: "",
    heightSecond: "",
    weight: "",
    mechanicalStrength: "",
    density: "",
    mirrorSecond: { length: true, width: true, height: true },
  };
}

/** У сохранённой строки пары размеров уже различимы, поэтому зеркалим их,
 * только если первое и второе значение и так совпадают. */
function measurementRowFromRecord(
  measurement: LaboratoryGreenProductQualityMeasurement,
): MeasurementRowState {
  const mirrorSecond = Object.fromEntries(
    dimensionPairs.map((pair) => [
      pair.key,
      measurement[pair.first] === measurement[pair.second],
    ]),
  ) as MeasurementRowState["mirrorSecond"];
  return {
    lengthFirst: measurement.lengthFirst,
    lengthSecond: measurement.lengthSecond,
    widthFirst: measurement.widthFirst,
    widthSecond: measurement.widthSecond,
    heightFirst: measurement.heightFirst,
    heightSecond: measurement.heightSecond,
    weight: measurement.weight,
    mechanicalStrength: measurement.mechanicalStrength,
    density: measurement.density,
    mirrorSecond,
  };
}

function isMeasurementRowEmpty(row: MeasurementRowState) {
  return laboratoryGreenProductQualityMeasurementFields.every(
    (field) => row[field.id].trim() === "",
  );
}

function buildSubmission({
  general,
  measurementRows,
  recommendations,
}: {
  general: GeneralFormState;
  measurementRows: MeasurementRowState[];
  recommendations: string;
}): LaboratoryGreenProductQualitySubmission | undefined {
  const recordDate = general.recordDate.trim();
  const pressNumber = general.pressNumber.trim();
  const productBrand = general.productBrand.trim();
  const setter = general.setter.trim();
  const pressOperator = general.pressOperator.trim();
  const wagonIds = [...new Set(general.wagonIds)];
  const pressOperatorRecommendations = recommendations.trim();
  const pieceCountText = general.pieceCount.trim();
  const pieceCount = pieceCountText === "" ? null : Number(pieceCountText);

  const measurements = measurementRows
    .filter((row) => !isMeasurementRowEmpty(row))
    .map((row, index) => ({
      measurementNumber: index + 1,
      lengthFirst: row.lengthFirst.trim(),
      lengthSecond: row.lengthSecond.trim(),
      widthFirst: row.widthFirst.trim(),
      widthSecond: row.widthSecond.trim(),
      heightFirst: row.heightFirst.trim(),
      heightSecond: row.heightSecond.trim(),
      weight: row.weight.trim(),
      mechanicalStrength: row.mechanicalStrength.trim(),
      density: row.density.trim(),
    }));

  if (
    recordDate === "" ||
    productBrand === "" ||
    setter === "" ||
    pressOperator === "" ||
    pressOperatorRecommendations === "" ||
    wagonIds.length === 0 ||
    measurements.length === 0 ||
    (pieceCount !== null && !Number.isInteger(pieceCount)) ||
    !laboratoryGreenProductQualityPressNumberValues.includes(
      pressNumber as LaboratoryGreenProductQualitySubmission["pressNumber"],
    ) ||
    measurements.some((row) =>
      laboratoryGreenProductQualityMeasurementFields.some(
        (field) => !/^\d+(?:[.,]\d+)?$/u.test(row[field.id]),
      )
    )
  ) {
    return undefined;
  }

  return {
    recordDate,
    pressNumber: pressNumber as LaboratoryGreenProductQualitySubmission["pressNumber"],
    productBrand,
    pressDate: general.pressDate === "" ? null : general.pressDate,
    setter,
    pressOperator,
    loadingDate: general.loadingDate === "" ? null : general.loadingDate,
    pieceCount,
    wagonIds,
    measurements,
    pressOperatorRecommendations,
  };
}

function addOption(values: string[], value: string) {
  return [value, ...values.filter((item) => item !== value)];
}

function normalizeProductBrand(value: string | null) {
  const normalized = value?.trim().replace(/\s+/gu, " ");
  return normalized === undefined || normalized === ""
    ? undefined
    : normalized.toLocaleLowerCase("ru-RU");
}
