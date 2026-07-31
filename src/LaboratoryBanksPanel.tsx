import { useEffect, useMemo, useState, type FormEvent } from "react";
import type {
  BankNumber,
  LaboratoryBankAssignment,
  RotaryKiln2MaterialBulkDensity,
} from "./contracts";
import { LoadingIndicator } from "./LoadingIndicator";
import {
  assignLaboratoryBank,
  requestLaboratoryBanks,
} from "./services/laboratoryBanks";
import { readShortUserMessage } from "./services/userFacingMessages";

const bankNumbers = [1, 2, 3] as const;
const bankLabels: Record<BankNumber, string> = { 1: "I", 2: "II", 3: "III" };

type BanksState =
  | { status: "loading"; currentAssignments: LaboratoryBankAssignment[]; history: LaboratoryBankAssignment[]; availableMaterials: RotaryKiln2MaterialBulkDensity[] }
  | { status: "ready"; currentAssignments: LaboratoryBankAssignment[]; history: LaboratoryBankAssignment[]; availableMaterials: RotaryKiln2MaterialBulkDensity[] }
  | { status: "error"; message: string; currentAssignments: LaboratoryBankAssignment[]; history: LaboratoryBankAssignment[]; availableMaterials: RotaryKiln2MaterialBulkDensity[] };

export function LaboratoryBanksPanel({
  isAdminPreviewMode,
  onShowToast,
}: {
  isAdminPreviewMode: boolean;
  onShowToast: (title: string, message: string) => void;
}) {
  const [state, setState] = useState<BanksState>({
    status: "loading",
    currentAssignments: [],
    history: [],
    availableMaterials: [],
  });
  const [bankNumber, setBankNumber] = useState<BankNumber>(1);
  const [material, setMaterial] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [refreshVersion, setRefreshVersion] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setState((current) => ({ ...current, status: "loading" }));
    requestLaboratoryBanks({ signal: controller.signal }).then((result) => {
      if (controller.signal.aborted) return;
      setState(result.status === "ready"
        ? result
        : {
            status: "error",
            message: readShortUserMessage(result.message, "Не удалось загрузить данные банок."),
            currentAssignments: [],
            history: [],
            availableMaterials: [],
          });
    });
    return () => controller.abort();
  }, [refreshVersion]);

  const materialByName = useMemo(() => new Map(
    state.availableMaterials.map((item) => [item.material, item]),
  ), [state.availableMaterials]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isAdminPreviewMode) return;
    const selected = materialByName.get(material);
    if (selected === undefined) {
      setMessage("Выберите материал из журнала печи 2.");
      return;
    }
    setIsSaving(true);
    setMessage("Сохраняем назначение…");
    const result = await assignLaboratoryBank({
      bankNumber,
      material: selected.material,
    });
    setIsSaving(false);
    if (result.status === "error") {
      setMessage(readShortUserMessage(result.message, "Не удалось назначить содержимое банки."));
      return;
    }
    setMaterial("");
    setMessage("");
    setRefreshVersion((value) => value + 1);
    onShowToast(
      "Содержимое банки назначено",
      `Банка ${bankLabels[bankNumber]} · ${result.assignment.materialLabel}.`,
    );
  }

  return (
    <section className="laboratory-banks" aria-label="Банки">
      <div className="laboratory-banks-current">
        <div className="laboratory-history-heading">
          <div>
            <span className="eyebrow">Текущее содержимое</span>
            <h2>Банки</h2>
          </div>
        </div>
        {state.status === "loading" ? (
          <LoadingIndicator label="Загружаем назначения банок…" variant="inline" />
        ) : state.status === "error" ? (
          <p className="form-message is-error" role="alert">{state.message}</p>
        ) : null}
        <div className="laboratory-bank-cards">
          {bankNumbers.map((number) => {
            const assignment = state.currentAssignments.find((item) => item.bankNumber === number);
            return (
              <article className="laboratory-bank-card" key={number}>
                <span>Банка {bankLabels[number]}</span>
                <strong>{assignment?.materialLabel ?? "Не назначено"}</strong>
                {assignment === undefined ? (
                  <small>
                    Выберите материал из журнала печи 2 перед отправкой сводки
                    ЦОШ.
                  </small>
                ) : (
                  <small>
                    Насыпной вес: {formatNumber(assignment.bulkDensityTonsPerCubicMeter)} т/м³<br />
                    {describeBulkDensitySource(assignment)}
                  </small>
                )}
              </article>
            );
          })}
        </div>
      </div>

      <form className="laboratory-bank-assignment-form" onSubmit={submit}>
        <h3>Изменить содержимое банки</h3>
        <label>
          <span>Банка</span>
          <select value={bankNumber} onChange={(event) => {
            const value = Number(event.currentTarget.value) as BankNumber;
            setBankNumber(value);
            setMessage("");
          }}>
            {bankNumbers.map((number) => (
              <option key={number} value={number}>Банка {bankLabels[number]}</option>
            ))}
          </select>
        </label>
        <label className="laboratory-bank-sample-field">
          <span>Производимый материал</span>
          <select required value={material} onChange={(event) => {
            const value = event.currentTarget.value;
            setMaterial(value);
            setMessage("");
          }}>
            <option value="">Выберите материал</option>
            {state.availableMaterials.map((item) => (
              <option key={item.material} value={item.material}>
                {item.material} · {formatNumber(item.averageBulkDensityTonsPerCubicMeter)} т/м³ · {formatSampleCount(item.sampleCount)}
              </option>
            ))}
          </select>
        </label>
        {state.status === "ready" && state.availableMaterials.length === 0 ? (
          <p className="laboratory-empty-note">
            В журнале печи 2 ещё нет записей с производимым материалом.
          </p>
        ) : null}
        <button className="primary-button" disabled={isAdminPreviewMode || isSaving || state.status !== "ready"} type="submit">
          {isSaving ? <LoadingIndicator label="Сохраняем…" variant="button" /> : "Назначить содержимое"}
        </button>
        {message === "" ? null : <span className="form-message" role="status">{message}</span>}
      </form>

      <section className="laboratory-bank-history">
        <div className="laboratory-history-heading">
          <div>
            <span className="eyebrow">История</span>
            <h2>Смена содержимого банок</h2>
          </div>
        </div>
        {state.history.length === 0 ? (
          <p className="laboratory-empty-note">Назначений пока нет.</p>
        ) : (
          <div className="table-scroll laboratory-table-scroll">
            <table className="data-table laboratory-results-table">
              <thead><tr><th>Дата</th><th>Банка</th><th>Содержимое</th><th>Основание насыпного веса</th><th>Насыпной вес, т/м³</th><th>Лаборант</th></tr></thead>
              <tbody>{state.history.map((assignment) => (
                <tr key={assignment.assignmentId}>
                  <td>{formatDateTime(assignment.assignedAt)}</td>
                  <td>{bankLabels[assignment.bankNumber]}</td>
                  <td>{assignment.materialLabel}</td>
                  <td>{describeBulkDensitySource(assignment)}</td>
                  <td>{formatNumber(assignment.bulkDensityTonsPerCubicMeter)}</td>
                  <td>{assignment.assignedByDisplayName}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </section>
    </section>
  );
}

/**
 * Назначения, сохранённые до перехода на журнал печи 2, остаются в истории со
 * ссылкой на результат испытаний.
 */
function describeBulkDensitySource(assignment: LaboratoryBankAssignment) {
  if (assignment.bulkDensitySource !== "rotary_kiln_2_journal") {
    return `Результат испытаний: ${assignment.sampleIdentifier ?? "—"}`;
  }
  return assignment.bulkDensitySampleCount === undefined
    ? "Журнал печи 2"
    : `Журнал печи 2, ${formatSampleCount(assignment.bulkDensitySampleCount)}`;
}

function formatSampleCount(sampleCount: number) {
  const isSingle = sampleCount % 10 === 1 && sampleCount % 100 !== 11;

  return `среднее по ${sampleCount} ${isSingle ? "записи" : "записям"}`;
}

function formatNumber(value: number) {
  return value.toLocaleString("ru-RU", { maximumFractionDigits: 6 });
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}
