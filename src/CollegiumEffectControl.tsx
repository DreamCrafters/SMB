import { useState, type FormEvent } from "react";
import {
  collegiumEffectStatusLabels,
  collegiumSignerRoleLabels,
  collegiumSignerRoles,
  collegiumVerifierRoleLabels,
  collegiumVerifierRoles,
  type CollegiumEffectControlRow,
  type CollegiumInitiativeDetailResponse,
  type CollegiumPerson,
} from "./contracts/collegiumInitiatives";
import { formatAmount, formatDateTime } from "./CollegiumShared";
import { formatSignedAmount } from "./CollegiumPassport";
import { ManagedTable } from "./ManagedTable";
import { TableCell, TableHeader } from "./TableCell";
import {
  assignCollegiumControlRoles,
  recordCollegiumConclusion,
  recordCollegiumEffectFact,
  recordCollegiumEffectVerdict,
} from "./services/collegiumInitiatives";
import { readShortUserMessage } from "./services/userFacingMessages";

function errorText(error: unknown, fallback: string) {
  return readShortUserMessage(error instanceof Error ? error.message : "", fallback);
}

/** Контроль эффекта (ТЗ 11.1): роли, заключения, факты и две подписи; правила — на сервере. */
export function EffectControlSection({ detail, people, userId, onChanged }: {
  detail: CollegiumInitiativeDetailResponse;
  people: CollegiumPerson[];
  userId: string;
  onChanged: () => void;
}) {
  const { initiative, effectControl: control } = detail;
  const workflow = initiative.workflow;
  const hasAnything = control.rows.some((row) => row.fact !== undefined) ||
    workflow.verifiers !== undefined || control.canRecordFacts || control.canAssignRoles;
  const [editing, setEditing] = useState<"roles" | "conclusion" | { fact: string } | { reject: string }>();
  const [message, setMessage] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  if (!hasAnything) return null;

  const name = (accountId: string | undefined) =>
    accountId === undefined || accountId === "" ? "—" : people.find((person) => person.id === accountId)?.displayName ?? accountId;
  const run = async (operation: () => Promise<unknown>, fallback: string) => {
    setIsBusy(true);
    setMessage("");
    try {
      await operation();
      setEditing(undefined);
      onChanged();
    } catch (error) {
      setMessage(errorText(error, fallback));
    } finally {
      setIsBusy(false);
    }
  };
  const sign = (row: CollegiumEffectControlRow, verdict: "confirmed" | "not_confirmed", comment = "") =>
    run(() => recordCollegiumEffectVerdict(initiative.id, row.effectId, {
      revision: initiative.revision, factVersion: row.fact!.version, verdict, comment,
    }), "Не удалось сохранить подпись.");

  return (
    <section className="collegium-card-section collegium-effect-control">
      <h4>Контроль эффекта</h4>
      <dl className="collegium-card-grid">
        <div className="collegium-card-value"><dt>Контролёр эффекта</dt><dd>{name(initiative.card.effectControllerId)}</dd></div>
        <div className="collegium-card-value"><dt>Технический верификатор</dt><dd>{name(workflow.verifiers?.technicalId)}</dd></div>
        <div className="collegium-card-value"><dt>Финансовый верификатор</dt><dd>{name(workflow.verifiers?.financialId)}</dd></div>
        {collegiumVerifierRoles.map((role) => {
          const conclusion = workflow.verification?.[role];
          return conclusion === undefined ? null : (
            <div className="collegium-card-value collegium-field-wide" key={role}>
              <dt>{`Заключение: ${collegiumVerifierRoleLabels[role].toLocaleLowerCase("ru-RU")}`}</dt>
              <dd>{`${conclusion.text} — ${conclusion.byDisplayName}, ${formatDateTime(conclusion.at)}`}</dd>
            </div>
          );
        })}
      </dl>
      <div className="collegium-form-actions">
        {control.canAssignRoles ? (
          <button className="secondary-button" disabled={isBusy} type="button" onClick={() => setEditing("roles")}>
            Назначить роли контроля
          </button>
        ) : null}
        {control.verifierRole === undefined ? null : (
          <button className="secondary-button" disabled={isBusy} type="button" onClick={() => setEditing("conclusion")}>
            Внести заключение
          </button>
        )}
      </div>
      {editing === "roles" ? (
        <RolesForm
          detail={detail}
          isBusy={isBusy}
          people={people.filter((person) => person.hasInitiativesTab)}
          onCancel={() => setEditing(undefined)}
          onSubmit={(body) => run(() => assignCollegiumControlRoles(initiative.id, { revision: initiative.revision, ...body }), "Не удалось назначить роли.")}
        />
      ) : null}
      {editing === "conclusion" && control.verifierRole !== undefined ? (
        <TextForm
          isBusy={isBusy}
          label={`Заключение: ${collegiumVerifierRoleLabels[control.verifierRole].toLocaleLowerCase("ru-RU")}`}
          initial={workflow.verification?.[control.verifierRole]?.text ?? ""}
          submitLabel="Сохранить заключение"
          onCancel={() => setEditing(undefined)}
          onSubmit={(text) => run(() => recordCollegiumConclusion(initiative.id, {
            revision: initiative.revision, role: control.verifierRole!, text,
          }), "Не удалось сохранить заключение.")}
        />
      ) : null}

      <div className="table-scroll">
        <ManagedTable tableId="collegium.effectControl" className="data-table collegium-effect-table">
          <thead>
            <tr>
              <TableHeader>Эффект</TableHeader>
              <TableHeader>План в год</TableHeader>
              <TableHeader>Факт в год</TableHeader>
              <TableHeader>Отклонение</TableHeader>
              <TableHeader>Статус</TableHeader>
              <TableHeader>Подписи</TableHeader>
              <TableHeader>Действия</TableHeader>
            </tr>
          </thead>
          <tbody>
            {control.rows.map((row) => {
              const fact = row.fact;
              const canSign = control.signerRole !== undefined && fact !== undefined && fact.recordedByUserId !== userId;
              return (
                <tr key={row.effectId}>
                  <TableCell>{row.label}</TableCell>
                  <TableCell className="is-number">{formatAmount(row.plannedAnnual)}</TableCell>
                  <TableCell className="is-number">
                    {fact === undefined ? "—" : `${formatSignedAmount(fact.actualAmount)} (${fact.period}; ${fact.sources}; версия ${fact.version})`}
                  </TableCell>
                  <TableCell className="is-number">
                    {row.deviationAmount === "" ? "—" : `${formatSignedAmount(row.deviationAmount)} (${row.deviationPercent.replace("-", "−").replace(".", ",")} %)`}
                  </TableCell>
                  <TableCell>{collegiumEffectStatusLabels[row.status]}</TableCell>
                  <TableCell>
                    {fact === undefined ? "—" : collegiumSignerRoles.map((role) => {
                      const verdict = fact.verdicts[role];
                      const current = verdict !== undefined && verdict.factVersion === fact.version;
                      return `${collegiumSignerRoleLabels[role]}: ${current
                        ? `${verdict.verdict === "confirmed" ? "подтверждаю" : `не подтверждаю (${verdict.comment})`}, ${verdict.byDisplayName}`
                        : "нет"}`;
                    }).join("; ")}
                  </TableCell>
                  <TableCell>
                    <div className="collegium-reference-actions">
                      {control.canRecordFacts ? (
                        <button className="secondary-button" disabled={isBusy} type="button" onClick={() => setEditing({ fact: row.effectId })}>
                          {fact === undefined ? "Внести факт" : "Новая версия факта"}
                        </button>
                      ) : null}
                      {canSign ? (
                        <>
                          <button className="secondary-button" disabled={isBusy} type="button" onClick={() => void sign(row, "confirmed")}>
                            Подтверждаю
                          </button>
                          <button className="secondary-button" disabled={isBusy} type="button" onClick={() => setEditing({ reject: row.effectId })}>
                            Не подтверждаю
                          </button>
                        </>
                      ) : null}
                    </div>
                  </TableCell>
                </tr>
              );
            })}
          </tbody>
        </ManagedTable>
      </div>
      {typeof editing === "object" && "fact" in editing ? (
        <FactForm
          isBusy={isBusy}
          row={control.rows.find((row) => row.effectId === editing.fact)!}
          onCancel={() => setEditing(undefined)}
          onSubmit={(body) => run(
            () => recordCollegiumEffectFact(initiative.id, editing.fact, { revision: initiative.revision, ...body }),
            "Не удалось сохранить факт.",
          )}
        />
      ) : null}
      {typeof editing === "object" && "reject" in editing ? (
        <TextForm
          isBusy={isBusy}
          label="Почему эффект не подтверждён"
          initial=""
          submitLabel="Не подтверждаю"
          onCancel={() => setEditing(undefined)}
          onSubmit={(comment) => sign(control.rows.find((row) => row.effectId === editing.reject)!, "not_confirmed", comment)}
        />
      ) : null}
      {message === "" ? null : <p className="form-message is-error" role="alert">{message}</p>}
    </section>
  );
}

function RolesForm({ detail, people, isBusy, onCancel, onSubmit }: {
  detail: CollegiumInitiativeDetailResponse;
  people: CollegiumPerson[];
  isBusy: boolean;
  onCancel: () => void;
  onSubmit: (body: { effectControllerId: string; technicalId: string; financialId: string; reason: string }) => void;
}) {
  const { card, workflow } = detail.initiative;
  const [form, setForm] = useState({
    effectControllerId: card.effectControllerId,
    technicalId: workflow.verifiers?.technicalId ?? "",
    financialId: workflow.verifiers?.financialId ?? "",
    reason: "",
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    onSubmit(form);
  };
  return (
    <form className="collegium-action-form" onSubmit={submit}>
      <div className="collegium-field-grid">
        {([
          ["effectControllerId", "Контролёр эффекта"],
          ["technicalId", "Технический верификатор"],
          ["financialId", "Финансовый верификатор"],
        ] as const).map(([key, label]) => (
          <label className="collegium-field" key={key}>
            <span>{label}</span>
            <select disabled={isBusy} value={form[key]} onChange={(event) => setForm({ ...form, [key]: event.currentTarget.value })}>
              <option value="">Не назначен</option>
              {people.map((person) => <option key={person.id} value={person.id}>{person.displayName}</option>)}
            </select>
          </label>
        ))}
        <label className="collegium-field collegium-field-wide">
          <span>Причина изменения</span>
          <input disabled={isBusy} maxLength={1000} value={form.reason} onChange={(event) => setForm({ ...form, reason: event.currentTarget.value })} />
        </label>
      </div>
      <div className="collegium-form-actions">
        <button className="primary-button" disabled={isBusy} type="submit">Сохранить роли</button>
        <button className="secondary-button" disabled={isBusy} type="button" onClick={onCancel}>Отмена</button>
      </div>
    </form>
  );
}

function FactForm({ row, isBusy, onCancel, onSubmit }: {
  row: CollegiumEffectControlRow;
  isBusy: boolean;
  onCancel: () => void;
  onSubmit: (body: { actualAmount: string; period: string; sources: string; calculation: string }) => void;
}) {
  const [form, setForm] = useState({
    actualAmount: (row.fact?.actualAmount ?? "").replace(".", ","),
    period: row.fact?.period ?? "",
    sources: row.fact?.sources ?? "",
    calculation: row.fact?.calculation ?? "",
  });
  const field = (key: keyof typeof form, label: string, wide = false) => (
    <label className={`collegium-field${wide ? " collegium-field-wide" : ""}`}>
      <span>{label}</span>
      <input disabled={isBusy} value={form[key]} onChange={(event) => setForm({ ...form, [key]: event.currentTarget.value })} />
    </label>
  );
  return (
    <form className="collegium-action-form" onSubmit={(event) => { event.preventDefault(); onSubmit(form); }}>
      <strong>{`Факт: ${row.label}`}</strong>
      <div className="collegium-field-grid">
        {field("actualAmount", "Фактический эффект в год, ₽")}
        {field("period", "Период измерения")}
        {field("sources", "Источники данных", true)}
        {field("calculation", "Расчёт", true)}
      </div>
      <p className="collegium-note">Новая версия факта снимает поставленные подписи.</p>
      <div className="collegium-form-actions">
        <button className="primary-button" disabled={isBusy} type="submit">Сохранить факт</button>
        <button className="secondary-button" disabled={isBusy} type="button" onClick={onCancel}>Отмена</button>
      </div>
    </form>
  );
}

function TextForm({ label, initial, submitLabel, isBusy, onCancel, onSubmit }: {
  label: string;
  initial: string;
  submitLabel: string;
  isBusy: boolean;
  onCancel: () => void;
  onSubmit: (text: string) => void;
}) {
  const [text, setText] = useState(initial);
  return (
    <form className="collegium-action-form" onSubmit={(event) => { event.preventDefault(); onSubmit(text.trim()); }}>
      <label className="collegium-field collegium-field-wide">
        <span>{label}</span>
        <textarea disabled={isBusy} maxLength={4000} rows={3} value={text} onChange={(event) => setText(event.currentTarget.value)} />
      </label>
      <div className="collegium-form-actions">
        <button className="primary-button" disabled={isBusy} type="submit">{submitLabel}</button>
        <button className="secondary-button" disabled={isBusy} type="button" onClick={onCancel}>Отмена</button>
      </div>
    </form>
  );
}
