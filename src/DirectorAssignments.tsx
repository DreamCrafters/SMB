import { AssignmentCreateOverview } from "./AssignmentCreateOverview";
import { useEffect, useRef, useState, type FormEvent, type Dispatch, type SetStateAction } from "react";
import { assignmentRegistries, type AssignmentRegistry, type AssignmentRegistryId, type DirectorAssignment, type DirectorAssignmentInput, type DirectorAssignmentAccountLink, type PersonnelEmployee } from "../server/src/contracts/directorAssignments";
import { directorAssignmentPdf, directorDocument, directorRequest, type DirectorAssignmentListResponse, type PersonnelResponse } from "./services/directorAssignments";
import { requestBoardAssignments } from "./services/boardAssignments";
import type { BoardAssignmentListItem } from "./contracts/boardAssignments";
import { ManagedTable } from "./ManagedTable";
import { TableCell, TableHeader } from "./TableCell";
import { LoadingIndicator } from "./LoadingIndicator";
import type { ShowToast } from "./services/toastStack";

const accountLinkLabels = { linked: "Аккаунт привязан", unlinked: "Не привязан к аккаунту", unavailable: "Аккаунт недоступен" };
const statuses = { in_progress: "В работе", under_review: "На проверке", revision_requested: "На доработке", completed: "Завершено" };
function DirectorAssignmentResponsible({ name, link, showLink }: { name: string; link?: DirectorAssignmentAccountLink; showLink: boolean }) {
  return <div className="director-responsible-cell">
    <span className="table-cell-text">{name || "—"}</span>
    {showLink && <small className={`director-account-link is-${link ?? "unknown"}`}>{link ? accountLinkLabels[link] : "Связь с аккаунтом не проверена"}</small>}
  </div>;
}

const recurrences = { once: "Один раз", daily: "Каждый день", weekly: "Каждую неделю", monthly: "Каждый месяц", yearly: "Каждый год" };
const textFields = [
  ["summary", "Суть поручения"], ["department", "Подразделение"], ["project", "Направление / проект"],
  ["progress", "Промежуточные результаты"], ["urgency", "Срочность"], ["importance", "Важность"], ["note", "Примечание"], ["incomingNumber", "Номер входящего"],
] as const;
const protocolColumns = ["meetingDate", "protocolNumber", "decisionNumber"] as const;
const baseColumns = ["number", "assignedOn", "summary", "department", "project", "responsible", "coExecutors", "deadline", "urgency", "importance", "progress", "completedOn", "note", "status", "incomingNumber", "durationWorkdays", "remainingWorkdays", "postponedUntil"] as const;
type Column = (typeof baseColumns)[number] | (typeof protocolColumns)[number];
const columnLabels: Record<Column, string> = {
  number: "Номер", assignedOn: "Дата постановки", summary: "Суть поручения", meetingDate: "Дата заседания", protocolNumber: "Протокол", decisionNumber: "Пункт решения",
  department: "Подразделение", project: "Проект", responsible: "Ответственный", coExecutors: "Соисполнители", deadline: "Срок", urgency: "Срочность", importance: "Важность",
  progress: "Промежуточные результаты", completedOn: "Дата исполнения", note: "Примечание", status: "Статус", incomingNumber: "Номер входящего",
  durationWorkdays: "Длительность, рабочих дней", remainingWorkdays: "Осталось рабочих дней", postponedUntil: "Перенос срока",
};
const defaultColumns: readonly Column[] = ["number", "summary", "responsible", "deadline", "status", "progress"];
function registryColumns(registry: AssignmentRegistry): Column[] {
  return registry.hasProtocol ? [...baseColumns.slice(0, 3), ...protocolColumns, ...baseColumns.slice(3)] : [...baseColumns];
}
function cellValues(row: DirectorAssignment): Record<Column, string> {
  return {
    number: row.number, assignedOn: row.assignedOn, summary: row.summary,
    meetingDate: row.meetingDate ?? "", protocolNumber: row.protocolNumber ?? "", decisionNumber: row.decisionNumber ?? "",
    department: row.department, project: row.project,
    responsible: row.responsible?.fullName ?? row.source?.values[5] ?? "",
    coExecutors: row.source && row.revision === 1 ? row.source.values[6] ?? "" : row.coExecutors.map(e => e.fullName).join(", "),
    deadline: row.currentOccurrenceDate, urgency: row.urgency, importance: row.importance, progress: row.progress, completedOn: row.completedOn, note: row.note,
    status: `${statuses[row.status]}${row.needsClarification ? " · Требует уточнения" : ""}`, incomingNumber: row.incomingNumber,
    durationWorkdays: String(row.durationWorkdays ?? ""), remainingWorkdays: String(row.remainingWorkdays ?? ""), postponedUntil: row.postponedUntil,
  };
}
export function createDirectorAssignmentInput(today: string, registryId: AssignmentRegistryId = "director"): DirectorAssignmentInput {
  return {
    assignedOn: today, kind: "Поручение", summary: "", department: "", project: "", responsibleId: "", coExecutorIds: [], recurrence: "once", activeFrom: today, activeTo: today, urgency: "", importance: "", note: "", progress: "", incomingNumber: "", sourceBoardAssignmentId: null,
    ...(assignmentRegistries[registryId].hasProtocol ? { meetingDate: "", protocolNumber: "", decisionNumber: "" } : {}),
  };
}
function inputFrom(row: DirectorAssignment, employees: PersonnelEmployee[], registryId: AssignmentRegistryId): DirectorAssignmentInput {
  const input = Object.fromEntries(Object.keys(createDirectorAssignmentInput("", registryId)).map(key => [key, row[key as keyof DirectorAssignmentInput] ?? ""])) as DirectorAssignmentInput;
  const resolveId = (id: string, snapshot?: PersonnelEmployee | null) => {
    if (employees.some(employee => employee.id === id)) return id;
    const userId = id.startsWith("account:") ? id.slice(8) : snapshot?.userId;
    return employees.find(employee => userId && employee.userId === userId)?.id ?? id;
  };
  // The initiative link is immutable and absent on older rows: carry it as is, never as "".
  return { ...input, sourceBoardAssignmentId: row.sourceBoardAssignmentId, ...(assignmentRegistries[registryId].canLinkInitiative ? { sourceInitiativeId: row.sourceInitiativeId ?? null } : {}), responsibleId: resolveId(input.responsibleId, row.responsible), coExecutorIds: [...new Set(row.coExecutorIds.map(id => resolveId(id, row.coExecutors.find(employee => employee.id === id))))] };
}

const sourceFieldLabels = ["Номер задачи", "Дата постановки", "Суть задачи", "Подразделение", "Проект", "Ответственный", "Соисполнители", "Исходный срок", "Срочность", "Важность", "Промежуточные этапы", "Фактическая дата", "Примечание", "Исходный статус", "Номер входящего", "Второй номер", "Длительность", "Осталось рабочих дней", "Перенос срока"];

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Server-selected journal or card PDF; the client sends only IDs and revisions. */
export async function downloadDirectorAssignmentsPdf(registryId: AssignmentRegistryId, mode: "register" | "assignment", source: "current" | "history", entries: Array<{ id: string; revision: number; number: string }>) {
  const blob = await directorAssignmentPdf({ mode, source, entries: entries.map(({ id, revision }) => ({ id, revision })) }, assignmentRegistries[registryId].apiPath);
  downloadBlob(blob, mode === "register" ? "Журнал поручений.pdf" : `Поручение ${entries[0].number}.pdf`);
}

/** Read-only part of a card shared by the registry sub-tabs and «Поручения мне». */
function DirectorAssignmentCardBody({ registryId, assignment }: { registryId: AssignmentRegistryId; assignment: DirectorAssignment }) {
  const columns = registryColumns(assignmentRegistries[registryId]);
  return <>
    <dl className="board-assignment-details">{columns.map(column => <div key={column}><dt>{columnLabels[column]}</dt><dd>{cellValues(assignment)[column] || "—"}</dd></div>)}</dl>
    {assignment.source && <details><summary>Исходная запись Google Sheets</summary><dl className="board-assignment-details">{assignment.source.values.map((value, index) => <div key={index}><dt>{sourceFieldLabels[index] ?? "Исходное поле"}</dt><dd>{value || "—"}</dd></div>)}</dl></details>}
    <section className="board-assignment-comments">
      <h4>Комментарии</h4>
      {assignment.comments.length ? assignment.comments.map(item => <pre key={item.id}>{item.createdAt} · {item.author}: {item.text}</pre>) : <p>Комментариев пока нет.</p>}
    </section>
  </>;
}

function DirectorAssignmentDocumentLinks({ registryId, assignment, disabled, onError, onRemove }: {
  registryId: AssignmentRegistryId;
  assignment: DirectorAssignment;
  disabled: boolean;
  onError: (message: string) => void;
  onRemove?: (documentId: string) => void;
}) {
  return <>
    {!assignment.documents.length && <p className="director-field-hint">Документов пока нет.</p>}
    {assignment.documents.map(document => <div className="director-assignment-actions" key={document.id}>
      <button type="button" className="secondary-button" disabled={disabled} onClick={() => { void directorDocument(assignment.id, document.id, assignmentRegistries[registryId].apiPath).then(blob => { if (blob) downloadBlob(blob, document.fileName); }).catch(e => onError(e.message)); }}>{document.fileName}</button>
      {onRemove && <button type="button" className="secondary-button" disabled={disabled} onClick={() => onRemove(document.id)}>Убрать документ</button>}
    </div>)}
  </>;
}

/**
 * Executor card of «Поручения»: the responsible saves progress or submits the result;
 * the server re-checks ownership, the date and the revision on every action.
 */
export function DirectorAssignmentExecutionCard({ registryId, assignment, canExecute, onClose, onChanged, onShowToast }: {
  registryId: AssignmentRegistryId;
  assignment: DirectorAssignment;
  canExecute: boolean;
  onClose: () => void;
  onChanged: () => Promise<void>;
  onShowToast: ShowToast;
}) {
  const registry = assignmentRegistries[registryId];
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");
  const cardRef = useRef<HTMLElement>(null);
  useEffect(() => {
    cardRef.current?.focus({ preventScroll: true });
    cardRef.current?.scrollIntoView?.({ block: "start", behavior: "instant" });
  }, [assignment.id]);
  async function runAction(action: "record_progress" | "submit_for_review") {
    setSaving(true); setError("");
    try {
      await directorRequest(`${registry.apiPath}/${assignment.id}/action`, "POST", { action, comment, revision: assignment.revision });
      await onChanged();
      onShowToast(action === "submit_for_review" ? "Отправлено на проверку" : "Результат сохранён", action === "submit_for_review" ? "Поручение передано руководителю." : "Изменения сохранены.", "success");
    } catch (e) { setError(e instanceof Error ? e.message : "Не удалось сохранить поручение."); }
    finally { setSaving(false); }
  }
  async function exportCard() {
    setExporting(true); setError("");
    try { await downloadDirectorAssignmentsPdf(registryId, "assignment", "current", [assignment]); }
    catch (e) { setError(e instanceof Error ? e.message : "Не удалось сформировать PDF."); }
    finally { setExporting(false); }
  }
  const isOpen = assignment.status !== "completed";
  return <section className="director-assignment-detail" ref={cardRef} tabIndex={-1} aria-labelledby="assignment-inbox-detail-title">
    <span className="eyebrow">{registry.title}</span>
    <h3 id="assignment-inbox-detail-title">№{assignment.number}: {assignment.summary}</h3>
    {error && <p role="alert">{error}</p>}
    <button type="button" className="secondary-button" disabled={saving || exporting} onClick={() => void exportCard()}>Скачать поручение в PDF</button>
    <DirectorAssignmentCardBody registryId={registryId} assignment={assignment} />
    <section className="director-assignment-documents">
      <h4>Документы</h4>
      <DirectorAssignmentDocumentLinks registryId={registryId} assignment={assignment} disabled={saving} onError={setError} />
    </section>
    {isOpen && canExecute && <section className="board-assignment-decision is-execute">
      <label>
        <span>Комментарий</span>
        <textarea maxLength={4000} rows={4} disabled={saving} aria-describedby="assignment-inbox-comment-hint" value={comment} onChange={event => setComment(event.currentTarget.value)} />
      </label>
      <p className="director-field-hint" id="assignment-inbox-comment-hint">Для сохранения результата или отправки на проверку укажите комментарий.</p>
      <div className="board-assignment-dialog-actions">
        <button type="button" className="secondary-button" disabled={saving || !comment.trim()} onClick={() => void runAction("record_progress")}>Сохранить промежуточный результат</button>
        <button type="button" className="primary-button" disabled={saving || !comment.trim()} onClick={() => void runAction("submit_for_review")}>Отправить на проверку</button>
      </div>
    </section>}
    {isOpen && !canExecute && <p className="director-field-hint">{assignment.status === "under_review" ? "Результат на проверке у руководителя." : assignment.needsClarification ? "Поручение требует уточнения у руководителя." : "Исполнение откроется с даты постановки поручения."}</p>}
    <footer className="board-assignment-dialog-actions">
      <button type="button" className="secondary-button" disabled={saving} onClick={onClose}>Закрыть</button>
    </footer>
  </section>;
}

/**
 * «Поручения → Создание» only creates assignments (`create`); the register, review
 * queue, decisions, edits, history and PDF live in «Поручения → Просмотр» (`control`).
 * Own assignments are executed in «Поручения мне».
 */
export type DirectorAssignmentsMode = "create" | "control";

export function DirectorAssignmentsWorkspace({ onShowToast, registryId = "director", mode = "control" }: { onShowToast: ShowToast; registryId?: AssignmentRegistryId; mode?: DirectorAssignmentsMode }) {
  const registry = assignmentRegistries[registryId];
  const columns = registryColumns(registry);
  const [data, setData] = useState<DirectorAssignmentListResponse>();
  const historyRequest = useRef(0);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [selected, setSelected] = useState<DirectorAssignment>();
  const workspaceRef = useRef<HTMLElement>(null);
  const detailRef = useRef<HTMLElement>(null);
  const [contentOpenCount, setContentOpenCount] = useState(0);
  useEffect(() => {
    if (!contentOpenCount) return;
    const content = detailRef.current ?? workspaceRef.current?.querySelector<HTMLFormElement>(".director-assignment-compose");
    content?.focus({ preventScroll: true });
    workspaceRef.current?.scrollIntoView?.({ block: "start", behavior: "instant" });
  }, [contentOpenCount]);
  const [form, setForm] = useState<DirectorAssignmentInput>();
  const [comment, setComment] = useState("");
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
  const [history, setHistory] = useState<Array<{ id: string; assignment: DirectorAssignment }> | null>(null);
  const [showAllColumns, setShowAllColumns] = useState(false);
  async function refresh() { setData(await directorRequest<DirectorAssignmentListResponse>(registry.apiPath)); }
  useEffect(() => {
    const abort = new AbortController();
    void directorRequest<DirectorAssignmentListResponse>(registry.apiPath, "GET", undefined, abort.signal).then(setData).catch(e => { if (!abort.signal.aborted) setError(e.message); });
    return () => abort.abort();
  }, [registry.apiPath, registryId]);
  async function mutate(operation: () => Promise<unknown>) {
    setSaving(true); setError("");
    try {
      await operation(); await refresh(); setSelected(undefined); setForm(undefined); setComment("");
      onShowToast("Поручение сохранено", mode === "create" ? "Поручение отправлено и появилось в реестре." : "Изменения сохранены.", "success");
    }
    catch (e) { setError(e instanceof Error ? e.message : "Не удалось сохранить поручение."); }
    finally { setSaving(false); }
  }
  function save(event: FormEvent) {
    event.preventDefault();
    if (form) void mutate(() => directorRequest(`${registry.apiPath}${selected ? `/${selected.id}` : ""}`, selected ? "PATCH" : "POST", { assignment: form, revision: selected?.revision, comment: selected ? comment : "Поручение создано." }));
  }
  function runAction(assignment: DirectorAssignment, action: "complete" | "return_for_revision") {
    void mutate(() => directorRequest(`${registry.apiPath}/${assignment.id}/action`, "POST", { action, comment, revision: assignment.revision }));
  }
  function openAssignment(row: DirectorAssignment) {
    setSelected(row); setForm(undefined); setComment(""); setContentOpenCount(count => count + 1);
  }
  async function openHistory() {
    const request = ++historyRequest.current;
    setError("");
    try {
      const result = await directorRequest<{ completions: Array<{ id: string; assignment: DirectorAssignment }> }>(`${registry.apiPath}/completions`);
      if (request !== historyRequest.current) return;
      setSelected(undefined); setForm(undefined); setHistory(result.completions);
    }
    catch (e) { if (request === historyRequest.current) setError(e instanceof Error ? e.message : "Не удалось загрузить историю."); }
  }
  async function exportPdf(assignments: DirectorAssignment[], mode: "register" | "assignment") {
    if (exporting || !assignments.length) return;
    setExporting(true); setError("");
    try {
      const entries = assignments.map(row => {
        const id = history ? history.find(item => item.assignment === row)?.id : row.id;
        if (!id) throw new Error("Откройте поручение заново перед выгрузкой.");
        return { id, revision: row.revision, number: row.number };
      });
      await downloadDirectorAssignmentsPdf(registryId, mode, history ? "history" : "current", entries);
    } catch (e) { setError(e instanceof Error ? e.message : "Не удалось сформировать PDF."); }
    finally { setExporting(false); }
  }
  if (!data) return <section className="workspace-panel">{error ? <p role="alert">{error}</p> : <LoadingIndicator label="Загрузка поручений" />}</section>;
  const canManage = data.permissions.canManage;
  const isCreateMode = mode === "create";
  // Same decision rule as the board: only a controller decides, and only on a submitted result.
  // «Создание» lists the register read-only: decisions and edits live in «Просмотр».
  const canControl = canManage && !isCreateMode;
  const canDecideSelected = !history && canControl && selected?.status === "under_review";
  const rows = history ? history.map(item => item.assignment) : data.assignments;
  const reviewQueue = !history && canControl ? data.assignments.filter(assignment => assignment.status === "under_review") : [];
  const visible = rows.filter(row => {
    const cells = cellValues(row);
    return (selectedStatuses.length === 0 || selectedStatuses.some(status => status === "Требует уточнения" ? row.needsClarification : statuses[row.status] === status))
      && columns.map(column => cells[column]).join(" ").toLocaleLowerCase("ru-RU").includes((filters.query ?? "").toLocaleLowerCase("ru-RU"))
      && columns.every(column => cells[column].toLocaleLowerCase("ru-RU").includes((filters[column] ?? "").toLocaleLowerCase("ru-RU")));
  });
  const visibleColumns = showAllColumns ? columns : defaultColumns;
  return <section ref={workspaceRef} className="board-assignments-workspace director-assignments">
    <header className="director-assignment-heading"><div><span className="eyebrow">{isCreateMode ? "Создание поручений" : "Контроль исполнения"}</span><h2>{registry.title}</h2>{!isCreateMode && <p>Проверяйте результат исполнения, принимайте работу или возвращайте её на доработку. Новые поручения создаются во вкладке «Создание».</p>}</div></header>
    {error && <p role="alert">{error}</p>}
    {isCreateMode && !history && <AssignmentCreateOverview canCreate={canManage} count={visible.length}
      text="Поставьте задачу сотруднику и укажите срок. Принимать и править поручения можно во вкладке «Просмотр»."
      onCreate={() => { setSelected(undefined); setForm(createDirectorAssignmentInput(data.today, registryId)); setComment(""); setContentOpenCount(count => count + 1); }} />}
    {canManage && <div className="form-actions director-assignment-actions">
      <button type="button" onClick={() => { setHistory(null); setSelected(undefined); setForm(undefined); }}>Текущие поручения</button>
      <button type="button" onClick={() => { setSelected(undefined); setForm(undefined); void openHistory(); }}>История исполнений</button>
    </div>}
    {form && <DirectorAssignmentForm registryId={registryId} legacyEmployees={selected ? [...(selected.responsible ? [selected.responsible] : []), ...selected.coExecutors] : []} form={form} setForm={setForm} employees={data.employees} saving={saving} assignmentNumber={selected?.number} comment={comment} onCommentChange={setComment} onSubmit={save} onCancel={() => { setForm(undefined); setSelected(undefined); }} />}
    {selected && !form && <section className="director-assignment-detail" ref={detailRef} tabIndex={-1} aria-labelledby="director-assignment-detail-title">
      <h3 id="director-assignment-detail-title">№{selected.number}: {selected.summary}</h3>
      <button type="button" className="secondary-button" disabled={saving || exporting} onClick={() => void exportPdf([selected], "assignment")}>Скачать поручение в PDF</button>
      <DirectorAssignmentCardBody registryId={registryId} assignment={selected} />
      <section className="director-assignment-documents">
        <h4>Документы</h4>
        <DirectorAssignmentDocumentLinks registryId={registryId} assignment={selected} disabled={saving} onError={setError}
          onRemove={!history && canControl && selected.status !== "completed" ? documentId => void mutate(() => directorRequest(`${registry.apiPath}/${selected.id}/documents/${documentId}`, "DELETE")) : undefined} />
        {!history && canControl && selected.status !== "completed" && <label>Прикрепить PDF (до пяти файлов, каждый до 10 МБ)<input type="file" accept="application/pdf,.pdf" disabled={saving || selected.documents.length >= 5} onChange={event => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ""; if (file) void mutate(() => directorDocument(selected.id, file, registry.apiPath)); }} /></label>}
      </section>
      {canDecideSelected && <section className="board-assignment-decision is-review">
        <label>
          <span>Комментарий к решению</span>
          <textarea maxLength={4000} rows={4} disabled={saving} aria-describedby="director-action-comment-hint" value={comment} onChange={event => setComment(event.currentTarget.value)} />
        </label>
        <p className="director-field-hint" id="director-action-comment-hint">Проверьте результат и комментарии исполнителя, затем примите работу или верните её с понятным замечанием.</p>
        <div className="board-assignment-dialog-actions">
          <button type="button" className="secondary-button board-assignment-return-button" disabled={saving || !comment.trim()} onClick={() => runAction(selected, "return_for_revision")}>Вернуть на доработку</button>
          <button type="button" className="primary-button" disabled={saving || !comment.trim()} onClick={() => runAction(selected, "complete")}>Принять исполнение</button>
        </div>
      </section>}
      {!history && canControl && !canDecideSelected && selected.status !== "completed" && <p className="director-field-hint">Поручение у исполнителя. Принять исполнение или вернуть его можно после того, как исполнитель отправит результат на проверку.</p>}
      <footer className="board-assignment-dialog-actions">
        {!history && selected.status !== "completed" && canControl && <button type="button" className="secondary-button" disabled={saving} onClick={() => { setForm(inputFrom(selected, data.employees, registryId)); setComment(""); setContentOpenCount(count => count + 1); }}>Редактировать</button>}
        <button type="button" className="secondary-button" disabled={saving} onClick={() => setSelected(undefined)}>Закрыть</button>
      </footer>
    </section>}
    {reviewQueue.length > 0 && <section className="board-assignment-review-queue" aria-label="Поручения, ожидающие решения">
      <header>
        <div><span>Требуют внимания</span><h2>Ожидают решения</h2></div>
        <strong>{reviewQueue.length}</strong>
      </header>
      <div>
        {reviewQueue.map(assignment => <article className="board-assignment-review-card" key={assignment.id}>
          <div>
            <span>№{assignment.number} · срок {assignment.currentOccurrenceDate.split("-").reverse().join(".")}</span>
            {assignment.protocolNumber && <span>Протокол №{assignment.protocolNumber}{assignment.decisionNumber ? `, пункт ${assignment.decisionNumber}` : ""}</span>}
          </div>
          <h3>{assignment.summary}</h3>
          <p>Ответственный: {cellValues(assignment).responsible || "—"}</p>
          <button className="primary-button" type="button" disabled={saving} onClick={() => openAssignment(assignment)}>Проверить исполнение</button>
        </article>)}
      </div>
    </section>}
    <section className="director-register"><div className="director-register-heading"><h3>{history ? "История исполнений" : "Отправленные поручения"}</h3><span>Найдено: {visible.length}</span></div>
    <div className="director-assignment-filters board-assignment-filters">
      <label>Поиск<input type="search" placeholder="Номер, содержание или сотрудник" value={filters.query ?? ""} onChange={event => { const value = event.currentTarget.value; setFilters(current => ({ ...current, query: value })); }} /></label>
      <div className="board-assignment-status-filter">
        <span className="board-assignment-status-filter-label">Статус</span>
        <details>
          <summary aria-label={`Статус: ${selectedStatuses.join(", ") || "Все статусы"}`} title={selectedStatuses.join(", ") || "Все статусы"}>
            <span>{selectedStatuses.join(", ") || "Все статусы"}</span>
          </summary>
          <div className="board-assignment-status-options">
            {[...Object.values(statuses), "Требует уточнения"].map(status => <label key={status}>
              <input type="checkbox" value={status} checked={selectedStatuses.includes(status)} onChange={event => {
                const checked = event.currentTarget.checked;
                setSelectedStatuses(current => checked ? [...current, status] : current.filter(item => item !== status));
              }} />
              <span>{status}</span>
            </label>)}
          </div>
        </details>
      </div>
      <button className="secondary-button" type="button" onClick={() => { setFilters({}); setSelectedStatuses([]); }}>Сбросить</button>
    </div>
    <details className="director-more-filters"><summary>Дополнительные фильтры</summary><div className="director-assignment-filters board-assignment-filters">{columns.filter(column => column !== "status").map(column => <label key={column}>{columnLabels[column]}<input value={filters[column] ?? ""} onChange={event => { const value = event.currentTarget.value; setFilters(current => ({ ...current, [column]: value })); }} /></label>)}</div></details>
    <button type="button" className="secondary-button" disabled={saving || exporting || !visible.length} onClick={() => void exportPdf(visible, "register")}>Скачать журнал в PDF</button>
    {exporting && <LoadingIndicator label="Формирование PDF" />}
    <label className="director-columns-toggle"><input type="checkbox" checked={showAllColumns} onChange={event => setShowAllColumns(event.currentTarget.checked)} />Все колонки реестра</label>
    {visible.length === 0 ? <p className="director-empty">{rows.length ? "По выбранным фильтрам поручений нет." : "Здесь появятся отправленные поручения и результаты их исполнения."}</p> : <div className="history-table-scroll"><ManagedTable tableId={registry.tableId} columns={visibleColumns as never}><thead><tr>{visibleColumns.map(column => <TableHeader key={column}>{columnLabels[column]}</TableHeader>)}</tr></thead><tbody>{visible.map((row, index) => <tr key={`${row.id}-${index}`} className={!history && ["in_progress", "revision_requested"].includes(row.status) && row.currentOccurrenceDate < data.today ? "director-assignment-overdue" : undefined}>{visibleColumns.map(column => { const value = cellValues(row)[column]; return <TableCell key={column}>{column === "summary" ? <button type="button" disabled={saving} className="table-text-action board-assignment-link" onClick={() => openAssignment(row)}>{value}</button> : column === "responsible" ? <DirectorAssignmentResponsible name={value} link={data.responsibleAccountLinks?.[row.id]} showLink={!history} /> : value || "—"}</TableCell>; })}</tr>)}</tbody></ManagedTable></div>}
    </section>
  </section>;
}

export function DirectorAssignmentForm({ form, setForm, employees, saving, assignmentNumber, comment, onCommentChange, onCancel, onSubmit, sourceLocked = false, legacyEmployees = [], registryId = "director" }: {
  registryId?: AssignmentRegistryId;
  form: DirectorAssignmentInput;
  setForm: Dispatch<SetStateAction<DirectorAssignmentInput | undefined>>;
  employees: PersonnelEmployee[];
  saving: boolean;
  assignmentNumber?: string;
  comment: string;
  onCommentChange: (comment: string) => void;
  onCancel: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  sourceLocked?: boolean;
  legacyEmployees?: PersonnelEmployee[];
}) {
  const isEditing = assignmentNumber !== undefined;
  const registry = assignmentRegistries[registryId];
  const canLinkBoard = registry.canLinkBoardAssignment && !sourceLocked;
  const [employeeSearch, setEmployeeSearch] = useState("");
  const [board, setBoard] = useState<BoardAssignmentListItem[]>([]);
  function updateInput<Key extends keyof DirectorAssignmentInput>(key: Key, value: DirectorAssignmentInput[Key]) {
    setForm(current => current && { ...current, [key]: value });
  }
  const employeeOptions = employees.filter(employee => !employeeSearch || `${employee.fullName} ${employee.position}`.toLocaleLowerCase("ru-RU").includes(employeeSearch.toLocaleLowerCase("ru-RU")) || employee.id === form?.responsibleId || form?.coExecutorIds.includes(employee.id));
  return <form onSubmit={onSubmit} className="director-assignment-compose" tabIndex={-1}>
      <div className="director-compose-heading"><span className="eyebrow">{isEditing ? `Поручение №${assignmentNumber}` : "Новое поручение"}</span><h3>{isEditing ? "Изменить поручение" : "Что нужно сделать?"}</h3></div>
      <fieldset disabled={saving} className="board-assignment-form-grid director-compose-fields">
        <legend className="sr-only">Содержание поручения</legend>
        <label>Вид документа<select value={form.kind} onChange={event => updateInput("kind", event.currentTarget.value as DirectorAssignmentInput["kind"])}>{["Поручение", "Задача", "Распоряжение", "Приказ"].map(kind => <option key={kind}>{kind}</option>)}</select></label>
        <label>Дата постановки<input type="date" required value={form.assignedOn} onChange={event => updateInput("assignedOn", event.currentTarget.value)} /></label>
        <label className="is-wide">Суть поручения<textarea rows={4} required maxLength={20000} placeholder="Опишите ожидаемый результат" value={form.summary} onChange={event => updateInput("summary", event.currentTarget.value)} /></label>
        {registry.hasProtocol && <>
          <label>Дата заседания<input type="date" value={form.meetingDate ?? ""} onChange={event => updateInput("meetingDate", event.currentTarget.value)} /></label>
          <label>Протокол №<input maxLength={100} value={form.protocolNumber ?? ""} onChange={event => updateInput("protocolNumber", event.currentTarget.value)} /></label>
          <label>Пункт решения<input maxLength={100} value={form.decisionNumber ?? ""} onChange={event => updateInput("decisionNumber", event.currentTarget.value)} /></label>
        </>}
      </fieldset>
      <fieldset disabled={saving} className="board-assignment-form-grid director-compose-fields">
        <legend>Кому поручить</legend>
        <label>Поиск сотрудника<input type="search" placeholder="ФИО или должность" value={employeeSearch} onChange={event => setEmployeeSearch(event.currentTarget.value)} /></label>
        <label>Ответственный<select required value={form.responsibleId} onChange={event => { const value = event.currentTarget.value; setForm(current => current && { ...current, responsibleId: value, coExecutorIds: current.coExecutorIds.filter(id => id !== value) }); }}><option value="">Выберите сотрудника</option>{form.responsibleId && !employees.some(employee => employee.id === form.responsibleId) && <option value={form.responsibleId} disabled>Выберите аккаунт вместо прежнего ответственного</option>}{employeeOptions.filter(employee => employee.canReceive !== false || employee.id === form.responsibleId).map(employee => <option key={employee.id} value={employee.id}>{employee.fullName} — {employee.position}</option>)}</select></label>
        <p className="director-field-hint is-wide">Доступно сотрудников: {employees.length}. Ответственным можно выбрать учётную запись с вкладкой «Поручения» и реестром «{registry.title}»: только он отправляет результат на проверку. Соисполнителем — любую действующую учётную запись.</p>
        {employees.length === 0 && <p className="is-wide" role="status">Список сотрудников пока пуст. Добавьте учётные записи сотрудников.</p>}
        {form.coExecutorIds.filter(id => !employees.some(employee => employee.id === id)).map(id => <div key={id} className="is-wide director-assignment-actions"><span>{legacyEmployees.find(employee => employee.id === id)?.fullName ?? "Прежний соисполнитель"}: нет доступного аккаунта. Удалите участника и при необходимости выберите его аккаунт.</span><button type="button" disabled={saving} onClick={() => setForm(current => current && { ...current, coExecutorIds: current.coExecutorIds.filter(value => value !== id) })}>Убрать прежнего соисполнителя</button></div>)}
        <details className="is-wide director-coexecutors"><summary>Соисполнители{form.coExecutorIds.length ? `: ${form.coExecutorIds.length}` : " (необязательно)"}</summary><div>{employeeOptions.filter(employee => employee.id !== form.responsibleId).map(employee => <label key={employee.id}><input type="checkbox" checked={form.coExecutorIds.includes(employee.id)} onChange={event => { const checked = event.currentTarget.checked; setForm(current => current && { ...current, coExecutorIds: checked ? [...current.coExecutorIds, employee.id] : current.coExecutorIds.filter(id => id !== employee.id) }); }} /><span>{employee.fullName}<small>{employee.position}</small></span></label>)}</div></details>
      </fieldset>
      <fieldset disabled={saving} className="board-assignment-form-grid director-compose-fields">
        <legend>Когда выполнить</legend>
        <label>Повторение<select value={form.recurrence} onChange={event => { const value = event.currentTarget.value as DirectorAssignmentInput["recurrence"]; setForm(current => current && { ...current, recurrence: value, activeTo: value === "once" ? current.activeFrom : current.activeTo }); }}>{Object.entries(recurrences).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        <label>{form.recurrence === "once" ? "Срок исполнения" : "Первое исполнение"}<input type="date" required value={form.activeFrom} onChange={event => { const value = event.currentTarget.value; setForm(current => current && { ...current, activeFrom: value, activeTo: current.recurrence === "once" ? value : current.activeTo }); }} /></label>
        {form.recurrence !== "once" && <label>Окончание периода<input type="date" required min={form.activeFrom} value={form.activeTo} onChange={event => updateInput("activeTo", event.currentTarget.value)} /></label>}
      </fieldset>
      <details className="director-compose-extra"><summary>{canLinkBoard ? "Дополнительные сведения и связь с поручением Совета директоров" : "Дополнительные сведения"}</summary><div className="board-assignment-form-grid">
        {!isEditing && canLinkBoard && <label className="is-wide">Исходное поручение Совета директоров<select value={form.sourceBoardAssignmentId ?? ""} onFocus={() => { if (!board.length) void requestBoardAssignments().then(result => { if (result.status === "ready") setBoard(result.assignments); }); }} onChange={event => { const id = event.currentTarget.value; const source = board.find(item => item.id === id); setForm(current => current && { ...current, sourceBoardAssignmentId: id || null, summary: source?.summary ?? current.summary }); }}><option value="">Без исходного поручения</option>{board.map(item => <option key={item.id} value={item.id}>{item.protocolNumber}, {item.decisionNumber}: {item.summary}</option>)}</select></label>}
        {textFields.filter(([field]) => field !== "summary").map(([field, label]) => <label key={field}>{label}<input disabled={saving} value={form[field]} onChange={event => updateInput(field, event.currentTarget.value)} /></label>)}
      </div></details>
      {isEditing && <label className="director-edit-comment">Причина изменения<textarea required maxLength={4000} value={comment} onChange={event => onCommentChange(event.currentTarget.value)} /></label>}
      <div className="director-assignment-actions"><button className="primary-button" disabled={saving || !employees.length} type="submit">{saving ? <LoadingIndicator variant="button" label="Сохранение" /> : isEditing ? "Сохранить изменения" : "Отправить поручение"}</button><button className="secondary-button" disabled={saving} type="button" onClick={onCancel}>Отмена</button></div>
    </form>;
}

export function PersonnelWorkspace({ onShowToast }: { onShowToast: ShowToast }) {
  const [data, setData] = useState<PersonnelResponse>();
  const [editing, setEditing] = useState<PersonnelEmployee>();
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  async function refresh() { setData(await directorRequest<PersonnelResponse>("/api/personnel")); }
  useEffect(() => { void refresh().catch(e => setError(e.message)); }, []);
  async function save(event: FormEvent) {
    event.preventDefault(); if (!editing) return;
    setSaving(true); setError("");
    try {
      const { id, ...employee } = editing;
      await directorRequest(`/api/personnel${id ? `/${id}` : ""}`, id ? "PATCH" : "POST", employee);
      await refresh(); setEditing(undefined); onShowToast("Сотрудник сохранён", "Изменения сохранены.", "success");
    } catch (e) { setError(e instanceof Error ? e.message : "Не удалось сохранить сотрудника."); }
    finally { setSaving(false); }
  }
  return <section className="workspace-panel"><h2>Сотрудники АУП и ИТР</h2>{error && <p role="alert">{error}</p>}
    {!data ? <LoadingIndicator label="Загрузка сотрудников" /> : <>
      <button disabled={saving} onClick={() => setEditing({ id: "", revision: 0, fullName: "", position: "", department: "", category: "АУП", userId: null, active: true })}>Добавить сотрудника</button>
      {editing && <form className="director-assignment-form" onSubmit={save}>
        {([ ["fullName", "ФИО"], ["position", "Должность"], ["department", "Подразделение"] ] as const).map(([key, label]) => <label key={key}>{label}<input required={key !== "department"} maxLength={300} value={editing[key]} onChange={event => { const value = event.currentTarget.value; setEditing(current => current && { ...current, [key]: value }); }} /></label>)}
        <label>Категория<select value={editing.category} onChange={event => { const value = event.currentTarget.value as PersonnelEmployee["category"]; setEditing(current => current && { ...current, category: value }); }}><option value="">Укажите категорию</option><option>АУП</option><option>ИТР</option></select></label>
        <label>Учётная запись<select value={editing.userId ?? ""} onChange={event => { const value = event.currentTarget.value; setEditing(current => current && { ...current, userId: value || null }); }}><option value="">Не связана</option>{data.users.map(user => <option key={user.id} value={user.id}>{user.displayName} ({user.login})</option>)}</select></label>
        <label><input type="checkbox" checked={editing.active} onChange={event => { const value = event.currentTarget.checked; setEditing(current => current && { ...current, active: value }); }} />Действующий сотрудник</label>
        <button type="submit" disabled={saving}>{saving ? <LoadingIndicator variant="button" label="Сохранение" /> : "Сохранить"}</button><button type="button" disabled={saving} onClick={() => setEditing(undefined)}>Отмена</button>
      </form>}
      <div className="history-table-scroll"><ManagedTable tableId="director.personnel"><thead><tr>{["ФИО", "Должность", "Подразделение", "Категория", "Учётная запись", "Состояние"].map(label => <TableHeader key={label}>{label}</TableHeader>)}</tr></thead><tbody>{data.employees.map(employee => <tr key={employee.id}><TableCell><button disabled={saving} onClick={() => setEditing(employee)}>{employee.fullName}</button></TableCell><TableCell>{employee.position}</TableCell><TableCell>{employee.department}</TableCell><TableCell>{employee.category}</TableCell><TableCell>{data.users.find(user => user.id === employee.userId)?.displayName ?? "Не связана"}</TableCell><TableCell>{employee.active ? "Работает" : "Архив"}</TableCell></tr>)}</tbody></ManagedTable></div>
    </>}
  </section>;
}
