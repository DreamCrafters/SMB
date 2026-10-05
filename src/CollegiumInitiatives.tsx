import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import {
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
  type CollegiumInitiative,
  type CollegiumInitiativeCard,
  type CollegiumInitiativeCardInput,
  type CollegiumInitiativeDetailResponse,
  type CollegiumInitiativeListResponse,
  type CollegiumInitiativeStatus,
  type CollegiumPerson,
} from "./contracts/collegiumInitiatives";
import type { ServerUserProfile } from "./contracts";
import { LoadingIndicator } from "./LoadingIndicator";
import { ManagedTable } from "./ManagedTable";
import { TableCell, TableHeader } from "./TableCell";
import {
  requestCollegiumInitiative,
  requestCollegiumInitiatives,
  saveCollegiumInitiative,
} from "./services/collegiumInitiatives";
import type { ShowToast } from "./services/toastStack";
import { readShortUserMessage } from "./services/userFacingMessages";

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
      </header>
      {view.kind === "registry" ? (
        <InitiativeRegistry
          data={data}
          profile={profile}
          onCreate={() => setView({ kind: "form" })}
          onOpen={(id) => setView({ kind: "card", id })}
        />
      ) : view.kind === "card" ? (
        <InitiativeCardView
          id={view.id}
          people={data.people}
          refreshVersion={refreshVersion}
          onBack={() => setView({ kind: "registry" })}
          onEdit={() => setView({ kind: "form", id: view.id })}
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
  people,
  refreshVersion,
  onBack,
  onEdit,
}: {
  id: string;
  people: CollegiumPerson[];
  refreshVersion: number;
  onBack: () => void;
  onEdit: () => void;
}) {
  const detail = useInitiativeDetail(id, refreshVersion);
  const peopleIndex = usePeopleIndex(people);

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
        <CardValue
          label={collegiumInitiativeFieldLabels.oneTimeCostAmount}
          value={[
            formatAmount(card.oneTimeCostAmount, ""),
            card.oneTimeCostVat === "" ? "" : collegiumCostVatLabels[card.oneTimeCostVat],
          ].filter(Boolean).join(", ")}
        />
        <CardValue label={collegiumInitiativeFieldLabels.oneTimeCostSource} value={card.oneTimeCostSource} />
        <CardValue
          label={collegiumInitiativeFieldLabels.recurringCostAmount}
          value={[
            formatAmount(card.recurringCostAmount, ""),
            card.recurringCostPeriod === "" ? "" : collegiumRecurringPeriodLabels[card.recurringCostPeriod],
          ].filter(Boolean).join(" ")}
        />
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
        <CardValue
          label={collegiumInitiativeFieldLabels.requestedDecision}
          value={card.requestedDecision === "" ? "" : collegiumDecisionLabels[card.requestedDecision]}
        />
        <CardValue label={collegiumInitiativeFieldLabels.risks} value={card.risks.join("; ")} wide />
      </CardSection>

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
                      : revision.changedFields.map((field) => collegiumInitiativeFieldLabels[field]).join(", ")}
                  </TableCell>
                  <TableCell>{revision.reason || "—"}</TableCell>
                  <TableCell>{revision.comment || "—"}</TableCell>
                </tr>
              ))}
            </tbody>
          </ManagedTable>
        </div>
      </section>
    </article>
  );
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

function usePeopleIndex(people: CollegiumPerson[]) {
  return useMemo(() => {
    const names = new Map(people.map((person) => [person.id, person.displayName]));
    return { name: (accountId: string) => names.get(accountId) ?? "" };
  }, [people]);
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

const amountFormatter = new Intl.NumberFormat("ru-RU", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function formatAmount(value: string, empty = "—") {
  return value === "" ? empty : `${amountFormatter.format(Number(value))} ₽`;
}

function formatAmountInput(value: string) {
  return value === "" ? "" : value.replace(".", ",");
}

function formatDate(value: string, empty = "—") {
  if (value === "") return empty;
  const [year, month, day] = value.split("-");
  return `${day}.${month}.${year}`;
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: "Europe/Moscow",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
