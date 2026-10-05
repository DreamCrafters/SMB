import { useState, type FormEvent } from "react";
import {
  collegiumEconomicsOverrideFields,
  collegiumEconomicsOverrideLabels,
  collegiumPassportAmountFields,
  collegiumPassportFieldLabels,
  collegiumPassportScenarioFields,
  collegiumPassportTextFields,
  maxCollegiumMilestones,
  maxCollegiumScheduleRows,
  type CollegiumEconomicsOverrideField,
  type CollegiumInitiative,
  type CollegiumInitiativeDetailResponse,
  type CollegiumPassport,
} from "./contracts/collegiumInitiatives";
import { CardSection, CardValue, FormSection, formatAmount, formatDate } from "./CollegiumShared";
import { saveCollegiumPassport } from "./services/collegiumInitiatives";
import { readShortUserMessage } from "./services/userFacingMessages";

/** Сумма со знаком: сценарии, чистый эффект и NPV бывают отрицательными. */
export function formatSignedAmount(value: string) {
  return value.startsWith("-") ? `−${formatAmount(value.slice(1))}` : formatAmount(value, "");
}

function formatTenths(value: string, unit: string) {
  return value === "" ? "" : `${value.replace("-", "−").replace(".", ",")} ${unit}`;
}

/** Расчёт ТЗ 11.3 и причины полного паспорта ТЗ 7.2 — значения сервера. */
export function EconomicsSection({ detail }: { detail: CollegiumInitiativeDetailResponse }) {
  const { economics, passportReasons: reasons } = detail;
  const payback = economics.paybackStatus === "not_paying" ? "не окупается" : formatTenths(economics.paybackMonths, "мес.");
  const override = (field: CollegiumEconomicsOverrideField, value: string) => {
    const manual = economics.overrides[field];
    return manual === undefined ? value : `${value || "—"}; вручную: ${manual.value.replace(".", ",")} (${manual.explanation})`;
  };
  return (
    <CardSection title={economics.source === "passport" ? "Экономика (по полному паспорту)" : "Экономика"}>
      <CardValue label="Годовой эффект" value={formatAmount(economics.annualEffect, "")} />
      <CardValue label="Постоянные затраты в год" value={formatAmount(economics.annualRecurringCost, "")} />
      <CardValue label="Чистый годовой эффект" value={override("netAnnualEffect", formatSignedAmount(economics.netAnnualEffect))} />
      <CardValue label="Разовые затраты с CAPEX" value={formatAmount(economics.oneTimeCosts, "")} />
      <CardValue label="Срок окупаемости" value={override("paybackMonths", payback)} />
      <CardValue label="ROI" value={override("roiPercent", formatTenths(economics.roiPercent, "%"))} />
      {economics.npvRequired || economics.overrides.npv !== undefined ? (
        <CardValue label="NPV" value={override("npv", formatSignedAmount(economics.npv))} />
      ) : null}
      <CardValue
        label="Полный паспорт"
        value={reasons.length === 0
          ? "не требуется"
          : `требуется: ${reasons.map((reason) => reason.label.toLocaleLowerCase("ru-RU")).join("; ")}`}
        wide
      />
    </CardSection>
  );
}

/** Полный паспорт в карточке: пробелы по причинам и заполненные разделы. */
export function PassportSection({ detail, onEdit }: {
  detail: CollegiumInitiativeDetailResponse;
  onEdit: () => void;
}) {
  const passport = detail.initiative.card.passport;
  if (passport === undefined && detail.passportReasons.length === 0 && !detail.canEditPassport) return null;
  return (
    <section className="collegium-card-section collegium-passport">
      <div className="collegium-passport-head">
        <h4>Полный паспорт</h4>
        {detail.canEditPassport ? (
          <button className="secondary-button" type="button" onClick={onEdit}>
            {passport === undefined ? "Заполнить паспорт" : "Изменить паспорт"}
          </button>
        ) : null}
      </div>
      {detail.passportGaps.length === 0 ? null : (
        <div className="collegium-admission-gaps" role="status">
          <strong>Не хватает в паспорте:</strong>
          <ul>{detail.passportGaps.map((gap) => <li key={gap}>{gap}</li>)}</ul>
        </div>
      )}
      {passport === undefined ? (
        <p className="collegium-empty-note">Паспорт ещё не заполнен.</p>
      ) : (
        <dl className="collegium-card-grid">
          {collegiumPassportTextFields.map((field) => (
            <CardValue key={field} label={collegiumPassportFieldLabels[field]} value={passport[field]} wide />
          ))}
          {collegiumPassportAmountFields.map((field) => (
            <CardValue key={field} label={collegiumPassportFieldLabels[field]} value={formatAmount(passport[field], "")} />
          ))}
          {collegiumPassportScenarioFields.map((field) => (
            <CardValue key={field} label={collegiumPassportFieldLabels[field]} value={formatSignedAmount(passport[field])} />
          ))}
          <CardValue
            label={collegiumPassportFieldLabels.schedule}
            value={passport.schedule.map((row) =>
              `${row.month.split("-").reverse().join(".")}: затраты ${formatAmount(row.cost)}, эффект ${formatAmount(row.effect)}`).join("; ")}
            wide
          />
          <CardValue
            label={collegiumPassportFieldLabels.milestones}
            value={passport.milestones.map((item) => `${formatDate(item.date)} — ${item.text}`).join("; ")}
            wide
          />
        </dl>
      )}
    </section>
  );
}

type PassportFormState = Omit<CollegiumPassport, "overrides"> & {
  overrides: Record<CollegiumEconomicsOverrideField, { value: string; explanation: string }>;
};

function toInput(value: string) {
  return value.replace(".", ",");
}

function formFromPassport(passport: CollegiumPassport | undefined): PassportFormState {
  const text = Object.fromEntries(collegiumPassportTextFields.map((field) => [field, passport?.[field] ?? ""]));
  const amounts = Object.fromEntries([...collegiumPassportAmountFields, ...collegiumPassportScenarioFields]
    .map((field) => [field, toInput(passport?.[field] ?? "")]));
  return {
    ...text,
    ...amounts,
    schedule: (passport?.schedule ?? []).map((row) => ({ month: row.month, cost: toInput(row.cost), effect: toInput(row.effect) })),
    milestones: passport?.milestones ?? [],
    overrides: Object.fromEntries(collegiumEconomicsOverrideFields.map((field) => [field, {
      value: toInput(passport?.overrides[field]?.value ?? ""),
      explanation: passport?.overrides[field]?.explanation ?? "",
    }])) as PassportFormState["overrides"],
  } as PassportFormState;
}

function nextMonth(month: string | undefined) {
  if (month === undefined) {
    return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Moscow" }).format(new Date()).slice(0, 7);
  }
  const [year, value] = month.split("-").map(Number);
  return value === 12 ? `${year + 1}-01` : `${year}-${String(value + 1).padStart(2, "0")}`;
}

/** Форма полного паспорта; все проверки и расчёты — на сервере. */
export function PassportForm({ initiative, onCancel, onSaved }: {
  initiative: CollegiumInitiative;
  onCancel: () => void;
  onSaved: (initiative: CollegiumInitiative) => void;
}) {
  const [form, setForm] = useState(() => formFromPassport(initiative.card.passport));
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const reasonRequired = initiative.status !== "draft";
  const set = <K extends keyof PassportFormState>(key: K, value: PassportFormState[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (reasonRequired && reason.trim() === "") {
      setMessage("Укажите причину изменения.");
      return;
    }
    setIsSaving(true);
    setMessage("");
    try {
      const saved = await saveCollegiumPassport(initiative.id, {
        revision: initiative.revision,
        ...(reason.trim() === "" ? {} : { reason: reason.trim() }),
        passport: {
          ...form,
          overrides: Object.fromEntries(collegiumEconomicsOverrideFields
            .filter((field) => form.overrides[field].value.trim() !== "")
            .map((field) => [field, form.overrides[field]])),
        },
      });
      onSaved(saved);
    } catch (error) {
      setMessage(readShortUserMessage(error instanceof Error ? error.message : "", "Не удалось сохранить паспорт."));
    } finally {
      setIsSaving(false);
    }
  };

  const input = (field: keyof PassportFormState & string, value: string, onChange: (value: string) => void, mode?: "decimal") => (
    <label className="collegium-field" key={field}>
      <span>{(collegiumPassportFieldLabels as Record<string, string>)[field] ?? field}</span>
      <input disabled={isSaving} inputMode={mode} value={value} onChange={(event) => onChange(event.currentTarget.value)} />
    </label>
  );

  return (
    <form className="collegium-form collegium-passport-form" onSubmit={(event) => void submit(event)}>
      <header className="collegium-card-header">
        <div>
          <span className="eyebrow">{initiative.number}</span>
          <h3>{`Полный паспорт: ${initiative.card.title}`}</h3>
        </div>
      </header>

      <FormSection title="Альтернативы и условия">
        {collegiumPassportTextFields.map((field) => (
          <label className="collegium-field collegium-field-wide" key={field}>
            <span>{collegiumPassportFieldLabels[field]}</span>
            <textarea
              disabled={isSaving}
              maxLength={4000}
              rows={3}
              value={form[field]}
              onChange={(event) => set(field, event.currentTarget.value)}
            />
          </label>
        ))}
      </FormSection>

      <FormSection title="Прогноз и затраты, ₽">
        {collegiumPassportAmountFields.map((field) => input(field, form[field], (value) => set(field, value), "decimal"))}
      </FormSection>

      <FormSection title="Сценарии (чистый эффект в год, можно со знаком минус)">
        {collegiumPassportScenarioFields.map((field) => input(field, form[field], (value) => set(field, value), "decimal"))}
      </FormSection>

      <FormSection title={collegiumPassportFieldLabels.schedule}>
        {form.schedule.map((row, index) => (
          <div className="collegium-schedule-row" key={index}>
            <label className="collegium-field">
              <span>Месяц</span>
              <input
                disabled={isSaving}
                type="month"
                value={row.month}
                onChange={(event) => {
                  const month = event.currentTarget.value;
                  set("schedule", form.schedule.map((item, position) => (position === index ? { ...item, month } : item)));
                }}
              />
            </label>
            {(["cost", "effect"] as const).map((key) => (
              <label className="collegium-field" key={key}>
                <span>{key === "cost" ? "Затраты, ₽" : "Эффект, ₽"}</span>
                <input
                  disabled={isSaving}
                  inputMode="decimal"
                  value={row[key]}
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    set("schedule", form.schedule.map((item, position) => (position === index ? { ...item, [key]: value } : item)));
                  }}
                />
              </label>
            ))}
            <button
              aria-label={`Удалить месяц ${row.month}`}
              className="secondary-button"
              disabled={isSaving}
              type="button"
              onClick={() => set("schedule", form.schedule.filter((_, position) => position !== index))}
            >
              Удалить
            </button>
          </div>
        ))}
        <div>
          <button
            className="secondary-button"
            disabled={isSaving || form.schedule.length >= maxCollegiumScheduleRows}
            type="button"
            onClick={() => set("schedule", [...form.schedule, { month: nextMonth(form.schedule.at(-1)?.month), cost: "", effect: "" }])}
          >
            Добавить месяц
          </button>
        </div>
      </FormSection>

      <FormSection title={collegiumPassportFieldLabels.milestones}>
        {form.milestones.map((item, index) => (
          <div className="collegium-schedule-row" key={index}>
            <label className="collegium-field">
              <span>Дата</span>
              <input
                disabled={isSaving}
                type="date"
                value={item.date}
                onChange={(event) => {
                  const date = event.currentTarget.value;
                  set("milestones", form.milestones.map((entry, position) => (position === index ? { ...entry, date } : entry)));
                }}
              />
            </label>
            <label className="collegium-field collegium-field-wide">
              <span>Контрольная точка</span>
              <input
                disabled={isSaving}
                maxLength={500}
                value={item.text}
                onChange={(event) => {
                  const text = event.currentTarget.value;
                  set("milestones", form.milestones.map((entry, position) => (position === index ? { ...entry, text } : entry)));
                }}
              />
            </label>
            <button
              className="secondary-button"
              disabled={isSaving}
              type="button"
              onClick={() => set("milestones", form.milestones.filter((_, position) => position !== index))}
            >
              Удалить
            </button>
          </div>
        ))}
        <div>
          <button
            className="secondary-button"
            disabled={isSaving || form.milestones.length >= maxCollegiumMilestones}
            type="button"
            onClick={() => set("milestones", [...form.milestones, { date: "", text: "" }])}
          >
            Добавить контрольную точку
          </button>
        </div>
      </FormSection>

      <FormSection title="Ручные значения расчёта (только с пояснением)">
        {collegiumEconomicsOverrideFields.map((field) => (
          <div className="collegium-schedule-row" key={field}>
            <label className="collegium-field">
              <span>{collegiumEconomicsOverrideLabels[field]}</span>
              <input
                disabled={isSaving}
                inputMode="decimal"
                value={form.overrides[field].value}
                onChange={(event) => {
                  const value = event.currentTarget.value;
                  set("overrides", { ...form.overrides, [field]: { ...form.overrides[field], value } });
                }}
              />
            </label>
            <label className="collegium-field collegium-field-wide">
              <span>Пояснение</span>
              <input
                disabled={isSaving}
                maxLength={1000}
                value={form.overrides[field].explanation}
                onChange={(event) => {
                  const explanation = event.currentTarget.value;
                  set("overrides", { ...form.overrides, [field]: { ...form.overrides[field], explanation } });
                }}
              />
            </label>
          </div>
        ))}
      </FormSection>

      <FormSection title="Изменение">
        <label className="collegium-field collegium-field-wide">
          <span>{reasonRequired ? "Причина изменения (обязательно)" : "Причина изменения"}</span>
          <input disabled={isSaving} maxLength={1000} value={reason} onChange={(event) => setReason(event.currentTarget.value)} />
        </label>
      </FormSection>

      {message === "" ? null : <p className="form-message is-error" role="alert">{message}</p>}
      <div className="collegium-form-actions">
        <button className="primary-button" disabled={isSaving} type="submit">
          {isSaving ? "Сохраняем…" : "Сохранить паспорт"}
        </button>
        <button className="secondary-button" disabled={isSaving} type="button" onClick={onCancel}>Отмена</button>
      </div>
    </form>
  );
}
