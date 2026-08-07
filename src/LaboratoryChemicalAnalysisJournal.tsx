import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import {
  laboratoryChemicalAnalysisFields,
  laboratoryChemicalAnalysisTotalRuleMessage,
  type LaboratoryChemicalAnalysisJournalRecord,
  type LaboratoryChemicalAnalysisSampleOption,
  type LaboratoryChemicalAnalysisJournalSubmission,
  type LaboratoryChemicalAnalysisValues,
  type ServerUserProfile,
} from "./contracts";
import { LaboratoryChemicalAnalysisTable } from "./LaboratoryJournalTables";
import { LoadingIndicator } from "./LoadingIndicator";
import { mergeLaboratoryJournalOptions } from "./laboratoryJournalOptions";
import {
  correctLaboratoryChemicalAnalysisJournalRecord,
  requestLaboratoryChemicalAnalysisDraft,
  requestLaboratoryChemicalAnalysisJournal,
  requestLaboratoryChemicalAnalysisProtocolPdf,
  submitLaboratoryChemicalAnalysisJournalRecord,
} from "./services/laboratoryChemicalAnalysisJournal";
import { readShortUserMessage } from "./services/userFacingMessages";

type ShowToast = (title: string, body: string) => void;
type FormState = Record<keyof LaboratoryChemicalAnalysisValues, string> & {
  sampleKey: string;
};
type HistoryState =
  | {
      status: "loading";
      records: LaboratoryChemicalAnalysisJournalRecord[];
      sampleOptions: LaboratoryChemicalAnalysisSampleOption[];
    }
  | {
      status: "ready";
      records: LaboratoryChemicalAnalysisJournalRecord[];
      sampleOptions: LaboratoryChemicalAnalysisSampleOption[];
    }
  | {
      status: "error";
      message: string;
      records: LaboratoryChemicalAnalysisJournalRecord[];
      sampleOptions: LaboratoryChemicalAnalysisSampleOption[];
    };

const laboratoryAssistantBySessionProfile =
  new WeakMap<ServerUserProfile, string>();

export function LaboratoryChemicalAnalysisJournal({
  profile,
  isAdminPreviewMode,
  onShowToast,
}: {
  profile: ServerUserProfile;
  isAdminPreviewMode: boolean;
  onShowToast: ShowToast;
}) {
  const initialLaboratoryAssistant =
    laboratoryAssistantBySessionProfile.get(profile) ?? profile.displayName;
  const [form, setForm] = useState(() =>
    createEmptyForm(initialLaboratoryAssistant)
  );
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [query, setQuery] = useState("");
  const [sampleQuery, setSampleQuery] = useState("");
  const [isSampleOptionsOpen, setIsSampleOptionsOpen] = useState(false);
  const [activeSampleOptionIndex, setActiveSampleOptionIndex] = useState(-1);
  const [history, setHistory] = useState<HistoryState>({
    status: "loading",
    records: [],
    sampleOptions: [],
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isOpeningProtocol, setIsOpeningProtocol] = useState(false);
  const [formMessage, setFormMessage] = useState("");
  const [editingRecordId, setEditingRecordId] = useState<string>();
  const [editingRecordCode, setEditingRecordCode] = useState("");
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [laboratoryAssistantOptions, setLaboratoryAssistantOptions] = useState<
    string[]
  >([]);
  const selectedSampleRef =
    useRef<LaboratoryChemicalAnalysisSampleOption | undefined>(undefined);
  const sampleInputRef = useRef<HTMLInputElement>(null);
  const nextLaboratoryAnalysisNumberRef = useRef("");
  const isLaboratoryAnalysisNumberAuto = useRef(true);
  const sessionLaboratoryAssistant = useRef(initialLaboratoryAssistant);
  const laboratoryAssistantListId =
    `chemical-analysis-laboratory-assistants-${useId().replaceAll(":", "")}`;
  const sampleOptionsListId =
    `chemical-analysis-sample-options-${useId().replaceAll(":", "")}`;

  useEffect(() => {
    if (isAdminPreviewMode) return;
    const controller = new AbortController();
    requestLaboratoryChemicalAnalysisDraft({
      signal: controller.signal,
    }).then((result) => {
      if (controller.signal.aborted) return;
      if (result.status === "ready") {
        setLaboratoryAssistantOptions((current) => mergeLaboratoryJournalOptions(
          current,
          result.laboratoryAssistants,
        ));
        nextLaboratoryAnalysisNumberRef.current =
          result.laboratoryAnalysisNumber;
        if (isLaboratoryAnalysisNumberAuto.current) {
          setForm((current) => ({
            ...current,
            laboratoryAnalysisNumber: result.laboratoryAnalysisNumber,
          }));
        }
        return;
      }
      setFormMessage((current) => current === ""
        ? readShortUserMessage(
            result.message,
            "Не удалось загрузить следующий номер лабораторного анализа.",
          )
        : current);
    });
    return () => controller.abort();
  }, [isAdminPreviewMode, refreshVersion]);

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
    if (field === "laboratoryAnalysisNumber") {
      isLaboratoryAnalysisNumberAuto.current = false;
    }
    setForm((current) => ({ ...current, [field]: value }));
    setFormMessage("");
  }

  function updateSampleQuery(value: string) {
    setSampleQuery(value);
    setIsSampleOptionsOpen(value.trim() !== "");
    setActiveSampleOptionIndex(-1);
    selectedSampleRef.current = undefined;
    updateField("sampleKey", "");
  }

  function selectSample(sample: LaboratoryChemicalAnalysisSampleOption) {
    selectedSampleRef.current = sample;
    setSampleQuery(sample.laboratorySampleCode);
    setIsSampleOptionsOpen(false);
    setActiveSampleOptionIndex(-1);
    updateField("sampleKey", buildSampleKey(sample));
    sampleInputRef.current?.focus();
  }

  function closeSampleOptions() {
    setIsSampleOptionsOpen(false);
    setActiveSampleOptionIndex(-1);
  }

  function handleSampleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    const sampleOptions = history.status === "ready"
      ? history.sampleOptions
      : [];

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setIsSampleOptionsOpen(true);
      if (sampleOptions.length === 0) {
        setActiveSampleOptionIndex(-1);
        return;
      }
      setActiveSampleOptionIndex((current) => event.key === "ArrowDown"
        ? (current + 1) % sampleOptions.length
        : current <= 0
          ? sampleOptions.length - 1
          : current - 1);
      return;
    }

    if (event.key === "Enter" && isSampleOptionsOpen) {
      const activeSample = sampleOptions[activeSampleOptionIndex];
      if (activeSample !== undefined) {
        event.preventDefault();
        selectSample(activeSample);
      }
      return;
    }

    if (event.key === "Escape" && isSampleOptionsOpen) {
      event.preventDefault();
      closeSampleOptions();
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isAdminPreviewMode) return;

    const saveRequest = editingRecordId === undefined
      ? {
          kind: "create" as const,
          submission: buildSubmission(form, selectedSampleRef.current),
        }
      : {
          kind: "correct" as const,
          id: editingRecordId,
          submission: buildSubmission(form, selectedSampleRef.current),
        };
    if (saveRequest.submission === undefined) {
      setFormMessage("Выберите пробу без химического анализа.");
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
    const savedLaboratoryAssistant =
      result.record.chemicalAnalysisLaboratoryAssistant?.trim() ?? "";
    if (!wasEditing && savedLaboratoryAssistant !== "") {
      sessionLaboratoryAssistant.current = savedLaboratoryAssistant;
      laboratoryAssistantBySessionProfile.set(
        profile,
        savedLaboratoryAssistant,
      );
    }
    const savedSampleKey = buildSampleKey(result.record);
    setHistory((current) => ({
      ...current,
      sampleOptions: current.sampleOptions.filter(
        (sample) => buildSampleKey(sample) !== savedSampleKey,
      ),
    }));
    resetForm();
    setLaboratoryAssistantOptions((current) => mergeLaboratoryJournalOptions(
      current,
      savedLaboratoryAssistant === "" ? [] : [savedLaboratoryAssistant],
    ));
    setFormMessage("");
    setRefreshVersion((value) => value + 1);
    onShowToast(
      wasEditing ? "Химический анализ исправлен" : "Химический анализ сохранён",
      result.record.batchNumber === undefined
        ? `${result.record.laboratorySampleCode}.`
        : `${result.record.laboratorySampleCode} · ${result.record.batchNumber}.`,
    );
  }

  function editRecord(record: LaboratoryChemicalAnalysisJournalRecord) {
    isLaboratoryAnalysisNumberAuto.current = false;
    const selectedSample = sampleOptionFromRecord(record);
    selectedSampleRef.current = selectedSample;
    setHistory((current) => ({
      ...current,
      sampleOptions: keepSelectedSample(
        current.sampleOptions,
        selectedSample,
      ),
    }));
    setEditingRecordId(record.id);
    setEditingRecordCode(record.laboratorySampleCode);
    setSampleQuery(record.laboratorySampleCode);
    setIsSampleOptionsOpen(false);
    setForm({
      sampleKey: buildSampleKey(selectedSample),
      laboratoryAnalysisNumber: record.laboratoryAnalysisNumber ?? "",
      chemicalAnalysisDate: record.chemicalAnalysisDate ?? "",
      chemicalAnalysisLaboratoryAssistant:
        record.chemicalAnalysisLaboratoryAssistant ?? "",
      batchNumber: record.batchNumber ?? "",
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
    isLaboratoryAnalysisNumberAuto.current = true;
    setEditingRecordId(undefined);
    setEditingRecordCode("");
    selectedSampleRef.current = undefined;
    setSampleQuery("");
    setIsSampleOptionsOpen(false);
    setActiveSampleOptionIndex(-1);
    setForm(createEmptyForm(
      sessionLaboratoryAssistant.current,
      nextLaboratoryAnalysisNumberRef.current,
    ));
  }

  async function openProtocol() {
    if (
      isAdminPreviewMode ||
      isOpeningProtocol ||
      history.status !== "ready" ||
      history.records.length === 0
    ) {
      return;
    }

    const previewWindow = window.open("", "_blank");
    if (previewWindow !== null) {
      previewWindow.opener = null;
      previewWindow.document.title = "Формируем протокол…";
    }
    setIsOpeningProtocol(true);
    const response = await requestLaboratoryChemicalAnalysisProtocolPdf({
      ...(dateFrom === "" ? {} : { dateFrom }),
      ...(dateTo === "" ? {} : { dateTo }),
      ...(query.trim() === "" ? {} : { query: query.trim() }),
    });
    setIsOpeningProtocol(false);

    if (response.status === "error") {
      previewWindow?.close();
      onShowToast(
        "Протокол не сформирован",
        readShortUserMessage(
          response.message,
          "Не удалось сформировать протокол химических анализов.",
        ),
      );
      return;
    }

    const objectUrl = URL.createObjectURL(response.blob);
    if (previewWindow !== null) {
      previewWindow.location.href = objectUrl;
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
      return;
    }

    const link = document.createElement("a");
    link.href = objectUrl;
    link.target = "_blank";
    link.rel = "noopener";
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
  }

  const isSampleListboxVisible =
    isSampleOptionsOpen && history.status === "ready";
  const activeSampleOptionId =
    isSampleListboxVisible &&
      history.sampleOptions[activeSampleOptionIndex] !== undefined
      ? `${sampleOptionsListId}-option-${activeSampleOptionIndex}`
      : undefined;
  const isTotalRuleError =
    formMessage === laboratoryChemicalAnalysisTotalRuleMessage;

  useEffect(() => {
    if (activeSampleOptionId === undefined) return;
    document.getElementById(activeSampleOptionId)?.scrollIntoView?.({
      block: "nearest",
    });
  }, [activeSampleOptionId]);

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
          <div
            className="laboratory-field-wide chemical-analysis-sample-picker"
            onBlur={(event) => {
              const nextTarget = event.relatedTarget;
              if (
                nextTarget !== null &&
                event.currentTarget.contains(nextTarget as Node)
              ) {
                return;
              }
              closeSampleOptions();
            }}
          >
            <label>
              <span>Код лабораторной пробы</span>
              <input
                aria-activedescendant={activeSampleOptionId}
                aria-autocomplete="list"
                aria-controls={sampleOptionsListId}
                aria-expanded={isSampleListboxVisible}
                autoComplete="off"
                maxLength={120}
                placeholder="Начните вводить код, номер или наименование пробы"
                ref={sampleInputRef}
                role="combobox"
                value={sampleQuery}
                onChange={(event) => {
                  const value = event.currentTarget.value;
                  updateSampleQuery(value);
                }}
                onFocus={() => {
                  if (sampleQuery.trim() !== "") setIsSampleOptionsOpen(true);
                }}
                onKeyDown={handleSampleKeyDown}
              />
            </label>
            {isSampleListboxVisible
              ? (
                  <div
                    className="chemical-analysis-sample-options"
                    id={sampleOptionsListId}
                    role="listbox"
                  >
                    {history.sampleOptions.length === 0
                      ? (
                          <p className="chemical-analysis-sample-empty">
                            Подходящие пробы без химического анализа не найдены.
                          </p>
                        )
                      : history.sampleOptions.map((sample, index) => (
                          <button
                            aria-selected={activeSampleOptionIndex === index}
                            className="chemical-analysis-sample-option"
                            id={`${sampleOptionsListId}-option-${index}`}
                            key={buildSampleKey(sample)}
                            onClick={() => selectSample(sample)}
                            onMouseDown={(event) => event.preventDefault()}
                            role="option"
                            tabIndex={-1}
                            type="button"
                          >
                            {formatSampleOption(sample)}
                          </button>
                        ))}
                  </div>
                )
              : null}
          </div>
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
                  inputMode={field.kind === "indicator"
                    ? "decimal"
                    : field.id === "laboratoryAnalysisNumber"
                      ? "numeric"
                      : undefined}
                  maxLength={field.kind === "date" ? undefined : 120}
                  list={field.id === "chemicalAnalysisLaboratoryAssistant"
                    ? laboratoryAssistantListId
                    : undefined}
                  placeholder={
                    field.id === "chemicalAnalysisLaboratoryAssistant"
                      ? "Выберите или введите фамилию"
                      : undefined
                  }
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
          <datalist id={laboratoryAssistantListId}>
            {laboratoryAssistantOptions.map((option) => (
              <option key={option} value={option} />
            ))}
          </datalist>
        </div>

        {history.status !== "loading" &&
            sampleQuery.trim() === "" &&
            history.sampleOptions.length === 0
          ? (
              <p className="form-message">
                Нет проб без химического анализа в доступных журналах.
              </p>
            )
          : null}
        <div className="laboratory-form-actions">
          <button
            className="primary-button"
            disabled={
              isAdminPreviewMode ||
              isSubmitting ||
              form.sampleKey === ""
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
            : (
                <span
                  className={`form-message${isTotalRuleError
                    ? " is-error chemical-analysis-total-error"
                    : ""}`}
                  role={isTotalRuleError ? "alert" : "status"}
                >
                  {formMessage}
                </span>
              )}
        </div>
      </form>

      <section className="laboratory-history chemical-analysis-journal-history">
        <div className="laboratory-history-heading">
          <div className="chemical-analysis-history-title">
            <div>
              <span className="eyebrow">История</span>
              <h2>Выполненные химические анализы</h2>
            </div>
            <button
              className="secondary-button"
              disabled={
                isAdminPreviewMode ||
                isOpeningProtocol ||
                history.status !== "ready" ||
                history.records.length === 0
              }
              type="button"
              onClick={() => void openProtocol()}
            >
              {isOpeningProtocol ? "Формируем…" : "Распечатать Протокол"}
            </button>
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
                placeholder="Номер анализа, код, проба, партия или лаборант"
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

function createEmptyForm(
  laboratoryAssistant: string,
  laboratoryAnalysisNumber = "",
): FormState {
  return {
    sampleKey: "",
    laboratoryAnalysisNumber,
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
  selectedSample: LaboratoryChemicalAnalysisSampleOption | undefined,
): LaboratoryChemicalAnalysisJournalSubmission | undefined {
  if (
    form.sampleKey === "" ||
    selectedSample === undefined ||
    laboratoryChemicalAnalysisFields.some(
      (field) => field.required && form[field.id].trim() === "",
    )
  ) {
    return undefined;
  }

  return {
    sampleSource: selectedSample.sampleSource,
    sampleId: selectedSample.sampleId,
    ...(form.laboratoryAnalysisNumber.trim() === ""
      ? {}
      : { laboratoryAnalysisNumber: form.laboratoryAnalysisNumber.trim() }),
    ...(form.batchNumber.trim() === ""
      ? {}
      : { batchNumber: form.batchNumber.trim() }),
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

function formatSampleOption(sample: LaboratoryChemicalAnalysisSampleOption) {
  const source = sample.sampleSource === "sample_registration"
    ? "Журнал отбора проб"
    : "Неформованная продукция";
  const registration = sample.registrationDate === undefined
    ? ""
    : ` · регистрация ${formatDate(sample.registrationDate)}`;
  return `${source} · ${sample.laboratorySampleCode} · № ${sample.sampleNumber} · ${sample.sampleName} · дата пробы ${formatDate(sample.sampleDate)}${registration}`;
}

function keepSelectedSample(
  options: LaboratoryChemicalAnalysisSampleOption[],
  selected: LaboratoryChemicalAnalysisSampleOption | undefined,
) {
  return selected === undefined || options.some(
      (option) => buildSampleKey(option) === buildSampleKey(selected),
    )
    ? options
    : [...options, selected];
}

function buildSampleKey(sample: LaboratoryChemicalAnalysisSampleOption) {
  return `${sample.sampleSource}:${sample.sampleId}`;
}

function sampleOptionFromRecord(
  record: LaboratoryChemicalAnalysisJournalRecord,
): LaboratoryChemicalAnalysisSampleOption {
  return {
    sampleSource: record.sampleSource,
    sampleId: record.sampleId,
    laboratorySampleCode: record.laboratorySampleCode,
    sampleNumber: record.sampleNumber,
    sampleName: record.sampleName,
    sampleDate: record.sampleDate,
    ...(record.registrationDate === undefined
      ? {}
      : { registrationDate: record.registrationDate }),
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
