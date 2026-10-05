import { useEffect, useState, type FormEvent } from "react";
import {
  collegiumReferenceKindLabels,
  collegiumReferenceKinds,
  type CollegiumReferenceKind,
  type CollegiumReferenceOption,
  type CollegiumReferenceUpdateInput,
  type CollegiumSettings,
  type CollegiumSettingsInput,
} from "./contracts/collegiumInitiatives";
import { formatDateTime, useServerData } from "./CollegiumShared";
import { LoadingIndicator } from "./LoadingIndicator";
import { ManagedTable } from "./ManagedTable";
import { TableCell, TableHeader } from "./TableCell";
import {
  createCollegiumReference,
  requestCollegiumSettings,
  saveCollegiumSettings,
  updateCollegiumReference,
} from "./services/collegiumInitiatives";
import type { ShowToast } from "./services/toastStack";
import { readShortUserMessage } from "./services/userFacingMessages";

function errorText(error: unknown, fallback: string) {
  return readShortUserMessage(error instanceof Error ? error.message : "", fallback);
}

/** Справочники и настройки модуля (ТЗ 14); права и проверки — на сервере. */
export function CollegiumSettingsView({ onShowToast }: { onShowToast: ShowToast }) {
  const [version, setVersion] = useState(0);
  const state = useServerData(
    (signal) => requestCollegiumSettings(signal),
    "Не удалось загрузить настройки.",
    version,
  );
  if (state.status === "loading") return <LoadingIndicator label="Загружаем настройки…" />;
  if (state.status === "error") return <p className="form-message is-error" role="alert">{state.message}</p>;
  const reload = () => setVersion((current) => current + 1);
  return (
    <div className="collegium-settings">
      <SettingsForm
        canEdit={state.data.canEditSettings}
        settings={state.data.settings}
        onSaved={() => {
          onShowToast("Настройки сохранены", "Пороги и параметры Коллегии обновлены", "success");
          reload();
        }}
      />
      <ReferenceEditor
        canEditSignificance={state.data.canEditSettings}
        reference={state.data.reference}
        onChanged={reload}
      />
    </div>
  );
}

function formFromSettings(settings: CollegiumSettings) {
  return {
    oneTimeCostThreshold: settings.oneTimeCostThreshold,
    capexThreshold: settings.capexThreshold,
    paybackNormMonths: settings.paybackNormMonths,
    discountRatePercent: settings.discountRatePercent,
    criticalImportance: settings.criticalImportance.join("\n"),
  };
}

const settingsFields: Array<[Exclude<keyof CollegiumSettingsInput, "criticalImportance">, string, string]> = [
  ["oneTimeCostThreshold", "Порог разовых затрат для полного паспорта, ₽", "например, 1 000 000"],
  ["capexThreshold", "Порог CAPEX для полного паспорта, ₽", "пусто — любой CAPEX"],
  ["paybackNormMonths", "Норматив срока окупаемости, мес.", "например, 24"],
  ["discountRatePercent", "Ставка дисконтирования для NPV, % годовых", "например, 15"],
];

function SettingsForm({ settings, canEdit, onSaved }: {
  settings: CollegiumSettings;
  canEdit: boolean;
  onSaved: () => void;
}) {
  const [form, setForm] = useState(() => formFromSettings(settings));
  const [message, setMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  useEffect(() => setForm(formFromSettings(settings)), [settings]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setIsSaving(true);
    setMessage("");
    try {
      await saveCollegiumSettings(settings.revision, {
        ...form,
        criticalImportance: form.criticalImportance.split("\n").map((line) => line.trim()).filter(Boolean),
      });
      onSaved();
    } catch (error) {
      setMessage(errorText(error, "Не удалось сохранить настройки."));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form className="collegium-card-section" onSubmit={(event) => void submit(event)}>
      <h3>Пороги и параметры</h3>
      <p className="collegium-note">
        {canEdit
          ? "Пустое поле — «не задано»: условие полного паспорта не срабатывает, NPV не считается."
          : "Пороги и параметры меняет председатель Коллегии."}
      </p>
      <div className="collegium-field-grid">
        {settingsFields.map(([key, label, placeholder]) => (
          <label className="collegium-field" key={key}>
            <span>{label}</span>
            <input
              disabled={!canEdit || isSaving}
              inputMode="decimal"
              placeholder={placeholder}
              value={form[key]}
              onChange={(event) => {
                const value = event.currentTarget.value;
                setForm((current) => ({ ...current, [key]: value }));
              }}
            />
          </label>
        ))}
        <label className="collegium-field collegium-field-wide">
          <span>Критичные значения «Важности» поручений (по одному в строке)</span>
          <textarea
            disabled={!canEdit || isSaving}
            placeholder="пусто — в отчёт СД идут все просроченные поручения"
            rows={3}
            value={form.criticalImportance}
            onChange={(event) => {
              const value = event.currentTarget.value;
              setForm((current) => ({ ...current, criticalImportance: value }));
            }}
          />
        </label>
      </div>
      {settings.updatedByDisplayName === "" ? null : (
        <p className="collegium-note">
          {`Изменено: ${settings.updatedByDisplayName}, ${formatDateTime(settings.updatedAt)}`}
        </p>
      )}
      {message === "" ? null : <p className="form-message is-error" role="alert">{message}</p>}
      {canEdit ? (
        <div>
          <button className="primary-button" disabled={isSaving} type="submit">
            {isSaving ? "Сохраняем…" : "Сохранить настройки"}
          </button>
        </div>
      ) : null}
    </form>
  );
}

function ReferenceEditor({ reference, canEditSignificance, onChanged }: {
  reference: Record<CollegiumReferenceKind, CollegiumReferenceOption[]>;
  canEditSignificance: boolean;
  onChanged: () => void;
}) {
  const [kind, setKind] = useState<CollegiumReferenceKind>("direction");
  const [label, setLabel] = useState("");
  const [unit, setUnit] = useState("");
  const [editing, setEditing] = useState<{ code: string; label: string; unit: string }>();
  const [message, setMessage] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const options = reference[kind];
  const hasUnit = kind === "kpi";
  const hasSignificance = kind === "risk_level";

  const run = async (operation: () => Promise<unknown>, fallback: string) => {
    setIsBusy(true);
    setMessage("");
    try {
      await operation();
      onChanged();
      return true;
    } catch (error) {
      setMessage(errorText(error, fallback));
      return false;
    } finally {
      setIsBusy(false);
    }
  };
  const update = (code: string, input: CollegiumReferenceUpdateInput) =>
    run(() => updateCollegiumReference(kind, code, input), "Не удалось изменить значение.");

  const add = async (event: FormEvent) => {
    event.preventDefault();
    const added = await run(
      () => createCollegiumReference({ kind, label, ...(hasUnit ? { unit } : {}) }),
      "Не удалось добавить значение.",
    );
    if (added) {
      setLabel("");
      setUnit("");
    }
  };

  return (
    <section className="collegium-card-section">
      <h3>Справочники</h3>
      <label className="collegium-field">
        <span>Справочник</span>
        <select
          disabled={isBusy}
          value={kind}
          onChange={(event) => {
            const value = event.currentTarget.value as CollegiumReferenceKind;
            setKind(value);
            setEditing(undefined);
            setMessage("");
          }}
        >
          {collegiumReferenceKinds.map((item) => (
            <option key={item} value={item}>{collegiumReferenceKindLabels[item]}</option>
          ))}
        </select>
      </label>
      {hasSignificance ? (
        <p className="collegium-note">
          Значимый уровень риска требует полного паспорта инициативы; значимость меняет председатель.
        </p>
      ) : null}
      {options.length === 0 ? <p className="collegium-empty-note">Значений пока нет.</p> : (
        <div className="table-scroll">
          <ManagedTable
            className="data-table collegium-reference-table"
            columns={[
              "label",
              ...(hasUnit ? ["unit" as const] : []),
              ...(hasSignificance ? ["significant" as const] : []),
              "state",
              "actions",
            ]}
            tableId="collegium.reference"
          >
            <thead>
              <tr>
                <TableHeader>Наименование</TableHeader>
                {hasUnit ? <TableHeader>Единица</TableHeader> : null}
                {hasSignificance ? <TableHeader>Значимый</TableHeader> : null}
                <TableHeader>Состояние</TableHeader>
                <TableHeader>Действия</TableHeader>
              </tr>
            </thead>
            <tbody>
              {options.map((option, index) => {
                const isEditing = editing?.code === option.code;
                return (
                  <tr className={option.archived === true ? "is-archived" : undefined} key={option.code}>
                    <TableCell>
                      {isEditing ? (
                        <input
                          aria-label="Наименование"
                          disabled={isBusy}
                          value={editing.label}
                          onChange={(event) => {
                            const value = event.currentTarget.value;
                            setEditing((current) => current && { ...current, label: value });
                          }}
                        />
                      ) : option.label}
                    </TableCell>
                    {hasUnit ? (
                      <TableCell>
                        {isEditing ? (
                          <input
                            aria-label="Единица измерения"
                            disabled={isBusy}
                            value={editing.unit}
                            onChange={(event) => {
                              const value = event.currentTarget.value;
                              setEditing((current) => current && { ...current, unit: value });
                            }}
                          />
                        ) : option.unit || "—"}
                      </TableCell>
                    ) : null}
                    {hasSignificance ? (
                      <TableCell>
                        <input
                          aria-label={`Значимый риск: ${option.label}`}
                          checked={option.significant === true}
                          disabled={!canEditSignificance || isBusy}
                          type="checkbox"
                          onChange={(event) => {
                            const checked = event.currentTarget.checked;
                            void update(option.code, { significant: checked });
                          }}
                        />
                      </TableCell>
                    ) : null}
                    <TableCell>{option.archived === true ? "В архиве" : "Действует"}</TableCell>
                    <TableCell>
                      <div className="collegium-reference-actions">
                        {isEditing ? (
                          <>
                            <button
                              className="secondary-button"
                              disabled={isBusy}
                              type="button"
                              onClick={() => void update(option.code, {
                                label: editing.label,
                                ...(hasUnit ? { unit: editing.unit } : {}),
                              }).then((saved) => {
                                if (saved) setEditing(undefined);
                              })}
                            >
                              Сохранить
                            </button>
                            <button className="secondary-button" disabled={isBusy} type="button" onClick={() => setEditing(undefined)}>
                              Отмена
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              className="secondary-button"
                              disabled={isBusy}
                              type="button"
                              onClick={() => setEditing({ code: option.code, label: option.label, unit: option.unit ?? "" })}
                            >
                              Изменить
                            </button>
                            <button
                              aria-label={`Выше: ${option.label}`}
                              className="secondary-button"
                              disabled={isBusy || index === 0}
                              type="button"
                              onClick={() => void update(option.code, { move: "up" })}
                            >
                              ↑
                            </button>
                            <button
                              aria-label={`Ниже: ${option.label}`}
                              className="secondary-button"
                              disabled={isBusy || index === options.length - 1}
                              type="button"
                              onClick={() => void update(option.code, { move: "down" })}
                            >
                              ↓
                            </button>
                            <button
                              className="secondary-button"
                              disabled={isBusy}
                              type="button"
                              onClick={() => void update(option.code, { archived: option.archived !== true })}
                            >
                              {option.archived === true ? "Вернуть" : "В архив"}
                            </button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </tr>
                );
              })}
            </tbody>
          </ManagedTable>
        </div>
      )}
      <form className="collegium-field-grid" onSubmit={(event) => void add(event)}>
        <label className="collegium-field">
          <span>Новое значение</span>
          <input disabled={isBusy} maxLength={160} value={label} onChange={(event) => setLabel(event.currentTarget.value)} />
        </label>
        {hasUnit ? (
          <label className="collegium-field">
            <span>Единица измерения</span>
            <input disabled={isBusy} maxLength={40} value={unit} onChange={(event) => setUnit(event.currentTarget.value)} />
          </label>
        ) : null}
        <div className="collegium-reference-add">
          <button className="primary-button" disabled={isBusy || label.trim() === ""} type="submit">Добавить</button>
        </div>
      </form>
      {message === "" ? null : <p className="form-message is-error" role="alert">{message}</p>}
    </section>
  );
}
