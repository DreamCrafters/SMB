import { useEffect, useMemo, useState } from "react";
import type {
  LaboratoryChemicalAnalysisJournalRecord,
  LaboratoryIndicatorReference,
  LaboratoryResult,
  LaboratorySampleRegistrationJournalRecord,
  LaboratorySection,
  RotaryKiln2FiringJournalRecord,
} from "./contracts";
import {
  LaboratoryChemicalAnalysisTable,
  LaboratorySampleRegistrationTable,
  RotaryKiln2FiringTable,
} from "./LaboratoryJournalTables";
import { LoadingIndicator } from "./LoadingIndicator";
import {
  LaboratoryResultsTable,
  mergeIndicatorReferences,
  type LaboratoryTableSection,
} from "./LaboratoryResultsTable";
import { requestLaboratoryChemicalAnalysisJournal } from "./services/laboratoryChemicalAnalysisJournal";
import {
  requestLaboratoryReference,
  requestLaboratoryResults,
} from "./services/laboratoryResults";
import {
  laboratoryReviewJournals,
  selectLaboratoryReviewJournals,
  type LaboratoryReviewJournalSelection,
} from "./services/laboratoryReviewJournals";
import { requestLaboratorySampleRegistrationJournal } from "./services/laboratorySampleRegistrationJournal";
import { requestRotaryKiln2FiringJournal } from "./services/rotaryKiln2FiringJournal";
import { readShortUserMessage } from "./services/userFacingMessages";

type ShowToast = (title: string, message: string) => void;

/** Empty values mean the matching filter button is switched off. */
type ReviewQuery = {
  dateFrom: string;
  dateTo: string;
  nameQuery: string;
};

type RecordsState<Entry> =
  | { status: "loading"; records: Entry[] }
  | { status: "ready"; records: Entry[] }
  | { status: "error"; message: string; records: Entry[] };

const reviewSectionLabels: Record<LaboratorySection, string> = {
  incoming: "Входящий контроль",
  finished_product: "Выходящий контроль",
};

const sectionFilters: ReadonlyArray<{
  id: LaboratoryTableSection;
  label: string;
}> = [
  { id: "all", label: "Все испытания" },
  { id: "incoming", label: reviewSectionLabels.incoming },
  { id: "finished_product", label: reviewSectionLabels.finished_product },
];

const journalFilters: ReadonlyArray<{
  id: LaboratoryReviewJournalSelection;
  label: string;
}> = [
  { id: "all", label: "Все журналы" },
  ...laboratoryReviewJournals.map(({ id, label }) => ({ id, label })),
];

const maxNameQueryLength = 120;

export function LaboratoryReviewWorkspace({
  isAdminPreviewMode,
  onShowToast,
}: {
  isAdminPreviewMode: boolean;
  onShowToast: ShowToast;
}) {
  const [journalSelection, setJournalSelection] =
    useState<LaboratoryReviewJournalSelection>("all");
  const [section, setSection] = useState<LaboratoryTableSection>("all");
  const [isDateFilterEnabled, setIsDateFilterEnabled] = useState(false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [isNameFilterEnabled, setIsNameFilterEnabled] = useState(false);
  const [nameQuery, setNameQuery] = useState("");
  const [indicators, setIndicators] = useState<LaboratoryIndicatorReference[]>([]);

  const query: ReviewQuery = {
    dateFrom: isDateFilterEnabled ? dateFrom : "",
    dateTo: isDateFilterEnabled ? dateTo : "",
    nameQuery: isNameFilterEnabled ? nameQuery.trim() : "",
  };
  const { visible, excluded } = useMemo(
    () => selectLaboratoryReviewJournals(journalSelection, {
      section,
      isNameFilterEnabled,
    }),
    [isNameFilterEnabled, journalSelection, section],
  );

  useEffect(() => {
    const controller = new AbortController();
    requestLaboratoryReference({ signal: controller.signal }).then((result) => {
      if (controller.signal.aborted) return;
      setIndicators(result.status === "ready" ? result.reference.indicators : []);
    });
    return () => controller.abort();
  }, []);

  function toggleDateFilter() {
    setIsDateFilterEnabled((enabled) => {
      if (enabled) {
        setDateFrom("");
        setDateTo("");
      }
      return !enabled;
    });
  }

  function toggleNameFilter() {
    setIsNameFilterEnabled((enabled) => {
      if (enabled) setNameQuery("");
      return !enabled;
    });
  }

  return (
    <main className="workspace laboratory-workspace laboratory-review">
      <header className="workspace-heading laboratory-heading">
        <div>
          <span className="eyebrow">Лаборатория</span>
          <h1>Просмотр результатов испытаний</h1>
        </div>
      </header>

      <div
        className="laboratory-review-journal-tabs"
        role="tablist"
        aria-label="Журнал лабораторных испытаний"
      >
        {journalFilters.map((filter) => (
          <button
            aria-selected={journalSelection === filter.id}
            className={journalSelection === filter.id ? "is-active" : ""}
            key={filter.id}
            role="tab"
            type="button"
            onClick={() => setJournalSelection(filter.id)}
          >
            {filter.label}
          </button>
        ))}
      </div>

      <div
        className="laboratory-section-tabs"
        role="tablist"
        aria-label="Раздел лабораторных испытаний"
      >
        {sectionFilters.map((filter) => (
          <button
            aria-selected={section === filter.id}
            className={section === filter.id ? "is-active" : ""}
            key={filter.id}
            role="tab"
            type="button"
            onClick={() => setSection(filter.id)}
          >
            {filter.label}
          </button>
        ))}
      </div>

      <section className="laboratory-review-filters" aria-label="Фильтры испытаний">
        <div className="laboratory-review-filter-buttons">
          <button
            aria-pressed={isDateFilterEnabled}
            className={`secondary-button${isDateFilterEnabled ? " is-active" : ""}`}
            type="button"
            onClick={toggleDateFilter}
          >
            По дате испытаний
          </button>
          <button
            aria-pressed={isNameFilterEnabled}
            className={`secondary-button${isNameFilterEnabled ? " is-active" : ""}`}
            type="button"
            onClick={toggleNameFilter}
          >
            По наименованию (номенклатуре)
          </button>
        </div>
        {isDateFilterEnabled || isNameFilterEnabled ? (
          <div className="laboratory-filters">
            {isDateFilterEnabled ? (
              <>
                <label>
                  <span>С даты</span>
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={(event) => {
                      const value = event.currentTarget.value;
                      setDateFrom(value);
                    }}
                  />
                </label>
                <label>
                  <span>По дату</span>
                  <input
                    type="date"
                    value={dateTo}
                    onChange={(event) => {
                      const value = event.currentTarget.value;
                      setDateTo(value);
                    }}
                  />
                </label>
              </>
            ) : null}
            {isNameFilterEnabled ? (
              <label>
                <span>Наименование</span>
                <input
                  maxLength={maxNameQueryLength}
                  placeholder="Объект испытаний или марка"
                  value={nameQuery}
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    setNameQuery(value);
                  }}
                />
              </label>
            ) : null}
          </div>
        ) : null}
        {excluded.length === 0 ? null : (
          <p className="laboratory-review-excluded-note">
            {`Не показаны журналы, к которым фильтр неприменим: ${
              excluded
                .map(({ journal, reason }) => `${journal.title} — ${reason}`)
                .join("; ")
            }.`}
          </p>
        )}
      </section>

      {visible.map((journal) => (
        <section
          aria-label={journal.title}
          className="laboratory-history laboratory-review-journal"
          key={journal.id}
        >
          <div className="laboratory-history-heading">
            <div>
              <span className="eyebrow">Журнал</span>
              <h2>{journal.title}</h2>
            </div>
            {isDateFilterEnabled ? (
              <p className="laboratory-review-journal-note">
                {`Период: ${journal.dateFilterLabel}.`}
              </p>
            ) : null}
          </div>
          {journal.id === "results" ? (
            <LaboratoryResultsHistory
              indicators={indicators}
              isAdminPreviewMode={isAdminPreviewMode}
              query={query}
              section={section}
              onShowToast={onShowToast}
            />
          ) : journal.id === "sample_registration" ? (
            <SampleRegistrationHistory query={query} />
          ) : journal.id === "chemical_analysis" ? (
            <ChemicalAnalysisHistory query={query} />
          ) : (
            <RotaryKiln2FiringHistory query={query} />
          )}
        </section>
      ))}
    </main>
  );
}

function LaboratoryResultsHistory({
  indicators,
  isAdminPreviewMode,
  query,
  section,
  onShowToast,
}: {
  indicators: LaboratoryIndicatorReference[];
  isAdminPreviewMode: boolean;
  query: ReviewQuery;
  section: LaboratoryTableSection;
  onShowToast: ShowToast;
}) {
  const [state, setState] = useState<RecordsState<LaboratoryResult>>({
    status: "loading",
    records: [],
  });

  useEffect(() => {
    const controller = new AbortController();
    setState((current) => ({ status: "loading", records: current.records }));
    requestLaboratoryResults(
      {
        ...(section === "all" ? {} : { section }),
        ...buildJournalDateFilters(query),
        ...(query.nameQuery === "" ? {} : { nameQuery: query.nameQuery }),
      },
      { signal: controller.signal },
    ).then((result) => {
      if (controller.signal.aborted) return;
      setState((current) => result.status === "ready"
        ? { status: "ready", records: result.results }
        : {
            status: "error",
            message: readShortUserMessage(
              result.message,
              "Не удалось загрузить результаты испытаний.",
            ),
            records: current.records,
          });
    });
    return () => controller.abort();
  }, [query.dateFrom, query.dateTo, query.nameQuery, section]);

  const tableIndicators = useMemo(
    () => mergeIndicatorReferences(indicators, state.records),
    [indicators, state.records],
  );

  return (
    <>
      <HistoryStatus state={state} loadingLabel="Загружаем результаты…" />
      <LaboratoryResultsTable
        section={section}
        sectionLabels={reviewSectionLabels}
        results={state.records}
        indicators={tableIndicators}
        isAdminPreviewMode={isAdminPreviewMode}
        onShowToast={onShowToast}
      />
    </>
  );
}

function SampleRegistrationHistory({ query }: { query: ReviewQuery }) {
  const [state, setState] = useState<
    RecordsState<LaboratorySampleRegistrationJournalRecord>
  >({ status: "loading", records: [] });

  useEffect(() => {
    const controller = new AbortController();
    setState((current) => ({ status: "loading", records: current.records }));
    requestLaboratorySampleRegistrationJournal(
      {
        ...buildJournalDateFilters(query),
        ...(query.nameQuery === "" ? {} : { nameQuery: query.nameQuery }),
      },
      { signal: controller.signal },
    ).then((result) => {
      if (controller.signal.aborted) return;
      setState((current) => result.status === "ready"
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
  }, [query.dateFrom, query.dateTo, query.nameQuery]);

  return (
    <>
      <HistoryStatus state={state} loadingLabel="Загружаем записи…" />
      <LaboratorySampleRegistrationTable records={state.records} />
    </>
  );
}

function ChemicalAnalysisHistory({ query }: { query: ReviewQuery }) {
  const [state, setState] = useState<
    RecordsState<LaboratoryChemicalAnalysisJournalRecord>
  >({ status: "loading", records: [] });

  useEffect(() => {
    const controller = new AbortController();
    setState((current) => ({ status: "loading", records: current.records }));
    requestLaboratoryChemicalAnalysisJournal(
      {
        ...buildJournalDateFilters(query),
        ...(query.nameQuery === "" ? {} : { nameQuery: query.nameQuery }),
      },
      { signal: controller.signal },
    ).then((result) => {
      if (controller.signal.aborted) return;
      setState((current) => result.status === "ready"
        ? { status: "ready", records: result.records }
        : {
            status: "error",
            message: readShortUserMessage(
              result.message,
              "Не удалось загрузить журнал химических анализов.",
            ),
            records: current.records,
          });
    });
    return () => controller.abort();
  }, [query.dateFrom, query.dateTo, query.nameQuery]);

  return (
    <>
      <HistoryStatus state={state} loadingLabel="Загружаем записи…" />
      <LaboratoryChemicalAnalysisTable records={state.records} />
    </>
  );
}

function RotaryKiln2FiringHistory({ query }: { query: ReviewQuery }) {
  const [state, setState] = useState<
    RecordsState<RotaryKiln2FiringJournalRecord>
  >({ status: "loading", records: [] });

  useEffect(() => {
    const controller = new AbortController();
    setState((current) => ({ status: "loading", records: current.records }));
    requestRotaryKiln2FiringJournal(
      buildJournalDateFilters(query),
      { signal: controller.signal },
    ).then((result) => {
      if (controller.signal.aborted) return;
      setState((current) => result.status === "ready"
        ? { status: "ready", records: result.records }
        : {
            status: "error",
            message: readShortUserMessage(
              result.message,
              "Не удалось загрузить журнал вращающейся печи 2.",
            ),
            records: current.records,
          });
    });
    return () => controller.abort();
  }, [query.dateFrom, query.dateTo]);

  return (
    <>
      <HistoryStatus state={state} loadingLabel="Загружаем записи…" />
      <RotaryKiln2FiringTable records={state.records} />
    </>
  );
}

function HistoryStatus<Entry>({
  state,
  loadingLabel,
}: {
  state: RecordsState<Entry>;
  loadingLabel: string;
}) {
  if (state.status === "loading") {
    return <LoadingIndicator label={loadingLabel} variant="inline" />;
  }
  if (state.status === "error") {
    return <p className="form-message is-error" role="alert">{state.message}</p>;
  }
  return null;
}

function buildJournalDateFilters(query: ReviewQuery) {
  return {
    ...(query.dateFrom === "" ? {} : { dateFrom: query.dateFrom }),
    ...(query.dateTo === "" ? {} : { dateTo: query.dateTo }),
  };
}
