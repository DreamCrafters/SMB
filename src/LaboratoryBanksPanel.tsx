import { useEffect, useMemo, useState, type FormEvent } from "react";
import type {
  BankNumber,
  LaboratoryBankAssignment,
  LaboratoryBankSample,
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
  | { status: "loading"; currentAssignments: LaboratoryBankAssignment[]; history: LaboratoryBankAssignment[]; eligibleSamples: LaboratoryBankSample[] }
  | { status: "ready"; currentAssignments: LaboratoryBankAssignment[]; history: LaboratoryBankAssignment[]; eligibleSamples: LaboratoryBankSample[] }
  | { status: "error"; message: string; currentAssignments: LaboratoryBankAssignment[]; history: LaboratoryBankAssignment[]; eligibleSamples: LaboratoryBankSample[] };

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
    eligibleSamples: [],
  });
  const [bankNumber, setBankNumber] = useState<BankNumber>(1);
  const [sampleKey, setSampleKey] = useState("");
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
            eligibleSamples: [],
          });
    });
    return () => controller.abort();
  }, [refreshVersion]);

  const sampleByKey = useMemo(() => new Map(
    state.eligibleSamples.map((sample) => [buildSampleKey(sample), sample]),
  ), [state.eligibleSamples]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isAdminPreviewMode) return;
    const sample = sampleByKey.get(sampleKey);
    if (sample === undefined) {
      setMessage("Выберите лабораторную пробу с насыпным весом.");
      return;
    }
    setIsSaving(true);
    setMessage("Сохраняем назначение…");
    const result = await assignLaboratoryBank({
      bankNumber,
      laboratoryResultId: sample.laboratoryResultId,
      sampleIndex: sample.sampleIndex,
    });
    setIsSaving(false);
    if (result.status === "error") {
      setMessage(readShortUserMessage(result.message, "Не удалось назначить содержимое банки."));
      return;
    }
    setSampleKey("");
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
                  <small>Выберите пробу перед отправкой сводки ЦОШ.</small>
                ) : (
                  <small>
                    Проба: {assignment.sampleIdentifier}<br />
                    Насыпной вес: {formatNumber(assignment.bulkDensityTonsPerCubicMeter)} т/м³
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
          <span>Лабораторная проба</span>
          <select required value={sampleKey} onChange={(event) => {
            const value = event.currentTarget.value;
            setSampleKey(value);
            setMessage("");
          }}>
            <option value="">Выберите пробу</option>
            {state.eligibleSamples.map((sample) => (
              <option key={buildSampleKey(sample)} value={buildSampleKey(sample)}>
                {formatDate(sample.analysisDate)} · {sample.materialLabel} · {sample.sampleIdentifier} · {formatNumber(sample.bulkDensityTonsPerCubicMeter)} т/м³
              </option>
            ))}
          </select>
        </label>
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
          <div className="table-scroll">
            <table className="data-table">
              <thead><tr><th>Дата</th><th>Банка</th><th>Объект испытаний</th><th>Проба</th><th>Насыпной вес, т/м³</th><th>Лаборант</th></tr></thead>
              <tbody>{state.history.map((assignment) => (
                <tr key={assignment.assignmentId}>
                  <td>{formatDateTime(assignment.assignedAt)}</td>
                  <td>{bankLabels[assignment.bankNumber]}</td>
                  <td>{assignment.materialLabel}</td>
                  <td>{assignment.sampleIdentifier}</td>
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

function buildSampleKey(sample: LaboratoryBankSample) {
  return `${sample.laboratoryResultId}:${sample.sampleIndex}`;
}

function formatNumber(value: number) {
  return value.toLocaleString("ru-RU", { maximumFractionDigits: 6 });
}

function formatDate(value: string) {
  const [year, month, day] = value.split("-");
  return `${day}.${month}.${year}`;
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}
