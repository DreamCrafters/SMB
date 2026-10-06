import { useState, type FormEvent } from "react";
import {
  collegiumEffectStatusLabels,
  collegiumSignerRoleLabels,
  collegiumSignerRoles,
  collegiumVerifierRoleLabels,
  collegiumVerifierRoles,
  type CollegiumEffectControlRow,
  type CollegiumEffectGroupView,
  type CollegiumInitiativeDetailResponse,
  type CollegiumPerson,
} from "./contracts/collegiumInitiatives";
import { formatAmount, formatDateTime } from "./CollegiumShared";
import { formatSignedAmount } from "./CollegiumPassport";
import { ManagedTable } from "./ManagedTable";
import { TableCell, TableHeader } from "./TableCell";
import {
  assignCollegiumControlRoles,
  recordCollegiumEffectGroupFact,
  saveCollegiumEffectGroup,
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
    workflow.verifiers !== undefined || control.canRecordFacts || control.canAssignRoles || detail.effectGroups.length > 0;
  const canGroup = control.canAssignRoles || control.verifierRole === "financial";
  const [editing, setEditing] = useState<Editing>();
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
                  <TableCell>
                    {row.label}
                    {workflow.effectShares?.[row.effectId] === undefined ? null : (
                      <span className="collegium-note">{` · совместный, доля ${(workflow.effectShares[row.effectId].shareBp / 100).toLocaleString("ru-RU")} %`}</span>
                    )}
                  </TableCell>
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
                      {control.canRecordFacts && workflow.effectShares?.[row.effectId] === undefined ? (
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
      {detail.effectGroups.map((group) => (
        <GroupBlock
          group={group}
          isBusy={isBusy}
          editing={editing}
          key={group.id}
          onEdit={setEditing}
          onSaveShares={(members) => run(() => saveCollegiumEffectGroup({ groupId: group.id, revision: group.revision, members }), "Не удалось сохранить доли.")}
          onSaveFact={(body) => run(() => recordCollegiumEffectGroupFact(group.id, { revision: group.revision, ...body }), "Не удалось сохранить факт группы.")}
        />
      ))}
      {canGroup && detail.effectDuplicates.length > 0 ? (
        <div className="collegium-form-actions">
          {detail.effectDuplicates
            .filter((duplicate) => workflow.effectShares?.[duplicate.effectId] === undefined)
            .map((duplicate) => (
              <button
                className="secondary-button"
                disabled={isBusy}
                key={`${duplicate.effectId}:${duplicate.otherEffectId}`}
                type="button"
                onClick={() => void run(() => saveCollegiumEffectGroup({
                  members: [
                    { initiativeId: initiative.id, effectId: duplicate.effectId, sharePercent: "50" },
                    { initiativeId: duplicate.initiativeId, effectId: duplicate.otherEffectId, sharePercent: "50" },
                  ],
                }), "Не удалось объединить эффекты.")}
              >
                {`Объединить в совместный эффект с ${duplicate.initiativeNumber}`}
              </button>
            ))}
        </div>
      ) : null}
      {message === "" ? null : <p className="form-message is-error" role="alert">{message}</p>}
    </section>
  );
}

type Editing = "roles" | "conclusion" | { fact: string } | { reject: string } | { shares: string } | { groupFact: string } | undefined;

/** Совместный эффект: один факт на группу, доли участников (ТЗ 11.2). */
function GroupBlock({ group, isBusy, editing, onEdit, onSaveShares, onSaveFact }: {
  group: CollegiumEffectGroupView;
  isBusy: boolean;
  editing: Editing;
  onEdit: (editing: Editing) => void;
  onSaveShares: (members: Array<{ initiativeId: string; effectId: string; sharePercent: string }>) => void;
  onSaveFact: (body: { actualAmount: string; period: string; sources: string; calculation: string }) => void;
}) {
  const [shares, setShares] = useState(() => group.members.map((member) => String(member.shareBp / 100).replace(".", ",")));
  const total = group.members.reduce((sum, member) => sum + member.shareBp, 0) / 100;
  const isEditingShares = typeof editing === "object" && "shares" in editing && editing.shares === group.id;
  const isEditingFact = typeof editing === "object" && "groupFact" in editing && editing.groupFact === group.id;
  const hidden = group.members.some((member) => member.initiativeId === "");
  return (
    <div className="collegium-effect-group">
      <strong>{`Совместный эффект: учтено ${total.toLocaleString("ru-RU")} % из 100 %`}</strong>
      <ul>
        {group.members.map((member, index) => (
          <li key={`${member.initiativeId}:${member.effectId}:${index}`}>
            {member.number === "" ? "Инициатива недоступна для просмотра" : `${member.number} «${member.title}» — ${member.effectLabel}`}
            {isEditingShares && member.initiativeId !== "" ? (
              <input
                aria-label={`Доля ${member.number}, %`}
                className="collegium-share-input"
                disabled={isBusy}
                inputMode="decimal"
                value={shares[index]}
                onChange={(event) => {
                  const value = event.currentTarget.value;
                  setShares((current) => current.map((item, position) => (position === index ? value : item)));
                }}
              />
            ) : `: ${(member.shareBp / 100).toLocaleString("ru-RU")} %`}
          </li>
        ))}
      </ul>
      <p className="collegium-note">
        {group.fact === undefined
          ? "Факт совместного эффекта ещё не внесён."
          : `Факт: ${formatSignedAmount(group.fact.actualAmount)} в год (${group.fact.period}; ${group.fact.sources}), ${group.fact.recordedByDisplayName}, версия ${group.fact.version}`}
      </p>
      <div className="collegium-form-actions">
        {group.canEditShares && !hidden ? (
          isEditingShares ? (
            <>
              <button
                className="primary-button"
                disabled={isBusy}
                type="button"
                onClick={() => onSaveShares(group.members.map((member, index) => ({
                  initiativeId: member.initiativeId, effectId: member.effectId, sharePercent: shares[index].trim(),
                })))}
              >
                Сохранить доли
              </button>
              <button className="secondary-button" disabled={isBusy} type="button" onClick={() => onSaveShares([])}>
                Распустить группу
              </button>
              <button className="secondary-button" disabled={isBusy} type="button" onClick={() => onEdit(undefined)}>Отмена</button>
            </>
          ) : (
            <button className="secondary-button" disabled={isBusy} type="button" onClick={() => onEdit({ shares: group.id })}>
              Изменить доли
            </button>
          )
        ) : null}
        {group.canRecordFact && !isEditingFact ? (
          <button className="secondary-button" disabled={isBusy} type="button" onClick={() => onEdit({ groupFact: group.id })}>
            {group.fact === undefined ? "Внести факт группы" : "Новая версия факта группы"}
          </button>
        ) : null}
      </div>
      {isEditingFact ? (
        <FactForm
          isBusy={isBusy}
          row={{
            effectId: group.id, label: "совместный эффект", plannedAnnual: "", status: "not_checked",
            deviationAmount: "", deviationPercent: "",
            ...(group.fact === undefined ? {} : { fact: { ...group.fact, verdicts: {} } }),
          }}
          onCancel={() => onEdit(undefined)}
          onSubmit={onSaveFact}
        />
      ) : null}
    </div>
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
