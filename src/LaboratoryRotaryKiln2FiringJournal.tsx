import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import type {
  RotaryKiln2FiringJournalPersonnelOptions,
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
import {
  ProductBrandPicker,
  ProductionBrandSourceNote,
} from "./ProductBrandPicker";
import {
  correctRotaryKiln2FiringJournalRecord,
  requestRotaryKiln2FiringJournal,
  requestRotaryKiln2FiringJournalDraft,
  requestRotaryKiln2PersonnelOptions,
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

type PreviousRecordAutofillDescriptor = readonly [
  field: keyof FormState,
  readValue: (record: RotaryKiln2FiringJournalRecord) => string,
];

const previousRecordAutofillDescriptors = [
  ["recordDate", (record) => record.recordDate],
  ["recordTime", (record) => addOneHour(record.recordTime)],
  ["shiftSupervisor", (record) => record.shiftSupervisor],
  ["burnerOperator", (record) => record.burnerOperator],
  ["laboratoryAssistant", (record) => record.laboratoryAssistant],
  ["sievePass05", (record) => formatOptionalNumber(record.sievePass05)],
  ["bulkDensity", (record) => String(record.bulkDensity)],
  ["kilnLoadBucketsPerHour", (record) =>
    formatOptionalNumber(record.kilnLoadBucketsPerHour)],
] satisfies readonly PreviousRecordAutofillDescriptor[];

const previousRecordAutofillFields = new Set<keyof FormState>(
  previousRecordAutofillDescriptors.map(([field]) => field),
);

const journalTitle =
  "Журнал контроля параметров обжига вращающейся печи 2";

const allNumericFields = [
  ...rotaryKiln2EarlyNumericFields,
  ...rotaryKiln2LateNumericFields,
] as const;
const optionalNumericFields = new Set<keyof FormState>([
  "temperatureInFieldChamber",
  "sievePass05",
  "kilnLoadBucketsPerHour",
]);

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
  const hasEditedProducedMaterialRef = useRef(false);
  const hasSavedRecordRef = useRef(false);
  const isEditingRecordRef = useRef(false);
  const previousProducedMaterialRef = useRef("");
  const previousRecordRef =
    useRef<RotaryKiln2FiringJournalRecord | undefined>(undefined);
  const draftRequestVersionRef = useRef(0);
  const editedPreviousRecordFieldsRef = useRef(new Set<keyof FormState>());
  const [editingRecordId, setEditingRecordId] = useState<string>();
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
  const [personnelOptions, setPersonnelOptions] = useState<
    RotaryKiln2FiringJournalPersonnelOptions
  >({ shiftSupervisors: [], burnerOperators: [] });
  const [refreshVersion, setRefreshVersion] = useState(0);
  const { labels: productBrands, loadState: productBrandsLoadState } =
    useProductionBrands();

  useEffect(() => {
    if (isAdminPreviewMode) return;

    const controller = new AbortController();
    requestRotaryKiln2PersonnelOptions({ signal: controller.signal }).then(
      (result) => {
        if (controller.signal.aborted) return;
        if (result.status === "ready") {
          setPersonnelOptions({
            shiftSupervisors: result.shiftSupervisors,
            burnerOperators: result.burnerOperators,
          });
          return;
        }
        setFormMessage((current) => current === ""
          ? readShortUserMessage(
              result.message,
              "Не удалось загрузить список сотрудников.",
            )
          : current);
      },
    );
    return () => controller.abort();
  }, [isAdminPreviewMode]);

  useEffect(() => {
    if (isAdminPreviewMode) return;

    const controller = new AbortController();
    const requestVersion = draftRequestVersionRef.current;
    requestRotaryKiln2FiringJournalDraft({ signal: controller.signal }).then(
      (result) => {
        if (
          controller.signal.aborted ||
          requestVersion !== draftRequestVersionRef.current
        ) return;
        if (result.status === "ready") {
          previousRecordRef.current = result.previousRecord ?? undefined;
          if (
            !hasSavedRecordRef.current &&
            !isEditingRecordRef.current &&
            result.previousRecord !== null
          ) {
            applyPreviousRecordAutofill(result.previousRecord);
          }
          return;
        }
        setFormMessage((current) => current === ""
          ? readShortUserMessage(
              result.message,
              "Не удалось загрузить предыдущую запись журнала.",
            )
          : current);
      },
    );
    return () => controller.abort();
  }, [isAdminPreviewMode, refreshVersion]);

  useEffect(() => {
    const controller = new AbortController();
    const trimmedQuery = query.trim();
    const filters = {
      ...(dateFrom === "" ? {} : { dateFrom }),
      ...(dateTo === "" ? {} : { dateTo }),
      ...(trimmedQuery === "" ? {} : { query: trimmedQuery }),
    };
    // Предыдущий материал берём только из полной выборки: отфильтрованная
    // история показывает срез журнала, а не последнюю внесённую запись.
    const isUnfilteredSelection = Object.keys(filters).length === 0;
    setSelection((current) => ({
      status: "loading",
      records: current.records,
      average: current.average,
    }));
    requestRotaryKiln2FiringJournal(filters, { signal: controller.signal }).then((result) => {
      if (controller.signal.aborted) return;
      if (result.status === "ready" && isUnfilteredSelection) {
        applyPreviousProducedMaterial(result.records);
      }
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

  function applyPreviousProducedMaterial(
    records: readonly RotaryKiln2FiringJournalRecord[],
  ) {
    const previousMaterial = readPreviousProducedMaterial(records);
    if (previousMaterial === "") return;
    previousProducedMaterialRef.current = previousMaterial;
    if (hasEditedProducedMaterialRef.current) return;
    setForm((current) => ({ ...current, producedMaterial: previousMaterial }));
  }

  function applyPreviousRecordAutofill(
    previousRecord: RotaryKiln2FiringJournalRecord,
  ) {
    const previousValues = readPreviousRecordAutofillValues(previousRecord);
    setForm((current) => Object.fromEntries(
      Object.entries(current).map(([field, value]) => [
        field,
        editedPreviousRecordFieldsRef.current.has(field as keyof FormState)
          ? value
          : previousValues[field as keyof FormState] ?? value,
      ]),
    ) as FormState);
  }

  function updateField(field: keyof FormState, value: string) {
    if (previousRecordAutofillFields.has(field)) {
      editedPreviousRecordFieldsRef.current.add(field);
    }
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
    const saveRequest = editingRecordId === undefined
      ? { kind: "create" as const }
      : { kind: "correct" as const, id: editingRecordId };
    const result = saveRequest.kind === "create"
      ? await submitRotaryKiln2FiringJournalRecord(submission)
      : await correctRotaryKiln2FiringJournalRecord(
          saveRequest.id,
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

    const wasEditing = saveRequest.kind === "correct";
    draftRequestVersionRef.current += 1;
    if (!wasEditing) {
      hasSavedRecordRef.current = true;
      previousRecordRef.current = result.record;
      previousProducedMaterialRef.current = result.record.producedMaterial ?? "";
    } else if (previousRecordRef.current?.id === result.record.id) {
      previousRecordRef.current = result.record;
      previousProducedMaterialRef.current = result.record.producedMaterial ?? "";
    }
    setPersonnelOptions((current) => ({
      shiftSupervisors: mergePersonnelOptions(
        current.shiftSupervisors,
        result.record.shiftSupervisor,
      ),
      burnerOperators: mergePersonnelOptions(
        current.burnerOperators,
        result.record.burnerOperator,
      ),
    }));
    resetForm();
    setFormMessage("");
    setRefreshVersion((value) => value + 1);
    onShowToast(
      wasEditing ? "Запись исправлена" : "Запись сохранена",
      `${formatDate(result.record.recordDate)} · ${result.record.recordTime}.`,
    );
  }

  function editRecord(record: RotaryKiln2FiringJournalRecord) {
    isEditingRecordRef.current = true;
    hasEditedProducedMaterialRef.current = true;
    setEditingRecordId(record.id);
    setForm({
      recordDate: record.recordDate,
      recordTime: record.recordTime,
      producedMaterial: record.producedMaterial ?? "",
      waterAbsorption: String(record.waterAbsorption),
      temperatureBeforeCyclone: String(record.temperatureBeforeCyclone),
      temperatureBeforeFilter: String(record.temperatureBeforeFilter),
      temperatureInFieldChamber:
        formatOptionalNumber(record.temperatureInFieldChamber),
      temperatureAtRollback: String(record.temperatureAtRollback),
      gasConsumptionPerHour: String(record.gasConsumptionPerHour),
      vacuum: String(record.vacuum),
      pressure: String(record.pressure),
      shiftSupervisor: record.shiftSupervisor,
      burnerOperator: record.burnerOperator,
      laboratoryAssistant: record.laboratoryAssistant,
      sievePass05: formatOptionalNumber(record.sievePass05),
      bulkDensity: String(record.bulkDensity),
      kilnLoadBucketsPerHour:
        formatOptionalNumber(record.kilnLoadBucketsPerHour),
      note: record.note ?? "",
    });
    setFormMessage("");
  }

  function resetForm() {
    isEditingRecordRef.current = false;
    hasEditedProducedMaterialRef.current = false;
    editedPreviousRecordFieldsRef.current.clear();
    setEditingRecordId(undefined);
    const previousRecord = previousRecordRef.current;
    setForm({
      ...createEmptyForm(
        profile.displayName,
        previousProducedMaterialRef.current,
      ),
      ...(previousRecord === undefined
        ? {}
        : readPreviousRecordAutofillValues(previousRecord)),
    });
  }

  return (
    <div className="rotary-kiln-journal">
      <form className="laboratory-form rotary-kiln-journal-form" onSubmit={submit}>
        <div className="rotary-kiln-journal-heading">
          <span className="eyebrow">Лаборатория</span>
          <h2>{journalTitle}</h2>
          {editingRecordId === undefined
            ? null
            : <p>Редактирование записи {form.producedMaterial || "без материала"}</p>}
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
              onChange={(value) => {
                hasEditedProducedMaterialRef.current = true;
                updateField("producedMaterial", value);
              }}
            />
          </label>
          <ProductionBrandSourceNote className="laboratory-form-wide" />
          {rotaryKiln2EarlyNumericFields.map(([field, label]) => (
            <JournalInput
              field={field}
              key={field}
              label={label}
              required={!optionalNumericFields.has(field)}
              type="number"
              value={form[field]}
              onChange={updateField}
            />
          ))}
          <JournalInput
            field="shiftSupervisor"
            label="Мастер смены"
            options={personnelOptions.shiftSupervisors}
            value={form.shiftSupervisor}
            onChange={updateField}
          />
          <JournalInput
            field="burnerOperator"
            label="Обжигальщик"
            options={personnelOptions.burnerOperators}
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
              required={!optionalNumericFields.has(field)}
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
        <RotaryKiln2FiringTable
          records={selection.records}
          onEditRecord={isAdminPreviewMode ? undefined : editRecord}
        />
      </section>
    </div>
  );
}

function JournalInput<Field extends keyof FormState>({
  field,
  label,
  type = "text",
  options,
  required = true,
  value,
  onChange,
}: {
  field: Field;
  label: string;
  type?: "date" | "number" | "text" | "time";
  options?: readonly string[];
  required?: boolean;
  value: string;
  onChange: (field: Field, value: string) => void;
}) {
  const listId = `rotary-kiln-2-options-${useId().replaceAll(":", "")}`;

  return (
    <label>
      <span>{label}</span>
      <input
        required={required}
        maxLength={type === "text" ? 120 : undefined}
        list={options === undefined ? undefined : listId}
        step={type === "number" ? "any" : undefined}
        type={type}
        value={value}
        onChange={(event) => {
          const nextValue = event.currentTarget.value;
          onChange(field, nextValue);
        }}
      />
      {options === undefined
        ? null
        : (
          <datalist id={listId}>
            {options.map((option) => <option key={option} value={option} />)}
          </datalist>
        )}
    </label>
  );
}

function mergePersonnelOptions(current: readonly string[], addition: string) {
  const normalizedAddition = normalizePersonnelOption(addition);
  const additionKey = normalizedAddition.toLocaleLowerCase("ru-RU");
  const remaining = current.filter((option) =>
    normalizePersonnelOption(option).toLocaleLowerCase("ru-RU") !== additionKey
  );
  return [normalizedAddition, ...remaining];
}

function normalizePersonnelOption(value: string) {
  return value.trim().replace(/\s+/gu, " ");
}

function formatOptionalNumber(value: number | undefined) {
  return value === undefined ? "" : String(value);
}

/**
 * Пока журнал пуст, материал остаётся пустым. Как только появилась хотя бы одна
 * запись, форма подставляет её материал; выбор из справочника это заменяет.
 */
function readPreviousProducedMaterial(
  records: readonly RotaryKiln2FiringJournalRecord[],
) {
  return records.find((record) => (record.producedMaterial ?? "") !== "")
    ?.producedMaterial ?? "";
}

function readPreviousRecordAutofillValues(
  record: RotaryKiln2FiringJournalRecord,
): Partial<FormState> {
  return Object.fromEntries(
    previousRecordAutofillDescriptors.map(([field, readValue]) => [
      field,
      readValue(record),
    ]),
  );
}

function addOneHour(value: string) {
  const match = /^(?:([01]\d|2[0-3])):([0-5]\d)$/u.exec(value);
  if (match === null) return value;

  const [, hours, minutes] = match;
  const parsedHours = Number(hours);

  return `${String((parsedHours + 1) % 24).padStart(2, "0")}:${minutes}`;
}

function createEmptyForm(
  laboratoryAssistant: string,
  producedMaterial = "",
): FormState {
  const now = new Date();
  return {
    recordDate: formatLocalCalendarDate(now),
    recordTime: `${String(now.getHours()).padStart(2, "0")}:${String(
      now.getMinutes(),
    ).padStart(2, "0")}`,
    producedMaterial,
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
    allNumericFields.map(([field]) => [
      field,
      form[field].trim() === "" ? undefined : Number(form[field]),
    ]),
  ) as Record<(typeof allNumericFields)[number][0], number | undefined>;
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
    allNumericFields.some(([field]) => {
      const value = numericValues[field];
      return optionalNumericFields.has(field)
        ? value !== undefined && !Number.isFinite(value)
        : value === undefined || !Number.isFinite(value);
    })
  ) {
    return undefined;
  }

  return {
    recordDate: form.recordDate,
    recordTime: form.recordTime,
    producedMaterial,
    waterAbsorption: numericValues.waterAbsorption!,
    temperatureBeforeCyclone: numericValues.temperatureBeforeCyclone!,
    temperatureBeforeFilter: numericValues.temperatureBeforeFilter!,
    ...(numericValues.temperatureInFieldChamber === undefined
      ? {}
      : {
          temperatureInFieldChamber:
            numericValues.temperatureInFieldChamber,
        }),
    temperatureAtRollback: numericValues.temperatureAtRollback!,
    gasConsumptionPerHour: numericValues.gasConsumptionPerHour!,
    vacuum: numericValues.vacuum!,
    pressure: numericValues.pressure!,
    shiftSupervisor: textFields[0]!,
    burnerOperator: textFields[1]!,
    laboratoryAssistant: textFields[2]!,
    ...(numericValues.sievePass05 === undefined
      ? {}
      : { sievePass05: numericValues.sievePass05 }),
    bulkDensity: numericValues.bulkDensity!,
    ...(numericValues.kilnLoadBucketsPerHour === undefined
      ? {}
      : { kilnLoadBucketsPerHour: numericValues.kilnLoadBucketsPerHour }),
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
