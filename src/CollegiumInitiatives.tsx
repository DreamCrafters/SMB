import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import {
  collegiumActionsRequiringComment,
  collegiumResultConclusionLabels,
  collegiumResultConclusions,
  collegiumSummaryStatusLabels,
  type CollegiumResultConclusion,
  collegiumCommentKindLabels,
  collegiumCommentKinds,
  collegiumInitiativeActionLabels,
  collegiumCostVatLabels,
  collegiumCostVatOptions,
  collegiumDecisionLabels,
  collegiumInitiativeFieldLabels,
  collegiumInitiativeStatusLabels,
  collegiumInitiativeStatuses,
  collegiumRecurringPeriodLabels,
  collegiumRecurringPeriods,
  collegiumRequestedDecisions,
  maxCollegiumInitiativeRisks,
  type CollegiumCommentKind,
  type CollegiumInitiative,
  type CollegiumInitiativeAction,
  type CollegiumInitiativeCard,
  type CollegiumInitiativeCardInput,
  type CollegiumInitiativeDetailResponse,
  type CollegiumInitiativeListResponse,
  type CollegiumInitiativeStatus,
  type CollegiumPerson,
} from "./contracts/collegiumInitiatives";
import type { ServerUserProfile } from "./contracts";
import { CollegiumMeetingsView } from "./CollegiumMeetings";
import { LoadingIndicator } from "./LoadingIndicator";
import { ManagedTable } from "./ManagedTable";
import { TableCell, TableHeader } from "./TableCell";
import {
  actOnCollegiumInitiative,
  createCollegiumAssignmentFromInitiative,
  recordCollegiumInitiativeResult,
  collegiumInitiativeAttachmentsApi,
  commentCollegiumInitiative,
  requestCollegiumInitiative,
  resolveCollegiumInitiativeComment,
  requestCollegiumInitiatives,
  saveCollegiumInitiative,
} from "./services/collegiumInitiatives";
import type { ShowToast } from "./services/toastStack";
import { readShortUserMessage } from "./services/userFacingMessages";
import {
  AttachmentsSection,
  formatAmount,
  formatDate,
  formatDateTime,
  usePeopleIndex,
} from "./CollegiumShared";

type View =
  | { kind: "registry" }
  | { kind: "card"; id: string }
  | { kind: "form"; id?: string };

type LoadState<T> =
  | { status: "loading" }
  | { status: "ready"; data: T }
  | { status: "error"; message: string };

/**
 * Задача 135: модуль «Инициативы Коллегии». Срез 1 — реестр, карточка и
 * экспресс-карта; маршрут, заседания и поручения подключаются следующими
 * срезами (docs/collegium-initiatives.md). Права и данные приходят с сервера,
 * кнопки лишь отражают server-owned разрешения.
 */
export function CollegiumInitiativesWorkspace({
  profile,
  onShowToast,
}: {
  profile: ServerUserProfile;
  onShowToast: ShowToast;
}) {
  const [listState, setListState] = useState<LoadState<CollegiumInitiativeListResponse>>({
    status: "loading",
  });
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [view, setView] = useState<View>({ kind: "registry" });
  const [section, setSection] = useState<"initiatives" | "meetings">("initiatives");

  useEffect(() => {
    const controller = new AbortController();
    requestCollegiumInitiatives(controller.signal).then(
      (data) => setListState({ status: "ready", data }),
      (error: unknown) => {
        if (controller.signal.aborted) return;
        setListState({
          status: "error",
          message: readShortUserMessage(
            error instanceof Error ? error.message : "",
            "Не удалось загрузить инициативы.",
          ),
        });
      },
    );
    return () => controller.abort();
  }, [refreshVersion, profile.userId]);

  if (listState.status === "loading") {
    return <LoadingIndicator label="Загружаем инициативы…" variant="page" />;
  }
  if (listState.status === "error") {
    return (
      <section className="collegium-initiatives-workspace">
        <p className="form-message is-error" role="alert">{listState.message}</p>
      </section>
    );
  }

  const { data } = listState;
  const afterSave = (initiative: CollegiumInitiative, created: boolean) => {
    onShowToast(
      created ? "Инициатива создана" : "Инициатива сохранена",
      `${initiative.number} · ${initiative.card.title}`,
      "success",
    );
    setRefreshVersion((version) => version + 1);
    setView({ kind: "card", id: initiative.id });
  };

  return (
    <section className="collegium-initiatives-workspace">
      <header className="collegium-initiatives-header">
        <span className="eyebrow">Коллегия</span>
        <h2>Инициативы Коллегии</h2>
        <div className="collegium-section-tabs" role="tablist">
          {([
            ["initiatives", "Инициативы"],
            ["meetings", "Заседания"],
          ] as const).map(([id, label]) => (
            <button
              aria-selected={section === id}
              className={section === id ? "is-active" : undefined}
              key={id}
              role="tab"
              type="button"
              onClick={() => {
                setSection(id);
                setView({ kind: "registry" });
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </header>
      {section === "meetings" ? (
        <CollegiumMeetingsView
          permissions={data.permissions}
          onInitiativesChanged={() => setRefreshVersion((version) => version + 1)}
          onShowToast={onShowToast}
        />
      ) : view.kind === "registry" ? (
        <InitiativeRegistry
          data={data}
          profile={profile}
          onCreate={() => setView({ kind: "form" })}
          onOpen={(id) => setView({ kind: "card", id })}
        />
      ) : view.kind === "card" ? (
        <InitiativeCardView
          id={view.id}
          data={data}
          refreshVersion={refreshVersion}
          onBack={() => setView({ kind: "registry" })}
          onChanged={() => setRefreshVersion((version) => version + 1)}
          onEdit={() => setView({ kind: "form", id: view.id })}
          onShowToast={onShowToast}
        />
      ) : (
        <InitiativeForm
          id={view.id}
          data={data}
          onCancel={() => setView(view.id === undefined
            ? { kind: "registry" }
            : { kind: "card", id: view.id })}
          onSaved={afterSave}
        />
      )}
    </section>
  );
}

function InitiativeRegistry({
  data,
  profile,
  onCreate,
  onOpen,
}: {
  data: CollegiumInitiativeListResponse;
  profile: ServerUserProfile;
  onCreate: () => void;
  onOpen: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<CollegiumInitiativeStatus | "">("");
  const [direction, setDirection] = useState("");
  const [onlyMine, setOnlyMine] = useState(false);
  const people = usePeopleIndex(data.people);
  const ownAccountId = `account:${profile.userId}`;

  const initiatives = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("ru-RU");
    return data.initiatives.filter((initiative) => {
      if (status !== "" && initiative.status !== status) return false;
      if (direction !== "" && initiative.card.directionCode !== direction) return false;
      if (onlyMine && ![
        initiative.card.initiatorId,
        initiative.card.ownerId,
        initiative.card.executorId,
        initiative.card.executionControllerId,
        initiative.card.effectControllerId,
      ].includes(ownAccountId) && initiative.createdByUserId !== profile.userId) {
        return false;
      }
      if (normalizedQuery === "") return true;
      return [
        initiative.number,
        initiative.card.title,
        initiative.card.problem,
        initiative.card.solution,
        people.name(initiative.card.initiatorId),
      ].some((value) => value.toLocaleLowerCase("ru-RU").includes(normalizedQuery));
    });
  }, [data.initiatives, direction, onlyMine, ownAccountId, people, profile.userId, query, status]);

  return (
    <div className="collegium-registry">
      <div className="collegium-toolbar">
        <label className="collegium-field">
          <span>Поиск</span>
          <input
            maxLength={120}
            placeholder="Номер, название, текст идеи или автор"
            value={query}
            onChange={(event) => {
              const value = event.currentTarget.value;
              setQuery(value);
            }}
          />
        </label>
        <label className="collegium-field">
          <span>Статус</span>
          <select
            value={status}
            onChange={(event) => {
              const value = event.currentTarget.value as CollegiumInitiativeStatus | "";
              setStatus(value);
            }}
          >
            <option value="">Все статусы</option>
            {collegiumInitiativeStatuses.map((item) => (
              <option key={item} value={item}>{collegiumInitiativeStatusLabels[item]}</option>
            ))}
          </select>
        </label>
        <label className="collegium-field">
          <span>Направление</span>
          <select
            value={direction}
            onChange={(event) => {
              const value = event.currentTarget.value;
              setDirection(value);
            }}
          >
            <option value="">Все направления</option>
            {data.reference.direction.map((option) => (
              <option key={option.code} value={option.code}>{option.label}</option>
            ))}
          </select>
        </label>
        <label className="collegium-checkbox">
          <input
            checked={onlyMine}
            type="checkbox"
            onChange={(event) => {
              const checked = event.currentTarget.checked;
              setOnlyMine(checked);
            }}
          />
          <span>Только мои</span>
        </label>
        {data.permissions.canParticipate ? (
          <button className="primary-button collegium-create-button" type="button" onClick={onCreate}>
            Новая инициатива
          </button>
        ) : null}
      </div>

      {initiatives.length === 0 ? (
        <p className="collegium-empty-note">
          {data.initiatives.length === 0
            ? "Инициатив пока нет."
            : "По выбранным фильтрам инициатив нет."}
        </p>
      ) : (
        <div className="table-scroll history-table-scroll collegium-table-scroll">
          <ManagedTable tableId="collegium.initiatives" className="data-table collegium-initiatives-table">
            <thead>
              <tr>
                <TableHeader>Номер</TableHeader>
                <TableHeader>Наименование</TableHeader>
                <TableHeader>Статус</TableHeader>
                <TableHeader>Направление</TableHeader>
                <TableHeader>Инициатор</TableHeader>
                <TableHeader>Владелец</TableHeader>
                <TableHeader>Ожидаемый эффект</TableHeader>
                <TableHeader>Плановый результат</TableHeader>
                <TableHeader>Изменена</TableHeader>
              </tr>
            </thead>
            <tbody>
              {initiatives.map((initiative) => (
                <tr key={initiative.id}>
                  <TableCell>
                    <button
                      className="board-assignment-link collegium-initiative-link"
                      type="button"
                      onClick={() => onOpen(initiative.id)}
                    >
                      {initiative.number}
                    </button>
                  </TableCell>
                  <TableCell>{initiative.card.title}</TableCell>
                  <TableCell>
                    <span className={`collegium-status collegium-status-${initiative.status}`}>
                      {collegiumInitiativeStatusLabels[initiative.status]}
                    </span>
                  </TableCell>
                  <TableCell>{initiative.card.directionLabel || "—"}</TableCell>
                  <TableCell>{people.name(initiative.card.initiatorId) || "—"}</TableCell>
                  <TableCell>{people.name(initiative.card.ownerId) || "—"}</TableCell>
                  <TableCell>{formatAmount(initiative.card.expectedEffectAmount)}</TableCell>
                  <TableCell>{formatDate(initiative.card.plannedResult)}</TableCell>
                  <TableCell>{formatDateTime(initiative.updatedAt)}</TableCell>
                </tr>
              ))}
            </tbody>
          </ManagedTable>
        </div>
      )}
    </div>
  );
}

function InitiativeCardView({
  id,
  data,
  refreshVersion,
  onBack,
  onEdit,
  onChanged,
  onShowToast,
}: {
  id: string;
  data: CollegiumInitiativeListResponse;
  refreshVersion: number;
  onBack: () => void;
  onEdit: () => void;
  onChanged: () => void;
  onShowToast: ShowToast;
}) {
  const detail = useInitiativeDetail(id, refreshVersion);
  const peopleIndex = usePeopleIndex(data.people);
  const [diffRevision, setDiffRevision] = useState<number>();

  if (detail.status === "loading") {
    return <LoadingIndicator label="Загружаем карточку…" variant="inline" />;
  }
  if (detail.status === "error") {
    return (
      <div className="collegium-card">
        <p className="form-message is-error" role="alert">{detail.message}</p>
        <div className="collegium-form-actions">
          <button className="secondary-button" type="button" onClick={onBack}>К реестру</button>
        </div>
      </div>
    );
  }

  const { initiative, revisions, canEdit } = detail.data;
  const card = initiative.card;
  const person = (accountId: string) => peopleIndex.name(accountId) || (accountId === "" ? "" : "Учётная запись недоступна");
  // The workspace bumps its refresh version, which reloads both the list and this card.
  const reload = onChanged;
  const diffIndex = revisions.findIndex((revision) => revision.revision === diffRevision);
  const diffAfter = diffIndex === -1 ? undefined : revisions[diffIndex];
  const diffBefore = diffIndex === -1 ? undefined : revisions[diffIndex + 1];

  return (
    <article className="collegium-card">
      <header className="collegium-card-header">
        <div>
          <span className="eyebrow">{initiative.number}</span>
          <h3>{card.title}</h3>
          <span className={`collegium-status collegium-status-${initiative.status}`}>
            {collegiumInitiativeStatusLabels[initiative.status]}
          </span>
        </div>
        <div className="collegium-form-actions">
          <button className="secondary-button" type="button" onClick={onBack}>К реестру</button>
          {canEdit ? (
            <button className="primary-button" type="button" onClick={onEdit}>Изменить</button>
          ) : null}
        </div>
      </header>

      <WorkflowPanel
        detail={detail.data}
        people={data.people}
        onChanged={reload}
        onShowToast={onShowToast}
      />

      <ImplementationSection
        detail={detail.data}
        people={data.people}
        onChanged={reload}
        onShowToast={onShowToast}
      />

      <CardSection title="Идентификация">
        <CardValue label="Инициатор" value={person(card.initiatorId)} />
        <CardValue label="Дата создания" value={formatDateTime(initiative.createdAt)} />
        <CardValue label={collegiumInitiativeFieldLabels.directionCode} value={card.directionLabel} />
        <CardValue label={collegiumInitiativeFieldLabels.effectTypeCodes} value={card.effectTypeLabels.join(", ")} />
      </CardSection>
      <CardSection title="Проблема">
        <CardValue label={collegiumInitiativeFieldLabels.problem} value={card.problem} wide />
        <CardValue label={collegiumInitiativeFieldLabels.baselineValue} value={card.baselineValue} />
        <CardValue label={collegiumInitiativeFieldLabels.baselinePeriod} value={card.baselinePeriod} />
        <CardValue label={collegiumInitiativeFieldLabels.baselineSource} value={card.baselineSource} />
      </CardSection>
      <CardSection title="Решение">
        <CardValue label={collegiumInitiativeFieldLabels.solution} value={card.solution} wide />
        <CardValue label={collegiumInitiativeFieldLabels.changeScope} value={card.changeScope} wide />
      </CardSection>
      <CardSection title="Эффект">
        <CardValue label={collegiumInitiativeFieldLabels.expectedEffectAmount} value={formatAmount(card.expectedEffectAmount, "")} />
        <CardValue label={collegiumInitiativeFieldLabels.expectedEffectPeriod} value={card.expectedEffectPeriod} />
        <CardValue label={collegiumInitiativeFieldLabels.expectedEffectKind} value={card.expectedEffectKind} />
        <CardValue label={collegiumInitiativeFieldLabels.effectMethod} value={card.effectMethod} wide />
      </CardSection>
      <CardSection title="Ресурсы">
        <CardValue label={collegiumInitiativeFieldLabels.oneTimeCostAmount} value={formatCardField(card, "oneTimeCostAmount", person)} />
        <CardValue label={collegiumInitiativeFieldLabels.oneTimeCostSource} value={card.oneTimeCostSource} />
        <CardValue label={collegiumInitiativeFieldLabels.recurringCostAmount} value={formatCardField(card, "recurringCostAmount", person)} />
        <CardValue label={collegiumInitiativeFieldLabels.internalResources} value={card.internalResources} wide />
      </CardSection>
      <CardSection title="Роли и сроки">
        <CardValue label={collegiumInitiativeFieldLabels.ownerId} value={person(card.ownerId)} />
        <CardValue label={collegiumInitiativeFieldLabels.executorId} value={person(card.executorId)} />
        <CardValue label={collegiumInitiativeFieldLabels.executionControllerId} value={person(card.executionControllerId)} />
        <CardValue label={collegiumInitiativeFieldLabels.effectControllerId} value={person(card.effectControllerId)} />
        <CardValue label={collegiumInitiativeFieldLabels.plannedStart} value={formatDate(card.plannedStart, "")} />
        <CardValue label={collegiumInitiativeFieldLabels.plannedResult} value={formatDate(card.plannedResult, "")} />
      </CardSection>
      <CardSection title="KPI, риски и решение">
        <CardValue label={collegiumInitiativeFieldLabels.kpiCriterion} value={card.kpiCriterion} wide />
        <CardValue label={collegiumInitiativeFieldLabels.kpiSource} value={card.kpiSource} />
        <CardValue label={collegiumInitiativeFieldLabels.requestedDecision} value={formatCardField(card, "requestedDecision", person)} />
        <CardValue label={collegiumInitiativeFieldLabels.risks} value={card.risks.join("; ")} wide />
      </CardSection>

      <AttachmentsSection
        api={collegiumInitiativeAttachmentsApi(initiative.id)}
        attachments={detail.data.attachments}
        canAttach={detail.data.canAttach}
        ownerLabel={`${initiative.number} · ${card.title}`}
        onChanged={reload}
        onShowToast={onShowToast}
      />

      <CommentsSection
        detail={detail.data}
        canLeaveRemarks={data.permissions.canManage}
        onChanged={reload}
        onShowToast={onShowToast}
      />

      <section className="collegium-card-section">
        <h4>История изменений</h4>
        <div className="table-scroll history-table-scroll collegium-table-scroll">
          <ManagedTable tableId="collegium.initiativeRevisions" className="data-table collegium-revisions-table">
            <thead>
              <tr>
                <TableHeader>Версия</TableHeader>
                <TableHeader>Дата</TableHeader>
                <TableHeader>Автор</TableHeader>
                <TableHeader>Статус</TableHeader>
                <TableHeader>Изменённые поля</TableHeader>
                <TableHeader>Причина</TableHeader>
                <TableHeader>Комментарий</TableHeader>
              </tr>
            </thead>
            <tbody>
              {revisions.map((revision) => (
                <tr key={revision.revision}>
                  <TableCell>{revision.revision}</TableCell>
                  <TableCell>{formatDateTime(revision.createdAt)}</TableCell>
                  <TableCell>{revision.authorDisplayName}</TableCell>
                  <TableCell>{collegiumInitiativeStatusLabels[revision.status]}</TableCell>
                  <TableCell>
                    {revision.changedFields.length === 0
                      ? "—"
                      : (
                          <button
                            className="board-assignment-link collegium-diff-link"
                            type="button"
                            onClick={() => setDiffRevision(
                              diffRevision === revision.revision ? undefined : revision.revision,
                            )}
                          >
                            {revision.changedFields.map((field) => collegiumInitiativeFieldLabels[field]).join(", ")}
                          </button>
                        )}
                  </TableCell>
                  <TableCell>{revision.reason || "—"}</TableCell>
                  <TableCell>{revision.comment || "—"}</TableCell>
                </tr>
              ))}
            </tbody>
          </ManagedTable>
        </div>
        {diffAfter === undefined || diffBefore === undefined ? null : (
          <div className="collegium-diff">
            <h4>{`Было / стало: версия ${diffBefore.revision} → ${diffAfter.revision}`}</h4>
            <dl className="collegium-diff-list">
              {diffAfter.changedFields.map((field) => (
                <div className="collegium-diff-row" key={field}>
                  <dt>{collegiumInitiativeFieldLabels[field]}</dt>
                  <dd className="collegium-diff-before">{formatCardField(diffBefore.card, field, person) || "—"}</dd>
                  <dd className="collegium-diff-after">{formatCardField(diffAfter.card, field, person) || "—"}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}
      </section>
    </article>
  );
}

function WorkflowPanel({
  detail,
  people,
  onChanged,
  onShowToast,
}: {
  detail: CollegiumInitiativeDetailResponse;
  people: CollegiumPerson[];
  onChanged: () => void;
  onShowToast: ShowToast;
}) {
  const { initiative, actions, missingAdmissionFields } = detail;
  const [pendingAction, setPendingAction] = useState<CollegiumInitiativeAction>();
  const [comment, setComment] = useState("");
  const [remarks, setRemarks] = useState("");
  const [responsibleId, setResponsibleId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [readinessCriterion, setReadinessCriterion] = useState("");
  const [message, setMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const peopleIndex = usePeopleIndex(people);
  const showsAdmission = ["draft", "preliminary_review", "rework", "needs_elaboration"]
    .includes(initiative.status);
  const rework = initiative.workflow.rework;

  function startAction(action: CollegiumInitiativeAction) {
    setPendingAction(action);
    setComment("");
    setMessage("");
    if (action === "return_for_rework") {
      setRemarks("");
      setResponsibleId(initiative.card.initiatorId);
      setDueDate("");
      setReadinessCriterion("");
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pendingAction === undefined) return;
    if (collegiumActionsRequiringComment.includes(pendingAction) && comment.trim() === "") {
      setMessage("Укажите комментарий к решению.");
      return;
    }
    setIsSaving(true);
    setMessage("");
    try {
      await actOnCollegiumInitiative(initiative.id, {
        action: pendingAction,
        revision: initiative.revision,
        ...(comment.trim() === "" ? {} : { comment: comment.trim() }),
        ...(pendingAction === "return_for_rework"
          ? {
              rework: {
                remarks: remarks.split("\n").map((remark) => remark.trim()).filter(Boolean),
                responsibleId,
                dueDate,
                readinessCriterion: readinessCriterion.trim(),
              },
            }
          : {}),
      });
      onShowToast(
        collegiumInitiativeActionLabels[pendingAction],
        `${initiative.number} · ${initiative.card.title}`,
        "success",
      );
      setPendingAction(undefined);
      onChanged();
    } catch (error) {
      setMessage(readShortUserMessage(
        error instanceof Error ? error.message : "",
        "Не удалось выполнить действие.",
      ));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="collegium-card-section collegium-workflow">
      {initiative.status === "rework" && rework !== undefined ? (
        <div className="collegium-rework-note">
          <strong>Возвращена на доработку</strong>
          <ul>
            {rework.remarks.map((remark, index) => <li key={index}>{remark}</li>)}
          </ul>
          <p>
            {`Ответственный: ${peopleIndex.name(rework.responsibleId) || "—"} · срок ${formatDate(rework.dueDate)} · `}
            {`критерий готовности: ${rework.readinessCriterion}`}
          </p>
        </div>
      ) : null}
      {showsAdmission ? (
        missingAdmissionFields.length === 0 ? (
          <p className="collegium-admission-ready">Карточка заполнена для вынесения на Коллегию.</p>
        ) : (
          <div className="collegium-admission-gaps">
            <strong>Для вынесения на Коллегию не хватает:</strong>
            <ul>
              {missingAdmissionFields.map((gap, index) => <li key={index}>{gap}</li>)}
            </ul>
          </div>
        )
      ) : null}
      {actions.length === 0 ? null : (
        <div className="collegium-form-actions">
          {actions.map((action) => (
            <button
              className={action === "admit" || action === "submit_for_review" ? "primary-button" : "secondary-button"}
              disabled={isSaving}
              key={action}
              type="button"
              onClick={() => startAction(action)}
            >
              {collegiumInitiativeActionLabels[action]}
            </button>
          ))}
        </div>
      )}
      {pendingAction === undefined ? null : (
        <form className="collegium-action-form" noValidate onSubmit={submit}>
          <strong>{collegiumInitiativeActionLabels[pendingAction]}</strong>
          {pendingAction === "return_for_rework" ? (
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
                  value={responsibleId}
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    setResponsibleId(value);
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
                  value={dueDate}
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    setDueDate(value);
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
          <label className="collegium-field">
            <span>
              {collegiumActionsRequiringComment.includes(pendingAction)
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
          {message === "" ? null : <p className="form-message is-error" role="alert">{message}</p>}
          <div className="collegium-form-actions">
            <button
              className="secondary-button"
              disabled={isSaving}
              type="button"
              onClick={() => setPendingAction(undefined)}
            >
              Отмена
            </button>
            <button className="primary-button" disabled={isSaving} type="submit">
              {isSaving ? <LoadingIndicator label="Сохраняем…" variant="button" /> : "Подтвердить"}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

const assignmentStatusLabels: Record<string, string> = {
  in_progress: "В работе",
  under_review: "На проверке",
  revision_requested: "На доработке",
  completed: "Завершено",
};

const implementationStatuses: readonly CollegiumInitiativeStatus[] = [
  "approved_pilot",
  "approved_implementation",
  "in_progress",
  "result_confirmation",
  "done_confirmed",
  "done_unconfirmed",
];

/** Исполнение: поручения Коллегии, фактический результат и подтверждение эффекта. */
function ImplementationSection({
  detail,
  people,
  onChanged,
  onShowToast,
}: {
  detail: CollegiumInitiativeDetailResponse;
  people: CollegiumPerson[];
  onChanged: () => void;
  onShowToast: ShowToast;
}) {
  const { initiative, linkedAssignments, canCreateAssignments, canRecordResult, summaryStatus } = detail;
  const result = initiative.workflow.result;
  const confirmation = initiative.workflow.effectConfirmation;
  const [isCreating, setIsCreating] = useState(false);
  const [isEditingResult, setIsEditingResult] = useState(false);
  if (
    !implementationStatuses.includes(initiative.status) &&
    linkedAssignments.length === 0 &&
    result === undefined
  ) {
    return null;
  }

  return (
    <section className="collegium-card-section collegium-implementation">
      <h4>
        {"Исполнение "}
        <span className={`collegium-status collegium-summary-${summaryStatus}`}>
          {collegiumSummaryStatusLabels[summaryStatus]}
        </span>
      </h4>
      {initiative.workflow.lastDecision === undefined ? null : (
        <p className="collegium-note">
          {`Решение Коллегии: ${collegiumDecisionLabels[initiative.workflow.lastDecision.decision]}, протокол № ${initiative.workflow.lastDecision.protocolNumber} от ${formatDate(initiative.workflow.lastDecision.meetingDate)}, вопрос ${initiative.workflow.lastDecision.itemOrder}.`}
        </p>
      )}
      {linkedAssignments.length === 0 ? (
        <p className="collegium-empty-note">Поручений по инициативе пока нет.</p>
      ) : (
        <div className="table-scroll collegium-table-scroll">
          <ManagedTable tableId="collegium.initiativeAssignments" className="data-table collegium-assignments-table">
            <thead>
              <tr>
                <TableHeader>Номер</TableHeader>
                <TableHeader>Поручение</TableHeader>
                <TableHeader>Ответственный</TableHeader>
                <TableHeader>Срок</TableHeader>
                <TableHeader>Статус</TableHeader>
              </tr>
            </thead>
            <tbody>
              {linkedAssignments.map((assignment) => (
                <tr className={assignment.isOverdue ? "collegium-assignment-overdue" : undefined} key={assignment.id}>
                  <TableCell>{assignment.number}</TableCell>
                  <TableCell>{assignment.summary}</TableCell>
                  <TableCell>{assignment.responsibleName || "—"}</TableCell>
                  <TableCell>{formatDate(assignment.deadline)}</TableCell>
                  <TableCell>
                    {assignment.status === "completed" && assignment.completedOn !== ""
                      ? `${assignmentStatusLabels.completed} ${formatDate(assignment.completedOn)}`
                      : `${assignmentStatusLabels[assignment.status] ?? assignment.status}${assignment.isOverdue ? ", просрочено" : ""}`}
                  </TableCell>
                </tr>
              ))}
            </tbody>
          </ManagedTable>
        </div>
      )}
      {canCreateAssignments ? (
        isCreating ? (
          <AssignmentFromInitiativeForm
            detail={detail}
            people={people}
            onCancel={() => setIsCreating(false)}
            onCreated={(number) => {
              setIsCreating(false);
              onShowToast("Поручение создано", `${number} · ${initiative.number}`, "success");
              onChanged();
            }}
          />
        ) : (
          <div className="collegium-form-actions">
            <button className="primary-button" type="button" onClick={() => setIsCreating(true)}>
              Создать поручение
            </button>
          </div>
        )
      ) : null}

      <div className="collegium-result">
        <strong>Фактический результат</strong>
        {result === undefined ? (
          <p className="collegium-empty-note">Фактический результат ещё не внесён.</p>
        ) : (
          <dl className="collegium-card-grid">
            <div className="collegium-card-value collegium-field-wide"><dt>Результат</dt><dd>{result.description || "—"}</dd></div>
            <div className="collegium-card-value"><dt>Фактический эффект</dt><dd>{formatAmount(result.actualEffectAmount)}</dd></div>
            <div className="collegium-card-value"><dt>Источник подтверждения</dt><dd>{result.source || "—"}</dd></div>
            <div className="collegium-card-value">
              <dt>Вывод</dt>
              <dd>{result.conclusion === "" ? "—" : collegiumResultConclusionLabels[result.conclusion]}</dd>
            </div>
            <div className="collegium-card-value">
              <dt>Внесён</dt>
              <dd>{`${result.recordedByDisplayName}, ${formatDateTime(result.recordedAt)}`}</dd>
            </div>
          </dl>
        )}
        {confirmation === undefined ? null : (
          <p className="collegium-admission-ready">
            {`Эффект подтверждён: ${confirmation.confirmedByDisplayName}, ${formatDateTime(confirmation.confirmedAt)}.`}
          </p>
        )}
        {canRecordResult && !isEditingResult ? (
          <div className="collegium-form-actions">
            <button className="secondary-button" type="button" onClick={() => setIsEditingResult(true)}>
              {result === undefined ? "Внести фактический результат" : "Изменить фактический результат"}
            </button>
          </div>
        ) : null}
        {canRecordResult && isEditingResult ? (
          <ResultForm
            detail={detail}
            onCancel={() => setIsEditingResult(false)}
            onSaved={() => {
              setIsEditingResult(false);
              onShowToast("Результат сохранён", initiative.number, "success");
              onChanged();
            }}
          />
        ) : null}
      </div>
    </section>
  );
}

function AssignmentFromInitiativeForm({
  detail,
  people,
  onCancel,
  onCreated,
}: {
  detail: CollegiumInitiativeDetailResponse;
  people: CollegiumPerson[];
  onCancel: () => void;
  onCreated: (number: string) => void;
}) {
  const { initiative } = detail;
  const card = initiative.card;
  const decision = initiative.workflow.lastDecision;
  const peopleIndex = usePeopleIndex(people);
  const [summary, setSummary] = useState(`По инициативе ${initiative.number} «${card.title}»: `);
  const [responsibleId, setResponsibleId] = useState(card.executorId);
  const [deadline, setDeadline] = useState(card.plannedResult);
  const [note, setNote] = useState([
    card.kpiCriterion === "" ? "" : `Ожидаемый результат и KPI: ${card.kpiCriterion}.`,
    card.executionControllerId === "" ? "" : `Контролёр исполнения: ${peopleIndex.name(card.executionControllerId)}.`,
    card.effectControllerId === "" ? "" : `Контролёр эффекта: ${peopleIndex.name(card.effectControllerId)}.`,
    card.internalResources === "" ? "" : `Ресурсы: ${card.internalResources}.`,
  ].filter(Boolean).join(" "));
  const [message, setMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (summary.trim() === "" || responsibleId === "" || deadline === "") {
      setMessage("Укажите суть поручения, ответственного и срок.");
      return;
    }
    const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Moscow" }).format(new Date());
    setIsSaving(true);
    setMessage("");
    try {
      const assignment = await createCollegiumAssignmentFromInitiative({
        assignedOn: today,
        kind: "Поручение",
        summary: summary.trim(),
        department: "",
        project: initiative.number,
        responsibleId,
        coExecutorIds: [],
        recurrence: "once",
        activeFrom: deadline,
        activeTo: deadline,
        urgency: "",
        importance: "",
        note: note.trim(),
        progress: "",
        incomingNumber: "",
        sourceBoardAssignmentId: null,
        meetingDate: decision?.meetingDate ?? "",
        protocolNumber: decision?.protocolNumber ?? "",
        decisionNumber: decision === undefined ? "" : String(decision.itemOrder),
        sourceInitiativeId: initiative.id,
      }, `Создано из инициативы ${initiative.number}`);
      onCreated(assignment.number);
    } catch (error) {
      setMessage(readShortUserMessage(error instanceof Error ? error.message : "", "Не удалось создать поручение."));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form className="collegium-action-form" noValidate onSubmit={submit}>
      <strong>Поручение Коллегии по инициативе</strong>
      <p className="collegium-note">
        {decision === undefined
          ? "Поручение будет создано в реестре «Поручения Коллегии»."
          : `Протокол № ${decision.protocolNumber} от ${formatDate(decision.meetingDate)}, вопрос ${decision.itemOrder} — подставятся в поручение.`}
      </p>
      <div className="collegium-field-grid">
        <label className="collegium-field collegium-field-wide">
          <span>Суть поручения</span>
          <textarea
            disabled={isSaving}
            maxLength={20000}
            rows={3}
            value={summary}
            onChange={(event) => {
              const value = event.currentTarget.value;
              setSummary(value);
            }}
          />
        </label>
        <label className="collegium-field">
          <span>Ответственный</span>
          <select
            disabled={isSaving}
            value={responsibleId}
            onChange={(event) => {
              const value = event.currentTarget.value;
              setResponsibleId(value);
            }}
          >
            <option value="">Не выбран</option>
            {people.map((person) => (
              <option key={person.id} value={person.id}>{person.displayName}</option>
            ))}
          </select>
        </label>
        <label className="collegium-field">
          <span>Срок</span>
          <input
            disabled={isSaving}
            type="date"
            value={deadline}
            onChange={(event) => {
              const value = event.currentTarget.value;
              setDeadline(value);
            }}
          />
        </label>
        <label className="collegium-field collegium-field-wide">
          <span>Примечание</span>
          <textarea
            disabled={isSaving}
            maxLength={4000}
            rows={2}
            value={note}
            onChange={(event) => {
              const value = event.currentTarget.value;
              setNote(value);
            }}
          />
        </label>
      </div>
      {message === "" ? null : <p className="form-message is-error" role="alert">{message}</p>}
      <div className="collegium-form-actions">
        <button className="secondary-button" disabled={isSaving} type="button" onClick={onCancel}>Отмена</button>
        <button className="primary-button" disabled={isSaving} type="submit">
          {isSaving ? <LoadingIndicator label="Создаём…" variant="button" /> : "Создать поручение"}
        </button>
      </div>
    </form>
  );
}

function ResultForm({
  detail,
  onCancel,
  onSaved,
}: {
  detail: CollegiumInitiativeDetailResponse;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const { initiative } = detail;
  const current = initiative.workflow.result;
  const [description, setDescription] = useState(current?.description ?? "");
  const [actualEffectAmount, setActualEffectAmount] = useState(formatAmountInput(current?.actualEffectAmount ?? ""));
  const [source, setSource] = useState(current?.source ?? "");
  const [conclusion, setConclusion] = useState<CollegiumResultConclusion | "">(current?.conclusion ?? "");
  const [message, setMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  return (
    <form
      className="collegium-action-form"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        setIsSaving(true);
        setMessage("");
        recordCollegiumInitiativeResult(initiative.id, {
          revision: initiative.revision,
          description: description.trim(),
          actualEffectAmount: actualEffectAmount.trim(),
          source: source.trim(),
          conclusion,
        }).then(onSaved, (error: unknown) => {
          setMessage(readShortUserMessage(error instanceof Error ? error.message : "", "Не удалось сохранить результат."));
        }).finally(() => setIsSaving(false));
      }}
    >
      <div className="collegium-field-grid">
        <label className="collegium-field collegium-field-wide">
          <span>Фактический результат</span>
          <textarea
            disabled={isSaving}
            maxLength={4000}
            rows={3}
            value={description}
            onChange={(event) => {
              const value = event.currentTarget.value;
              setDescription(value);
            }}
          />
        </label>
        <label className="collegium-field">
          <span>Фактический эффект, ₽</span>
          <input
            disabled={isSaving}
            inputMode="decimal"
            maxLength={40}
            value={actualEffectAmount}
            onChange={(event) => {
              const value = event.currentTarget.value;
              setActualEffectAmount(value);
            }}
          />
        </label>
        <label className="collegium-field">
          <span>Источник подтверждения</span>
          <input
            disabled={isSaving}
            maxLength={1000}
            value={source}
            onChange={(event) => {
              const value = event.currentTarget.value;
              setSource(value);
            }}
          />
        </label>
        <label className="collegium-field">
          <span>Вывод</span>
          <select
            disabled={isSaving}
            value={conclusion}
            onChange={(event) => {
              const value = event.currentTarget.value as CollegiumResultConclusion | "";
              setConclusion(value);
            }}
          >
            <option value="">Не выбран</option>
            {collegiumResultConclusions.map((option) => (
              <option key={option} value={option}>{collegiumResultConclusionLabels[option]}</option>
            ))}
          </select>
        </label>
      </div>
      {message === "" ? null : <p className="form-message is-error" role="alert">{message}</p>}
      <div className="collegium-form-actions">
        <button className="secondary-button" disabled={isSaving} type="button" onClick={onCancel}>Отмена</button>
        <button className="primary-button" disabled={isSaving} type="submit">Сохранить результат</button>
      </div>
    </form>
  );
}

function CommentsSection({
  detail,
  canLeaveRemarks,
  onChanged,
  onShowToast,
}: {
  detail: CollegiumInitiativeDetailResponse;
  canLeaveRemarks: boolean;
  onChanged: () => void;
  onShowToast: ShowToast;
}) {
  const { initiative, comments, canComment, canResolveComments } = detail;
  const [kind, setKind] = useState<CollegiumCommentKind>("comment");
  const [text, setText] = useState("");
  const [message, setMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const kinds = collegiumCommentKinds.filter((item) => item !== "remark" || canLeaveRemarks);

  async function run(operation: () => Promise<unknown>, success: string) {
    setIsSaving(true);
    setMessage("");
    try {
      await operation();
      onShowToast(success, `${initiative.number} · ${initiative.card.title}`, "success");
      onChanged();
      return true;
    } catch (error) {
      setMessage(readShortUserMessage(
        error instanceof Error ? error.message : "",
        "Не удалось сохранить комментарий.",
      ));
      return false;
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="collegium-card-section">
      <h4>Обсуждение</h4>
      {comments.length === 0 ? (
        <p className="collegium-empty-note">Комментариев пока нет.</p>
      ) : (
        <ul className="collegium-comments">
          {comments.map((comment) => (
            <li className={`collegium-comment collegium-comment-${comment.kind}`} key={comment.id}>
              <div className="collegium-comment-meta">
                <strong>{collegiumCommentKindLabels[comment.kind]}</strong>
                <span>{`${comment.authorDisplayName} · ${formatDateTime(comment.createdAt)}`}</span>
                {comment.resolvedAt === undefined ? null : (
                  <span className="collegium-comment-resolved">
                    {`Устранено: ${comment.resolvedByDisplayName ?? ""}, ${formatDateTime(comment.resolvedAt)}`}
                  </span>
                )}
              </div>
              <p>{comment.text}</p>
              {comment.kind !== "comment" && comment.resolvedAt === undefined && canResolveComments ? (
                <button
                  className="secondary-button"
                  disabled={isSaving}
                  type="button"
                  onClick={() => void run(
                    () => resolveCollegiumInitiativeComment(initiative.id, comment.id),
                    "Отмечено устранённым",
                  )}
                >
                  Отметить устранённым
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {canComment ? (
        <form
          className="collegium-comment-form"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            if (text.trim() === "") {
              setMessage("Напишите текст комментария.");
              return;
            }
            void run(
              () => commentCollegiumInitiative(initiative.id, { kind, text: text.trim() }),
              "Комментарий добавлен",
            ).then((saved) => {
              if (saved) setText("");
            });
          }}
        >
          <div className="collegium-field-grid">
            <label className="collegium-field">
              <span>Вид</span>
              <select
                disabled={isSaving}
                value={kind}
                onChange={(event) => {
                  const value = event.currentTarget.value as CollegiumCommentKind;
                  setKind(value);
                }}
              >
                {kinds.map((item) => (
                  <option key={item} value={item}>{collegiumCommentKindLabels[item]}</option>
                ))}
              </select>
            </label>
            <label className="collegium-field collegium-field-wide">
              <span>Текст</span>
              <textarea
                disabled={isSaving}
                maxLength={4000}
                rows={2}
                value={text}
                onChange={(event) => {
                  const value = event.currentTarget.value;
                  setText(value);
                }}
              />
            </label>
          </div>
          {message === "" ? null : <p className="form-message is-error" role="alert">{message}</p>}
          <div className="collegium-form-actions">
            <button className="primary-button" disabled={isSaving} type="submit">
              Добавить
            </button>
          </div>
        </form>
      ) : null}
    </section>
  );
}

/** Значение поля карточки для просмотра и сравнения версий. */
function formatCardField(
  card: CollegiumInitiativeCard,
  field: keyof CollegiumInitiativeCardInput,
  person: (accountId: string) => string,
): string {
  switch (field) {
    case "directionCode":
      return card.directionLabel;
    case "effectTypeCodes":
      return card.effectTypeLabels.join(", ");
    case "expectedEffectAmount":
      return formatAmount(card.expectedEffectAmount, "");
    case "oneTimeCostAmount":
      return [
        formatAmount(card.oneTimeCostAmount, ""),
        card.oneTimeCostVat === "" ? "" : collegiumCostVatLabels[card.oneTimeCostVat],
      ].filter(Boolean).join(", ");
    case "recurringCostAmount":
      return [
        formatAmount(card.recurringCostAmount, ""),
        card.recurringCostPeriod === "" ? "" : collegiumRecurringPeriodLabels[card.recurringCostPeriod],
      ].filter(Boolean).join(" ");
    case "oneTimeCostVat":
      return card.oneTimeCostVat === "" ? "" : collegiumCostVatLabels[card.oneTimeCostVat];
    case "recurringCostPeriod":
      return card.recurringCostPeriod === "" ? "" : collegiumRecurringPeriodLabels[card.recurringCostPeriod];
    case "initiatorId":
    case "ownerId":
    case "executorId":
    case "executionControllerId":
    case "effectControllerId":
      return person(card[field]);
    case "plannedStart":
    case "plannedResult":
      return formatDate(card[field], "");
    case "risks":
      return card.risks.join("; ");
    case "requestedDecision":
      return card.requestedDecision === "" ? "" : collegiumDecisionLabels[card.requestedDecision];
    default:
      return card[field];
  }
}

type FormState = Omit<CollegiumInitiativeCardInput, "risks"> & { risks: string[] };

function InitiativeForm({
  id,
  data,
  onCancel,
  onSaved,
}: {
  id?: string;
  data: CollegiumInitiativeListResponse;
  onCancel: () => void;
  onSaved: (initiative: CollegiumInitiative, created: boolean) => void;
}) {
  const detail = useInitiativeDetail(id, 0);
  const [form, setForm] = useState<FormState>(() => createEmptyForm());
  const [reason, setReason] = useState("");
  const [comment, setComment] = useState("");
  const [message, setMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const loaded = id === undefined ? undefined : detail.status === "ready" ? detail.data : undefined;

  useEffect(() => {
    if (loaded !== undefined) setForm(formFromCard(loaded.initiative.card));
  }, [loaded]);

  if (id !== undefined && detail.status === "loading") {
    return <LoadingIndicator label="Загружаем карточку…" variant="inline" />;
  }
  if (id !== undefined && detail.status === "error") {
    return <p className="form-message is-error" role="alert">{detail.message}</p>;
  }

  const status = loaded?.initiative.status ?? "draft";
  const reasonRequired = id !== undefined && status !== "draft";
  const assignable = data.people.filter((person) => person.hasInitiativesTab);
  const update = <K extends keyof FormState>(field: K, value: FormState[K]) => {
    setForm((current) => ({ ...current, [field]: value }));
    setMessage("");
  };

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (form.title.trim() === "") {
      setMessage("Укажите наименование идеи.");
      return;
    }
    if (reasonRequired && reason.trim() === "") {
      setMessage("Укажите причину изменения.");
      return;
    }
    setIsSaving(true);
    setMessage("");
    try {
      const initiative = await saveCollegiumInitiative(id, {
        card: { ...form, risks: form.risks.filter((risk) => risk.trim() !== "") },
        ...(loaded === undefined ? {} : { revision: loaded.initiative.revision }),
        ...(reason.trim() === "" ? {} : { reason: reason.trim() }),
        ...(comment.trim() === "" ? {} : { comment: comment.trim() }),
      });
      onSaved(initiative, id === undefined);
    } catch (error) {
      setMessage(readShortUserMessage(
        error instanceof Error ? error.message : "",
        "Не удалось сохранить инициативу.",
      ));
    } finally {
      setIsSaving(false);
    }
  }

  const text = (field: keyof FormState, options: { long?: boolean; maxLength?: number } = {}) => (
    <label className={`collegium-field${options.long ? " collegium-field-wide" : ""}`}>
      <span>{collegiumInitiativeFieldLabels[field]}</span>
      {options.long ? (
        <textarea
          disabled={isSaving}
          maxLength={options.maxLength ?? 4000}
          rows={3}
          value={form[field] as string}
          onChange={(event) => {
            const value = event.currentTarget.value;
            update(field, value as never);
          }}
        />
      ) : (
        <input
          disabled={isSaving}
          maxLength={options.maxLength ?? 250}
          value={form[field] as string}
          onChange={(event) => {
            const value = event.currentTarget.value;
            update(field, value as never);
          }}
        />
      )}
    </label>
  );

  const amount = (field: "expectedEffectAmount" | "oneTimeCostAmount" | "recurringCostAmount") => (
    <label className="collegium-field">
      <span>{collegiumInitiativeFieldLabels[field]}</span>
      <input
        disabled={isSaving}
        inputMode="decimal"
        maxLength={40}
        placeholder="0,00"
        value={form[field]}
        onChange={(event) => {
          const value = event.currentTarget.value;
          update(field, value);
        }}
      />
    </label>
  );

  const personSelect = (field: "ownerId" | "executorId" | "executionControllerId" | "effectControllerId" | "initiatorId") => {
    const current = form[field];
    const options = current !== "" && !assignable.some(({ id: personId }) => personId === current)
      ? [...assignable, data.people.find(({ id: personId }) => personId === current) ?? {
          id: current, displayName: "Учётная запись недоступна", position: "", hasInitiativesTab: false,
        }]
      : assignable;
    return (
      <label className="collegium-field">
        <span>{collegiumInitiativeFieldLabels[field]}</span>
        <select
          disabled={isSaving}
          value={current}
          onChange={(event) => {
            const value = event.currentTarget.value;
            update(field, value);
          }}
        >
          <option value="">
            {field !== "initiatorId" ? "Не выбран" : id === undefined ? "Я" : "Без изменений"}
          </option>
          {options.map((person) => (
            <option key={person.id} value={person.id}>
              {person.position === "" ? person.displayName : `${person.displayName} — ${person.position}`}
            </option>
          ))}
        </select>
      </label>
    );
  };

  return (
    <form className="collegium-card collegium-form" noValidate onSubmit={submit}>
      <header className="collegium-card-header">
        <div>
          <span className="eyebrow">{loaded?.initiative.number ?? "Новая инициатива"}</span>
          <h3>{id === undefined ? "Экспресс-карта идеи" : "Изменение карточки"}</h3>
          <p className="collegium-note">
            Черновик сохраняется с одним наименованием. Остальные поля понадобятся
            для вынесения идеи на Коллегию.
          </p>
        </div>
      </header>

      <FormSection title="Идентификация">
        {text("title")}
        {data.permissions.canManage ? personSelect("initiatorId") : null}
        <label className="collegium-field">
          <span>{collegiumInitiativeFieldLabels.directionCode}</span>
          <select
            disabled={isSaving}
            value={form.directionCode}
            onChange={(event) => {
              const value = event.currentTarget.value;
              update("directionCode", value);
            }}
          >
            <option value="">Не выбрано</option>
            {data.reference.direction.map((option) => (
              <option key={option.code} value={option.code}>{option.label}</option>
            ))}
          </select>
        </label>
        <fieldset className="collegium-field collegium-field-wide collegium-checkbox-group">
          <legend>{collegiumInitiativeFieldLabels.effectTypeCodes}</legend>
          {data.reference.effect_type.map((option) => (
            <label className="collegium-checkbox" key={option.code}>
              <input
                checked={form.effectTypeCodes.includes(option.code)}
                disabled={isSaving}
                type="checkbox"
                onChange={(event) => {
                  const checked = event.currentTarget.checked;
                  update("effectTypeCodes", checked
                    ? [...form.effectTypeCodes, option.code]
                    : form.effectTypeCodes.filter((code) => code !== option.code));
                }}
              />
              <span>{option.label}</span>
            </label>
          ))}
        </fieldset>
      </FormSection>

      <FormSection title="Проблема">
        {text("problem", { long: true })}
        {text("baselineValue")}
        {text("baselinePeriod")}
        {text("baselineSource")}
      </FormSection>

      <FormSection title="Решение">
        {text("solution", { long: true })}
        {text("changeScope", { long: true })}
      </FormSection>

      <FormSection title="Эффект">
        {amount("expectedEffectAmount")}
        {text("expectedEffectPeriod")}
        {text("expectedEffectKind")}
        {text("effectMethod", { long: true })}
      </FormSection>

      <FormSection title="Ресурсы">
        {amount("oneTimeCostAmount")}
        <label className="collegium-field">
          <span>{collegiumInitiativeFieldLabels.oneTimeCostVat}</span>
          <select
            disabled={isSaving}
            value={form.oneTimeCostVat}
            onChange={(event) => {
              const value = event.currentTarget.value as FormState["oneTimeCostVat"];
              update("oneTimeCostVat", value);
            }}
          >
            <option value="">Не указано</option>
            {collegiumCostVatOptions.map((option) => (
              <option key={option} value={option}>{collegiumCostVatLabels[option]}</option>
            ))}
          </select>
        </label>
        {text("oneTimeCostSource")}
        {amount("recurringCostAmount")}
        <label className="collegium-field">
          <span>{collegiumInitiativeFieldLabels.recurringCostPeriod}</span>
          <select
            disabled={isSaving}
            value={form.recurringCostPeriod}
            onChange={(event) => {
              const value = event.currentTarget.value as FormState["recurringCostPeriod"];
              update("recurringCostPeriod", value);
            }}
          >
            <option value="">Не указано</option>
            {collegiumRecurringPeriods.map((option) => (
              <option key={option} value={option}>{collegiumRecurringPeriodLabels[option]}</option>
            ))}
          </select>
        </label>
        {text("internalResources", { long: true })}
      </FormSection>

      <FormSection title="Роли и сроки">
        {personSelect("ownerId")}
        {personSelect("executorId")}
        {personSelect("executionControllerId")}
        {personSelect("effectControllerId")}
        {(["plannedStart", "plannedResult"] as const).map((field) => (
          <label className="collegium-field" key={field}>
            <span>{collegiumInitiativeFieldLabels[field]}</span>
            <input
              disabled={isSaving}
              type="date"
              value={form[field]}
              onChange={(event) => {
                const value = event.currentTarget.value;
                update(field, value);
              }}
            />
          </label>
        ))}
      </FormSection>

      <FormSection title="KPI, риски и решение">
        {text("kpiCriterion", { long: true })}
        {text("kpiSource")}
        {Array.from({ length: maxCollegiumInitiativeRisks }, (_, index) => (
          <label className="collegium-field" key={index}>
            <span>{`Риск ${index + 1}`}</span>
            <input
              disabled={isSaving}
              maxLength={250}
              value={form.risks[index] ?? ""}
              onChange={(event) => {
                const value = event.currentTarget.value;
                const risks = [...form.risks];
                risks[index] = value;
                update("risks", risks);
              }}
            />
          </label>
        ))}
        <label className="collegium-field">
          <span>{collegiumInitiativeFieldLabels.requestedDecision}</span>
          <select
            disabled={isSaving}
            value={form.requestedDecision}
            onChange={(event) => {
              const value = event.currentTarget.value as FormState["requestedDecision"];
              update("requestedDecision", value);
            }}
          >
            <option value="">Не выбрано</option>
            {collegiumRequestedDecisions.map((option) => (
              <option key={option} value={option}>{collegiumDecisionLabels[option]}</option>
            ))}
          </select>
        </label>
      </FormSection>

      <FormSection title="Изменение">
        {id === undefined ? null : (
          <label className="collegium-field collegium-field-wide">
            <span>{reasonRequired ? "Причина изменения (обязательно)" : "Причина изменения"}</span>
            <input
              disabled={isSaving}
              maxLength={500}
              value={reason}
              onChange={(event) => {
                const value = event.currentTarget.value;
                setReason(value);
              }}
            />
          </label>
        )}
        <label className="collegium-field collegium-field-wide">
          <span>Комментарий к версии</span>
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
      </FormSection>

      {message === "" ? null : <p className="form-message is-error" role="alert">{message}</p>}
      <div className="collegium-form-actions">
        <button className="secondary-button" disabled={isSaving} type="button" onClick={onCancel}>
          Отмена
        </button>
        <button className="primary-button" disabled={isSaving} type="submit">
          {isSaving
            ? <LoadingIndicator label="Сохраняем…" variant="button" />
            : id === undefined ? "Сохранить черновик" : "Сохранить изменения"}
        </button>
      </div>
    </form>
  );
}

function useInitiativeDetail(id: string | undefined, refreshVersion: number) {
  const [state, setState] = useState<LoadState<CollegiumInitiativeDetailResponse>>({
    status: "loading",
  });
  useEffect(() => {
    if (id === undefined) return;
    const controller = new AbortController();
    setState({ status: "loading" });
    requestCollegiumInitiative(id, controller.signal).then(
      (data) => setState({ status: "ready", data }),
      (error: unknown) => {
        if (controller.signal.aborted) return;
        setState({
          status: "error",
          message: readShortUserMessage(
            error instanceof Error ? error.message : "",
            "Не удалось загрузить карточку инициативы.",
          ),
        });
      },
    );
    return () => controller.abort();
  }, [id, refreshVersion]);
  return state;
}

function CardSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="collegium-card-section">
      <h4>{title}</h4>
      <dl className="collegium-card-grid">{children}</dl>
    </section>
  );
}

function CardValue({ label, value, wide = false }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={`collegium-card-value${wide ? " collegium-field-wide" : ""}`}>
      <dt>{label}</dt>
      <dd>{value === "" ? "—" : value}</dd>
    </div>
  );
}

function FormSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="collegium-form-section">
      <legend>{title}</legend>
      <div className="collegium-field-grid">{children}</div>
    </fieldset>
  );
}

function createEmptyForm(): FormState {
  return {
    title: "",
    initiatorId: "",
    directionCode: "",
    effectTypeCodes: [],
    problem: "",
    baselineValue: "",
    baselinePeriod: "",
    baselineSource: "",
    solution: "",
    changeScope: "",
    expectedEffectAmount: "",
    expectedEffectPeriod: "",
    expectedEffectKind: "",
    effectMethod: "",
    oneTimeCostAmount: "",
    oneTimeCostVat: "",
    oneTimeCostSource: "",
    recurringCostAmount: "",
    recurringCostPeriod: "",
    internalResources: "",
    ownerId: "",
    executorId: "",
    executionControllerId: "",
    effectControllerId: "",
    plannedStart: "",
    plannedResult: "",
    kpiCriterion: "",
    kpiSource: "",
    risks: [],
    requestedDecision: "",
  };
}

function formFromCard(card: CollegiumInitiativeCard): FormState {
  const {
    directionLabel: _directionLabel,
    effectTypeLabels: _effectTypeLabels,
    ...input
  } = card;
  return {
    ...input,
    expectedEffectAmount: formatAmountInput(card.expectedEffectAmount),
    oneTimeCostAmount: formatAmountInput(card.oneTimeCostAmount),
    recurringCostAmount: formatAmountInput(card.recurringCostAmount),
  };
}

function formatAmountInput(value: string) {
  return value === "" ? "" : value.replace(".", ",");
}
