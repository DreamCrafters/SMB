import { useEffect, useState, type FormEvent } from "react";
import {
  laboratorySampleRegistrationJournalFields,
  type LaboratorySampleRegistrationJournalRecord,
  type LaboratorySampleRegistrationJournalSubmission,
  type ServerUserProfile,
} from "./contracts";
import { LoadingIndicator } from "./LoadingIndicator";
import {
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

const registrationFields = laboratorySampleRegistrationJournalFields.filter(
  (field) => field.section === "registration",
);
const analysisFields = laboratorySampleRegistrationJournalFields.filter(
  (field) => field.section === "analysis",
);

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
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formMessage, setFormMessage] = useState("");
  const [refreshVersion, setRefreshVersion] = useState(0);

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
    setForm((current) => ({ ...current, [field]: value }));
    setFormMessage("");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isAdminPreviewMode) return;

    const submission = buildSubmission(form);
    if (submission === undefined) {
      setFormMessage("Заполните все обязательные поля.");
      return;
    }

    setIsSubmitting(true);
    setFormMessage("Сохраняем запись…");
    const result = await submitLaboratorySampleRegistrationJournalRecord(
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

    setForm(createEmptyForm(profile.displayName));
    setFormMessage("");
    setRefreshVersion((value) => value + 1);
    onShowToast(
      "Запись сохранена",
      `${result.record.sampleNumber} · ${result.record.laboratorySampleCode}.`,
    );
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
        </div>

        <section className="sample-registration-journal-section">
          <h3>Регистрация отбора</h3>
          <div className="laboratory-form-grid">
            {registrationFields.map((field) => (
              <JournalInput
                field={field.id}
                key={field.id}
                label={field.label}
                type={field.kind === "date" ? "date" : "text"}
                value={form[field.id]}
                onChange={updateField}
              />
            ))}
          </div>
        </section>

        <section className="sample-registration-journal-section">
          <h3>Химический анализ</h3>
          <div className="laboratory-form-grid">
            {analysisFields.map((field) => (
              <JournalInput
                field={field.id}
                inputMode={field.kind === "indicator" ? "decimal" : undefined}
                key={field.id}
                label={field.label}
                type={field.kind === "date" ? "date" : "text"}
                value={form[field.id]}
                onChange={updateField}
              />
            ))}
            <label className="laboratory-field-wide">
              <span>Примечания</span>
              <textarea
                maxLength={2_000}
                value={form.notes}
                onChange={(event) => {
                  const value = event.currentTarget.value;
                  updateField("notes", value);
                }}
              />
            </label>
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
        <JournalTable records={history.records} />
      </section>
    </div>
  );
}

function JournalInput<Field extends keyof FormState>({
  field,
  label,
  type = "text",
  inputMode,
  value,
  onChange,
}: {
  field: Field;
  label: string;
  type?: "date" | "text";
  inputMode?: "decimal";
  value: string;
  onChange: (field: Field, value: string) => void;
}) {
  return (
    <label>
      <span>{label}</span>
      <input
        required
        inputMode={inputMode}
        maxLength={type === "text" ? 120 : undefined}
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

function JournalTable({
  records,
}: {
  records: LaboratorySampleRegistrationJournalRecord[];
}) {
  if (records.length === 0) {
    return <p className="laboratory-empty-note">По выбранным фильтрам записей нет.</p>;
  }

  return (
    <div className="table-scroll laboratory-table-scroll">
      <table className="data-table laboratory-results-table sample-registration-journal-table">
        <thead>
          <tr>
            {laboratorySampleRegistrationJournalFields.map((field) => (
              <th key={field.id}>{field.label}</th>
            ))}
            <th>Примечания</th>
          </tr>
        </thead>
        <tbody>
          {records.map((record) => (
            <tr key={record.id}>
              {laboratorySampleRegistrationJournalFields.map((field) => (
                <td key={field.id}>
                  {field.kind === "date"
                    ? formatDate(record[field.id])
                    : record[field.id]}
                </td>
              ))}
              <td>{record.notes ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
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
    al2o3: "",
    fe2o3: "",
    sio2: "",
    cao2: "",
    p2o5: "",
    lossOnIgnition: "",
    moisture: "",
    chemicalAnalysisDate: today,
    chemicalAnalysisLaboratoryAssistant: laboratoryAssistant,
    batchNumber: "",
    notes: "",
  };
}

function buildSubmission(
  form: FormState,
): LaboratorySampleRegistrationJournalSubmission | undefined {
  if (
    laboratorySampleRegistrationJournalFields.some(
      (field) => form[field.id].trim() === "",
    )
  ) {
    return undefined;
  }

  return {
    sampleNumber: form.sampleNumber.trim(),
    laboratorySampleCode: form.laboratorySampleCode.trim(),
    samplingDate: form.samplingDate,
    samplingLaboratoryAssistant: form.samplingLaboratoryAssistant.trim(),
    sampleName: form.sampleName.trim(),
    registrationDate: form.registrationDate,
    samplingLocation: form.samplingLocation.trim(),
    al2o3: form.al2o3.trim(),
    fe2o3: form.fe2o3.trim(),
    sio2: form.sio2.trim(),
    cao2: form.cao2.trim(),
    p2o5: form.p2o5.trim(),
    lossOnIgnition: form.lossOnIgnition.trim(),
    moisture: form.moisture.trim(),
    chemicalAnalysisDate: form.chemicalAnalysisDate,
    chemicalAnalysisLaboratoryAssistant:
      form.chemicalAnalysisLaboratoryAssistant.trim(),
    batchNumber: form.batchNumber.trim(),
    ...(form.notes.trim() === "" ? {} : { notes: form.notes.trim() }),
  };
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
