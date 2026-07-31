import { useEffect, useState, type FormEvent } from "react";
import type {
  RotaryKiln2FiringJournalRecord,
  RotaryKiln2FiringJournalSubmission,
  ServerUserProfile,
} from "./contracts";
import {
  formatLaboratoryNumber,
  RotaryKiln2FiringTable,
  rotaryKiln2EarlyNumericFields,
  rotaryKiln2LateNumericFields,
  rotaryKiln2ProducedMaterialLabel,
} from "./LaboratoryJournalTables";
import { LoadingIndicator } from "./LoadingIndicator";
import { ProductBrandPicker } from "./ProductBrandPicker";
import {
  requestRotaryKiln2FiringJournal,
  submitRotaryKiln2FiringJournalRecord,
} from "./services/rotaryKiln2FiringJournal";
import { readShortUserMessage } from "./services/userFacingMessages";
import {
  normalizeProductBrandKey,
  useProductionBrands,
} from "./useProductionBrands";

type ShowToast = (title: string, body: string) => void;
type FormState = Record<keyof RotaryKiln2FiringJournalSubmission, string>;
type SelectionState =
  | { status: "loading"; records: RotaryKiln2FiringJournalRecord[]; average: number | null }
  | { status: "ready"; records: RotaryKiln2FiringJournalRecord[]; average: number | null }
  | {
      status: "error";
      message: string;
      records: RotaryKiln2FiringJournalRecord[];
      average: number | null;
    };

const journalTitle =
  "Журнал контроля параметров обжига вращающейся печи 2";

const allNumericFields = [
  ...rotaryKiln2EarlyNumericFields,
  ...rotaryKiln2LateNumericFields,
] as const;

export function LaboratoryRotaryKiln2FiringJournal({
  profile,
  isAdminPreviewMode,
  onShowToast,
}: {
  profile: ServerUserProfile;
  isAdminPreviewMode: boolean;
  onShowToast: ShowToast;
}) {
  const [form, setForm] = useState(() => createEmptyForm(profile.displayName));
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [query, setQuery] = useState("");
  const [selection, setSelection] = useState<SelectionState>({
    status: "loading",
    records: [],
    average: null,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formMessage, setFormMessage] = useState("");
  const [refreshVersion, setRefreshVersion] = useState(0);
  const { labels: productBrands, loadState: productBrandsLoadState } =
    useProductionBrands({ creationDisabled: true });

  useEffect(() => {
    const controller = new AbortController();
    setSelection((current) => ({
      status: "loading",
      records: current.records,
      average: current.average,
    }));
    requestRotaryKiln2FiringJournal(
      {
        ...(dateFrom === "" ? {} : { dateFrom }),
        ...(dateTo === "" ? {} : { dateTo }),
        ...(query.trim() === "" ? {} : { query: query.trim() }),
      },
      { signal: controller.signal },
    ).then((result) => {
      if (controller.signal.aborted) return;
      setSelection((current) => result.status === "ready"
        ? {
            status: "ready",
            records: result.records,
            average: result.averageBulkDensity,
          }
        : {
            status: "error",
            message: readShortUserMessage(
              result.message,
              "Не удалось загрузить журнал вращающейся печи 2.",
            ),
            records: current.records,
            average: current.average,
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
      setFormMessage("Заполните все обязательные поля корректными значениями.");
      return;
    }
    const materialKey = normalizeProductBrandKey(submission.producedMaterial);
    if (!productBrands.some((label) => normalizeProductBrandKey(label) === materialKey)) {
      setFormMessage(
        `Выберите ${rotaryKiln2ProducedMaterialLabel.toLowerCase()} из справочника номенклатуры.`,
      );
      return;
    }

    setIsSubmitting(true);
    setFormMessage("Сохраняем запись…");
    const result = await submitRotaryKiln2FiringJournalRecord(submission);
    setIsSubmitting(false);

    if (result.status === "error") {
      setFormMessage(readShortUserMessage(
        result.message,
        "Не удалось сохранить запись журнала.",
      ));
      return;
    }

    setForm(createEmptyForm(profile.displayName));
    setFormMessage("");
    setRefreshVersion((value) => value + 1);
    onShowToast(
      "Запись сохранена",
      `${formatDate(result.record.recordDate)} · ${result.record.recordTime}.`,
    );
  }

  return (
    <div className="rotary-kiln-journal">
      <form className="laboratory-form rotary-kiln-journal-form" onSubmit={submit}>
        <div className="rotary-kiln-journal-heading">
          <span className="eyebrow">Лаборатория</span>
          <h2>{journalTitle}</h2>
        </div>
        <div className="laboratory-form-grid">
          <JournalInput
            field="recordDate"
            label="Дата"
            type="date"
            value={form.recordDate}
            onChange={updateField}
          />
          <JournalInput
            field="recordTime"
            label="Время"
            type="time"
            value={form.recordTime}
            onChange={updateField}
          />
          <label>
            <span>{rotaryKiln2ProducedMaterialLabel}</span>
            <ProductBrandPicker
              ariaLabel={rotaryKiln2ProducedMaterialLabel}
              disabled={productBrandsLoadState.status !== "ready"}
              labels={productBrands}
              name="producedMaterial"
              value={form.producedMaterial}
              onChange={(value) => updateField("producedMaterial", value)}
            />
          </label>
          {rotaryKiln2EarlyNumericFields.map(([field, label]) => (
            <JournalInput
              field={field}
              key={field}
              label={label}
              type="number"
              value={form[field]}
              onChange={updateField}
            />
          ))}
          <JournalInput
            field="shiftSupervisor"
            label="Мастер смены"
            value={form.shiftSupervisor}
            onChange={updateField}
          />
          <JournalInput
            field="burnerOperator"
            label="Обжигальщик"
            value={form.burnerOperator}
            onChange={updateField}
          />
          <JournalInput
            field="laboratoryAssistant"
            label="Лаборант"
            value={form.laboratoryAssistant}
            onChange={updateField}
          />
          {rotaryKiln2LateNumericFields.map(([field, label]) => (
            <JournalInput
              field={field}
              key={field}
              label={label}
              type="number"
              value={form[field]}
              onChange={updateField}
            />
          ))}
          <label className="laboratory-field-wide">
            <span>Примечание (в т.ч. причины простоя, инциденты и пр.)</span>
            <textarea
              maxLength={2_000}
              value={form.note}
              onChange={(event) => {
                const value = event.currentTarget.value;
                updateField("note", value);
              }}
            />
          </label>
        </div>
        <div className="laboratory-form-actions">
          <button
            className="primary-button"
            disabled={isAdminPreviewMode || isSubmitting}
            type="submit"
          >
            {isSubmitting
              ? <LoadingIndicator label="Сохраняем…" variant="button" />
              : "Внести данные"}
          </button>
          {isAdminPreviewMode
            ? <small>В режиме просмотра сохранение отключено.</small>
            : null}
          {formMessage === ""
            ? null
            : <span className="form-message" role="status">{formMessage}</span>}
        </div>
      </form>

      <section className="laboratory-history rotary-kiln-journal-history">
        <div className="laboratory-history-heading">
          <div>
            <span className="eyebrow">История</span>
            <h2>Записи вращающейся печи 2</h2>
          </div>
          <p className="rotary-kiln-journal-average">
            Средний насыпной вес: {formatAverage(selection.average)}
          </p>
          <div className="laboratory-filters rotary-kiln-journal-filters">
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
            <label>
              <span>Поиск</span>
              <input
                maxLength={120}
                placeholder="Сотрудник или примечание"
                value={query}
                onChange={(event) => {
                  const value = event.currentTarget.value;
                  setQuery(value);
                }}
              />
            </label>
          </div>
        </div>
        {selection.status === "loading"
          ? <LoadingIndicator label="Загружаем записи…" variant="inline" />
          : selection.status === "error"
            ? <p className="form-message is-error" role="alert">{selection.message}</p>
            : null}
        <RotaryKiln2FiringTable records={selection.records} />
      </section>
    </div>
  );
}

function JournalInput<Field extends keyof FormState>({
  field,
  label,
  type = "text",
  value,
  onChange,
}: {
  field: Field;
  label: string;
  type?: "date" | "number" | "text" | "time";
  value: string;
  onChange: (field: Field, value: string) => void;
}) {
  return (
    <label>
      <span>{label}</span>
      <input
        required
        maxLength={type === "text" ? 120 : undefined}
        step={type === "number" ? "any" : undefined}
        type={type}
        value={value}
        onChange={(event) => {
          const nextValue = event.currentTarget.value;
          onChange(field, nextValue);
        }}
      />
    </label>
  );
}

function createEmptyForm(laboratoryAssistant: string): FormState {
  const now = new Date();
  return {
    recordDate: formatLocalCalendarDate(now),
    recordTime: `${String(now.getHours()).padStart(2, "0")}:${String(
      now.getMinutes(),
    ).padStart(2, "0")}`,
    producedMaterial: "",
    waterAbsorption: "",
    temperatureBeforeCyclone: "",
    temperatureBeforeFilter: "",
    temperatureInFieldChamber: "",
    temperatureAtRollback: "",
    gasConsumptionPerHour: "",
    vacuum: "",
    pressure: "",
    shiftSupervisor: "",
    burnerOperator: "",
    laboratoryAssistant,
    sievePass05: "",
    bulkDensity: "",
    kilnLoadBucketsPerHour: "",
    note: "",
  };
}

function buildSubmission(
  form: FormState,
): RotaryKiln2FiringJournalSubmission | undefined {
  const numericValues = Object.fromEntries(
    allNumericFields.map(([field]) => [field, Number(form[field])]),
  ) as Record<(typeof allNumericFields)[number][0], number>;
  const producedMaterial = form.producedMaterial.trim().replace(/\s+/gu, " ");
  const textFields = [
    form.shiftSupervisor.trim(),
    form.burnerOperator.trim(),
    form.laboratoryAssistant.trim(),
  ];

  if (
    form.recordDate === "" ||
    form.recordTime === "" ||
    producedMaterial === "" ||
    textFields.some((value) => value === "") ||
    allNumericFields.some(([field]) =>
      form[field].trim() === "" || !Number.isFinite(numericValues[field])
    )
  ) {
    return undefined;
  }

  return {
    recordDate: form.recordDate,
    recordTime: form.recordTime,
    producedMaterial,
    waterAbsorption: numericValues.waterAbsorption,
    temperatureBeforeCyclone: numericValues.temperatureBeforeCyclone,
    temperatureBeforeFilter: numericValues.temperatureBeforeFilter,
    temperatureInFieldChamber: numericValues.temperatureInFieldChamber,
    temperatureAtRollback: numericValues.temperatureAtRollback,
    gasConsumptionPerHour: numericValues.gasConsumptionPerHour,
    vacuum: numericValues.vacuum,
    pressure: numericValues.pressure,
    shiftSupervisor: textFields[0]!,
    burnerOperator: textFields[1]!,
    laboratoryAssistant: textFields[2]!,
    sievePass05: numericValues.sievePass05,
    bulkDensity: numericValues.bulkDensity,
    kilnLoadBucketsPerHour: numericValues.kilnLoadBucketsPerHour,
    ...(form.note.trim() === "" ? {} : { note: form.note.trim() }),
  };
}

function formatAverage(value: number | null) {
  return value === null ? "—" : formatLaboratoryNumber(value);
}

function formatDate(value: string) {
  const [year, month, day] = value.split("-");
  return year && month && day ? `${day}.${month}.${year}` : value;
}

function formatLocalCalendarDate(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(
    value.getDate(),
  ).padStart(2, "0")}`;
}
