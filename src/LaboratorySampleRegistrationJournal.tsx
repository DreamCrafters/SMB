import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import {
  buildLaboratorySampleCodeDraft,
  laboratorySampleRegistrationFields,
  laboratorySampleRegistrationSamplingLocations,
  type LaboratorySampleRegistrationCorrection,
  type LaboratorySampleRegistrationJournalRecord,
  type LaboratorySampleRegistrationJournalSubmission,
  type ServerUserProfile,
} from "./contracts";
import { LaboratorySampleRegistrationTable } from "./LaboratoryJournalTables";
import { LoadingIndicator } from "./LoadingIndicator";
import {
  correctLaboratorySampleRegistrationJournalRecord,
  requestLaboratorySampleRegistrationDraft,
  requestLaboratorySampleRegistrationLocations,
  requestLaboratorySampleRegistrationJournal,
  submitLaboratorySampleRegistrationJournalRecord,
} from "./services/laboratorySampleRegistrationJournal";
import { readShortUserMessage } from "./services/userFacingMessages";

type ShowToast = (title: string, body: string) => void;
type FormState = Record<
  keyof LaboratorySampleRegistrationJournalSubmission,
  string
>;
type HistoryState =
  | {
      status: "loading";
      records: LaboratorySampleRegistrationJournalRecord[];
    }
  | {
      status: "ready";
      records: LaboratorySampleRegistrationJournalRecord[];
    }
  | {
      status: "error";
      message: string;
      records: LaboratorySampleRegistrationJournalRecord[];
    };

const journalTitle = "Журнал регистрации отбора проб";

export function LaboratorySampleRegistrationJournal({
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
  const [history, setHistory] = useState<HistoryState>({
    status: "loading",
    records: [],
  });
  const [samplingLocationOptions, setSamplingLocationOptions] = useState<
    string[]
  >(() => [...laboratorySampleRegistrationSamplingLocations]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formMessage, setFormMessage] = useState("");
  const [editingRecordId, setEditingRecordId] = useState<string>();
  const [
    editingAllowsMissingWaterAbsorption,
    setEditingAllowsMissingWaterAbsorption,
  ] = useState(false);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const isLaboratorySampleCodeAuto = useRef(true);

  useEffect(() => {
    if (isAdminPreviewMode) return;
    const controller = new AbortController();
    requestLaboratorySampleRegistrationDraft({
      signal: controller.signal,
    }).then((result) => {
      if (controller.signal.aborted) return;
      if (result.status === "ready") {
        setForm((current) => {
          const usesSuggestedNumber = current.sampleNumber.trim() === "";
          const sampleNumber = usesSuggestedNumber
            ? result.sampleNumber
            : current.sampleNumber;
          return {
            ...current,
            sampleNumber,
            laboratorySampleCode:
              isLaboratorySampleCodeAuto.current &&
                current.laboratorySampleCode.trim() === ""
                ? usesSuggestedNumber
                  ? result.laboratorySampleCode
                  : buildLaboratorySampleCodeDraft(sampleNumber)
                : current.laboratorySampleCode,
          };
        });
        return;
      }
      setFormMessage((current) => current === ""
        ? readShortUserMessage(
            result.message,
            "Не удалось загрузить следующий номер пробы.",
          )
        : current);
    });
    return () => controller.abort();
  }, [isAdminPreviewMode, refreshVersion]);

  useEffect(() => {
    if (isAdminPreviewMode) return;
    const controller = new AbortController();
    requestLaboratorySampleRegistrationLocations({
      signal: controller.signal,
    }).then((result) => {
      if (controller.signal.aborted) return;
      if (result.status === "ready") {
        setSamplingLocationOptions((current) => mergeSamplingLocationOptions(
          current,
          result.samplingLocations,
        ));
        return;
      }
      setFormMessage((current) => current === ""
        ? readShortUserMessage(
            result.message,
            "Не удалось загрузить список мест отбора проб.",
          )
        : current);
    });
    return () => controller.abort();
  }, [isAdminPreviewMode]);

  useEffect(() => {
    const controller = new AbortController();
    setHistory((current) => ({
      status: "loading",
      records: current.records,
    }));
    requestLaboratorySampleRegistrationJournal(
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
              "Не удалось загрузить журнал регистрации отбора проб.",
            ),
            records: current.records,
          });
    });
    return () => controller.abort();
  }, [dateFrom, dateTo, query, refreshVersion]);

  function updateField(field: keyof FormState, value: string) {
    if (field === "laboratorySampleCode") {
      isLaboratorySampleCodeAuto.current = false;
    }
    setForm((current) => field === "sampleNumber"
      ? {
          ...current,
          sampleNumber: value,
          ...(isLaboratorySampleCodeAuto.current
            ? { laboratorySampleCode: buildLaboratorySampleCodeDraft(value) }
            : {}),
        }
      : { ...current, [field]: value });
    setFormMessage("");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isAdminPreviewMode) return;

    const saveRequest = editingRecordId === undefined
      ? { kind: "create" as const, submission: buildSubmission(form) }
      : {
          kind: "correct" as const,
          id: editingRecordId,
          submission: buildCorrection(
            form,
            editingAllowsMissingWaterAbsorption,
          ),
        };
    if (saveRequest.submission === undefined) {
      setFormMessage("Заполните все обязательные поля.");
      return;
    }

    setIsSubmitting(true);
    setFormMessage("Сохраняем запись…");
    const result = saveRequest.kind === "create"
      ? await submitLaboratorySampleRegistrationJournalRecord(
          saveRequest.submission,
        )
      : await correctLaboratorySampleRegistrationJournalRecord(
          saveRequest.id,
          saveRequest.submission,
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
    setSamplingLocationOptions((current) => mergeSamplingLocationOptions(
      current,
      [result.record.samplingLocation],
    ));
    setFormMessage("");
    setRefreshVersion((value) => value + 1);
    onShowToast(
      wasEditing ? "Проба исправлена" : "Запись сохранена",
      `${result.record.sampleNumber} · ${result.record.laboratorySampleCode}.`,
    );
  }

  function editRecord(record: LaboratorySampleRegistrationJournalRecord) {
    isLaboratorySampleCodeAuto.current = false;
    setEditingRecordId(record.id);
    setEditingAllowsMissingWaterAbsorption(
      record.waterAbsorption === undefined,
    );
    setForm({
      sampleNumber: record.sampleNumber,
      laboratorySampleCode: record.laboratorySampleCode,
      samplingDate: record.samplingDate,
      samplingLaboratoryAssistant: record.samplingLaboratoryAssistant,
      sampleName: record.sampleName,
      registrationDate: record.registrationDate,
      samplingLocation: record.samplingLocation,
      waterAbsorption: record.waterAbsorption ?? "",
    });
    setFormMessage("");
  }

  function resetForm() {
    isLaboratorySampleCodeAuto.current = true;
    setEditingRecordId(undefined);
    setEditingAllowsMissingWaterAbsorption(false);
    setForm(createEmptyForm(profile.displayName));
  }

  return (
    <div className="sample-registration-journal">
      <form
        className="laboratory-form sample-registration-journal-form"
        onSubmit={submit}
      >
        <div className="sample-registration-journal-heading">
          <span className="eyebrow">Лаборатория</span>
          <h2>{journalTitle}</h2>
          {editingRecordId === undefined
            ? null
            : <p>Редактирование пробы {form.laboratorySampleCode}</p>}
        </div>

        <section className="sample-registration-journal-section">
          <h3>Регистрация отбора</h3>
          <div className="laboratory-form-grid">
            {laboratorySampleRegistrationFields.map((field) => (
              <JournalInput
                field={field.id}
                key={field.id}
                label={field.label}
                options={field.id === "samplingLocation"
                  ? samplingLocationOptions
                  : undefined}
                placeholder={field.id === "samplingLocation"
                  ? "Выберите или введите новое место"
                  : undefined}
                inputMode={field.id === "waterAbsorption"
                  ? "decimal"
                  : undefined}
                required={field.id !== "waterAbsorption" ||
                  !editingAllowsMissingWaterAbsorption}
                type={field.kind === "date" ? "date" : "text"}
                value={form[field.id]}
                onChange={updateField}
              />
            ))}
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

      <section className="laboratory-history sample-registration-journal-history">
        <div className="laboratory-history-heading">
          <div>
            <span className="eyebrow">История</span>
            <h2>Зарегистрированные пробы</h2>
          </div>
          <div className="laboratory-filters sample-registration-journal-filters">
            <label>
              <span>Регистрация с</span>
              <input type="date" value={dateFrom} onChange={(event) => {
                const value = event.currentTarget.value;
                setDateFrom(value);
              }} />
            </label>
            <label>
              <span>Регистрация по</span>
              <input type="date" value={dateTo} onChange={(event) => {
                const value = event.currentTarget.value;
                setDateTo(value);
              }} />
            </label>
            <label>
              <span>Поиск</span>
              <input
                maxLength={120}
                placeholder="Номер, код, проба или партия"
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
        <LaboratorySampleRegistrationTable
          records={history.records}
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
  inputMode,
  options,
  placeholder,
  required = true,
  value,
  onChange,
}: {
  field: Field;
  label: string;
  type?: "date" | "text";
  inputMode?: "decimal";
  options?: readonly string[];
  placeholder?: string;
  required?: boolean;
  value: string;
  onChange: (field: Field, value: string) => void;
}) {
  const listId = `sample-registration-options-${useId().replaceAll(":", "")}`;

  return (
    <label>
      <span>{label}</span>
      <input
        required={required}
        inputMode={inputMode}
        maxLength={type === "text" ? 120 : undefined}
        list={options === undefined ? undefined : listId}
        placeholder={placeholder}
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

function mergeSamplingLocationOptions(
  current: readonly string[],
  additions: readonly string[],
) {
  const options = [...current];
  const keys = new Set(options.map(normalizeSamplingLocationKey));

  for (const addition of additions) {
    const normalized = addition.trim().replace(/\s+/gu, " ");
    const key = normalizeSamplingLocationKey(normalized);
    if (normalized === "" || keys.has(key)) continue;
    keys.add(key);
    options.push(normalized);
  }

  return options;
}

function normalizeSamplingLocationKey(value: string) {
  return value.trim().replace(/\s+/gu, " ").toLocaleLowerCase("ru-RU");
}

function createEmptyForm(laboratoryAssistant: string): FormState {
  const today = formatLocalCalendarDate(new Date());
  return {
    sampleNumber: "",
    laboratorySampleCode: "",
    samplingDate: today,
    samplingLaboratoryAssistant: laboratoryAssistant,
    sampleName: "",
    registrationDate: today,
    samplingLocation: "",
    waterAbsorption: "",
  };
}

function buildSubmission(
  form: FormState,
): LaboratorySampleRegistrationJournalSubmission | undefined {
  const record = buildFormRecord(form, true);
  if (record?.waterAbsorption === undefined) return undefined;

  return {
    ...record,
    waterAbsorption: record.waterAbsorption,
  };
}

function buildCorrection(
  form: FormState,
  allowsMissingWaterAbsorption: boolean,
): LaboratorySampleRegistrationCorrection | undefined {
  return buildFormRecord(form, !allowsMissingWaterAbsorption);
}

function buildFormRecord(
  form: FormState,
  requiresWaterAbsorption: boolean,
): LaboratorySampleRegistrationCorrection | undefined {
  if (
    laboratorySampleRegistrationFields.some(
      (field) =>
        (field.id !== "waterAbsorption" || requiresWaterAbsorption) &&
        form[field.id].trim() === "",
    )
  ) {
    return undefined;
  }

  const waterAbsorption = form.waterAbsorption.trim();

  return {
    sampleNumber: form.sampleNumber.trim(),
    laboratorySampleCode: form.laboratorySampleCode.trim(),
    samplingDate: form.samplingDate,
    samplingLaboratoryAssistant: form.samplingLaboratoryAssistant.trim(),
    sampleName: form.sampleName.trim(),
    registrationDate: form.registrationDate,
    samplingLocation: form.samplingLocation.trim(),
    ...(waterAbsorption === "" ? {} : { waterAbsorption }),
  };
}

function formatLocalCalendarDate(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(
    value.getDate(),
  ).padStart(2, "0")}`;
}
