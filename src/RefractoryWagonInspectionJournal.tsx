import { ManagedTable } from "./ManagedTable";
import { TableHeader, TableCell } from "./TableCell";
import { useEffect, useState, type FormEvent } from "react";
import {
  isRefractoryWagonAwaitingInspection,
  refractoryWagonConditionValues,
  type RefractoryWagonCondition,
  type RefractoryWagonInspectionRecord,
  type RefractoryWagonRecord,
} from "./contracts/refractoryWagons";
import { LoadingIndicator } from "./LoadingIndicator";
import { requestRefractoryWagons } from "./services/refractoryWagons";
import {
  requestRefractoryWagonInspections,
  submitRefractoryWagonInspection,
} from "./services/refractoryWagonInspections";
import { readShortUserMessage } from "./services/userFacingMessages";
import type { ShowToast } from "./services/toastStack";

/**
 * Осмотр закрывает цикл вагона: рассортированный вагон получает вердикт, и он
 * же становится текущим состоянием вагона в обороте и каталоге.
 */
export function RefractoryWagonInspectionJournal({
  defaultApprovalDate,
  onShowToast,
}: {
  defaultApprovalDate: string;
  onShowToast: ShowToast;
}) {
  const [wagons, setWagons] = useState<RefractoryWagonRecord[]>([]);
  const [inspections, setInspections] = useState<
    RefractoryWagonInspectionRecord[]
  >([]);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [wagonId, setWagonId] = useState("");
  const [condition, setCondition] = useState<RefractoryWagonCondition | "">("");
  const [approvalDate, setApprovalDate] = useState(defaultApprovalDate);
  const [message, setMessage] = useState("");
  const [hasError, setHasError] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setLoadState("loading");
    Promise.all([
      requestRefractoryWagons({ signal: controller.signal }),
      requestRefractoryWagonInspections({ signal: controller.signal }),
    ]).then(([wagonResult, inspectionResult]) => {
      if (controller.signal.aborted) return;
      if (wagonResult.status === "error" || inspectionResult.status === "error") {
        setLoadState("error");
        setHasError(true);
        setMessage(readShortUserMessage(
          wagonResult.status === "error"
            ? wagonResult.message
            : inspectionResult.status === "error"
              ? inspectionResult.message
              : "",
          "Не удалось загрузить журнал осмотра вагонов.",
        ));
        return;
      }
      setWagons(wagonResult.wagons);
      setInspections(inspectionResult.inspections);
      setLoadState("ready");
    });
    return () => controller.abort();
  }, []);

  const awaitingWagons = wagons.filter(isRefractoryWagonAwaitingInspection);
  const selectedWagon = awaitingWagons.find((wagon) => wagon.id === wagonId);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;
    if (wagonId === "" || condition === "" || approvalDate === "") {
      setHasError(true);
      setMessage("Выберите вагон, состояние и дату одобрения.");
      return;
    }
    setIsSubmitting(true);
    setHasError(false);
    setMessage("Сохраняем осмотр.");
    const result = await submitRefractoryWagonInspection({
      wagonId,
      condition,
      approvalDate,
    });
    setIsSubmitting(false);
    if (result.status === "error") {
      setHasError(true);
      setMessage(readShortUserMessage(result.message, "Не удалось сохранить осмотр."));
      return;
    }

    const saved = result.inspection;
    setInspections((current) => [saved, ...current]);
    setWagons((current) => current.map((wagon) => wagon.id === saved.wagonId
      ? {
          ...wagon,
          postFiringCondition: saved.condition,
          serviceApprovalDate: saved.approvalDate,
        }
      : wagon));
    setWagonId("");
    setCondition("");
    setApprovalDate(defaultApprovalDate);
    setMessage("Осмотр сохранён.");
    onShowToast(
      "Осмотр сохранён",
      `${saved.wagonNumber}: ${saved.condition}.`,
      "success",
    );
  }

  return (
    <section
      className="refractory-wagon-inspection-journal"
      aria-label="Журнал осмотра вагонов"
    >
      <form className="refractory-wagon-form" onSubmit={handleSubmit}>
        <fieldset disabled={isSubmitting}>
          <legend>Осмотр вагона</legend>
          <div className="refractory-field-grid">
            <label className="refractory-field">
              <span>Номер вагона</span>
              <select
                name="inspectionWagonId"
                required
                value={wagonId}
                onChange={(event) => setWagonId(event.currentTarget.value)}
              >
                <option value="">Выберите вагон</option>
                {awaitingWagons.map((wagon) => (
                  <option key={wagon.id} value={wagon.id}>
                    {formatWagonOption(wagon)}
                  </option>
                ))}
              </select>
            </label>
            <label className="refractory-field">
              <span>Состояние вагона после обжига</span>
              <select
                name="inspectionCondition"
                required
                value={condition}
                onChange={(event) =>
                  setCondition(
                    event.currentTarget.value as RefractoryWagonCondition | "",
                  )}
              >
                <option value="">Выберите действие</option>
                {refractoryWagonConditionValues.map((value) => (
                  <option key={value} value={value}>{value}</option>
                ))}
              </select>
            </label>
            <label className="refractory-field">
              <span>Дата осмотра</span>
              <input
                name="inspectionApprovalDate"
                required
                type="date"
                value={approvalDate}
                onChange={(event) =>
                  setApprovalDate(event.currentTarget.value)}
              />
            </label>
          </div>
          {selectedWagon === undefined ? null : (
            <p className="laboratory-empty-note">
              {`Марка ${selectedWagon.productBrand ?? "—"}, обжигов: ${selectedWagon.firingDates.length}.`}
            </p>
          )}
        </fieldset>
        <div className="refractory-form-actions">
          <button className="primary-button" disabled={isSubmitting} type="submit">
            {isSubmitting ? "Сохраняем…" : "Сохранить осмотр"}
          </button>
          {message.length > 0 ? (
            <p className={`form-status${hasError ? " form-status-error" : ""}`}>
              {message}
            </p>
          ) : null}
        </div>
      </form>

      {loadState === "loading" ? (
        <LoadingIndicator label="Загружаем осмотры…" variant="panel" />
      ) : loadState !== "ready" ? null : (
        <>
          {awaitingWagons.length === 0 ? (
            <p className="laboratory-empty-note">
              Сейчас нет вагонов, ожидающих осмотра.
            </p>
          ) : null}
          {inspections.length === 0 ? (
            <p className="laboratory-empty-note">Осмотров пока не было.</p>
          ) : (
            <div className="refractory-table-wrap refractory-table-wrap-full-height">
              <ManagedTable tableId="refractory.inspections" className="refractory-input-table refractory-wagon-inspection-table">
                <thead>
                  <tr>
                    <TableHeader>Номер вагона</TableHeader>
                    <TableHeader>Дата сортировки</TableHeader>
                    <TableHeader>Состояние вагона после обжига</TableHeader>
                    <TableHeader>Дата осмотра</TableHeader>
                    <TableHeader>Осмотр провёл</TableHeader>
                  </tr>
                </thead>
                <tbody>
                  {inspections.map((inspection) => (
                    <tr key={inspection.id}>
                      <TableCell>{inspection.wagonNumber}</TableCell>
                      <TableCell>{formatDate(inspection.sortingDate)}</TableCell>
                      <TableCell>{inspection.condition}</TableCell>
                      <TableCell>{formatDate(inspection.approvalDate)}</TableCell>
                      <TableCell>{inspection.inspectedByDisplayName}</TableCell>
                    </tr>
                  ))}
                </tbody>
              </ManagedTable>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function formatWagonOption(wagon: RefractoryWagonRecord) {
  return wagon.sortingDate === null
    ? `${wagon.number} · в ремонте`
    : `${wagon.number} · сортировка ${formatDate(wagon.sortingDate)}`;
}

function formatDate(value: string | null) {
  if (value === null) return "—";
  const [year, month, day] = value.split("-");
  return `${day}.${month}.${year}`;
}
