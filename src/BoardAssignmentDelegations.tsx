import { Fragment, useEffect, useState, type FormEvent } from "react";
import type { BoardAssignment } from "./contracts/boardAssignments";
import type { BoardAssignmentDelegationsResponse, DirectorAssignmentInput } from "../server/src/contracts/directorAssignments";
import { createDirectorAssignmentInput, DirectorAssignmentForm } from "./DirectorAssignments";
import { directorRequest } from "./services/directorAssignments";
import type { ShowToast } from "./services/toastStack";
import { ManagedTable } from "./ManagedTable";
import { TableCell, TableHeader } from "./TableCell";
import { LoadingIndicator } from "./LoadingIndicator";

const statusLabels = { in_progress: "В работе", under_review: "Готово, на проверке", revision_requested: "На доработке", completed: "Завершено" };
const formatDate = (value: string) => value ? new Date(value).toLocaleDateString("ru-RU", { timeZone: "Europe/Moscow" }) : "—";
const formatTime = (value: string) => new Date(value).toLocaleString("ru-RU", { timeZone: "Europe/Moscow" });

export function BoardAssignmentDelegations({ assignment, onShowToast, onBusyChange, readOnly = false, isParentSaving = false }: {
  readOnly?: boolean;
  isParentSaving?: boolean;
  assignment: BoardAssignment;
  onShowToast: ShowToast;
  onBusyChange: (busy: boolean) => void;
}) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [data, setData] = useState<BoardAssignmentDelegationsResponse>();
  const [form, setForm] = useState<DirectorAssignmentInput>();
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const blocked = saving || isParentSaving;
  const path = `/api/board-assignments/${encodeURIComponent(assignment.id)}/delegations`;

  useEffect(() => {
    const controller = new AbortController();
    void directorRequest<BoardAssignmentDelegationsResponse>(path, "GET", undefined, controller.signal)
      .then(setData).catch(() => { if (!controller.signal.aborted) setError("Не удалось загрузить историю перепоручений."); });
    return () => controller.abort();
  }, [path]);

  async function refresh() {
    setLoading(true); setError("");
    try { setData(await directorRequest<BoardAssignmentDelegationsResponse>(path)); }
    catch { setError("Не удалось обновить историю перепоручений."); }
    finally { setLoading(false); }
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form || blocked || readOnly) return;
    setSaving(true); onBusyChange(true); setError("");
    try {
      await directorRequest("/api/director-assignments", "POST", {
        assignment: { ...form, sourceBoardAssignmentId: assignment.id },
        comment: `Назначено на основе поручения СД: протокол ${assignment.protocolNumber}, пункт ${assignment.decisionNumber}.`,
      });
      setForm(undefined);
      onShowToast("Поручение назначено", "Создано отдельное поручение сотруднику.", "success");
      await refresh();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Не удалось назначить поручение.");
    } finally { setSaving(false); onBusyChange(false); }
  }
  function startAssignment() {
    if (!data?.canAssign || blocked || readOnly) return;
    setForm({ ...createDirectorAssignmentInput(data.today), summary: assignment.details || assignment.summary,
      activeFrom: assignment.currentOccurrenceDate, activeTo: assignment.currentOccurrenceDate,
      sourceBoardAssignmentId: assignment.id,
    });
  }

  return <section className="board-delegations" aria-label="Перепоручения сотрудникам">
    <div className="director-register-heading">
      <h3>{readOnly ? "Перепоручения — текущее состояние" : "Перепоручения сотрудникам"}</h3>
      <div className="director-assignment-actions">
        {!readOnly && data?.canAssign && !form && <button type="button" className="primary-button" disabled={blocked || loading} onClick={startAssignment}>Назначить поручение</button>}
        <button type="button" className="secondary-button" disabled={blocked || loading} onClick={() => void refresh()}>Обновить историю</button>
      </div>
    </div>
    {readOnly && <p className="director-field-hint">Состояние назначений обновляется отдельно от неизменяемого снимка поручения СД.</p>}
    {error && <p role="alert" className="form-message is-error">{error}</p>}
    {(!data && !error) || loading ? <LoadingIndicator variant="inline" label="Загрузка перепоручений" /> : null}
    {!readOnly && form && data && <DirectorAssignmentForm form={form} setForm={setForm} employees={data.employees} saving={blocked} comment="" onCommentChange={() => {}} sourceLocked onSubmit={save} onCancel={() => { if (!blocked) setForm(undefined); }} />}
    {data && (data.assignments.length === 0 ? <p className="director-empty">На основе этого поручения ещё нет назначений сотрудникам.</p> :
      <div className="history-table-scroll"><ManagedTable tableId="board.delegations">
        <thead><tr>{["Назначено", "Поручение", "Исполнители", "Срок", "Готовность", "История"].map(label => <TableHeader key={label}>{label}</TableHeader>)}</tr></thead>
        <tbody>{data.assignments.map(item => <Fragment key={item.id}><tr>
          <TableCell>{formatTime(item.createdAt)}</TableCell>
          <TableCell>№{item.number}. {item.summary}</TableCell>
          <TableCell>{item.responsible?.fullName ?? "Не указан"}{item.coExecutors.length > 0 && <span> · Соисполнители: {item.coExecutors.map(employee => employee.fullName).join(", ")}</span>}</TableCell>
          <TableCell>{formatDate(item.currentOccurrenceDate)}</TableCell>
          <TableCell>{statusLabels[item.status]}</TableCell>
          <TableCell><button type="button" className="secondary-button" aria-expanded={!!expanded[item.id]} aria-controls={`delegation-events-${item.id}`} onClick={() => setExpanded(current => ({ ...current, [item.id]: !current[item.id] }))}>События: {item.comments.length}</button></TableCell>
        </tr>
        {expanded[item.id] && <tr className="board-delegation-history-row"><TableCell colSpan={6}><section id={`delegation-events-${item.id}`} aria-label={`История поручения ${item.number}`}><ol className="board-delegation-events">{[...item.comments].reverse().sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(comment => <li key={comment.id}>
            <strong>{comment.id === item.comments[0]?.id ? "Назначено" : statusLabels[comment.status]}</strong>
            <span>{formatTime(comment.createdAt)} · {comment.author}</span>
            <span>Ответственный: {comment.responsibleDisplayName}</span>
            <p>{comment.text}</p>
          </li>)}</ol></section></TableCell></tr>}
        </Fragment>)}</tbody>
      </ManagedTable></div>)}
  </section>;
}
