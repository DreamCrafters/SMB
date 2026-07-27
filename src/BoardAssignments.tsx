import {
  useEffect,
  useState,
  type FormEvent,
} from "react";
import {
  boardAssignmentActions,
  boardAssignmentRecurrences,
  boardAssignmentStatuses,
  type BoardAssignment,
  type BoardAssignmentCompletion,
  type BoardAssignmentCompletionSummary,
  type BoardAssignmentCreateInput,
  type BoardAssignmentFilters,
  type BoardAssignmentPermissions,
  type BoardAssignmentRecurrence,
  type BoardAssignmentStatus,
  type BoardAssignmentSummary,
  type BoardAssignmentUpdateInput,
} from "./contracts";
import {
  applyBoardAssignmentAction,
  createBoardAssignment,
  requestBoardAssignment,
  requestBoardAssignmentCompletion,
  requestBoardAssignmentCompletions,
  requestBoardAssignmentMaterial,
  requestBoardAssignments,
  updateBoardAssignment,
} from "./services/boardAssignments";
import { LoadingIndicator } from "./LoadingIndicator";

const statusLabels: Record<BoardAssignmentStatus, string> = {
  in_progress: "В работе",
  under_review: "На проверке",
  revision_requested: "На доработке",
  completed: "Завершено",
};

const recurrenceLabels: Record<BoardAssignmentRecurrence, string> = {
  daily: "Каждый день",
  weekly: "Каждую неделю",
  monthly: "Каждый месяц",
  yearly: "Каждый год",
  once: "Один раз",
};

type BoardAssignmentAccessMode = "view" | "create" | "execute" | "review";

const emptyPermissions: BoardAssignmentPermissions = {
  canView: true,
  canCreate: false,
  canExecute: false,
  canReview: false,
};

const emptyCreateInput: BoardAssignmentCreateInput = {
  meetingDate: "",
  protocolNumber: "",
  decisionNumber: "",
  summary: "",
  details: "",
  coExecutors: [],
  recurrence: "once",
  activeFrom: "",
  activeTo: "",
};

type ListState =
  | { status: "loading"; assignments: BoardAssignmentSummary[] }
  | { status: "ready"; assignments: BoardAssignmentSummary[] }
  | { status: "error"; assignments: BoardAssignmentSummary[]; message: string };

type DetailState =
  | { status: "loading" }
  | { status: "ready"; assignment: BoardAssignment }
  | { status: "error"; message: string };

type CompletionListState =
  | { status: "loading"; completions: BoardAssignmentCompletionSummary[] }
  | { status: "ready"; completions: BoardAssignmentCompletionSummary[] }
  | {
      status: "error";
      completions: BoardAssignmentCompletionSummary[];
      message: string;
    };

type CompletionDetailState =
  | { status: "loading" }
  | { status: "ready"; completion: BoardAssignmentCompletion }
  | { status: "error"; message: string };

export function BoardAssignmentsWorkspace({
  isAdminPreviewMode,
  onShowToast,
}: {
  isAdminPreviewMode: boolean;
  onShowToast: (title: string, message: string) => void;
}) {
  const [filters, setFilters] = useState<BoardAssignmentFilters>({});
  const [registerMode, setRegisterMode] = useState<"live" | "history">("live");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<BoardAssignmentStatus | "">("");
  const [meetingDateFrom, setMeetingDateFrom] = useState("");
  const [meetingDateTo, setMeetingDateTo] = useState("");
  const [listVersion, setListVersion] = useState(0);
  const [listState, setListState] = useState<ListState>({
    status: "loading",
    assignments: [],
  });
  const [permissions, setPermissions] = useState(emptyPermissions);
  const [selectedId, setSelectedId] = useState<string>();
  const [detailState, setDetailState] = useState<DetailState>();
  const [completionListState, setCompletionListState] =
    useState<CompletionListState>({
      status: "loading",
      completions: [],
    });
  const [selectedCompletionId, setSelectedCompletionId] = useState<string>();
  const [completionDetailState, setCompletionDetailState] =
    useState<CompletionDetailState>();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [createInput, setCreateInput] = useState(emptyCreateInput);
  const [coExecutorsText, setCoExecutorsText] = useState("");
  const [createComment, setCreateComment] = useState("");
  const [editInput, setEditInput] =
    useState<BoardAssignmentCreateInput>(emptyCreateInput);
  const [editCoExecutorsText, setEditCoExecutorsText] = useState("");
  const [editComment, setEditComment] = useState("");
  const [actionComment, setActionComment] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isMaterialOpening, setIsMaterialOpening] = useState(false);
  const [formMessage, setFormMessage] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    setListState((current) => ({
      status: "loading",
      assignments: current.assignments,
    }));
    void requestBoardAssignments(filters, { signal: controller.signal }).then(
      (result) => {
        if (controller.signal.aborted) return;
        if (result.status === "error") {
          setListState((current) => ({
            status: "error",
            assignments: current.assignments,
            message: result.message,
          }));
          return;
        }

        setPermissions(result.permissions);
        setListState({
          status: "ready",
          assignments: result.assignments,
        });
      },
    );

    return () => controller.abort();
  }, [filters, listVersion]);

  useEffect(() => {
    if (registerMode !== "history") return;

    const controller = new AbortController();
    setCompletionListState((current) => ({
      status: "loading",
      completions: current.completions,
    }));
    const { status: _status, ...historyFilters } = filters;
    void requestBoardAssignmentCompletions(historyFilters, {
      signal: controller.signal,
    }).then((result) => {
      if (controller.signal.aborted) return;
      if (result.status === "error") {
        setCompletionListState((current) => ({
          status: "error",
          completions: current.completions,
          message: result.message,
        }));
        return;
      }

      setPermissions(result.permissions);
      setCompletionListState({
        status: "ready",
        completions: result.completions,
      });
    });

    return () => controller.abort();
  }, [filters, listVersion, registerMode]);

  useEffect(() => {
    if (selectedId === undefined) {
      setDetailState(undefined);
      return;
    }

    const controller = new AbortController();
    setDetailState({ status: "loading" });
    void requestBoardAssignment(selectedId, {
      signal: controller.signal,
    }).then((result) => {
      if (controller.signal.aborted) return;
      if (result.status === "error") {
        setDetailState({ status: "error", message: result.message });
        return;
      }

      setPermissions(result.permissions);
      setDetailState({ status: "ready", assignment: result.assignment });
      setActionComment("");
      setFormMessage("");
    });

    return () => controller.abort();
  }, [selectedId]);

  useEffect(() => {
    if (selectedCompletionId === undefined) {
      setCompletionDetailState(undefined);
      return;
    }

    const controller = new AbortController();
    setCompletionDetailState({ status: "loading" });
    void requestBoardAssignmentCompletion(selectedCompletionId, {
      signal: controller.signal,
    }).then((result) => {
      if (controller.signal.aborted) return;
      if (result.status === "error") {
        setCompletionDetailState({
          status: "error",
          message: result.message,
        });
        return;
      }

      setPermissions(result.permissions);
      setCompletionDetailState({
        status: "ready",
        completion: result.completion,
      });
    });

    return () => controller.abort();
  }, [selectedCompletionId]);

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFilters({
      ...(query.trim() === "" ? {} : { query: query.trim() }),
      ...(status === "" ? {} : { status }),
      ...(meetingDateFrom === "" ? {} : { meetingDateFrom }),
      ...(meetingDateTo === "" ? {} : { meetingDateTo }),
    });
  }

  function resetFilters() {
    setQuery("");
    setStatus("");
    setMeetingDateFrom("");
    setMeetingDateTo("");
    setFilters({});
  }

  async function saveAssignment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isAdminPreviewMode || isSaving) return;

    setIsSaving(true);
    setFormMessage("");
    const result = await createBoardAssignment({
      ...createInput,
      coExecutors: coExecutorsText
        .split(/[,\n;]/u)
        .map((value) => value.trim())
        .filter((value) => value.length > 0),
      ...(createComment.trim() === ""
        ? {}
        : { comment: createComment.trim() }),
    });
    setIsSaving(false);

    if (result.status === "error") {
      setFormMessage(result.message);
      return;
    }

    setIsCreateOpen(false);
    setCreateInput(emptyCreateInput);
    setCoExecutorsText("");
    setCreateComment("");
    setListVersion((current) => current + 1);
    setSelectedId(result.assignment.id);
    onShowToast(
      "Поручение добавлено",
      "Новое поручение появилось в общем реестре.",
    );
  }

  async function saveEditedAssignment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      isAdminPreviewMode ||
      isSaving ||
      detailState?.status !== "ready"
    ) {
      return;
    }

    const request: BoardAssignmentUpdateInput = {
      ...editInput,
      coExecutors: editCoExecutorsText
        .split(/[,\n;]/u)
        .map((value) => value.trim())
        .filter((value) => value.length > 0),
      comment: editComment.trim(),
      expectedUpdatedAt: detailState.assignment.updatedAt,
    };
    setIsSaving(true);
    setFormMessage("");
    const result = await updateBoardAssignment(
      detailState.assignment.id,
      request,
    );
    setIsSaving(false);

    if (result.status === "error") {
      setFormMessage(result.message);
      return;
    }

    setIsEditOpen(false);
    setEditComment("");
    setDetailState({ status: "ready", assignment: result.assignment });
    setListVersion((current) => current + 1);
    onShowToast(
      "Поручение обновлено",
      "Изменения синхронизированы для текущего и следующих исполнений.",
    );
  }

  async function saveAction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      isAdminPreviewMode ||
      isSaving ||
      detailState?.status !== "ready"
    ) {
      return;
    }

    const submitterAction = (event.nativeEvent as SubmitEvent).submitter
      ?.getAttribute("value");
    const requestedAction = boardAssignmentActions.find(
      (item) => item === submitterAction,
    );
    if (requestedAction === undefined) return;

    setIsSaving(true);
    setFormMessage("");
    const result = await applyBoardAssignmentAction(
      detailState.assignment.id,
      { action: requestedAction, comment: actionComment },
    );
    setIsSaving(false);

    if (result.status === "error") {
      setFormMessage(result.message);
      return;
    }

    if (
      requestedAction === "submit_for_review" &&
      result.permissions.canExecute
    ) {
      setSelectedId(undefined);
    } else {
      setDetailState({ status: "ready", assignment: result.assignment });
      setActionComment("");
    }
    setListVersion((current) => current + 1);
    if (
      requestedAction === "complete" &&
      result.assignment.status === "in_progress"
    ) {
      onShowToast(
        "Выполнение принято",
        `Следующая дата: ${
          formatCalendarDate(result.assignment.currentOccurrenceDate)
        }.`,
      );
    } else {
      onShowToast("Статус обновлён", statusLabels[result.assignment.status]);
    }
  }

  async function openMaterial(material: { key: string; fileName: string }) {
    if (isMaterialOpening) return;

    const previewWindow = window.open("", "_blank");
    if (previewWindow !== null) {
      previewWindow.opener = null;
      previewWindow.document.title = "Открываем материал…";
    }
    setIsMaterialOpening(true);
    const result = await requestBoardAssignmentMaterial(material);
    setIsMaterialOpening(false);
    if (result.status === "error") {
      previewWindow?.close();
      onShowToast("Не удалось открыть материал", result.message);
      return;
    }

    const objectUrl = URL.createObjectURL(result.blob);
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

  function openCreateDialog() {
    setFormMessage("");
    setIsCreateOpen(true);
  }

  function openEditDialog(assignment: BoardAssignment) {
    setEditInput({
      meetingDate: assignment.meetingDate,
      protocolNumber: assignment.protocolNumber,
      decisionNumber: assignment.decisionNumber,
      summary: assignment.summary,
      details: assignment.details,
      coExecutors: assignment.coExecutors,
      recurrence: assignment.recurrence,
      activeFrom: assignment.activeFrom,
      activeTo: assignment.activeTo,
    });
    setEditCoExecutorsText(assignment.coExecutors.join("\n"));
    setEditComment("");
    setFormMessage("");
    setIsEditOpen(true);
  }

  function switchRegisterMode(mode: "live" | "history") {
    setRegisterMode(mode);
    setSelectedId(undefined);
    setSelectedCompletionId(undefined);
    setStatus("");
    setFilters((current) => {
      const { status: _status, ...remaining } = current;
      return remaining;
    });
  }

  const canCreate = permissions.canCreate && !isAdminPreviewMode;
  const accessMode = readBoardAssignmentAccessMode(permissions);
  const reviewAssignments = listState.assignments.filter(
    (assignment) => assignment.status === "under_review",
  );
  const activeListState =
    registerMode === "history" ? completionListState : listState;

  return (
    <main
      className={`board-assignments-workspace is-access-${accessMode}`}
    >
      <header className="board-assignments-heading">
        <div>
          <span className="eyebrow">Совет директоров</span>
          <h1>Поручения Генеральному директору</h1>
        </div>
        <nav aria-label="Разделы поручений">
          <button
            className={registerMode === "live"
              ? "primary-button"
              : "secondary-button"}
            type="button"
            onClick={() => switchRegisterMode("live")}
          >
            Текущие поручения
          </button>
          <button
            className={registerMode === "history"
              ? "primary-button"
              : "secondary-button"}
            type="button"
            onClick={() => switchRegisterMode("history")}
          >
            История выполненных
          </button>
        </nav>
      </header>

      {registerMode === "history" ? (
        <section
          className="board-assignment-history-overview"
          aria-label="История выполненных поручений"
        >
          <div>
            <span>Архив принятых исполнений</span>
            <h2>История выполненных</h2>
            <p>
              Здесь сохранено точное состояние каждого поручения на момент
              приёмки. Последующие изменения живого поручения архив не меняют.
            </p>
          </div>
          <strong>
            {completionListState.completions.length}
            <small>выполнено</small>
          </strong>
        </section>
      ) : accessMode === "execute" ? (
        <section
          className="board-assignment-executor-overview"
          aria-label="Режим исполнения"
        >
          <div>
            <span>К исполнению</span>
            <h2>Активные поручения</h2>
            <p>
              Здесь только поручения, которые нужно выполнить сейчас.
              Повторяющиеся появятся автоматически в следующую дату.
            </p>
          </div>
          <strong>
            {listState.assignments.length}
            <small>сейчас</small>
          </strong>
        </section>
      ) : accessMode === "create" ? (
        <section
          className="board-assignment-create-overview"
          aria-label="Постановка поручений"
        >
          <div>
            <span>Постановка поручений</span>
            <h2>Создать новое поручение</h2>
            <p>
              Зафиксируйте решение Совета директоров, срок и ответственных.
              После сохранения поручение сразу появится в реестре.
            </p>
            {canCreate ? (
              <button
                className="primary-button"
                type="button"
                onClick={openCreateDialog}
              >
                Добавить поручение
              </button>
            ) : null}
          </div>
          <div className="board-assignment-create-count">
            <strong>{listState.assignments.length}</strong>
            <span>показано в реестре</span>
          </div>
        </section>
      ) : accessMode === "review" ? (
        <section
          className="board-assignment-review-overview"
          aria-label="Очередь приёмки"
        >
          <div>
            <span>Приёмка исполнения</span>
            <h2>Ожидают решения</h2>
            <p>
              Сначала проверьте результат и комментарии исполнителя, затем
              примите работу или верните её с понятным замечанием.
            </p>
          </div>
          <div className="board-assignment-review-actions">
            <strong>
              {reviewAssignments.length}
              <small>на проверке</small>
            </strong>
            {canCreate ? (
              <button
                className="secondary-button"
                type="button"
                onClick={openCreateDialog}
              >
                Добавить поручение
              </button>
            ) : null}
          </div>
        </section>
      ) : (
        <section
          className="board-assignment-view-notice"
          aria-label="Режим просмотра"
        >
          <div>
            <span>Только просмотр</span>
            <p>
              Можно открывать поручения, читать комментарии и пользоваться
              фильтрами. Изменение данных недоступно.
            </p>
          </div>
          <strong>
            {listState.assignments.length}{" "}
            {formatAssignmentCount(listState.assignments.length)}
          </strong>
        </section>
      )}

      <form
        className={`board-assignment-filters${
          accessMode === "execute" && registerMode === "live"
            ? " is-compact"
            : registerMode === "history"
            ? " is-history"
            : ""
        }`}
        onSubmit={applyFilters}
      >
        <label className="board-assignment-search">
          <span>
            {registerMode === "history"
              ? "Найти выполненное поручение"
              : accessMode === "execute"
              ? "Найти активное поручение"
              : "Поиск"}
          </span>
          <input
            maxLength={200}
            placeholder="Поручение, протокол, пункт, соисполнитель"
            value={query}
            onChange={(event) => {
              const value = event.currentTarget.value;
              setQuery(value);
            }}
          />
        </label>
        {accessMode === "execute" && registerMode === "live" ? null : (
          <>
            {registerMode === "live" ? (
              <label>
                <span>Статус</span>
                <select
                  value={status}
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    setStatus(value as BoardAssignmentStatus | "");
                  }}
                >
                  <option value="">Все статусы</option>
                  {boardAssignmentStatuses.map((item) => (
                    <option key={item} value={item}>
                      {statusLabels[item]}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <label>
              <span>Заседание с</span>
              <input
                max={meetingDateTo || undefined}
                type="date"
                value={meetingDateFrom}
                onChange={(event) => {
                  const value = event.currentTarget.value;
                  setMeetingDateFrom(value);
                }}
              />
            </label>
            <label>
              <span>Заседание по</span>
              <input
                min={meetingDateFrom || undefined}
                type="date"
                value={meetingDateTo}
                onChange={(event) => {
                  const value = event.currentTarget.value;
                  setMeetingDateTo(value);
                }}
              />
            </label>
          </>
        )}
        <div className="board-assignment-filter-actions">
          <button className="primary-button" type="submit">Показать</button>
          <button
            className="secondary-button"
            type="button"
            onClick={resetFilters}
          >
            Сбросить
          </button>
        </div>
      </form>

      {activeListState.status === "loading" ? (
        <LoadingIndicator label="Загружаем поручения…" variant="inline" />
      ) : null}
      {activeListState.status === "error" ? (
        <p className="form-message is-error" role="alert">
          {activeListState.message}
        </p>
      ) : null}

      {registerMode === "history" ? (
        <section
          className="board-assignment-register"
          aria-label="История выполненных поручений"
        >
          <div className="board-assignment-table-wrap">
            <table className="board-assignment-table board-assignment-history-table">
              <thead>
                <tr>
                  <th>Принято</th>
                  <th>Краткое содержание поручения</th>
                  <th>Дата исполнения</th>
                  <th>Принял</th>
                  <th>Статус</th>
                </tr>
              </thead>
              <tbody>
                {completionListState.completions.map((completion) => (
                  <tr key={completion.id}>
                    <td>{formatTimestamp(completion.completedAt)}</td>
                    <td>
                      <button
                        className="board-assignment-link"
                        type="button"
                        onClick={() => setSelectedCompletionId(completion.id)}
                      >
                        {completion.assignment.summary}
                      </button>
                      <small>
                        Протокол №{completion.assignment.protocolNumber},
                        {" "}пункт {completion.assignment.decisionNumber}
                      </small>
                    </td>
                    <td>{formatCalendarDate(completion.occurrenceDate)}</td>
                    <td>{completion.completedByDisplayName}</td>
                    <td>
                      <span className="board-assignment-status is-completed">
                        Завершено
                      </span>
                    </td>
                  </tr>
                ))}
                {completionListState.status !== "loading" &&
                completionListState.completions.length === 0 ? (
                  <tr>
                    <td className="board-assignment-empty" colSpan={5}>
                      Выполненных поручений по выбранным фильтрам нет.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      ) : accessMode === "execute" ? (
        <section
          className="board-assignment-executor-list"
          aria-label="Активные поручения"
        >
          {listState.assignments.map((assignment) => (
            <article
              className={`board-assignment-executor-card is-${assignment.status}`}
              key={assignment.id}
            >
              <div className="board-assignment-executor-card-heading">
                <span
                  className={`board-assignment-status is-${assignment.status}`}
                >
                  {statusLabels[assignment.status]}
                </span>
                <span>
                  К исполнению{" "}
                  {formatCalendarDate(assignment.currentOccurrenceDate)}
                </span>
              </div>
              <button
                className="board-assignment-link"
                type="button"
                onClick={() => setSelectedId(assignment.id)}
              >
                {assignment.summary}
              </button>
              <p>
                Протокол №{assignment.protocolNumber}, пункт{" "}
                {assignment.decisionNumber}
              </p>
              <dl>
                <div>
                  <dt>Повтор</dt>
                  <dd>{recurrenceLabels[assignment.recurrence]}</dd>
                </div>
                <div>
                  <dt>Соисполнители</dt>
                  <dd>
                    {assignment.coExecutors.length === 0
                      ? "Не указаны"
                      : assignment.coExecutors.join(", ")}
                  </dd>
                </div>
              </dl>
              <button
                className="secondary-button"
                type="button"
                onClick={() => setSelectedId(assignment.id)}
              >
                Открыть и отчитаться
              </button>
            </article>
          ))}
          {listState.status !== "loading" &&
          listState.assignments.length === 0 ? (
            <div className="board-assignment-executor-empty">
              <strong>Активных поручений сейчас нет</strong>
              <p>Следующее повторяющееся поручение появится в нужную дату.</p>
            </div>
          ) : null}
        </section>
      ) : (
        <>
          {accessMode === "review" && reviewAssignments.length > 0 ? (
            <section
              className="board-assignment-review-queue"
              aria-label="Поручения, ожидающие решения"
            >
              <header>
                <div>
                  <span>Требуют внимания</span>
                  <h2>Проверить исполнение</h2>
                </div>
                <strong>{reviewAssignments.length}</strong>
              </header>
              <div>
                {reviewAssignments.map((assignment) => (
                  <article
                    className="board-assignment-review-card"
                    key={assignment.id}
                  >
                    <div>
                      <span>
                        К исполнению{" "}
                        {formatCalendarDate(assignment.currentOccurrenceDate)}
                      </span>
                      <span>
                        Протокол №{assignment.protocolNumber}, пункт{" "}
                        {assignment.decisionNumber}
                      </span>
                    </div>
                    <h3>{assignment.summary}</h3>
                    <p>
                      {assignment.coExecutors.length === 0
                        ? "Без соисполнителей"
                        : `Соисполнители: ${assignment.coExecutors.join(", ")}`}
                    </p>
                    <button
                      className="primary-button"
                      type="button"
                      onClick={() => setSelectedId(assignment.id)}
                    >
                      Проверить исполнение
                    </button>
                  </article>
                ))}
              </div>
            </section>
          ) : null}
          <section
            className="board-assignment-register"
            aria-label="Реестр поручений"
          >
            <div className="board-assignment-table-wrap">
              <table className="board-assignment-table">
            <thead>
              <tr>
                <th>Дата заседания Совета директоров</th>
                <th>Краткое содержание поручения</th>
                <th>Соисполнители</th>
                <th>Срок исполнения</th>
                <th>Статус</th>
              </tr>
            </thead>
            <tbody>
              {listState.assignments.map((assignment) => (
                <tr key={assignment.id}>
                  <td>{formatCalendarDate(assignment.meetingDate)}</td>
                  <td>
                    <button
                      className="board-assignment-link"
                      type="button"
                      onClick={() => setSelectedId(assignment.id)}
                    >
                      {assignment.summary}
                    </button>
                    <small>
                      Протокол №{assignment.protocolNumber}, пункт{" "}
                      {assignment.decisionNumber}
                    </small>
                  </td>
                  <td>
                    {assignment.coExecutors.length === 0
                      ? "—"
                      : assignment.coExecutors.join(", ")}
                  </td>
                  <td>
                    <span className="board-assignment-schedule-summary">
                      <strong>{recurrenceLabels[assignment.recurrence]}</strong>
                      <small>
                        Текущая дата:{" "}
                        {formatCalendarDate(assignment.currentOccurrenceDate)}
                      </small>
                      <small>
                        Период: {formatCalendarDate(assignment.activeFrom)}
                        {" — "}
                        {formatCalendarDate(assignment.activeTo)}
                      </small>
                    </span>
                  </td>
                  <td>
                    <span
                      className={`board-assignment-status is-${assignment.status}`}
                    >
                      {statusLabels[assignment.status]}
                    </span>
                  </td>
                </tr>
              ))}
              {listState.status !== "loading" &&
              listState.assignments.length === 0 ? (
                <tr>
                  <td className="board-assignment-empty" colSpan={5}>
                    По выбранным фильтрам поручений нет.
                  </td>
                </tr>
              ) : null}
            </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      {isCreateOpen ? (
        <BoardAssignmentEditorDialog
          mode="create"
          createInput={createInput}
          coExecutorsText={coExecutorsText}
          comment={createComment}
          formMessage={formMessage}
          isSaving={isSaving}
          onChange={setCreateInput}
          onCoExecutorsChange={setCoExecutorsText}
          onCommentChange={setCreateComment}
          onCancel={() => {
            if (isSaving) return;
            setIsCreateOpen(false);
            setCreateInput(emptyCreateInput);
            setCoExecutorsText("");
            setCreateComment("");
            setFormMessage("");
          }}
          onSubmit={saveAssignment}
        />
      ) : null}

      {isEditOpen ? (
        <BoardAssignmentEditorDialog
          mode="edit"
          createInput={editInput}
          coExecutorsText={editCoExecutorsText}
          comment={editComment}
          formMessage={formMessage}
          isSaving={isSaving}
          onChange={setEditInput}
          onCoExecutorsChange={setEditCoExecutorsText}
          onCommentChange={setEditComment}
          onCancel={() => {
            if (isSaving) return;
            setIsEditOpen(false);
            setEditComment("");
            setFormMessage("");
          }}
          onSubmit={saveEditedAssignment}
        />
      ) : null}

      {selectedId === undefined || isEditOpen ? null : (
        <BoardAssignmentDetailDialog
          actionComment={actionComment}
          detailState={detailState}
          formMessage={formMessage}
          isAdminPreviewMode={isAdminPreviewMode}
          isMaterialOpening={isMaterialOpening}
          isSaving={isSaving}
          permissions={permissions}
          onCommentChange={setActionComment}
          onCancel={() => {
            if (isSaving) return;
            setSelectedId(undefined);
            setFormMessage("");
          }}
          onOpenMaterial={(material) => {
            void openMaterial(material);
          }}
          onEdit={openEditDialog}
          onSubmit={saveAction}
        />
      )}

      {selectedCompletionId === undefined ? null : (
        <BoardAssignmentDetailDialog
          actionComment=""
          detailState={
            completionDetailState?.status === "ready"
              ? {
                  status: "ready",
                  assignment: completionDetailState.completion.assignment,
                }
              : completionDetailState
          }
          formMessage=""
          isAdminPreviewMode={false}
          isMaterialOpening={isMaterialOpening}
          isSaving={false}
          permissions={emptyPermissions}
          snapshotMeta={
            completionDetailState?.status === "ready"
              ? {
                  completedAt: completionDetailState.completion.completedAt,
                  completedByDisplayName:
                    completionDetailState.completion.completedByDisplayName,
                }
              : undefined
          }
          onCommentChange={() => {}}
          onCancel={() => setSelectedCompletionId(undefined)}
          onOpenMaterial={(material) => {
            void openMaterial(material);
          }}
          onSubmit={() => {}}
        />
      )}
    </main>
  );
}

function BoardAssignmentEditorDialog({
  mode,
  createInput,
  coExecutorsText,
  comment,
  formMessage,
  isSaving,
  onChange,
  onCoExecutorsChange,
  onCommentChange,
  onCancel,
  onSubmit,
}: {
  mode: "create" | "edit";
  createInput: BoardAssignmentCreateInput;
  coExecutorsText: string;
  comment: string;
  formMessage: string;
  isSaving: boolean;
  onChange: (value: BoardAssignmentCreateInput) => void;
  onCoExecutorsChange: (value: string) => void;
  onCommentChange: (value: string) => void;
  onCancel: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  function updateField<
    Field extends Exclude<keyof BoardAssignmentCreateInput, "coExecutors">,
  >(
    field: Field,
    value: BoardAssignmentCreateInput[Field],
  ) {
    onChange({ ...createInput, [field]: value });
  }

  function updateMeetingDate(value: string) {
    const shouldSyncFrom =
      createInput.activeFrom === "" ||
      createInput.activeFrom === createInput.meetingDate;
    const shouldSyncTo =
      createInput.activeTo === "" ||
      createInput.activeTo === createInput.meetingDate;

    onChange({
      ...createInput,
      meetingDate: value,
      activeFrom: shouldSyncFrom ? value : createInput.activeFrom,
      activeTo: shouldSyncTo ? value : createInput.activeTo,
    });
  }

  function updateActiveFrom(value: string) {
    onChange({
      ...createInput,
      activeFrom: value,
      activeTo:
        createInput.activeTo === "" || createInput.activeTo < value
          ? value
          : createInput.activeTo,
    });
  }

  return (
    <div
      className="admin-db-modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onCancel();
        }
      }}
    >
      <form
        aria-labelledby="board-assignment-editor-title"
        aria-modal="true"
        className="board-assignment-dialog"
        role="dialog"
        onSubmit={onSubmit}
      >
        <header className="board-assignment-dialog-heading">
          <div>
            <span className="eyebrow">
              {mode === "edit" ? "Редактирование поручения" : "Новое поручение"}
            </span>
            <h2 id="board-assignment-editor-title">
              {mode === "edit"
                ? "Изменить поручение"
                : "Поручение Генеральному директору"}
            </h2>
          </div>
          <button
            aria-label="Закрыть"
            className="secondary-button"
            disabled={isSaving}
            type="button"
            onClick={onCancel}
          >
            Отмена
          </button>
        </header>
        <div className="board-assignment-form-grid">
          <label>
            <span>Дата заседания</span>
            <input
              required
              type="date"
              value={createInput.meetingDate}
              onChange={(event) => {
                const value = event.currentTarget.value;
                updateMeetingDate(value);
              }}
            />
          </label>
          <label>
            <span>Номер протокола</span>
            <input
              maxLength={80}
              required
              value={createInput.protocolNumber}
              onChange={(event) => {
                const value = event.currentTarget.value;
                updateField("protocolNumber", value);
              }}
            />
          </label>
          <label>
            <span>Пункт решения</span>
            <input
              maxLength={80}
              required
              value={createInput.decisionNumber}
              onChange={(event) => {
                const value = event.currentTarget.value;
                updateField("decisionNumber", value);
              }}
            />
          </label>
          <fieldset className="board-assignment-schedule-fields is-wide">
            <legend>Срок исполнения</legend>
            <div>
              <label>
                <span>Периодичность</span>
                <select
                  required
                  value={createInput.recurrence}
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    updateField(
                      "recurrence",
                      value as BoardAssignmentRecurrence,
                    );
                  }}
                >
                  {boardAssignmentRecurrences.map((item) => (
                    <option key={item} value={item}>
                      {recurrenceLabels[item]}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Действует с</span>
                <input
                  max={createInput.activeTo || undefined}
                  required
                  type="date"
                  value={createInput.activeFrom}
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    updateActiveFrom(value);
                  }}
                />
              </label>
              <label>
                <span>Действует по</span>
                <input
                  min={createInput.activeFrom || undefined}
                  required
                  type="date"
                  value={createInput.activeTo}
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    updateField("activeTo", value);
                  }}
                />
              </label>
            </div>
            <small>
              После приёмки повторяющееся поручение появится исполнителю в
              следующую дату внутри выбранного периода.
            </small>
          </fieldset>
          <label className="is-wide">
            <span>Краткое содержание поручения</span>
            <input
              maxLength={500}
              required
              value={createInput.summary}
              onChange={(event) => {
                const value = event.currentTarget.value;
                updateField("summary", value);
              }}
            />
          </label>
          <label className="is-wide">
            <span>Полное содержание поручения</span>
            <textarea
              maxLength={20_000}
              required
              rows={5}
              value={createInput.details}
              onChange={(event) => {
                const value = event.currentTarget.value;
                updateField("details", value);
              }}
            />
          </label>
          <label className="is-wide">
            <span>Соисполнители</span>
            <textarea
              maxLength={4_000}
              placeholder="Каждого можно указать с новой строки или через запятую"
              rows={3}
              value={coExecutorsText}
              onChange={(event) => {
                const value = event.currentTarget.value;
                onCoExecutorsChange(value);
              }}
            />
          </label>
          <label className="is-wide">
            <span>
              {mode === "edit"
                ? "Комментарий к изменению"
                : "Комментарий при создании"}
            </span>
            <textarea
              maxLength={4_000}
              required={mode === "edit"}
              rows={3}
              value={comment}
              onChange={(event) => {
                const value = event.currentTarget.value;
                onCommentChange(value);
              }}
            />
          </label>
        </div>
        {formMessage === "" ? null : (
          <p className="form-message is-error" role="alert">{formMessage}</p>
        )}
        <footer className="board-assignment-dialog-actions">
          <button
            className="secondary-button"
            disabled={isSaving}
            type="button"
            onClick={onCancel}
          >
            Отмена
          </button>
          <button className="primary-button" disabled={isSaving} type="submit">
            {isSaving
              ? <LoadingIndicator label="Сохраняем…" variant="button" />
              : mode === "edit"
              ? "Сохранить изменения"
              : "Добавить поручение"}
          </button>
        </footer>
      </form>
    </div>
  );
}

function BoardAssignmentDetailDialog({
  detailState,
  permissions,
  isAdminPreviewMode,
  isMaterialOpening,
  actionComment,
  isSaving,
  formMessage,
  onCommentChange,
  onCancel,
  onOpenMaterial,
  onEdit,
  onSubmit,
  snapshotMeta,
}: {
  detailState: DetailState | undefined;
  permissions: BoardAssignmentPermissions;
  isAdminPreviewMode: boolean;
  isMaterialOpening: boolean;
  actionComment: string;
  isSaving: boolean;
  formMessage: string;
  onCommentChange: (value: string) => void;
  onCancel: () => void;
  onOpenMaterial: (material: { key: string; fileName: string }) => void;
  onEdit?: (assignment: BoardAssignment) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  snapshotMeta?: {
    completedAt: string;
    completedByDisplayName: string;
  };
}) {
  const assignment =
    detailState?.status === "ready" ? detailState.assignment : undefined;
  const canSubmitForReview =
    assignment !== undefined &&
    permissions.canExecute &&
    (
      assignment.status === "in_progress" ||
      assignment.status === "revision_requested"
    );
  const canDecide =
    assignment !== undefined &&
    permissions.canReview &&
    assignment.status === "under_review";
  const hasAction = canSubmitForReview || canDecide;
  const canEdit =
    assignment !== undefined &&
    permissions.canCreate &&
    assignment.status !== "completed" &&
    !isAdminPreviewMode &&
    onEdit !== undefined &&
    snapshotMeta === undefined;

  return (
    <div
      className="admin-db-modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onCancel();
        }
      }}
    >
      <section
        aria-labelledby="board-assignment-detail-title"
        aria-modal="true"
        className="board-assignment-dialog"
        role="dialog"
      >
        <header className="board-assignment-dialog-heading">
          <div>
            <span className="eyebrow">
              {snapshotMeta === undefined
                ? "Карточка поручения"
                : "Снимок выполненного поручения"}
            </span>
            <h2 id="board-assignment-detail-title">
              {assignment?.summary ?? "Поручение Совета директоров"}
            </h2>
          </div>
          <div className="board-assignment-dialog-heading-actions">
            {canEdit ? (
              <button
                className="primary-button"
                disabled={isSaving}
                type="button"
                onClick={() => onEdit?.(assignment)}
              >
                Редактировать
              </button>
            ) : null}
            <button
              className="secondary-button"
              disabled={isSaving}
              type="button"
              onClick={onCancel}
            >
              Отмена
            </button>
          </div>
        </header>

        {detailState === undefined || detailState.status === "loading" ? (
          <LoadingIndicator label="Загружаем поручение…" variant="inline" />
        ) : detailState.status === "error" ? (
          <p className="form-message is-error" role="alert">
            {detailState.message}
          </p>
        ) : (
          <>
            {snapshotMeta === undefined ? null : (
              <div className="board-assignment-snapshot-note">
                <strong>Принято {formatTimestamp(snapshotMeta.completedAt)}</strong>
                <span>{snapshotMeta.completedByDisplayName}</span>
                <small>
                  Это неизменяемая версия поручения на момент завершения.
                </small>
              </div>
            )}
            <dl className="board-assignment-details">
              <div>
                <dt>Дата заседания</dt>
                <dd>{formatCalendarDate(detailState.assignment.meetingDate)}</dd>
              </div>
              <div>
                <dt>Протокол и пункт</dt>
                <dd>
                  №{detailState.assignment.protocolNumber},{" "}
                  {detailState.assignment.decisionNumber}
                </dd>
              </div>
              <div>
                <dt>Срок исполнения</dt>
                <dd>
                  {recurrenceLabels[detailState.assignment.recurrence]}
                  {" · "}
                  {formatCalendarDate(
                    detailState.assignment.currentOccurrenceDate,
                  )}
                </dd>
              </div>
              <div>
                <dt>Период действия</dt>
                <dd>
                  {formatCalendarDate(detailState.assignment.activeFrom)}
                  {" — "}
                  {formatCalendarDate(detailState.assignment.activeTo)}
                </dd>
              </div>
              <div>
                <dt>Статус</dt>
                <dd>
                  <span
                    className={`board-assignment-status is-${detailState.assignment.status}`}
                  >
                    {statusLabels[detailState.assignment.status]}
                  </span>
                </dd>
              </div>
              <div className="is-wide">
                <dt>Краткое содержание</dt>
                <dd>{detailState.assignment.summary}</dd>
              </div>
              <div className="is-wide">
                <dt>Полное содержание</dt>
                <dd>{detailState.assignment.details}</dd>
              </div>
              <div className="is-wide">
                <dt>Соисполнители</dt>
                <dd>
                  {detailState.assignment.coExecutors.length === 0
                    ? "Не указаны"
                    : detailState.assignment.coExecutors.join(", ")}
                </dd>
              </div>
              <div>
                <dt>Внёс поручение</dt>
                <dd>{detailState.assignment.createdByDisplayName}</dd>
              </div>
              {detailState.assignment.sourceMaterial === undefined ? null : (
                <div>
                  <dt>Дополнительный материал</dt>
                  <dd>
                    <button
                      className="board-assignment-link"
                      disabled={isMaterialOpening}
                      type="button"
                      onClick={() => onOpenMaterial(
                        detailState.assignment.sourceMaterial!,
                      )}
                    >
                      {isMaterialOpening
                        ? "Открываем…"
                        : detailState.assignment.sourceMaterial.fileName}
                    </button>
                  </dd>
                </div>
              )}
            </dl>

            <section className="board-assignment-comments">
              <h3>Комментарии</h3>
              {detailState.assignment.comments.length === 0 ? (
                <p>Комментариев пока нет.</p>
              ) : (
                <pre>{formatCommentHistory(detailState.assignment.comments)}</pre>
              )}
            </section>

            {!hasAction || isAdminPreviewMode ? (
              <footer className="board-assignment-dialog-actions">
                {isAdminPreviewMode ? (
                  <small>В режиме просмотра действия отключены.</small>
                ) : null}
                <button
                  className="secondary-button"
                  type="button"
                  onClick={onCancel}
                >
                  Закрыть
                </button>
              </footer>
            ) : (
              <form
                className={`board-assignment-decision${
                  canSubmitForReview
                    ? " is-execute"
                    : canDecide
                    ? " is-review"
                    : ""
                }`}
                onSubmit={onSubmit}
              >
                <label>
                  <span>
                    {canDecide
                      ? "Комментарий к решению"
                      : "Комментарий"}
                  </span>
                  <textarea
                    maxLength={4_000}
                    required
                    rows={4}
                    value={actionComment}
                    onChange={(event) => {
                      const value = event.currentTarget.value;
                      onCommentChange(value);
                    }}
                  />
                </label>
                {formMessage === "" ? null : (
                  <p className="form-message is-error" role="alert">
                    {formMessage}
                  </p>
                )}
                <footer className="board-assignment-dialog-actions">
                  <button
                    className="secondary-button"
                    disabled={isSaving}
                    type="button"
                    onClick={onCancel}
                  >
                    Отмена
                  </button>
                  {canDecide ? (
                    <>
                      <button
                        className="secondary-button board-assignment-return-button"
                        disabled={isSaving}
                        name="action"
                        type="submit"
                        value="return_for_revision"
                      >
                        Вернуть на доработку
                      </button>
                      <button
                        className="primary-button"
                        disabled={isSaving}
                        name="action"
                        type="submit"
                        value="complete"
                      >
                        {isSaving
                          ? (
                            <LoadingIndicator
                              label="Сохраняем решение…"
                              variant="button"
                            />
                          )
                          : "Принять исполнение"}
                      </button>
                    </>
                  ) : (
                    <button
                      className="primary-button"
                      disabled={isSaving}
                      name="action"
                      type="submit"
                      value="submit_for_review"
                    >
                      {isSaving
                        ? (
                          <LoadingIndicator
                            label="Отправляем…"
                            variant="button"
                          />
                        )
                        : "Отправить на проверку"}
                    </button>
                  )}
                </footer>
              </form>
            )}
          </>
        )}
      </section>
    </div>
  );
}

function readBoardAssignmentAccessMode(
  permissions: BoardAssignmentPermissions,
): BoardAssignmentAccessMode {
  if (permissions.canReview) return "review";
  if (permissions.canExecute) return "execute";
  if (permissions.canCreate) return "create";
  return "view";
}

function formatCalendarDate(value: string) {
  const [year, month, day] = value.split("-");
  return year === undefined || month === undefined || day === undefined
    ? value
    : `${day}.${month}.${year}`;
}

function formatAssignmentCount(value: number) {
  const absolute = Math.abs(value);
  const modulo100 = absolute % 100;
  if (modulo100 >= 11 && modulo100 <= 14) return "поручений";

  const modulo10 = absolute % 10;
  if (modulo10 === 1) return "поручение";
  if (modulo10 >= 2 && modulo10 <= 4) return "поручения";
  return "поручений";
}

function formatTimestamp(value: string) {
  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("ru-RU", {
        dateStyle: "short",
        timeStyle: "short",
      }).format(date);
}

function formatCommentHistory(
  comments: BoardAssignment["comments"],
) {
  return comments
    .map((comment) =>
      `${formatTimestamp(comment.createdAt)}, ${comment.authorDisplayName}\n${comment.comment}`
    )
    .join("\n\n");
}
