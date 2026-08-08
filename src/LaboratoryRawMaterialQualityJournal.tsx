import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import {
  laboratoryRawMaterialQualityDisintegratorValues,
  laboratoryRawMaterialQualityFields,
  laboratoryRawMaterialQualityRecommendationRecipientLabels,
  laboratoryRawMaterialQualityRecommendationRecipientValues,
  laboratoryRawMaterialQualityShiftLabels,
  laboratoryRawMaterialQualityShiftValues,
  type LaboratoryRawMaterialQualityFieldGroup,
  type LaboratoryRawMaterialQualityOptions,
  type LaboratoryRawMaterialQualityRecord,
  type LaboratoryRawMaterialQualitySubmission,
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

type FormState = Record<keyof LaboratoryRawMaterialQualitySubmission, string>;
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
  slipMixerNumbers: [],
  runnerNumbers: [],
};

const groupLabels: Record<LaboratoryRawMaterialQualityFieldGroup, string> = {
  general: "Общие сведения",
  clay: "Контроль качества глины",
  temper: "Отощитель",
  slip: "Шликер",
  runners: "Бегуны",
  charge: "Состав шихты",
};

const formGroups: readonly LaboratoryRawMaterialQualityFieldGroup[] = [
  "general",
  "clay",
  "temper",
  "slip",
  "runners",
];

export function LaboratoryRawMaterialQualityJournal({
  isAdminPreviewMode,
  onShowToast,
}: {
  isAdminPreviewMode: boolean;
  onShowToast: ShowToast;
}) {
  const [form, setForm] = useState(createEmptyForm);
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

  function updateField(field: keyof FormState, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
    setFormMessage("");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isAdminPreviewMode) return;
    const submission = buildSubmission(form);
    if (submission === undefined) {
      setFormMessage("Заполните все поля журнала.");
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
    setForm(Object.fromEntries(
      laboratoryRawMaterialQualityFields.map((field) => [
        field.id,
        record[field.id],
      ]),
    ) as FormState);
    setFormMessage("");
  }

  function resetForm() {
    setEditingRecordId(undefined);
    setForm(createEmptyForm());
  }

  function mergeRecordOptions(record: LaboratoryRawMaterialQualityRecord) {
    setOptions((current) => ({
      laboratoryAssistants: addOption(current.laboratoryAssistants, record.laboratoryAssistant),
      shiftSupervisors: addOption(current.shiftSupervisors, record.shiftSupervisor),
      clayBrands: addOption(current.clayBrands, record.clayBrand),
      temperBrands: addOption(current.temperBrands, record.temperBrand),
      slipMixerNumbers: addOption(current.slipMixerNumbers, record.slipMixerNumber),
      runnerNumbers: addOption(current.runnerNumbers, record.runnerNumber),
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
            : <p>{`Редактирование записи от ${form.recordDate}`}</p>}
        </div>

        {formGroups.map((group) => (
          <section className="sample-registration-journal-section" key={group}>
            <h3>{groupLabels[group]}</h3>
            <div className="laboratory-form-grid raw-material-quality-form-grid">
              {laboratoryRawMaterialQualityFields
                .filter((field) => field.group === group)
                .map((field) => renderField(field, form, updateField))}
            </div>
            {group === "runners" ? (
              <div className="raw-material-quality-subsection">
                <h4>{groupLabels.charge}</h4>
                <div className="laboratory-form-grid raw-material-quality-form-grid">
                  {laboratoryRawMaterialQualityFields
                    .filter((field) => field.group === "charge")
                    .map((field) => renderField(field, form, updateField))}
                </div>
              </div>
            ) : null}
          </section>
        ))}

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

function renderField(
  field: (typeof laboratoryRawMaterialQualityFields)[number],
  form: FormState,
  updateField: (field: keyof FormState, value: string) => void,
) {
  const commonProps = {
    required: true,
    value: form[field.id],
    onChange: (event: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
      const value = event.currentTarget.value;
      updateField(field.id, value);
    },
  };
  if (field.kind === "shift") {
    return (
      <label key={field.id}>
        <span>{field.label}</span>
        <select {...commonProps}>
          <option value="">Выберите смену</option>
          {laboratoryRawMaterialQualityShiftValues.map((value) => (
            <option key={value} value={value}>
              {laboratoryRawMaterialQualityShiftLabels[value]}
            </option>
          ))}
        </select>
      </label>
    );
  }
  if (field.kind === "disintegrator") {
    return (
      <label key={field.id}>
        <span>{field.label}</span>
        <select {...commonProps}>
          <option value="">Выберите номер</option>
          {laboratoryRawMaterialQualityDisintegratorValues.map((value) => (
            <option key={value} value={value}>{value}</option>
          ))}
        </select>
      </label>
    );
  }
  if (field.kind === "recommendation") {
    return (
      <label key={field.id}>
        <span>{field.label}</span>
        <select {...commonProps}>
          <option value="">Выберите адресата</option>
          {laboratoryRawMaterialQualityRecommendationRecipientValues.map((value) => (
            <option key={value} value={value}>
              {laboratoryRawMaterialQualityRecommendationRecipientLabels[value]}
            </option>
          ))}
        </select>
      </label>
    );
  }
  if (field.kind === "long_text") {
    return (
      <label className="laboratory-form-wide" key={field.id}>
        <span>{field.label}</span>
        <textarea {...commonProps} maxLength={2000} />
      </label>
    );
  }
  const listId = field.kind === "option" ? `${field.id}-options` : undefined;
  return (
    <label key={field.id}>
      <span>{field.label}</span>
      <input
        {...commonProps}
        list={listId}
        maxLength={field.kind === "date" ? undefined : 120}
        type={field.kind === "date" ? "date" : "text"}
      />
    </label>
  );
}

function renderDatalists(options: LaboratoryRawMaterialQualityOptions) {
  const lists = [
    ["laboratoryAssistant", options.laboratoryAssistants],
    ["shiftSupervisor", options.shiftSupervisors],
    ["clayBrand", options.clayBrands],
    ["temperBrand", options.temperBrands],
    ["slipMixerNumber", options.slipMixerNumbers],
    ["runnerNumber", options.runnerNumbers],
  ] as const;
  return lists.map(([field, values]) => (
    <datalist id={`${field}-options`} key={field}>
      {values.map((value) => <option key={value} value={value} />)}
    </datalist>
  ));
}

function createEmptyForm(): FormState {
  return Object.fromEntries(
    laboratoryRawMaterialQualityFields.map((field) => [field.id, ""]),
  ) as FormState;
}

function buildSubmission(
  form: FormState,
): LaboratoryRawMaterialQualitySubmission | undefined {
  const normalized = Object.fromEntries(
    laboratoryRawMaterialQualityFields.map((field) => [
      field.id,
      form[field.id].trim(),
    ]),
  ) as FormState;
  if (laboratoryRawMaterialQualityFields.some(
    (field) => normalized[field.id] === "",
  )) return undefined;
  if (!laboratoryRawMaterialQualityShiftValues.includes(
    normalized.shift as LaboratoryRawMaterialQualitySubmission["shift"],
  )) return undefined;
  if (!laboratoryRawMaterialQualityDisintegratorValues.includes(
    normalized.disintegratorNumber as LaboratoryRawMaterialQualitySubmission["disintegratorNumber"],
  )) return undefined;
  if (!laboratoryRawMaterialQualityRecommendationRecipientValues.includes(
    normalized.recommendationRecipient as LaboratoryRawMaterialQualitySubmission["recommendationRecipient"],
  )) return undefined;
  return normalized as LaboratoryRawMaterialQualitySubmission;
}

function addOption(values: string[], value: string) {
  return [value, ...values.filter((item) => item !== value)];
}
