import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  laboratoryChemicalAnalysisFields,
  type LaboratoryChemicalAnalysisJournalRecord,
  type LaboratoryChemicalAnalysisJournalSubmission,
  type LaboratorySampleRegistrationOption,
  type ServerUserProfile,
} from "./contracts";
import { LaboratoryChemicalAnalysisTable } from "./LaboratoryJournalTables";
import { LoadingIndicator } from "./LoadingIndicator";
import {
  correctLaboratoryChemicalAnalysisJournalRecord,
  requestLaboratoryChemicalAnalysisJournal,
  submitLaboratoryChemicalAnalysisJournalRecord,
} from "./services/laboratoryChemicalAnalysisJournal";
import { readShortUserMessage } from "./services/userFacingMessages";

type ShowToast = (title: string, body: string) => void;
type FormState = Record<
  keyof LaboratoryChemicalAnalysisJournalSubmission,
  string
>;
type HistoryState =
  | {
      status: "loading";
      records: LaboratoryChemicalAnalysisJournalRecord[];
      sampleOptions: LaboratorySampleRegistrationOption[];
    }
  | {
      status: "ready";
      records: LaboratoryChemicalAnalysisJournalRecord[];
      sampleOptions: LaboratorySampleRegistrationOption[];
    }
  | {
      status: "error";
      message: string;
      records: LaboratoryChemicalAnalysisJournalRecord[];
      sampleOptions: LaboratorySampleRegistrationOption[];
    };

export function LaboratoryChemicalAnalysisJournal({
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
  const [sampleQuery, setSampleQuery] = useState("");
  const [history, setHistory] = useState<HistoryState>({
    status: "loading",
    records: [],
    sampleOptions: [],
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formMessage, setFormMessage] = useState("");
  const [editingRecordId, setEditingRecordId] = useState<string>();
  const [editingRecordCode, setEditingRecordCode] = useState("");
  const [refreshVersion, setRefreshVersion] = useState(0);
  const selectedSampleRef =
    useRef<LaboratorySampleRegistrationOption | undefined>(undefined);

  useEffect(() => {
    const controller = new AbortController();
    setHistory((current) => ({
      status: "loading",
      records: current.records,
      sampleOptions: current.sampleOptions,
    }));
    requestLaboratoryChemicalAnalysisJournal(
      {
        ...(dateFrom === "" ? {} : { dateFrom }),
        ...(dateTo === "" ? {} : { dateTo }),
        ...(query.trim() === "" ? {} : { query: query.trim() }),
        ...(sampleQuery.trim() === ""
          ? {}
          : { sampleQuery: sampleQuery.trim() }),
      },
      { signal: controller.signal },
    ).then((result) => {
      if (controller.signal.aborted) return;
      setHistory((current) => result.status === "ready"
        ? {
            status: "ready",
            records: result.records,
            sampleOptions: keepSelectedSample(
              result.sampleOptions,
              selectedSampleRef.current,
            ),
          }
        : {
            status: "error",
            message: readShortUserMessage(
              result.message,
              "Не удалось загрузить журнал химических анализов.",
            ),
            records: current.records,
            sampleOptions: current.sampleOptions,
          });
    });
    return () => controller.abort();
  }, [dateFrom, dateTo, query, refreshVersion, sampleQuery]);

  function updateField(field: keyof FormState, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
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
          submission: buildSubmission(form),
        };
    if (saveRequest.submission === undefined) {
      setFormMessage("Выберите пробу и заполните все обязательные поля.");
      return;
    }

    setIsSubmitting(true);
    setFormMessage("Сохраняем запись…");
    const result = saveRequest.kind === "create"
      ? await submitLaboratoryChemicalAnalysisJournalRecord(
          saveRequest.submission,
        )
      : await correctLaboratoryChemicalAnalysisJournalRecord(
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
    setFormMessage("");
    setRefreshVersion((value) => value + 1);
    onShowToast(
      wasEditing ? "Химический анализ исправлен" : "Химический анализ сохранён",
      `${result.record.laboratorySampleCode} · ${result.record.batchNumber}.`,
    );
  }

  function editRecord(record: LaboratoryChemicalAnalysisJournalRecord) {
    selectedSampleRef.current = history.sampleOptions.find(
      (sample) => sample.id === record.sampleRegistrationId,
    );
    setEditingRecordId(record.id);
    setEditingRecordCode(record.laboratorySampleCode);
    setSampleQuery(record.laboratorySampleCode);
    setForm({
      sampleRegistrationId: record.sampleRegistrationId,
      chemicalAnalysisDate: record.chemicalAnalysisDate ?? "",
      chemicalAnalysisLaboratoryAssistant:
        record.chemicalAnalysisLaboratoryAssistant ?? "",
      batchNumber: record.batchNumber,
      al2o3: record.al2o3 ?? "",
      fe2o3: record.fe2o3 ?? "",
      sio2: record.sio2 ?? "",
      cao2: record.cao2 ?? "",
      p2o5: record.p2o5 ?? "",
      lossOnIgnition: record.lossOnIgnition ?? "",
      moisture: record.moisture ?? "",
      notes: record.notes ?? "",
    });
    setFormMessage("");
  }

  function resetForm() {
    setEditingRecordId(undefined);
    setEditingRecordCode("");
    selectedSampleRef.current = undefined;
    setForm(createEmptyForm(profile.displayName));
  }

  return (
    <div className="chemical-analysis-journal">
      <form
        className="laboratory-form chemical-analysis-journal-form"
        onSubmit={submit}
      >
        <div className="chemical-analysis-journal-heading">
          <span className="eyebrow">Лаборатория</span>
          <h2>Журнал химических анализов</h2>
          {editingRecordId === undefined
            ? null
            : <p>Редактирование анализа {editingRecordCode}</p>}
        </div>

        <div className="laboratory-form-grid">
          <label className="laboratory-field-wide">
            <span>Поиск зарегистрированной пробы</span>
            <input
              maxLength={120}
              placeholder="Код, номер, наименование, лаборант или место"
              value={sampleQuery}
              onChange={(event) => {
                const value = event.currentTarget.value;
                setSampleQuery(value);
              }}
            />
          </label>
          <label className="laboratory-field-wide">
            <span>Код лабораторной пробы</span>
            <select
              required
              value={form.sampleRegistrationId}
              onChange={(event) => {
                const value = event.currentTarget.value;
                selectedSampleRef.current = history.sampleOptions.find(
                  (sample) => sample.id === value,
                );
                updateField("sampleRegistrationId", value);
              }}
            >
              <option value="">Выберите зарегистрированную пробу</option>
              {history.sampleOptions.map((sample) => (
                <option key={sample.id} value={sample.id}>
                  {formatSampleOption(sample)}
                </option>
              ))}
            </select>
          </label>
          {laboratoryChemicalAnalysisFields.map((field) => (
            field.kind === "notes" ? (
              <label className="laboratory-field-wide" key={field.id}>
                <span>{field.label}</span>
                <textarea
                  maxLength={2_000}
                  value={form[field.id]}
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    updateField(field.id, value);
                  }}
                />
              </label>
            ) : (
              <label key={field.id}>
                <span>{field.label}</span>
                <input
                  required={field.required}
                  inputMode={field.kind === "indicator" ? "decimal" : undefined}
                  maxLength={field.kind === "date" ? undefined : 120}
                  type={field.kind === "date" ? "date" : "text"}
                  value={form[field.id]}
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    updateField(field.id, value);
                  }}
                />
              </label>
            )
          ))}
        </div>

        {history.status !== "loading" && history.sampleOptions.length === 0
          ? (
              <p className="form-message">
                Сначала добавьте пробу в журнал регистрации отбора проб.
              </p>
            )
          : null}
        <div className="laboratory-form-actions">
          <button
            className="primary-button"
            disabled={
              isAdminPreviewMode ||
              isSubmitting ||
              history.sampleOptions.length === 0
            }
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

      <section className="laboratory-history chemical-analysis-journal-history">
        <div className="laboratory-history-heading">
          <div>
            <span className="eyebrow">История</span>
            <h2>Выполненные химические анализы</h2>
          </div>
          <div className="laboratory-filters chemical-analysis-journal-filters">
            <label>
              <span>Анализ с</span>
              <input type="date" value={dateFrom} onChange={(event) => {
                const value = event.currentTarget.value;
                setDateFrom(value);
              }} />
            </label>
            <label>
              <span>Анализ по</span>
              <input type="date" value={dateTo} onChange={(event) => {
                const value = event.currentTarget.value;
                setDateTo(value);
              }} />
            </label>
            <label>
              <span>Поиск</span>
              <input
                maxLength={120}
                placeholder="Код, проба, партия или лаборант"
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
        <LaboratoryChemicalAnalysisTable
          records={history.records}
          onEditRecord={isAdminPreviewMode ? undefined : editRecord}
        />
      </section>
    </div>
  );
}

function createEmptyForm(laboratoryAssistant: string): FormState {
  return {
    sampleRegistrationId: "",
    chemicalAnalysisDate: formatLocalCalendarDate(new Date()),
    chemicalAnalysisLaboratoryAssistant: laboratoryAssistant,
    batchNumber: "",
    al2o3: "",
    fe2o3: "",
    sio2: "",
    cao2: "",
    p2o5: "",
    lossOnIgnition: "",
    moisture: "",
    notes: "",
  };
}

function buildSubmission(
  form: FormState,
): LaboratoryChemicalAnalysisJournalSubmission | undefined {
  if (
    form.sampleRegistrationId === "" ||
    laboratoryChemicalAnalysisFields.some(
      (field) => field.required && form[field.id].trim() === "",
    )
  ) {
    return undefined;
  }

  return {
    sampleRegistrationId: form.sampleRegistrationId,
    batchNumber: form.batchNumber.trim(),
    ...(form.chemicalAnalysisDate === ""
      ? {}
      : { chemicalAnalysisDate: form.chemicalAnalysisDate }),
    ...(form.chemicalAnalysisLaboratoryAssistant.trim() === ""
      ? {}
      : {
          chemicalAnalysisLaboratoryAssistant:
            form.chemicalAnalysisLaboratoryAssistant.trim(),
        }),
    ...(form.al2o3.trim() === "" ? {} : { al2o3: form.al2o3.trim() }),
    ...(form.fe2o3.trim() === "" ? {} : { fe2o3: form.fe2o3.trim() }),
    ...(form.sio2.trim() === "" ? {} : { sio2: form.sio2.trim() }),
    ...(form.cao2.trim() === "" ? {} : { cao2: form.cao2.trim() }),
    ...(form.p2o5.trim() === "" ? {} : { p2o5: form.p2o5.trim() }),
    ...(form.lossOnIgnition.trim() === ""
      ? {}
      : { lossOnIgnition: form.lossOnIgnition.trim() }),
    ...(form.moisture.trim() === ""
      ? {}
      : { moisture: form.moisture.trim() }),
    ...(form.notes.trim() === "" ? {} : { notes: form.notes.trim() }),
  };
}

function formatSampleOption(sample: LaboratorySampleRegistrationOption) {
  return `${sample.laboratorySampleCode} · № ${sample.sampleNumber} · ${sample.sampleName} · отбор ${formatDate(sample.samplingDate)} · регистрация ${formatDate(sample.registrationDate)}`;
}

function keepSelectedSample(
  options: LaboratorySampleRegistrationOption[],
  selected: LaboratorySampleRegistrationOption | undefined,
) {
  return selected === undefined || options.some((option) => option.id === selected.id)
    ? options
    : [...options, selected];
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
