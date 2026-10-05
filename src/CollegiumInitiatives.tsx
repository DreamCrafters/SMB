import { useEffect, useState, type FormEvent, type ReactNode } from "react";
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
  collegiumEffectPeriodLabels,
  collegiumEffectPeriods,
  collegiumYesNoLabels,
  collegiumYesNoOptions,
  collegiumInitiativeFieldLabels,
  collegiumInitiativeStatusLabels,
  collegiumInitiativeStages,
  collegiumInitiativeStageLabels,
  collegiumInitiativeStatuses,
  collegiumRecurringPeriodLabels,
  collegiumRecurringPeriods,
  collegiumRequestedDecisions,
  maxCollegiumInitiativeRisks,
  type CollegiumCommentKind,
  type CollegiumRiskInput,
  type CollegiumInitiative,
  type CollegiumInitiativeAction,
  type CollegiumInitiativeCard,
  type CollegiumInitiativeCardInput,
  type CollegiumInitiativeDetailResponse,
  type CollegiumInitiativeRevision,
  type CollegiumInitiativeFilters,
  type CollegiumInitiativeListResponse,
  type CollegiumInitiativeStatus,
  type CollegiumPerson,
} from "./contracts/collegiumInitiatives";
import type { ServerUserProfile } from "./contracts";
import { CollegiumMeetingsView } from "./CollegiumMeetings";
import { CollegiumDashboardView } from "./CollegiumDashboard";
import { CollegiumSettingsView } from "./CollegiumSettings";
import { EconomicsSection, PassportForm, PassportSection } from "./CollegiumPassport";
import { LoadingIndicator } from "./LoadingIndicator";
import { ManagedTable } from "./ManagedTable";
import { TableCell, TableHeader } from "./TableCell";
import {
  actOnCollegiumInitiative,
  collegiumInitiativeCardPdfPath,
  collegiumRegistryExportPath,
  downloadCollegiumFile,
  requestCollegiumAttention,
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
  CardSection,
  CardValue,
  FormSection,
  formatAmount,
  formatDate,
  formatDateTime,
  saveBlob,
  usePeopleIndex,
  useServerData,
} from "./CollegiumShared";

type CollegiumListReference = CollegiumInitiativeListResponse["reference"];

type View =
  | { kind: "registry" }
  | { kind: "card"; id: string }
  | { kind: "form"; id?: string }
  | { kind: "passport"; id: string };

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
  const [section, setSection] = useState<"initiatives" | "meetings" | "dashboard" | "settings">("initiatives");
  const [filters, setFilters] = useState<CollegiumInitiativeFilters>({});
  const filtersKey = JSON.stringify(filters);

  useEffect(() => {
    const controller = new AbortController();
    requestCollegiumInitiatives(controller.signal, JSON.parse(filtersKey) as CollegiumInitiativeFilters).then(
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
  }, [refreshVersion, profile.userId, filtersKey]);

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
            ["dashboard", "Дашборд"],
            ...(data.permissions.canManage ? [["settings", "Настройки"] as const] : []),
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
      {section === "settings" ? (
        <CollegiumSettingsView onShowToast={onShowToast} />
      ) : section === "dashboard" ? (
        <CollegiumDashboardView
          refreshVersion={refreshVersion}
          onOpen={(id) => {
            setSection("initiatives");
            setView({ kind: "card", id });
          }}
        />
      ) : section === "meetings" ? (
        <CollegiumMeetingsView
          permissions={data.permissions}
          onInitiativesChanged={() => setRefreshVersion((version) => version + 1)}
          onShowToast={onShowToast}
        />
      ) : view.kind === "registry" ? (
        <>
        <AttentionPanel
          refreshVersion={refreshVersion}
          onOpen={(id) => setView({ kind: "card", id })}
        />
        <InitiativeRegistry
          data={data}
          filters={filters}
          onApplyFilters={setFilters}
          onCreate={() => setView({ kind: "form" })}
          onOpen={(id) => setView({ kind: "card", id })}
        />
        </>
      ) : view.kind === "card" ? (
        <InitiativeCardView
          id={view.id}
          data={data}
          refreshVersion={refreshVersion}
          onBack={() => setView({ kind: "registry" })}
          onChanged={() => setRefreshVersion((version) => version + 1)}
          onEdit={() => setView({ kind: "form", id: view.id })}
          onEditPassport={() => setView({ kind: "passport", id: view.id })}
          onShowToast={onShowToast}
        />
      ) : view.kind === "passport" ? (
        <PassportFormView
          id={view.id}
          reference={data.reference}
          onCancel={() => setView({ kind: "card", id: view.id })}
          onSaved={(initiative) => {
            onShowToast("Паспорт сохранён", `${initiative.number} · ${initiative.card.title}`, "success");
            setRefreshVersion((version) => version + 1);
            setView({ kind: "card", id: initiative.id });
          }}
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

/** «Требует моего действия»: уведомление в интерфейсе из server-owned правил. */
function AttentionPanel({
  refreshVersion,
  onOpen,
}: {
  refreshVersion: number;
  onOpen: (id: string) => void;
}) {
  const state = useServerData(
    (signal) => requestCollegiumAttention(signal),
    "Не удалось загрузить список действий.",
    refreshVersion,
  );
  if (state.status !== "ready" || state.data.length === 0) {
    return state.status === "error"
      ? <p className="form-message is-error" role="alert">{state.message}</p>
      : null;
  }
  return (
    <section className="collegium-attention" aria-label="Требует моего действия">
      <strong>{`Требует моего действия: ${state.data.length}`}</strong>
      <ul>
        {state.data.map((item) => (
          <li key={item.initiativeId}>
            <button className="board-assignment-link" type="button" onClick={() => onOpen(item.initiativeId)}>
              {`${item.number} «${item.title}»`}
            </button>
            <span>{item.reason}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function InitiativeRegistry({
  data,
  filters,
  onApplyFilters,
  onCreate,
  onOpen,
}: {
  data: CollegiumInitiativeListResponse;
  filters: CollegiumInitiativeFilters;
  onApplyFilters: (filters: CollegiumInitiativeFilters) => void;
  onCreate: () => void;
  onOpen: (id: string) => void;
}) {
  const [draft, setDraft] = useState<CollegiumInitiativeFilters>(filters);
  const [showMore, setShowMore] = useState(() =>
    Object.keys(filters).some((key) => !["query", "status", "directionCode", "mine"].includes(key)));
  const [message, setMessage] = useState("");
  const [isExporting, setIsExporting] = useState(false);
  const people = usePeopleIndex(data.people);
  const initiatives = data.initiatives;
  const overdue = new Set(data.overdueIds);
  const passportRequired = new Set(data.passportRequiredIds ?? []);
  const hasFilters = Object.values(filters).some((value) => value !== undefined && value !== "");
  const setField = <K extends keyof CollegiumInitiativeFilters>(key: K, value: string) => {
    setDraft((current) => {
      const next = { ...current };
      if (value === "") delete next[key];
      else next[key] = value as CollegiumInitiativeFilters[K];
      return next;
    });
  };
  const text = (key: keyof CollegiumInitiativeFilters, label: string, options: { type?: string; placeholder?: string } = {}) => (
    <label className="collegium-field">
      <span>{label}</span>
      <input
        inputMode={options.type === "amount" ? "decimal" : undefined}
        maxLength={120}
        placeholder={options.placeholder}
        type={options.type === "date" ? "date" : "text"}
        value={(draft[key] as string | undefined) ?? ""}
        onChange={(event) => {
          const value = event.currentTarget.value;
          setField(key, value);
        }}
      />
    </label>
  );
  const personFilter = (key: "initiatorId" | "ownerId" | "executorId" | "controllerId", label: string) => (
    <label className="collegium-field">
      <span>{label}</span>
      <select
        value={draft[key] ?? ""}
        onChange={(event) => {
          const value = event.currentTarget.value;
          setField(key, value);
        }}
      >
        <option value="">Все</option>
        {data.people.map((person) => (
          <option key={person.id} value={person.id}>{person.displayName}</option>
        ))}
      </select>
    </label>
  );
  const flag = (key: "boardDecision" | "overdue" | "mine" | "passportRequired", label: string) => (
    <label className="collegium-checkbox">
      <input
        checked={draft[key] === "yes"}
        type="checkbox"
        onChange={(event) => {
          const checked = event.currentTarget.checked;
          setField(key, checked ? "yes" : "");
        }}
      />
      <span>{label}</span>
    </label>
  );

  async function exportRegistry(kind: "xlsx" | "pdf") {
    setIsExporting(true);
    setMessage("");
    try {
      const blob = await downloadCollegiumFile(collegiumRegistryExportPath(kind, filters));
      saveBlob(blob, `Реестр инициатив Коллегии.${kind}`);
    } catch (error) {
      setMessage(readShortUserMessage(error instanceof Error ? error.message : "", "Не удалось сформировать выгрузку."));
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <div className="collegium-registry">
      <form
        className="collegium-filters"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          onApplyFilters(draft);
        }}
      >
        <div className="collegium-toolbar">
          {text("query", "Поиск", { placeholder: "Номер, название, текст идеи, автор, комментарии" })}
          <label className="collegium-field">
            <span>Статус</span>
            <select
              value={draft.status ?? ""}
              onChange={(event) => {
                const value = event.currentTarget.value;
                setField("status", value);
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
              value={draft.directionCode ?? ""}
              onChange={(event) => {
                const value = event.currentTarget.value;
                setField("directionCode", value);
              }}
            >
              <option value="">Все направления</option>
              {data.reference.direction.map((option) => (
                <option key={option.code} value={option.code}>{option.archived === true ? `${option.label} (архив)` : option.label}</option>
              ))}
            </select>
          </label>
          {flag("mine", "Только мои")}
        </div>
        {showMore ? (
          <div className="collegium-field-grid collegium-more-filters">
            {text("createdFrom", "Создана с", { type: "date" })}
            {text("createdTo", "Создана по", { type: "date" })}
            <label className="collegium-field">
              <span>Стадия</span>
              <select
                value={draft.stage ?? ""}
                onChange={(event) => {
                  const value = event.currentTarget.value;
                  setField("stage", value);
                }}
              >
                <option value="">Все стадии</option>
                {collegiumInitiativeStages.map((stage) => (
                  <option key={stage} value={stage}>{collegiumInitiativeStageLabels[stage]}</option>
                ))}
              </select>
            </label>
            <label className="collegium-field">
              <span>Тип эффекта</span>
              <select
                value={draft.effectTypeCode ?? ""}
                onChange={(event) => {
                  const value = event.currentTarget.value;
                  setField("effectTypeCode", value);
                }}
              >
                <option value="">Все типы</option>
                {data.reference.effect_type.map((option) => (
                  <option key={option.code} value={option.code}>{option.archived === true ? `${option.label} (архив)` : option.label}</option>
                ))}
              </select>
            </label>
            {personFilter("initiatorId", "Инициатор")}
            {personFilter("ownerId", "Владелец")}
            {personFilter("executorId", "Исполнитель")}
            {personFilter("controllerId", "Контролёр")}
            {text("costMin", "Разовые затраты от, ₽", { type: "amount" })}
            {text("costMax", "Разовые затраты до, ₽", { type: "amount" })}
            {text("plannedEffectMin", "Плановый эффект от, ₽", { type: "amount" })}
            {text("plannedEffectMax", "Плановый эффект до, ₽", { type: "amount" })}
            {text("actualEffectMin", "Фактический эффект от, ₽", { type: "amount" })}
            {text("actualEffectMax", "Фактический эффект до, ₽", { type: "amount" })}
            <label className="collegium-field">
              <span>Заседание Коллегии</span>
              <select
                value={draft.meetingId ?? ""}
                onChange={(event) => {
                  const value = event.currentTarget.value;
                  setField("meetingId", value);
                }}
              >
                <option value="">Все заседания</option>
                {data.meetings.map((meeting) => (
                  <option key={meeting.id} value={meeting.id}>{`${meeting.number} от ${formatDate(meeting.meetingDate)}`}</option>
                ))}
              </select>
            </label>
            {text("risk", "Риск содержит")}
            <label className="collegium-field">
              <span>Уровень риска</span>
              <select
                value={draft.riskLevelCode ?? ""}
                onChange={(event) => {
                  const value = event.currentTarget.value;
                  setField("riskLevelCode", value);
                }}
              >
                <option value="">Все уровни</option>
                {data.reference.risk_level.map((option) => (
                  <option key={option.code} value={option.code}>
                    {option.archived === true ? `${option.label} (архив)` : option.label}
                  </option>
                ))}
              </select>
            </label>
            {text("paybackMax", "Окупаемость не дольше, мес.", { type: "amount" })}
            <div className="collegium-checkbox-group">
              {flag("boardDecision", "Требует решения СД")}
              {flag("overdue", "Есть просроченные поручения")}
              {flag("passportRequired", "Нужен полный паспорт")}
            </div>
          </div>
        ) : null}
        <div className="collegium-form-actions">
          <button className="secondary-button" type="submit">Применить</button>
          <button
            className="secondary-button"
            disabled={!hasFilters && Object.keys(draft).length === 0}
            type="button"
            onClick={() => {
              setDraft({});
              onApplyFilters({});
            }}
          >
            Сбросить
          </button>
          <button className="secondary-button" type="button" onClick={() => setShowMore((current) => !current)}>
            {showMore ? "Меньше фильтров" : "Ещё фильтры"}
          </button>
          <button className="secondary-button" disabled={isExporting} type="button" onClick={() => void exportRegistry("xlsx")}>
            Выгрузить в Excel
          </button>
          <button className="secondary-button" disabled={isExporting} type="button" onClick={() => void exportRegistry("pdf")}>
            Выгрузить в PDF
          </button>
          {data.permissions.canParticipate ? (
            <button className="primary-button collegium-create-button" type="button" onClick={onCreate}>
              Новая инициатива
            </button>
          ) : null}
        </div>
        {message === "" ? null : <p className="form-message is-error" role="alert">{message}</p>}
      </form>

      {initiatives.length === 0 ? (
        <p className="collegium-empty-note">
          {hasFilters ? "По выбранным фильтрам инициатив нет." : "Инициатив пока нет."}
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
                    {overdue.has(initiative.id) ? <span className="collegium-overdue-mark">просрочены поручения</span> : null}
                    {passportRequired.has(initiative.id) ? <span className="collegium-passport-mark">нужен полный паспорт</span> : null}
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
  onEditPassport,
  onChanged,
  onShowToast,
}: {
  id: string;
  data: CollegiumInitiativeListResponse;
  refreshVersion: number;
  onBack: () => void;
  onEdit: () => void;
  onEditPassport: () => void;
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
          <button
            className="secondary-button"
            type="button"
            onClick={() => {
              void downloadCollegiumFile(collegiumInitiativeCardPdfPath(initiative.id)).then(
                (blob) => saveBlob(blob, `Инициатива ${initiative.number}.pdf`),
                (error: unknown) => onShowToast(
                  "Печатная форма недоступна",
                  readShortUserMessage(error instanceof Error ? error.message : "", "Не удалось сформировать PDF."),
                  "warning",
                ),
              );
            }}
          >
            Печать (PDF)
          </button>
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
        <CardValue label={collegiumInitiativeFieldLabels.expectedEffectPeriod} value={formatEffectPeriod(card.expectedEffectPeriod)} />
        <CardValue label={collegiumInitiativeFieldLabels.expectedEffectKind} value={card.expectedEffectKind} />
        <CardValue label={collegiumInitiativeFieldLabels.effectMethod} value={card.effectMethod} wide />
      </CardSection>
      <CardSection title="Ресурсы">
        <CardValue label={collegiumInitiativeFieldLabels.oneTimeCostAmount} value={formatCardField(card, "oneTimeCostAmount", person)} />
        <CardValue label={collegiumInitiativeFieldLabels.oneTimeCostSource} value={card.oneTimeCostSource} />
        <CardValue label={collegiumInitiativeFieldLabels.recurringCostAmount} value={formatCardField(card, "recurringCostAmount", person)} />
        <CardValue label={collegiumInitiativeFieldLabels.capexAmount} value={formatAmount(card.capexAmount, "")} />
        <CardValue label={collegiumInitiativeFieldLabels.internalResources} value={card.internalResources} wide />
      </CardSection>
      <EconomicsSection detail={detail.data} />
      <PassportSection detail={detail.data} onEdit={onEditPassport} />
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
        <CardValue label={collegiumInitiativeFieldLabels.risks} value={formatRisks(card)} wide />
        {(["changesTechnology", "newProductOrMarket", "boardDecisionRequired"] as const).map((field) => (
          <CardValue key={field} label={collegiumInitiativeFieldLabels[field]} value={formatCardField(card, field, person)} />
        ))}
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
                            {revision.changedFields.map(changedFieldLabel).join(", ")}
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
                  <dt>{changedFieldLabel(field)}</dt>
                  <dd className="collegium-diff-before">{formatChangedField(diffBefore.card, field, person) || "—"}</dd>
                  <dd className="collegium-diff-after">{formatChangedField(diffAfter.card, field, person) || "—"}</dd>
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
function changedFieldLabel(field: CollegiumInitiativeRevision["changedFields"][number]) {
  return field === "passport" ? "Полный паспорт" : collegiumInitiativeFieldLabels[field];
}

/** Паспорт в сравнении версий — сводка заполненности; разделы видны в карточке. */
function formatChangedField(
  card: CollegiumInitiativeCard,
  field: CollegiumInitiativeRevision["changedFields"][number],
  person: (accountId: string) => string,
) {
  if (field !== "passport") return formatCardField(card, field, person);
  const passport = card.passport;
  if (passport === undefined) return "";
  const values = Object.values(passport).filter((value) =>
    typeof value === "string" ? value !== "" : Array.isArray(value) ? value.length > 0 : Object.keys(value).length > 0);
  return `заполнено разделов: ${values.length}`;
}

/** Подпись периода из списка или прежний свободный текст старой карточки. */
function formatEffectPeriod(value: string) {
  return (collegiumEffectPeriodLabels as Record<string, string>)[value] ?? value;
}

function formatRisks(card: CollegiumInitiativeCard) {
  return card.risks
    .map((risk) => (risk.levelLabel === "" ? risk.text : `${risk.text} (${risk.levelLabel.toLocaleLowerCase("ru-RU")})`))
    .join("; ");
}

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
      return formatRisks(card);
    case "expectedEffectPeriod":
      return formatEffectPeriod(card.expectedEffectPeriod);
    case "capexAmount":
      return formatAmount(card.capexAmount, "");
    case "changesTechnology":
    case "newProductOrMarket":
    case "boardDecisionRequired":
      return card[field] === "" ? "" : collegiumYesNoLabels[card[field]];
    case "requestedDecision":
      return card.requestedDecision === "" ? "" : collegiumDecisionLabels[card.requestedDecision];
    default:
      return card[field];
  }
}

type FormState = CollegiumInitiativeCardInput;

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
  // Archived reference values stay selectable only where the saved card uses them.
  const saved = loaded?.initiative.card;
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
        card: { ...form, risks: form.risks.filter((risk) => risk.text.trim() !== "") },
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

  const amount = (field: "expectedEffectAmount" | "oneTimeCostAmount" | "recurringCostAmount" | "capexAmount") => (
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
            {data.reference.direction
              .filter((option) => option.archived !== true || saved?.directionCode === option.code)
              .map((option) => (
                <option key={option.code} value={option.code}>
                  {option.archived === true ? `${option.label} (архив)` : option.label}
                </option>
              ))}
          </select>
        </label>
        <fieldset className="collegium-field collegium-field-wide collegium-checkbox-group">
          <legend>{collegiumInitiativeFieldLabels.effectTypeCodes}</legend>
          {data.reference.effect_type
            .filter((option) => option.archived !== true || saved?.effectTypeCodes.includes(option.code))
            .map((option) => (
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
              <span>{option.archived === true ? `${option.label} (архив)` : option.label}</span>
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
        <label className="collegium-field">
          <span>{collegiumInitiativeFieldLabels.expectedEffectPeriod}</span>
          <select
            disabled={isSaving}
            value={form.expectedEffectPeriod}
            onChange={(event) => {
              const value = event.currentTarget.value;
              update("expectedEffectPeriod", value);
            }}
          >
            <option value="">Не выбрано</option>
            {collegiumEffectPeriods.map((option) => (
              <option key={option} value={option}>{collegiumEffectPeriodLabels[option]}</option>
            ))}
            {/* An old free-text period stays until another one is picked. */}
            {saved !== undefined &&
            saved.expectedEffectPeriod !== "" &&
            !(collegiumEffectPeriods as readonly string[]).includes(saved.expectedEffectPeriod) ? (
              <option value={saved.expectedEffectPeriod}>{`${saved.expectedEffectPeriod} (прежнее значение)`}</option>
            ) : null}
          </select>
        </label>
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
        {amount("capexAmount")}
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
        {Array.from({ length: maxCollegiumInitiativeRisks }, (_, index) => {
          const risk = form.risks[index] ?? { text: "", levelCode: "" };
          const setRisk = (next: CollegiumRiskInput) => {
            const risks = Array.from({ length: Math.max(form.risks.length, index + 1) }, (_, position) =>
              form.risks[position] ?? { text: "", levelCode: "" });
            risks[index] = next;
            update("risks", risks);
          };
          return (
            <div className="collegium-risk-row" key={index}>
              <label className="collegium-field">
                <span>{`Риск ${index + 1}`}</span>
                <input
                  disabled={isSaving}
                  maxLength={250}
                  value={risk.text}
                  onChange={(event) => setRisk({ ...risk, text: event.currentTarget.value })}
                />
              </label>
              <label className="collegium-field">
                <span>{`Уровень риска ${index + 1}`}</span>
                <select
                  disabled={isSaving}
                  value={risk.levelCode}
                  onChange={(event) => setRisk({ ...risk, levelCode: event.currentTarget.value })}
                >
                  <option value="">Не выбран</option>
                  {data.reference.risk_level
                    .filter((option) => option.archived !== true || saved?.risks.some((item) => item.levelCode === option.code))
                    .map((option) => (
                      <option key={option.code} value={option.code}>
                        {option.archived === true ? `${option.label} (архив)` : option.label}
                      </option>
                    ))}
                </select>
              </label>
            </div>
          );
        })}
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
        {(["changesTechnology", "newProductOrMarket", "boardDecisionRequired"] as const).map((field) => (
          <label className="collegium-field" key={field}>
            <span>{collegiumInitiativeFieldLabels[field]}</span>
            <select
              disabled={isSaving}
              value={form[field]}
              onChange={(event) => {
                const value = event.currentTarget.value as FormState[typeof field];
                update(field, value);
              }}
            >
              <option value="">Не указано</option>
              {collegiumYesNoOptions.map((option) => (
                <option key={option} value={option}>{collegiumYesNoLabels[option]}</option>
              ))}
            </select>
          </label>
        ))}
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

function PassportFormView({ id, reference, onCancel, onSaved }: {
  id: string;
  reference: CollegiumListReference;
  onCancel: () => void;
  onSaved: (initiative: CollegiumInitiative) => void;
}) {
  const detail = useInitiativeDetail(id, 0);
  if (detail.status === "loading") return <LoadingIndicator label="Загружаем паспорт…" variant="inline" />;
  if (detail.status === "error") return <p className="form-message is-error" role="alert">{detail.message}</p>;
  return <PassportForm initiative={detail.data.initiative} reference={reference} onCancel={onCancel} onSaved={onSaved} />;
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
    capexAmount: "",
    changesTechnology: "",
    newProductOrMarket: "",
    boardDecisionRequired: "",
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
    risks: card.risks.map(({ text, levelCode }): CollegiumRiskInput => ({ text, levelCode })),
    expectedEffectAmount: formatAmountInput(card.expectedEffectAmount),
    oneTimeCostAmount: formatAmountInput(card.oneTimeCostAmount),
    recurringCostAmount: formatAmountInput(card.recurringCostAmount),
    capexAmount: formatAmountInput(card.capexAmount),
  };
}

function formatAmountInput(value: string) {
  return value === "" ? "" : value.replace(".", ",");
}
