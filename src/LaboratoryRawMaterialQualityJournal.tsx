import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import {
  laboratoryClayMeasurementFields,
  laboratoryRawMaterialQualityBallMillValues,
  laboratoryRawMaterialQualityDisintegratorValues,
  laboratoryRawMaterialQualityGeneralFields,
  laboratoryRawMaterialQualityRecommendationRecipientLabels,
  laboratoryRawMaterialQualityRecommendationRecipientValues,
  laboratoryRawMaterialQualityShiftLabels,
  laboratoryRawMaterialQualityShiftValues,
  laboratoryRawMaterialQualitySixSlotValues,
  laboratoryRawMaterialQualitySummaryFields,
  laboratoryRunnerMeasurementFields,
  laboratorySlipMeasurementFields,
  laboratoryTemperMeasurementFields,
  type LaboratoryRawMaterialQualityDisintegrator,
  type LaboratoryRawMaterialQualityOptions,
  type LaboratoryRawMaterialQualityRecommendationRecipient,
  type LaboratoryRawMaterialQualityRecord,
  type LaboratoryRawMaterialQualityShift,
  type LaboratoryRawMaterialQualitySubmission,
  type LaboratoryRunnerMeasurementRow,
  type LaboratorySlipMeasurementRow,
  type LaboratoryTemperMeasurementRow,
} from "./contracts";
import { LaboratoryRawMaterialQualityTable } from "./LaboratoryJournalTables";
import { LoadingIndicator } from "./LoadingIndicator";
import {
  correctLaboratoryRawMaterialQualityRecord,
  requestLaboratoryRawMaterialQualityDraft,
  requestLaboratoryRawMaterialQualityJournal,
  requestLaboratoryRawMaterialQualityOptions,
  submitLaboratoryRawMaterialQualityRecord,
} from "./services/laboratoryRawMaterialQualityJournal";
import { readShortUserMessage } from "./services/userFacingMessages";
import type { ShowToast } from "./services/toastStack";

type GeneralFormState = {
  recordDate: string;
  laboratoryAssistant: string;
  shiftSupervisor: string;
  shift: string;
};

type ClayRowState = {
  clayBrand: string;
  disintegratorNumber: string;
  moisture: string;
  sieveResidue3: string;
  sievePass05: string;
};
type TemperRowState = {
  temperBrand: string;
  ballMillNumber: string;
  sieveResidue3: string;
  sieveResidue2: string;
  sieveResidue1: string;
  sievePass05: string;
};
type SlipRowState = { mixerNumber: string; temperature: string; density: string };
type RunnerRowState = {
  runnerNumber: string;
  chamottePercentage: string;
  clayPercentage: string;
  residue0063: string;
  moisture: string;
  isReserve: boolean;
};

type SummaryFormState = {
  elutriationCoefficient: string;
  recommendationRecipient: string;
  recommendationText: string;
};

type HistoryState =
  | { status: "loading"; records: LaboratoryRawMaterialQualityRecord[] }
  | { status: "ready"; records: LaboratoryRawMaterialQualityRecord[] }
  | {
      status: "error";
      message: string;
      records: LaboratoryRawMaterialQualityRecord[];
    };

const emptyOptions: LaboratoryRawMaterialQualityOptions = {
  laboratoryAssistants: [],
  shiftSupervisors: [],
  clayBrands: [],
  temperBrands: [],
};

const emptyClayRow: ClayRowState = {
  clayBrand: "",
  disintegratorNumber: "",
  moisture: "",
  sieveResidue3: "",
  sievePass05: "",
};
const emptyTemperRow: TemperRowState = {
  temperBrand: "",
  ballMillNumber: "",
  sieveResidue3: "",
  sieveResidue2: "",
  sieveResidue1: "",
  sievePass05: "",
};
const emptySlipRow: SlipRowState = { mixerNumber: "", temperature: "", density: "" };
const emptyRunnerRow: RunnerRowState = {
  runnerNumber: "",
  chamottePercentage: "",
  clayPercentage: "",
  residue0063: "",
  moisture: "",
  isReserve: true,
};

const runnerDataFieldIds: readonly (keyof Omit<RunnerRowState, "isReserve" | "runnerNumber">)[] = [
  "chamottePercentage",
  "clayPercentage",
  "residue0063",
  "moisture",
];

export function LaboratoryRawMaterialQualityJournal({
  isAdminPreviewMode,
  onShowToast,
}: {
  isAdminPreviewMode: boolean;
  onShowToast: ShowToast;
}) {
  const [general, setGeneral] = useState<GeneralFormState>(createEmptyGeneralForm);
  const [clayRows, setClayRows] = useState<ClayRowState[]>([]);
  const [temperRows, setTemperRows] = useState<TemperRowState[]>([]);
  const [slipRows, setSlipRows] = useState<SlipRowState[]>([]);
  const [runnerRows, setRunnerRows] = useState<RunnerRowState[]>([]);
  const [summary, setSummary] = useState<SummaryFormState>(createEmptySummaryForm);
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

  useEffect(() => {
    if (isAdminPreviewMode || editingRecordId !== undefined) return;
    const controller = new AbortController();
    requestLaboratoryRawMaterialQualityDraft({ signal: controller.signal })
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
    requestLaboratoryRawMaterialQualityOptions({ signal: controller.signal })
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
    requestLaboratoryRawMaterialQualityJournal(
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
              "Не удалось загрузить журнал качества сырья.",
            ),
            records: current.records,
          });
    });
    return () => controller.abort();
  }, [dateFrom, dateTo, query, refreshVersion]);

  function updateGeneral(field: keyof GeneralFormState, value: string) {
    setGeneral((current) => ({ ...current, [field]: value }));
    setFormMessage("");
  }

  function updateSummary(field: keyof SummaryFormState, value: string) {
    setSummary((current) => ({ ...current, [field]: value }));
    setFormMessage("");
  }

  function updateClayRow(index: number, field: keyof ClayRowState, value: string) {
    setClayRows((current) => current.map((row, rowIndex) =>
      rowIndex === index ? { ...row, [field]: value } : row));
    setFormMessage("");
  }

  function updateTemperRow(index: number, field: keyof TemperRowState, value: string) {
    setTemperRows((current) => current.map((row, rowIndex) =>
      rowIndex === index ? { ...row, [field]: value } : row));
    setFormMessage("");
  }

  function updateSlipRow(index: number, field: keyof SlipRowState, value: string) {
    setSlipRows((current) => current.map((row, rowIndex) =>
      rowIndex === index ? { ...row, [field]: value } : row));
    setFormMessage("");
  }

  function updateRunnerField(
    index: number,
    field: keyof Omit<RunnerRowState, "isReserve">,
    value: string,
  ) {
    setRunnerRows((current) => current.map((row, rowIndex) => {
      if (rowIndex !== index) return row;
      const updated = { ...row, [field]: value };
      if (
        row.isReserve &&
        value.trim() !== "" &&
        (runnerDataFieldIds as readonly string[]).includes(field)
      ) {
        updated.isReserve = false;
      }
      return updated;
    }));
    setFormMessage("");
  }

  function updateRunnerReserve(index: number, isReserve: boolean) {
    setRunnerRows((current) => current.map((row, rowIndex) =>
      rowIndex === index ? { ...row, isReserve } : row));
  }

  function addClayRow() {
    setClayRows((current) => {
      const last = current[current.length - 1];
      return [...current, {
        ...emptyClayRow,
        clayBrand: last?.clayBrand ?? "",
        disintegratorNumber: last?.disintegratorNumber ?? "",
      }];
    });
  }

  function addTemperRow() {
    setTemperRows((current) => {
      const last = current[current.length - 1];
      return [...current, {
        ...emptyTemperRow,
        temperBrand: last?.temperBrand ?? "",
        ballMillNumber: last?.ballMillNumber ?? "",
      }];
    });
  }

  function addSlipRow() {
    setSlipRows((current) => [...current, { ...emptySlipRow }]);
  }

  function addRunnerRow() {
    setRunnerRows((current) => [...current, { ...emptyRunnerRow }]);
  }

  function removeClayRow(index: number) {
    setClayRows((current) => current.filter((_, rowIndex) => rowIndex !== index));
  }

  function removeTemperRow(index: number) {
    setTemperRows((current) => current.filter((_, rowIndex) => rowIndex !== index));
  }

  function removeSlipRow(index: number) {
    setSlipRows((current) => current.filter((_, rowIndex) => rowIndex !== index));
  }

  function removeRunnerRow(index: number) {
    setRunnerRows((current) => current.filter((_, rowIndex) => rowIndex !== index));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isAdminPreviewMode) return;
    const submission = buildSubmission({
      general, clayRows, temperRows, slipRows, runnerRows, summary,
    });
    if (submission === undefined) {
      setFormMessage("Заполните дату, лаборанта, мастера смены и смену.");
      return;
    }

    setIsSubmitting(true);
    setFormMessage("Сохраняем запись…");
    const result = editingRecordId === undefined
      ? await submitLaboratoryRawMaterialQualityRecord(submission)
      : await correctLaboratoryRawMaterialQualityRecord(
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
    mergeRecordOptions(result.record);
    resetForm();
    setRefreshVersion((value) => value + 1);
    onShowToast(
      wasEditing ? "Запись исправлена" : "Запись сохранена",
      `${result.record.recordDate} · ${result.record.shiftSupervisor}.`,
      "success",
    );
  }

  function editRecord(record: LaboratoryRawMaterialQualityRecord) {
    setEditingRecordId(record.id);
    setGeneral({
      recordDate: record.recordDate,
      laboratoryAssistant: record.laboratoryAssistant,
      shiftSupervisor: record.shiftSupervisor,
      shift: record.shift,
    });
    setClayRows(record.clayMeasurements.map((row) => ({
      clayBrand: row.clayBrand ?? "",
      disintegratorNumber: row.disintegratorNumber ?? "",
      moisture: row.moisture ?? "",
      sieveResidue3: row.sieveResidue3 ?? "",
      sievePass05: row.sievePass05 ?? "",
    })));
    setTemperRows(record.temperMeasurements.map((row) => ({
      temperBrand: row.temperBrand ?? "",
      ballMillNumber: row.ballMillNumber ?? "",
      sieveResidue3: row.sieveResidue3 ?? "",
      sieveResidue2: row.sieveResidue2 ?? "",
      sieveResidue1: row.sieveResidue1 ?? "",
      sievePass05: row.sievePass05 ?? "",
    })));
    setSlipRows(record.slipMeasurements.map((row) => ({
      mixerNumber: row.mixerNumber ?? "",
      temperature: row.temperature ?? "",
      density: row.density ?? "",
    })));
    setRunnerRows(record.runnerMeasurements.map((row) => ({
      runnerNumber: row.runnerNumber ?? "",
      chamottePercentage: row.chamottePercentage ?? "",
      clayPercentage: row.clayPercentage ?? "",
      residue0063: row.residue0063 ?? "",
      moisture: row.moisture ?? "",
      isReserve: row.isReserve,
    })));
    setSummary({
      elutriationCoefficient: record.elutriationCoefficient ?? "",
      recommendationRecipient: record.recommendationRecipient ?? "",
      recommendationText: record.recommendationText ?? "",
    });
    setFormMessage("");
  }

  function resetForm() {
    setEditingRecordId(undefined);
    setGeneral(createEmptyGeneralForm());
    setClayRows([]);
    setTemperRows([]);
    setSlipRows([]);
    setRunnerRows([]);
    setSummary(createEmptySummaryForm());
  }

  function mergeRecordOptions(record: LaboratoryRawMaterialQualityRecord) {
    setOptions((current) => ({
      laboratoryAssistants: addOption(current.laboratoryAssistants, record.laboratoryAssistant),
      shiftSupervisors: addOption(current.shiftSupervisors, record.shiftSupervisor),
      clayBrands: record.clayMeasurements.reduce(
        (values, row) => row.clayBrand === null ? values : addOption(values, row.clayBrand),
        current.clayBrands,
      ),
      temperBrands: record.temperMeasurements.reduce(
        (values, row) => row.temperBrand === null ? values : addOption(values, row.temperBrand),
        current.temperBrands,
      ),
    }));
  }

  return (
    <div className="raw-material-quality-journal">
      <form className="laboratory-form raw-material-quality-form" onSubmit={submit}>
        <div className="sample-registration-journal-heading">
          <span className="eyebrow">Лаборатория · ОЦ</span>
          <h2>Журнал контроля качества сырья и соблюдения технологии</h2>
          {editingRecordId === undefined
            ? null
            : <p>{`Редактирование записи от ${general.recordDate}`}</p>}
        </div>

        <section className="sample-registration-journal-section">
          <h3>Общие сведения</h3>
          <div className="laboratory-form-grid raw-material-quality-form-grid">
            {laboratoryRawMaterialQualityGeneralFields.map((field) => (
              <label key={field.id}>
                <span>{field.label}</span>
                {renderControl({
                  kind: field.kind,
                  value: general[field.id],
                  required: true,
                  listId: field.kind === "option" ? `${field.id}-options` : undefined,
                  onChange: (value) => updateGeneral(field.id, value),
                })}
              </label>
            ))}
          </div>
        </section>

        <section className="sample-registration-journal-section">
          <h3>Контроль качества глины</h3>
          {renderMeasurementTable({
            rows: clayRows,
            fields: laboratoryClayMeasurementFields,
            hasCounter: true,
            listIds: { clayBrand: "clayBrand-options" },
            onUpdate: updateClayRow,
            onRemove: removeClayRow,
          })}
          <button
            className="secondary-button raw-material-quality-add-row"
            disabled={isSubmitting}
            type="button"
            onClick={addClayRow}
          >
            Добавить строку
          </button>
        </section>

        <section className="sample-registration-journal-section">
          <h3>Отощитель</h3>
          {renderMeasurementTable({
            rows: temperRows,
            fields: laboratoryTemperMeasurementFields,
            hasCounter: true,
            listIds: { temperBrand: "temperBrand-options" },
            onUpdate: updateTemperRow,
            onRemove: removeTemperRow,
          })}
          <button
            className="secondary-button raw-material-quality-add-row"
            disabled={isSubmitting}
            type="button"
            onClick={addTemperRow}
          >
            Добавить строку
          </button>
        </section>

        <section className="sample-registration-journal-section">
          <h3>Шликер</h3>
          {renderMeasurementTable({
            rows: slipRows,
            fields: laboratorySlipMeasurementFields,
            hasCounter: true,
            listIds: {},
            onUpdate: updateSlipRow,
            onRemove: removeSlipRow,
          })}
          <button
            className="secondary-button raw-material-quality-add-row"
            disabled={isSubmitting}
            type="button"
            onClick={addSlipRow}
          >
            Добавить строку
          </button>
        </section>

        <section className="sample-registration-journal-section">
          <h3>Бегуны</h3>
          <div className="refractory-table-wrap refractory-table-wrap-full-height raw-material-quality-table-wrap">
            <table className="refractory-input-table raw-material-quality-measurement-table">
              <thead>
                <tr>
                  {laboratoryRunnerMeasurementFields.map((field) => (
                    <th key={field.id}>{field.label}</th>
                  ))}
                  <th />
                </tr>
              </thead>
              <tbody>
                {runnerRows.map((row, index) => (
                  <tr key={index}>
                    {laboratoryRunnerMeasurementFields.map((field) => (
                      <td key={field.id}>
                        {field.id === "isReserve" ? (
                          <input
                            aria-label={field.label}
                            checked={row.isReserve}
                            disabled={isSubmitting}
                            onChange={(event) => updateRunnerReserve(
                              index,
                              event.currentTarget.checked,
                            )}
                            type="checkbox"
                          />
                        ) : renderControl({
                          kind: field.kind,
                          value: row[field.id as keyof Omit<RunnerRowState, "isReserve">],
                          ariaLabel: field.label,
                          disabled: isSubmitting,
                          onChange: (value) => updateRunnerField(
                            index,
                            field.id as keyof Omit<RunnerRowState, "isReserve">,
                            value,
                          ),
                        })}
                      </td>
                    ))}
                    <td>
                      <button
                        aria-label="Удалить строку"
                        className="raw-material-quality-row-remove"
                        disabled={isSubmitting}
                        onClick={() => removeRunnerRow(index)}
                        type="button"
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
            onClick={addRunnerRow}
          >
            Добавить строку
          </button>

          <div className="raw-material-quality-subsection">
            <h4>Состав шихты</h4>
            <div className="laboratory-form-grid raw-material-quality-form-grid">
              {laboratoryRawMaterialQualitySummaryFields.map((field) => (
                <label
                  className={field.kind === "long_text" ? "laboratory-form-wide" : undefined}
                  key={field.id}
                >
                  <span>{field.label}</span>
                  {renderControl({
                    kind: field.kind,
                    value: summary[field.id],
                    disabled: isSubmitting,
                    onChange: (value) => updateSummary(field.id, value),
                  })}
                </label>
              ))}
            </div>
          </div>
        </section>

        <div className="laboratory-form-actions">
          <button
            className="primary-button"
            disabled={isAdminPreviewMode || isSubmitting}
            type="submit"
          >
            {isSubmitting
              ? <LoadingIndicator label="Сохраняем…" variant="button" />
              : editingRecordId === undefined
                ? "Внести данные"
                : "Сохранить изменения"}
          </button>
          {editingRecordId === undefined ? null : (
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

      <section className="laboratory-history raw-material-quality-history">
        <div className="laboratory-history-heading">
          <div>
            <span className="eyebrow">История</span>
            <h2>Журнал контроля качества сырья и соблюдения технологии</h2>
          </div>
          <div className="laboratory-filters raw-material-quality-filters">
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
                placeholder="Лаборант, марка или рекомендация"
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
        <LaboratoryRawMaterialQualityTable
          records={history.records}
          onEditRecord={isAdminPreviewMode ? undefined : editRecord}
        />
      </section>

      {renderDatalists(options)}
    </div>
  );
}

function renderMeasurementTable<Field extends { id: string; label: string; kind: string }>({
  rows,
  fields,
  hasCounter,
  listIds,
  onUpdate,
  onRemove,
}: {
  rows: Array<Record<string, string>>;
  fields: readonly Field[];
  hasCounter: boolean;
  listIds: Record<string, string>;
  onUpdate: (index: number, field: never, value: string) => void;
  onRemove: (index: number) => void;
}) {
  return (
    <div className="refractory-table-wrap refractory-table-wrap-full-height raw-material-quality-table-wrap">
      <table className="refractory-input-table raw-material-quality-measurement-table">
        <thead>
          <tr>
            {hasCounter ? <th>№ Замера</th> : null}
            {fields.map((field) => <th key={field.id}>{field.label}</th>)}
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index}>
              {hasCounter ? <td>{index + 1}</td> : null}
              {fields.map((field) => (
                <td key={field.id}>
                  {renderControl({
                    kind: field.kind,
                    value: row[field.id] ?? "",
                    ariaLabel: field.label,
                    listId: listIds[field.id],
                    onChange: (value) => onUpdate(index, field.id as never, value),
                  })}
                </td>
              ))}
              <td>
                <button
                  aria-label="Удалить строку"
                  className="raw-material-quality-row-remove"
                  onClick={() => onRemove(index)}
                  type="button"
                >
                  ✕
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function renderControl({
  kind,
  value,
  onChange,
  required,
  disabled,
  listId,
  ariaLabel,
}: {
  kind: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  disabled?: boolean;
  listId?: string;
  ariaLabel?: string;
}) {
  const commonProps = {
    "aria-label": ariaLabel,
    disabled,
    required,
    value,
    onChange: (
      event: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>,
    ) => onChange(event.currentTarget.value),
  };
  if (kind === "shift") {
    return (
      <select {...commonProps}>
        <option value="">Выберите смену</option>
        {laboratoryRawMaterialQualityShiftValues.map((option) => (
          <option key={option} value={option}>
            {laboratoryRawMaterialQualityShiftLabels[option]}
          </option>
        ))}
      </select>
    );
  }
  if (kind === "disintegrator") {
    return (
      <select {...commonProps}>
        <option value="">—</option>
        {laboratoryRawMaterialQualityDisintegratorValues.map((option) => (
          <option key={option} value={option}>{option}</option>
        ))}
      </select>
    );
  }
  if (kind === "ball_mill") {
    return (
      <select {...commonProps}>
        <option value="">—</option>
        {laboratoryRawMaterialQualityBallMillValues.map((option) => (
          <option key={option} value={option}>{`№ ${option}`}</option>
        ))}
      </select>
    );
  }
  if (kind === "mixer_number" || kind === "runner_number") {
    return (
      <select {...commonProps}>
        <option value="">—</option>
        {laboratoryRawMaterialQualitySixSlotValues.map((option) => (
          <option key={option} value={option}>{option}</option>
        ))}
      </select>
    );
  }
  if (kind === "recommendation") {
    return (
      <select {...commonProps}>
        <option value="">Не выбран</option>
        {laboratoryRawMaterialQualityRecommendationRecipientValues.map((option) => (
          <option key={option} value={option}>
            {laboratoryRawMaterialQualityRecommendationRecipientLabels[option]}
          </option>
        ))}
      </select>
    );
  }
  if (kind === "long_text") {
    return <textarea {...commonProps} maxLength={2000} />;
  }
  return (
    <input
      {...commonProps}
      list={listId}
      maxLength={kind === "date" ? undefined : 120}
      type={kind === "date" ? "date" : "text"}
    />
  );
}

function renderDatalists(options: LaboratoryRawMaterialQualityOptions) {
  const lists = [
    ["laboratoryAssistant", options.laboratoryAssistants],
    ["shiftSupervisor", options.shiftSupervisors],
    ["clayBrand", options.clayBrands],
    ["temperBrand", options.temperBrands],
  ] as const;
  return lists.map(([field, values]) => (
    <datalist id={`${field}-options`} key={field}>
      {values.map((value) => <option key={value} value={value} />)}
    </datalist>
  ));
}

function createEmptyGeneralForm(): GeneralFormState {
  return { recordDate: "", laboratoryAssistant: "", shiftSupervisor: "", shift: "" };
}

function createEmptySummaryForm(): SummaryFormState {
  return { elutriationCoefficient: "", recommendationRecipient: "", recommendationText: "" };
}

function buildSubmission({
  general,
  clayRows,
  temperRows,
  slipRows,
  runnerRows,
  summary,
}: {
  general: GeneralFormState;
  clayRows: ClayRowState[];
  temperRows: TemperRowState[];
  slipRows: SlipRowState[];
  runnerRows: RunnerRowState[];
  summary: SummaryFormState;
}): LaboratoryRawMaterialQualitySubmission | undefined {
  const recordDate = general.recordDate.trim();
  const laboratoryAssistant = general.laboratoryAssistant.trim();
  const shiftSupervisor = general.shiftSupervisor.trim();
  const shift = general.shift.trim();
  if (
    recordDate === "" ||
    laboratoryAssistant === "" ||
    shiftSupervisor === "" ||
    !laboratoryRawMaterialQualityShiftValues.includes(
      shift as LaboratoryRawMaterialQualityShift,
    )
  ) {
    return undefined;
  }

  return {
    recordDate,
    laboratoryAssistant,
    shiftSupervisor,
    shift: shift as LaboratoryRawMaterialQualityShift,
    clayMeasurements: clayRows
      .filter((row) => !isRowEmpty(row))
      .map((row) => ({
        measurementNumber: 0,
        clayBrand: readNullable(row.clayBrand),
        disintegratorNumber:
          readNullable(row.disintegratorNumber) as LaboratoryRawMaterialQualityDisintegrator | null,
        moisture: readNullable(row.moisture),
        sieveResidue3: readNullable(row.sieveResidue3),
        sievePass05: readNullable(row.sievePass05),
      })),
    temperMeasurements: temperRows
      .filter((row) => !isRowEmpty(row))
      .map((row) => ({
        measurementNumber: 0,
        temperBrand: readNullable(row.temperBrand),
        ballMillNumber:
          readNullable(row.ballMillNumber) as LaboratoryTemperMeasurementRow["ballMillNumber"],
        sieveResidue3: readNullable(row.sieveResidue3),
        sieveResidue2: readNullable(row.sieveResidue2),
        sieveResidue1: readNullable(row.sieveResidue1),
        sievePass05: readNullable(row.sievePass05),
      })),
    slipMeasurements: slipRows
      .filter((row) => !isRowEmpty(row))
      .map((row) => ({
        measurementNumber: 0,
        mixerNumber: readNullable(row.mixerNumber) as LaboratorySlipMeasurementRow["mixerNumber"],
        temperature: readNullable(row.temperature),
        density: readNullable(row.density),
      })),
    runnerMeasurements: runnerRows
      .filter((row) => row.runnerNumber.trim() !== "")
      .map((row) => ({
        runnerNumber:
          readNullable(row.runnerNumber) as LaboratoryRunnerMeasurementRow["runnerNumber"],
        chamottePercentage: readNullable(row.chamottePercentage),
        clayPercentage: readNullable(row.clayPercentage),
        residue0063: readNullable(row.residue0063),
        moisture: readNullable(row.moisture),
        isReserve: row.isReserve,
      })),
    elutriationCoefficient: readNullable(summary.elutriationCoefficient),
    recommendationRecipient:
      readNullable(summary.recommendationRecipient) as
        LaboratoryRawMaterialQualityRecommendationRecipient | null,
    recommendationText: readNullable(summary.recommendationText),
  };
}

function isRowEmpty(row: Record<string, string>) {
  return Object.values(row).every((value) => value.trim() === "");
}

function readNullable(value: string) {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function addOption(values: string[], value: string) {
  return [value, ...values.filter((item) => item !== value)];
}
