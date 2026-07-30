import { useEffect, useMemo, useState } from "react";
import type {
  LaboratoryIndicatorReference,
  LaboratoryResult,
  LaboratorySection,
} from "./contracts";
import { LoadingIndicator } from "./LoadingIndicator";
import {
  LaboratoryResultsTable,
  mergeIndicatorReferences,
  type LaboratoryTableSection,
} from "./LaboratoryResultsTable";
import {
  requestLaboratoryReference,
  requestLaboratoryResults,
} from "./services/laboratoryResults";
import { readShortUserMessage } from "./services/userFacingMessages";

type ShowToast = (title: string, message: string) => void;

type ResultsState =
  | { status: "loading"; results: LaboratoryResult[] }
  | { status: "ready"; results: LaboratoryResult[] }
  | { status: "error"; message: string; results: LaboratoryResult[] };

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

const maxNameQueryLength = 120;

export function LaboratoryReviewWorkspace({
  isAdminPreviewMode,
  onShowToast,
}: {
  isAdminPreviewMode: boolean;
  onShowToast: ShowToast;
}) {
  const [section, setSection] = useState<LaboratoryTableSection>("all");
  const [isDateFilterEnabled, setIsDateFilterEnabled] = useState(false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [isNameFilterEnabled, setIsNameFilterEnabled] = useState(false);
  const [nameQuery, setNameQuery] = useState("");
  const [indicators, setIndicators] = useState<LaboratoryIndicatorReference[]>([]);
  const [resultsState, setResultsState] = useState<ResultsState>({
    status: "loading",
    results: [],
  });

  const appliedDateFrom = isDateFilterEnabled ? dateFrom : "";
  const appliedDateTo = isDateFilterEnabled ? dateTo : "";
  const appliedNameQuery = isNameFilterEnabled ? nameQuery.trim() : "";

  useEffect(() => {
    const controller = new AbortController();
    requestLaboratoryReference({ signal: controller.signal }).then((result) => {
      if (controller.signal.aborted) return;
      setIndicators(result.status === "ready" ? result.reference.indicators : []);
    });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setResultsState((current) => ({ status: "loading", results: current.results }));
    requestLaboratoryResults(
      {
        ...(section === "all" ? {} : { section }),
        ...(appliedDateFrom === "" ? {} : { dateFrom: appliedDateFrom }),
        ...(appliedDateTo === "" ? {} : { dateTo: appliedDateTo }),
        ...(appliedNameQuery === "" ? {} : { nameQuery: appliedNameQuery }),
      },
      { signal: controller.signal },
    ).then((result) => {
      if (controller.signal.aborted) return;
      setResultsState((current) =>
        result.status === "ready"
          ? { status: "ready", results: result.results }
          : {
              status: "error",
              message: readShortUserMessage(
                result.message,
                "Не удалось загрузить результаты испытаний.",
              ),
              results: current.results,
            },
      );
    });
    return () => controller.abort();
  }, [appliedDateFrom, appliedDateTo, appliedNameQuery, section]);

  const tableIndicators = useMemo(
    () => mergeIndicatorReferences(indicators, resultsState.results),
    [indicators, resultsState.results],
  );

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
      </section>

      <section className="laboratory-history" aria-label="Результаты испытаний">
        {resultsState.status === "loading" ? (
          <LoadingIndicator label="Загружаем результаты…" variant="inline" />
        ) : resultsState.status === "error" ? (
          <p className="form-message is-error" role="alert">{resultsState.message}</p>
        ) : null}
        <LaboratoryResultsTable
          section={section}
          sectionLabels={reviewSectionLabels}
          results={resultsState.results}
          indicators={tableIndicators}
          isAdminPreviewMode={isAdminPreviewMode}
          onShowToast={onShowToast}
        />
      </section>
    </main>
  );
}
