import { useEffect, useMemo, useState } from "react";
import type {
  LaboratoryChemicalAnalysisJournalRecord,
  LaboratoryIndicatorReference,
  LaboratoryResult,
  LaboratoryRawMaterialQualityRecord,
  LaboratoryGreenProductQualityRecord,
  LaboratorySampleRegistrationJournalRecord,
  LaboratorySection,
  LaboratoryUnshapedProductSampleRecord,
  RotaryKiln2FiringJournalRecord,
} from "./contracts";
import {
  centralLabTabLabel,
  refractoryShopTabLabel,
  LaboratoryChemicalAnalysisTable,
  LaboratorySampleRegistrationTable,
  LaboratoryUnshapedProductSampleTable,
  LaboratoryRawMaterialQualityTable,
  LaboratoryGreenProductQualityTable,
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
  laboratoryReviewCentralLabViews,
  laboratoryReviewJournals,
  laboratoryReviewRootViews,
  laboratoryReviewRefractoryShopViews,
  laboratoryReviewViews,
  selectLaboratoryReviewJournals,
  type LaboratoryReviewView,
} from "./services/laboratoryReviewJournals";
import { requestLaboratorySampleRegistrationJournal } from "./services/laboratorySampleRegistrationJournal";
import { requestRotaryKiln2FiringJournal } from "./services/rotaryKiln2FiringJournal";
import { requestLaboratoryUnshapedProductSampleJournal } from "./services/laboratoryUnshapedProductSampleJournal";
import { requestLaboratoryRawMaterialQualityJournal } from "./services/laboratoryRawMaterialQualityJournal";
import { requestLaboratoryGreenProductQualityJournal } from "./services/laboratoryGreenProductQualityJournal";
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

const maxNameQueryLength = 120;

/** Справочник показателей нужен только таблице результатов испытаний. */
const isResultsJournalVisible = laboratoryReviewJournals.some(
  (journal) => journal.id === "results",
);

export function LaboratoryReviewWorkspace({
  isAdminPreviewMode,
  onShowToast,
}: {
  isAdminPreviewMode: boolean;
  onShowToast: ShowToast;
}) {
  const [view, setView] = useState<LaboratoryReviewView>(
    laboratoryReviewViews[0],
  );
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
  const section: LaboratoryTableSection = view.section;
  const isCentralLabGroupOpen = view.group === "central-lab";
  const isRefractoryShopGroupOpen = view.group === "refractory-shop";
  const { visible, excluded } = useMemo(
    () => selectLaboratoryReviewJournals(view, { isNameFilterEnabled }),
    [isNameFilterEnabled, view],
  );

  useEffect(() => {
    if (!isResultsJournalVisible) return;
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
        className="laboratory-section-tabs"
        role="tablist"
        aria-label="Раздел лабораторных испытаний"
      >
        {laboratoryReviewRootViews.map((item) => (
          <button
            aria-selected={view.id === item.id}
            className={view.id === item.id ? "is-active" : ""}
            key={item.id}
            role="tab"
            type="button"
            onClick={() => setView(item)}
          >
            {item.label}
          </button>
        ))}
        <button
          aria-selected={isCentralLabGroupOpen}
          className={isCentralLabGroupOpen ? "is-active" : ""}
          role="tab"
          type="button"
          onClick={() => setView(laboratoryReviewCentralLabViews[0])}
        >
          {centralLabTabLabel}
        </button>
        <button
          aria-selected={isRefractoryShopGroupOpen}
          className={isRefractoryShopGroupOpen ? "is-active" : ""}
          role="tab"
          type="button"
          onClick={() => setView(laboratoryReviewRefractoryShopViews[0])}
        >
          {refractoryShopTabLabel}
        </button>
      </div>

      {isCentralLabGroupOpen ? (
        <div
          className="laboratory-section-tabs laboratory-central-lab-tabs"
          role="tablist"
          aria-label="Журналы ЦЗЛ"
        >
          {laboratoryReviewCentralLabViews.map((item) => (
            <button
              aria-selected={view.id === item.id}
              className={view.id === item.id ? "is-active" : ""}
              key={item.id}
              role="tab"
              type="button"
              onClick={() => setView(item)}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}

      {isRefractoryShopGroupOpen ? (
        <div
          className="laboratory-section-tabs laboratory-refractory-shop-tabs"
          role="tablist"
          aria-label="Журналы огнеупорного цеха"
        >
          {laboratoryReviewRefractoryShopViews.map((item) => (
            <button
              aria-selected={view.id === item.id}
              className={view.id === item.id ? "is-active" : ""}
              key={item.id}
              role="tab"
              type="button"
              onClick={() => setView(item)}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}

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
          ) : journal.id === "unshaped_product_samples" ? (
            <UnshapedProductSampleHistory query={query} />
          ) : journal.id === "raw_material_quality" ? (
            <RawMaterialQualityHistory query={query} />
          ) : journal.id === "green_product_quality" ? (
            <GreenProductQualityHistory query={query} />
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

function UnshapedProductSampleHistory({ query }: { query: ReviewQuery }) {
  const [state, setState] = useState<
    RecordsState<LaboratoryUnshapedProductSampleRecord>
  >({ status: "loading", records: [] });

  useEffect(() => {
    const controller = new AbortController();
    setState((current) => ({ status: "loading", records: current.records }));
    requestLaboratoryUnshapedProductSampleJournal(
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
              "Не удалось загрузить журнал проб неформованной продукции.",
            ),
            records: current.records,
          });
    });
    return () => controller.abort();
  }, [query.dateFrom, query.dateTo, query.nameQuery]);

  return (
    <>
      <HistoryStatus state={state} loadingLabel="Загружаем записи…" />
      <LaboratoryUnshapedProductSampleTable records={state.records} />
    </>
  );
}

function RawMaterialQualityHistory({ query }: { query: ReviewQuery }) {
  const [state, setState] = useState<
    RecordsState<LaboratoryRawMaterialQualityRecord>
  >({ status: "loading", records: [] });

  useEffect(() => {
    const controller = new AbortController();
    setState((current) => ({ status: "loading", records: current.records }));
    requestLaboratoryRawMaterialQualityJournal(
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
              "Не удалось загрузить журнал качества сырья.",
            ),
            records: current.records,
          });
    });
    return () => controller.abort();
  }, [query.dateFrom, query.dateTo, query.nameQuery]);

  return (
    <>
      <HistoryStatus state={state} loadingLabel="Загружаем записи…" />
      <LaboratoryRawMaterialQualityTable records={state.records} />
    </>
  );
}

function GreenProductQualityHistory({ query }: { query: ReviewQuery }) {
  const [state, setState] = useState<
    RecordsState<LaboratoryGreenProductQualityRecord>
  >({ status: "loading", records: [] });

  useEffect(() => {
    const controller = new AbortController();
    setState((current) => ({ status: "loading", records: current.records }));
    requestLaboratoryGreenProductQualityJournal(
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
              "Не удалось загрузить журнал качества сырцовой продукции.",
            ),
            records: current.records,
          });
    });
    return () => controller.abort();
  }, [query.dateFrom, query.dateTo, query.nameQuery]);

  return (
    <>
      <HistoryStatus state={state} loadingLabel="Загружаем записи…" />
      <LaboratoryGreenProductQualityTable records={state.records} />
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
