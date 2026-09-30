import { useEffect, useState } from "react";
import { assignmentInboxSourceCapabilities, assignmentInboxSources, assignmentRegistries, type AssignmentInboxSource, type DirectorAssignment } from "../server/src/contracts/directorAssignments";
import type { BoardAssignmentStatus } from "../server/src/contracts/assignmentStates";
import type { BoardAssignmentListItem } from "./contracts/boardAssignments";
import type { ServerUserProfile } from "./contracts/organization";
import { DirectorAssignmentExecutionCard, downloadDirectorAssignmentsPdf } from "./DirectorAssignments";
import { BoardAssignmentExecutionCard, downloadBoardAssignmentPdf } from "./BoardAssignments";
import { directorRequest, type DirectorAssignmentListResponse } from "./services/directorAssignments";
import { requestBoardAssignments } from "./services/boardAssignments";
import { ManagedTable } from "./ManagedTable";
import { TableCell, TableHeader } from "./TableCell";
import { LoadingIndicator } from "./LoadingIndicator";
import type { ShowToast } from "./services/toastStack";

const sourceLabels: Record<AssignmentInboxSource, string> = { director: "Генеральный директор", collegium: "Коллегия", board: "Совет директоров" };
const statusLabels: Record<BoardAssignmentStatus, string> = { in_progress: "В работе", under_review: "На проверке", revision_requested: "На доработке", completed: "Завершено" };
const overdueLabel = "Просрочено";
const clarificationLabel = "Требует уточнения";
const statusFilterOptions = [...Object.values(statusLabels).filter(label => label !== statusLabels.completed), overdueLabel, clarificationLabel];
const columns = ["source", "number", "summary", "assignedOn", "deadline", "status", "progress"] as const;
type Column = (typeof columns)[number];
const columnLabels: Record<Column, string> = { source: "Реестр", number: "Номер", summary: "Суть поручения", assignedOn: "Дата постановки", deadline: "Срок", status: "Статус", progress: "Промежуточные результаты" };

/** One row of «Поручения» regardless of the registry it came from. */
export type AssignmentInboxRow = {
  source: AssignmentInboxSource;
  id: string;
  number: string;
  summary: string;
  assignedOn: string;
  deadline: string;
  status: BoardAssignmentStatus;
  needsClarification: boolean;
  isOverdue: boolean;
  progress: string;
  director?: DirectorAssignment;
  board?: BoardAssignmentListItem;
};

type SourceState = { status: "loading" } | { status: "error"; message: string } | {
  status: "ready";
  rows: AssignmentInboxRow[];
  executableIds: string[];
  boardMeetingReminder?: string;
};

export type AssignmentInboxFilters = { query: string; sources: AssignmentInboxSource[]; statuses: string[]; deadlineFrom: string; deadlineTo: string };
const emptyFilters: AssignmentInboxFilters = { query: "", sources: [], statuses: [], deadlineFrom: "", deadlineTo: "" };

const formatDate = (value: string) => value ? value.slice(0, 10).split("-").reverse().join(".") : "";

export function directorInboxRows(source: "director" | "collegium", response: DirectorAssignmentListResponse): AssignmentInboxRow[] {
  // A controller also receives the whole register; «Поручения» shows only own assignments.
  const own = response.permissions.canManage ? new Set(response.ownAssignmentIds ?? []) : undefined;
  return response.assignments.filter(row => own === undefined || own.has(row.id)).map(row => ({
    source, id: row.id, number: row.number, summary: row.summary, assignedOn: row.assignedOn, deadline: row.currentOccurrenceDate,
    status: row.status, needsClarification: row.needsClarification, progress: row.progress,
    isOverdue: (row.status === "in_progress" || row.status === "revision_requested") && row.currentOccurrenceDate < response.today,
    director: row,
  }));
}

export function boardInboxRows(assignments: BoardAssignmentListItem[]): AssignmentInboxRow[] {
  // The board has no own numbering or progress field: the protocol reference identifies the decision.
  return assignments.map(row => ({
    source: "board", id: row.id, number: `Протокол №${row.protocolNumber}, п. ${row.decisionNumber}`, summary: row.summary,
    assignedOn: row.meetingDate, deadline: row.currentOccurrenceDate, status: row.status, needsClarification: false,
    isOverdue: row.isOverdue, progress: "", board: row,
  }));
}

export function statusText(row: AssignmentInboxRow) {
  return [row.isOverdue ? overdueLabel : statusLabels[row.status], ...(row.needsClarification ? [clarificationLabel] : [])].join(" · ");
}

function cellValues(row: AssignmentInboxRow): Record<Column, string> {
  return { source: sourceLabels[row.source], number: row.number, summary: row.summary, assignedOn: formatDate(row.assignedOn), deadline: formatDate(row.deadline), status: statusText(row), progress: row.progress };
}

/** Filters apply together; an empty multi-select means everything. Earliest deadline first. */
export function filterInboxRows(rows: AssignmentInboxRow[], filters: AssignmentInboxFilters) {
  const query = filters.query.trim().toLocaleLowerCase("ru-RU");
  return rows.filter(row => (filters.sources.length === 0 || filters.sources.includes(row.source))
    && (filters.statuses.length === 0 || filters.statuses.some(status => status === overdueLabel ? row.isOverdue
      : status === clarificationLabel ? row.needsClarification
        : !row.isOverdue && statusLabels[row.status] === status))
    && (!filters.deadlineFrom || row.deadline >= filters.deadlineFrom)
    && (!filters.deadlineTo || row.deadline <= filters.deadlineTo)
    && (!query || Object.values(cellValues(row)).join(" ").toLocaleLowerCase("ru-RU").includes(query)))
    .sort((left, right) => left.deadline.localeCompare(right.deadline) || left.number.localeCompare(right.number, "ru-RU"));
}

function MultiSelectFilter({ label, options, selected, onChange }: { label: string; options: ReadonlyArray<{ id: string; label: string }>; selected: string[]; onChange: (next: string[]) => void }) {
  const summary = options.filter(option => selected.includes(option.id)).map(option => option.label).join(", ") || "Все";
  return <div className="board-assignment-status-filter">
    <span className="board-assignment-status-filter-label">{label}</span>
    <details>
      <summary aria-label={`${label}: ${summary}`} title={summary}><span>{summary}</span></summary>
      <div className="board-assignment-status-options">
        {options.map(option => <label key={option.id}>
          <input type="checkbox" checked={selected.includes(option.id)} onChange={event => {
            const checked = event.currentTarget.checked;
            onChange(checked ? [...selected, option.id] : selected.filter(item => item !== option.id));
          }} />
          <span>{option.label}</span>
        </label>)}
      </div>
    </details>
  </div>;
}

/** «Поручения»: everything the account executes, from every registry it receives. */
export function AssignmentsInboxWorkspace({ profile, onShowToast }: { profile: ServerUserProfile; onShowToast: ShowToast }) {
  // Capabilities only choose which registries to ask; each server re-checks access and ownership.
  const sources = assignmentInboxSources.filter(source => profile.activeAccess.capabilities.includes(assignmentInboxSourceCapabilities[source][1] as never));
  const [states, setStates] = useState<Partial<Record<AssignmentInboxSource, SourceState>>>({});
  const [version, setVersion] = useState(0);
  const [filters, setFilters] = useState(emptyFilters);
  const [selected, setSelected] = useState<{ source: AssignmentInboxSource; id: string }>();
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  const sourcesKey = sources.join(",");

  useEffect(() => {
    const abort = new AbortController();
    const settle = (source: AssignmentInboxSource, state: SourceState) => { if (!abort.signal.aborted) setStates(current => ({ ...current, [source]: state })); };
    for (const source of sourcesKey ? sourcesKey.split(",") as AssignmentInboxSource[] : []) {
      // Keep the shown rows during a background refresh after an action.
      setStates(current => current[source]?.status === "ready" ? current : { ...current, [source]: { status: "loading" } });
      if (source === "board") {
        void requestBoardAssignments({}, { signal: abort.signal }).then(result => settle(source, result.status === "error"
          ? { status: "error", message: result.message }
          : { status: "ready", rows: boardInboxRows(result.assignments), executableIds: result.permissions.canExecute ? result.assignments.map(row => row.id) : [], boardMeetingReminder: result.boardMeetingReminder }));
      } else {
        void directorRequest<DirectorAssignmentListResponse>(assignmentRegistries[source].apiPath, "GET", undefined, abort.signal)
          .then(response => settle(source, { status: "ready", rows: directorInboxRows(source, response), executableIds: response.executableAssignmentIds ?? [] }))
          .catch(error => settle(source, { status: "error", message: error instanceof Error ? error.message : "Не удалось загрузить поручения." }));
      }
    }
    return () => abort.abort();
  }, [sourcesKey, version]);

  const refresh = () => setVersion(current => current + 1);
  if (!sources.length) return <section className="workspace-panel"><p className="director-empty">Для должности не выбраны реестры поручений.</p></section>;
  const readyStates = sources.flatMap(source => { const state = states[source]; return state?.status === "ready" ? [state] : []; });
  if (!readyStates.length && sources.every(source => states[source]?.status !== "error")) return <section className="workspace-panel"><LoadingIndicator label="Загрузка поручений" /></section>;
  const rows = readyStates.flatMap(state => state.rows);
  const visible = filterInboxRows(rows, filters);
  const visibleSources = [...new Set(visible.map(row => row.source))];
  const selectedRow = selected && rows.find(row => row.source === selected.source && row.id === selected.id);
  const selectedState = selected && states[selected.source];
  const canExecuteSelected = selectedRow !== undefined && selectedState?.status === "ready" && selectedState.executableIds.includes(selectedRow.id);
  const boardMeetingReminder = readyStates.find(state => state.boardMeetingReminder)?.boardMeetingReminder;

  async function exportJournal() {
    const source = visibleSources[0];
    if (exporting || visibleSources.length !== 1) return;
    setExporting(true); setExportError("");
    try {
      if (source === "board") {
        const message = await downloadBoardAssignmentPdf({ mode: "register", source: "current", entries: visible.map(row => ({ id: row.id, expectedUpdatedAt: row.board!.updatedAt })) });
        if (message !== undefined) setExportError(message);
      } else {
        await downloadDirectorAssignmentsPdf(source, "register", "current", visible.map(row => row.director!));
      }
    } catch (error) { setExportError(error instanceof Error ? error.message : "Не удалось сформировать PDF."); }
    finally { setExporting(false); }
  }

  return <section className="board-assignments-workspace director-assignments assignment-inbox">
    <header className="director-assignment-heading"><div><span className="eyebrow">Получение и выполнение</span><h2>Поручения</h2><p>Все поручения, которые вам нужно выполнить. Сохраняйте промежуточные результаты и отправляйте выполненную работу на проверку.</p></div></header>
    {boardMeetingReminder && <section aria-label="Напоминание к Совету директоров" className="board-assignment-view-notice board-assignment-meeting-reminder"><div><span>Напоминание</span><p>{boardMeetingReminder}</p></div></section>}
    {sources.map(source => { const state = states[source]; return state?.status === "error" ? <p role="alert" key={source}>{sourceLabels[source]}: {state.message}</p> : null; })}
    {selectedRow?.director && <DirectorAssignmentExecutionCard key={`${selectedRow.source}-${selectedRow.id}`} registryId={selectedRow.source as "director" | "collegium"} assignment={selectedRow.director}
      canExecute={canExecuteSelected} onShowToast={onShowToast} onClose={() => setSelected(undefined)}
      onChanged={async () => { setSelected(undefined); refresh(); }} />}
    {selectedRow?.board && <BoardAssignmentExecutionCard assignmentId={selectedRow.id} isOverdue={selectedRow.isOverdue} onShowToast={onShowToast}
      onClose={() => setSelected(undefined)} onChanged={refresh} />}
    <section className="director-register">
      <div className="director-register-heading"><h3>Мои поручения</h3><span>Найдено: {visible.length}</span></div>
      <div className="director-assignment-filters board-assignment-filters">
        <label>Поиск<input type="search" placeholder="Номер, содержание или реестр" value={filters.query} onChange={event => { const query = event.currentTarget.value; setFilters(current => ({ ...current, query })); }} /></label>
        {sources.length > 1 && <MultiSelectFilter label="Реестр" options={sources.map(id => ({ id, label: sourceLabels[id] }))} selected={filters.sources}
          onChange={next => setFilters(current => ({ ...current, sources: next as AssignmentInboxSource[] }))} />}
        <MultiSelectFilter label="Статус" options={statusFilterOptions.map(id => ({ id, label: id }))} selected={filters.statuses}
          onChange={statuses => setFilters(current => ({ ...current, statuses }))} />
        <label>Срок с<input type="date" max={filters.deadlineTo || undefined} value={filters.deadlineFrom} onChange={event => { const deadlineFrom = event.currentTarget.value; setFilters(current => ({ ...current, deadlineFrom })); }} /></label>
        <label>Срок по<input type="date" min={filters.deadlineFrom || undefined} value={filters.deadlineTo} onChange={event => { const deadlineTo = event.currentTarget.value; setFilters(current => ({ ...current, deadlineTo })); }} /></label>
        <button className="secondary-button" type="button" onClick={() => setFilters(emptyFilters)}>Сбросить</button>
      </div>
      <button type="button" className="secondary-button" disabled={exporting || visibleSources.length !== 1} title={visibleSources.length > 1 ? "Выберите один реестр в фильтре" : undefined} onClick={() => void exportJournal()}>Скачать журнал в PDF</button>
      {visibleSources.length > 1 && <p className="director-field-hint">Журнал в PDF формируется по одному реестру: выберите его в фильтре.</p>}
      {exporting && <LoadingIndicator label="Формирование PDF" />}
      {exportError && <p role="alert">{exportError}</p>}
      {visible.length === 0
        ? <p className="director-empty">{rows.length ? "По выбранным фильтрам поручений нет." : "Активных поручений пока нет."}</p>
        : <div className="history-table-scroll"><ManagedTable tableId="assignments.inbox" columns={columns}>
          <thead><tr>{columns.map(column => <TableHeader key={column}>{columnLabels[column]}</TableHeader>)}</tr></thead>
          <tbody>{visible.map(row => { const values = cellValues(row); return <tr key={`${row.source}-${row.id}`} className={row.isOverdue ? "director-assignment-overdue" : undefined}>
            {columns.map(column => <TableCell key={column}>{column === "summary"
              ? <button type="button" className="table-text-action board-assignment-link" onClick={() => setSelected({ source: row.source, id: row.id })}>{values.summary}</button>
              : values[column] || "—"}</TableCell>)}
          </tr>; })}</tbody>
        </ManagedTable></div>}
    </section>
  </section>;
}
