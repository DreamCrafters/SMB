import {
  useEffect,
  useState,
  type FormEvent,
} from "react";
import {
  boardAssignmentStatuses,
  type BoardAssignment,
  type BoardAssignmentAction,
  type BoardAssignmentCreateInput,
  type BoardAssignmentFilters,
  type BoardAssignmentPermissions,
  type BoardAssignmentStatus,
  type BoardAssignmentSummary,
} from "./contracts";
import {
  applyBoardAssignmentAction,
  createBoardAssignment,
  requestBoardAssignment,
  requestBoardAssignmentMaterial,
  requestBoardAssignments,
} from "./services/boardAssignments";
import { LoadingIndicator } from "./LoadingIndicator";

const statusLabels: Record<BoardAssignmentStatus, string> = {
  in_progress: "В работе",
  under_review: "На проверке",
  revision_requested: "На доработке",
  completed: "Завершено",
};

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
  dueDate: "",
};

type ListState =
  | { status: "loading"; assignments: BoardAssignmentSummary[] }
  | { status: "ready"; assignments: BoardAssignmentSummary[] }
  | { status: "error"; assignments: BoardAssignmentSummary[]; message: string };

type DetailState =
  | { status: "loading" }
  | { status: "ready"; assignment: BoardAssignment }
  | { status: "error"; message: string };

export function BoardAssignmentsWorkspace({
  isAdminPreviewMode,
  onShowToast,
}: {
  isAdminPreviewMode: boolean;
  onShowToast: (title: string, message: string) => void;
}) {
  const [filters, setFilters] = useState<BoardAssignmentFilters>({});
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
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createInput, setCreateInput] = useState(emptyCreateInput);
  const [coExecutorsText, setCoExecutorsText] = useState("");
  const [createComment, setCreateComment] = useState("");
  const [action, setAction] =
    useState<BoardAssignmentAction>("submit_for_review");
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
      setAction(readDefaultAction(result.assignment, result.permissions));
      setActionComment("");
      setFormMessage("");
    });

    return () => controller.abort();
  }, [selectedId]);

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

  async function saveAction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      isAdminPreviewMode ||
      isSaving ||
      detailState?.status !== "ready"
    ) {
      return;
    }

    setIsSaving(true);
    setFormMessage("");
    const result = await applyBoardAssignmentAction(
      detailState.assignment.id,
      { action, comment: actionComment },
    );
    setIsSaving(false);

    if (result.status === "error") {
      setFormMessage(result.message);
      return;
    }

    setDetailState({ status: "ready", assignment: result.assignment });
    setAction(readDefaultAction(result.assignment, result.permissions));
    setActionComment("");
    setListVersion((current) => current + 1);
    onShowToast("Статус обновлён", statusLabels[result.assignment.status]);
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

  const canCreate = permissions.canCreate && !isAdminPreviewMode;

  return (
    <main className="board-assignments-workspace">
      <header className="board-assignments-heading">
        <div>
          <span className="eyebrow">Совет директоров</span>
          <h1>Поручения Генеральному директору</h1>
          <p>
            Единый реестр поручений, сроков, исполнения и решений по проверке.
          </p>
        </div>
        {canCreate ? (
          <button
            className="primary-button"
            type="button"
            onClick={() => {
              setFormMessage("");
              setIsCreateOpen(true);
            }}
          >
            Добавить поручение
          </button>
        ) : null}
      </header>

      <form className="board-assignment-filters" onSubmit={applyFilters}>
        <label className="board-assignment-search">
          <span>Поиск</span>
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
              <option key={item} value={item}>{statusLabels[item]}</option>
            ))}
          </select>
        </label>
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

      {listState.status === "loading" ? (
        <LoadingIndicator label="Загружаем поручения…" variant="inline" />
      ) : null}
      {listState.status === "error" ? (
        <p className="form-message is-error" role="alert">
          {listState.message}
        </p>
      ) : null}

      <section className="board-assignment-register" aria-label="Реестр поручений">
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
                  <td>{assignment.dueDate}</td>
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

      {isCreateOpen ? (
        <BoardAssignmentCreateDialog
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

      {selectedId === undefined ? null : (
        <BoardAssignmentDetailDialog
          action={action}
          actionComment={actionComment}
          detailState={detailState}
          formMessage={formMessage}
          isAdminPreviewMode={isAdminPreviewMode}
          isMaterialOpening={isMaterialOpening}
          isSaving={isSaving}
          permissions={permissions}
          onActionChange={setAction}
          onCommentChange={setActionComment}
          onCancel={() => {
            if (isSaving) return;
            setSelectedId(undefined);
            setFormMessage("");
          }}
          onOpenMaterial={(material) => {
            void openMaterial(material);
          }}
          onSubmit={saveAction}
        />
      )}
    </main>
  );
}

function BoardAssignmentCreateDialog({
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
  function updateField(
    field: Exclude<keyof BoardAssignmentCreateInput, "coExecutors">,
    value: string,
  ) {
    onChange({ ...createInput, [field]: value });
  }

  return (
    <div className="admin-db-modal-backdrop" role="presentation">
      <form
        aria-labelledby="board-assignment-create-title"
        aria-modal="true"
        className="board-assignment-dialog"
        role="dialog"
        onSubmit={onSubmit}
      >
        <header className="board-assignment-dialog-heading">
          <div>
            <span className="eyebrow">Новое поручение</span>
            <h2 id="board-assignment-create-title">
              Поручение Генеральному директору
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
                updateField("meetingDate", value);
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
          <label>
            <span>Срок исполнения</span>
            <input
              maxLength={255}
              placeholder="Например: до 24.07.2026 или ежемесячно"
              required
              value={createInput.dueDate}
              onChange={(event) => {
                const value = event.currentTarget.value;
                updateField("dueDate", value);
              }}
            />
          </label>
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
            <span>Комментарий при создании</span>
            <textarea
              maxLength={4_000}
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
  action,
  actionComment,
  isSaving,
  formMessage,
  onActionChange,
  onCommentChange,
  onCancel,
  onOpenMaterial,
  onSubmit,
}: {
  detailState: DetailState | undefined;
  permissions: BoardAssignmentPermissions;
  isAdminPreviewMode: boolean;
  isMaterialOpening: boolean;
  action: BoardAssignmentAction;
  actionComment: string;
  isSaving: boolean;
  formMessage: string;
  onActionChange: (value: BoardAssignmentAction) => void;
  onCommentChange: (value: string) => void;
  onCancel: () => void;
  onOpenMaterial: (material: { key: string; fileName: string }) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const assignment =
    detailState?.status === "ready" ? detailState.assignment : undefined;
  const actions = assignment === undefined
    ? []
    : readAvailableActions(assignment, permissions);

  return (
    <div className="admin-db-modal-backdrop" role="presentation">
      <section
        aria-labelledby="board-assignment-detail-title"
        aria-modal="true"
        className="board-assignment-dialog"
        role="dialog"
      >
        <header className="board-assignment-dialog-heading">
          <div>
            <span className="eyebrow">Карточка поручения</span>
            <h2 id="board-assignment-detail-title">
              {assignment?.summary ?? "Поручение Совета директоров"}
            </h2>
          </div>
          <button
            className="secondary-button"
            disabled={isSaving}
            type="button"
            onClick={onCancel}
          >
            Отмена
          </button>
        </header>

        {detailState === undefined || detailState.status === "loading" ? (
          <LoadingIndicator label="Загружаем поручение…" variant="inline" />
        ) : detailState.status === "error" ? (
          <p className="form-message is-error" role="alert">
            {detailState.message}
          </p>
        ) : (
          <>
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
                <dd>{detailState.assignment.dueDate}</dd>
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

            {actions.length === 0 || isAdminPreviewMode ? (
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
              <form className="board-assignment-decision" onSubmit={onSubmit}>
                <label>
                  <span>Комментарий</span>
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
                <label>
                  <span>Статус</span>
                  <select
                    value={action}
                    onChange={(event) => {
                      const value = event.currentTarget.value;
                      onActionChange(value as BoardAssignmentAction);
                    }}
                  >
                    {actions.map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </select>
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
                  <button
                    className="primary-button"
                    disabled={isSaving}
                    type="submit"
                  >
                    {isSaving
                      ? <LoadingIndicator label="Отправляем…" variant="button" />
                      : "Отправить"}
                  </button>
                </footer>
              </form>
            )}
          </>
        )}
      </section>
    </div>
  );
}

function readAvailableActions(
  assignment: BoardAssignment,
  permissions: BoardAssignmentPermissions,
) {
  if (
    permissions.canExecute &&
    (
      assignment.status === "in_progress" ||
      assignment.status === "revision_requested"
    )
  ) {
    return [{
      value: "submit_for_review" as const,
      label: "Отправить на проверку",
    }];
  }
  if (permissions.canReview && assignment.status === "under_review") {
    return [
      { value: "complete" as const, label: "Завершено" },
      { value: "return_for_revision" as const, label: "На доработку" },
    ];
  }

  return [];
}

function readDefaultAction(
  assignment: BoardAssignment,
  permissions: BoardAssignmentPermissions,
): BoardAssignmentAction {
  return readAvailableActions(assignment, permissions)[0]?.value ??
    "submit_for_review";
}

function formatCalendarDate(value: string) {
  const [year, month, day] = value.split("-");
  return year === undefined || month === undefined || day === undefined
    ? value
    : `${day}.${month}.${year}`;
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
