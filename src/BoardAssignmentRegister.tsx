import { ManagedTable } from "./ManagedTable";
import { TableCell, TableHeader } from "./TableCell";
import type { BoardAssignmentCompletionSummary, BoardAssignmentListItem, BoardAssignmentSummary } from "./contracts/boardAssignments";

export const boardRegisterLabels = {
  meetingDate: "Дата заседания", description: "Суть поручения", coExecutors: "Соисполнители", deadline: "Срок", status: "Статус",
  protocolNumber: "Протокол", decisionNumber: "Пункт решения", recurrence: "Повторение", activeFrom: "Начало периода", activeTo: "Конец периода", createdBy: "Автор", updatedAt: "Изменено",
  acceptedAt: "Принято", completedAt: "Дата исполнения", acceptedBy: "Принял",
};
export type BoardRegisterColumn = keyof typeof boardRegisterLabels;
const compactColumns = ["meetingDate", "description", "coExecutors", "deadline", "status"] as const;
const fullColumns = [...compactColumns, "protocolNumber", "decisionNumber", "recurrence", "activeFrom", "activeTo", "createdBy", "updatedAt"] as const;
const historyColumns = [...fullColumns, "acceptedAt", "completedAt", "acceptedBy"] as const;
const recurrences = { once: "Один раз", daily: "Каждый день", weekly: "Каждую неделю", monthly: "Каждый месяц", yearly: "Каждый год" };
const statuses = { in_progress: "В работе", under_review: "На проверке", revision_requested: "На доработке", completed: "Завершено" };
const date = (value: string) => value ? value.slice(0, 10).split("-").reverse().join(".") : "";
const timestamp = (value: string) => value ? new Date(value).toLocaleString("ru-RU") : "";
export function boardRegisterValues(row: BoardAssignmentSummary, completion?: BoardAssignmentCompletionSummary) {
  return {
    meetingDate: date(row.meetingDate), description: row.summary, coExecutors: row.coExecutors.join(", "), deadline: date(row.currentOccurrenceDate),
    status: "isOverdue" in row && row.isOverdue ? "Просрочено" : statuses[row.status], protocolNumber: row.protocolNumber, decisionNumber: row.decisionNumber,
    recurrence: recurrences[row.recurrence], activeFrom: date(row.activeFrom), activeTo: date(row.activeTo), createdBy: row.createdByDisplayName, updatedAt: timestamp(row.updatedAt),
    acceptedAt: timestamp(completion?.completedAt ?? ""), completedAt: date(completion?.occurrenceDate ?? ""), acceptedBy: completion?.completedByDisplayName ?? "",
  };
}
export function matchesBoardColumnFilters(row: BoardAssignmentSummary, filters: Partial<Record<BoardRegisterColumn, string>>, completion?: BoardAssignmentCompletionSummary) {
  const values = boardRegisterValues(row, completion);
  return (Object.keys(filters) as BoardRegisterColumn[]).every(key => values[key].toLocaleLowerCase("ru-RU").includes((filters[key] ?? "").toLocaleLowerCase("ru-RU")));
}
export function BoardAssignmentRegister({ assignments = [], completions, allColumns, loading, execute, onOpen }: {
  assignments?: BoardAssignmentListItem[]; completions?: BoardAssignmentCompletionSummary[]; allColumns: boolean; loading: boolean; execute: boolean; onOpen: (id: string) => void;
}) {
  const liveColumns = allColumns ? fullColumns : compactColumns;
  const completedColumns = allColumns ? historyColumns : [...compactColumns, "acceptedAt"] as const;
  const columns = completions ? completedColumns : liveColumns;
  const rows = completions ? completions.map(item => ({ id: item.id, assignment: item.assignment, completion: item })) : assignments.map(assignment => ({ id: assignment.id, assignment, completion: undefined }));
  const content = <><thead><tr>{columns.map(column => <TableHeader key={column}>{boardRegisterLabels[column]}</TableHeader>)}</tr></thead>
    <tbody>{rows.map(({ id, assignment, completion }) => {
      const values = boardRegisterValues(assignment, completion);
      return <tr key={id} className={values.status === "Просрочено" ? "is-overdue" : undefined}>{columns.map(column => <TableCell key={column}>
        {column === "description" ? <><button className="board-assignment-link" type="button" onClick={() => onOpen(id)}>{values.description}</button><small>Протокол №{assignment.protocolNumber}, пункт {assignment.decisionNumber}</small></>
          : column === "status" ? <><span className={`board-assignment-status is-${assignment.status}${values.status === "Просрочено" ? " is-overdue" : ""}`}>{values.status}</span>{execute && !completion && <button className="secondary-button board-assignment-execute-button" type="button" onClick={() => onOpen(id)}>Открыть и отчитаться</button>}</>
          : values[column] || "—"}
      </TableCell>)}</tr>;
    })}{!loading && !rows.length && <tr><TableCell className="board-assignment-empty" colSpan={columns.length}>По выбранным фильтрам поручений нет.</TableCell></tr>}</tbody></>;
  return completions
    ? <ManagedTable tableId="board.history" columns={completedColumns} className="board-assignment-table board-assignment-history-table">{content}</ManagedTable>
    : <ManagedTable tableId="board.assignments" columns={liveColumns} className="board-assignment-table">{content}</ManagedTable>;
}
