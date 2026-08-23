import { useEffect, useId, useState, type FormEvent } from "react";
import {
  laboratoryRawMaterialWarehouseStatusLabels,
  type LaboratoryRawMaterialWarehouseOptions,
  type LaboratoryRawMaterialWarehousePermissions,
  type LaboratoryRawMaterialWarehouseRecord,
  type LaboratoryRawMaterialWarehouseSubmission,
  type LaboratoryRawMaterialWarehouseTotals,
} from "./contracts";
import { LoadingIndicator } from "./LoadingIndicator";
import { formatLaboratoryDate } from "./LaboratoryResultsTable";
import {
  requestLaboratoryRawMaterialWarehouse,
  reviewLaboratoryRawMaterialMovement,
  submitLaboratoryRawMaterialMovement,
} from "./services/laboratoryRawMaterialWarehouse";
import { readShortUserMessage } from "./services/userFacingMessages";
import type { ShowToast } from "./services/toastStack";

type WarehouseState = {
  status: "loading" | "ready" | "error";
  message?: string;
  records: LaboratoryRawMaterialWarehouseRecord[];
  pendingRecords: LaboratoryRawMaterialWarehouseRecord[];
  options: LaboratoryRawMaterialWarehouseOptions;
  totals: LaboratoryRawMaterialWarehouseTotals;
  permissions: LaboratoryRawMaterialWarehousePermissions;
  draftDate: string;
};

type EditMode =
  | { kind: "submit" }
  | { kind: "correct"; recordId: string };

const emptyOptions: LaboratoryRawMaterialWarehouseOptions = {
  materials: [],
  stackLocations: [],
  suppliers: [],
  recipients: [],
};
const emptyTotals: LaboratoryRawMaterialWarehouseTotals = {
  recordCount: 0,
  receivedTons: "0",
  shippedTons: "0",
  balanceTons: "0",
};
const emptyPermissions: LaboratoryRawMaterialWarehousePermissions = {
  canSubmit: false,
  canReview: false,
};

export function LaboratoryRawMaterialWarehouse({
  isAdminPreviewMode,
  onShowToast,
}: {
  isAdminPreviewMode: boolean;
  onShowToast: ShowToast;
}) {
  const datalistPrefix = useId().replaceAll(":", "");
  const [state, setState] = useState<WarehouseState>({
    status: "loading",
    records: [],
    pendingRecords: [],
    options: emptyOptions,
    totals: emptyTotals,
    permissions: emptyPermissions,
    draftDate: "",
  });
  const [form, setForm] = useState<LaboratoryRawMaterialWarehouseSubmission>(
    () => createEmptyForm(""),
  );
  const [editMode, setEditMode] = useState<EditMode>({ kind: "submit" });
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [query, setQuery] = useState("");
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    setState((current) => ({ ...current, status: "loading", message: undefined }));
    requestLaboratoryRawMaterialWarehouse(
      {
        ...(dateFrom === "" ? {} : { dateFrom }),
        ...(dateTo === "" ? {} : { dateTo }),
        ...(query.trim() === "" ? {} : { query: query.trim() }),
      },
      { signal: controller.signal },
    ).then((result) => {
      if (controller.signal.aborted) return;
      if (result.status === "error") {
        setState((current) => ({
          ...current,
          status: "error",
          message: readShortUserMessage(
            result.message,
            "Не удалось загрузить данные склада сырья.",
          ),
        }));
        return;
      }
      setState(result);
      setForm((current) => current.movementDate === ""
        ? { ...current, movementDate: result.draftDate }
        : current);
    });
    return () => controller.abort();
  }, [dateFrom, dateTo, query, refreshVersion]);

  const formEnabled = !isAdminPreviewMode && (
    editMode.kind === "correct" ? state.permissions.canReview : state.permissions.canSubmit
  );

  function updateFormField(
    field: keyof LaboratoryRawMaterialWarehouseSubmission,
    value: string,
  ) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function submitForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!formEnabled || isSaving) return;
    // Доработка задачи 95: вид сырья вводится свободно и накапливается в
    // подсказках, поэтому канонизировать его по журналу марок больше не нужно.
    const materialLabel = form.materialLabel.trim().replace(/\s+/gu, " ");
    if (materialLabel === "") {
      setMessage("Укажите вид сырья.");
      return;
    }
    const submission = { ...form, materialLabel };
    setIsSaving(true);
    setMessage(editMode.kind === "correct"
      ? "Сохраняем исправление…"
      : "Передаём кладовщику…");
    const result = editMode.kind === "correct"
      ? await reviewLaboratoryRawMaterialMovement(editMode.recordId, {
          action: "correct",
          record: submission,
        })
      : await submitLaboratoryRawMaterialMovement(submission);
    setIsSaving(false);
    if (result.status === "error") {
      setMessage(readShortUserMessage(
        result.message,
        editMode.kind === "correct"
          ? "Не удалось сохранить исправление."
          : "Не удалось передать запись кладовщику.",
      ));
      return;
    }
    const wasCorrection = editMode.kind === "correct";
    setEditMode({ kind: "submit" });
    setForm(createEmptyForm(state.draftDate));
    setMessage("");
    setRefreshVersion((value) => value + 1);
    onShowToast(
      wasCorrection ? "Запись склада исправлена" : "Запись передана кладовщику",
      wasCorrection
        ? "Исправленная версия добавлена в историю."
        : "После подтверждения запись появится в истории и итогах.",
      "success",
    );
  }

  async function approve(record: LaboratoryRawMaterialWarehouseRecord) {
    if (isAdminPreviewMode || !state.permissions.canReview || isSaving) return;
    setIsSaving(true);
    setMessage(`Подтверждаем запись от ${formatLaboratoryDate(record.movementDate)}…`);
    const result = await reviewLaboratoryRawMaterialMovement(record.id, {
      action: "approve",
    });
    setIsSaving(false);
    if (result.status === "error") {
      setMessage(readShortUserMessage(result.message, "Не удалось подтвердить запись."));
      return;
    }
    setMessage("");
    setRefreshVersion((value) => value + 1);
    onShowToast(
      "Запись склада подтверждена",
      "Данные добавлены в историю и учтены в итогах.",
      "success",
    );
  }

  function startCorrection(record: LaboratoryRawMaterialWarehouseRecord) {
    if (isAdminPreviewMode || !state.permissions.canReview) return;
    setEditMode({ kind: "correct", recordId: record.id });
    setForm(copyRecordToForm(record));
    setMessage("Исправьте данные и сохраните новую версию записи.");
    document.querySelector<HTMLElement>(".raw-material-warehouse-form")?.scrollIntoView?.({
      behavior: "smooth",
      block: "start",
    });
  }

  function cancelCorrection() {
    setEditMode({ kind: "submit" });
    setForm(createEmptyForm(state.draftDate));
    setMessage("");
  }

  return (
    <section className="raw-material-warehouse" aria-labelledby="raw-material-warehouse-title">
      <div className="laboratory-history-heading">
        <div>
          <span className="eyebrow">Лаборатория</span>
          <h2 id="raw-material-warehouse-title">Склад сырья</h2>
          <p>
            Лаборант передаёт запись кладовщику. В историю и итоги она входит
            только после подтверждения.
          </p>
        </div>
      </div>

      {state.status === "loading" ? (
        <LoadingIndicator label="Загружаем склад сырья…" variant="inline" />
      ) : state.status === "error" ? (
        <p className="form-message is-error" role="alert">{state.message}</p>
      ) : null}

      {(state.permissions.canSubmit || editMode.kind === "correct") ? (
        <form className="laboratory-form raw-material-warehouse-form" onSubmit={submitForm}>
          <div className="laboratory-history-heading">
            <div>
              <span className="eyebrow">
                {editMode.kind === "correct" ? "Исправление кладовщиком" : "Новая запись"}
              </span>
              <h3>{editMode.kind === "correct" ? "Исправить движение сырья" : "Движение сырья"}</h3>
            </div>
          </div>
          <div className="laboratory-form-grid">
            <label>
              <span>Дата</span>
              <input
                disabled={!formEnabled}
                required
                type="date"
                value={form.movementDate}
                onChange={(event) => updateFormField("movementDate", event.currentTarget.value)}
              />
            </label>
            <DatalistField
              disabled={!formEnabled}
              label="Вид сырья"
              listId={`${datalistPrefix}-materials`}
              options={state.options.materials}
              required
              value={form.materialLabel}
              onChange={(value) => updateFormField("materialLabel", value)}
            />
            <DatalistField
              disabled={!formEnabled}
              label="№ штабеля / место нахождения"
              listId={`${datalistPrefix}-stack-locations`}
              options={state.options.stackLocations}
              required
              value={form.stackLocation}
              onChange={(value) => updateFormField("stackLocation", value)}
            />
            <NumberField
              disabled={!formEnabled}
              label="Поступило, т"
              value={form.receivedTons}
              onChange={(value) => updateFormField("receivedTons", value)}
            />
            <DatalistField
              disabled={!formEnabled}
              label="Поставщик"
              listId={`${datalistPrefix}-suppliers`}
              options={state.options.suppliers}
              value={form.supplier}
              onChange={(value) => updateFormField("supplier", value)}
            />
            <NumberField
              disabled={!formEnabled}
              label="Отгружено, т"
              value={form.shippedTons}
              onChange={(value) => updateFormField("shippedTons", value)}
            />
            <DatalistField
              disabled={!formEnabled}
              label="Кому отгружено"
              listId={`${datalistPrefix}-recipients`}
              options={state.options.recipients}
              value={form.recipient}
              onChange={(value) => updateFormField("recipient", value)}
            />
          </div>
          <div className="laboratory-form-actions">
            <button className="primary-button" disabled={!formEnabled || isSaving} type="submit">
              {isSaving ? (
                <LoadingIndicator label="Сохраняем…" variant="button" />
              ) : editMode.kind === "correct" ? "Сохранить исправление" : "Передать кладовщику"}
            </button>
            {editMode.kind === "correct" ? (
              <button className="secondary-button" disabled={isSaving} type="button" onClick={cancelCorrection}>
                Отменить исправление
              </button>
            ) : null}
            {isAdminPreviewMode ? <small>В режиме просмотра сохранение отключено.</small> : null}
            {message === "" ? null : <span className="form-message" role="status">{message}</span>}
          </div>
        </form>
      ) : null}

      <section className="laboratory-history raw-material-warehouse-pending" aria-labelledby="raw-material-pending-title">
        <div className="laboratory-history-heading">
          <div>
            <span className="eyebrow">На подтверждении</span>
            <h3 id="raw-material-pending-title">Ожидают кладовщика</h3>
          </div>
        </div>
        <WarehouseTable
          isPending
          canReview={!isAdminPreviewMode && state.permissions.canReview}
          isSaving={isSaving}
          records={state.pendingRecords}
          onApprove={approve}
          onCorrect={startCorrection}
        />
      </section>

      <section className="laboratory-history" aria-labelledby="raw-material-history-title">
        <div className="laboratory-history-heading">
          <div>
            <span className="eyebrow">История</span>
            <h3 id="raw-material-history-title">Подтверждённые движения сырья</h3>
          </div>
          <div className="laboratory-filters">
            <label>
              <span>С даты</span>
              <input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.currentTarget.value)} />
            </label>
            <label>
              <span>По дату</span>
              <input type="date" value={dateTo} onChange={(event) => setDateTo(event.currentTarget.value)} />
            </label>
            <label>
              <span>Сырьё, поставщик или получатель</span>
              <input
                maxLength={120}
                placeholder="Начните вводить"
                type="search"
                value={query}
                onChange={(event) => setQuery(event.currentTarget.value)}
              />
            </label>
          </div>
        </div>
        <dl className="raw-material-warehouse-totals" aria-label="Итоги по текущим фильтрам">
          <WarehouseTotal label="Записей" value={String(state.totals.recordCount)} />
          <WarehouseTotal label="Поступило, т" value={formatTons(state.totals.receivedTons)} />
          <WarehouseTotal label="Отгружено, т" value={formatTons(state.totals.shippedTons)} />
          <WarehouseTotal label="Остаток, т" value={formatTons(state.totals.balanceTons)} />
        </dl>
        <WarehouseTable
          canReview={!isAdminPreviewMode && state.permissions.canReview}
          isSaving={isSaving}
          records={state.records}
          onApprove={approve}
          onCorrect={startCorrection}
        />
      </section>
    </section>
  );
}

function WarehouseTable({
  records,
  isPending = false,
  canReview,
  isSaving,
  onApprove,
  onCorrect,
}: {
  records: LaboratoryRawMaterialWarehouseRecord[];
  isPending?: boolean;
  canReview: boolean;
  isSaving: boolean;
  onApprove: (record: LaboratoryRawMaterialWarehouseRecord) => void;
  onCorrect: (record: LaboratoryRawMaterialWarehouseRecord) => void;
}) {
  if (records.length === 0) {
    return <p className="empty-state">{isPending ? "Нет записей на подтверждении." : "Записи не найдены."}</p>;
  }
  return (
    <div className="table-scroll laboratory-table-scroll history-table-scroll">
      <table className="laboratory-results-table raw-material-warehouse-table">
        <thead>
          <tr>
            <th>Дата</th>
            <th>Вид сырья</th>
            <th>№ штабеля / место</th>
            <th>Поступило, т</th>
            <th>Поставщик</th>
            <th>Отгружено, т</th>
            <th>Кому отгружено</th>
            <th>Статус</th>
            <th>{isPending ? "Лаборант" : "Кладовщик"}</th>
            {canReview ? <th>Действия</th> : null}
          </tr>
        </thead>
        <tbody>
          {records.map((record) => (
            <tr key={`${record.id}-${record.revisionNumber}`}>
              <td>{formatLaboratoryDate(record.movementDate)}</td>
              <td>{record.materialLabel}</td>
              <td>{record.stackLocation}</td>
              <td>{formatTons(record.receivedTons)}</td>
              <td>{record.supplier || "—"}</td>
              <td>{formatTons(record.shippedTons)}</td>
              <td>{record.recipient || "—"}</td>
              <td>{laboratoryRawMaterialWarehouseStatusLabels[record.status]}</td>
              <td>{isPending ? record.submittedByDisplayName : record.warehouseKeeperDisplayName ?? "—"}</td>
              {canReview ? (
                <td>
                  <div className="raw-material-warehouse-actions">
                    {isPending ? (
                      <button className="primary-button" disabled={isSaving} type="button" onClick={() => onApprove(record)}>
                        Подтвердить
                      </button>
                    ) : null}
                    <button className="secondary-button" disabled={isSaving} type="button" onClick={() => onCorrect(record)}>
                      Исправить
                    </button>
                  </div>
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DatalistField({
  label,
  listId,
  options,
  value,
  required = false,
  disabled,
  onChange,
}: {
  label: string;
  listId: string;
  options: string[];
  value: string;
  required?: boolean;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label>
      <span>{label}</span>
      <input
        autoComplete="off"
        disabled={disabled}
        list={listId}
        maxLength={160}
        required={required}
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
      />
      <datalist id={listId}>
        {options.map((option) => <option key={option} value={option} />)}
      </datalist>
    </label>
  );
}

function NumberField({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label>
      <span>{label}</span>
      <input
        disabled={disabled}
        inputMode="decimal"
        min="0"
        step="0.001"
        type="number"
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
      />
    </label>
  );
}

function WarehouseTotal({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function createEmptyForm(movementDate: string): LaboratoryRawMaterialWarehouseSubmission {
  return {
    movementDate,
    materialLabel: "",
    stackLocation: "",
    receivedTons: "",
    supplier: "",
    shippedTons: "",
    recipient: "",
  };
}

function copyRecordToForm(
  record: LaboratoryRawMaterialWarehouseRecord,
): LaboratoryRawMaterialWarehouseSubmission {
  return {
    movementDate: record.movementDate,
    materialLabel: record.materialLabel,
    stackLocation: record.stackLocation,
    receivedTons: record.receivedTons,
    supplier: record.supplier,
    shippedTons: record.shippedTons,
    recipient: record.recipient,
  };
}

function formatTons(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? parsed.toLocaleString("ru-RU", { maximumFractionDigits: 3 })
    : value;
}
