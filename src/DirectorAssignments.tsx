import { useEffect, useState, type FormEvent, type Dispatch, type SetStateAction } from "react";
import type { DirectorAssignment, DirectorAssignmentInput, PersonnelEmployee } from "../server/src/contracts/directorAssignments";
import { directorDocument, directorRequest, type DirectorAssignmentListResponse, type PersonnelResponse } from "./services/directorAssignments";
import { requestBoardAssignments } from "./services/boardAssignments";
import type { BoardAssignmentListItem } from "./contracts/boardAssignments";
import { ManagedTable } from "./ManagedTable";
import { TableCell, TableHeader } from "./TableCell";
import { LoadingIndicator } from "./LoadingIndicator";
import type { ShowToast } from "./services/toastStack";

const statuses = { in_progress: "В работе", under_review: "На проверке", revision_requested: "На доработке", completed: "Завершено" };
const recurrences = { once: "Один раз", daily: "Каждый день", weekly: "Каждую неделю", monthly: "Каждый месяц", yearly: "Каждый год" };
const textFields = [
  ["summary", "Суть поручения"], ["department", "Подразделение"], ["project", "Направление / проект"],
  ["progress", "Промежуточные результаты"], ["urgency", "Срочность"], ["importance", "Важность"], ["note", "Примечание"], ["incomingNumber", "Номер входящего"],
] as const;
const columns = ["number", "assignedOn", "summary", "department", "project", "responsible", "coExecutors", "deadline", "urgency", "importance", "progress", "completedOn", "note", "status", "incomingNumber", "durationWorkdays", "remainingWorkdays", "postponedUntil"] as const;
const columnLabels = ["Номер", "Дата постановки", "Суть поручения", "Подразделение", "Проект", "Ответственный", "Соисполнители", "Срок", "Срочность", "Важность", "Промежуточные результаты", "Дата исполнения", "Примечание", "Статус", "Номер входящего", "Длительность, рабочих дней", "Осталось рабочих дней", "Перенос срока"];
function values(row: DirectorAssignment) {
  return [row.number, row.assignedOn, row.summary, row.department, row.project, row.responsible?.fullName ?? row.source?.values[5] ?? "", row.source && row.revision === 1 ? row.source.values[6] ?? "" : row.coExecutors.map(e => e.fullName).join(", "), row.currentOccurrenceDate, row.urgency, row.importance, row.progress, row.completedOn, row.note, `${statuses[row.status]}${row.needsClarification ? " · Требует уточнения" : ""}`, row.incomingNumber, String(row.durationWorkdays ?? ""), String(row.remainingWorkdays ?? ""), row.postponedUntil];
}
export function createDirectorAssignmentInput(today: string): DirectorAssignmentInput {
  return { assignedOn: today, kind: "Поручение", summary: "", department: "", project: "", responsibleId: "", coExecutorIds: [], recurrence: "once", activeFrom: today, activeTo: today, urgency: "", importance: "", note: "", progress: "", incomingNumber: "", sourceBoardAssignmentId: null };
}
function inputFrom(row: DirectorAssignment, employees: PersonnelEmployee[]): DirectorAssignmentInput {
  const input = Object.fromEntries(Object.keys(createDirectorAssignmentInput("")).map(key => [key, row[key as keyof DirectorAssignmentInput]])) as DirectorAssignmentInput;
  const resolveId = (id: string, snapshot?: PersonnelEmployee | null) => {
    if (employees.some(employee => employee.id === id)) return id;
    const userId = id.startsWith("account:") ? id.slice(8) : snapshot?.userId;
    return employees.find(employee => userId && employee.userId === userId)?.id ?? id;
  };
  return { ...input, responsibleId: resolveId(input.responsibleId, row.responsible), coExecutorIds: [...new Set(input.coExecutorIds.map(id => resolveId(id, row.coExecutors.find(employee => employee.id === id))))] };
}

export function DirectorAssignmentsWorkspace({ onShowToast }: { onShowToast: ShowToast }) {
  const [data, setData] = useState<DirectorAssignmentListResponse>();
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState<DirectorAssignment>();
  const [form, setForm] = useState<DirectorAssignmentInput>();
  const [comment, setComment] = useState("");
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [history, setHistory] = useState<Array<{ id: string; assignment: DirectorAssignment }> | null>(null);
  const [showAllColumns, setShowAllColumns] = useState(false);
  async function refresh() { setData(await directorRequest<DirectorAssignmentListResponse>("/api/director-assignments")); }
  useEffect(() => {
    const abort = new AbortController();
    void directorRequest<DirectorAssignmentListResponse>("/api/director-assignments", "GET", undefined, abort.signal).then(next => { setData(next); if (next.permissions.canManage) setForm(createDirectorAssignmentInput(next.today)); }).catch(e => { if (!abort.signal.aborted) setError(e.message); });
    return () => abort.abort();
  }, []);
  async function mutate(operation: () => Promise<unknown>) {
    setSaving(true); setError("");
    try { await operation(); await refresh(); setSelected(undefined); setForm(undefined); setComment(""); onShowToast("Поручение сохранено", "Изменения сохранены.", "success"); }
    catch (e) { setError(e instanceof Error ? e.message : "Не удалось сохранить поручение."); }
    finally { setSaving(false); }
  }
  function save(event: FormEvent) {
    event.preventDefault();
    if (form) void mutate(() => directorRequest(`/api/director-assignments${selected ? `/${selected.id}` : ""}`, selected ? "PATCH" : "POST", { assignment: form, revision: selected?.revision, comment: selected ? comment : "Поручение создано." }));
  }
  async function openHistory() {
    setError("");
    try { setHistory((await directorRequest<{ completions: Array<{ id: string; assignment: DirectorAssignment }> }>("/api/director-assignments/completions")).completions); }
    catch (e) { setError(e instanceof Error ? e.message : "Не удалось загрузить историю."); }
  }
  if (!data) return <section className="workspace-panel">{error ? <p role="alert">{error}</p> : <LoadingIndicator label="Загрузка поручений" />}</section>;
  const rows = history ? history.map(item => item.assignment) : data.assignments;
  const visible = rows.filter(row => values(row).join(" ").toLocaleLowerCase("ru-RU").includes((filters.query ?? "").toLocaleLowerCase("ru-RU")) && values(row).every((value, i) => value.toLocaleLowerCase("ru-RU").includes((filters[columns[i]] ?? "").toLocaleLowerCase("ru-RU"))));
  const visibleColumns = showAllColumns ? [...columns] : (["number", "summary", "responsible", "deadline", "status", "progress"] as const);
  return <section className="board-assignments-workspace director-assignments">
    <header className="director-assignment-heading"><div><span className="eyebrow">{data.permissions.canManage ? "Отправка и контроль" : "Получение и выполнение"}</span><h2>Поручения генерального директора</h2><p>{data.permissions.canManage ? "Поставьте задачу сотруднику, укажите срок и примите результат исполнения." : "Ваши активные поручения. Сохраняйте промежуточные результаты и отправляйте готовую работу на проверку."}</p></div></header>
    {error && <p role="alert">{error}</p>}
    {data.permissions.canManage && <div className="form-actions director-assignment-actions">
      <button className="primary-button" type="button" disabled={saving} onClick={() => { setSelected(undefined); setForm(createDirectorAssignmentInput(data.today)); setComment(""); setHistory(null); }}>Создать поручение</button>
      <button type="button" onClick={() => { setHistory(null); setSelected(undefined); setForm(undefined); }}>Текущие поручения</button>
      <button type="button" onClick={() => { setSelected(undefined); setForm(undefined); void openHistory(); }}>История исполнений</button>
    </div>}
    {form && <DirectorAssignmentForm form={form} setForm={setForm} employees={data.employees} saving={saving} assignmentNumber={selected?.number} comment={comment} onCommentChange={setComment} onSubmit={save} onCancel={() => { setForm(undefined); setSelected(undefined); }} />}
    {selected && !form && <section className="director-assignment-detail">
      <h3>№{selected.number}: {selected.summary}</h3>
      <dl>{values(selected).map((value, index) => <div key={columns[index]}><dt>{columnLabels[index]}</dt><dd>{value || "—"}</dd></div>)}</dl>
      {selected.source && <details><summary>Исходная запись Google Sheets</summary><dl>{selected.source.values.map((value, index) => <div key={index}><dt>{["Номер задачи", "Дата постановки", "Суть задачи", "Подразделение", "Проект", "Ответственный", "Соисполнители", "Исходный срок", "Срочность", "Важность", "Промежуточные этапы", "Фактическая дата", "Примечание", "Исходный статус", "Номер входящего", "Второй номер", "Длительность", "Осталось рабочих дней", "Перенос срока"][index] ?? "Исходное поле"}</dt><dd>{value || "—"}</dd></div>)}</dl></details>}
      <h4>Комментарии</h4>{selected.comments.map(item => <p key={item.id}>{item.createdAt} · {item.author}: {item.text}</p>)}
      <h4>Документы</h4>{selected.documents.map(document => <div key={document.id}>
        <button disabled={saving} onClick={() => { void directorDocument(selected.id, document.id).then(blob => { if (blob) { const url = URL.createObjectURL(blob); const link = window.document.createElement("a"); link.href = url; link.download = document.fileName; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); } }).catch(e => setError(e.message)); }}>{document.fileName}</button>
        {!history && data.permissions.canManage && selected.status !== "completed" && <button disabled={saving} onClick={() => void mutate(() => directorRequest(`/api/director-assignments/${selected.id}/documents/${document.id}`, "DELETE"))}>Убрать документ</button>}
      </div>)}
      {!history && data.permissions.canManage && selected.status !== "completed" && <label>Прикрепить PDF (до пяти файлов, каждый до 10 МБ)<input type="file" accept="application/pdf,.pdf" disabled={saving || selected.documents.length >= 5} onChange={event => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ""; if (file) void mutate(() => directorDocument(selected.id, file)); }} /></label>}
      {!history && selected.status !== "completed" && <>
        {data.permissions.canManage && <button disabled={saving} onClick={() => { setForm(inputFrom(selected, data.employees)); setComment(""); }}>Редактировать</button>}
        <label>Комментарий<textarea maxLength={4000} value={comment} onChange={event => setComment(event.currentTarget.value)} /></label>
        {!data.permissions.canManage && <button disabled={saving || !comment.trim()} onClick={() => void mutate(() => directorRequest(`/api/director-assignments/${selected.id}/action`, "POST", { action: "record_progress", comment, revision: selected.revision }))}>Сохранить промежуточный результат</button>}
        {(data.permissions.canManage ? selected.status === "under_review" ? [["complete", "Принять исполнение"], ["return_for_revision", "Вернуть на доработку"]] : [] : [["submit_for_review", "Отправить на проверку"]]).map(([action, label]) => <button key={action} disabled={saving || !comment.trim()} onClick={() => void mutate(() => directorRequest(`/api/director-assignments/${selected.id}/action`, "POST", { action, comment, revision: selected.revision }))}>{label}</button>)}
      </>}
      <button disabled={saving} onClick={() => setSelected(undefined)}>Закрыть</button>
    </section>}
    <section className="director-register"><div className="director-register-heading"><h3>{history ? "История исполнений" : data.permissions.canManage ? "Отправленные поручения" : "Мои поручения"}</h3><span>Найдено: {visible.length}</span></div>
    <div className="director-assignment-filters board-assignment-filters">
      <label>Поиск<input type="search" placeholder="Номер, содержание или сотрудник" value={filters.query ?? ""} onChange={event => { const value = event.currentTarget.value; setFilters(current => ({ ...current, query: value })); }} /></label>
      <label>Статус<select value={filters.status ?? ""} onChange={event => { const value = event.currentTarget.value; setFilters(current => ({ ...current, status: value })); }}><option value="">Все статусы</option>{Object.values(statuses).map(status => <option key={status}>{status}</option>)}<option>Требует уточнения</option></select></label>
      <button className="secondary-button" type="button" onClick={() => setFilters({})}>Сбросить</button>
    </div>
    <details className="director-more-filters"><summary>Дополнительные фильтры</summary><div className="director-assignment-filters board-assignment-filters">{columns.filter(column => column !== "status").map(column => <label key={column}>{columnLabels[columns.indexOf(column)]}<input value={filters[column] ?? ""} onChange={event => { const value = event.currentTarget.value; setFilters(current => ({ ...current, [column]: value })); }} /></label>)}</div></details>
    <label className="director-columns-toggle"><input type="checkbox" checked={showAllColumns} onChange={event => setShowAllColumns(event.currentTarget.checked)} />Все колонки реестра</label>
    {visible.length === 0 ? <p className="director-empty">{rows.length ? "По выбранным фильтрам поручений нет." : data.permissions.canManage ? "Здесь появятся отправленные поручения и результаты их исполнения." : "Активных поручений пока нет."}</p> : <div className="history-table-scroll"><ManagedTable tableId="director.assignments" columns={visibleColumns}><thead><tr>{visibleColumns.map(column => <TableHeader key={column}>{columnLabels[columns.indexOf(column)]}</TableHeader>)}</tr></thead><tbody>{visible.map((row, index) => <tr key={`${row.id}-${index}`} className={!history && ["in_progress", "revision_requested"].includes(row.status) && row.currentOccurrenceDate < data.today ? "director-assignment-overdue" : undefined}>{visibleColumns.map(column => { const value = values(row)[columns.indexOf(column)]; return <TableCell key={column}>{column === "summary" ? <button type="button" disabled={saving} className="table-text-action" onClick={() => { setSelected(row); setForm(undefined); setComment(""); }}>{value}</button> : value || "—"}</TableCell>; })}</tr>)}</tbody></ManagedTable></div>}
    </section>
  </section>;
}

export function DirectorAssignmentForm({ form, setForm, employees, saving, assignmentNumber, comment, onCommentChange, onCancel, onSubmit, sourceLocked = false }: {
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
}) {
  const isEditing = assignmentNumber !== undefined;
  const [employeeSearch, setEmployeeSearch] = useState("");
  const [board, setBoard] = useState<BoardAssignmentListItem[]>([]);
  function updateInput<Key extends keyof DirectorAssignmentInput>(key: Key, value: DirectorAssignmentInput[Key]) {
    setForm(current => current && { ...current, [key]: value });
  }
  const employeeOptions = employees.filter(employee => !employeeSearch || `${employee.fullName} ${employee.position}`.toLocaleLowerCase("ru-RU").includes(employeeSearch.toLocaleLowerCase("ru-RU")) || employee.id === form?.responsibleId || form?.coExecutorIds.includes(employee.id));
  return <form onSubmit={onSubmit} className="director-assignment-compose">
      <div className="director-compose-heading"><span className="eyebrow">{isEditing ? `Поручение №${assignmentNumber}` : "Новое поручение"}</span><h3>{isEditing ? "Изменить поручение" : "Что нужно сделать?"}</h3></div>
      <fieldset disabled={saving} className="board-assignment-form-grid director-compose-fields">
        <legend className="sr-only">Содержание поручения</legend>
        <label>Вид документа<select value={form.kind} onChange={event => updateInput("kind", event.currentTarget.value as DirectorAssignmentInput["kind"])}>{["Поручение", "Задача", "Распоряжение", "Приказ"].map(kind => <option key={kind}>{kind}</option>)}</select></label>
        <label>Дата постановки<input type="date" required value={form.assignedOn} onChange={event => updateInput("assignedOn", event.currentTarget.value)} /></label>
        <label className="is-wide">Суть поручения<textarea rows={4} required maxLength={20000} placeholder="Опишите ожидаемый результат" value={form.summary} onChange={event => updateInput("summary", event.currentTarget.value)} /></label>
      </fieldset>
      <fieldset disabled={saving} className="board-assignment-form-grid director-compose-fields">
        <legend>Кому поручить</legend>
        <label>Поиск сотрудника<input type="search" placeholder="ФИО или должность" value={employeeSearch} onChange={event => setEmployeeSearch(event.currentTarget.value)} /></label>
        <label>Ответственный<select required value={form.responsibleId} onChange={event => { const value = event.currentTarget.value; setForm(current => current && { ...current, responsibleId: value, coExecutorIds: current.coExecutorIds.filter(id => id !== value) }); }}><option value="">Выберите сотрудника</option>{employeeOptions.map(employee => <option key={employee.id} value={employee.id}>{employee.fullName} — {employee.position}</option>)}</select></label>
        <p className="director-field-hint is-wide">Доступно сотрудников: {employees.length}. Учётные записи и кадровый справочник объединены в один список.</p>
        {employees.length === 0 && <p className="is-wide" role="status">Список сотрудников пока пуст. Добавьте учётные записи или записи в кадровый справочник.</p>}
        <details className="is-wide director-coexecutors"><summary>Соисполнители{form.coExecutorIds.length ? `: ${form.coExecutorIds.length}` : " (необязательно)"}</summary><div>{employeeOptions.filter(employee => employee.id !== form.responsibleId).map(employee => <label key={employee.id}><input type="checkbox" checked={form.coExecutorIds.includes(employee.id)} onChange={event => { const checked = event.currentTarget.checked; setForm(current => current && { ...current, coExecutorIds: checked ? [...current.coExecutorIds, employee.id] : current.coExecutorIds.filter(id => id !== employee.id) }); }} /><span>{employee.fullName}<small>{employee.position}</small></span></label>)}</div></details>
      </fieldset>
      <fieldset disabled={saving} className="board-assignment-form-grid director-compose-fields">
        <legend>Когда выполнить</legend>
        <label>Повторение<select value={form.recurrence} onChange={event => { const value = event.currentTarget.value as DirectorAssignmentInput["recurrence"]; setForm(current => current && { ...current, recurrence: value, activeTo: value === "once" ? current.activeFrom : current.activeTo }); }}>{Object.entries(recurrences).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        <label>{form.recurrence === "once" ? "Срок исполнения" : "Первое исполнение"}<input type="date" required value={form.activeFrom} onChange={event => { const value = event.currentTarget.value; setForm(current => current && { ...current, activeFrom: value, activeTo: current.recurrence === "once" ? value : current.activeTo }); }} /></label>
        {form.recurrence !== "once" && <label>Окончание периода<input type="date" required min={form.activeFrom} value={form.activeTo} onChange={event => updateInput("activeTo", event.currentTarget.value)} /></label>}
      </fieldset>
      <details className="director-compose-extra"><summary>{sourceLocked ? "Дополнительные сведения" : "Дополнительные сведения и связь с поручением Совета директоров"}</summary><div className="board-assignment-form-grid">
        {!isEditing && !sourceLocked && <label className="is-wide">Исходное поручение Совета директоров<select value={form.sourceBoardAssignmentId ?? ""} onFocus={() => { if (!board.length) void requestBoardAssignments().then(result => { if (result.status === "ready") setBoard(result.assignments); }); }} onChange={event => { const id = event.currentTarget.value; const source = board.find(item => item.id === id); setForm(current => current && { ...current, sourceBoardAssignmentId: id || null, summary: source?.summary ?? current.summary }); }}><option value="">Без исходного поручения</option>{board.map(item => <option key={item.id} value={item.id}>{item.protocolNumber}, {item.decisionNumber}: {item.summary}</option>)}</select></label>}
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
