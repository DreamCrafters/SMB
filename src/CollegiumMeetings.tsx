import { useState, type FormEvent } from "react";
import {
  collegiumDecisionLabels,
  collegiumMeetingDecisions,
  collegiumMeetingDecisionsRequiringComment,
  collegiumMeetingFormatLabels,
  collegiumMeetingFormats,
  collegiumMeetingStatusLabels,
  type CollegiumInitiativePermissions,
  type CollegiumItemDecision,
  type CollegiumMeeting,
  type CollegiumMeetingDecision,
  type CollegiumMeetingDetailResponse,
  type CollegiumMeetingDetailsInput,
  type CollegiumMeetingItem,
  type CollegiumPerson,
} from "./contracts/collegiumInitiatives";
import {
  AttachmentsSection,
  formatDate,
  formatDateTime,
  usePeopleIndex,
  useServerData,
} from "./CollegiumShared";
import { LoadingIndicator } from "./LoadingIndicator";
import { ManagedTable } from "./ManagedTable";
import { TableCell, TableHeader } from "./TableCell";
import {
  collegiumMeetingAttachmentsApi,
  requestCollegiumInitiatives,
  requestCollegiumMeeting,
  requestCollegiumMeetings,
  sendCollegiumMeetingRequest,
} from "./services/collegiumInitiatives";
import type { ShowToast } from "./services/toastStack";
import { readShortUserMessage } from "./services/userFacingMessages";

type MeetingView =
  | { kind: "registry" }
  | { kind: "card"; id: string }
  | { kind: "form"; meeting?: CollegiumMeeting };

/**
 * Задача 135, срез 3: заседания Коллегии. Решения вопросов — проекты; к
 * инициативам их применяет только утверждение протокола председателем.
 */
export function CollegiumMeetingsView({
  permissions,
  onShowToast,
  onInitiativesChanged,
}: {
  permissions: CollegiumInitiativePermissions;
  onShowToast: ShowToast;
  onInitiativesChanged: () => void;
}) {
  const [version, setVersion] = useState(0);
  const [view, setView] = useState<MeetingView>({ kind: "registry" });
  const list = useServerData(
    (signal) => requestCollegiumMeetings(signal),
    "Не удалось загрузить заседания.",
    version,
  );
  const changed = () => {
    setVersion((current) => current + 1);
    onInitiativesChanged();
  };

  if (view.kind === "card") {
    return (
      <MeetingCard
        id={view.id}
        version={version}
        onBack={() => setView({ kind: "registry" })}
        onChanged={changed}
        onEdit={(meeting) => setView({ kind: "form", meeting })}
        onShowToast={onShowToast}
      />
    );
  }
  if (view.kind === "form") {
    return (
      <MeetingForm
        meeting={view.meeting}
        onCancel={() => setView(view.meeting === undefined
          ? { kind: "registry" }
          : { kind: "card", id: view.meeting.id })}
        onSaved={(meeting) => {
          onShowToast(
            view.meeting === undefined ? "Заседание создано" : "Заседание сохранено",
            meeting.number,
            "success",
          );
          changed();
          setView({ kind: "card", id: meeting.id });
        }}
      />
    );
  }

  if (list.status === "loading") return <LoadingIndicator label="Загружаем заседания…" variant="inline" />;
  if (list.status === "error") return <p className="form-message is-error" role="alert">{list.message}</p>;

  return (
    <div className="collegium-registry">
      <div className="collegium-toolbar">
        {permissions.canManage ? (
          <button
            className="primary-button collegium-create-button"
            type="button"
            onClick={() => setView({ kind: "form" })}
          >
            Новое заседание
          </button>
        ) : null}
      </div>
      {list.data.meetings.length === 0 ? (
        <p className="collegium-empty-note">Заседаний пока нет.</p>
      ) : (
        <div className="table-scroll history-table-scroll collegium-table-scroll">
          <ManagedTable tableId="collegium.meetings" className="data-table collegium-meetings-table">
            <thead>
              <tr>
                <TableHeader>Номер</TableHeader>
                <TableHeader>Дата и время</TableHeader>
                <TableHeader>Формат</TableHeader>
                <TableHeader>Статус</TableHeader>
                <TableHeader>Вопросов</TableHeader>
              </tr>
            </thead>
            <tbody>
              {list.data.meetings.map((meeting) => (
                <tr key={meeting.id}>
                  <TableCell>
                    <button
                      className="board-assignment-link collegium-meeting-link"
                      type="button"
                      onClick={() => setView({ kind: "card", id: meeting.id })}
                    >
                      {meeting.number}
                    </button>
                  </TableCell>
                  <TableCell>{`${formatDate(meeting.meetingDate)} ${meeting.meetingTime}`}</TableCell>
                  <TableCell>{collegiumMeetingFormatLabels[meeting.format]}</TableCell>
                  <TableCell>
                    <span className={`collegium-status collegium-meeting-status-${meeting.status}`}>
                      {collegiumMeetingStatusLabels[meeting.status]}
                    </span>
                  </TableCell>
                  <TableCell>{meeting.itemCount}</TableCell>
                </tr>
              ))}
            </tbody>
          </ManagedTable>
        </div>
      )}
    </div>
  );
}

function MeetingForm({
  meeting,
  onCancel,
  onSaved,
}: {
  meeting?: CollegiumMeeting;
  onCancel: () => void;
  onSaved: (meeting: CollegiumMeeting) => void;
}) {
  const people = useServerData(
    async (signal) => meeting === undefined
      ? (await requestCollegiumInitiatives(signal)).people
      : (await requestCollegiumMeeting(meeting.id, signal)).people,
    "Не удалось загрузить участников.",
    0,
  );
  const [form, setForm] = useState<CollegiumMeetingDetailsInput>(() => meeting === undefined
    ? {
        meetingDate: "",
        meetingTime: "10:00",
        format: "in_person",
        location: "",
        participantIds: [],
        absentIds: [],
        quorumNote: "",
      }
    : {
        meetingDate: meeting.meetingDate,
        meetingTime: meeting.meetingTime,
        format: meeting.format,
        location: meeting.location,
        participantIds: meeting.participantIds,
        absentIds: meeting.absentIds,
        quorumNote: meeting.quorumNote,
      });
  const [message, setMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const update = <K extends keyof CollegiumMeetingDetailsInput>(
    field: K,
    value: CollegiumMeetingDetailsInput[K],
  ) => {
    setForm((current) => ({ ...current, [field]: value }));
    setMessage("");
  };

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (form.meetingDate === "" || form.meetingTime === "") {
      setMessage("Укажите дату и время заседания.");
      return;
    }
    setIsSaving(true);
    try {
      onSaved(await sendCollegiumMeetingRequest(
        meeting?.id,
        "",
        meeting === undefined ? "POST" : "PATCH",
        meeting === undefined ? form : { ...form, revision: meeting.revision },
      ));
    } catch (error) {
      setMessage(readShortUserMessage(error instanceof Error ? error.message : "", "Не удалось сохранить заседание."));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form className="collegium-card collegium-form" noValidate onSubmit={submit}>
      <header className="collegium-card-header">
        <div>
          <span className="eyebrow">{meeting?.number ?? "Новое заседание"}</span>
          <h3>{meeting === undefined ? "Заседание Коллегии" : "Реквизиты заседания"}</h3>
        </div>
      </header>
      <fieldset className="collegium-form-section">
        <legend>Реквизиты</legend>
        <div className="collegium-field-grid">
          <label className="collegium-field">
            <span>Дата</span>
            <input
              disabled={isSaving}
              type="date"
              value={form.meetingDate}
              onChange={(event) => {
                const value = event.currentTarget.value;
                update("meetingDate", value);
              }}
            />
          </label>
          <label className="collegium-field">
            <span>Время</span>
            <input
              disabled={isSaving}
              type="time"
              value={form.meetingTime}
              onChange={(event) => {
                const value = event.currentTarget.value;
                update("meetingTime", value);
              }}
            />
          </label>
          <label className="collegium-field">
            <span>Формат</span>
            <select
              disabled={isSaving}
              value={form.format}
              onChange={(event) => {
                const value = event.currentTarget.value as CollegiumMeetingDetailsInput["format"];
                update("format", value);
              }}
            >
              {collegiumMeetingFormats.map((format) => (
                <option key={format} value={format}>{collegiumMeetingFormatLabels[format]}</option>
              ))}
            </select>
          </label>
          <label className="collegium-field">
            <span>Место или ссылка на ВКС</span>
            <input
              disabled={isSaving}
              maxLength={500}
              value={form.location}
              onChange={(event) => {
                const value = event.currentTarget.value;
                update("location", value);
              }}
            />
          </label>
          <label className="collegium-field collegium-field-wide">
            <span>Кворум</span>
            <input
              disabled={isSaving}
              maxLength={500}
              value={form.quorumNote}
              onChange={(event) => {
                const value = event.currentTarget.value;
                update("quorumNote", value);
              }}
            />
          </label>
        </div>
      </fieldset>
      {people.status === "ready" ? (
        <>
          <PeopleChecklist
            disabled={isSaving}
            legend="Участники"
            people={people.data}
            value={form.participantIds}
            onChange={(ids) => {
              update("participantIds", ids);
              update("absentIds", form.absentIds.filter((id) => !ids.includes(id)));
            }}
          />
          <PeopleChecklist
            disabled={isSaving}
            legend="Отсутствующие"
            people={people.data.filter((person) => !form.participantIds.includes(person.id))}
            value={form.absentIds}
            onChange={(ids) => update("absentIds", ids)}
          />
        </>
      ) : people.status === "loading" ? (
        <LoadingIndicator label="Загружаем участников…" variant="inline" />
      ) : (
        <p className="form-message is-error" role="alert">{people.message}</p>
      )}
      {message === "" ? null : <p className="form-message is-error" role="alert">{message}</p>}
      <div className="collegium-form-actions">
        <button className="secondary-button" disabled={isSaving} type="button" onClick={onCancel}>Отмена</button>
        <button className="primary-button" disabled={isSaving} type="submit">
          {isSaving ? <LoadingIndicator label="Сохраняем…" variant="button" /> : "Сохранить"}
        </button>
      </div>
    </form>
  );
}

function PeopleChecklist({
  legend,
  people,
  value,
  disabled,
  onChange,
}: {
  legend: string;
  people: CollegiumPerson[];
  value: string[];
  disabled: boolean;
  onChange: (ids: string[]) => void;
}) {
  return (
    <fieldset className="collegium-form-section">
      <legend>{legend}</legend>
      <div className="collegium-checkbox-group">
        {people.map((person) => (
          <label className="collegium-checkbox" key={person.id}>
            <input
              checked={value.includes(person.id)}
              disabled={disabled}
              type="checkbox"
              onChange={(event) => {
                const checked = event.currentTarget.checked;
                onChange(checked
                  ? [...value, person.id]
                  : value.filter((id) => id !== person.id));
              }}
            />
            <span>{person.displayName}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function MeetingCard({
  id,
  version,
  onBack,
  onChanged,
  onEdit,
  onShowToast,
}: {
  id: string;
  version: number;
  onBack: () => void;
  onChanged: () => void;
  onEdit: (meeting: CollegiumMeeting) => void;
  onShowToast: ShowToast;
}) {
  const detail = useServerData(
    (signal) => requestCollegiumMeeting(id, signal),
    "Не удалось загрузить заседание.",
    version,
  );
  const [message, setMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [cancelComment, setCancelComment] = useState<string>();

  if (detail.status === "loading") return <LoadingIndicator label="Загружаем заседание…" variant="inline" />;
  if (detail.status === "error") {
    return (
      <div className="collegium-card">
        <p className="form-message is-error" role="alert">{detail.message}</p>
        <div className="collegium-form-actions">
          <button className="secondary-button" type="button" onClick={onBack}>К заседаниям</button>
        </div>
      </div>
    );
  }

  const { meeting, people, canManage } = detail.data;
  const isPlanned = meeting.status === "planned";
  const canChange = canManage && isPlanned;

  async function run(action: string, method: "POST" | "PATCH", body: Record<string, unknown>, success: string) {
    setIsSaving(true);
    setMessage("");
    try {
      await sendCollegiumMeetingRequest(meeting.id, action, method, { revision: meeting.revision, ...body });
      onShowToast(success, meeting.number, "success");
      onChanged();
      return true;
    } catch (error) {
      setMessage(readShortUserMessage(error instanceof Error ? error.message : "", "Не удалось сохранить заседание."));
      return false;
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <article className="collegium-card">
      <header className="collegium-card-header">
        <div>
          <span className="eyebrow">{meeting.number}</span>
          <h3>{`Заседание ${formatDate(meeting.meetingDate)} ${meeting.meetingTime}`}</h3>
          <span className={`collegium-status collegium-meeting-status-${meeting.status}`}>
            {collegiumMeetingStatusLabels[meeting.status]}
          </span>
        </div>
        <div className="collegium-form-actions">
          <button className="secondary-button" type="button" onClick={onBack}>К заседаниям</button>
          {canChange ? (
            <>
              <button className="secondary-button" disabled={isSaving} type="button" onClick={() => onEdit(meeting)}>
                Изменить реквизиты
              </button>
              <button
                className="secondary-button"
                disabled={isSaving}
                type="button"
                onClick={() => setCancelComment("")}
              >
                Отменить заседание
              </button>
            </>
          ) : null}
        </div>
      </header>

      {cancelComment === undefined ? null : (
        <form
          className="collegium-action-form"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            if (cancelComment.trim() === "") {
              setMessage("Укажите причину отмены заседания.");
              return;
            }
            void run("cancel", "POST", { comment: cancelComment.trim() }, "Заседание отменено").then((saved) => {
              if (saved) setCancelComment(undefined);
            });
          }}
        >
          <label className="collegium-field">
            <span>Причина отмены (вопросы вернутся в «Готова к рассмотрению»)</span>
            <input
              disabled={isSaving}
              maxLength={2000}
              value={cancelComment}
              onChange={(event) => {
                const value = event.currentTarget.value;
                setCancelComment(value);
              }}
            />
          </label>
          <div className="collegium-form-actions">
            <button className="secondary-button" disabled={isSaving} type="button" onClick={() => setCancelComment(undefined)}>
              Не отменять
            </button>
            <button className="primary-button" disabled={isSaving} type="submit">Отменить заседание</button>
          </div>
        </form>
      )}

      <MeetingDetails meeting={meeting} people={people} />
      <AgendaSection
        canChange={canChange}
        detail={detail.data}
        isSaving={isSaving}
        run={run}
      />
      {/* Remount on every server revision so the editor shows the stored text. */}
      <ProtocolSection detail={detail.data} isSaving={isSaving} key={meeting.revision} run={run} />
      <AttachmentsSection
        api={collegiumMeetingAttachmentsApi(meeting.id)}
        attachments={detail.data.attachments}
        canAttach={canChange}
        ownerLabel={meeting.number}
        onChanged={onChanged}
        onShowToast={onShowToast}
      />
      {message === "" ? null : <p className="form-message is-error" role="alert">{message}</p>}
    </article>
  );
}

function MeetingDetails({ meeting, people }: { meeting: CollegiumMeeting; people: CollegiumPerson[] }) {
  const index = usePeopleIndex(people);
  const names = (ids: readonly string[]) => ids.map((id) => index.name(id) || "Учётная запись недоступна").join(", ");
  return (
    <section className="collegium-card-section">
      <h4>Реквизиты</h4>
      <dl className="collegium-card-grid">
        <div className="collegium-card-value"><dt>Формат</dt><dd>{collegiumMeetingFormatLabels[meeting.format]}</dd></div>
        <div className="collegium-card-value"><dt>Место или ссылка</dt><dd>{meeting.location || "—"}</dd></div>
        <div className="collegium-card-value"><dt>Кворум</dt><dd>{meeting.quorumNote || "—"}</dd></div>
        <div className="collegium-card-value collegium-field-wide"><dt>Участники</dt><dd>{names(meeting.participantIds) || "—"}</dd></div>
        <div className="collegium-card-value collegium-field-wide"><dt>Отсутствующие</dt><dd>{names(meeting.absentIds) || "—"}</dd></div>
        {meeting.cancelComment === undefined ? null : (
          <div className="collegium-card-value collegium-field-wide"><dt>Причина отмены</dt><dd>{meeting.cancelComment}</dd></div>
        )}
      </dl>
    </section>
  );
}

type RunMeetingRequest = (
  action: string,
  method: "POST" | "PATCH",
  body: Record<string, unknown>,
  success: string,
) => Promise<boolean>;

function AgendaSection({
  detail,
  canChange,
  isSaving,
  run,
}: {
  detail: CollegiumMeetingDetailResponse;
  canChange: boolean;
  isSaving: boolean;
  run: RunMeetingRequest;
}) {
  const { meeting, people, readyInitiatives } = detail;
  const index = usePeopleIndex(people);
  const [initiativeId, setInitiativeId] = useState("");
  const [speakerId, setSpeakerId] = useState("");
  const [durationMinutes, setDurationMinutes] = useState("15");
  const [decisionItemId, setDecisionItemId] = useState<string>();
  const items = meeting.items.filter((item) => item.removedAt === undefined);
  const removed = meeting.items.filter((item) => item.removedAt !== undefined);

  return (
    <section className="collegium-card-section">
      <h4>Повестка</h4>
      {items.length === 0 ? <p className="collegium-empty-note">Вопросов в повестке нет.</p> : (
        <ol className="collegium-agenda">
          {items.map((item) => (
            <li className="collegium-agenda-item" key={item.id}>
              <div className="collegium-agenda-head">
                <strong>{`${item.initiativeNumber} «${item.snapshot.card.title}»`}</strong>
                <span className="collegium-attachment-meta">
                  {[
                    item.speakerId === "" ? "" : `докладчик: ${index.name(item.speakerId)}`,
                    `${item.durationMinutes} мин`,
                    `версия для заседания ${item.snapshot.revision}`,
                    item.discussionStartedAt === undefined ? "" : "обсуждение начато",
                  ].filter(Boolean).join(" · ")}
                </span>
              </div>
              {item.decision === undefined ? null : (
                <p className="collegium-agenda-decision">
                  {`${meeting.status === "approved" ? "Решение" : "Проект решения"}: ${collegiumDecisionLabels[item.decision.decision]}`}
                  {item.decision.comment === "" ? "" : `. ${item.decision.comment}`}
                </p>
              )}
              {canChange ? (
                <div className="collegium-form-actions">
                  {item.discussionStartedAt === undefined ? (
                    <button
                      className="secondary-button"
                      disabled={isSaving}
                      type="button"
                      onClick={() => void run(`items/${item.id}/discussion`, "POST", {}, "Обсуждение начато")}
                    >
                      Начать обсуждение
                    </button>
                  ) : (
                    <button
                      className="secondary-button"
                      disabled={isSaving}
                      type="button"
                      onClick={() => setDecisionItemId(decisionItemId === item.id ? undefined : item.id)}
                    >
                      {item.decision === undefined ? "Записать решение" : "Изменить решение"}
                    </button>
                  )}
                  <button
                    className="secondary-button"
                    disabled={isSaving}
                    type="button"
                    onClick={() => void run(`items/${item.id}/remove`, "POST", {}, "Вопрос снят с повестки")}
                  >
                    Снять с повестки
                  </button>
                </div>
              ) : null}
              {decisionItemId === item.id ? (
                <DecisionForm
                  item={item}
                  isSaving={isSaving}
                  people={people}
                  onCancel={() => setDecisionItemId(undefined)}
                  onSubmit={async (decision) => {
                    const saved = await run(`items/${item.id}/decision`, "POST", decision, "Проект решения сохранён");
                    if (saved) setDecisionItemId(undefined);
                  }}
                />
              ) : null}
            </li>
          ))}
        </ol>
      )}
      {removed.length === 0 ? null : (
        <p className="collegium-note">
          {`Сняты с повестки: ${removed.map((item) => item.initiativeNumber).join(", ")}`}
        </p>
      )}
      {canChange ? (
        <form
          className="collegium-action-form"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            const duration = Number(durationMinutes);
            if (initiativeId === "") return;
            void run("items", "POST", {
              initiativeId,
              speakerId,
              participantIds: [],
              durationMinutes: Number.isInteger(duration) ? duration : 15,
            }, "Вопрос включён в повестку").then((saved) => {
              if (saved) setInitiativeId("");
            });
          }}
        >
          <strong>Включить в повестку</strong>
          {readyInitiatives.length === 0 ? (
            <p className="collegium-note">Нет инициатив в статусе «Готова к рассмотрению».</p>
          ) : (
            <div className="collegium-field-grid">
              <label className="collegium-field">
                <span>Инициатива</span>
                <select
                  disabled={isSaving}
                  value={initiativeId}
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    setInitiativeId(value);
                  }}
                >
                  <option value="">Выберите инициативу</option>
                  {readyInitiatives.map((initiative) => (
                    <option key={initiative.id} value={initiative.id}>{`${initiative.number} — ${initiative.title}`}</option>
                  ))}
                </select>
              </label>
              <label className="collegium-field">
                <span>Докладчик</span>
                <select
                  disabled={isSaving}
                  value={speakerId}
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    setSpeakerId(value);
                  }}
                >
                  <option value="">Не назначен</option>
                  {people.map((person) => (
                    <option key={person.id} value={person.id}>{person.displayName}</option>
                  ))}
                </select>
              </label>
              <label className="collegium-field">
                <span>Регламент, минут</span>
                <input
                  disabled={isSaving}
                  inputMode="numeric"
                  max={240}
                  min={1}
                  type="number"
                  value={durationMinutes}
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    setDurationMinutes(value);
                  }}
                />
              </label>
              <div className="collegium-form-actions">
                <button className="primary-button" disabled={isSaving || initiativeId === ""} type="submit">
                  Включить
                </button>
              </div>
            </div>
          )}
        </form>
      ) : null}
    </section>
  );
}

function DecisionForm({
  item,
  people,
  isSaving,
  onCancel,
  onSubmit,
}: {
  item: CollegiumMeetingItem;
  people: CollegiumPerson[];
  isSaving: boolean;
  onCancel: () => void;
  onSubmit: (decision: Record<string, unknown>) => Promise<void>;
}) {
  const initial: Partial<CollegiumItemDecision> = item.decision ?? {};
  const [decision, setDecision] = useState<CollegiumMeetingDecision | "">(initial.decision ?? "");
  const [comment, setComment] = useState(initial.comment ?? "");
  const [responsibleIds, setResponsibleIds] = useState<string[]>(initial.responsibleIds ?? []);
  const [dueDate, setDueDate] = useState(initial.dueDate ?? "");
  const [kpi, setKpi] = useState(initial.kpi ?? item.snapshot.card.kpiCriterion);
  const [dissent, setDissent] = useState(initial.dissent ?? "");
  const [remarks, setRemarks] = useState(initial.rework?.remarks.join("\n") ?? "");
  const [reworkResponsibleId, setReworkResponsibleId] = useState(initial.rework?.responsibleId ?? item.snapshot.card.initiatorId);
  const [reworkDueDate, setReworkDueDate] = useState(initial.rework?.dueDate ?? "");
  const [readinessCriterion, setReadinessCriterion] = useState(initial.rework?.readinessCriterion ?? "");
  const [message, setMessage] = useState("");

  return (
    <form
      className="collegium-action-form"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        if (decision === "") {
          setMessage("Выберите решение.");
          return;
        }
        if (collegiumMeetingDecisionsRequiringComment.includes(decision) && comment.trim() === "") {
          setMessage("Укажите комментарий к решению.");
          return;
        }
        setMessage("");
        void onSubmit({
          decision,
          comment: comment.trim(),
          responsibleIds,
          dueDate,
          kpi: kpi.trim(),
          dissent: dissent.trim(),
          ...(decision === "return_for_rework"
            ? {
                rework: {
                  remarks: remarks.split("\n").map((remark) => remark.trim()).filter(Boolean),
                  responsibleId: reworkResponsibleId,
                  dueDate: reworkDueDate,
                  readinessCriterion: readinessCriterion.trim(),
                },
              }
            : {}),
        });
      }}
    >
      <div className="collegium-field-grid">
        <label className="collegium-field">
          <span>Решение</span>
          <select
            disabled={isSaving}
            value={decision}
            onChange={(event) => {
              const value = event.currentTarget.value as CollegiumMeetingDecision | "";
              setDecision(value);
            }}
          >
            <option value="">Выберите решение</option>
            {collegiumMeetingDecisions.map((option) => (
              <option key={option} value={option}>{collegiumDecisionLabels[option]}</option>
            ))}
          </select>
        </label>
        <label className="collegium-field">
          <span>Срок</span>
          <input
            disabled={isSaving}
            type="date"
            value={dueDate}
            onChange={(event) => {
              const value = event.currentTarget.value;
              setDueDate(value);
            }}
          />
        </label>
        <label className="collegium-field collegium-field-wide">
          <span>
            {decision !== "" && collegiumMeetingDecisionsRequiringComment.includes(decision)
              ? "Комментарий (обязательно)"
              : "Комментарий"}
          </span>
          <textarea
            disabled={isSaving}
            maxLength={2000}
            rows={2}
            value={comment}
            onChange={(event) => {
              const value = event.currentTarget.value;
              setComment(value);
            }}
          />
        </label>
        <label className="collegium-field collegium-field-wide">
          <span>KPI</span>
          <input
            disabled={isSaving}
            maxLength={1000}
            value={kpi}
            onChange={(event) => {
              const value = event.currentTarget.value;
              setKpi(value);
            }}
          />
        </label>
        <label className="collegium-field collegium-field-wide">
          <span>Особые мнения и разногласия</span>
          <textarea
            disabled={isSaving}
            maxLength={2000}
            rows={2}
            value={dissent}
            onChange={(event) => {
              const value = event.currentTarget.value;
              setDissent(value);
            }}
          />
        </label>
      </div>
      <PeopleChecklist
        disabled={isSaving}
        legend="Ответственные"
        people={people}
        value={responsibleIds}
        onChange={setResponsibleIds}
      />
      {decision === "return_for_rework" ? (
        <div className="collegium-field-grid">
          <label className="collegium-field collegium-field-wide">
            <span>Обязательные замечания (каждое с новой строки)</span>
            <textarea
              disabled={isSaving}
              rows={3}
              value={remarks}
              onChange={(event) => {
                const value = event.currentTarget.value;
                setRemarks(value);
              }}
            />
          </label>
          <label className="collegium-field">
            <span>Ответственный за доработку</span>
            <select
              disabled={isSaving}
              value={reworkResponsibleId}
              onChange={(event) => {
                const value = event.currentTarget.value;
                setReworkResponsibleId(value);
              }}
            >
              <option value="">Не выбран</option>
              {people.map((person) => (
                <option key={person.id} value={person.id}>{person.displayName}</option>
              ))}
            </select>
          </label>
          <label className="collegium-field">
            <span>Срок доработки</span>
            <input
              disabled={isSaving}
              type="date"
              value={reworkDueDate}
              onChange={(event) => {
                const value = event.currentTarget.value;
                setReworkDueDate(value);
              }}
            />
          </label>
          <label className="collegium-field collegium-field-wide">
            <span>Критерий готовности к повторному рассмотрению</span>
            <input
              disabled={isSaving}
              maxLength={1000}
              value={readinessCriterion}
              onChange={(event) => {
                const value = event.currentTarget.value;
                setReadinessCriterion(value);
              }}
            />
          </label>
        </div>
      ) : null}
      {message === "" ? null : <p className="form-message is-error" role="alert">{message}</p>}
      <div className="collegium-form-actions">
        <button className="secondary-button" disabled={isSaving} type="button" onClick={onCancel}>Отмена</button>
        <button className="primary-button" disabled={isSaving} type="submit">Сохранить проект решения</button>
      </div>
    </form>
  );
}

function ProtocolSection({
  detail,
  isSaving,
  run,
}: {
  detail: CollegiumMeetingDetailResponse;
  isSaving: boolean;
  run: RunMeetingRequest;
}) {
  const { meeting, canManage, canApprove } = detail;
  const [text, setText] = useState(meeting.protocol.text);
  const isPlanned = meeting.status === "planned";
  const protocol = meeting.protocol;

  if (!isPlanned) {
    return (
      <section className="collegium-card-section">
        <h4>Протокол</h4>
        {protocol.approvedAt === undefined ? (
          <p className="collegium-empty-note">Протокол не утверждался.</p>
        ) : (
          <>
            <p className="collegium-note">
              {`Протокол № ${protocol.number ?? meeting.number} утверждён ${formatDateTime(protocol.approvedAt)}, ${protocol.approvedByDisplayName ?? ""}`}
            </p>
            <pre className="collegium-protocol-text">{protocol.text}</pre>
          </>
        )}
      </section>
    );
  }

  return (
    <section className="collegium-card-section">
      <h4>Проект протокола</h4>
      {canManage ? (
        <>
          <textarea
            className="collegium-protocol-editor"
            disabled={isSaving}
            maxLength={60_000}
            placeholder="Сформируйте проект из повестки и решений, затем отредактируйте."
            rows={14}
            value={text}
            onChange={(event) => {
              const value = event.currentTarget.value;
              setText(value);
            }}
          />
          <div className="collegium-form-actions">
            <button
              className="secondary-button"
              disabled={isSaving}
              type="button"
              onClick={() => {
                if (protocol.text !== "" && !window.confirm("Заменить текущий текст проектом из повестки и решений?")) {
                  return;
                }
                void run("protocol/draft", "POST", {}, "Проект протокола сформирован");
              }}
            >
              Сформировать проект
            </button>
            <button
              className="secondary-button"
              disabled={isSaving || text.trim() === "" || text === protocol.text}
              type="button"
              onClick={() => void run("protocol", "PATCH", { text }, "Текст протокола сохранён")}
            >
              Сохранить текст
            </button>
            {canApprove ? (
              <button
                className="primary-button"
                disabled={isSaving || protocol.text.trim() === "" || text !== protocol.text}
                type="button"
                onClick={() => void run("protocol/approve", "POST", {}, "Протокол утверждён")}
              >
                Утвердить протокол
              </button>
            ) : null}
          </div>
          <p className="collegium-note">
            Утверждение применяет решения по всем вопросам повестки, присваивает протоколу номер
            заседания и закрывает его для изменений.
          </p>
        </>
      ) : protocol.text === "" ? (
        <p className="collegium-empty-note">Проект протокола ещё не сформирован.</p>
      ) : (
        <pre className="collegium-protocol-text">{protocol.text}</pre>
      )}
    </section>
  );
}
